import { initialAccountState, mergeOnboardingState, parseOnboardingDraft, type AccountPreferences, type AccountState, type OnboardingDraft, type OnboardingStep } from "./model";

type Dependencies = {
  read(): Promise<string | null>;
  write(value: string): Promise<void>;
  remove(): Promise<void>;
  get(): Promise<AccountState>;
  put(value: AccountState): Promise<AccountState>;
  ensure(): void;
};
type Storage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<unknown>;
  removeItem(key: string): Promise<unknown>;
};

/** All generations of one owner share a disk queue, including reads and deletion. */
export class OnboardingStorageQueue {
  private tails = new Map<string, Promise<void>>();
  private closedOwners = new Set<string>();
  close(key: string) { this.closedOwners.add(key); }
  isClosed(key: string) { return this.closedOwners.has(key); }
  private run<T>(key: string, operation: () => Promise<T>, removal = false): Promise<T> {
    if (!removal && this.isClosed(key)) return Promise.reject(new Error("ACCOUNT_DELETION_PENDING"));
    const pending = (this.tails.get(key) ?? Promise.resolve()).then(() => {
      if (!removal && this.isClosed(key)) throw new Error("ACCOUNT_DELETION_PENDING");
      return operation();
    });
    const tail = pending.then(() => {}, () => {});
    this.tails.set(key, tail);
    void tail.then(() => { if (this.tails.get(key) === tail) this.tails.delete(key); });
    return pending;
  }
  bind(key: string, storage: Storage, ensure: () => void) {
    return {
      read: () => this.run(key, () => { ensure(); return storage.getItem(key); }),
      write: async (value: string) => { await this.run(key, () => { ensure(); return storage.setItem(key, value); }); },
      remove: async () => { this.close(key); await this.run(key, () => storage.removeItem(key), true); },
    };
  }
}
export type OnboardingSnapshot = { value: OnboardingDraft; ready: boolean; busy: boolean; error: string | null; localFound: boolean };
/** One serialized draft per AuthScope generation. No network failure erases local progress. */
export class OnboardingStore {
  private snapshot: OnboardingSnapshot = { value: { ...initialAccountState(), pending: false }, ready: false, busy: false, error: null, localFound: false };
  private listeners = new Set<() => void>();
  private queue = Promise.resolve();
  private hydrated: Promise<void> | null = null;
  private generation = 0;
  private localReadable = false;
  private closed = false;
  constructor(private api: Dependencies) {}
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  getSnapshot = () => this.snapshot;
  private ensureOpen() {
    this.api.ensure();
    if (this.closed) throw new Error("ACCOUNT_DELETION_PENDING");
  }
  private ensureReadable() {
    this.ensureOpen();
    if (!this.localReadable) throw new Error("LOCAL_READ_FAILED");
  }
  private publish(patch: Partial<OnboardingSnapshot>) { this.api.ensure(); this.snapshot = { ...this.snapshot, ...patch }; this.listeners.forEach(listener => listener()); }
  private persist = async (value: OnboardingDraft) => {
    this.ensureReadable();
    try { await this.api.write(JSON.stringify(value)); } catch { throw new Error("LOCAL_WRITE_FAILED"); }
    this.ensureReadable();
    this.publish({ value, localFound: true });
  };
  private async readAndSync() {
    this.ensureOpen();
    const generation = this.generation;
    let local: OnboardingDraft | null;
    try { local = parseOnboardingDraft(await this.api.read()); }
    catch {
      this.ensureOpen();
      this.localReadable = false;
      this.publish({ ready: true, error: "LOCAL_READ_FAILED" });
      return;
    }
    this.ensureOpen();
    if (generation !== this.generation) return;
    this.localReadable = true;
    if (local) this.publish({ value: local, ready: true, localFound: true });
    await this.syncCurrent();
    this.publish({ ready: true });
  }
  hydrate = () => {
    if (this.hydrated) return this.hydrated;
    this.hydrated = this.enqueue(() => this.readAndSync());
    return this.hydrated;
  };
  private enqueue(action: () => Promise<void>) {
    const pending = this.queue.catch(() => {}).then(action);
    this.queue = pending.catch(() => {});
    return pending;
  }
  advance = (step: OnboardingStep, locationChoice?: AccountState["location_choice"]) => this.enqueue(async () => {
    this.ensureReadable();
    const value: OnboardingDraft = { ...this.snapshot.value, onboarding_step: step, location_choice: locationChoice ?? this.snapshot.value.location_choice, pending: true };
    this.publish({ busy: true, error: null });
    try { await this.persist(value); await this.syncCurrent(); }
    catch (error) {
      this.ensureOpen();
      this.publish({ error: error instanceof Error ? error.message : "ACCOUNT_STATE_UNAVAILABLE" });
      throw error;
    }
    finally { this.publish({ ready: true, busy: false }); }
  });
  private async syncCurrent() {
    try {
      this.ensureReadable();
      const remote = await this.api.get();
      this.ensureReadable();
      const merged = mergeOnboardingState(this.snapshot.value, remote);
      // Retain the pending progress and latest authoritative privacy/revision
      // even when the following cloud write is interrupted.
      if (merged.pending) await this.persist(merged);
      const result = merged.pending ? await this.api.put(merged) : remote;
      this.ensureReadable();
      await this.persist({ ...result, pending: false });
      this.publish({ error: null });
    } catch (error) {
      this.ensureOpen();
      this.publish({ error: error instanceof Error ? error.message : "ACCOUNT_STATE_UNAVAILABLE" });
      // Workflow completion is usable offline; private online actions remain gated separately.
    }
  }
  retry = () => this.enqueue(async () => {
    this.ensureOpen(); this.publish({ busy: true });
    try { if (!this.localReadable) await this.readAndSync(); else await this.syncCurrent(); }
    finally { this.publish({ busy: false, ready: true }); }
  });
  setPreferences = (patch: Partial<AccountPreferences>) => this.enqueue(async () => {
    this.ensureReadable();
    this.publish({ busy: true, error: null });
    try {
      const current = await this.api.get();
      this.ensureReadable();
      const merged = mergeOnboardingState(this.snapshot.value, current);
      const result = await this.api.put({ ...merged, preferences: { ...current.preferences, ...patch } });
      this.ensureReadable();
      await this.persist({ ...result, pending: false });
    } catch (error) {
      this.publish({ error: error instanceof Error ? error.message : "ACCOUNT_STATE_UNAVAILABLE" });
      throw error; // Never present an unsaved privacy choice as server-enforced.
    } finally { this.publish({ busy: false }); }
  });
  clear = async () => { this.closed = true; ++this.generation; await this.queue.catch(() => {}); await this.api.remove(); };
}

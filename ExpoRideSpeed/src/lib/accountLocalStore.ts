import type { GarageVehicle, SavedRoute, Stop } from './domain';
import { parsePreferences, type Preferences } from './preferences';
import { blankGarageSync, parseGarageSync, type GarageLocalSync } from '../features/garage/localModel';

export type LocalScope = Readonly<{ userId: string | null; generation: number }>;
export type DevicePreferences = Omit<Preferences, 'welcomeDone'>;
export type OwnedLocalData = {
  vehicles: GarageVehicle[]; selectedVehicleId: string | null; routes: SavedRoute[];
  welcomeDone: boolean; importedGuest: boolean;
  garageSync: GarageLocalSync;
};
export type LocalPatch = Partial<DevicePreferences & OwnedLocalData>;
type Storage = { getItem: (key: string) => Promise<string | null>; setItem: (key: string, value: string) => Promise<unknown>; removeItem?: (key: string) => Promise<unknown> };
export type LocalSnapshot = Readonly<{
  scope: LocalScope | null; preferences: DevicePreferences; owned: OwnedLocalData;
  ready: boolean; error: string | null; guestAvailable: boolean;
}>;
const LEGACY = 'ridespeed.local.v4', PREFS = 'ride.preferences.v5', MIGRATED = 'ride.local.migration.v5';
const ownerKey = (scope: LocalScope) => `ride.local.v5.${scope.userId ?? 'guest'}`;
const text = (v: unknown, max: number): v is string => typeof v === 'string' && [...v].length > 0 && [...v].length <= max && !/[\u0000-\u001f\u007f]/.test(v);
const object = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
const coordinate = (v: unknown, max: number): v is number => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= max;
export const emptyOwned = (): OwnedLocalData => ({ vehicles: [], selectedVehicleId: null, routes: [], welcomeDone: false, importedGuest: false, garageSync: blankGarageSync() });
const preferences = (value: unknown): DevicePreferences => {
  const { welcomeDone: _welcome, ...device } = parsePreferences(value); return device;
};
const freshId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

function parseOwned(value: unknown, stripCloud = false): OwnedLocalData {
  const stored = object(value), blank = emptyOwned();
  const vehicles: GarageVehicle[] = [];
  const vehicleIds = new Set<string>();
  for (const candidate of Array.isArray(stored.vehicles) ? stored.vehicles.slice(0, 200) : []) {
    const v = object(candidate);
    if (!text(v.id, 100) || vehicleIds.has(v.id) || !['scooter', 'bigbike', 'car'].includes(String(v.category)) || !text(v.brand, 80) || !text(v.model, 100)) continue;
    if (v.engineCc !== null && !(typeof v.engineCc === 'number' && Number.isFinite(v.engineCc) && v.engineCc > 0 && v.engineCc <= 10000)) continue;
    vehicleIds.add(v.id);
    vehicles.push({ id: v.id, catalogId: text(v.catalogId, 100) ? v.catalogId : null, category: v.category as GarageVehicle['category'], brand: v.brand, model: v.model,
      engineCc: v.engineCc as number | null, year: typeof v.year === 'string' && [...v.year].length<=30 && !/[\u0000-\u001f\u007f]/.test(v.year) ? v.year : '',
      ...(text(v.variant, 100) ? { variant: v.variant } : {}),
      powertrain: ['petrol', 'diesel', 'hybrid', 'electric'].includes(String(v.powertrain)) ? v.powertrain as GarageVehicle['powertrain'] : null,
      ...(v.motorPowerKw === null || typeof v.motorPowerKw === 'number' && Number.isFinite(v.motorPowerKw) && v.motorPowerKw > 0 && v.motorPowerKw <= 2000 ? { motorPowerKw: v.motorPowerKw as number|null } : {}),
      ...(text(v.nickname,80) ? { nickname:v.nickname } : {}),
      ...(typeof v.color === 'string' && /^#[a-f\d]{6}$/i.test(v.color) ? { color:v.color.toUpperCase() } : {}),
      ...(!stripCloud && typeof v.photoPath === 'string' && /^[a-f\d-]{36}\/[a-f\d-]{36}\.(jpg|png|webp)$/i.test(v.photoPath) ? { photoPath:v.photoPath } : {}) });
  }
  const routes: SavedRoute[] = [], routeIds = new Set<string>();
  for (const candidate of Array.isArray(stored.routes) ? stored.routes.slice(0, 500) : []) {
    const r = object(candidate);
    if (!text(r.id, 100) || routeIds.has(r.id) || !text(r.name, 80) || !Array.isArray(r.stops) || r.stops.length < 2 || r.stops.length > 12) continue;
    const stops: Stop[] = [], stopIds = new Set<string>();
    for (const candidateStop of r.stops) {
      const s = object(candidateStop);
      if (!text(s.id, 100) || stopIds.has(s.id) || !text(s.name, 100) || !coordinate(s.latitude, 90) || !coordinate(s.longitude, 180)) break;
      stopIds.add(s.id); stops.push({ id: s.id, name: s.name, latitude: s.latitude, longitude: s.longitude });
    }
    if (stops.length !== r.stops.length) continue;
    routeIds.add(r.id);
    const cloud = !stripCloud && typeof r.cloudId === 'string' && /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(r.cloudId) && Number.isSafeInteger(r.cloudRevision) && Number(r.cloudRevision) > 0
      ? { cloudId: r.cloudId, cloudRevision: Number(r.cloudRevision) } : {};
    routes.push({ id: r.id, name: r.name, stops, closedCourse: r.closedCourse === true, ...cloud,
      ...(['scooter', 'motorcycle', 'car', 'bicycle'].includes(String(r.category)) ? { category: r.category as SavedRoute['category'] } : {}) });
  }
  return { ...blank, vehicles, routes, selectedVehicleId: typeof stored.selectedVehicleId === 'string' && vehicleIds.has(stored.selectedVehicleId) ? stored.selectedVehicleId : null,
    welcomeDone: stored.welcomeDone === true, importedGuest: stored.importedGuest === true, garageSync: parseGarageSync(stored.garageSync,stripCloud) };
}

/** Pins every local write to its initiating owner and rejects stale scope generations. */
export class AccountLocalStore {
  private value: LocalSnapshot = { scope: null, preferences: preferences(null), owned: emptyOwned(), ready: false, error: null, guestAvailable: false };
  private listeners = new Set<() => void>();
  private writes: Promise<void> = Promise.resolve();
  private migrating: Promise<void> | null = null;
  private revision = 0;
  private dirty = new Map<string, OwnedLocalData>();
  private dirtyPreferences: DevicePreferences | null = null;
  private closedOwners = new Set<string>();
  constructor(private storage: Storage, private isCurrent: (scope: LocalScope) => boolean) {}
  getSnapshot = () => this.value;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(value: LocalSnapshot) { this.value = value; this.listeners.forEach(listener => listener()); }
  private current(scope: LocalScope) { return this.isCurrent(scope) && this.value.scope === scope; }
  private migrate() {
    if (this.migrating) return this.migrating;
    this.migrating = (async () => {
      if (await this.storage.getItem(MIGRATED)) return;
      const raw = await this.storage.getItem(LEGACY), legacy = raw ? JSON.parse(raw) : null;
      // Retain the source recovery copy. Partial migrations never overwrite a newer v5 record.
      if (!await this.storage.getItem(PREFS)) await this.storage.setItem(PREFS, JSON.stringify(preferences(legacy)));
      if (!await this.storage.getItem('ride.local.v5.guest')) await this.storage.setItem('ride.local.v5.guest', JSON.stringify(parseOwned(legacy, true)));
      await this.storage.setItem(MIGRATED, '1');
    })().catch(error => { this.migrating = null; throw error; });
    return this.migrating;
  }
  async hydrate(scope: LocalScope) {
    const revision = ++this.revision;
    this.publish({ ...this.value, scope, owned: emptyOwned(), ready: false, error: null, guestAvailable: false });
    const pendingWrites = this.writes;
    try {
      await pendingWrites; await this.migrate();
      const [raw, prefsRaw, guestRaw] = await Promise.all([this.storage.getItem(ownerKey(scope)), this.storage.getItem(PREFS), this.storage.getItem('ride.local.v5.guest')]);
      if (!this.current(scope) || revision !== this.revision) return;
      const owned = this.dirty.get(ownerKey(scope)) ?? parseOwned(raw ? JSON.parse(raw) : null);
      const guest = parseOwned(guestRaw ? JSON.parse(guestRaw) : null, true);
      this.publish({ scope, owned, preferences: this.dirtyPreferences ?? preferences(prefsRaw ? JSON.parse(prefsRaw) : null), ready: true,
        error: this.dirty.has(ownerKey(scope)) || this.dirtyPreferences ? 'LOCAL_WRITE_FAILED' : null,
        guestAvailable: !!scope.userId && !owned.importedGuest && (guest.vehicles.length > 0 || guest.routes.length > 0) });
    } catch {
      if (this.current(scope) && revision === this.revision) this.publish({ ...this.value, owned: this.dirty.get(ownerKey(scope)) ?? emptyOwned(), ready: true, error: 'LOCAL_READ_FAILED' });
    }
  }
  update(scope: LocalScope, patch: LocalPatch): boolean {
    // An unread record is not an empty record. Keep the recovery copy until a
    // successful read, including when the UI offers offline browsing.
    if (!this.current(scope) || !this.value.ready || this.closedOwners.has(ownerKey(scope)) || this.value.error === 'LOCAL_READ_FAILED') return false;
    const owned = parseOwned({ ...this.value.owned, ...patch }), device = preferences({ ...this.value.preferences, ...patch });
    this.publish({ ...this.value, owned, preferences: device, error: null });
    this.persist(scope, owned, device); return true;
  }
  private persist(scope: LocalScope, owned: OwnedLocalData, device: DevicePreferences) {
    const key = ownerKey(scope); this.dirty.set(key, owned); this.dirtyPreferences = device;
    this.writes = this.writes.catch(() => {}).then(async () => {
      try {
        if (!this.closedOwners.has(key)) await this.storage.setItem(key, JSON.stringify(owned));
        await this.storage.setItem(PREFS, JSON.stringify(device));
        if (this.dirtyPreferences === device) this.dirtyPreferences = null;
        if (this.dirty.get(key) === owned) this.dirty.delete(key);
        if (this.current(scope) && this.value.owned === owned) this.publish({ ...this.value, error: null });
      } catch {
        if (this.current(scope) && this.value.owned === owned) this.publish({ ...this.value, error: 'LOCAL_WRITE_FAILED' });
      }
    });
  }
  flush() { return this.writes; }
  isOwnedDurable(scope: LocalScope) { return this.current(scope) && this.value.ready && !this.closedOwners.has(ownerKey(scope)) && !this.dirty.has(ownerKey(scope)) && this.value.error !== 'LOCAL_READ_FAILED'; }
  async retry(scope: LocalScope) {
    if (!this.current(scope) || !this.value.ready || this.closedOwners.has(ownerKey(scope))) return;
    if (this.value.error === 'LOCAL_READ_FAILED') { await this.hydrate(scope); return; }
    this.persist(scope, this.value.owned, this.value.preferences); await this.flush();
  }
  /** Call only after the account deletion service has confirmed completion. */
  async forgetAccount(scope: LocalScope) {
    if (!scope.userId) return;
    const key = ownerKey(scope);
    this.closedOwners.add(key);
    const removal = this.writes.catch(() => {}).then(async () => {
      if (!this.storage.removeItem) throw new Error('LOCAL_WRITE_FAILED');
      await this.storage.removeItem(key);
      this.dirty.delete(key);
      if (this.current(scope)) this.publish({ ...this.value, owned: emptyOwned(), guestAvailable: false });
    });
    this.writes = removal.catch(() => {});
    await removal;
  }
  async importGuest(scope: LocalScope) {
    if (!scope.userId || !this.current(scope) || !this.value.ready || this.value.owned.importedGuest) return;
    if (this.value.error === 'LOCAL_READ_FAILED') throw new Error('LOCAL_READ_FAILED');
    await this.flush();
    const raw = await this.storage.getItem('ride.local.v5.guest');
    if (!this.current(scope)) throw new Error('ACCOUNT_CHANGED');
    if (this.value.owned.importedGuest) return;
    const guest = parseOwned(raw ? JSON.parse(raw) : null, true);
    const idMap = new Map(guest.vehicles.map(vehicle => [vehicle.id, freshId()]));
    const copiedVehicles = guest.vehicles.map(vehicle => ({ ...vehicle, id: idMap.get(vehicle.id)! }));
    const copiedRoutes = guest.routes.map(route => ({ ...route, id: freshId(), stops: route.stops.map(stop => ({ ...stop, id: freshId() })) }));
    this.update(scope, { vehicles: [...this.value.owned.vehicles, ...copiedVehicles], routes: [...this.value.owned.routes, ...copiedRoutes],
      selectedVehicleId: this.value.owned.selectedVehicleId ?? idMap.get(guest.selectedVehicleId ?? '') ?? null, importedGuest: true });
    this.publish({ ...this.value, guestAvailable: false });
    await this.flush();
    if (!this.current(scope)) throw new Error('ACCOUNT_CHANGED');
    if (this.value.error) throw new Error(this.value.error);
  }
}

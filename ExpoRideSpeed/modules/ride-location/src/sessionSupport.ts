export type CapturePort = { start(): Promise<void>; stop(): Promise<void> };

/** Provider lifetime is serialized across hook remounts and cancelled starts. */
export class ExclusiveLocationCapture {
  private tail: Promise<unknown> = Promise.resolve();
  private current: { owner: symbol; port: CapturePort } | null = null;

  owns(owner: symbol): boolean { return this.current?.owner === owner; }

  start(owner: symbol, stillWanted: () => boolean, port: CapturePort): Promise<boolean> {
    return this.enqueue(async () => {
      if (!stillWanted()) return false;
      if (this.current) throw new Error('A location capture is already running or still stopping.');
      this.current = { owner, port };
      try {
        await port.start();
      } catch (error) {
        // A partially failed start must finish cleanup before another starts.
        try { await this.stopOwned(owner); } catch { /* Retain ownership if cleanup failed. */ }
        throw error;
      }
      if (!stillWanted()) { await this.stopOwned(owner); return false; }
      return true;
    });
  }

  stop(owner: symbol): Promise<void> { return this.enqueue(() => this.stopOwned(owner)); }

  private async stopOwned(owner: symbol): Promise<void> {
    if (this.current?.owner !== owner) return;
    await this.current.port.stop();
    this.current = null;
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.tail.then(operation);
    this.tail = result.catch(() => undefined);
    return result;
  }
}

export type RideEvidenceSample = {
  timestampMs: number;
  latitude: number;
  longitude: number;
  speedMps: number | null;
  horizontalAccuracyM: number | null;
  speedAccuracyMps: number | null;
  isSimulatedBySoftware: boolean | null;
  isProducedByAccessory: boolean | null;
  /** Android Expo's reported flag. Null on providers that do not report it. */
  mocked: boolean | null;
};

export type RideEvidence = {
  samples: RideEvidenceSample[];
  nativeSource: boolean;
  /** A truncated capture is not complete evidence for a ranking submission. */
  truncated: boolean;
};

export const MAX_EVIDENCE_SAMPLES = 8000;
export const MAX_EVIDENCE_JSON_BYTES = 2 * 1024 * 1024;

/** Bounded in-memory raw evidence. No persistence, smoothing or upload. */
export class RideEvidenceBuffer {
  private samples: RideEvidenceSample[] = [];
  private nativeSource = false;
  private truncated = false;
  private jsonBytes = 2;

  reset(nativeSource: boolean): void {
    this.samples = [];
    this.nativeSource = nativeSource;
    this.truncated = false;
    this.jsonBytes = 2;
  }

  append(sample: RideEvidenceSample): void {
    if (this.truncated) return;
    // Numeric/boolean/null fields and ASCII keys make this length equal UTF-8 bytes.
    const bytes = JSON.stringify(sample).length + (this.samples.length ? 1 : 0);
    if (this.samples.length >= MAX_EVIDENCE_SAMPLES || this.jsonBytes + bytes > MAX_EVIDENCE_JSON_BYTES) {
      this.truncated = true;
      return;
    }
    this.samples.push({ ...sample });
    this.jsonBytes += bytes;
  }

  snapshot(): RideEvidence {
    return { samples: this.samples.map(sample => ({ ...sample })), nativeSource: this.nativeSource, truncated: this.truncated };
  }
}

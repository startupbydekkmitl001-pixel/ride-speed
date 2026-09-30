/** Keep the newest GPS/source update while the worker is busy with an earlier one. */
export class GeoJSONUpdateQueue<T = GeoJSON.GeoJSON> {
  private pending: { value: T } | null = null;
  private running = false;
  private disposed = false;
  constructor(private write: (value: T) => Promise<void>, private onError: (error: unknown) => void) {}
  update(value: T) {
    if (this.disposed) return;
    this.pending = { value };
    if (!this.running) void this.drain();
  }
  private async drain() {
    this.running = true;
    while (this.pending && !this.disposed) {
      const next = this.pending; this.pending = null;
      try { await this.write(next.value); } catch (error) { if (!this.disposed) this.onError(error); }
    }
    this.running = false;
  }
  dispose() { this.disposed = true; this.pending = null; }
}

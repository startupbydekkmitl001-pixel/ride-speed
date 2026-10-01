import type { MapStatus } from './MapSurface.types';

/** Readiness is a rendered frame, never an assumption made from a style URL. */
export class MapStatusTracker {
  private online = true;
  private styled = false;
  private rendered = false;
  private tileError = false;
  private terminal: MapStatus | null = null;
  private last = '';
  constructor(private notify: (status: MapStatus) => void) {}
  setListener(notify: (status: MapStatus) => void) { this.notify = notify; }
  private publish() {
    const status: MapStatus = this.terminal ?? (!this.online ? { state: 'degraded', reason: 'offline' }
      : this.tileError ? { state: 'degraded', reason: 'tiles' }
      : this.styled && this.rendered ? { state: 'ready' } : { state: 'loading' });
    const key = JSON.stringify(status);
    if (key !== this.last) { this.last = key; this.notify(status); }
  }
  beginStyle(online: boolean) { this.online = online; this.styled = false; this.rendered = false; this.tileError = false; this.terminal = null; this.publish(); }
  styleLoaded() { this.styled = true; this.publish(); }
  fullyRendered() { this.rendered = true; this.publish(); }
  tileFailed() { this.tileError = true; this.publish(); }
  tilesRecovered() { this.tileError = false; this.publish(); }
  setOnline(online: boolean) { this.online = online; this.publish(); }
  fail(status: Extract<MapStatus, { state: 'error' | 'unsupported' }>) { this.terminal = status; this.publish(); }
}

export type MapCoordinate = Readonly<{ latitude: number; longitude: number }>;
export type MapInsets = Readonly<{ top: number; right: number; bottom: number; left: number }>;
export type MapCamera = Readonly<{ center: MapCoordinate; zoom: number; bearing: number; pitch: number }>;
export type MapPin = Readonly<{ id: string; coordinate: MapCoordinate; label: string; role: 'start' | 'via' | 'finish'; order: number }>;
/** Only authorized, opt-in, unexpired peers may be supplied by the caller. */
export type MapPeer = Readonly<{ id: string; coordinate: MapCoordinate; name: string; presence: 'online' | 'riding'; updatedAtMs: number }>;
export type MapFix = Readonly<{ coordinate: MapCoordinate; accuracyMeters: number; timestampMs: number; headingDegrees: number | null }>;
export type MapTrack = Readonly<{ kind: 'road' | 'recorded' | 'draft'; segments: readonly (readonly MapCoordinate[])[] }>;
export type MapStatus =
  | { state: 'loading' }
  | { state: 'ready' }
  | { state: 'degraded'; reason: 'offline' | 'tiles' }
  | { state: 'error'; reason: 'style' | 'renderer' }
  | { state: 'unsupported'; reason: 'webgl2' | 'native-module' };
export type MapCameraCommand = Partial<Omit<MapCamera, 'center'>> & { center?: MapCoordinate; durationMs?: number };
export type MapFitOptions = { padding?: MapInsets; durationMs?: number; maxZoom?: number };
export interface MapHandle {
  setCamera(camera: MapCameraCommand): void;
  fitCoordinates(coordinates: readonly MapCoordinate[], options?: MapFitOptions): void;
  getCamera(): Promise<MapCamera | null>;
  project(coordinate: MapCoordinate): Promise<{ x: number; y: number } | null>;
  unproject(point: { x: number; y: number }): Promise<MapCoordinate | null>;
}
export interface MapSurfaceProps {
  theme: 'dark' | 'light'; locale: 'th' | 'en';
  initialCamera: MapCamera; contentInsets: MapInsets;
  mode: 'browse' | 'edit' | 'glance'; reducedMotion: boolean;
  online: boolean; retryToken: number;
  track: MapTrack | null; pins: readonly MapPin[]; selectedPinId: string | null;
  peers: readonly MapPeer[]; userFix: MapFix | null;
  onStatus(status: MapStatus): void;
  onPress?(coordinate: MapCoordinate): void;
  onLongPress?(coordinate: MapCoordinate): void;
  onSelectPin?(id: string): void;
  /** Engine drag end only; ignored outside edit mode or for a stale selected pin. */
  onMovePin?(id: string, coordinate: MapCoordinate): void;
  onSelectPeer?(id: string): void;
  onUserGesture?(): void;
}

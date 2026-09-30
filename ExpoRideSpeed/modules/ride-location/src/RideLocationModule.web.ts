import type { RideLocationNativeModule } from './RideLocation.types';

/** No simulated native accuracy or native-module lookup in a web bundle. */
const RideLocation: RideLocationNativeModule | null = null;
export default RideLocation;

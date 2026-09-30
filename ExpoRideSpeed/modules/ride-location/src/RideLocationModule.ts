import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';
import type { RideLocationNativeModule } from './RideLocation.types';

/** Expo Go, Android and builds without this local module use the existing fallback. */
const RideLocation = Platform.OS === 'ios'
  ? requireOptionalNativeModule<RideLocationNativeModule>('RideLocation')
  : null;

export default RideLocation;

import {Redirect} from 'expo-router';
import {LiveMapPreview} from '../features/map/LiveMapPreview';
/** Debug route is deliberately unavailable in distribution bundles. */
export default function Preview(){return __DEV__?<LiveMapPreview/>:<Redirect href="/"/>;}

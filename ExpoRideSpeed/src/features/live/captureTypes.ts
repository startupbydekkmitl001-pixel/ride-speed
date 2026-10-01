import type {AuthScope} from '../../state/AuthState';
import type {RideEvidenceSample} from '../../../modules/ride-location/src/sessionSupport';

export type LiveCaptureBinding=Readonly<{
 scope:AuthScope;rideId:string;captureId:string;segmentId:string;
 generation:number;platform:'ios'|'android'|'web';
}>;
export type LiveCaptureFix=Readonly<{
 binding:LiveCaptureBinding;journalSequence:number;receivedMonotonicMs:number;
 receivedWallMs:number;sample:Readonly<RideEvidenceSample>;
}>;
export type CaptureInvalidation='starting'|'pause'|'stop'|'background'|'source_error'|'storage_error'|'capture_limit'|'account_changed'|'account_deleted'|'unmount';
export type LiveCaptureEvent=
 |{kind:'active';binding:LiveCaptureBinding}
 |{kind:'sample';fix:LiveCaptureFix}
 |{kind:'unavailable';binding:LiveCaptureBinding;reason:'sample_quality'}
 |{kind:'invalidated';generation:number;reason:CaptureInvalidation};
export interface LiveCapturePort{
 getBinding():LiveCaptureBinding|null;
 subscribe(listener:(event:LiveCaptureEvent)=>void):()=>void;
}

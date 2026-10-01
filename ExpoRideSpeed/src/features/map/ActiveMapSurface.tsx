import React,{forwardRef,useLayoutEffect,useRef} from 'react';
import {useScreenActivity} from '../../lib/useScreenActivity';
import {safeCamera} from './geometry';
import MapSurface from './MapSurface';
import type {MapCamera,MapHandle,MapSurfaceProps} from './MapSurface.types';

/** Keep screen data and the settled camera; dispose native/GL resources when hidden. */
export default forwardRef<MapHandle,MapSurfaceProps&{visible?:boolean}>(function ActiveMapSurface({visible=true,...props},ref){
 const activity=useScreenActivity(),camera=useRef(props.initialCamera),visibility=useRef({visible,version:0});
 const renderTicket:{activity:number|null;visibility:number|null}={activity:null,visibility:null};
 useLayoutEffect(()=>{if(visibility.current.visible!==visible)++visibility.current.version;visibility.current.visible=visible;renderTicket.activity=activity.capture();renderTicket.visibility=visibility.current.version;});
 if(!activity.active||!visible)return null;
 const current=()=>visibility.current.visible&&renderTicket.visibility===visibility.current.version&&activity.accepts(renderTicket.activity);
 return <MapSurface key={activity.generation} {...props} ref={ref} initialCamera={camera.current}
  onCameraChanged={(value:MapCamera)=>{if(!current())return;const next=safeCamera(value);if(next){camera.current=next;props.onCameraChanged?.(next);}}}
  onStatus={status=>{if(current())props.onStatus(status);}}/>;
});

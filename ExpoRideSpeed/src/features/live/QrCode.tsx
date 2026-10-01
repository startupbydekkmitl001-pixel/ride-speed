import React,{useMemo} from 'react';
import {View} from 'react-native';
import Svg,{Path,Rect} from 'react-native-svg';
import encodeQr from 'qrcode-generator';
import {parseFriendLink} from './model';

/** Exact ASCII payload, four-module quiet zone, no branding over encoded bits. */
export function qrPath(url:string){if(!parseFriendLink(url))throw Error('LIVE_INVALID');const code=encodeQr(0,'M');code.addData(url,'Byte');code.make();const count=code.getModuleCount();let path='';for(let y=0;y<count;y++)for(let x=0;x<count;x++)if(code.isDark(y,x))path+=`M${x+4} ${y+4}h1v1h-1z`;return {path,size:count+8};}
export default function QrCode({url,label}:{url:string;label:string}){const value=useMemo(()=>qrPath(url),[url]);return <View accessible accessibilityLabel={label} accessibilityRole="image" style={{width:260,height:260,maxWidth:'100%',aspectRatio:1,alignSelf:'center'}}><Svg width="100%" height="100%" viewBox={`0 0 ${value.size} ${value.size}`}><Rect width={value.size} height={value.size} fill="#FFFFFF"/><Path d={value.path} fill="#000000"/></Svg></View>;}

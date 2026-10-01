import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url),root=fileURLToPath(new URL('../',import.meta.url));

test('actual installed Expo mods retain QR camera permission and block microphone recording',()=>{
 const output=execFileSync(process.execPath,[require.resolve('expo/bin/cli'),'config','--type','introspect','--json'],{cwd:root,encoding:'utf8',maxBuffer:8*1024*1024,env:{...process.env,APP_VARIANT:'release',CI:'1'}});
 const config=JSON.parse(output),mods=config._internal.modResults;
 const permissions=mods.android.manifest.manifest['uses-permission'].map(item=>item.$);
 const camera=permissions.filter(item=>item['android:name']==='android.permission.CAMERA');
 assert.ok(camera.length>0,'the scanner needs an installed CAMERA permission');
 assert.ok(camera.every(item=>item['tools:node']!=='remove'),'a library-only photo picker must not remove the scanner permission');
 const microphone=permissions.filter(item=>item['android:name']==='android.permission.RECORD_AUDIO');
 assert.ok(microphone.every(item=>item['tools:node']==='remove'),'QR scanning does not request microphone recording');
 assert.equal(typeof mods.ios.infoPlist.NSCameraUsageDescription,'string');
 assert.equal(mods.ios.infoPlist.NSMicrophoneUsageDescription,undefined);
});

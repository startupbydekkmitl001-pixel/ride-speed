import {authenticate,failure,HttpError,preflight,readId,response} from '../_shared/http.ts';
import {createRaceVerificationHandler} from '../_shared/race-verification-handler.mjs';
Deno.serve(createRaceVerificationHandler({authenticate,failure,HttpError,preflight,readId,response,
 digest:async(bytes:ArrayBuffer)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(n=>n.toString(16).padStart(2,'0')).join(''),
}));

import test from 'node:test';
import assert from 'node:assert/strict';
import {rankedModule,owner,peer,uuid,stamp,row} from './rankedFixtures.mjs';
const model=rankedModule('publicationModel');
const plain=value=>JSON.parse(JSON.stringify(value));
const request=()=>({schema_version:1,action:'publication_set',metric:'sustained_speed',record_id:uuid(102),expected_revision:0,audience:'friends'});
const operation=()=>({owner_id:owner,operation_id:uuid(900),request:request(),queued_at:stamp,last_error:null});
const wire=value=>({owner_id:value.owner_id,operation_id:value.operation_id,request:value.request});
const publication=()=>({owner_id:owner,metric:'sustained_speed',record_id:uuid(102),revision:1,audience:'friends',updated_at:stamp});
const receipt=()=>({owner_id:owner,operation_id:uuid(900),request:request(),applied_at:stamp,result:publication()});
function ownRecord(){const {user_id,rank,position,tied,profile,...rest}=row();return {...rest,publication:{revision:0,audience:'private',updated_at:null}};}
test('explicit publication freezes only exact metric, revision and audience; no course/GPS permission',()=>{
 const frozen=model.freezeRankedRequest(request());assert.equal(Object.isFrozen(frozen),true);
 for(const edit of [{...request(),expected_revision:-1},{...request(),audience:'public'},{...request(),location:true},{...request(),record_id:'guess'}])assert.throws(()=>model.freezeRankedRequest(edit),/RANKED_INVALID/);
 assert.deepEqual(plain(model.validateRankedPublication(publication(),owner,'sustained_speed',uuid(102))),publication());
 assert.throws(()=>model.validateRankedPublication({...publication(),owner_id:peer},owner,'sustained_speed',uuid(102)),/RANKED_INVALID_RESPONSE/);
 assert.throws(()=>model.validateRankedPublication({...publication(),revision:0},owner,'sustained_speed',uuid(102)),/RANKED_INVALID_RESPONSE/);
});
test('receipt requires exact persisted operation and CAS result, including reports separate from revocation',()=>{
 assert.deepEqual(plain(model.validateRankedReceipt(receipt(),owner,wire(operation()))),receipt());
 for(const edit of [{...receipt(),operation_id:uuid(901)},{...receipt(),request:{...request(),audience:'global'}},{...receipt(),result:{...publication(),revision:2}},{...receipt(),result:{...publication(),record_id:uuid(103)}}])assert.throws(()=>model.validateRankedReceipt(edit,owner,wire(operation())),/RANKED_INVALID_RESPONSE/);
 const report={schema_version:1,action:'report_record',metric:'route_time',record_id:uuid(103),reason:'suspected_cheating',detail:'ตรวจสอบเส้นทางนี้'};
 const op={...wire(operation()),request:report};const ack={...receipt(),request:report,result:{report_id:uuid(905),metric:'route_time',record_id:uuid(103),state:'received',created_at:stamp}};
 assert.deepEqual(plain(model.validateRankedReceipt(ack,owner,op)),ack);
 assert.throws(()=>model.freezeRankedRequest({...report,detail:'🙂'.repeat(501)}),/RANKED_INVALID/);
 assert.throws(()=>model.freezeRankedRequest({...report,detail:'bad\ud800'}),/RANKED_INVALID/);
});
test('restart queue preserves exact private owner binding and fails unknown/colliding data without silent loss',()=>{
 const stored=model.parseRankedOperations([operation()],owner);assert.deepEqual(plain(stored),[operation()]);
 assert.throws(()=>model.parseRankedOperations([operation()],peer),/RANKED_INVALID_RESPONSE/);
 assert.throws(()=>model.parseRankedOperations([operation(),operation()],owner),/RANKED_INVALID_RESPONSE/);
 assert.throws(()=>model.parseRankedOperations([{...operation(),request:{...request(),coordinates:[]}}],owner),/RANKED_INVALID_RESPONSE/);
 assert.throws(()=>model.parseRankedOperations(Array.from({length:33},(_,i)=>({...operation(),operation_id:uuid(900+i)})),owner),/RANKED_CAPACITY/);
});
test('owner selector rejects rank/path fabrication, captures strict legacy provenance and exact microsecond keysets',()=>{
 const record=ownRecord(),page={owner_id:owner,server_now:stamp,items:[record],next_cursor:null};
 assert.deepEqual(plain(model.validateRankedOwnPage(page,owner)),page);
 for(const edit of [{...record,rank:1},{...record,path:'private/route'},{...record,provenance_unknown:false},{...record,publication:{revision:0,audience:'friends',updated_at:null}}])assert.throws(()=>model.validateRankedOwnPage({...page,items:[edit]},owner),/RANKED_INVALID_RESPONSE/);
 const newer={...record,record_id:uuid(104),completed_at:'2026-10-01T09:00:00.000002Z'},older={...record,completed_at:'2026-10-01T09:00:00.000001+00:00'};
 const cursor={completed_at:older.completed_at,record_id:older.record_id,metric:older.metric};
 assert.equal(model.validateRankedOwnPage({...page,items:[newer,older],next_cursor:cursor},owner).items.length,2);
 assert.throws(()=>model.validateRankedOwnPage({...page,items:[older,newer]},owner),/RANKED_INVALID_RESPONSE/);
 assert.throws(()=>model.validateRankedOwnPage({...page,items:[newer],next_cursor:cursor},owner),/RANKED_INVALID_RESPONSE/);
});

test('retained publication page is owner-only positive revision metadata with exact microsecond pagination',()=>{
 const newer={...publication(),updated_at:'2026-10-01T09:00:00.000002Z'},older={...publication(),record_id:uuid(101),audience:'private',updated_at:'2026-10-01T09:00:00.000001+00:00'};
 const cursor={updated_at:older.updated_at,record_id:older.record_id,metric:older.metric},page={owner_id:owner,server_now:stamp,items:[newer,older],next_cursor:cursor};
 assert.deepEqual(plain(model.validateRankedPublicationPage(page,owner)),page);
 for(const changed of [{...older,owner_id:peer},{...older,revision:0,updated_at:null},{...older,sustained_kmh:55},{...older,updated_at:'2026-10-01T11:00:00Z'}])assert.throws(()=>model.validateRankedPublicationPage({...page,items:[changed],next_cursor:null},owner),/RANKED_INVALID_RESPONSE/);
 assert.throws(()=>model.validateRankedPublicationPage({...page,items:[older,newer]},owner),/RANKED_INVALID_RESPONSE/);
 assert.throws(()=>model.validateRankedPublicationPage({...page,items:[older]},owner,cursor),/RANKED_INVALID_RESPONSE/);
 assert.throws(()=>model.validateRankedPublicationPage({...page,next_cursor:{...cursor,record_id:uuid(999)}},owner),/RANKED_INVALID_RESPONSE/);
});

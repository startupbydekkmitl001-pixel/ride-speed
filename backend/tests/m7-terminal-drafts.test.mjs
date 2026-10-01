import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {schema,owners,ports,profiles,A,B,id} from './live-fixture.mjs';
import {communityModule} from '../../ExpoRideSpeed/tests/communityFixtures.mjs';

const directory=new URL('../migrations/',import.meta.url),model=communityModule('communityOwnerModel');
async function base(){
 const db=new PGlite();await db.exec('create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;');await db.exec(schema);
 for(const owner of owners)await db.query('insert into auth.users values($1)',[owner]);
 const files=(await readdir(directory)).filter(x=>x.endsWith('.sql')).sort();
 for(const file of files.filter(x=>x<'202610010011_community_media.sql'))await db.exec(await readFile(new URL(file,directory),'utf8'));
 const p=ports(db);await profiles(p);return {db,p,files};
}
const detail=(p,postId)=>p.value(A,'select public.rs_community_owner_post($1) value',[postId]);
const page=p=>p.value(A,'select public.rs_community_owner_posts(null,30) value');
async function community(db,files){for(const file of files.filter(x=>x>='202610010011_community_media.sql'))await db.exec(await readFile(new URL(file,directory),'utf8'));}

test('real pre011 deleted unpublished draft upgrades to positive terminal metadata without poisoning owner pages',async()=>{
 const {db,p,files}=await base();try{
  const deletedId=id(97001),draftId=id(97002);
  await p.as(A,'select public.rs_create_post($1)',[deletedId]);await p.as(A,'select public.rs_delete_post($1)',[deletedId]);await p.as(A,'select public.rs_create_post($1)',[draftId]);
  const original=(await p.admin('select moderation_state,deleted_at from public.rs_posts where id=$1',[deletedId])).rows[0];assert.equal(original.moderation_state,'draft');assert.ok(original.deleted_at);
  const frozen=await readFile(new URL('202610010011_community_media.sql',directory));assert.equal(createHash('sha256').update(frozen).digest('hex'),'adcfa97fb0b81f7727b7068310062873d19a1c77afea38768aa2e539861eebac');
  await db.exec(frozen.toString('utf8'));const readinessSql=await readFile(new URL('../ops/m7-terminal-drafts-readiness.sql',import.meta.url),'utf8'),beforeRepair=(await p.admin(readinessSql)).rows[0].readiness;assert.equal(beforeRepair.repairable_count,1);assert.equal(beforeRepair.projection.guard_count,0);
  for(const file of files.filter(x=>x>'202610010011_community_media.sql'))await db.exec(await readFile(new URL(file,directory),'utf8'));
  const afterRepair=(await p.admin(readinessSql)).rows[0].readiness;assert.equal(afterRepair.repairable_count,0);assert.equal(afterRepair.projection.guard_count,3);assert.ok(afterRepair.projection.definer&&!afterRepair.projection.anon_execute&&!afterRepair.projection.app_execute&&!afterRepair.projection.service_execute);assert.equal(afterRepair.projection.search_path.includes('search_path=""'),true);
  const listing=await page(p);model.validateCommunityOwnerPage(listing,A);assert.deepEqual(listing.items.map(x=>[x.post_id,x.content_revision,x.state]),[[deletedId,1,'deleted']]);
  const terminal=await detail(p,deletedId);model.validateCommunityOwnerDetail(terminal,A,deletedId);assert.equal(terminal.post.content_revision,1);assert.equal(terminal.post.state,'deleted');
  const draft=await detail(p,draftId);model.validateCommunityOwnerDetail(draft,A,draftId);assert.equal(draft.post.content_revision,0);assert.equal(draft.post.state,'draft');
  assert.equal((await p.value(B,'select public.rs_community_owner_post($1) value',[deletedId])).error.code,'COMMUNITY_UNAVAILABLE');assert.equal((await p.value(A,'select public.rs_community_post($1) value',[deletedId])).error.code,'COMMUNITY_UNAVAILABLE');
  const retired={schema_version:1,action:'audience',post_id:deletedId,expected_revision:1,visibility:'public'};assert.equal((await p.value(A,'select public.rs_community_mutate($1,$2::jsonb) value',[id(97004),JSON.stringify(retired)])).error.code,'COMMUNITY_UNAVAILABLE');
  const mutation={schema_version:1,action:'delete_post',post_id:draftId,expected_revision:0};assert.equal((await p.value(A,'select public.rs_community_mutate($1,$2::jsonb) value',[id(97003),JSON.stringify(mutation)])).error.code,'COMMUNITY_INVALID');
 }finally{await db.close();}
});

test('trusted future terminal legacy projections preserve draft zero and deletion authority without grant changes',async()=>{
 const {db,p,files}=await base();try{
  await db.exec(await readFile(new URL('202610010011_community_media.sql',directory),'utf8'));
  const oldBody=(await p.admin("select p.prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='ride_private' and p.proname='community_legacy_projection'")).rows[0].prosrc;
  const before=(await p.admin("select p.proargnames,p.prorettype,p.prosecdef,p.proconfig,has_function_privilege('anon',p.oid,'execute') anon,has_function_privilege('authenticated',p.oid,'execute') app,has_function_privilege('service_role',p.oid,'execute') service from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='ride_private' and p.proname='community_legacy_projection'")).rows[0];
  for(const file of files.filter(x=>x>'202610010011_community_media.sql'))await db.exec(await readFile(new URL(file,directory),'utf8'));
  const after=(await p.admin("select p.proargnames,p.prorettype,p.prosecdef,p.proconfig,has_function_privilege('anon',p.oid,'execute') anon,has_function_privilege('authenticated',p.oid,'execute') app,has_function_privilege('service_role',p.oid,'execute') service from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='ride_private' and p.proname='community_legacy_projection'")).rows[0];assert.deepEqual(after,before);assert.equal(after.app,false);assert.equal(after.service,false);
  const currentBody=(await p.admin("select p.prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='ride_private' and p.proname='community_legacy_projection'")).rows[0].prosrc;assert.equal(currentBody,oldBody.replaceAll("new.moderation_state='draft' then","new.moderation_state='draft' and new.deleted_at is null then"));
  const inserted=id(97101),updated=id(97102);await p.admin("insert into public.rs_posts(id,owner_id,caption,moderation_state,visibility,deleted_at) values($1,$2,'Actual trusted legacy draft','draft','friends',clock_timestamp())",[inserted,A]);
  await p.admin("insert into public.rs_posts(id,owner_id,caption,moderation_state,visibility) values($1,$2,'Actual trusted legacy draft','draft','friends')",[updated,A]);assert.equal((await detail(p,updated)).post.content_revision,0);await p.admin('update public.rs_posts set deleted_at=clock_timestamp() where id=$1',[updated]);
  const listing=await page(p);model.validateCommunityOwnerPage(listing,A);assert.equal(listing.items.length,2);for(const row of listing.items){assert.equal(row.content_revision,1);assert.equal(row.state,'deleted');model.validateCommunityOwnerDetail(await detail(p,row.post_id),A,row.post_id);}
  const canonical=id(97103);await p.value(A,'select public.rs_community_reserve_post($1) value',[canonical]);assert.equal((await detail(p,canonical)).post.content_revision,0);assert.equal((await page(p)).items.length,2);
  for(const name of ['rs_create_post(uuid)','rs_delete_post(uuid)'])await assert.rejects(p.as(A,'select public.'+name.replace('(uuid)','($1)'),[id(97104)]),error=>error.code==='42501');
 }finally{await db.close();}
});

test('catalog-only M7 preflight is safe before011 and explicitly reports a deployed schema',async()=>{
 const {db,p,files}=await base();try{
  const sql=await readFile(new URL('../ops/m7-community-preflight.sql',import.meta.url),'utf8'),before=(await p.admin(sql)).rows[0].preflight;
  assert.ok(Object.values(before.prior_schema_present).every(Boolean));assert.equal(before.new_tables.length,8);assert.ok(before.new_tables.every(x=>!x.present));assert.deepEqual(before.new_public_functions,[]);assert.deepEqual(before.new_private_functions,[]);assert.deepEqual(before.new_storage_policies,[]);assert.equal(before.existing_replacement_functions.length,6);assert.equal(JSON.stringify(before).includes(A),false);
  await community(db,files);const after=(await p.admin(sql)).rows[0].preflight;assert.ok(after.new_tables.every(x=>x.present));assert.equal(after.new_public_functions.length,19);assert.ok(after.new_private_functions.length>6);assert.equal(after.new_storage_policies.length,2);
 }finally{await db.close();}
});

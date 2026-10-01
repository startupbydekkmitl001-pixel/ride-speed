// Run real guarded operator SQL. Only the two CREATE EXTENSION commands have
// local facade ports because PGlite has no managed Cron/pg_net binaries.
// No HTTP, credential decryption, scheduler activation or production deletion.
import {test} from 'node:test';import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';import {PGlite} from '@electric-sql/pglite';
import {initialize} from './live-fixture.mjs';
const read=()=>readFile(new URL('../ops/m7-community-extension-bootstrap.sql',import.meta.url),'utf8');
const vault=`create schema vault;create table vault.secrets(name text,secret text);create table vault.read_count(n integer);insert into vault.read_count values(0);
create function vault.test_decrypt(value text) returns text language plpgsql volatile as $$begin update vault.read_count set n=n+1;return value;end$$;
create view vault.decrypted_secrets as select name,vault.test_decrypt(secret) decrypted_secret from vault.secrets;
grant usage on schema vault to service_role,trusted_automation;grant all on vault.secrets,vault.decrypted_secrets to service_role,trusted_automation;grant execute on function vault.test_decrypt(text) to service_role,trusted_automation;`;
const cron=`create schema cron;create table cron.job(jobid bigint,jobname text);create table cron.job_run_details(runid bigint);
create function cron.schedule(text,text,text) returns bigint language sql as $$select 1::bigint$$;
create function cron.alter_job(bigint,text default null,text default null,text default null,text default null,boolean default null) returns void language sql as $$select$$;
grant usage on schema cron to public,trusted_automation;grant all on all tables in schema cron to public,trusted_automation;grant execute on all functions in schema cron to public,trusted_automation;`;
const net=`create schema net;create table net.http_request_queue(id bigint,headers jsonb);create table net._http_response(id bigint,content text);
create function net.http_post(text,jsonb default '{}'::jsonb,jsonb default '{}'::jsonb,jsonb default '{}'::jsonb,integer default 5000) returns bigint language sql as $$select 1::bigint$$;
create function net.check_worker_is_up() returns void language sql as $$select$$;
grant usage on schema net to public,trusted_automation;grant all on all tables in schema net to public,trusted_automation;grant execute on all functions in schema net to public,trusted_automation;`;
async function database(){const db=new PGlite();await initialize(db);await db.exec('create role trusted_automation login');await db.exec(vault);
 await db.exec("create or replace view pg_catalog.pg_available_extensions as select name::name collate \"C\",default_version::text,null::text collate \"C\" installed_version,null::text comment from(values('pg_cron','synthetic-test'),('pg_net','synthetic-test')) ports(name,default_version)");return db;}
const literal=value=>`'${value.replaceAll("'","''")}'`;
async function source({network=net}={}){
 const sql=await read();for(const statement of["execute 'create extension pg_cron';","execute 'create extension pg_net';"]){assert.equal(sql.split(statement).length-1,1,'only reviewed CREATE EXTENSION port may be substituted');}
 return sql.replace("execute 'create extension pg_cron';",()=>`execute ${literal(cron)};`).replace("execute 'create extension pg_net';",()=>`execute ${literal(network)};`);
}
async function rejected(db,sql,code){await assert.rejects(db.exec(sql),e=>e.message===code);await db.exec('rollback');}

test('fresh bootstrap hardens factory PUBLIC/app/service exposure while preserving explicit trusted grants, without scheduling/decryption',async()=>{
 const db=await database();try{
  await db.exec(await source());
  for(const role of['anon','authenticated','service_role']){
   for(const schema of['cron','net','vault'])assert.equal((await db.query('select has_schema_privilege($1,$2,\'USAGE\') allowed',[role,schema])).rows[0].allowed,false);
   for(const table of['net.http_request_queue','net._http_response','vault.secrets','vault.decrypted_secrets'])assert.equal((await db.query('select has_table_privilege($1,$2,\'SELECT,INSERT,UPDATE,DELETE\') allowed',[role,table])).rows[0].allowed,false);
   assert.equal((await db.query("select has_function_privilege($1,'net.http_post(text,jsonb,jsonb,jsonb,integer)','EXECUTE') allowed",[role])).rows[0].allowed,false);
  }
  for(const role of['postgres','trusted_automation'])for(const schema of['cron','net','vault'])assert.equal((await db.query('select has_schema_privilege($1,$2,\'USAGE\') allowed',[role,schema])).rows[0].allowed,true);
  for(const table of['net.http_request_queue','net._http_response','vault.secrets','vault.decrypted_secrets'])assert.equal((await db.query('select has_table_privilege(\'trusted_automation\',$1,\'SELECT\') allowed',[table])).rows[0].allowed,true);
  assert.equal((await db.query('select n from vault.read_count')).rows[0].n,0);assert.equal((await db.query('select count(*)::int n from cron.job')).rows[0].n,0);assert.equal((await db.query('select count(*)::int n from net.http_request_queue')).rows[0].n,0);
  assert.equal((await db.query('select enabled from ride_private.race_policy')).rows[0].enabled,false);
 }finally{await db.close();}
});

test('preexisting extension namespace or scheduler objects are refused without touching unrelated jobs/grants',async()=>{
 const db=await database();try{
  await db.exec(cron);await db.exec("insert into cron.job values(9,'unrelated-job')");const before=(await db.query('select * from cron.job')).rows;
  await rejected(db,await source(),'COMMUNITY_BOOTSTRAP_EXISTING_EXTENSION_REQUIRES_REVIEW');assert.deepEqual((await db.query('select * from cron.job')).rows,before);
  assert.equal((await db.query("select has_schema_privilege('service_role','vault','USAGE') allowed")).rows[0].allowed,true);
 }finally{await db.close();}
});

test('unsupported installed API and inherited untrusted access roll back both extension creation and Vault ACL changes',async()=>{
 for(const network of[net.replace('create function net.check_worker_is_up() returns void language sql as $$select$$;',''),`${net}grant trusted_automation to service_role;`]){
  const db=await database();try{
   await rejected(db,await source({network}),network.includes('grant trusted_automation to service_role')?'COMMUNITY_BOOTSTRAP_UNSAFE_ACL':'COMMUNITY_BOOTSTRAP_API_REQUIRED');
   assert.equal((await db.query("select to_regnamespace('cron') cron,to_regnamespace('net') net")).rows[0].cron,null);assert.equal((await db.query("select to_regnamespace('net') net")).rows[0].net,null);
   assert.equal((await db.query("select has_schema_privilege('service_role','vault','USAGE') allowed")).rows[0].allowed,true);assert.equal((await db.query('select n from vault.read_count')).rows[0].n,0);
  }finally{await db.close();}
 }
});

test('missing managed extension availability and nonlogin application role fail before any bootstrap writes',async()=>{
 const db=await database();try{
  await db.exec("create or replace view pg_catalog.pg_available_extensions as select null::name collate \"C\" name,null::text default_version,null::text collate \"C\" installed_version,null::text comment where false");
  await rejected(db,await source(),'COMMUNITY_BOOTSTRAP_EXTENSION_UNAVAILABLE');assert.equal((await db.query("select to_regnamespace('cron') cron")).rows[0].cron,null);
  await db.exec('set role authenticated');await rejected(db,await source(),'COMMUNITY_BOOTSTRAP_OPERATOR_REQUIRED');await db.exec('reset role');
 }finally{await db.close();}
});

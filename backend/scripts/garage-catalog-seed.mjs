// Generate reviewable SQL only. No credentials, network, user rows or deployment.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const source=new URL('../../ExpoRideSpeed/src/data/vehicleCatalog.json',import.meta.url);
const raw=await readFile(source,'utf8'),catalog=JSON.parse(raw),seen=new Set();
if(catalog.schemaVersion!==1||!Array.isArray(catalog.entries)||catalog.entries.length>500)throw Error('Invalid catalog document');
for(const entry of catalog.entries){
 if(!entry||typeof entry.id!=='string'||entry.id.length<1||entry.id.length>100||seen.has(entry.id)||!['scooter','bigbike','car'].includes(entry.category)
 ||entry.market!=='TH'||typeof entry.specVerified!=='boolean'||typeof entry.brand!=='string'||typeof entry.model!=='string'
 ||typeof entry.sourceUrl!=='string'||!entry.sourceUrl.startsWith('https://')||!Array.isArray(entry.sourceUrls)||!entry.sourceUrls.every(value=>typeof value==='string'&&value.startsWith('https://'))
 ||typeof entry.verifiedAt!=='string'||!Array.isArray(entry.verificationNotes))throw Error('Catalog provenance is missing or invalid');
 seen.add(entry.id);
}
const quote=value=>"'"+value.replaceAll("'","''")+"'";
const rows=catalog.entries.map(entry=>`(${quote(entry.id)},${quote(entry.category)},${quote(JSON.stringify(entry))}::jsonb)`).join(',\n');
const sql=`-- Generated from the one editable vehicleCatalog.json; review before applying.\n-- Source SHA-256: ${createHash('sha256').update(raw).digest('hex')}\n-- Catalog provenance is preserved, including explicitly unverified reference outputs.\n-- No owner garage, ride, profile or verified ranking rows are created.\nbegin;\ninsert into public.rs_vehicle_catalog(id,category,metadata) values\n${rows}\non conflict(id) do update set category=excluded.category,metadata=excluded.metadata,updated_at=now();\ncommit;\n`;
const directory=new URL('../seeds/',import.meta.url);await mkdir(directory,{recursive:true});await writeFile(new URL('vehicle_catalog_v5.sql',directory),sql);
console.log(`Generated backend/seeds/vehicle_catalog_v5.sql: ${seen.size} catalog configurations; ${catalog.entries.filter(entry=>entry.specVerified).length} with reviewed specs. No deployment performed.`);

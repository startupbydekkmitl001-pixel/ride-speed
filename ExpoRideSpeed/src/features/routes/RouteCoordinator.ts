import type { RouteDeleteDraft, RouteSnapshot, RouteSyncAck, RouteSyncDraft } from './syncTypes';
import { freezeRouteDeleteDraft, freezeRouteDraft, validateRouteAck } from './syncModel';
import { ROUTE_MAX_LIVE, ROUTE_MAX_RECORDS, fingerprintRoute, routeRecord, snapshotRecord, type RouteLocalRecord, type RoutePending, type RouteRecordInput, type RouteSourceError } from './localModel';

export type RouteOwned={routeRecords:RouteLocalRecord[]};
export type RoutePort={
  guard:()=>void; hasSession:()=>boolean; read:()=>RouteOwned;
  flush:()=>Promise<void>; write:(patch:Partial<RouteOwned>)=>Promise<void>; operation:()=>string;
  fetch:(cloudId:string)=>Promise<RouteSnapshot|null>; list:()=>Promise<readonly RouteSnapshot[]>;
  save:(draft:RouteSyncDraft)=>Promise<RouteSyncAck>; remove:(draft:RouteDeleteDraft)=>Promise<RouteSyncAck>;
};
export type RouteConflict={remote:RouteSnapshot|null;reason:'revision'|'deleted'};
export type RouteStatus='local'|'loading'|'synced'|'pending'|'conflict'|'error';
export type RouteCoordinatorSnapshot={status:RouteStatus;error:string|null;conflicts:Readonly<Record<string,RouteConflict>>};
const sourceErrors=new Set(['ROUTE_SOURCE_EXPIRED','ROUTE_SOURCE_UNAVAILABLE','ROUTE_SOURCE_MISMATCH']);
const samePending=(left:RoutePending|null,right:RoutePending)=>left?.action===right.action&&left.draft.operationId===right.draft.operationId;
const desiredKey=(record:RouteLocalRecord)=>JSON.stringify([fingerprintRoute(record.document),record.sync.deleted,record.sync.serverDeleted,record.sync.cloudId,record.sync.revision,record.sync.cleanFingerprint,record.sync.pending?.draft.operationId??null]);
const geometryKey=(record:Pick<RouteLocalRecord,'document'>)=>JSON.stringify([record.document.category,record.document.stops.map(stop=>[stop.lat,stop.lng]),record.document.source]);
const dirty=(record:RouteLocalRecord)=>record.sync.pending!==null||!record.sync.serverDeleted&&(record.sync.deleted?record.sync.cloudId!==null:fingerprintRoute(record.document)!==record.sync.cleanFingerprint);

/** Every mutation derives from fresh owner data. Network waits never hold the write queue. */
export class RouteCoordinator {
  private state:RouteCoordinatorSnapshot={status:'local',error:null,conflicts:{}};
  private listeners=new Set<()=>void>(); private writes=Promise.resolve(); private running:Promise<void>|null=null;
  private closed=false; private refreshOffset=0; private dirtyOffset=0;
  constructor(private port:RoutePort){}
  getSnapshot=()=>this.state;
  subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
  close(){this.closed=true;this.listeners.clear();}
  private current(){if(this.closed)throw Error('ACCOUNT_CHANGED');this.port.guard();}
  private publish(patch:Partial<RouteCoordinatorSnapshot>){if(this.closed)return;this.state={...this.state,...patch};this.listeners.forEach(fn=>fn());}
  private fail(error:unknown){try{this.current();}catch{return;}this.publish({status:Object.keys(this.state.conflicts).length?'conflict':'error',error:error instanceof Error?error.message:'ROUTE_SYNC_UNAVAILABLE'});}
  private commit(change:(old:RouteOwned)=>Partial<RouteOwned>):Promise<void>{
    const work=this.writes.catch(()=>{}).then(async()=>{this.current();await this.port.write(change(this.port.read()));this.current();});this.writes=work.catch(()=>{});return work;
  }
  private replace(old:RouteOwned,id:string,change:(record:RouteLocalRecord)=>RouteLocalRecord):Partial<RouteOwned>{
    return {routeRecords:old.routeRecords.map(record=>record.localId===id?change(record):record)};
  }
  async save(input:RouteRecordInput,options?:{existingOnly?:boolean}):Promise<boolean>{
    try{
      // Validation detaches caller-owned arrays before this operation can wait behind another write.
      const detached=routeRecord(input);
      const localId=detached.localId,hasGeometry=input.geometry!==undefined,existingOnly=options?.existingOnly===true;
      const hasExpected=input.expectedFingerprint!==undefined,expected=input.expectedFingerprint;
      await this.commit(old=>{
        const existing=old.routeRecords.find(record=>record.localId===localId);
        if(existing?.sync.deleted||existingOnly&&!existing)throw Error('ROUTE_LOCAL_CHANGED');
        if(hasExpected&&(!existing||expected===null||fingerprintRoute(existing.document)!==expected))throw Error('ROUTE_LOCAL_CHANGED');
        if(!existing){if(old.routeRecords.length>=ROUTE_MAX_RECORDS||old.routeRecords.filter(row=>!row.sync.deleted).length>=ROUTE_MAX_LIVE)throw Error('ROUTE_TOO_LARGE');return {routeRecords:[...old.routeRecords,detached]};}
        const key=fingerprintRoute(detached.document);
        const updated={...existing,document:detached.document,geometry:hasGeometry?detached.geometry:(geometryKey(existing)===geometryKey(detached)?existing.geometry:null),sync:{...existing.sync,blocked:existing.sync.blocked?.fingerprint===key?existing.sync.blocked:null}};
        return this.replace(old,localId,()=>updated);
      });
      this.publish({status:Object.keys(this.state.conflicts).length?'conflict':this.port.hasSession()?'pending':'local',error:null});return true;
    }catch(error){this.fail(error);return false;}
  }
  async remove(localId:string):Promise<boolean>{
    try{await this.commit(old=>this.replace(old,localId,record=>({...record,sync:{...record.sync,deleted:true,blocked:null}})));this.publish({status:Object.keys(this.state.conflicts).length?'conflict':this.port.hasSession()?'pending':'local',error:null});return true;}catch(error){this.fail(error);return false;}
  }
  sync():Promise<void>{
    if(this.running)return this.running;
    const work=this.runSync();this.running=work;
    void work.then(()=>{if(this.running===work)this.running=null;},()=>{if(this.running===work)this.running=null;});return work;
  }
  private conflict(localId:string,remote:RouteSnapshot|null){
    this.publish({status:'conflict',error:remote?'ROUTE_REVISION_CONFLICT':'ROUTE_DELETED',conflicts:{...this.state.conflicts,[localId]:{remote,reason:remote?'revision':'deleted'}}});
  }
  private async adoptList(snapshots:readonly RouteSnapshot[]){
    await this.commit(old=>{
      const records=[...old.routeRecords];
      for(const remote of snapshots){
        // Hidden tombstones intentionally retain cloud identity across restarts and stale list responses.
        if(records.some(record=>record.sync.cloudId===remote.id))continue;
        if(records.length>=ROUTE_MAX_RECORDS||records.filter(row=>!row.sync.deleted).length>=ROUTE_MAX_LIVE)throw Error('ROUTE_TOO_LARGE');
        const localId=records.some(record=>record.localId===remote.id)?this.port.operation():remote.id;
        records.push(snapshotRecord(remote,localId));
      }return {routeRecords:records};
    });
  }
  private async acknowledge(localId:string,pending:RoutePending,ack:RouteSyncAck){
    validateRouteAck(ack,pending.draft,pending.action);
    let previous:RouteLocalRecord['sync']|null=null;
    try{
      await this.commit(old=>this.replace(old,localId,record=>{
        if(!samePending(record.sync.pending,pending))throw Error('ROUTE_OPERATION_CHANGED');
        previous=record.sync;
        return {...record,sync:{...record.sync,revision:ack.applied_revision,cleanFingerprint:pending.action==='save'?fingerprintRoute(pending.draft.document):record.sync.cleanFingerprint,pending:null,blocked:null,...(pending.action==='delete'?{deleted:true,serverDeleted:true}:{})}};
      }));
    }catch(error){
      // Some local stores expose a failed write in memory. Restore the immutable retry metadata,
      // preserving any newer desired document. A restart already has the old pending operation.
      if(previous){try{await this.commit(old=>this.replace(old,localId,record=>{
        if(record.sync.pending||record.sync.revision!==ack.applied_revision)return record;
        const saved=previous!;return {...record,sync:{...saved,deleted:record.sync.deleted||saved.deleted}};
      }));}catch{/* Visible failed patch remains dirty until a successful flush. */}}
      throw error;
    }
  }
  private async sendPending(localId:string,pending:RoutePending):Promise<boolean>{
    try{
      await this.port.flush();this.current();
      const ack=pending.action==='save'?await this.port.save(pending.draft):await this.port.remove(pending.draft);this.current();
      await this.acknowledge(localId,pending,ack);return true;
    }catch(error){
      this.current();const code=error instanceof Error?error.message:'ROUTE_SYNC_UNAVAILABLE';
      if(pending.action==='save'&&sourceErrors.has(code)){
        // Transport checks the exact receipt first: only this definitive response proves rejection.
        await this.commit(old=>this.replace(old,localId,record=>samePending(record.sync.pending,pending)?{...record,sync:{...record.sync,pending:null,blocked:{fingerprint:fingerprintRoute(pending.draft.document),error:code as RouteSourceError}}}:record));
        this.publish({status:'error',error:code});return false;
      }
      if(code==='ROUTE_REVISION_CONFLICT'||code==='ROUTE_DELETED'){
        const record=this.port.read().routeRecords.find(row=>row.localId===localId);
        if(!record?.sync.cloudId)throw error;
        const remote=await this.port.fetch(record.sync.cloudId);this.current();this.conflict(localId,remote);return false;
      }throw error;
    }
  }
  private async reconcile(localId:string,remote:RouteSnapshot|null):Promise<'settled'|'pending'|'conflict'|'blocked'>{
    let result:'settled'|'pending'|'conflict'|'blocked'='settled',conflict=false;
    await this.commit(old=>this.replace(old,localId,record=>{
      const sync=record.sync,key=fingerprintRoute(record.document);
      if(sync.pending){result='pending';return record;}
      if(sync.serverDeleted)return record;
      if(sync.blocked?.fingerprint===key&&!sync.deleted){result='blocked';return record;}
      if(remote){
        if(remote.id!==sync.cloudId||remote.revision<(sync.revision??0))throw Error('ROUTE_INVALID_RESPONSE');
        const cloudKey=fingerprintRoute(remote.document);
        if(!sync.deleted&&(key===cloudKey||key===sync.cleanFingerprint))return snapshotRecord(remote,localId);
        if(sync.cleanFingerprint===null&&sync.revision!==0||remote.revision!==sync.revision){conflict=true;result='conflict';return record;}
      }else if(sync.revision!==null&&sync.revision>0){
        if(!sync.deleted&&key===sync.cleanFingerprint)return {...record,sync:{...sync,deleted:true,serverDeleted:true,blocked:null}};
        conflict=true;result='conflict';return record;
      }
      if(sync.deleted&&!sync.cloudId)return record;
      if(sync.deleted&&sync.revision===0&&!remote)return {...record,sync:{...sync,serverDeleted:true,blocked:null}};
      const cloudId=sync.cloudId??this.port.operation(),revision=sync.revision??0;
      const pending:RoutePending=sync.deleted?{action:'delete',draft:freezeRouteDeleteDraft({operationId:this.port.operation(),routeId:cloudId,expectedRevision:revision})}:{action:'save',draft:freezeRouteDraft({operationId:this.port.operation(),routeId:cloudId,expectedRevision:revision,document:record.document})};
      result='pending';return {...record,sync:{...sync,cloudId,revision,pending,blocked:null}};
    }));
    if(conflict)this.conflict(localId,remote);return result;
  }
  private async runSync(){
    try{
      this.current();if(!this.port.hasSession()){this.publish({status:'local',error:null});return;}
      this.publish({status:'loading',error:null});await this.writes;await this.port.flush();this.current();
      const snapshots=await this.port.list();this.current();await this.adoptList(snapshots);
      const all=this.port.read().routeRecords;
      const eligible=all.filter(record=>dirty(record)&&!this.state.conflicts[record.localId]&&!(record.sync.blocked?.fingerprint===fingerprintRoute(record.document)&&!record.sync.deleted));
      const priorities=[...eligible.slice(this.dirtyOffset),...eligible.slice(0,this.dirtyOffset)];
      this.dirtyOffset=eligible.length?(this.dirtyOffset+20)%eligible.length:0;
      const clean=all.filter(record=>!dirty(record)&&!record.sync.serverDeleted&&record.sync.cloudId);
      const refresh=clean.slice(this.refreshOffset,this.refreshOffset+10);this.refreshOffset=clean.length?(this.refreshOffset+10)%clean.length:0;
      // Bound network work per pass; clean rows cannot starve dirty rows.
      const ids=[...priorities,...refresh].slice(0,20).map(record=>record.localId);let sends=0,lastError:string|null=null;
      for(const id of ids){
        if(this.state.conflicts[id])continue;
        try{for(let pass=0;pass<3;pass++){
            this.current();const record=this.port.read().routeRecords.find(row=>row.localId===id);if(!record||record.sync.serverDeleted)break;
            if(record.sync.pending){if(sends>=6)break;sends++;if(!await this.sendPending(id,record.sync.pending))break;}
            const fresh=this.port.read().routeRecords.find(row=>row.localId===id);if(!fresh||fresh.sync.serverDeleted)break;
            const remote=fresh.sync.cloudId?await this.port.fetch(fresh.sync.cloudId):null;this.current();
            if(await this.reconcile(id,remote)!=='pending')break;
          }}catch(error){this.current();lastError=error instanceof Error?error.message:'ROUTE_SYNC_UNAVAILABLE';}
      }
      const records=this.port.read().routeRecords;
      const blocked=records.find(record=>!record.sync.deleted&&record.sync.blocked?.fingerprint===fingerprintRoute(record.document));
      const conflicts=Object.keys(this.state.conflicts).length;
      this.publish({status:conflicts?'conflict':blocked||lastError?'error':records.some(dirty)?'pending':'synced',error:conflicts?this.state.error:blocked?.sync.blocked?.error??lastError});
    }catch(error){this.fail(error);}
  }
  async resolveConflict(localId:string,choice:'cloud'|'local'):Promise<boolean>{
    if(!this.state.conflicts[localId])return false;
    try{
      this.current();await this.writes;
      const before=this.port.read().routeRecords.find(record=>record.localId===localId);if(!before?.sync.cloudId)throw Error('ROUTE_LOCAL_CHANGED');
      const key=desiredKey(before),remote=await this.port.fetch(before.sync.cloudId);this.current();
      await this.commit(old=>{
        const record=old.routeRecords.find(row=>row.localId===localId);
        if(!record||desiredKey(record)!==key)throw Error('ROUTE_CONFLICT_CHANGED');
        if(choice==='cloud')return this.replace(old,localId,()=>remote?snapshotRecord(remote,localId):{...record,sync:{...record.sync,pending:null,blocked:null,deleted:true,serverDeleted:true}});
        if(!remote){
          if(record.sync.deleted)return this.replace(old,localId,()=>({...record,sync:{...record.sync,pending:null,blocked:null,serverDeleted:true}}));
          if(old.routeRecords.length>=ROUTE_MAX_RECORDS||old.routeRecords.filter(row=>!row.sync.deleted&&row.localId!==localId).length>=ROUTE_MAX_LIVE)throw Error('ROUTE_TOO_LARGE');
          const copy=routeRecord({localId:this.port.operation(),document:record.document,geometry:record.geometry});
          const tombstone={...record,sync:{...record.sync,pending:null,blocked:null,deleted:true,serverDeleted:true}};
          return {routeRecords:[...old.routeRecords.map(row=>row.localId===localId?tombstone:row),copy]};
        }
        return this.replace(old,localId,()=>({...record,sync:{...record.sync,revision:remote.revision,cleanFingerprint:fingerprintRoute(remote.document),pending:null,blocked:null}}));
      });
      const conflicts={...this.state.conflicts};delete conflicts[localId];this.publish({conflicts,status:Object.keys(conflicts).length?'conflict':'pending',error:null});
      await this.sync();return true;
    }catch(error){this.fail(error);return false;}
  }
}

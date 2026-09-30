/** A failed write stays at the head, so finalize cannot overtake raw receipts. */
export class DurableRideQueue {
 private jobs:{owner:string;work:()=>Promise<void>}[]=[];
 private running:Promise<void>|null=null;
 private closed=new Set<string>();
 get pending():number {return this.jobs.length;}
 isClosed(owner:string):boolean {return this.closed.has(owner);}
 append(owner:string,work:()=>Promise<void>):boolean {if(this.closed.has(owner))return false;this.jobs.push({owner,work});void this.drain().catch(()=>{});return true;}
 drain():Promise<void> {
  if(this.running)return this.running;
  const run=async()=>{while(this.jobs.length){const job=this.jobs[0];if(!this.closed.has(job.owner))await job.work();this.jobs.shift();}};
  this.running=Promise.resolve().then(run).finally(()=>{this.running=null;});return this.running;
 }
 async closeOwner(owner:string,remove:()=>Promise<void>):Promise<void> {
  this.closed.add(owner);
  // Keep the in-flight head intact until it settles, then prioritize removal.
  // Closed queued writes are skipped by drain and cannot recreate this owner.
  this.jobs.splice(this.running&&this.jobs.length?1:0,0,{owner:'deletion:'+owner,work:remove});
  try { await this.drain(); } catch { await this.drain(); }
 }
}

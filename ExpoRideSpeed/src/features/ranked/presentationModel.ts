export type RankedPeriod='today'|'week'|'month';
export type RankedCategory='scooter'|'motorcycle'|'car';
export type RankedClassKey='scooter:le125'|'scooter:gt125_le160'|'scooter:gt160'|'scooter:ev'|'scooter:unknown'|'motorcycle:le500'|'motorcycle:gt500_le900'|'motorcycle:gt900'|'motorcycle:ev'|'motorcycle:unknown'|'car:ev'|'car:unknown';
const hour=3600000,day=24*hour;
/** Display/test reference for the modern pilot (2020–2100). Never selects a server board using device time. */
export function bangkokPeriodBounds(instant:string,period:RankedPeriod){
 const stamp=Date.parse(instant),date=new Date(stamp);
 if(!/^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/.test(instant)||!Number.isFinite(stamp)||date.toISOString().slice(0,19)!==instant.slice(0,19)||!['today','week','month'].includes(period))throw Error('RANKED_INVALID');
 // Asia/Bangkok uses UTC+07 throughout this modern pilot. Gregorian UTC arithmetic avoids host timezone and DST.
 const local=new Date(stamp+7*hour),year=local.getUTCFullYear(),month=local.getUTCMonth(),dateOfMonth=local.getUTCDate();
 let start=Date.UTC(year,month,dateOfMonth),end:number;
 if(period==='week'){start-=((local.getUTCDay()+6)%7)*day;end=start+7*day;}
 else if(period==='month'){start=Date.UTC(year,month,1);end=Date.UTC(year,month+1,1);}
 else end=start+day;
 return {starts_at:new Date(start-7*hour).toISOString(),ends_at:new Date(end-7*hour).toISOString()};
}
/** Convenience default only: historical rows always keep their server-issued immutable class. */
export function classForVehicle(vehicle:{category:string;engine_cc:number|null;powertrain:string}|null):RankedClassKey|'unknown'{
 if(!vehicle||!['scooter','motorcycle','car'].includes(vehicle.category))return 'unknown';
 const category=vehicle.category as RankedCategory;
 if(vehicle.powertrain==='electric')return `${category}:ev`;
 const cc=vehicle.engine_cc;
 if(category==='car'||typeof cc!=='number'||!Number.isFinite(cc)||cc<=0||cc>10000)return `${category}:unknown`;
 if(category==='scooter')return `scooter:${cc<=125?'le125':cc<=160?'gt125_le160':'gt160'}`;
 return `motorcycle:${cc<=500?'le500':cc<=900?'gt500_le900':'gt900'}`;
}
export function classesForCategory(category:RankedCategory):readonly RankedClassKey[]{
 if(category==='scooter')return ['scooter:le125','scooter:gt125_le160','scooter:gt160','scooter:ev','scooter:unknown'];
 if(category==='motorcycle')return ['motorcycle:le500','motorcycle:gt500_le900','motorcycle:gt900','motorcycle:ev','motorcycle:unknown'];
 return ['car:ev','car:unknown'];
}
export function elapsedBoundsLabel(lowerMs:number,upperMs:number){
 if(!Number.isFinite(lowerMs)||!Number.isFinite(upperMs)||lowerMs<0||upperMs<lowerMs)throw Error('RANKED_INVALID');
 return `${Math.floor(lowerMs/1000)}–${Math.ceil(upperMs/1000)}`;
}
type RankAnchor={board:string;user:string;rank:number};
/** A change on another filter/account is not a rank movement. */
export function stableRankChange(previous:RankAnchor|null,current:RankAnchor):number|null{
 return previous&&previous.board===current.board&&previous.user===current.user?previous.rank-current.rank:null;
}

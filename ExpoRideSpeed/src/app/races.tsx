import {RaceHub,RaceDetail,RaceResults} from '../features/races/ui';
import {useRace} from '../state/RaceState';
import {useI18n,type TranslationKey} from '../lib/i18n';
export default function RaceRoute(){const {port,view}=useRace(),{t}=useI18n();const translate=(key:string,values?:Record<string,string|number>)=>t(key as TranslationKey,values);const key=`${port.ownerId}:${port.generation}`;return view==='results'?<RaceResults key={key} port={port} t={translate}/>:view==='detail'?<RaceDetail key={key} port={port} t={translate}/>:<RaceHub key={key} port={port} t={translate} startCreate={view==='rematch'}/>;}

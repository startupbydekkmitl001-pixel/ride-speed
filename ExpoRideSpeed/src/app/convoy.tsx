import ConvoyScreen from '../features/live/ConvoyScreen';
import {useAuth} from '../state/AuthState';
export default function ConvoyRoute(){const {scope}=useAuth();return <ConvoyScreen key={scope.generation}/>;}

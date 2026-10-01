import InvitationsScreen from '../features/social/InvitationsScreen';
import {useAuth} from '../state/AuthState';
export default function InvitationsRoute(){const {scope}=useAuth();return <InvitationsScreen key={scope.generation}/>;}

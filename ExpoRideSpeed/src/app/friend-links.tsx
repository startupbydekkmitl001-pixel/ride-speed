import FriendLinksScreen from '../features/live/FriendLinksScreen';
import {useAuth} from '../state/AuthState';
export default function FriendLinksRoute(){const {scope}=useAuth();return <FriendLinksScreen key={scope.generation}/>;}

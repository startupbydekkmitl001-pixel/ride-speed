import FriendsScreen from '../features/social/FriendsScreen';
import {useAuth} from '../state/AuthState';
export default function FriendsRoute(){const {scope}=useAuth();return <FriendsScreen key={scope.generation}/>;}

import type {ReactNode} from 'react';
import {useSocial} from './SocialState';
export type {FriendRow as Friend} from '../features/social/types';
/** Legacy readers share SocialProvider; this facade owns no transport or timers. */
export function OnlineProvider({children}:{children:ReactNode}){return children;}
export const useOnline=()=>useSocial();

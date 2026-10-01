import {router} from 'expo-router';
import {Button} from '../../components/ui';
import {useI18n,type TranslationKey} from '../../lib/i18n';
import {useCommunityHost} from './useCommunityHost';
/** Navigation uses the same retained-callback activity and owner fence as the
 * private management host; opening it never requests post content. */
export function CommunityManagePostsButton(){const h=useCommunityHost(),{t}=useI18n();return <Button secondary icon="documents-outline" label={t('m7.owner.title' as TranslationKey)} disabled={!h.base.gate.focused||!h.base.gate.foreground||h.base.gate.moving} onPress={()=>{if(h.base.current(h.base.generation)&&!h.latest.current.moving)router.push('/community-posts');}}/>;}

import * as SecureStore from 'expo-secure-store';
import {Platform} from 'react-native';
import {isAccountCurrent} from '../../state/AuthState';
import {LiveSecretStore,type SecretStorage} from './LiveSecretStore';

const options={keychainAccessible:SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY};
const port:SecretStorage=Platform.OS==='web'?{
 async getItem(key){return sessionStorage.getItem(key);},
 async setItem(key,value){sessionStorage.setItem(key,value);},
 async removeItem(key){sessionStorage.removeItem(key);},
}:{
 getItem:key=>SecureStore.getItemAsync(key,options),
 setItem:(key,value)=>SecureStore.setItemAsync(key,value,options),
 removeItem:key=>SecureStore.deleteItemAsync(key,options),
};
/** Preview bytes last only for the browser session; native bytes use Keychain. */
export const liveSecrets=new LiveSecretStore(port,isAccountCurrent);
export const liveSecretPersistence=Platform.OS==='web'?'session' as const:'secure' as const;

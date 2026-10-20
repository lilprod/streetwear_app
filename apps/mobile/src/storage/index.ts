import { createMMKV } from 'react-native-mmkv';
import type { KeyValueStorage } from './storage';

export * from './storage';

let instance: KeyValueStorage | null = null;

export function getStorage(): KeyValueStorage {
  if (!instance) {
    const mmkv = createMMKV({ id: 'streetwear' });
    instance = {
      getString: (k) => mmkv.getString(k),
      set: (k, v) => mmkv.set(k, v),
      remove: (k) => {
        mmkv.remove(k);
      },
      keys: () => mmkv.getAllKeys(),
    };
  }
  return instance;
}

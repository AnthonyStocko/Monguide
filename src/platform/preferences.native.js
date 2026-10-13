import { Preferences } from '@capacitor/preferences';

export async function getItem(key) {
  return (await Preferences.get({ key })).value;
}

export async function setItem(key, value) {
  await Preferences.set({ key, value });
}

export async function removeItem(key) {
  await Preferences.remove({ key });
}

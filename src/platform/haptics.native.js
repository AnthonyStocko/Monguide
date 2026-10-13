import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

export const hapticsAvailable = true;

export function impactLight() {
  return Haptics.impact({ style: ImpactStyle.Light });
}

export function notifySuccess() {
  return Haptics.notification({ type: NotificationType.Success });
}

export function notifyError() {
  return Haptics.notification({ type: NotificationType.Error });
}

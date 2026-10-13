const unavailable = async () => {
  throw new Error('unavailable');
};

export const LocalNotifications = {
  checkPermissions: unavailable,
  requestPermissions: unavailable,
  checkExactNotificationSetting: unavailable,
  changeExactNotificationSetting: unavailable,
  createChannel: async () => {},
  schedule: async () => {},
  cancel: async () => {},
  getPending: async () => ({ notifications: [] }),
  addListener: async () => ({ remove: async () => {} })
};

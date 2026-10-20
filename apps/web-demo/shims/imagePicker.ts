export const requestCameraPermissionsAsync = (): Promise<{ granted: boolean }> =>
  Promise.resolve({ granted: false });
export const launchCameraAsync = (): Promise<{ canceled: true; assets: null }> =>
  Promise.resolve({ canceled: true, assets: null });

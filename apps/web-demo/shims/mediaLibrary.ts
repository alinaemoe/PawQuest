// No photo library in the browser: the demo has no photos to look through.
export type GranularPermission = 'photo' | 'video' | 'audio';
export const SortBy = { creationTime: 'creationTime' } as const;
const none = { granted: false, canAskAgain: false, status: 'denied' } as const;
export const requestPermissionsAsync = (): Promise<typeof none> => Promise.resolve(none);
export const getPermissionsAsync = (): Promise<typeof none> => Promise.resolve(none);
export const getAssetsAsync = (): Promise<{
  assets: never[];
  hasNextPage: false;
  endCursor: string;
}> => Promise.resolve({ assets: [], hasNextPage: false, endCursor: '' });
export const getAssetInfoAsync = (): Promise<null> => Promise.resolve(null);
export const createAssetAsync = (): Promise<never> => Promise.reject(new Error('no media library'));

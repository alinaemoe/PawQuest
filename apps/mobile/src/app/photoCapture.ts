import { Directory, File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library/legacy';

export interface CapturedPhoto {
  readonly uri: string;
  readonly width: number;
  readonly height: number;
  readonly bytes: number | null;
}

export type CaptureResult =
  | { readonly kind: 'photo'; readonly photo: CapturedPhoto }
  | { readonly kind: 'denied' }
  | { readonly kind: 'cancelled' };

/**
 * Opens the camera. The picture is saved to the phone's gallery and only a link to it is kept; if
 * the gallery cannot be written to, a copy in the app's own folder keeps the picture from being lost.
 */
export async function takePhoto(id: string): Promise<CaptureResult> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    return { kind: 'denied' };
  }
  const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 });
  const asset = result.canceled ? undefined : result.assets[0];
  if (asset === undefined) {
    return { kind: 'cancelled' };
  }
  try {
    const access = await MediaLibrary.requestPermissionsAsync(false, ['photo']);
    if (access.granted) {
      const saved = await MediaLibrary.createAssetAsync(asset.uri);
      return {
        kind: 'photo',
        photo: { uri: saved.uri, width: saved.width, height: saved.height, bytes: null },
      };
    }
  } catch {
    // fall through to the private copy
  }
  const folder = new Directory(Paths.document, 'photos');
  folder.create({ intermediates: true, idempotent: true });
  const target = new File(folder, `${id}.jpg`);
  await new File(asset.uri).copy(target);
  return {
    kind: 'photo',
    photo: { uri: target.uri, width: asset.width, height: asset.height, bytes: target.size },
  };
}

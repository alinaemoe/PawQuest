import { Directory, File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';

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

/** Opens the camera, then keeps a copy of the picture in the app's own folder. */
export async function takePhoto(id: string): Promise<CaptureResult> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    return { kind: 'denied' };
  }
  const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7 });
  const asset = result.canceled ? undefined : result.assets[0];
  if (asset === undefined) {
    return { kind: 'cancelled' };
  }
  const folder = new Directory(Paths.document, 'photos');
  folder.create({ intermediates: true, idempotent: true });
  const target = new File(folder, `${id}.jpg`);
  await new File(asset.uri).copy(target);
  return {
    kind: 'photo',
    photo: {
      uri: target.uri,
      width: asset.width,
      height: asset.height,
      bytes: target.size,
    },
  };
}

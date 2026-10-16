import { Directory, File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';

export interface CapturedPhoto {
  readonly uri: string;
  readonly width: number;
  readonly height: number;
  readonly bytes: number | null;
}

export interface PickedPhoto extends CapturedPhoto {
  /** When the picture was taken (from the file's own data), or null when it is not there. */
  readonly takenAt: number | null;
}

/** Camera time like 2026:10:16 10:51:03 (local, no zone) as a moment on this phone's clock. */
export function parseExifTime(text: unknown): number | null {
  if (typeof text !== 'string') {
    return null;
  }
  const m = /^(\d{4})[:-](\d{2})[:-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(text);
  if (m === null) {
    return null;
  }
  const [y, mo, d, h, mi, s] = m.slice(1).map(Number);
  const ts = new Date(y ?? 0, (mo ?? 1) - 1, d ?? 1, h ?? 0, mi ?? 0, s ?? 0).getTime();
  return Number.isNaN(ts) ? null : ts;
}

/** Lets the owner choose pictures from the gallery; each is copied into the app's own folder. */
export async function pickFromGallery(newId: () => string): Promise<PickedPhoto[]> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    exif: true,
    quality: 0.8,
  });
  if (result.canceled) {
    return [];
  }
  const folder = new Directory(Paths.document, 'photos');
  folder.create({ intermediates: true, idempotent: true });
  const picked: PickedPhoto[] = [];
  for (const asset of result.assets) {
    const target = new File(folder, `${newId()}.jpg`);
    await new File(asset.uri).copy(target);
    const exif = asset.exif as Record<string, unknown> | null | undefined;
    picked.push({
      uri: target.uri,
      width: asset.width,
      height: asset.height,
      bytes: target.size,
      takenAt: parseExifTime(exif?.['DateTimeOriginal'] ?? exif?.['DateTime']),
    });
  }
  return picked;
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

// The few legacy calls of the report: read a font as base64, copy a file. Memory only.
export const EncodingType = { Base64: 'base64', UTF8: 'utf8' } as const;
export const cacheDirectory: string | null = 'web-cache/';
export async function readAsStringAsync(uri: string): Promise<string> {
  const bytes = new Uint8Array(await (await fetch(uri)).arrayBuffer());
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
}
export const copyAsync = (): Promise<void> => Promise.resolve();

/** "Share" in a browser is a download of the file (or the share sheet of a phone browser). */
export function shareAsync(
  uri: string,
  options?: { readonly mimeType?: string; readonly dialogTitle?: string },
): Promise<void> {
  if (typeof document === 'undefined') {
    return Promise.resolve();
  }
  const link = document.createElement('a');
  link.href = uri;
  link.download = decodeURIComponent(uri.split('/').pop() ?? 'pawquest-file');
  if (options?.mimeType !== undefined) {
    link.type = options.mimeType;
  }
  document.body.appendChild(link);
  link.click();
  link.remove();
  return Promise.resolve();
}
export const isAvailableAsync = (): Promise<boolean> => Promise.resolve(true);

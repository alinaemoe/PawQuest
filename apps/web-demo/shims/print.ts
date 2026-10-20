/** On the web the report is the HTML itself: opened in a new tab, ready for the browser's "Save as PDF". */
export function printToFileAsync(options: { readonly html: string }): Promise<{
  readonly uri: string;
  readonly numberOfPages: number;
}> {
  const blob = new Blob([options.html], { type: 'text/html' });
  const uri = URL.createObjectURL(blob);
  if (typeof window !== 'undefined') {
    window.open(uri, '_blank');
  }
  return Promise.resolve({ uri, numberOfPages: 1 });
}

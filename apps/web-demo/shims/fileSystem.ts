// Files of the web demo live in memory; a file written for "Share" becomes a download (sharing.ts).
export class Directory {
  readonly uri: string;
  constructor(...parts: readonly (string | Directory)[]) {
    this.uri = parts.map((p) => (typeof p === 'string' ? p : p.uri)).join('/');
  }
}

export const Paths = { cache: new Directory('web-cache'), document: new Directory('web-document') };

export class File {
  readonly name: string;
  private chunks: string[] = [];
  private url: string | null = null;
  constructor(...parts: readonly (string | Directory)[]) {
    this.name = parts.map((p) => (typeof p === 'string' ? p : p.uri)).join('/');
  }
  get exists(): boolean {
    return this.chunks.length > 0;
  }
  get size(): number {
    return this.chunks.join('').length;
  }
  get uri(): string {
    this.url ??= URL.createObjectURL(new Blob(this.chunks));
    return `${this.url}#${encodeURIComponent(this.name.split('/').pop() ?? 'file')}`;
  }
  create(): void {
    this.chunks = [''];
  }
  delete(): void {
    this.chunks = [];
    this.url = null;
  }
  write(text: string, options?: { readonly append?: boolean }): void {
    this.chunks = options?.append === true ? [...this.chunks, text] : [text];
    this.url = null;
  }
  copy(): Promise<void> {
    return Promise.resolve();
  }
  /** A file picked in the browser (the backup restore). */
  static pickFileAsync(): Promise<{ readonly result: { text(): Promise<string> } }> {
    return new Promise((resolve, reject) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.onchange = () => {
        const file = input.files?.[0];
        if (file === undefined) {
          reject(new Error('cancelled'));
          return;
        }
        resolve({ result: { text: () => file.text() } });
      };
      input.click();
    });
  }
}

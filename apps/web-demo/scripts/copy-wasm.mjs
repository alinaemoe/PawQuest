// Puts the SQLite engine (WebAssembly) where the web server can hand it out.
import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const source = join(dirname(require.resolve('sql.js')), 'sql-wasm.wasm');
mkdirSync(join(here, '..', 'public'), { recursive: true });
copyFileSync(source, join(here, '..', 'public', 'sql-wasm.wasm'));
console.log('sql-wasm.wasm copied');

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assets } from './assets.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const contents = new Map(await Promise.all(assets.map(async file => [file, await readFile(resolve(root, file))])));
const hash = createHash('sha256');
for (const [file, bytes] of contents) if (file !== 'sw.js') hash.update(bytes);
const version = hash.digest('hex').slice(0, 16);
for (const [file, bytes] of contents) {
  const destination = resolve(root, 'dist', file);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, file === 'sw.js' ? bytes.toString().replace('${prefix}v1', '${prefix}' + version) : bytes);
}
console.log(`Built ${assets.length} public assets into dist/. No personal data or development tools included.`);

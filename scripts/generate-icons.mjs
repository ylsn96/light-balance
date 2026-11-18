import { writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]);
  const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}
const curves = [[145, 43, 75, 38, 37, 76, 51, 120], [51, 120, 65, 164, 149, 158, 145, 43]];
const polygon = curves.flatMap(c => Array.from({ length: 50 }, (_, i) => {
  const t = i / 49, u = 1 - t;
  return [u ** 3 * c[0] + 3 * u * u * t * c[2] + 3 * u * t * t * c[4] + t ** 3 * c[6], u ** 3 * c[1] + 3 * u * u * t * c[3] + 3 * u * t * t * c[5] + t ** 3 * c[7]];
}));
function color(x, y) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i], [xj, yj] = polygon[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  const t = Math.max(0, Math.min(1, ((x - 43) * 71 + (y - 153) * -72) / (71 ** 2 + 72 ** 2)));
  const onStem = Math.hypot(x - (43 + 71 * t), y - (153 - 72 * t)) < 5;
  return inside && !onStem ? [229, 240, 215] : [36, 117, 93];
}
for (const size of [192, 512]) {
  const pixels = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const samples = [[.25, .25], [.75, .25], [.25, .75], [.75, .75]].map(([dx, dy]) => color((x + dx) * 192 / size, (y + dy) * 192 / size));
    for (let c = 0; c < 3; c++) pixels[y * (size * 3 + 1) + 1 + x * 3 + c] = Math.round(samples.reduce((sum, rgb) => sum + rgb[c], 0) / 4);
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 2;
  await writeFile(new URL(`../icon-${size}.png`, import.meta.url), Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))]));
}

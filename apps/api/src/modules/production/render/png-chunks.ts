import { crc32 } from 'node:zlib';

const SIGNATURE_LENGTH = 8;

/** Insère un chunk tEXt (latin1) juste avant le premier IDAT. */
export function embedTextChunk(png: Buffer, keyword: string, text: string): Buffer {
  const body = Buffer.concat([
    Buffer.from(keyword, 'latin1'),
    Buffer.from([0]),
    Buffer.from(text, 'latin1'),
  ]);
  const type = Buffer.from('tEXt', 'latin1');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(body.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([type, body])));
  const chunk = Buffer.concat([length, type, body, crc]);
  let offset = SIGNATURE_LENGTH;
  while (offset < png.length) {
    const len = png.readUInt32BE(offset);
    if (png.toString('latin1', offset + 4, offset + 8) === 'IDAT') {
      return Buffer.concat([png.subarray(0, offset), chunk, png.subarray(offset)]);
    }
    offset += 12 + len;
  }
  return png;
}

export function readTextChunk(png: Buffer, keyword: string): string | undefined {
  let offset = SIGNATURE_LENGTH;
  while (offset < png.length) {
    const len = png.readUInt32BE(offset);
    if (png.toString('latin1', offset + 4, offset + 8) === 'tEXt') {
      const data = png.toString('latin1', offset + 8, offset + 8 + len);
      const [k, ...rest] = data.split('\0');
      if (k === keyword) return rest.join('\0');
    }
    offset += 12 + len;
  }
  return undefined;
}

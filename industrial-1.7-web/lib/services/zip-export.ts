export interface ZipEntry { name: string; bytes: () => Promise<Buffer> }

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
export function crc32(bytes: Uint8Array) {
  let value = 0xffffffff;
  for (const byte of bytes) value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

/** ZIP STORE streaming keeps one image in memory, with standard CRC and UTF-8 names. */
export function zipStream(entries: ZipEntry[], onDone: () => void = () => {}): ReadableStream<Uint8Array> {
  if (entries.length > 65_535) throw new Error("导出文件数量过多");
  async function* chunks() {
    const central: Buffer[] = [];
    let offset = 0;
    for (const entry of entries) {
      if (!entry.name || entry.name.startsWith("/") || entry.name.split(/[\\/]/).includes("..")) throw new Error("导出文件名称无效");
      const name = Buffer.from(entry.name, "utf8");
      const bytes = await entry.bytes();
      if (bytes.length > 0xffffffff || offset + bytes.length + name.length + 30 > 0xffffffff) throw new Error("导出超过 ZIP 4GB 上限，请分批导出");
      const crc = crc32(bytes);
      const local = Buffer.alloc(30);
      local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x800, 6);
      local.writeUInt16LE(33, 12);
      local.writeUInt32LE(crc, 14); local.writeUInt32LE(bytes.length, 18); local.writeUInt32LE(bytes.length, 22); local.writeUInt16LE(name.length, 26);
      const directory = Buffer.alloc(46);
      directory.writeUInt32LE(0x02014b50, 0); directory.writeUInt16LE(20, 4); directory.writeUInt16LE(20, 6); directory.writeUInt16LE(0x800, 8);
      directory.writeUInt16LE(33, 14);
      directory.writeUInt32LE(crc, 16); directory.writeUInt32LE(bytes.length, 20); directory.writeUInt32LE(bytes.length, 24); directory.writeUInt16LE(name.length, 28); directory.writeUInt32LE(offset, 42);
      central.push(Buffer.concat([directory, name]));
      yield Buffer.concat([local, name]);
      for (let index = 0; index < bytes.length; index += 64 * 1024) yield bytes.subarray(index, index + 64 * 1024);
      offset += local.length + name.length + bytes.length;
    }
    const directory = Buffer.concat(central);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
    end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
    yield directory; yield end;
  }
  const iterator = chunks();
  let finished = false;
  const finish = () => { if (!finished) { finished = true; onDone(); } };
  return new ReadableStream({
    async pull(controller) {
      try { const next = await iterator.next(); if (next.done) { finish(); controller.close(); } else controller.enqueue(next.value); }
      catch (error) { finish(); controller.error(error); }
    },
    async cancel() { try { await iterator.return(undefined); } finally { finish(); } },
  });
}

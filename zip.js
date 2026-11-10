/* Export ZIP sans compression (les vidéos sont déjà compressées).
   Les fichiers ne sont jamais chargés en entier en mémoire : seul le CRC est lu par morceaux. */
const Zip = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  function update(c, u8) {
    for (let i = 0; i < u8.length; i++) c = table[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
    return c;
  }
  async function crc32Blob(blob, onProgress) {
    let c = 0xFFFFFFFF;
    const CH = 4 * 1024 * 1024;
    for (let off = 0; off < blob.size; off += CH) {
      c = update(c, new Uint8Array(await blob.slice(off, off + CH).arrayBuffer()));
      if (onProgress) onProgress(Math.min(1, (off + CH) / blob.size));
    }
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  const dosTime = d => ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xFFFF;
  const dosDate = d => (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF;

  // entries: [{name, blob, crc, date}]
  function build(entries) {
    const enc = new TextEncoder();
    const parts = [], central = [];
    let offset = 0;
    for (const e of entries) {
      const name = enc.encode(e.name), size = e.blob.size, t = dosTime(e.date), d = dosDate(e.date);
      const h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true);
      h.setUint16(8, 0, true); h.setUint16(10, t, true); h.setUint16(12, d, true);
      h.setUint32(14, e.crc, true); h.setUint32(18, size, true); h.setUint32(22, size, true);
      h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
      parts.push(h.buffer, name, e.blob);
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
      c.setUint16(10, 0, true); c.setUint16(12, t, true); c.setUint16(14, d, true); c.setUint32(16, e.crc, true);
      c.setUint32(20, size, true); c.setUint32(24, size, true); c.setUint16(28, name.length, true);
      c.setUint16(30, 0, true); c.setUint16(32, 0, true); c.setUint16(34, 0, true); c.setUint16(36, 0, true);
      c.setUint32(38, 0, true); c.setUint32(42, offset, true);
      central.push(c.buffer, name);
      offset += 30 + name.length + size;
    }
    const cdSize = central.reduce((a, p) => a + p.byteLength, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(4, 0, true); end.setUint16(6, 0, true);
    end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true);
    end.setUint32(12, cdSize, true); end.setUint32(16, offset, true); end.setUint16(20, 0, true);
    return new Blob([...parts, ...central, end.buffer], { type: 'application/zip' });
  }
  return { crc32Blob, crc32Bytes: u8 => (update(0xFFFFFFFF, u8) ^ 0xFFFFFFFF) >>> 0, build };
})();

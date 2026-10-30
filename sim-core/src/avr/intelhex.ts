/** Parse Intel HEX text into a flash image (bytes). Throws with a readable message on bad input. */
export function parseIntelHex(text: string, flashBytes = 0x8000): Uint8Array {
  const flash = new Uint8Array(flashBytes);
  let base = 0;
  let sawEof = false;
  let sawData = false;
  const lines = text.split(/\r?\n/);
  lines.forEach((raw, ln) => {
    const line = raw.trim();
    if (!line || sawEof) return;
    if (line[0] !== ':') throw new Error(`Line ${ln + 1}: expected ':' at the start of each record`);
    const bytes: number[] = [];
    for (let i = 1; i + 1 < line.length + 1; i += 2) {
      const b = parseInt(line.substr(i, 2), 16);
      if (Number.isNaN(b)) throw new Error(`Line ${ln + 1}: invalid hex digits`);
      bytes.push(b);
    }
    if (bytes.length < 5) throw new Error(`Line ${ln + 1}: record too short`);
    const sum = bytes.reduce((a, b) => (a + b) & 0xff, 0);
    if (sum !== 0) throw new Error(`Line ${ln + 1}: checksum mismatch`);
    const count = bytes[0];
    const addr = (bytes[1] << 8) | bytes[2];
    const type = bytes[3];
    const data = bytes.slice(4, 4 + count);
    switch (type) {
      case 0:
        for (let i = 0; i < data.length; i++) {
          const a = base + addr + i;
          if (a >= flashBytes) throw new Error(`Line ${ln + 1}: address 0x${a.toString(16)} is beyond the 32 KB flash`);
          flash[a] = data[i];
        }
        sawData = true;
        break;
      case 1:
        sawEof = true;
        break;
      case 2:
        base = ((data[0] << 8) | data[1]) << 4;
        break;
      case 4:
        base = ((data[0] << 8) | data[1]) << 16;
        break;
      default:
        break; // start-address records are ignored
    }
  });
  if (!sawData) throw new Error('The file contains no program data');
  return flash;
}

/** Encode a flash image (bytes) as Intel HEX, 16 bytes per record. */
export function toIntelHex(bytes: Uint8Array, length = bytes.length): string {
  const lines: string[] = [];
  const hx = (n: number) => n.toString(16).toUpperCase().padStart(2, '0');
  for (let addr = 0; addr < length; addr += 16) {
    const chunk = Array.from(bytes.slice(addr, Math.min(addr + 16, length)));
    const rec = [chunk.length, (addr >> 8) & 0xff, addr & 0xff, 0, ...chunk];
    const sum = (0x100 - (rec.reduce((a, b) => a + b, 0) & 0xff)) & 0xff;
    lines.push(':' + rec.map(hx).join('') + hx(sum));
  }
  lines.push(':00000001FF');
  return lines.join('\n');
}

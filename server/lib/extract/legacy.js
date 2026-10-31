// Formatos antigos do Office (.doc do Word 97–2003 e .xls do Excel 97–2003).
// Os dois ficam dentro de um "arquivo composto" (CFB); aqui lemos só o texto.
const { excelDate } = require('./office');

const FREE = 0xFFFFFFFF; const END = 0xFFFFFFFE;

function readCfb(buf) {
  if (buf.length < 512 || buf.readUInt32LE(0) !== 0xE011CFD0 || buf.readUInt32LE(4) !== 0xE11AB1A1) throw new Error('Arquivo do Office antigo inválido.');
  const ss = 1 << buf.readUInt16LE(0x1E);
  const mss = 1 << buf.readUInt16LE(0x20);
  const cutoff = buf.readUInt32LE(0x38);
  const sector = (n) => buf.subarray(512 + n * ss, 512 + (n + 1) * ss);

  // tabela de alocação (FAT), incluindo a continuação em setores DIFAT
  const difat = [];
  for (let i = 0; i < 109; i++) { const v = buf.readUInt32LE(0x4C + i * 4); if (v !== FREE) difat.push(v); }
  let d = buf.readUInt32LE(0x44); let guard = 0;
  while (d !== END && d !== FREE && guard++ < 10000) {
    const s = sector(d);
    for (let i = 0; i < ss / 4 - 1; i++) { const v = s.readUInt32LE(i * 4); if (v !== FREE) difat.push(v); }
    d = s.readUInt32LE(ss - 4);
  }
  const fat = [];
  for (const f of difat) { const s = sector(f); for (let i = 0; i < ss / 4; i++) fat.push(s.readUInt32LE(i * 4)); }
  const chain = (start, table) => { const out = []; let n = start; let g = 0; while (n !== END && n !== FREE && n < table.length && g++ < 1e6) { out.push(n); n = table[n]; } return out; };
  const readChain = (start) => Buffer.concat(chain(start, fat).map(sector));

  const dirBuf = readChain(buf.readUInt32LE(0x30));
  const entries = [];
  for (let p = 0; p + 128 <= dirBuf.length; p += 128) {
    const nameLen = dirBuf.readUInt16LE(p + 64);
    entries.push({ name: dirBuf.toString('utf16le', p, p + Math.max(0, nameLen - 2)), type: dirBuf[p + 66], start: dirBuf.readUInt32LE(p + 116), size: dirBuf.readUInt32LE(p + 120) });
  }
  const root = entries[0];
  const miniStream = root ? readChain(root.start) : Buffer.alloc(0);
  const miniFat = [];
  const mf = readChain(buf.readUInt32LE(0x3C));
  for (let i = 0; i + 4 <= mf.length; i += 4) miniFat.push(mf.readUInt32LE(i));

  return {
    stream(name) {
      const e = entries.find((x) => x.type === 2 && x.name === name);
      if (!e) return null;
      if (e.size < cutoff) return Buffer.concat(chain(e.start, miniFat).map((n) => miniStream.subarray(n * mss, (n + 1) * mss))).subarray(0, e.size);
      return readChain(e.start).subarray(0, e.size);
    },
  };
}

// ---------------------------------------------------------------- Word 97–2003 (.doc)
const CP1252 = { 0x80: '€', 0x82: '‚', 0x83: 'ƒ', 0x84: '„', 0x85: '…', 0x86: '†', 0x87: '‡', 0x88: 'ˆ', 0x89: '‰', 0x8A: 'Š', 0x8B: '‹', 0x8C: 'Œ', 0x8E: 'Ž', 0x91: '‘', 0x92: '’', 0x93: '“', 0x94: '”', 0x95: '•', 0x96: '–', 0x97: '—', 0x98: '˜', 0x99: '™', 0x9A: 'š', 0x9B: '›', 0x9C: 'œ', 0x9E: 'ž', 0x9F: 'Ÿ' };
const cp1252 = (b) => { let s = ''; for (const c of b) s += CP1252[c] || String.fromCharCode(c); return s; };

function docText(buf) {
  const cfb = readCfb(buf);
  const wd = cfb.stream('WordDocument');
  if (!wd || wd.readUInt16LE(0) !== 0xA5EC) throw new Error('Documento do Word inválido.');
  const flags = wd.readUInt16LE(0x0A);
  const table = cfb.stream(flags & 0x0200 ? '1Table' : '0Table');
  // posição das estruturas variáveis do cabeçalho (FIB)
  let p = 32;
  const csw = wd.readUInt16LE(p); p += 2 + csw * 2;
  const cslw = wd.readUInt16LE(p); const lw = p + 2; p += 2 + cslw * 4;
  const ccpText = wd.readInt32LE(lw + 3 * 4);
  p += 2; // cbRgFcLcb
  const fcClx = wd.readUInt32LE(p + 33 * 8);
  const lcbClx = wd.readUInt32LE(p + 33 * 8 + 4);
  if (!table || !lcbClx) throw new Error('Documento do Word sem texto legível.');
  const clx = table.subarray(fcClx, fcClx + lcbClx);
  let i = 0;
  while (clx[i] === 0x01) i += 3 + clx.readUInt16LE(i + 1); // ignora Prc
  if (clx[i] !== 0x02) throw new Error('Documento do Word sem texto legível.');
  const lcb = clx.readUInt32LE(i + 1); const plc = clx.subarray(i + 5, i + 5 + lcb);
  const n = (lcb - 4) / 12;
  let text = '';
  for (let k = 0; k < n && text.length < ccpText; k++) {
    const cpStart = plc.readUInt32LE(k * 4); const cpEnd = plc.readUInt32LE((k + 1) * 4);
    const fcRaw = plc.readUInt32LE((n + 1) * 4 + k * 8 + 2);
    const compressed = (fcRaw & 0x40000000) !== 0;
    const fc = fcRaw & 0x3FFFFFFF;
    const len = cpEnd - cpStart;
    text += compressed ? cp1252(wd.subarray(fc / 2, fc / 2 + len)) : wd.toString('utf16le', fc, fc + len * 2);
  }
  return text.slice(0, ccpText)
    .replace(/\x13[^\x14\x15]*\x14?/g, '').replace(/\x15/g, '') // campos: mantém só o resultado
    .replace(/\x07\x07/g, '\n').replace(/\x07/g, '\t')          // fim de célula / linha de tabela
    .replace(/[\r\x0b\x0c]/g, '\n').replace(/[\x00-\x08\x0e-\x1f]/g, '');
}

// ---------------------------------------------------------------- Excel 97–2003 (.xls)
function xlsRows(buf) {
  const cfb = readCfb(buf);
  const wb = cfb.stream('Workbook') || cfb.stream('Book');
  if (!wb) throw new Error('Planilha do Excel inválida.');
  const records = [];
  for (let p = 0; p + 4 <= wb.length;) {
    const type = wb.readUInt16LE(p); const len = wb.readUInt16LE(p + 2);
    records.push({ type, data: wb.subarray(p + 4, p + 4 + len) });
    p += 4 + len;
  }
  // formatos de data (FORMAT 0x041E e XF 0x00E0)
  const fmts = new Map(); const xfs = [];
  const sheets = []; let sst = []; let cur = null; let pendingStr = null;
  const rk = (v) => { let n = v & 2 ? (v >> 2) : new DataView(new Uint32Array([0, v & 0xFFFFFFFC]).buffer).getFloat64(0, true); if (v & 1) n /= 100; return n; };
  const isDate = (xf) => { const id = xfs[xf] ?? 0; return (id >= 14 && id <= 22) || (fmts.has(id) && /[dy]/i.test(fmts.get(id).replace(/"[^"]*"|\[[^\]]*\]/g, ''))); };
  const numStr = (n, xf) => (isDate(xf) && n > 20000 && n < 80000 ? excelDate(n) : String(Number(n.toPrecision(12))).replace('.', ','));
  const put = (r, c, v) => { if (!cur) return; (cur.rows[r] ||= [])[c] = v; };

  // string do formato XLUnicodeString, possivelmente continuada em CONTINUE
  function readStrings(chunks, count) {
    const out = []; let ci = 0; let buf2 = chunks[0]; let p = 8;
    const need = (k) => { if (p + k > buf2.length && ci + 1 < chunks.length) { buf2 = chunks[++ci]; p = 0; return true; } return false; };
    for (let s = 0; s < count && buf2; s++) {
      if (p + 3 > buf2.length) { if (!need(3)) break; }
      const cch = buf2.readUInt16LE(p); let flags = buf2[p + 2]; p += 3;
      let runs = 0; let ext = 0;
      if (flags & 0x08) { runs = buf2.readUInt16LE(p); p += 2; }
      if (flags & 0x04) { ext = buf2.readUInt32LE(p); p += 4; }
      let str = ''; let left = cch;
      while (left > 0) {
        const wide = flags & 0x01; const avail = Math.floor((buf2.length - p) / (wide ? 2 : 1));
        const take = Math.min(left, avail);
        str += wide ? buf2.toString('utf16le', p, p + take * 2) : cp1252(buf2.subarray(p, p + take));
        p += take * (wide ? 2 : 1); left -= take;
        if (left > 0) { if (ci + 1 >= chunks.length) break; buf2 = chunks[++ci]; flags = buf2[0]; p = 1; }
      }
      let skip = runs * 4 + ext;
      while (skip > 0) { const k = Math.min(skip, buf2.length - p); p += k; skip -= k; if (skip > 0) { if (ci + 1 >= chunks.length) break; buf2 = chunks[++ci]; p = 0; } }
      out.push(str);
    }
    return out;
  }

  for (let i = 0; i < records.length; i++) {
    const { type, data } = records[i];
    if (type === 0x041E) { const id = data.readUInt16LE(0); const cch = data.readUInt16LE(2); const wide = data[4] & 1; fmts.set(id, wide ? data.toString('utf16le', 5, 5 + cch * 2) : cp1252(data.subarray(5, 5 + cch))); }
    else if (type === 0x00E0) xfs.push(data.readUInt16LE(2));
    else if (type === 0x00FC) {
      const chunks = [data]; while (records[i + 1]?.type === 0x003C) chunks.push(records[++i].data);
      sst = readStrings(chunks, data.readUInt32LE(4));
    } else if (type === 0x0809) {
      const dt = data.readUInt16LE(2);
      if (dt === 0x0010) { cur = { name: `Planilha ${sheets.length + 1}`, rows: [] }; sheets.push(cur); } else cur = null;
    } else if (type === 0x00FD) put(data.readUInt16LE(0), data.readUInt16LE(2), sst[data.readUInt32LE(6)] ?? '');
    else if (type === 0x0203) put(data.readUInt16LE(0), data.readUInt16LE(2), numStr(data.readDoubleLE(6), data.readUInt16LE(4)));
    else if (type === 0x027E) put(data.readUInt16LE(0), data.readUInt16LE(2), numStr(rk(data.readInt32LE(6)), data.readUInt16LE(4)));
    else if (type === 0x00BD) {
      const r = data.readUInt16LE(0); const c0 = data.readUInt16LE(2); const n = (data.length - 6) / 6;
      for (let k = 0; k < n; k++) put(r, c0 + k, numStr(rk(data.readInt32LE(4 + k * 6 + 2)), data.readUInt16LE(4 + k * 6)));
    } else if (type === 0x0204) {
      const cch = data.readUInt16LE(6); const wide = data[8] & 1;
      put(data.readUInt16LE(0), data.readUInt16LE(2), wide ? data.toString('utf16le', 9, 9 + cch * 2) : cp1252(data.subarray(9, 9 + cch)));
    } else if (type === 0x0006) {
      // FÓRMULA: só o resultado numérico; resultado em texto vem no registro STRING seguinte
      const r = data.readUInt16LE(0); const c = data.readUInt16LE(2);
      if (data.readUInt16LE(12) !== 0xFFFF) put(r, c, numStr(data.readDoubleLE(6), data.readUInt16LE(4)));
      else if (data[6] === 0) pendingStr = [r, c];
    } else if (type === 0x0207 && pendingStr) {
      const cch = data.readUInt16LE(0); const wide = data[2] & 1;
      put(pendingStr[0], pendingStr[1], wide ? data.toString('utf16le', 3, 3 + cch * 2) : cp1252(data.subarray(3, 3 + cch)));
      pendingStr = null;
    }
  }
  return sheets.map((s) => ({ name: s.name, rows: s.rows.filter(Boolean).map((r) => Array.from(r, (x) => String(x ?? '').trim())).filter((r) => r.some(Boolean)) }))
    .filter((s) => s.rows.length);
}

module.exports = { readCfb, docText, xlsRows };

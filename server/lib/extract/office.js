// Texto de documentos do Word (.docx) e linhas de planilhas do Excel (.xlsx).
// Tabelas viram linhas com as células separadas por TAB, como numa planilha.
const { readZip } = require('./zip');

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const unxml = (s) => String(s).replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => {
  if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1)));
  return ENT[e] ?? m;
});

// ---------------------------------------------------------------- Word (.docx)
function docxText(buf) {
  const zip = readZip(buf);
  const parts = ['word/document.xml', ...zip.names().filter((n) => /^word\/(header|footer)\d*\.xml$/.test(n))];
  return parts.map((p) => wordXmlText(zip.text(p) || '')).join('\n');
}

function wordXmlText(xml) {
  let out = ''; let inCell = 0;
  const re = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\/>|<w:br\/>|<w:cr\/>|<w:tc[\s>]|<\/w:tc>|<\/w:tr>|<\/w:p>/g;
  let m;
  while ((m = re.exec(xml))) {
    const t = m[0];
    if (m[1] !== undefined) out += unxml(m[1]);
    else if (t === '<w:tab/>') out += '\t';
    else if (t === '<w:br/>' || t === '<w:cr/>') out += inCell ? ' ' : '\n';
    else if (t.startsWith('<w:tc')) inCell++;
    else if (t === '</w:tc>') { inCell = Math.max(0, inCell - 1); out = out.replace(/ +$/, '') + '\t'; }
    else if (t === '</w:tr>') out = out.replace(/\t$/, '') + '\n';
    else if (t === '</w:p>') out += inCell ? ' ' : '\n';
  }
  return out;
}

// ---------------------------------------------------------------- Excel (.xlsx)
const colIndex = (ref) => {
  const letters = String(ref).match(/^[A-Z]+/i)?.[0].toUpperCase() || 'A';
  let n = 0; for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

// Número de série de data do Excel → AAAA-MM-DD
function excelDate(serial) {
  const ms = Math.round((Number(serial) - 25569) * 864e5);
  return new Date(ms).toISOString().slice(0, 10);
}

function xlsxRows(buf) {
  const zip = readZip(buf);
  const shared = [];
  const sst = zip.text('xl/sharedStrings.xml');
  if (sst) for (const si of sst.match(/<si>[\s\S]*?<\/si>/g) || []) {
    shared.push(unxml((si.match(/<t(?:\s[^>]*)?>([^<]*)<\/t>/g) || []).map((t) => t.replace(/<[^>]+>/g, '')).join('')));
  }
  // estilos de data: numFmt embutido 14–22 ou personalizado com d/m/y
  const styles = zip.text('xl/styles.xml') || '';
  const custom = new Map([...styles.matchAll(/<numFmt [^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"/g)].map((m) => [Number(m[1]), m[2]]));
  const xfs = (styles.match(/<cellXfs[\s\S]*?<\/cellXfs>/)?.[0].match(/<xf [^>]*>/g) || []).map((x) => Number(x.match(/numFmtId="(\d+)"/)?.[1] || 0));
  const isDateFmt = (id) => (id >= 14 && id <= 22) || (custom.has(id) && /[dy]/i.test(custom.get(id).replace(/"[^"]*"|\[[^\]]*\]/g, '')));

  // ordem das abas como no arquivo
  const wb = zip.text('xl/workbook.xml') || '';
  const rels = zip.text('xl/_rels/workbook.xml.rels') || '';
  const target = new Map([...rels.matchAll(/<Relationship [^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)].map((m) => [m[1], m[2]]));
  let sheets = [...wb.matchAll(/<sheet [^>]*name="([^"]*)"[^>]*r:id="([^"]+)"/g)].map((m) => ({ name: unxml(m[1]), path: 'xl/' + String(target.get(m[2]) || '').replace(/^\/?xl\//, '') }));
  if (!sheets.length) sheets = zip.names().filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).map((p, i) => ({ name: `Planilha ${i + 1}`, path: p }));

  const out = [];
  for (const s of sheets) {
    const xml = zip.text(s.path); if (!xml) continue;
    const rows = [];
    for (const row of xml.match(/<row[\s>][\s\S]*?<\/row>/g) || []) {
      const cells = [];
      for (const c of row.match(/<c [^>]*\/>|<c [^>]*>[\s\S]*?<\/c>/g) || []) {
        const attrs = c.match(/^<c ([^>]*)/)[1];
        const ref = attrs.match(/r="([^"]+)"/)?.[1];
        const type = attrs.match(/t="([^"]+)"/)?.[1] || 'n';
        const style = Number(attrs.match(/s="(\d+)"/)?.[1] || 0);
        const v = c.match(/<v>([^<]*)<\/v>/)?.[1];
        let val = '';
        if (type === 's') val = shared[Number(v)] ?? '';
        else if (type === 'inlineStr') val = unxml((c.match(/<t(?:\s[^>]*)?>([^<]*)<\/t>/g) || []).map((t) => t.replace(/<[^>]+>/g, '')).join(''));
        else if (type === 'b') val = v === '1' ? 'VERDADEIRO' : 'FALSO';
        else if (v !== undefined) {
          val = unxml(v);
          if (type === 'n' && isDateFmt(xfs[style] ?? 0) && Number(val) > 20000 && Number(val) < 80000) val = excelDate(val);
          else if (type === 'n' && /^-?\d+\.\d+$/.test(val)) val = String(Number(Number(val).toPrecision(12))).replace('.', ',');
          else if (type === 'n') val = val.replace('.', ',');
        }
        cells[ref ? colIndex(ref) : cells.length] = val;
      }
      if (cells.some((x) => String(x ?? '').trim())) rows.push(Array.from(cells, (x) => String(x ?? '').trim()));
    }
    if (rows.length) out.push({ name: s.name, rows });
  }
  return out;
}

const rowsToText = (sheets) => sheets.map((s) => s.rows.map((r) => r.join('\t')).join('\n')).join('\n\n');

module.exports = { docxText, xlsxRows, rowsToText, excelDate, unxml };

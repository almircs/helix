// Leitura de arquivos neste computador: texto de PDFs (pdf.js) e reconhecimento de texto em
// fotos e PDFs escaneados (Tesseract, em português). Word, Excel, CSV e TXT vão para o servidor
// local, que lê o conteúdo. Nada sai do computador.

export const ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,.bmp,.gif,.doc,.docx,.xls,.xlsx,.csv,.txt,application/pdf,image/*';
const EXT_MIME = {
  pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', bmp: 'image/bmp',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', doc: 'application/msword',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', xls: 'application/vnd.ms-excel', csv: 'text/csv', txt: 'text/plain',
};
export const extOf = (name) => String(name || '').toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] || '';
export const mimeOf = (file) => EXT_MIME[extOf(file.name)] || file.type || '';
export function kindOf(file) {
  const ext = extOf(file.name); const mime = mimeOf(file);
  if (ext === 'heic' || ext === 'heif') return 'heic';
  if (mime === 'application/pdf') return 'pdf';
  if (mime.startsWith('image/')) return 'image';
  if (['doc', 'docx', 'xls', 'xlsx', 'csv', 'txt'].includes(ext)) return ext;
  return null;
}

export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1]);
    r.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
    r.readAsDataURL(file);
  });
}

// ---------------------------------------------------------------- PDF
let pdfjsPromise;
function pdfjs() {
  pdfjsPromise ||= import('/vendor/pdfjs/pdf.min.mjs').then((m) => { m.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.mjs'; return m; });
  return pdfjsPromise;
}

// Remonta as linhas do PDF pela posição de cada trecho; colunas distantes viram TAB
function pageLines(items) {
  const rows = [];
  for (const it of items) {
    if (!it.str || !it.str.trim()) continue;
    const x = it.transform[4]; const y = it.transform[5]; const h = Math.abs(it.transform[3]) || it.height || 10;
    let row = rows.find((r) => Math.abs(r.y - y) <= Math.max(2, h * 0.45));
    if (!row) { row = { y, h, parts: [] }; rows.push(row); }
    row.parts.push({ x, w: it.width || it.str.length * h * 0.5, s: it.str, h });
  }
  rows.sort((a, b) => b.y - a.y);
  return rows.map((r) => {
    r.parts.sort((a, b) => a.x - b.x);
    let out = ''; let end = null;
    for (const p of r.parts) {
      if (end !== null) {
        const gap = p.x - end;
        out += gap > p.h * 1.6 ? '\t' : gap > p.h * 0.12 && !out.endsWith(' ') && !p.s.startsWith(' ') ? ' ' : '';
      }
      out += p.s; end = p.x + p.w;
    }
    return out.trim();
  });
}

async function readPdf(data, progress) {
  const lib = await pdfjs();
  const task = lib.getDocument({ data, isEvalSupported: false, cMapUrl: '/vendor/pdfjs-cmaps/', cMapPacked: true,
    standardFontDataUrl: '/vendor/pdfjs-fonts/', wasmUrl: '/vendor/pdfjs-wasm/', useSystemFonts: false });
  const doc = await task.promise;
  const pages = []; const scanned = [];
  for (let n = 1; n <= doc.numPages; n++) {
    progress(`Lendo a página ${n} de ${doc.numPages}…`, (n - 1) / doc.numPages);
    const page = await doc.getPage(n);
    const tc = await page.getTextContent();
    const lines = pageLines(tc.items);
    pages.push(lines.join('\n'));
    if (lines.join('').replace(/\s/g, '').length < 40) scanned.push(n);
  }
  let ocr = false;
  // páginas sem texto (escaneadas ou fotografadas): reconhecimento de texto na imagem da página
  if (scanned.length) {
    ocr = true;
    for (const [i, n] of scanned.entries()) {
      const page = await doc.getPage(n);
      const vp1 = page.getViewport({ scale: 1 });
      const scale = Math.min(3, 2200 / Math.max(vp1.width, vp1.height));
      const vp = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(vp.width); canvas.height = Math.round(vp.height);
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, canvas, viewport: vp }).promise;
      pages[n - 1] = await recognize(canvas, (p) => progress(`Reconhecendo o texto da página ${n} (${i + 1} de ${scanned.length})…`, p));
    }
  }
  const total = doc.numPages;
  await task.destroy();
  return { text: pages.join('\n'), pages: total, ocr };
}

// ---------------------------------------------------------------- Reconhecimento de texto (OCR)
let workerPromise; let onOcrProgress = () => {};
function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (window.Tesseract) { resolve(); return; }
    const s = document.createElement('script'); s.src = src; s.onload = resolve; s.onerror = () => reject(new Error('Não foi possível carregar o leitor de imagens.'));
    document.head.append(s);
  });
}
async function ocrWorker() {
  workerPromise ||= (async () => {
    await loadScript('/vendor/tesseract/tesseract.min.js');
    const w = await window.Tesseract.createWorker('por', 1, {
      workerPath: '/vendor/tesseract/worker.min.js', corePath: '/vendor/tesseract-core', langPath: '/vendor/tesseract-lang',
      workerBlobURL: false, logger: (m) => { if (m.status === 'recognizing text') onOcrProgress(m.progress); },
    });
    await w.setParameters({ preserve_interword_spaces: '1' });
    return w;
  })().catch((e) => { workerPromise = null; throw e; });
  return workerPromise;
}

// Fotos: corrige a rotação da câmera e amplia imagens pequenas antes de reconhecer
async function prepareImage(file) {
  let bmp;
  try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { return file; }
  const k = Math.max(1, Math.min(2.5, 1800 / Math.max(bmp.width, bmp.height)));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.filter = 'grayscale(1) contrast(1.25)';
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  return c;
}

async function recognize(image, progress) {
  progress(0);
  const w = await ocrWorker();
  onOcrProgress = progress;
  const { data } = await w.recognize(image);
  onOcrProgress = () => {};
  return data.text || '';
}

// ---------------------------------------------------------------- Entrada principal
// Devolve o que enviar para /api/extract: { text, ocr, pages } ou { file }
export async function readForExtraction(file, progress = () => {}) {
  const kind = kindOf(file);
  if (kind === 'heic') throw new Error('Fotos HEIC do iPhone não são suportadas. No iPhone, envie a foto como JPG (Ajustes → Câmera → Formatos → Mais compatível).');
  if (!kind) throw new Error('Formato não suportado. Use PDF, foto, Word (.doc/.docx), Excel (.xls/.xlsx), CSV ou TXT.');
  if (file.size > 25 * 1048576) throw new Error('Arquivo muito grande (máximo 25 MB).');
  if (kind === 'pdf') {
    const r = await readPdf(new Uint8Array(await file.arrayBuffer()), progress);
    return { text: r.text, ocr: r.ocr, pages: r.pages, source_kind: 'pdf', name: file.name };
  }
  if (kind === 'image') {
    progress('Preparando a imagem…', 0);
    const img = await prepareImage(file);
    const text = await recognize(img, (p) => progress('Reconhecendo o texto da imagem…', p));
    return { text, ocr: true, pages: 1, source_kind: 'image', name: file.name };
  }
  progress('Lendo o arquivo…', 0.3);
  return { file: { name: file.name, mime_type: mimeOf(file), data_base64: await fileToBase64(file) }, name: file.name };
}

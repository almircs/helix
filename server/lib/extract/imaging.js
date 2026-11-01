// Laudos descritivos (tomografia, ultrassom, ressonância, raio-X, ecocardiograma…): não têm tabela de
// valores, e sim indicação, técnica, achados e conclusão. Aqui separamos essas partes e comparamos a
// conclusão com a do exame anterior do mesmo tipo. Só organiza o texto: não interpreta nem diagnostica.
const { normalize } = require('./catalog');

const MODALITIES = [
  ['Angiotomografia', /angiotomografia/i], ['Tomografia', /tomografia|\btc\b/i], ['Ressonância magnética', /resson[âa]ncia|\brnm\b/i],
  ['Ecocardiograma', /ecocardiograma|ecodoppler\s*cardiograma/i], ['Ultrassonografia', /ultrassonografia|ultrassom|ultra-som|ecografia|\busg\b/i],
  ['Doppler', /doppler/i], ['Elastografia', /elastografia/i], ['Mamografia', /mamografia/i], ['Densitometria', /densitometria/i],
  ['Raio-X', /radiografia|raio[\s-]?x|\brx\b/i], ['Cintilografia', /cintilografia/i], ['PET-CT', /pet[\s-]?ct/i],
  ['Endoscopia', /endoscopia/i], ['Colonoscopia', /colonoscopia/i], ['Eletrocardiograma', /eletrocardiograma|\becg\b/i],
  ['Teste ergométrico', /teste\s+ergom[ée]trico/i], ['Holter', /\bholter\b/i], ['MAPA', /\bmapa\b.*press[ãa]o|monitoriza[çc][ãa]o ambulatorial/i],
  ['Espirometria', /espirometria/i], ['Eletroencefalograma', /eletroencefalograma/i], ['Audiometria', /audiometria/i],
];
const modalityOf = (s) => MODALITIES.find(([, re]) => re.test(s))?.[0] || null;

const SECTION_RES = [
  ['reason', /^(indica[çc][ãa]o(\s+cl[íi]nica)?|motivo\s+do\s+exame|hip[óo]tese\s+cl[íi]nica)\s*:?\s*/i],
  ['technique', /^(t[ée]cnica(\s+do\s+exame)?|protocolo|m[ée]todo)\s*:?\s*/i],
  ['findings', /^(aspectos\s+observados|achados|descri[çc][ãa]o|an[áa]lise|relat[óo]rio\s+descritivo|observa[çc][õo]es)\s*:?\s*/i],
  ['conclusion', /^(impress[ãa]o(\s+diagn[óo]stica)?|conclus[ãa]o|opini[ãa]o|diagn[óo]stico\s+por\s+imagem)\s*:?\s*/i],
];
// Partes de cabeçalho/rodapé que se repetem em cada página ou não fazem parte do laudo
const BOILER = /data\s+impress|resultado\s+impresso|precisioncliente|p[áa]gina\s+\d|^\d+\s*\/\s*\d+(\s*\/\s*\d+)?$|utilize\s+esse\s+qrcode|imagens\s+em\s+nossos\s+canais|^liberad[oa]\s*:/i;
const FOOTER = /^este\s+(é|e)\s+um\s+(exame|laudo)|somente\s+seu\s+m[ée]dico\s+tem/i;
const END = /assinado\s+digitalmente|assinatura\s+eletr|^(dr\.?a?\s|dra\.?\s)|\bcrm[\s-]*[a-z]{0,2}[\s-]*\d{3,}|\brqe\b/i;

function cleanLines(lines) {
  return lines
    .map((l) => l.split('\t').filter((seg) => !BOILER.test(seg.trim())).join(' ').replace(/\s+/g, ' ').trim())
    .filter((l) => l && !BOILER.test(l));
}

// Junta linhas quebradas no meio da frase ("…com parênquima" + "homogêneo.")
function joinWrapped(lines) {
  const out = [];
  for (const l of lines) {
    const prev = out[out.length - 1];
    if (prev && !/[.:;!?]$/.test(prev) && /^[a-zà-ú(]/.test(l)) out[out.length - 1] = `${prev} ${l}`;
    else out.push(l);
  }
  return out;
}

const sentenceCase = (s) => { const t = String(s).trim().toLowerCase(); return t.charAt(0).toUpperCase() + t.slice(1); };

function parseImaging(rawLines) {
  const lines = cleanLines(rawLines);
  // título: a primeira linha que cita a modalidade (em geral em maiúsculas, logo depois de "RELATÓRIO"/"LAUDO")
  let titleIdx = lines.findIndex((l) => modalityOf(l) && l.length <= 120 && (l === l.toUpperCase() || l.split(' ').length <= 10) && !SECTION_RES.some(([, re]) => re.test(l)));
  const title = titleIdx >= 0 ? sentenceCase(lines[titleIdx].replace(/^(laudo|relat[óo]rio|exame)\s*(de|:|-)?\s*/i, '')) : null;
  const modality = title ? modalityOf(title) : modalityOf(lines.join(' '));
  if (!modality) return null;

  // cabeçalho da 1ª página (tudo antes do título): se repetir nas outras páginas, é pulado
  const header = new Set(lines.slice(0, Math.max(0, titleIdx)));
  const parts = { reason: [], technique: [], findings: [], conclusion: [] };
  let cur = null; let footer = false; let seenHeader = false;
  for (let i = Math.max(0, titleIdx + 1); i < lines.length; i++) {
    const l = lines[i];
    // rodapé de aviso ("Este é um exame baseado em imagens…") até o cabeçalho da página seguinte
    if (FOOTER.test(l)) { footer = true; seenHeader = false; continue; }
    if (header.has(l)) { seenHeader = true; continue; }
    if (footer) { if (!seenHeader) continue; footer = false; }
    // assinatura: nome repetido ("Fulano De TalFulano De Tal") ou nome logo antes da linha do CRM
    const signature = /^(.{8,}?)\1+$/.test(l) || (END.test(lines[i + 1] || '') && !/[.,;:]/.test(l) && l.split(' ').length <= 8 && l.split(' ').every((w) => /^[A-ZÀ-Ú]/.test(w) || /^d[aeo]s?$/i.test(w)));
    if (END.test(l) || signature) { if (cur === 'conclusion') break; continue; }
    const s = SECTION_RES.find(([, re]) => re.test(l));
    if (s) { cur = s[0]; const rest = l.replace(s[1], '').trim(); if (rest) parts[cur].push(rest); continue; }
    if (cur) parts[cur].push(l);
    else parts.findings.push(l); // laudo sem títulos de seção: o texto é a descrição
  }
  const text = (k, sep = '\n') => joinWrapped(parts[k]).join(sep).trim() || null;
  return { title, modality, reason: text('reason', ' '), technique: text('technique', ' '), findings: text('findings'), conclusion: text('conclusion') };
}

// ---------------------------------------------------------------- Comparação de conclusões
const STOP = new Set('a o as os de da do das dos e em no na nos nas com sem por para um uma uns umas que se ao aos à às alguns algumas ou já até'.split(' '));
const tokens = (s) => new Set(normalize(s).replace(/[^a-z0-9 ]/g, ' ').split(' ').filter((w) => w.length > 2 && !STOP.has(w)));
function similarity(a, b) {
  const A = tokens(a); const B = tokens(b);
  if (!A.size || !B.size) return 0;
  let inter = 0; for (const w of A) if (B.has(w)) inter++;
  return inter / Math.min(A.size, B.size);
}
const items = (conclusion) => String(conclusion || '').split(/\n|(?<=\.)\s+(?=[A-ZÀ-Ú])/).map((x) => x.trim().replace(/\.$/, '')).filter((x) => x.length > 2);
const measures = (s) => (String(s).match(/\d+(?:[.,]\d+)?\s*(?:mm|cm|ml|cm³|g|%)/gi) || []).join(', ');

// Itens da conclusão atual x anterior: novos, mantidos (com medidas lado a lado) e não citados agora
function compareConclusions(current, previous) {
  const cur = items(current); const prev = items(previous);
  const used = new Set();
  const out = { novos: [], mantidos: [], nao_citados: [] };
  for (const c of cur) {
    let best = -1; let score = 0;
    prev.forEach((p, k) => { const s = similarity(c, p); if (!used.has(k) && s > score) { score = s; best = k; } });
    if (best >= 0 && score >= 0.6) {
      used.add(best);
      const mc = measures(c); const mp = measures(prev[best]);
      out.mantidos.push({ text: c, before: prev[best], measures_now: mc || null, measures_before: mp || null, changed: !!(mc && mp && mc !== mp) });
    } else out.novos.push({ text: c });
  }
  prev.forEach((p, k) => { if (!used.has(k)) out.nao_citados.push({ text: p }); });
  return out;
}

// Mesmo tipo de exame: mesma modalidade e região parecida ("Tomografia … do abdômen total")
const IGNORE_TITLE = /computadorizada|multislice|multidetectores|helicoidal|digital|total|sem\s+contraste|com\s+contraste|de\s+alta\s+resolu[çc][ãa]o|bilateral/gi;
function sameKind(a, b) {
  if (!a || !b) return false;
  if (modalityOf(a) !== modalityOf(b)) return false;
  return similarity(String(a).replace(IGNORE_TITLE, ' '), String(b).replace(IGNORE_TITLE, ' ')) >= 0.5;
}

module.exports = { parseImaging, compareConclusions, sameKind, modalityOf, items };

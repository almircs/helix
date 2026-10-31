// Interpreta o texto de um laudo, receita, pedido ou relatório e devolve os dados estruturados.
// Tudo é feito por regras (sem IA): o resultado é uma sugestão que a pessoa revisa antes de salvar.
const { CATALOG, BY_KEY, normalize } = require('./catalog');

// ---------------------------------------------------------------- Números, datas, unidades
const MONTHS = { jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12 };

// "6.800" → 6800 · "4,85" → 4.85 · "1.234,5" → 1234.5 · "0.9" → 0.9
function parseNum(s) {
  s = String(s).replace(/\s/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function isoDate(d, m, y) {
  y = Number(y); if (y < 100) y += y > 50 ? 1900 : 2000;
  d = Number(d); m = Number(m);
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > 2100) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

const DATE_RES = [
  [/\b(\d{4})-(\d{2})-(\d{2})\b/, (m) => isoDate(m[3], m[2], m[1])],
  [/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})\b/, (m) => isoDate(m[1], m[2], m[3])],
  [/\b(\d{1,2})\s*(?:de\s+)?(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-zç]*\.?\s*(?:de\s+|\/\s*)?(\d{4})\b/i, (m) => isoDate(m[1], MONTHS[m[2].toLowerCase()], m[3])],
];
function findDates(s) {
  const out = [];
  for (const [re, fn] of DATE_RES) {
    const g = new RegExp(re.source, 'gi'); let m;
    while ((m = g.exec(s))) { const d = fn(m); if (d) out.push({ date: d, index: m.index }); }
  }
  return out.sort((a, b) => a.index - b.index).map((x) => x.date);
}
const firstDate = (s) => findDates(s)[0] || null;

const UNIT_SRC = String.raw`(?:milh[õo]es\s*\/\s*(?:mm[³3]|µl|ul|mcl)|mil\s*\/\s*(?:mm[³3]|µl|ul|mcl)|x\s*10\s*[\^]?\s*[³36]\s*\/\s*(?:mm[³3]|µl|ul|mcl)|10\s*[\^]?\s*[³36]\s*\/\s*(?:mm[³3]|µl|ul|mcl)|\/\s*(?:mm[³3]|µl|ul|mcl|campo|hpf)|ml\s*\/\s*min(?:\s*\/\s*1[,.]73\s*m[²2])?|(?:m|µ|u|mc|n|p)?g\s*\/\s*(?:dl|l|ml|g|24\s*h)|(?:m|µ|u)?(?:ui|u)\s*\/\s*(?:ml|l)|(?:m|µ|u|n|p)?mol\s*\/\s*l|meq\s*\/\s*l|mm\s*\/\s*(?:h|1a\s*hora)|mmhg|fl|pg|%|seg(?:undos)?|s\b|ratio|índice|bpm|kg|cm)`;
const UNIT_RE = new RegExp('^' + UNIT_SRC, 'i');
const NUM_SRC = String.raw`\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?`;
const QUAL_SRC = String.raw`n[ãa]o\s+reagente|reagente|negativo|positivo|ausentes?|presentes?|indetect[áa]vel|n[ãa]o\s+detectado|detectado|raras?|normal`;

// ---------------------------------------------------------------- Referência
function parseRef(s) {
  if (!s) return {};
  // datas atrapalham (o "-" de 10-01-2025 parece uma faixa)
  const t = String(s).replace(/\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b|\b\d{4}-\d{2}-\d{2}\b/g, ' ').replace(/\s+/g, ' ');
  const N = `(${NUM_SRC})`;
  // vale a primeira forma que aparece no texto ("Ótimo < 100; Desejável 100-129" → < 100)
  const found = [];
  let m = t.match(new RegExp(`(?:de\\s+)?${N}\\s*(?:${UNIT_SRC})?\\s*(?:a|at[ée]|-|–|—|à)\\s*${N}`, 'i'));
  if (m) {
    const a = parseNum(m[1]); const b = parseNum(m[2]);
    if (a !== null && b !== null && b >= a) found.push([m.index, { ref_min: a, ref_max: b }]);
  }
  if ((m = t.match(new RegExp(`(?:<=?|≤|at[ée]|inferior\\s+a|menor\\s+(?:que|ou\\s+igual\\s+a)|abaixo\\s+de)\\s*${N}`, 'i')))) found.push([m.index, { ref_max: parseNum(m[1]) }]);
  if ((m = t.match(new RegExp(`(?:>=?|≥|superior\\s+a|maior\\s+(?:que|ou\\s+igual\\s+a)|acima\\s+de)\\s*${N}`, 'i')))) found.push([m.index, { ref_min: parseNum(m[1]) }]);
  return found.sort((a, b) => a[0] - b[0])[0]?.[1] || {};
}

// Unidade de contagem de células (/mm³, mil/mm³, x10³/µL…)
const isCount = (u) => /\/\s*(mm[³3]|µl|ul|mcl)\s*$/i.test(String(u || ''));

// Referência do valor absoluto quando a linha traz as duas faixas ("40 a 70 %   1.600 a 7.700 /mm³"):
// prefere a faixa seguida de unidade de contagem; senão, a faixa compatível com o tamanho do valor
function countRef(s, value) {
  const t = String(s || '').replace(/\s+/g, ' ');
  const re = new RegExp(`(${NUM_SRC})\\s*(?:a|at[ée]|-|–|—|à)\\s*(${NUM_SRC})\\s*(${UNIT_SRC})?`, 'gi');
  const ranges = [];
  let m;
  while ((m = re.exec(t))) {
    const a = parseNum(m[1]); const b = parseNum(m[2]);
    if (a !== null && b !== null && b >= a) ranges.push({ ref_min: a, ref_max: b, unit: m[3] || '' });
  }
  const pick = ranges.find((r) => isCount(r.unit)) || ranges.find((r) => r.unit !== '%' && (value <= 100 || r.ref_max > 100));
  return pick ? { ref_min: pick.ref_min, ref_max: pick.ref_max } : {};
}

// ---------------------------------------------------------------- Preparação das linhas
function prepLines(text) {
  return String(text || '').replace(/\r/g, '').replace(/\u00a0/g, ' ').split('\n')
    .map((l) => l.replace(/[.·_]{3,}|-{3,}/g, '\t').replace(/ {3,}/g, '\t').replace(/[ \t]*\t[ \t]*/g, '\t').replace(/ {2,}/g, ' ').trim())
    .filter((l) => l && !/^[\s\-=_*.]+$/.test(l));
}

// Chaves de busca: exames que a pessoa já tem + catálogo (mais longas primeiro)
function buildKeys(userMarkers = []) {
  const keys = new Map();
  for (const m of userMarkers) {
    const k = normalize(m.name); if (!k) continue;
    const cat = BY_KEY.get(k);
    keys.set(k, { name: m.name, unit: m.unit || cat?.unit || '', known: true, user: true });
  }
  for (const item of CATALOG) for (const k of item.keys) {
    if (keys.has(k)) continue;
    // se a pessoa já tem esse exame com outro nome, usa o nome dela
    const own = userMarkers.find((m) => item.keys.includes(normalize(m.name)));
    keys.set(k, { name: own ? own.name : item.name, unit: item.unit, known: true, user: !!own });
  }
  return [...keys.entries()].sort((a, b) => b[0].length - a[0].length);
}

// Procura um nome de exame no começo da linha; devolve o nome e o resto da linha
function matchMarker(line, keys) {
  const words = line.split(/(?<=[\s\t:])/);
  const norm = normalize(line);
  for (const [k, info] of keys) {
    if (!norm.startsWith(k)) continue;
    const next = norm.charAt(k.length);
    if (next && /[a-z0-9]/.test(next)) continue;
    // acha quantas palavras originais formam a chave
    let acc = ''; let used = 0;
    for (const w of words) { acc += w; used++; if (normalize(acc).length >= k.length) break; }
    if (k.length <= 3 && !/^[\s\t:\-–(]*[\d<>]/.test(words.slice(used).join(''))) continue; // siglas curtas só com valor logo depois
    return { info, rest: words.slice(used).join('') };
  }
  return null;
}

// O texto é exatamente o nome de um exame (inclusive siglas curtas como TSH)
const exactName = (s, keys) => { const n = normalize(s); return keys.find(([k]) => k === n)?.[1].name || null; };

const NOT_MARKER = /\b(data|nasc|idade|crm|telefone|fone|cpf|rg|paciente|p[áa]gina|protocolo|pedido|cep|endere|rua|avenida|conv[êe]nio|sexo|hora|coleta|liberad|assinad|cnpj|registro|vers[ãa]o|lote|amostra|material|m[ée]todo|valores?\s+de\s+refer|refer[êe]ncia|resultado|unidade|exame|laborat|cnes|atendimento|m[ée]dico|dr\.?a?\b|solicitante|emiss|impress|n[ºo°]\.?\s*\d|total\s+de|kit)\b/i;

// Lê valor, unidade e referência no texto que vem depois do nome do exame
function readValue(rest, nextLines = []) {
  let r = String(rest).replace(/^[\s\t:=\-–—.]+/, '').replace(/^\([^)]{0,60}\)\s*/, '');
  // ignora algumas palavras antes do valor ("sérico", "em jejum", "Resultado:")
  for (let k = 0; k < 4; k++) {
    const r2 = r.replace(/^(?:resultados?|valor|soro|plasma|s[ée]rico|s[ée]rica|em jejum|de jejum|jejum|total|dosagem)(?![a-zà-ú])[\s:,\t]*/i, '');
    if (r2 === r) break; r = r2;
  }
  const re = new RegExp(`^(?:([<>≤≥]=?)\\s*)?(${NUM_SRC})(?![\\d/])|^(${QUAL_SRC})\\b`, 'i');
  const m = r.match(re);
  if (!m) return null;
  let after = r.slice(m[0].length).replace(/^[\s\t]+/, '');
  let unit = '';
  const u = after.match(UNIT_RE);
  if (u) { unit = u[0].replace(/\s+/g, ''); after = after.slice(u[0].length); }
  let value; let value_text = null;
  if (m[3]) { value = null; value_text = m[3].replace(/\s+/g, ' '); }
  else if (m[1]) { value = null; value_text = `${m[1]} ${m[2]}`; }
  else value = parseNum(m[2]);
  // Leucograma e similares: "Neutrófilos 58,0 % 3.944 /mm³" → vale o número absoluto, não a porcentagem
  let absolute = false;
  if (unit === '%' && value !== null) {
    const abs = after.replace(/^[\s\t]+/, '').match(new RegExp(`^(${NUM_SRC})\\s*(${UNIT_SRC})`, 'i'));
    if (abs && isCount(abs[2])) {
      value = parseNum(abs[1]); unit = abs[2].replace(/\s+/g, ''); after = after.replace(/^[\s\t]+/, '').slice(abs[0].length);
      absolute = true;
    }
  }
  const readRef = (s) => (absolute ? countRef(s, value) : parseRef(s));
  // referência: na mesma linha ou em "Valores de referência" logo abaixo
  let refSrc = after.replace(/^[\s\t]+/, '');
  let ref = readRef(refSrc);
  if (ref.ref_min === undefined && ref.ref_max === undefined) {
    for (const l of nextLines.slice(0, 4)) {
      if (/refer[êe]ncia|vr\s*:|desej[áa]vel|normal\s*:|adultos?\s*:|homens?\s*:|mulheres?\s*:|^\(?\s*\d+(?:[.,]\d+)?\s*(a|-|–)\s*\d/i.test(l)) {
        const rr = readRef(l);
        if (rr.ref_min !== undefined || rr.ref_max !== undefined) { ref = rr; refSrc = l; break; }
      }
    }
  }
  const ref_text = ref.ref_min === undefined && ref.ref_max === undefined && /\S/.test(refSrc) && /refer|desej|ótimo|otimo|normal|<|>/i.test(refSrc)
    ? refSrc.replace(/^[^:]*refer[êe]ncia[^:]*:\s*/i, '').trim().slice(0, 80) : null;
  return { value, value_text, unit, ref_min: ref.ref_min ?? null, ref_max: ref.ref_max ?? null, ref_text };
}

// ---------------------------------------------------------------- Resultados de exame
function parseResults(lines, keys) {
  const results = []; const seen = new Set();
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let found = matchMarker(line, keys);
    let generic = false;
    if (!found) {
      // exame fora do catálogo: "Nome   valor unidade   referência"
      // ou "Nome   Não reagente" (resultado em texto)
      const g = line.match(new RegExp(`^([A-Za-zÀ-ú][A-Za-zÀ-ú0-9 ()/+\\-]{1,45}?)[\\s\\t:]+(?=(?:[<>]=?\\s*)?(?:${NUM_SRC})\\s*(?:${UNIT_SRC}))`, 'i'))
        || line.match(new RegExp(`^([A-Za-zÀ-ú][A-Za-zÀ-ú0-9 ()/+\\-]{1,45}?)[\\s\\t:]+(?=(?:${QUAL_SRC})[\\s\\t.]*$)`, 'i'));
      if (!g || NOT_MARKER.test(g[1]) || /^\d/.test(g[1])) continue;
      found = { info: { name: g[1].trim().replace(/\s*[(:\-]+$/, ''), unit: '', known: false }, rest: line.slice(g[0].length) };
      generic = true;
    }
    // valor na mesma linha ou nas próximas (laudos com "Resultado:" embaixo do nome)
    let val = readValue(found.rest, lines.slice(i + 1));
    if (!val && !generic) {
      for (let j = i + 1; j < Math.min(lines.length, i + 4); j++) {
        if (matchMarker(lines[j], keys)) break;
        val = readValue(lines[j].replace(/^.*?(resultado|valor)\s*:?/i, ''), lines.slice(j + 1));
        if (val) break;
      }
    }
    if (!val) continue;
    if (generic && !val.unit && val.ref_min === null && val.ref_max === null && !val.value_text) continue;
    const key = normalize(found.info.name);
    if (seen.has(key)) continue; // mantém o primeiro (o resultado atual, não o "anterior" do laudo)
    seen.add(key);
    results.push({
      marker_name: found.info.name, known: found.info.known, value: val.value, value_text: val.value_text,
      unit: val.unit || found.info.unit || '', ref_min: val.ref_min, ref_max: val.ref_max, ref_text: val.ref_text, source: line.slice(0, 160),
    });
  }
  return results;
}

// ---------------------------------------------------------------- Planilhas (vários exames de uma vez)
const cellDate = (c) => (/^\d{4}-\d{2}-\d{2}$/.test(c) ? c : /^\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}$/.test(c) ? firstDate(c) : null);

function parseSheets(sheets, keys) {
  const exams = [];
  for (const { rows } of sheets) {
    // Tipo 1: datas no cabeçalho (colunas) e exames nas linhas
    const h = rows.findIndex((r) => {
      const n = r.filter((c) => cellDate(c)).length;
      // uma única data ao lado de "Data da coleta" é cabeçalho de laudo, não coluna de histórico
      return n >= 2 || (n === 1 && n >= r.filter(Boolean).length / 3 && !r.some((c) => /data|coleta/i.test(c)));
    });
    if (h >= 0) {
      const head = rows[h];
      const dateCols = head.map((c, i) => [i, cellDate(c)]).filter(([, d]) => d);
      const unitCol = head.findIndex((c) => /^unid/i.test(c));
      const refCol = head.findIndex((c) => /refer/i.test(c));
      const byDate = new Map(dateCols.map(([, d]) => [d, []]));
      for (const r of rows.slice(h + 1)) {
        const nameCell = r.find((c, i) => c && !dateCols.some(([k]) => k === i) && i !== unitCol && i !== refCol && /[a-zà-ú]/i.test(c));
        if (!nameCell || NOT_MARKER.test(nameCell)) continue;
        const m = matchMarker(nameCell, keys);
        const name = m && !m.rest.trim() ? m.info.name : nameCell.trim();
        const ref = refCol >= 0 ? parseRef(r[refCol]) : {};
        for (const [i, d] of dateCols) {
          const v = readValue(r[i] || '');
          if (!v) continue;
          byDate.get(d).push({ marker_name: name, known: !!m, value: v.value, value_text: v.value_text, unit: (unitCol >= 0 && r[unitCol]) || v.unit || m?.info.unit || '',
            ref_min: ref.ref_min ?? v.ref_min, ref_max: ref.ref_max ?? v.ref_max, ref_text: null, source: `${nameCell}: ${r[i]}` });
        }
      }
      for (const [d, results] of byDate) if (results.length) exams.push({ collection_date: d, results });
      if (exams.length) continue;
    }
    // Tipo 2: exames no cabeçalho e uma linha por data
    const hh = rows.findIndex((r) => r.filter((c) => matchMarker(c, keys)).length >= 2);
    if (hh >= 0) {
      const head = rows[hh];
      const cols = head.map((c, i) => [i, matchMarker(c, keys)]).filter(([, m]) => m);
      for (const r of rows.slice(hh + 1)) {
        const d = r.map(cellDate).find(Boolean); if (!d) continue;
        const results = [];
        for (const [i, m] of cols) {
          const v = readValue(r[i] || ''); if (!v) continue;
          results.push({ marker_name: m.info.name, known: true, value: v.value, value_text: v.value_text, unit: v.unit || m.info.unit || '', ref_min: null, ref_max: null, ref_text: null, source: `${head[i]}: ${r[i]}` });
        }
        if (results.length) exams.push({ collection_date: d, results });
      }
    }
  }
  return exams;
}

// ---------------------------------------------------------------- Cabeçalho: datas, laboratório, médico
const COLLECT_RE = /(data\s+(da|de)\s+coleta|coletad[oa]\s+em|\bcoleta\b|data\s+do\s+exame|realizad[oa]\s+em|data\s+da\s+amostra|recebid[oa]\s+em|data\s+do\s+atendimento|atendimento\s+em|data\s+de\s+entrada)/i;
const RESULT_RE = /(liberad[oa]|libera[çc][ãa]o|data\s+do\s+(laudo|resultado)|emitid[oa]\s+em|assinad[oa]\s+(eletronicamente\s+)?em|impresso\s+em)/i;
const BIRTH_RE = /(nasc|nascimento|d\.?\s*n\.?\s*:)/i;

function headerInfo(lines) {
  const at = (re) => { for (let i = 0; i < lines.length; i++) if (re.test(lines[i])) { const d = firstDate(lines[i].slice(lines[i].search(re))) || firstDate(lines[i + 1] || ''); if (d) return d; } return null; };
  const collection = at(COLLECT_RE);
  const result = at(RESULT_RE);
  let anyDate = null;
  for (const l of lines) { if (BIRTH_RE.test(l)) continue; const d = firstDate(l); if (d) { anyDate = d; break; } }

  let lab = null;
  for (const l of lines.slice(0, 40)) {
    const m = l.match(/(laborat[óo]rio\s+[^\t|,;:]{2,50}|\b(?:fleury|dasa|delboni|lavoisier|sabin|hermes pardini|pardini|a\+ medicina|labi|bronstein|s[ée]rgio franco|weinmann|cerpe|alta diagn[óo]sticos|amaral costa|frischmann|db diagn[óo]sticos|unimed|cdb|alvaro|[áa]lvaro|lab rede)\b[^\t|,;:]{0,30})/i);
    if (m && !/refer|valores|t[ée]cnico|respons/i.test(m[0])) { lab = m[0].replace(/\s+-\s+.*$/, '').replace(/\s+\d.*$/, '').trim().slice(0, 60); break; }
  }

  let doctor = null;
  for (const l of lines) {
    const m = l.match(/\b(?:[Dd][Rr][Aa]?\.?|[Dd]outora?)\s+([A-ZÀ-Ú][\wÀ-ú'.]+(?:\s+(?:d[aeo]s?\s+)?[A-ZÀ-Ú][\wÀ-ú'.]+){0,5})/);
    const crm = l.match(/\bCRM\s*[-/:]?\s*([A-Z]{2})?\s*[-/:]?\s*(\d{3,7})(?:\s*[-/]\s*([A-Z]{2}))?/i);
    if (m || crm) {
      if (doctor && doctor.name && !m) { if (crm && !doctor.crm) doctor.crm = `${crm[2]}${crm[1] || crm[3] ? '/' + (crm[1] || crm[3]).toUpperCase() : ''}`; continue; }
      doctor = { name: m ? m[1].replace(/\s+(CRM|RQE)\b.*$/i, '').trim() : doctor?.name || null, crm: crm ? `${crm[2]}${crm[1] || crm[3] ? '/' + (crm[1] || crm[3]).toUpperCase() : ''}` : doctor?.crm || null };
      if (doctor.name && doctor.crm) break;
    }
  }
  return { collection_date: collection || anyDate, result_date: result && result !== collection ? result : null, lab, doctor: doctor && (doctor.name || doctor.crm) ? doctor : null, any_date: anyDate };
}

const SPECIALTIES = [
  ['Cardiologia', /cardiolog/i], ['Nefrologia', /nefrolog/i], ['Endocrinologia', /endocrin/i], ['Clínica médica', /cl[íi]nic[ao]\s+(m[ée]dic|geral)/i],
  ['Dermatologia', /dermatolog/i], ['Ginecologia', /ginecolog|obstetr/i], ['Urologia', /urolog/i], ['Ortopedia', /ortoped/i], ['Neurologia', /neurolog/i],
  ['Psiquiatria', /psiquiatr/i], ['Gastroenterologia', /gastroenterolog/i], ['Pneumologia', /pneumolog/i], ['Oftalmologia', /oftalmolog/i],
  ['Otorrinolaringologia', /otorrino/i], ['Reumatologia', /reumatolog/i], ['Geriatria', /geriatr/i], ['Hematologia', /hematolog/i], ['Oncologia', /oncolog/i],
  ['Pediatria', /pediatr/i], ['Angiologia', /angiolog|vascular/i], ['Infectologia', /infectolog/i], ['Nutrologia', /nutrolog/i], ['Medicina de família', /medicina\s+de\s+fam[íi]lia/i],
];
const specialtyOf = (text) => SPECIALTIES.find(([, re]) => re.test(text))?.[0] || null;

// ---------------------------------------------------------------- Receita → medicamentos
const DOSE_RE = /(\d+(?:[.,]\d+)?)\s*(mg|mcg|µg|ug|g|ml|ui|u\.i\.|%|gotas?)\b(?:\s*\/\s*(ml|dose|gota|g))?/i;
const FORM_RE = /\b(comprimidos?|comp\.?|cp\.?|c[áa]psulas?|caps\.?|dr[áa]geas?|solu[çc][ãa]o|suspens[ãa]o|xarope|gotas|pomada|creme|gel|spray|ampolas?|injet[áa]vel|sach[êe]s?|adesivos?|col[íi]rio|inala[çc][ãa]o|aerossol|envelopes?)\b/i;
const INSTR_RE = /^(tomar|ingerir|usar|aplicar|pingar|administrar|mastigar|dissolver|inalar|fazer|colocar|passar|tomar\s+\d)/i;
const NOT_MED = /\b(crm|dr\.?a?\b|dra\b|assinatura|data|paciente|endere[çc]o|telefone|receitu[áa]rio|uso\s+(oral|t[óo]pico|externo|interno|cont[íi]nuo)\s*:?\s*$|nome|idade|cpf|cid)\b/i;

function frequencyOf(s) {
  let m;
  if ((m = s.match(/(\d{1,2})\s*\/\s*(\d{1,2})\s*(h|hs|horas)\b/i)) && m[1] === m[2]) return `a cada ${m[1]} horas`;
  if ((m = s.match(/a\s+cada\s+(\d{1,2})\s*(h|horas)/i))) return `a cada ${m[1]} horas`;
  if ((m = s.match(/(\d)\s*(x|vezes)\s*(ao|por|\/)\s*dia/i))) return `${m[1]}x ao dia`;
  if (/uma\s+vez\s+ao\s+dia|1\s+vez\s+ao\s+dia|1\s*x\s*dia/i.test(s)) return '1x ao dia';
  if (/duas\s+vezes\s+ao\s+dia/i.test(s)) return '2x ao dia';
  if (/tr[êe]s\s+vezes\s+ao\s+dia/i.test(s)) return '3x ao dia';
  if (/semanal|(uma\s+vez|1\s*x|\d+\s+[\wÀ-ú]+)\s+(por|na)\s+semana|\/\s*semana/i.test(s)) return '1x por semana';
  if (/se\s+necess[áa]rio|se\s+dor|se\s+febre|sos\b/i.test(s)) return 'se necessário';
  // um único momento do dia ("à noite", "em jejum") ou "diariamente"
  if (/diariamente|ao\s+dia\b|[àa]\s+noite|pela\s+manh[ãa]|ao\s+deitar|antes\s+de\s+dormir|em\s+jejum/i.test(s)) return '1x ao dia';
  return null;
}
function scheduleOf(s) {
  const times = [...s.replace(/\d{1,2}\s*\/\s*\d{1,2}\s*(h|hs|horas)\b/gi, ' ').matchAll(/\b([01]?\d|2[0-3])\s*(?::\s*([0-5]\d)|h(?:s|oras)?\b)/gi)].map((m) => `${m[1].padStart(2, '0')}:${m[2] || '00'}`);
  const parts = [...new Set(times)];
  for (const [re, label] of [[/em\s+jejum/i, 'em jejum'], [/pela\s+manh[ãa]|de\s+manh[ãa]/i, 'manhã'], [/(ao\s+)?almo[çc]o/i, 'almoço'], [/jantar/i, 'jantar'], [/[àa]\s+tarde/i, 'tarde'], [/[àa]\s+noite|de\s+noite/i, 'noite'], [/antes\s+de\s+dormir|ao\s+deitar/i, 'antes de dormir']]) if (re.test(s)) parts.push(label);
  return parts.join(', ') || null;
}

function parseMedications(lines) {
  const meds = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].replace(/^\s*(\d{1,2}\s*[).:\-–]|[-•*▪●])\s*/, '');
    if (INSTR_RE.test(l) || NOT_MED.test(l) || !/^[A-Za-zÀ-ú]/.test(l)) continue;
    const dose = l.match(DOSE_RE);
    const form = l.match(FORM_RE);
    if (!dose && !(form && /^[A-Za-zÀ-ú]{4,}/.test(l))) continue;
    const cut = dose ? l.indexOf(dose[0]) : l.indexOf(form[0]);
    const name = l.slice(0, cut).replace(/[\t,;:\-–]+$/, '').replace(/\s+/g, ' ').trim();
    if (name.length < 3 || /^(tomar|uso|via)\b/i.test(name)) continue;
    const instr = [];
    for (let j = i + 1; j < Math.min(lines.length, i + 4); j++) {
      const n = lines[j].replace(/^\s*(\d{1,2}\s*[).:\-–]|[-•*])\s*/, '');
      if (INSTR_RE.test(n) || /^(via|uso)\s/i.test(n) || /^\d+\s*(comprimido|c[áa]psula|gota|ml)/i.test(n)) instr.push(n);
      else break;
    }
    const all = [l.slice(cut), ...instr].join(' ');
    meds.push({
      name: name.slice(0, 80), dosage: dose ? dose[0].replace(/\s+/g, ' ') : null,
      presentation: form ? form[0].toLowerCase().replace(/^comp\.?$|^cp\.?$/, 'comprimido').replace(/^caps\.?$/, 'cápsula').replace(/([oaeé])s$/, '$1') : null,
      frequency: frequencyOf(all), schedule: scheduleOf(instr.join(' ')), instructions: instr.join(' ').slice(0, 300) || null,
      continuous: /uso\s+cont[íi]nuo/i.test(all), source: lines[i].slice(0, 160),
    });
  }
  return meds;
}

// ---------------------------------------------------------------- Pedido → exames solicitados
const PANELS = ['Hemograma completo', 'Lipidograma', 'Perfil lipídico', 'Urina tipo 1', 'EAS', 'Urocultura', 'Parasitológico de fezes', 'Coagulograma', 'Eletrocardiograma', 'Ecocardiograma',
  'Holter', 'MAPA', 'Teste ergométrico', 'Ultrassonografia', 'Raio-X', 'Tomografia', 'Ressonância', 'Mamografia', 'Densitometria', 'Endoscopia', 'Colonoscopia', 'Eletrólitos', 'Função renal', 'Função hepática', 'Função tireoidiana'];

function parseRequests(lines, keys) {
  const out = []; const seen = new Set();
  const add = (name) => { const k = normalize(name); if (k && !seen.has(k)) { seen.add(k); out.push(name); } };
  let inList = false;
  for (const raw of lines) {
    const l = raw.replace(/^\s*(\d{1,2}\s*[).:\-–]|[-•*▪●])\s*/, '').trim();
    if (/solicito|solicita[çc][ãa]o|pedido\s+de\s+exames?|requisi[çc][ãa]o|exames?\s+solicitados?|favor\s+realizar/i.test(l)) { inList = true; const after = l.split(/:\s*/).slice(1).join(':'); if (after) after.split(/[,;]/).forEach((x) => x.trim() && add(x.trim())); continue; }
    if (/\bcrm\b|assinatura|^dr\.?a?\s|^data\b|indica[çc][ãa]o\s+cl[íi]nica|^cid\b|^obs/i.test(l)) { inList = false; continue; }
    const pieces = l.split(/\s*[,;]\s*|\t/).filter(Boolean)
      .flatMap((p) => { const parts = p.split(/\s+e\s+/i); return parts.length > 1 && parts.every((x) => exactName(x, keys)) ? parts : [p]; });
    for (const p of pieces) {
      const exact = exactName(p, keys);
      if (exact) { add(exact); continue; }
      const m = matchMarker(p, keys);
      if (m && !/\d/.test(m.rest)) { add(m.info.name); continue; }
      const panel = PANELS.find((x) => normalize(p).startsWith(normalize(x)));
      if (panel) { add(p.slice(0, 60)); continue; }
      if (inList && /^[A-Za-zÀ-ú][\wÀ-ú ()/+\-.]{2,60}$/.test(p) && !/\d{3,}/.test(p)) add(p);
    }
  }
  return out;
}

// ---------------------------------------------------------------- Relatório de consulta
const SECTIONS = [
  ['reason', /^(motivo(\s+da\s+consulta)?|queixa(\s+principal)?|qp)\s*[:\-]/i],
  ['symptoms', /^(sintomas|hist[óo]ria(\s+da\s+doen[çc]a\s+atual)?|hda|anamnese)\s*[:\-]/i],
  ['diagnoses', /^(diagn[óo]stic[oa]s?|hip[óo]tese(s)?\s+diagn[óo]stica(s)?|hd|cid(-?10)?)\s*[:\-]/i],
  ['conduct', /^(conduta|plano(\s+terap[êe]utico)?|tratamento)\s*[:\-]/i],
  ['recommendations', /^(orienta[çc][õo]es|recomenda[çc][õo]es)\s*[:\-]/i],
];
function parseSections(lines) {
  const out = {}; let cur = null;
  for (const l of lines) {
    const s = SECTIONS.find(([, re]) => re.test(l));
    if (s) { cur = s[0]; const rest = l.replace(s[1], '').trim(); out[cur] = (out[cur] ? out[cur] + '\n' : '') + rest; continue; }
    if (cur && /^[A-ZÀ-Ú][\wÀ-ú ]{2,30}:\s*$/.test(l)) { cur = null; continue; }
    if (cur && !/\bcrm\b|assinatura/i.test(l)) out[cur] = (out[cur] ? out[cur] + '\n' : '') + l;
  }
  for (const k of Object.keys(out)) { out[k] = out[k].trim().slice(0, 2000); if (!out[k]) delete out[k]; }
  return out;
}

// ---------------------------------------------------------------- Tipo do documento
function detectKind(text, { results, meds, requests }) {
  const t = text.toLowerCase();
  const count = (re) => (t.match(re) || []).length;
  const score = {
    exame: results * 2 + count(/valores?\s+de\s+refer|refer[êe]ncia|resultado|laudo|material\s*:|m[ée]todo\s*:|coleta/g),
    receita: meds * 3 + count(/receitu[áa]rio|receita|uso\s+oral|uso\s+cont[íi]nuo|posologia|\btomar\b/g) * 2,
    pedido: count(/solicito|solicita[çc][ãa]o\s+de\s+exames?|pedido\s+de\s+exames?|requisi[çc][ãa]o|sp\/sadt|guia\s+sadt|favor\s+realizar/g) * 4 + (results ? 0 : requests),
    consulta: count(/relat[óo]rio\s+m[ée]dico|atestado|evolu[çc][ãa]o|anamnese|hip[óo]tese\s+diagn|conduta|queixa|encaminhamento|retorno\s+em/g) * 3,
  };
  const best = Object.entries(score).sort((a, b) => b[1] - a[1])[0];
  return { kind: best[1] > 0 ? best[0] : 'exame', score };
}

// ---------------------------------------------------------------- Entrada principal
function parseDocument({ text = '', sheets = null, userMarkers = [] }) {
  const keys = buildKeys(userMarkers);
  const fullText = text || (sheets ? sheets.map((s) => s.rows.map((r) => r.join('\t')).join('\n')).join('\n\n') : '');
  const lines = prepLines(fullText);
  const head = headerInfo(lines);
  let exams = sheets ? parseSheets(sheets, keys) : [];
  if (!exams.length) {
    const results = parseResults(lines, keys);
    if (results.length) exams = [{ collection_date: head.collection_date, results }];
  }
  for (const e of exams) { e.result_date ??= head.result_date; e.lab ??= head.lab; }
  const meds = parseMedications(lines);
  const requests = parseRequests(lines, keys);
  const nResults = exams.reduce((n, e) => n + e.results.length, 0);
  const { kind, score } = detectKind(fullText, { results: nResults, meds: meds.length, requests: requests.length });
  return {
    kind, score, text: fullText, lines: lines.length,
    date: head.collection_date || head.any_date, result_date: head.result_date, lab: head.lab,
    doctor: head.doctor, specialty: specialtyOf(fullText),
    exams, medications: meds, requests,
    sections: parseSections(lines),
  };
}

module.exports = { parseDocument, parseNum, parseRef, findDates, prepLines, buildKeys, matchMarker, readValue };

// Análise descritiva de resultados. NÃO faz diagnóstico: só compara números com a
// referência informada no laudo e com o resultado anterior.
const config = require('../config');

function situation(value, min, max) {
  if (value === null || value === undefined) return null;
  if (min !== null && min !== undefined && value < min) return 'abaixo';
  if (max !== null && max !== undefined && value > max) return 'acima';
  if ((min ?? null) === null && (max ?? null) === null) return null;
  return 'dentro';
}

function trend(prev, curr) {
  if (prev === null || prev === undefined || curr === null || curr === undefined) return null;
  const diff = curr - prev;
  const pct = prev !== 0 ? (diff / Math.abs(prev)) * 100 : (diff === 0 ? 0 : 100);
  const abs = Math.abs(pct);
  let direction = 'estavel';
  if (abs >= config.stableChangePct) direction = diff > 0 ? 'aumento' : 'reducao';
  return { direction, diff: round(diff), pct: round(pct, 1), relevant: abs >= config.relevantChangePct };
}

function round(n, d = 2) { const f = 10 ** d; return Math.round(n * f) / f; }

function refLabel(min, max, text) {
  if (text) return text;
  if (min != null && max != null) return `${fmt(min)}–${fmt(max)}`;
  if (min != null) return `≥ ${fmt(min)}`;
  if (max != null) return `≤ ${fmt(max)}`;
  return '';
}
const fmt = (n) => String(n).replace('.', ',');

// Série com situação e tendência ponto a ponto + resumo geral
function analyzeSeries(points) {
  let prev = null;
  const out = points.map((p) => {
    const sit = situation(p.value_num, p.ref_min, p.ref_max);
    const tr = prev ? trend(prev.value_num, p.value_num) : null;
    if (p.value_num !== null && p.value_num !== undefined) prev = p;
    return { ...p, situation: sit, trend: tr, ref_label: refLabel(p.ref_min, p.ref_max, p.ref_text) };
  });
  const nums = out.filter((p) => p.value_num !== null && p.value_num !== undefined);
  const summary = { count: out.length, out_of_range: out.filter((p) => p.situation === 'acima' || p.situation === 'abaixo').length };
  if (nums.length >= 2) {
    summary.overall = trend(nums[0].value_num, nums[nums.length - 1].value_num);
    summary.min = Math.min(...nums.map((p) => p.value_num));
    summary.max = Math.max(...nums.map((p) => p.value_num));
  }
  if (nums.length) summary.last = nums[nums.length - 1];
  return { points: out, summary };
}

// Alterações de um exame em relação ao anterior de cada marcador, separadas por tipo.
// Cada resultado precisa de { marker_name, situation, previous?: { situation, direction, relevant } }.
function summarizeChanges(results) {
  const out = { novos_fora: [], continuam_fora: [], voltaram_ao_normal: [], aumentos: [], reducoes: [], primeiros: [] };
  for (const r of results) {
    const fora = r.situation === 'acima' || r.situation === 'abaixo';
    const p = r.previous;
    if (!p) { out.primeiros.push(r); if (fora) out.novos_fora.push(r); continue; }
    const antesFora = p.situation === 'acima' || p.situation === 'abaixo';
    if (fora && !antesFora) out.novos_fora.push(r);
    else if (fora && antesFora) out.continuam_fora.push(r);
    else if (!fora && antesFora && r.situation === 'dentro') out.voltaram_ao_normal.push(r);
    if (p.relevant && p.direction === 'aumento') out.aumentos.push(r);
    if (p.relevant && p.direction === 'reducao') out.reducoes.push(r);
  }
  const total = out.novos_fora.length + out.continuam_fora.length + out.voltaram_ao_normal.length + out.aumentos.length + out.reducoes.length;
  return { ...out, total, compared: results.filter((r) => r.previous).length };
}

module.exports = { situation, trend, analyzeSeries, refLabel, summarizeChanges };

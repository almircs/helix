// Gráfico de linha em SVG, sem bibliotecas. Mostra faixa de referência e marcos verticais
// (ex.: alterações de medicamento). Cada ponto tem <title> com data e valor.
import { esc, raw, fmtDate, fmtNum, parseISO, MONTHS_SHORT } from './lib.js';

const COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)'];
export const seriesColor = (i) => COLORS[i % COLORS.length];

function niceStep(range, target = 5) {
  const rough = range / target; const p = 10 ** Math.floor(Math.log10(rough || 1)); const n = rough / p;
  return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * p;
}

export function lineChart({ series, band = null, unit = '', height = 260, marks = [], compact = false, width = 680 }) {
  const W = width, H = height, L = compact ? 8 : 52, R = compact ? 8 : 18, T = compact ? 6 : 16, B = compact ? 6 : 34;
  const pts = series.flatMap((s) => s.points.filter((p) => p.y !== null && p.y !== undefined && Number.isFinite(p.y)));
  if (!pts.length) return raw('<p class="empty">Sem valores numéricos para desenhar o gráfico.</p>');
  const xs = [...pts.map((p) => parseISO(p.x).getTime()), ...marks.map((m) => parseISO(m.x).getTime())];
  let x0 = Math.min(...xs), x1 = Math.max(...xs);
  if (x0 === x1) { x0 -= 15 * 864e5; x1 += 15 * 864e5; }
  const pad = (x1 - x0) * 0.04; x0 -= pad; x1 += pad;
  const ys = pts.map((p) => p.y);
  if (band?.min != null) ys.push(band.min); if (band?.max != null) ys.push(band.max);
  let y0 = Math.min(...ys), y1 = Math.max(...ys);
  if (y0 === y1) { y0 -= Math.abs(y0) * 0.1 || 1; y1 += Math.abs(y1) * 0.1 || 1; }
  const step = niceStep(y1 - y0);
  y0 = Math.floor((y0 - step * 0.3) / step) * step; y1 = Math.ceil((y1 + step * 0.3) / step) * step;
  if (y0 < 0 && Math.min(...pts.map((p) => p.y)) >= 0) y0 = 0;
  const sx = (t) => L + ((t - x0) / (x1 - x0)) * (W - L - R);
  const sy = (v) => T + (1 - (v - y0) / (y1 - y0)) * (H - T - B);
  let svg = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Gráfico de evolução">`;

  if (!compact) for (let v = y0; v <= y1 + 1e-9; v += step) {
    svg += `<line class="grid-line" x1="${L}" x2="${W - R}" y1="${sy(v)}" y2="${sy(v)}"/><text x="${L - 8}" y="${sy(v) + 4}" text-anchor="end">${esc(fmtNum(+v.toFixed(6), 3))}</text>`;
  }
  if (band && (band.min != null || band.max != null)) {
    const top = sy(band.max != null ? band.max : y1), bot = sy(band.min != null ? band.min : y0);
    svg += `<rect class="band" x="${L}" width="${W - L - R}" y="${top}" height="${Math.max(0, bot - top)}"><title>Faixa de referência</title></rect>`;
    if (band.max != null) svg += `<line class="ref" x1="${L}" x2="${W - R}" y1="${sy(band.max)}" y2="${sy(band.max)}"/>`;
    if (band.min != null) svg += `<line class="ref" x1="${L}" x2="${W - R}" y1="${sy(band.min)}" y2="${sy(band.min)}"/>`;
  }
  if (!compact) {
    // rótulos do eixo X: até ~6 datas
    const span = x1 - x0; const ticks = W < 600 ? 4 : 6;
    for (let i = 0; i <= ticks; i++) {
      const t = x0 + (span * i) / ticks; const d = new Date(t);
      const label = span > 400 * 864e5 ? `${MONTHS_SHORT[d.getMonth()]}/${String(d.getFullYear()).slice(2)}` : `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
      svg += `<text x="${sx(t)}" y="${H - 10}" text-anchor="middle">${label}</text>`;
    }
  }
  for (const m of marks) {
    const x = sx(parseISO(m.x).getTime());
    svg += `<line class="marker-line" x1="${x}" x2="${x}" y1="${T}" y2="${H - B}"><title>${esc(fmtDate(m.x) + ' — ' + m.label)}</title></line>`;
    if (!compact) svg += `<text x="${x + 4}" y="${T + 10}" style="fill:var(--chart-2)">${esc(m.short || '◆')}</text>`;
  }
  series.forEach((s, i) => {
    const color = s.color || seriesColor(i);
    const ps = s.points.filter((p) => Number.isFinite(p.y)).sort((a, b) => a.x.localeCompare(b.x));
    if (ps.length > 1) svg += `<polyline fill="none" stroke="${color}" stroke-width="${compact ? 2 : 2.5}" stroke-linejoin="round" stroke-linecap="round" points="${ps.map((p) => `${sx(parseISO(p.x).getTime())},${sy(p.y)}`).join(' ')}"/>`;
    for (const p of ps) {
      const out = p.flag === 'acima' || p.flag === 'abaixo';
      svg += `<circle cx="${sx(parseISO(p.x).getTime())}" cy="${sy(p.y)}" r="${compact ? 2.5 : out ? 6 : 5}" fill="${out ? 'var(--surface)' : color}" stroke="${color}" stroke-width="${out ? 3 : 0}"><title>${esc(`${fmtDate(p.x)}: ${fmtNum(p.y, 3)} ${p.unit || unit}${p.label ? ' — ' + p.label : ''}`)}</title></circle>`;
      if (!compact && ps.length <= 12) svg += `<text x="${sx(parseISO(p.x).getTime())}" y="${sy(p.y) - 10}" text-anchor="middle" style="fill:var(--text);font-weight:600">${esc(fmtNum(p.y, 2))}</text>`;
    }
  });
  svg += '</svg>';
  const legend = compact ? '' : `<div class="legend">${series.length > 1 ? series.map((s, i) => `<span><i style="background:${s.color || seriesColor(i)}"></i>${esc(s.name)}</span>`).join('') : ''}${band ? '<span><i style="background:var(--band);border:1px dashed var(--ok)"></i>Faixa de referência</span>' : ''}${marks.length ? '<span><i style="background:var(--chart-2);height:2px"></i>Alteração de medicamento</span>' : ''}<span>Ponto vazado = fora da referência</span></div>`;
  return raw(svg + legend);
}

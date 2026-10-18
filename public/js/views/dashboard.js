import { api, html, icon, fmtDate, fmtNum, relDay, parseISO, MONTHS_SHORT, WEEKDAYS, EVENT_TYPES, today, daysUntil } from '../lib.js';
import { lineChart } from '../chart.js';

const SIT = { acima: 'Acima', abaixo: 'Abaixo', dentro: 'Normal' };
const ARROW = { aumento: '↑', reducao: '↓', estavel: '→' };

function dateBlock(iso) {
  const d = parseISO(iso);
  return html`<div class="dblock ${iso === today() ? 'is-today' : ''}"><b>${d.getDate()}</b><span>${MONTHS_SHORT[d.getMonth()]}</span></div>`;
}

// Frases curtas do que pede atenção; cada uma leva à tela certa
function attention(d) {
  const items = [];
  const out = d.alerts.filter((a) => a.kind === 'fora_referencia');
  if (out.length) items.push({ level: 'high', link: '#/exames', text: out.length === 1 ? out[0].text.replace(' no último resultado', '') : `${out.length} exames com o último resultado fora da referência` });
  const pend = d.alerts.filter((a) => a.kind === 'exame_pendente');
  if (pend.length) items.push({ level: 'warn', link: pend[0].link, text: pend.length === 1 ? pend[0].text.replace(/ \(pedido.*$/, '') + ' — pedido ainda não realizado' : `${pend.length} exames pedidos ainda não realizados` });
  for (const a of d.alerts.filter((x) => x.kind === 'medicamento_termino')) items.push({ level: 'warn', link: a.link, text: a.text.replace(' — verifique a receita', '. Verifique a receita') });
  const soon = d.upcoming.find((e) => daysUntil(e.date) <= 2 && ['consulta', 'retorno', 'exame', 'procedimento', 'vacina'].includes(e.type));
  if (soon) items.push({ level: 'info', link: soon.source === 'consulta' ? `#/consultas/${soon.id}` : '#/agenda', text: `${soon.title} ${relDay(soon.date)}${soon.time ? ' às ' + soon.time : ''}` });
  return items;
}

function examRow(r) {
  const flag = r.situation === 'acima' || r.situation === 'abaixo';
  const pts = r.recent.filter((p) => Number.isFinite(p.y));
  return html`<a class="xrow ${flag ? 'is-flag' : ''}" href="#/exames/marcador/${r.marker_id}">
    <span class="xname">${r.name}<small>${fmtDate(r.date)}</small></span>
    <span class="xval"><b>${typeof r.value === 'number' ? fmtNum(r.value, 3) : r.value}</b> <small>${r.unit || ''}</small></span>
    <span class="xspark">${pts.length > 1 ? lineChart({ compact: true, width: 180, height: 44, band: r.ref_min != null || r.ref_max != null ? { min: r.ref_min, max: r.ref_max } : null,
      series: [{ name: r.name, points: pts.map((p) => ({ x: p.x, y: p.y, flag: p.s })) }] }) : html`<span class="muted small">1º registro</span>`}</span>
    <span class="xref small muted">${r.ref_label ? 'ref. ' + r.ref_label : ''}</span>
    <span class="xsit">${r.situation ? html`<span class="tag ${r.situation}">${SIT[r.situation]}</span>` : ''}${r.trend ? html` <span class="trend" title="Comparado ao resultado anterior">${ARROW[r.trend.direction]} ${r.trend.direction !== 'estavel' ? fmtNum(Math.abs(r.trend.pct), 1) + '%' : 'estável'}</span>` : ''}</span>
  </a>`;
}

function indicator(i) {
  const isBP = i.type === 'pressao';
  const series = [{ name: i.label, points: i.recent.map((r) => ({ x: r.at.slice(0, 10), y: r.v1 })) }];
  if (isBP) series.push({ name: 'Diastólica', points: i.recent.map((r) => ({ x: r.at.slice(0, 10), y: r.v2 })) });
  return html`<a class="ind" href="#/saude?tipo=${i.type}">
    <span class="ind-label">${i.label}</span>
    <span class="ind-val">${isBP ? `${fmtNum(i.last.value1)}/${fmtNum(i.last.value2)}` : fmtNum(i.last.value1, 1)} <small>${i.unit}</small></span>
    <span class="ind-when small muted">${fmtDate(i.last.measured_at.slice(0, 10))} ${i.last.measured_at.slice(11)}</span>
    ${i.recent.length > 1 ? html`<span class="ind-spark">${lineChart({ compact: true, width: 220, height: 40, series })}</span>` : ''}
  </a>`;
}

export async function render() {
  const d = await api('/dashboard');
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
  const first = d.name ? d.name.split(' ')[0] : '';
  const now = parseISO(d.today);
  const att = attention(d);
  const empty = d.counts.exams + d.counts.consultations + d.medications.length === 0;

  return html`
  <div class="dash">
    <header class="dash-head">
      <div><h1>${greet}${first ? ', ' + first : ''}</h1>
        <p class="muted">${WEEKDAYS[now.getDay()][0].toUpperCase() + WEEKDAYS[now.getDay()].slice(1)}, ${now.getDate()} de ${MONTHS_SHORT[now.getMonth()]}.</p></div>
      <div class="actions"><a class="btn" href="#/exames/novo">${icon('plus')}Exame</a><a class="btn" href="#/consultas/nova">${icon('plus')}Consulta</a><a class="btn primary" href="#/saude">${icon('plus')}Medição</a></div>
    </header>

    ${empty ? html`<div class="welcome"><h2>Vamos começar</h2>
      <p>Cadastre o que já tem em mãos. O Helyx liga tudo sozinho na linha do tempo.</p>
      <div class="actions"><a class="btn primary" href="#/exames/novo">Lançar um exame</a><a class="btn" href="#/medicamentos/novo">Cadastrar remédio</a><a class="btn" href="#/configuracoes/perfil">Preencher perfil</a><a class="btn" href="#/configuracoes/backup">Restaurar backup</a></div></div>` : ''}

    ${att.length ? html`<ul class="attention" aria-label="Pede atenção">${att.map((a) => html`<li><a class="att ${a.level}" href="${a.link}">${icon(a.level === 'info' ? 'agenda' : 'alert')}<span>${a.text}</span></a></li>`)}</ul>`
      : !empty ? html`<p class="all-good">${icon('info')}Nada pedindo atenção agora.</p>` : ''}

    <div class="dash-grid">
      <section class="panel exams-panel">
        <div class="panel-head"><h2>Exames</h2><span class="muted small">${d.counts.markers} acompanhado(s)${d.counts.out_of_range ? ` · ${d.counts.out_of_range} fora da referência` : ''}</span><a href="#/exames" class="small">Ver todos</a></div>
        ${d.latest_results.length ? html`<div class="xlist">${d.latest_results.map(examRow)}</div>
          <p class="small muted panel-foot">A faixa verde é a referência do laudo. Ponto vazado = fora dela. Não é diagnóstico.</p>`
          : html`<p class="empty">Nenhum resultado ainda. <a href="#/exames/novo">Lançar exame</a></p>`}
      </section>

      <aside class="side-col">
        <section class="panel">
          <div class="panel-head"><h2>Próximos dias</h2><a href="#/agenda" class="small">Agenda</a></div>
          ${d.upcoming.length ? html`<ul class="agenda-list">${d.upcoming.map((e) => html`<li>
            <a href="${e.source === 'consulta' ? `#/consultas/${e.id}` : e.source === 'medicamento' ? `#/medicamentos/${e.id}` : '#/agenda'}">
              ${dateBlock(e.date)}<span><b>${e.title}</b><small>${EVENT_TYPES[e.type] || e.type} · ${relDay(e.date)}${e.time ? ', ' + e.time : ''}</small></span></a></li>`)}</ul>`
            : html`<p class="empty">Nada agendado. <a href="#/agenda?novo=outro">Agendar</a></p>`}
        </section>
        <section class="panel">
          <div class="panel-head"><h2>Remédios em uso</h2><a href="#/medicamentos" class="small">Todos</a></div>
          ${d.medications.length ? html`<ul class="med-list">${d.medications.map((m) => html`<li><a href="#/medicamentos/${m.id}">
            <span class="med-time">${m.schedule || '—'}</span><span><b>${m.name}</b> ${m.dosage || ''}<small>${m.frequency || ''}${m.end_date ? ' · até ' + fmtDate(m.end_date) : ''}</small></span></a></li>`)}</ul>`
            : html`<p class="empty">Nenhum remédio ativo. <a href="#/medicamentos/novo">Cadastrar</a></p>`}
        </section>
      </aside>
    </div>

    <section class="panel ind-panel">
      <div class="panel-head"><h2>Medições</h2><a href="#/saude" class="small">Registrar</a></div>
      ${d.indicators.length ? html`<div class="ind-row">${d.indicators.map(indicator)}</div>`
        : html`<p class="empty">Registre pressão, peso ou glicemia para acompanhar aqui. <a href="#/saude">Registrar medição</a></p>`}
    </section>
  </div>`;
}

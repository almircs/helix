import { api, html, icon, fmtDate, fmtNum, relDay, sitTag, trendTag, parseISO, MONTHS_SHORT, EVENT_TYPES } from '../lib.js';
import { lineChart } from '../chart.js';

function nextCard(label, e, emptyText, newHref) {
  if (!e) return html`<div class="card"><h2>${label}</h2><p class="empty">${emptyText}</p><a class="btn small" href="${newHref}">${icon('plus')}Agendar</a></div>`;
  const d = parseISO(e.date);
  const href = e.source === 'consulta' ? `#/consultas/${e.id}` : '#/agenda';
  return html`<div class="card"><h2>${label}</h2>
    <a class="next-item" href="${href}" style="text-decoration:none;color:inherit">
      <div class="when"><b>${d.getDate()}</b><span>${MONTHS_SHORT[d.getMonth()]}</span></div>
      <div><div class="title">${e.title}</div><div class="meta">${relDay(e.date)}${e.time ? ' · ' + e.time : ''}${e.location ? ' · ' + e.location : ''}</div></div>
    </a></div>`;
}

export async function render() {
  const d = await api('/dashboard');
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
  const first = d.name ? d.name.split(' ')[0] : '';
  return html`
  <div class="page-head"><div><h1>${greet}${first ? ', ' + first : ''}</h1><p class="muted" style="margin:0">Resumo da sua saúde hoje.</p></div>
    <div class="actions"><a class="btn" href="#/exames/novo">${icon('plus')}Exame</a><a class="btn" href="#/consultas/nova">${icon('plus')}Consulta</a><a class="btn primary" href="#/saude">${icon('plus')}Medição</a></div></div>

  ${d.counts.exams + d.counts.consultations === 0 ? html`<div class="note" style="margin-bottom:1rem">Comece cadastrando <a href="#/configuracoes/perfil">seu perfil</a>, seus <a href="#/medicamentos/novo">medicamentos</a> e o <a href="#/exames/novo">último exame</a>. O sistema vai ligando tudo automaticamente na linha do tempo.</div>` : ''}

  <div class="grid g3">
    ${nextCard('Próxima consulta', d.next.consulta, 'Nenhuma consulta agendada.', '#/consultas/nova')}
    ${nextCard('Próximo exame', d.next.exame, 'Nenhum exame agendado.', '#/agenda?novo=exame')}
    ${nextCard('Próximo retorno', d.next.retorno, 'Nenhum retorno agendado.', '#/consultas/nova')}
  </div>

  <div class="grid g2" style="margin-top:1rem">
    <div class="card">
      <h2>Alertas <span class="small muted">${d.alerts.length || ''}</span></h2>
      ${d.alerts.length ? d.alerts.slice(0, 8).map((a) => html`<a class="alert ${a.level}" href="${a.link}">${icon(a.level === 'info' ? 'info' : 'alert')}<span>${a.text}</span></a>`) : html`<p class="empty">Nenhum alerta no momento.</p>`}
      ${d.alerts.some((a) => a.kind === 'fora_referencia') ? html`<p class="small muted" style="margin-top:.75rem">“Fora da referência” compara o número com a faixa do laudo. Não é diagnóstico — converse com seu médico.</p>` : ''}
    </div>
    <div class="card">
      <h2>Medicamentos em uso <a href="#/medicamentos">ver todos</a></h2>
      ${d.medications.length ? html`<ul class="list">${d.medications.map((m) => html`<li><a class="row-link grow" href="#/medicamentos/${m.id}"><div class="title">${m.name} ${m.dosage || ''}</div><div class="meta">${[m.frequency, m.schedule].filter(Boolean).join(' · ') || '—'}${m.end_date ? ' · até ' + fmtDate(m.end_date) : ''}</div></a></li>`)}</ul>` : html`<p class="empty">Nenhum medicamento ativo.</p><a class="btn small" href="#/medicamentos/novo">${icon('plus')}Cadastrar</a>`}
    </div>
  </div>

  <div class="grid g2" style="margin-top:1rem">
    <div class="card">
      <h2>Últimos exames <a href="#/exames">ver todos</a></h2>
      ${d.latest_results.length ? html`<ul class="list">${d.latest_results.map((r) => html`<li><a class="row-link grow" href="#/exames/marcador/${r.marker_id}"><div class="title">${r.name}</div><div class="meta">${fmtDate(r.date)}</div></a>
        <div style="text-align:right"><div class="value">${typeof r.value === 'number' ? fmtNum(r.value) : r.value} <span class="meta">${r.unit || ''}</span></div><div>${sitTag(r.situation)} ${trendTag(r.trend)}</div></div></li>`)}</ul>` : html`<p class="empty">Nenhum resultado cadastrado.</p>`}
    </div>
    <div class="card">
      <h2>Indicadores <a href="#/saude">registrar</a></h2>
      ${d.indicators.length ? html`<div class="grid g2">${d.indicators.map((i) => html`<div>
        <div class="meta">${i.label}</div>
        <div class="stat">${i.type === 'pressao' ? `${fmtNum(i.last.value1)}/${fmtNum(i.last.value2)}` : fmtNum(i.last.value1)} <span class="small muted">${i.unit}</span></div>
        <div class="meta small">${fmtDate(i.last.measured_at.slice(0, 10))} ${i.last.measured_at.slice(11)}</div>
        ${i.recent.length > 1 ? lineChart({ compact: true, height: 60, series: [{ name: i.label, points: i.recent.map((r) => ({ x: r.at.slice(0, 10), y: r.v1 })) }, ...(i.type === 'pressao' ? [{ name: 'Diastólica', points: i.recent.map((r) => ({ x: r.at.slice(0, 10), y: r.v2 })) }] : [])] }) : ''}
      </div>`)}</div>` : html`<p class="empty">Registre pressão, peso ou frequência cardíaca para acompanhar aqui.</p>`}
    </div>
  </div>

  ${d.upcoming.length ? html`<div class="card" style="margin-top:1rem"><h2>Próximos compromissos <a href="#/agenda">abrir agenda</a></h2>
    <ul class="list">${d.upcoming.map((e) => html`<li><div class="grow"><div class="title">${e.title}</div><div class="meta">${EVENT_TYPES[e.type] || e.type} · ${fmtDate(e.date)}${e.time ? ' ' + e.time : ''} (${relDay(e.date)})</div></div></li>`)}</ul></div>` : ''}
  `;
}

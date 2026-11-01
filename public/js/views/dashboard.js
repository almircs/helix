// Página inicial discreta: só datas, horários e contagens.
// Nada que identifique exames, remédios, médicos ou especialidades (usa /api/home).
import { api, html, raw, icon, fmtDate, parseISO, MONTHS_SHORT, WEEKDAYS, daysUntil } from '../lib.js';

const WD = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const KIND = { compromisso: 'Compromisso', remedio: 'Remédio', receita: 'Renovar receita' };
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
const svg = (d, color) => raw(`<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`);
const I = {
  cal: 'M8 2v4M16 2v4M3 9h18M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z',
  clock: 'M12 7v5l3 2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z',
  alert: 'M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  flask: 'M9 2h6M10 2v6L4.5 18.5A2 2 0 0 0 6.3 21h11.4a2 2 0 0 0 1.8-2.5L14 8V2M7 14h10',
  pulse: 'M3 12h4l3-8 4 16 3-8h4',
};
function relText(iso) {
  const n = daysUntil(iso);
  return n === 0 ? 'hoje' : n === 1 ? 'amanhã' : n > 1 ? `em ${n} dias` : `há ${-n} dias`;
}
function ago(isoDateTime) {
  if (!isoDateTime) return null;
  const n = -daysUntil(isoDateTime.slice(0, 10));
  return n <= 0 ? 'hoje' : n === 1 ? 'ontem' : `há ${n} dias`;
}

function kpi({ label, color, grad, ic, value, sub, href }) {
  return html`<a class="kpi" href="${href}" style="--k:${color};--g:${grad}">
    <span class="kpi-label">${label}${svg(ic, color)}</span>
    <b class="kpi-value">${value}</b>
    <span class="kpi-sub">${sub}</span>
    <span class="kpi-bar"></span></a>`;
}

export async function render() {
  const h = await api('/home');
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
  const nd = h.next ? parseISO(h.next.date) : null;

  const kpis = [
    kpi({ label: 'Próximo compromisso', color: '#22c7b0', grad: 'linear-gradient(90deg,#22c7b0,#38bdf8)', ic: I.cal, href: '#/agenda',
      value: nd ? `${nd.getDate()} ${MONTHS_SHORT[nd.getMonth()]}` : '—',
      sub: nd ? `${WEEKDAYS[nd.getDay()][0].toUpperCase() + WEEKDAYS[nd.getDay()].slice(1)}${h.next.time ? ', ' + h.next.time : ''} · ${relText(h.next.date)}` : 'Nada agendado' }),
    kpi({ label: 'Hoje', color: '#38bdf8', grad: 'linear-gradient(90deg,#38bdf8,#6366f1)', ic: I.clock, href: '#/medicamentos',
      value: h.today_meds.count ? plural(h.today_meds.count, 'remédio', 'remédios') : '—',
      sub: h.today_meds.times.length ? `Horários: ${h.today_meds.times.join(', ')}` : 'Sem horários cadastrados' }),
    kpi({ label: 'Pendências', color: '#f87171', grad: 'linear-gradient(90deg,#fbbf24,#f87171)', ic: I.alert, href: '#/pendencias',
      value: String(h.pending.count), sub: h.pending.count ? 'Clique para ver e acompanhar' : 'Nada pendente' }),
    kpi({ label: 'Exames', color: '#a78bfa', grad: 'linear-gradient(90deg,#8b5cf6,#ec4899)', ic: I.flask, href: '#/exames',
      value: String(h.exams.tracked), sub: h.exams.last ? `Acompanhados · último ${fmtDate(h.exams.last).slice(0, 5)}` : 'Nenhum lançado' }),
    kpi({ label: 'Medições', color: '#34d399', grad: 'linear-gradient(90deg,#34d399,#22c7b0)', ic: I.pulse, href: '#/saude',
      value: String(h.measurements.total), sub: h.measurements.last ? `Registradas · última ${ago(h.measurements.last)}` : 'Nenhuma registrada' }),
  ];

  const apptDays = h.week.filter((d) => d.items.some((i) => i.kind === 'compromisso')).length;
  const apptCount = h.week.reduce((n, d) => n + d.items.filter((i) => i.kind === 'compromisso').length, 0);

  const quick = [
    ['Exames', h.exams.tracked ? `${plural(h.exams.tracked, 'acompanhado', 'acompanhados')}${h.exams.last ? ' · último ' + fmtDate(h.exams.last).slice(0, 5) : ''}` : 'Lançar o primeiro', '#a78bfa', '#/exames'],
    ['Consultas', `${plural(h.consultations.total, 'registrada', 'registradas')}${h.consultations.next ? ' · próxima ' + fmtDate(h.consultations.next).slice(0, 5) : ''}`, '#22c7b0', '#/consultas'],
    ['Medicamentos', h.medications.active ? `${h.medications.active} em uso` : 'Nenhum em uso', '#38bdf8', '#/medicamentos'],
    ['Laudos de imagem', h.imaging.total ? plural(h.imaging.total, 'laudo guardado', 'laudos guardados') : 'Tomografia, ultrassom…', '#60a5fa', '#/exames?ver=laudos'],
    ['Vacinas', h.vaccines.total ? `${plural(h.vaccines.total, 'dose registrada', 'doses registradas')}${h.vaccines.next ? ' · próxima ' + fmtDate(h.vaccines.next).slice(0, 5) : ''}` : 'Registrar a primeira', '#a8e063', '#/vacinas'],
    ['Pendências', h.pending.count ? `${plural(h.pending.count, 'aberta', 'abertas')}` : 'Nenhuma aberta', '#fb923c', '#/pendencias'],
    ['Documentos', plural(h.documents.total, 'guardado', 'guardados'), '#fbbf24', '#/documentos'],
    ['Medições', h.measurements.last ? `última ${ago(h.measurements.last)}, ${h.measurements.last.slice(11, 16)}` : 'Registrar a primeira', '#34d399', '#/saude'],
    ['Relatórios', 'Resumo para levar à consulta', '#f87171', '#/relatorios'],
  ];

  const headline = h.empty ? 'Comece cadastrando o que já tem em mãos.'
    : h.pending.count ? `Acompanhamento em dia, com ${plural(h.pending.count, 'item', 'itens')} para revisar.` : 'Tudo em dia por aqui.';

  return html`
  <div class="home">
    <div class="home-head"><h1>${greet}</h1></div>

    <section class="kpis" aria-label="Resumo">${kpis}</section>

    <div class="home-grid">
      <section class="glass-panel">
        <div class="panel-head"><h2>Próximos 7 dias</h2>
          <span class="muted small">${apptCount ? `${plural(apptCount, 'compromisso', 'compromissos')}` : 'Nenhum compromisso'}${h.today_meds.times.length ? ` · remédio todo dia às ${h.today_meds.times.join(', ')}` : ''}</span>
          <a href="#/agenda" class="small">Abrir agenda</a></div>
        <div class="week">${h.week.map((d, i) => {
          const dt = parseISO(d.date);
          return html`<a class="day ${i === 0 ? 'is-today' : ''}" href="#/agenda?modo=dia&d=${d.date}">
            <span class="day-head"><small>${i === 0 ? 'hoje' : WD[dt.getDay()]}</small><b>${dt.getDate()}</b></span>
            ${d.items.length ? d.items.map((it) => html`<span class="chip-${it.kind}" title="${KIND[it.kind]}"><b>${it.time || (it.kind === 'receita' ? 'receita' : '—')}</b><span class="sr">${KIND[it.kind]}</span></span>`) : html`<span class="free">livre</span>`}
          </a>`;
        })}</div>
        <div class="legend-row"><span><i class="chip-compromisso"></i>Compromisso</span><span><i class="chip-remedio"></i>Remédio</span><span><i class="chip-receita"></i>Renovar receita</span></div>
        <p class="small muted" style="margin:0">Os detalhes de cada compromisso e remédio ficam na Agenda e em Medicamentos.</p>
      </section>

      <section class="glass-panel">
        <h2>Acesso rápido</h2>
        <div class="quick">${quick.map(([t, d, c, href]) => html`<a href="${href}"><i style="background:${c}"></i><span><b>${t}</b><small>${d}</small></span><em aria-hidden="true">›</em></a>`)}</div>
      </section>

      <aside class="summary">
        <span class="eyebrow">Resumo</span>
        <h2>${headline}</h2>
        <p>${h.exams.tracked ? html`Você acompanha <b class="hl">${plural(h.exams.tracked, 'exame', 'exames')}</b>` : 'Nenhum exame lançado ainda'}${h.medications.active ? html` e tem <b>${plural(h.medications.active, 'remédio', 'remédios')} em uso</b>` : ''}.
          ${h.next ? html` O próximo compromisso é <b>${relText(h.next.date)}</b>.` : ''}</p>
        <a class="focus f1" href="#/agenda"><span>Foco 1 · Agenda</span>${h.next
          ? `Compromisso ${WEEKDAYS[nd.getDay()]}${h.next.time ? ' às ' + h.next.time : ''}${h.next.more ? `. Mais ${h.next.more} nos próximos 30 dias.` : '.'}`
          : 'Nenhum compromisso marcado.'}</a>
        <a class="focus f2" href="#/pendencias"><span>Foco 2 · Pendências</span>${h.pending.count ? `${plural(h.pending.count, 'item aguarda', 'itens aguardam')} providência em ${h.pending.areas.join(', ')}. Clique para ver.` : 'Nada pendente.'}</a>
        <a class="focus f3" href="#/configuracoes/backup"><span>Foco 3 · Backup</span>${h.backup.last_auto ? `Cópia automática em ${fmtDate(h.backup.last_auto)}.` : 'Nenhuma cópia automática ainda.'} ${h.backup.last_file ? `Último backup em arquivo ${ago(h.backup.last_file)}.` : 'Nenhum backup em arquivo — faça um.'}</a>
      </aside>
    </div>
    ${h.empty ? html`<p class="muted" style="margin-top:1rem">Use o botão <b>Lançar</b> no menu para cadastrar exames, consultas, remédios ou documentos.</p>` : ''}
  </div>`;
}

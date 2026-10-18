import { api, html, icon, view, fmtDate, fmtNum, sitTag, trendTag, today, addDays, statusTag } from '../lib.js';

// ---------------------------------------------------------------- Busca global
export async function search({ query }) {
  const r = await api(`/search?q=${encodeURIComponent(query.q || '')}`);
  const input = document.getElementById('searchInput'); if (input) input.value = query.q || '';
  const total = r.groups.reduce((n, g) => n + g.items.length, 0);
  return html`<h1>Busca: “${r.query}”</h1>
    <p class="muted">${total ? `${total} resultado(s)` : 'Nada encontrado.'}${r.years?.length ? ` · filtrando ${r.years.join(', ')}` : ''}</p>
    ${!total ? html`<div class="card"><p>Dicas: busque pelo nome do exame (“creatinina”), do medicamento, do médico, da especialidade, um sintoma ou diagnóstico registrado, ou um ano (“creatinina 2025 2026”).</p></div>` : ''}
    ${r.groups.map((g) => html`<div class="card" style="margin-bottom:1rem"><h2>${g.title} <span class="small muted">${g.items.length}</span></h2>
      <ul class="list">${g.items.slice(0, 100).map((i) => html`<li><a class="row-link grow" href="${i.link}"><div class="title">${i.title}</div>
        ${i.date ? html`<div class="meta">${fmtDate(i.date)}</div>` : ''}</a>
        ${['acima', 'abaixo', 'dentro'].includes(i.extra) ? sitTag(i.extra) : i.extra ? html`<span class="meta">${String(i.extra).slice(0, 80)}</span>` : ''}</li>`)}</ul></div>`)}`;
}

// ---------------------------------------------------------------- Módulos das próximas etapas
const SOON = {
  ia: ['Assistente de IA', 'Perguntas como “Mostre a evolução da creatinina nos últimos 12 meses” ou “Prepare um resumo dos últimos 6 meses para o nefrologista”. A IA apenas organiza informações — nunca dá diagnóstico — e só funciona com sua autorização explícita.', 'A API já monta o contexto estruturado dos seus dados (/api/ai/context) e as regras de segurança; falta conectar o provedor (etapa 4).'],
};
export const placeholder = (key) => async () => {
  const [t, d, tech] = SOON[key];
  return html`<h1>${t}</h1><div class="card"><span class="tag pendente">Próxima etapa</span><p style="margin-top:.75rem">${d}</p><p class="small muted">${tech}</p>
    ${key === 'ia' ? html`<p>Enquanto isso, o <a href="#/relatorios">Resumo para consulta</a> já reúne medicamentos, exames alterados e evolução para levar ao médico.</p>` : ''}</div>`;
};

// ---------------------------------------------------------------- Relatório para consulta (imprimir / salvar em PDF)
export async function reports({ query }) {
  const months = Number(query.meses) || 6;
  const spec = query.esp || '';
  const from = addDays(today(), -Math.round(months * 30.4));
  const [profile, dash, markers, cons, meds] = await Promise.all([api('/profile'), api('/dashboard'), api('/markers'), api('/consultations'), api('/medications')]);
  const consIn = cons.filter((c) => c.date >= from && c.status === 'realizada' && (!spec || c.specialty === spec));
  const changed = meds.filter((m) => m.versions_count > 1 || (m.start_date && m.start_date >= from));
  const recent = markers.filter((m) => m.last_date && m.last_date >= from);
  const histories = await Promise.all(recent.map((m) => api(`/markers/${m.id}/history?from=${addDays(from, -365)}`)));
  const specs = [...new Set(cons.map((c) => c.specialty).filter(Boolean))];
  const age = profile.birth_date ? Math.floor((Date.now() - new Date(profile.birth_date + 'T12:00:00')) / (365.25 * 864e5)) : null;
  return view(html`
    <div class="page-head no-print"><h1>Relatórios</h1><button class="btn primary" id="print">${icon('print')}Imprimir / salvar PDF</button></div>
    <div class="toolbar no-print">
      <label class="check">Período <select id="meses" style="width:auto">${[3, 6, 12, 24].map((n) => html`<option value="${n}" ${n === months ? 'selected' : ''}>últimos ${n} meses</option>`)}</select></label>
      <label class="check">Especialidade <select id="esp" style="width:auto"><option value="">todas</option>${specs.map((s) => html`<option ${s === spec ? 'selected' : ''}>${s}</option>`)}</select></label>
    </div>
    <div class="note no-print" style="margin-bottom:1rem">Use “Imprimir / salvar PDF” e escolha “Salvar como PDF” no seu navegador. O relatório completo em PDF chega na etapa 3.</div>

    <div class="card stack" id="report">
      <div><h1 style="margin-bottom:.2rem">Resumo para consulta${spec ? ' — ' + spec : ''}</h1>
        <p class="muted">${profile.full_name || ''}${age != null ? ` · ${age} anos` : ''}${profile.blood_type ? ' · ' + profile.blood_type : ''} · período: ${fmtDate(from)} a ${fmtDate(today())}</p>
        ${profile.allergies ? html`<p><b>Alergias:</b> ${profile.allergies}</p>` : ''}${profile.conditions ? html`<p><b>Condições informadas:</b> ${profile.conditions}</p>` : ''}</div>

      <div><h2>Medicamentos em uso</h2>${dash.medications.length ? html`<ul>${dash.medications.map((m) => html`<li><b>${m.name} ${m.dosage || ''}</b> — ${[m.frequency, m.schedule].filter(Boolean).join(', ')}</li>`)}</ul>` : html`<p class="empty">Nenhum.</p>`}
        ${changed.length ? html`<p><b>Alterações / inícios no período:</b> ${changed.map((m) => `${m.name} (${m.status})`).join('; ')}</p>` : ''}</div>

      <div><h2>Consultas no período</h2>${consIn.length ? html`<ul>${consIn.map((c) => html`<li>${fmtDate(c.date)} — ${c.specialty || 'consulta'}${c.doctor_name ? ' (' + c.doctor_name + ')' : ''}${c.diagnoses ? html`<br><span class="muted">Diagnóstico informado: ${c.diagnoses}</span>` : ''}${c.conduct ? html`<br><span class="muted">Conduta: ${c.conduct}</span>` : ''}</li>`)}</ul>` : html`<p class="empty">Nenhuma.</p>`}</div>

      <div><h2>Exames do período</h2>${histories.length ? html`<div class="table-wrap"><table><thead><tr><th>Exame</th><th class="num">Último</th><th>Data</th><th>Referência</th><th>Situação</th><th>Anterior</th><th>Variação</th></tr></thead><tbody>
        ${histories.map((h) => { const p = h.points; const l = p[p.length - 1]; const prev = p[p.length - 2];
          return html`<tr><td><b>${h.marker.name}</b></td><td class="num">${l.value_num != null ? fmtNum(l.value_num, 3) : l.value_text} ${l.unit || ''}</td><td>${fmtDate(l.date)}</td><td>${l.ref_label}</td><td>${sitTag(l.situation)}</td>
            <td>${prev ? `${prev.value_num != null ? fmtNum(prev.value_num, 3) : prev.value_text} (${fmtDate(prev.date)})` : '—'}</td><td>${trendTag(l.trend)}</td></tr>`; })}
      </tbody></table></div>` : html`<p class="empty">Nenhum exame no período.</p>`}</div>

      ${dash.indicators.length ? html`<div><h2>Indicadores (última medição)</h2><ul>${dash.indicators.map((i) => html`<li>${i.label}: <b>${i.type === 'pressao' ? `${fmtNum(i.last.value1)}/${fmtNum(i.last.value2)}` : fmtNum(i.last.value1)} ${i.unit}</b> em ${fmtDate(i.last.measured_at.slice(0, 10))}</li>`)}</ul></div>` : ''}

      ${dash.alerts.filter((a) => a.kind === 'exame_pendente').length ? html`<div><h2>Exames pedidos ainda não realizados</h2><ul>${dash.alerts.filter((a) => a.kind === 'exame_pendente').map((a) => html`<li>${a.text.replace('Exame pendente: ', '')}</li>`)}</ul></div>` : ''}

      <div><h2>Minhas perguntas e anotações</h2><textarea id="qs" placeholder="Escreva aqui o que quer perguntar ao médico. O texto aparece na impressão."></textarea></div>
      <p class="small muted">Documento de organização pessoal gerado pelo Helyx. Não contém diagnóstico; “acima/abaixo” compara com a referência do laudo.</p>
    </div>`, (el) => {
    const reload = () => { location.hash = `#/relatorios?meses=${el.querySelector('#meses').value}${el.querySelector('#esp').value ? '&esp=' + encodeURIComponent(el.querySelector('#esp').value) : ''}`; };
    el.querySelector('#meses').onchange = reload; el.querySelector('#esp').onchange = reload;
    const qs = el.querySelector('#qs');
    const grow = () => { qs.style.height = 'auto'; qs.style.height = qs.scrollHeight + 'px'; };
    qs.oninput = grow;
    el.querySelector('#print').onclick = () => { grow(); window.print(); };
  });
}
export { statusTag };

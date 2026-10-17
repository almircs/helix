import { api, html, icon, fields, readForm, toast, view, go, invalidate, fmtDate, confirmDialog } from '../lib.js';

const TABS = [['perfil', 'Meu perfil'], ['medicos', 'Médicos'], ['seguranca', 'Segurança e dados'], ['aparencia', 'Aparência']];
const ENTITY = { usuario: 'Conta', sessao: 'Acesso', perfil: 'Perfil', medico: 'Médico', consulta: 'Consulta', exame: 'Exame', marcador: 'Exame (catálogo)', medicamento: 'Medicamento', medicao: 'Medição', agenda: 'Agenda', dados: 'Dados', ia: 'IA' };

export function applyTheme() {
  let t = 'auto'; try { t = localStorage.getItem('tema') || 'auto'; } catch { /* sem armazenamento */ }
  if (t === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.dataset.theme = t;
}

export async function render({ params, query }) {
  const tab = TABS.some(([t]) => t === params[0]) ? params[0] : 'perfil';
  const head = html`<h1>Configurações</h1><div class="tabs">${TABS.map(([t, l]) => html`<a href="#/configuracoes/${t}" class="${t === tab ? 'on' : ''}">${l}</a>`)}</div>`;
  if (tab === 'perfil') return profile(head);
  if (tab === 'medicos') return doctors(head, query);
  if (tab === 'seguranca') return security(head);
  let cur = 'auto'; try { cur = localStorage.getItem('tema') || 'auto'; } catch { /* */ }
  return view(html`${head}<div class="card"><h2>Tema</h2><div class="seg">${[['auto', 'Automático'], ['light', 'Claro'], ['dark', 'Escuro']].map(([v, l]) => html`<button class="${cur === v ? 'on' : ''}" data-t="${v}">${l}</button>`)}</div></div>`, (el) => {
    el.querySelectorAll('[data-t]').forEach((b) => b.onclick = () => { try { localStorage.setItem('tema', b.dataset.t); } catch { /* */ } applyTheme(); go('#/configuracoes/aparencia'); });
  });
}

async function profile(head) {
  const p = await api('/profile');
  const age = p.birth_date ? Math.floor((Date.now() - new Date(p.birth_date + 'T12:00:00')) / (365.25 * 864e5)) : null;
  const bmi = p.weight_kg && p.height_cm ? p.weight_kg / (p.height_cm / 100) ** 2 : null;
  return view(html`${head}
    <form id="pform">
      <fieldset><legend>Dados pessoais</legend><div class="form-grid">
        ${fields([
          { name: 'full_name', label: 'Nome completo', full: true },
          { name: 'birth_date', label: 'Data de nascimento', type: 'date', hint: age != null ? `${age} anos` : '' },
          { name: 'sex', label: 'Sexo', type: 'select', options: [['', '—'], ['Feminino', 'Feminino'], ['Masculino', 'Masculino'], ['Outro', 'Outro']] },
          { name: 'weight_kg', label: 'Peso (kg)', type: 'number' }, { name: 'height_cm', label: 'Altura (cm)', type: 'number', hint: bmi ? `IMC calculado: ${bmi.toFixed(1).replace('.', ',')}` : '' },
          { name: 'blood_type', label: 'Tipo sanguíneo', type: 'select', options: [['', '—'], ...['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((x) => [x, x])] },
        ], p)}</div></fieldset>
      <fieldset><legend>Informações de saúde</legend><div class="form-grid">
        ${fields([
          { name: 'allergies', label: 'Alergias', type: 'textarea', placeholder: 'Medicamentos, alimentos, outros' },
          { name: 'conditions', label: 'Doenças / condições', type: 'textarea' },
          { name: 'emergency_contacts', label: 'Contatos de emergência', type: 'textarea', placeholder: 'Nome — parentesco — telefone' },
          { name: 'notes', label: 'Observações gerais', type: 'textarea' },
        ], p)}</div></fieldset>
      <fieldset><legend>Médicos de referência</legend>
        ${p.reference_doctors.length ? html`<ul class="list">${p.reference_doctors.map((d) => html`<li><div class="grow"><div class="title">${d.name}</div><div class="meta">${[d.specialty, d.phone].filter(Boolean).join(' · ')}</div></div></li>`)}</ul>` : html`<p class="empty">Nenhum médico marcado como referência.</p>`}
        <a class="btn small" href="#/configuracoes/medicos">Gerenciar médicos</a></fieldset>
      <div class="form-actions"><button class="btn primary">Salvar perfil</button></div>
    </form>
    <p class="small muted">Alergias, condições, contatos e observações são gravados criptografados.</p>`, (el) => {
    el.querySelector('#pform').onsubmit = async (e) => {
      e.preventDefault();
      try { await api('/profile', { method: 'PUT', body: readForm(e.target) }); toast('Perfil salvo'); go('#/configuracoes/perfil'); } catch (err) { toast(err.message, true); }
    };
  });
}

async function doctors(head, query) {
  const list = await api('/doctors');
  const editing = query.editar === 'novo' ? {} : list.find((d) => String(d.id) === query.editar) || null;
  return view(html`${head}
    <div class="page-head"><h2 style="margin:0">Médicos</h2><a class="btn primary" href="#/configuracoes/medicos?editar=novo">${icon('plus')}Novo médico</a></div>
    ${editing ? html`<div class="card" style="margin-bottom:1rem"><form id="dform"><div class="form-grid">
      ${fields([
        { name: 'name', label: 'Nome', required: true }, { name: 'specialty', label: 'Especialidade' }, { name: 'crm', label: 'CRM' },
        { name: 'phone', label: 'Telefone', type: 'tel' }, { name: 'email', label: 'E-mail', type: 'email' }, { name: 'address', label: 'Endereço / local de atendimento' },
        { name: 'is_reference', label: 'Médico de referência', type: 'checkbox' }, { name: 'notes', label: 'Observações', type: 'textarea', full: true },
      ], editing)}</div>
      <div class="form-actions"><button class="btn primary">Salvar</button><a class="btn" href="#/configuracoes/medicos">Cancelar</a>
        ${editing.id ? html`<button type="button" class="btn danger" id="ddel">${icon('trash')}Excluir</button>` : ''}</div></form></div>` : ''}
    <div class="card"><ul class="list">${list.map((d) => html`<li><div class="grow"><div class="title">${d.name} ${d.is_reference ? html`<span class="tag ativo">referência</span>` : ''}</div>
      <div class="meta">${[d.specialty, d.crm ? 'CRM ' + d.crm : null, d.phone].filter(Boolean).join(' · ')}</div></div>
      <a class="btn small" href="#/configuracoes/medicos?editar=${d.id}">${icon('edit')}Editar</a></li>`)}</ul>
      ${list.length ? '' : html`<p class="empty">Nenhum médico cadastrado.</p>`}</div>`, (el) => {
    const f = el.querySelector('#dform'); if (!f) return;
    f.querySelector('[name=name]').focus();
    f.onsubmit = async (e) => {
      e.preventDefault();
      try {
        await api(editing.id ? `/doctors/${editing.id}` : '/doctors', { method: editing.id ? 'PUT' : 'POST', body: readForm(f) });
        invalidate('doctors'); toast('Médico salvo'); go('#/configuracoes/medicos');
      } catch (err) { toast(err.message, true); }
    };
    el.querySelector('#ddel')?.addEventListener('click', async () => {
      if (!confirmDialog('Excluir este médico? Consultas e exames ligados a ele continuam cadastrados, sem o nome.')) return;
      await api(`/doctors/${editing.id}`, { method: 'DELETE' }); invalidate('doctors'); go('#/configuracoes/medicos');
    });
  });
}

async function security(head) {
  const [me, log, sys] = await Promise.all([api('/auth/me'), api('/audit?limit=60'), api('/system')]);
  return view(html`${head}
    <div class="grid g2">
      <div class="card"><h2>Trocar senha</h2><p class="meta">Conta: ${me.email}</p>
        <form id="pw" class="stack">${fields([{ name: 'current', label: 'Senha atual', type: 'password', required: true }, { name: 'password', label: 'Nova senha', type: 'password', required: true, hint: 'mín. 8, letras e números' }])}
        <button class="btn primary">Trocar senha</button></form></div>
      <div class="card"><h2>Seus dados</h2>
        <p>Baixe uma cópia completa e legível de tudo o que está cadastrado (formato JSON).</p>
        <a class="btn" href="/api/export" download>Exportar meus dados</a>
        <h3 style="margin-top:1.25rem">Cópias de segurança</h3>
        <p class="small">O programa faz uma cópia automática por dia ao abrir (guarda as últimas 30). ${sys.backups.length ? `Última: ${sys.backups[0].replace('auto-', '')}.` : 'Nenhuma cópia ainda.'}</p>
        <button class="btn" id="bk">Fazer cópia agora</button>
        <p class="small muted" style="margin-top:.75rem">Pasta dos dados: <code>${sys.data_dir}</code><br>Cópias em: <code>${sys.backups_dir}</code><br>
          Para guardar fora do computador, copie essa pasta para um pendrive ou nuvem. A cópia leva junto a chave de criptografia (<code>chave.key</code>): guarde em local seguro.</p>
        <p class="small muted">Nenhum dado é enviado a terceiros. O sistema roda neste computador.</p></div>
    </div>
    <div class="card" style="margin-top:1rem"><h2>Registro de alterações</h2>
      <div class="table-wrap"><table><thead><tr><th>Quando</th><th>O quê</th><th>Ação</th></tr></thead><tbody>
      ${log.map((l) => html`<tr><td>${new Date(l.at.replace(' ', 'T') + 'Z').toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</td><td>${ENTITY[l.entity] || l.entity}${l.entity_id ? ' #' + l.entity_id : ''}</td><td>${l.action}</td></tr>`)}
      </tbody></table></div></div>
    <div class="card" style="margin-top:1rem;border-color:var(--danger)"><h2 style="color:var(--danger)">Excluir conta e todos os dados</h2>
      <p>Apaga definitivamente seu cadastro, exames, consultas, medicamentos, agenda e histórico. Exporte seus dados antes, se quiser guardar uma cópia.</p>
      <form id="delacc" class="form-grid">${fields([{ name: 'password', label: 'Sua senha', type: 'password', required: true }, { name: 'confirm', label: 'Digite EXCLUIR', required: true }])}
        <div class="full"><button class="btn danger">Excluir tudo definitivamente</button></div></form></div>`, (el) => {
    el.querySelector('#bk').onclick = async () => {
      try { const r = await api('/backup', { method: 'POST' }); toast('Cópia criada em ' + r.path); } catch (err) { toast(err.message, true); }
    };
    el.querySelector('#pw').onsubmit = async (e) => {
      e.preventDefault();
      try { await api('/auth/password', { method: 'POST', body: readForm(e.target) }); toast('Senha alterada'); e.target.reset(); } catch (err) { toast(err.message, true); }
    };
    el.querySelector('#delacc').onsubmit = async (e) => {
      e.preventDefault();
      if (!confirmDialog('Tem certeza? Esta ação não pode ser desfeita.')) return;
      try { await api('/account/delete', { method: 'POST', body: readForm(e.target) }); location.hash = '#/cadastro'; location.reload(); } catch (err) { toast(err.message, true); }
    };
  });
}

import { api, html, icon, fields, readForm, toast, view, go, invalidate, fmtDate, confirmDialog, askConfirm, showRecoveryCode, capsLockHint } from '../lib.js';

const TABS = [['perfil', 'Meu perfil'], ['medicos', 'Médicos'], ['backup', 'Backup'], ['seguranca', 'Segurança e dados'], ['aparencia', 'Aparência']];
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
  if (tab === 'backup') return backupView(head);
  let cur = 'auto'; try { cur = localStorage.getItem('tema') || 'auto'; } catch { /* */ }
  return view(html`${head}<div class="card"><h2>Tema</h2><div class="seg">${[['auto', 'Escuro (padrão)'], ['light', 'Claro']].map(([v, l]) => html`<button class="${cur === v ? 'on' : ''}" data-t="${v}">${l}</button>`)}</div></div>`, (el) => {
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
      ${me.login ? html`<div class="card"><h2>Conta</h2><p>Você entrou como <b>${me.email}</b>.</p>
        <div class="actions" style="display:flex;gap:.6rem;flex-wrap:wrap"><button class="btn" id="switchUser">Trocar de usuário</button><button class="btn" id="newUser">Criar conta para outra pessoa</button></div>
        <p class="small muted">Cada conta tem os próprios exames, consultas, remédios e documentos.</p></div>
        <div class="card"><h2>Redefinir senha</h2>
        <form id="pw" class="stack">${fields([{ name: 'current', label: 'Senha atual', type: 'password', required: true }, { name: 'password', label: 'Nova senha', type: 'password', required: true, hint: 'mín. 8, letras e números' }, { name: 'password2', label: 'Repita a nova senha', type: 'password', required: true }])}
        <button class="btn primary">Redefinir senha</button></form>
        <p class="small muted">Esqueceu a senha atual? Saia e use <b>Esqueci minha senha</b> na tela de entrada.</p></div>
        <div class="card"><h2>Código de recuperação</h2>
        <p>${me.has_recovery ? html`Você tem um código de recuperação, criado em ${fmtDate(String(me.recovery_created_at || '').slice(0, 10))}.` : html`<b>Você ainda não tem um código de recuperação.</b> Gere um e guarde fora do computador.`}</p>
        <form id="newCode" class="stack">${fields([{ name: 'password', label: 'Sua senha', type: 'password', required: true }])}
        <button class="btn">${me.has_recovery ? 'Gerar um novo código' : 'Gerar código de recuperação'}</button></form>
        <p class="small muted">Um código novo substitui o anterior. Ele serve para criar uma nova senha se você esquecer a atual.</p></div>` : html`<div class="card"><h2>Acesso</h2>
        <p>O programa está abrindo <b>sem senha</b>, direto no seu perfil deste computador.</p>
        <p class="small muted">Quem usar este computador consegue ver os dados. Os campos sensíveis continuam gravados criptografados no disco. Para pedir usuário e senha, deixe de definir SAUDE_EXIGIR_LOGIN=0.</p></div>`}
      <div class="card"><h2>Seus dados</h2>
        <p>Para salvar ou restaurar seus dados, use a aba <a href="#/configuracoes/backup">Backup</a>.</p>
        <p class="small muted">Pasta dos dados neste computador: <code>${sys.data_dir}</code></p>
        <p class="small muted">Nenhum dado é enviado a terceiros. O sistema roda neste computador.</p></div>
    </div>
    <div class="card" style="margin-top:1rem"><h2>Registro de alterações</h2>
      <div class="table-wrap"><table><thead><tr><th>Quando</th><th>O quê</th><th>Ação</th></tr></thead><tbody>
      ${log.map((l) => html`<tr><td>${new Date(l.at.replace(' ', 'T') + 'Z').toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</td><td>${ENTITY[l.entity] || l.entity}${l.entity_id ? ' #' + l.entity_id : ''}</td><td>${l.action}</td></tr>`)}
      </tbody></table></div></div>
    <div class="card" style="margin-top:1rem;border-color:var(--danger)"><h2 style="color:var(--danger)">Excluir conta e todos os dados</h2>
      <p>Apaga definitivamente seu cadastro, exames, consultas, medicamentos, agenda e histórico. Faça um <a href="#/configuracoes/backup">backup</a> antes, se quiser guardar uma cópia.</p>
      <form id="delacc" class="form-grid">${fields([...(me.login ? [{ name: 'password', label: 'Sua senha', type: 'password', required: true }] : []), { name: 'confirm', label: 'Digite EXCLUIR', required: true }])}
        <div class="full"><button class="btn danger">Excluir tudo definitivamente</button></div></form></div>`, (el) => {
    const leave = async (to) => { await api('/auth/logout', { method: 'POST' }); location.hash = to; location.reload(); };
    el.querySelector('#switchUser')?.addEventListener('click', () => leave('#/entrar'));
    el.querySelector('#newUser')?.addEventListener('click', () => leave('#/cadastro'));
    el.querySelector('#pw')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = readForm(e.target);
      if (body.password !== body.password2) { toast('As duas senhas não são iguais.', true); return; }
      delete body.password2;
      try {
        await api('/auth/password', { method: 'POST', body }); e.target.reset();
        await askConfirm({ title: 'Senha redefinida', message: `A nova senha da conta ${me.email} foi cadastrada em ${new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}. Use-a na próxima vez que entrar.`, button: 'OK' });
      } catch (err) { toast(err.message, true); }
    });
    el.querySelector('#newCode')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const r = await api('/auth/recovery-code', { method: 'POST', body: readForm(e.target) }); e.target.reset();
        await showRecoveryCode(r.recovery_code, { title: 'Novo código de recuperação', intro: 'O código anterior deixou de valer.' });
        go('#/configuracoes/seguranca');
      } catch (err) { toast(err.message, true); }
    });
    el.querySelectorAll('[type=password]').forEach(capsLockHint);
    el.querySelector('#delacc').onsubmit = async (e) => {
      e.preventDefault();
      if (!confirmDialog('Tem certeza? Esta ação não pode ser desfeita.')) return;
      try { await api('/account/delete', { method: 'POST', body: readForm(e.target) }); location.hash = me.login ? '#/cadastro' : '#/'; location.reload(); } catch (err) { toast(err.message, true); }
    };
  });
}

// ---------------------------------------------------------------- Backup e restauração
const fmtWhen = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—');
const countsText = (c) => [`${c.consultas} consulta(s)`, `${c.exames} exame(s)`, `${c.resultados} resultado(s)`, `${c.medicamentos} medicamento(s)`, `${c.medicoes} medição(ões)`, `${c.agenda} compromisso(s)`].join(' · ');

async function backupView(head) {
  const [list, sys] = await Promise.all([api('/backup/list'), api('/system')]);
  return view(html`${head}
    <div class="grid g2">
      <div class="card"><h2>Fazer backup</h2>
        <p>Salva um arquivo <b>.helyx</b> com todos os seus dados: perfil, médicos, consultas, exames, medicamentos, medições e agenda.</p>
        <p class="small muted">Guarde o arquivo num pendrive, e-mail ou nuvem. Ele pode ser restaurado neste ou em outro computador. Atenção: o arquivo contém seus dados de saúde — guarde em local seguro.</p>
        <div style="display:flex;gap:.5rem;flex-wrap:wrap"><a class="btn primary" href="/api/backup/download" download id="dl">Salvar arquivo de backup</a>
        <button class="btn" id="bk">Guardar cópia neste computador</button></div></div>
      <div class="card"><h2>Restaurar de um arquivo</h2>
        <p>Escolha o arquivo de backup (<b>.helyx</b>). Os dados atuais serão <b>substituídos</b> pelos do arquivo.</p>
        ${window.HELYX_MOBILE ? html`<p class="small muted">No celular: se o arquivo veio pelo WhatsApp ou e-mail, salve-o antes (iPhone: tocar no arquivo → Compartilhar → <b>Salvar em Arquivos</b>; Android: <b>Baixar</b>). Depois, aqui, procure em <b>Arquivos</b> / <b>Downloads</b>.</p>` : ''}
        <p class="small muted">Antes de restaurar, o Helyx guarda automaticamente uma cópia do que existe hoje, para você poder voltar atrás.</p>
        <label class="btn" for="file" style="width:auto">Escolher arquivo…</label>
        <input type="file" id="file" style="display:none">
        <div id="preview"></div></div>
    </div>
    <div class="card" style="margin-top:1rem"><h2>Cópias guardadas neste computador <span class="small muted">${list.length}</span></h2>
      <p class="small muted">O Helyx faz uma cópia automática por dia ao abrir e guarda as últimas 30.</p>
      ${list.length ? html`<div class="table-wrap"><table class="bk-table"><thead><tr><th>Data</th><th>Tipo</th><th class="bk-content">Conteúdo</th><th></th></tr></thead><tbody>
        ${list.map((b) => html`<tr><td><b>${fmtWhen(b.exportado_em)}</b></td><td><span class="tag">${b.kind}</span></td>
          <td class="small bk-content">${b.erro ? 'arquivo ilegível' : countsText(b)}</td>
          <td style="text-align:right">${b.erro ? '' : html`<button class="btn small" data-restore="${b.name}" data-when="${fmtWhen(b.exportado_em)}">Restaurar</button>`}</td></tr>`)}
      </tbody></table></div>` : html`<p class="empty">Nenhuma cópia ainda.</p>`}
      <p class="small muted">Pasta: <code>${sys.backups_dir}</code></p></div>`, (el) => {
    const doRestore = async (body, label) => {
      const typed = await askConfirm({ title: `Restaurar ${label}?`, message: 'Os dados atuais serão substituídos pelos do backup. Antes disso, o Helyx guarda uma cópia do que existe hoje.', word: 'RESTAURAR', button: 'Restaurar', danger: true });
      if (!typed) return;
      try {
        const r = await api('/backup/restore', { method: 'POST', body: { ...body, confirm: typed } });
        toast(`Backup restaurado: ${r.consultas} consulta(s), ${r.exames} exame(s), ${r.medicamentos} medicamento(s)`);
        invalidate('doctors'); go('#/configuracoes/backup');
      } catch (err) { toast(err.message, true); }
    };
    el.querySelector('#bk').onclick = async () => {
      try { await api('/backup', { method: 'POST' }); toast('Cópia guardada neste computador'); go('#/configuracoes/backup'); } catch (err) { toast(err.message, true); }
    };
    el.querySelectorAll('[data-restore]').forEach((b) => b.onclick = () => doRestore({ name: b.dataset.restore }, `a cópia de ${b.dataset.when}`));
    el.querySelector('#file').onchange = async (e) => {
      const f = e.target.files[0]; if (!f) return;
      const box = el.querySelector('#preview');
      let data;
      // qualquer arquivo pode ser escolhido (o celular não reconhece ".helyx" e o WhatsApp/e-mail às vezes muda o nome); vale o conteúdo
      try { data = JSON.parse((await f.text()).replace(/^﻿/, '')); } catch { box.innerHTML = html`<p class="alert atencao" style="margin-top:.75rem">Este arquivo não é um backup do Helyx. Escolha o arquivo baixado em <b>Baixar backup</b> (nome parecido com helyx-backup-2026-11-01.helyx).</p>`.__raw; e.target.value = ''; return; }
      try {
        const p = await api('/backup/preview', { method: 'POST', body: { data } });
        box.innerHTML = html`<div class="note" style="margin-top:.75rem"><b>${f.name}</b><br>Backup de ${fmtWhen(p.exportado_em)}<br><span class="small">${countsText(p)}</span></div>
          <button class="btn primary" id="go" style="margin-top:.75rem">Restaurar este backup</button>`.__raw;
        box.querySelector('#go').onclick = () => doRestore({ data }, `o backup de ${fmtWhen(p.exportado_em)}`);
      } catch (err) { box.innerHTML = html`<p class="alert atencao" style="margin-top:.75rem">${err.message}</p>`.__raw; }
      e.target.value = '';
    };
  });
}

// Pendências: o que pede uma providência. As automáticas vêm dos dados (pedido de exame ainda não feito,
// exame fora da referência, receita perto do fim, vacina com dose vencendo); a pessoa registra a ação em
// andamento, o status e o prazo. Também dá para criar pendências próprias.
const { all, get, run } = require('../db');
const { encrypt, decrypt } = require('../lib/crypto');
const { HttpError } = require('../lib/http');
const audit = require('../lib/audit');

const STATUS = ['pendente', 'em_andamento', 'concluida', 'cancelada'];
const OPEN = ['pendente', 'em_andamento'];
// Nome genérico de cada tipo (usado na página inicial, que não mostra nada privado)
const AREA = { pedido: 'Pedidos de exame', fora: 'Exames', receita: 'Medicamentos', vacina: 'Vacinas', manual: 'Outras' };

const localDate = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const plusDays = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const br = (s) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : '');

// Pendências automáticas, calculadas a partir dos dados atuais
function automatic(userId) {
  const today = localDate();
  const out = [];
  for (const r of all(`SELECT r.id, r.description, c.id cid, c.date, c.specialty FROM exam_requests r JOIN consultations c ON c.id = r.consultation_id
    WHERE r.user_id = ? AND r.status = 'pendente' ORDER BY c.date`, userId))
    out.push({ key: `pedido:${r.id}`, kind: 'pedido', title: `Fazer o exame pedido: ${r.description}`, detail: `Pedido na consulta de ${br(r.date)}${r.specialty ? ' (' + r.specialty + ')' : ''}`, link: `#/consultas/${r.cid}`, since: r.date });
  const { listMarkers } = require('./exams');
  for (const m of listMarkers(userId)) if (m.last_situation === 'acima' || m.last_situation === 'abaixo')
    out.push({ key: `fora:${m.id}`, kind: 'fora', title: `${m.name} ${m.last_situation} da referência`, detail: `Último resultado: ${m.last_value ?? ''} ${m.unit || ''} em ${br(m.last_date)}`.replace(/\s+/g, ' '), link: `#/exames/marcador/${m.id}`, since: m.last_date });
  for (const m of all("SELECT id, name, dosage, end_date FROM medications WHERE user_id = ? AND status = 'ativo' AND end_date IS NOT NULL AND end_date <= ?", userId, plusDays(today, 15)))
    out.push({ key: `receita:${m.id}`, kind: 'receita', title: `Renovar a receita: ${m.name}${m.dosage ? ' ' + m.dosage : ''}`, detail: m.end_date < today ? `Terminou em ${br(m.end_date)}` : `Termina em ${br(m.end_date)}`, link: `#/medicamentos/${m.id}`, since: m.end_date });
  // só a próxima dose do registro mais recente de cada vacina (uma dose nova substitui a previsão antiga)
  for (const v of all(`SELECT v.id, v.name, v.dose, v.next_date FROM vaccines v WHERE v.user_id = ? AND v.next_date IS NOT NULL AND v.next_date <= ? AND NOT EXISTS (SELECT 1 FROM vaccines w WHERE w.user_id = v.user_id AND w.name = v.name COLLATE NOCASE AND w.id != v.id AND COALESCE(w.applied_date, '') > COALESCE(v.applied_date, ''))`, userId, plusDays(today, 30)))
    out.push({ key: `vacina:${v.id}`, kind: 'vacina', title: `Vacina: ${v.name}${v.dose ? ' — próxima dose' : ''}`, detail: v.next_date < today ? `Estava prevista para ${br(v.next_date)}` : `Prevista para ${br(v.next_date)}`, link: '#/vacinas', since: v.next_date });
  return out;
}

const shape = (row) => ({ action: decrypt(row.action) || '', status: row.status, due_date: row.due_date || null, updated_at: row.updated_at });

function list(userId) {
  const saved = new Map(all('SELECT * FROM pendencias WHERE user_id = ? AND source IS NOT NULL', userId).map((r) => [r.source, r]));
  const items = automatic(userId).map((a) => {
    const s = saved.get(a.key);
    // exame fora da referência com resultado novo depois da última edição: volta a ficar pendente
    const stale = s && a.kind === 'fora' && a.since && String(s.updated_at).slice(0, 10) < a.since && !OPEN.includes(s.status);
    return { ...a, auto: true, action: '', status: 'pendente', due_date: null, ...(s && !stale ? shape(s) : {}) };
  });
  for (const r of all('SELECT * FROM pendencias WHERE user_id = ? AND source IS NULL ORDER BY created_at', userId))
    items.push({ key: `manual:${r.id}`, kind: 'manual', auto: false, title: decrypt(r.title), detail: null, link: null, since: r.created_at.slice(0, 10), ...shape(r) });
  const order = (x) => (x.due_date || '9999') + (x.since || '');
  return {
    open: items.filter((x) => OPEN.includes(x.status)).sort((a, b) => order(a).localeCompare(order(b))),
    done: items.filter((x) => !OPEN.includes(x.status)).sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || ''))),
  };
}

// Resumo para a página inicial: só a quantidade e os tipos (sem nomes)
function summary(userId) {
  const { open } = list(userId);
  return { count: open.length, areas: [...new Set(open.map((x) => AREA[x.kind]))] };
}

function clean(body) {
  const out = {};
  if ('status' in body) { if (!STATUS.includes(body.status)) throw new HttpError(400, 'Status inválido.'); out.status = body.status; }
  if ('action' in body) out.action = encrypt(String(body.action || '').trim().slice(0, 2000) || null);
  if ('due_date' in body) {
    if (body.due_date && !/^\d{4}-\d{2}-\d{2}$/.test(body.due_date)) throw new HttpError(400, 'Prazo inválido.');
    out.due_date = body.due_date || null;
  }
  if ('title' in body) { const t = String(body.title || '').trim().slice(0, 300); if (!t) throw new HttpError(400, 'Descreva a pendência.'); out.title = encrypt(t); }
  return out;
}

function create(userId, body) {
  const data = clean({ status: 'pendente', ...body });
  if (!data.title) throw new HttpError(400, 'Descreva a pendência.');
  const id = Number(run('INSERT INTO pendencias (user_id, title, action, status, due_date) VALUES (?, ?, ?, ?, ?)', userId, data.title, data.action ?? null, data.status, data.due_date ?? null).lastInsertRowid);
  audit.log(userId, 'pendencia', id, 'criar', null, null);
  return { ok: true, key: `manual:${id}` };
}

// Atualiza ação, status e prazo; nas automáticas guarda junto da origem (ex.: "pedido:12")
function update(userId, key, body) {
  const [kind, idStr] = String(key).split(':');
  const data = clean(body);
  delete data.title;
  if (kind === 'manual') {
    const r = get('SELECT * FROM pendencias WHERE id = ? AND user_id = ? AND source IS NULL', Number(idStr), userId);
    if (!r) throw new HttpError(404, 'Pendência não encontrada.');
    if ('title' in body) data.title = clean({ title: body.title }).title;
    const cols = Object.keys(data);
    if (cols.length) run(`UPDATE pendencias SET ${cols.map((c) => c + ' = ?').join(', ')}, updated_at = datetime('now') WHERE id = ?`, ...cols.map((c) => data[c]), r.id);
  } else {
    if (!automatic(userId).some((a) => a.key === key)) throw new HttpError(404, 'Esta pendência não existe mais.');
    if (!get('SELECT 1 FROM pendencias WHERE user_id = ? AND source = ?', userId, key)) run('INSERT INTO pendencias (user_id, source) VALUES (?, ?)', userId, key);
    const cols = Object.keys(data);
    if (cols.length) run(`UPDATE pendencias SET ${cols.map((c) => c + ' = ?').join(', ')}, updated_at = datetime('now') WHERE user_id = ? AND source = ?`, ...cols.map((c) => data[c]), userId, key);
  }
  audit.log(userId, 'pendencia', null, 'alterar', null, { pendencia: key, status: body.status });
  return { ok: true };
}

function remove(userId, key) {
  const [kind, idStr] = String(key).split(':');
  if (kind !== 'manual') throw new HttpError(400, 'Pendências automáticas não podem ser excluídas: marque como concluída ou cancelada.');
  run('DELETE FROM pendencias WHERE id = ? AND user_id = ? AND source IS NULL', Number(idStr), userId);
  audit.log(userId, 'pendencia', Number(idStr), 'excluir', null, null);
  return { ok: true };
}

module.exports = { list, summary, create, update, remove, STATUS };

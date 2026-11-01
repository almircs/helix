// Categorias dos exames (Coração, Rins, Próstata, Tireoide…): criar, renomear, ordenar, excluir,
// mover exames e sugerir a categoria de um laudo pelo nome do exame e pela indicação.
const { all, get, run, tx } = require('../db');
const { HttpError } = require('../lib/http');
const audit = require('../lib/audit');
const { normalize } = require('../lib/extract/catalog');

// Sugestões: nome → começos de palavra que aparecem no nome do exame, na indicação ou na conclusão
const SUGGESTED = [
  ['Coração', ['coracao', 'cardiac', 'cardio', 'ecocardiograma', 'eletrocardiograma', 'holter', 'teste ergometrico', 'coronar', 'miocard', 'valva', 'valvar']],
  ['Rins e vias urinárias', ['rim', 'rins', 'renal', 'renais', 'nefro', 'ureter', 'bexiga', 'vias urinarias', 'urinari']],
  ['Próstata', ['prostat']],
  ['Tireoide', ['tireoid', 'tiroid']],
  ['Abdômen', ['abdome', 'abdomen', 'abdominal', 'figado', 'hepatic', 'vesicula', 'pancreas', 'baco', 'vias biliares']],
  ['Tórax e pulmões', ['torax', 'toracic', 'pulmao', 'pulmoes', 'pulmonar']],
  ['Cabeça e cérebro', ['cranio', 'cerebr', 'encefal', 'cabeca', 'sela turcica', 'seios da face']],
  ['Coluna', ['coluna', 'lombar', 'lombossacr', 'cervical']],
  ['Mamas', ['mama', 'mamas', 'mamari', 'mamografia']],
  ['Ossos e articulações', ['joelho', 'ombro', 'quadril', 'tornozelo', 'punho', 'cotovelo', 'densitometria', 'osse', 'articula']],
  ['Vasos', ['doppler', 'carotid', 'venos', 'arterial', 'varizes', 'vascular']],
  ['Estômago e intestino', ['endoscopia', 'colonoscopia', 'estomago', 'intestin', 'esofag', 'colon']],
];

function list(userId) {
  return all(`SELECT c.id, c.name, c.position, (SELECT COUNT(*) FROM exams e WHERE e.category_id = c.id) AS exams
    FROM exam_categories c WHERE c.user_id = ? ORDER BY c.position, c.name COLLATE NOCASE`, userId);
}

function cleanName(n) {
  const name = String(n || '').trim().replace(/\s+/g, ' ').slice(0, 60);
  if (!name) throw new HttpError(400, 'Informe o nome da categoria.');
  return name;
}
function own(userId, id) {
  const c = get('SELECT * FROM exam_categories WHERE id = ? AND user_id = ?', Number(id), userId);
  if (!c) throw new HttpError(404, 'Categoria não encontrada.');
  return c;
}

function create(userId, body) {
  const name = cleanName(body.name);
  if (get('SELECT 1 FROM exam_categories WHERE user_id = ? AND name = ? COLLATE NOCASE', userId, name)) throw new HttpError(409, `Já existe a categoria "${name}".`);
  const pos = (get('SELECT MAX(position) p FROM exam_categories WHERE user_id = ?', userId).p ?? -1) + 1;
  const id = Number(run('INSERT INTO exam_categories (user_id, name, position) VALUES (?, ?, ?)', userId, name, pos).lastInsertRowid);
  audit.log(userId, 'categoria', id, 'criar', null, { name });
  return { id, name, position: pos, exams: 0 };
}

function rename(userId, id, body) {
  const c = own(userId, id);
  const name = cleanName(body.name);
  if (get('SELECT 1 FROM exam_categories WHERE user_id = ? AND name = ? COLLATE NOCASE AND id != ?', userId, name, c.id)) throw new HttpError(409, `Já existe a categoria "${name}".`);
  run('UPDATE exam_categories SET name = ? WHERE id = ?', name, c.id);
  audit.log(userId, 'categoria', c.id, 'renomear', { name: c.name }, { name });
  return { ok: true };
}

// Nova ordem: lista de ids na ordem desejada
function reorder(userId, ids = []) {
  tx(() => ids.forEach((id, i) => run('UPDATE exam_categories SET position = ? WHERE id = ? AND user_id = ?', i, Number(id), userId)));
  return list(userId);
}

// Excluir: os exames não são apagados; ficam sem categoria, ou vão para outra, se indicada
function remove(userId, id, moveTo = null) {
  const c = own(userId, id);
  const target = moveTo ? own(userId, moveTo).id : null;
  tx(() => {
    run('UPDATE exams SET category_id = ? WHERE category_id = ? AND user_id = ?', target, c.id, userId);
    run('DELETE FROM exam_categories WHERE id = ?', c.id);
  });
  audit.log(userId, 'categoria', c.id, 'excluir', { name: c.name }, null);
  return { ok: true };
}

// Mover um ou vários exames (categoria vazia = sem categoria)
function move(userId, examIds = [], categoryId = null) {
  const cid = categoryId ? own(userId, categoryId).id : null;
  let n = 0;
  tx(() => { for (const id of examIds) n += Number(run('UPDATE exams SET category_id = ? WHERE id = ? AND user_id = ?', cid, Number(id), userId).changes); });
  audit.log(userId, 'categoria', cid, 'mover exames', null, { quantidade: n });
  return { ok: true, moved: n };
}

// Cria de uma vez as categorias sugeridas que ainda não existem
function createSuggested(userId, names) {
  const want = Array.isArray(names) && names.length ? names : SUGGESTED.map(([n]) => n);
  for (const n of want) if (!get('SELECT 1 FROM exam_categories WHERE user_id = ? AND name = ? COLLATE NOCASE', userId, n)) create(userId, { name: n });
  return list(userId);
}

// Sugere a categoria de um laudo: a indicação pesa mais (é o motivo do exame), depois o nome e a conclusão
function suggest(userId, { title = '', reason = '', conclusion = '' } = {}) {
  const parts = [[reason, 3], [title, 2], [conclusion, 1]].map(([t, w]) => [` ${normalize(t).replace(/[^a-z0-9 ]/g, ' ')} `, w]);
  let best = null; let score = 0;
  for (const [name, words] of SUGGESTED) {
    let s = 0;
    for (const [t, w] of parts) for (const word of words) if (t.includes(` ${word}`)) s += w;
    if (s > score) { score = s; best = name; }
  }
  if (!best) return null;
  // usa a categoria da pessoa com o mesmo nome (ou que começa igual: "Rins" para "Rins e vias urinárias")
  const mine = list(userId);
  const first = normalize(best).split(' ')[0];
  const existing = mine.find((c) => normalize(c.name) === normalize(best)) || mine.find((c) => normalize(c.name).split(' ')[0] === first);
  return { name: existing ? existing.name : best, id: existing ? existing.id : null };
}

module.exports = { list, create, rename, reorder, remove, move, createSuggested, suggest, SUGGESTED };

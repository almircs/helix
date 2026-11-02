// Modo sênior: doses do dia (a partir dos horários dos medicamentos em uso), anotação de "tomei" /
// "não tomei", resumo dos últimos dias e o contato do familiar que acompanha.
// Nada é enviado daqui: as mensagens para a família são abertas pela própria pessoa (WhatsApp/telefone).
const { all, get, run } = require('../db');
const { encrypt, decrypt } = require('../lib/crypto');
const { HttpError } = require('../lib/http');
const audit = require('../lib/audit');

const pad = (n) => String(n).padStart(2, '0');
const localDate = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const localStamp = (d = new Date()) => `${localDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return localDate(d); };
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const LATE_MIN = 30; // depois disso, a dose sem anotação aparece como atrasada

// Horários diários do medicamento ("08:00 e 20:00", "8h", "8h e 20h"). Semanais/mensais ficam de fora.
const DAILY_EXCLUDE = /seman|mens|m[êe]s|quinzen|anual/i;
function medTimes(m) {
  if (!m.schedule || DAILY_EXCLUDE.test(m.frequency || '')) return [];
  const out = [...String(m.schedule).matchAll(/(\d{1,2})\s*[:hH]\s*(\d{2})?/g)]
    .map((x) => `${x[1].padStart(2, '0')}:${x[2] || '00'}`).filter((t) => t <= '23:59');
  return [...new Set(out)].sort();
}

const activeOn = (m, date) => (m.start_date ? m.start_date <= date : String(m.created_at || '').slice(0, 10) <= date) && (!m.end_date || m.end_date >= date);

function medsFor(userId, date) {
  return all("SELECT id, name, dosage, presentation, schedule, frequency, start_date, end_date, created_at FROM medications WHERE user_id = ? AND status = 'ativo' ORDER BY name COLLATE NOCASE", userId)
    .filter((m) => activeOn(m, date));
}

/** Doses de um dia, em ordem de horário, com o que já foi anotado. */
function day(userId, date = localDate()) {
  if (!ISO.test(date)) throw new HttpError(400, 'Data inválida');
  const done = new Map(all('SELECT medication_id, time, status, at FROM medication_doses WHERE user_id = ? AND date = ?', userId, date)
    .map((d) => [`${d.medication_id}|${d.time}`, d]));
  const now = new Date();
  const today = localDate(now);
  const nowHM = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const lateHM = (t) => { const [h, m] = t.split(':').map(Number); const x = h * 60 + m + LATE_MIN; return `${pad(Math.floor(x / 60))}:${pad(x % 60)}`; };
  const doses = [];
  for (const m of medsFor(userId, date)) {
    for (const time of medTimes(m)) {
      const d = done.get(`${m.id}|${time}`);
      const status = d?.status || null;
      doses.push({
        medication_id: m.id, name: m.name, dosage: m.dosage, presentation: m.presentation, date, time,
        status, at: d?.at || null,
        due: !status && (date < today || (date === today && time <= nowHM)),
        late: !status && (date < today || (date === today && lateHM(time) <= nowHM)),
      });
    }
  }
  doses.sort((a, b) => a.time.localeCompare(b.time) || a.name.localeCompare(b.name));
  return { date, doses, total: doses.length, taken: doses.filter((d) => d.status === 'tomado').length,
    skipped: doses.filter((d) => d.status === 'pulado').length };
}

/** Anota uma dose: status 'tomado', 'pulado' ou null (desfazer). */
function mark(userId, body = {}) {
  const medId = Number(body.medication_id);
  const med = get('SELECT id, name, schedule, frequency FROM medications WHERE id = ? AND user_id = ?', medId, userId);
  if (!med) throw new HttpError(404, 'Medicamento não encontrado');
  const date = body.date || localDate();
  if (!ISO.test(date)) throw new HttpError(400, 'Data inválida');
  if (date > localDate()) throw new HttpError(400, 'Não dá para anotar uma dose de um dia que ainda não chegou.');
  const time = String(body.time || '');
  if (!medTimes(med).includes(time)) throw new HttpError(400, 'Este horário não está cadastrado no medicamento.');
  const status = body.status ?? null;
  if (status !== null && status !== 'tomado' && status !== 'pulado') throw new HttpError(400, 'Situação inválida');
  if (status === null) run('DELETE FROM medication_doses WHERE user_id = ? AND medication_id = ? AND date = ? AND time = ?', userId, medId, date, time);
  else run(`INSERT INTO medication_doses (user_id, medication_id, date, time, status, at) VALUES (?,?,?,?,?,?)
            ON CONFLICT (user_id, medication_id, date, time) DO UPDATE SET status = excluded.status, at = excluded.at`,
    userId, medId, date, time, status, localStamp());
  audit.log(userId, 'medicamento', medId, status ? `dose ${status}` : 'dose desfeita', null, { date, time });
  return day(userId, date);
}

/** Resumo dos últimos dias (hoje incluído): quantas doses previstas, tomadas e não tomadas. */
function history(userId, days = 7) {
  const n = Math.min(Math.max(Number(days) || 7, 1), 60);
  const today = localDate();
  // o acompanhamento começa no primeiro dia com alguma dose anotada (antes disso não há o que contar)
  const first = get('SELECT MIN(date) d FROM medication_doses WHERE user_id = ?', userId).d || today;
  return Array.from({ length: n }, (_, i) => addDays(today, -i)).filter((date) => date >= first).map((date) => {
    const d = day(userId, date);
    return { date: d.date, total: d.total, taken: d.taken, skipped: d.skipped, missing: d.total - d.taken - d.skipped };
  });
}

// ---------------------------------------------------------------- Familiar que acompanha
const FAMILY_KEY = 'familia';
function getFamily(userId) {
  const row = get('SELECT value FROM settings WHERE user_id = ? AND key = ?', userId, FAMILY_KEY);
  let f = null; try { f = row ? JSON.parse(decrypt(row.value)) : null; } catch { f = null; }
  const name = get('SELECT full_name FROM profiles WHERE user_id = ?', userId)?.full_name || null;
  return { name: f?.name || '', phone: f?.phone || '', include_names: !!f?.include_names, my_name: name ? name.split(' ')[0] : '' };
}
function setFamily(userId, body = {}) {
  const name = String(body.name || '').trim().slice(0, 60);
  const phone = String(body.phone || '').replace(/\D/g, '');
  if (phone && (phone.length < 10 || phone.length > 13)) throw new HttpError(400, 'Telefone inválido. Use DDD + número, ex.: 31 99999-8888.');
  if (!name && !phone) run('DELETE FROM settings WHERE user_id = ? AND key = ?', userId, FAMILY_KEY);
  else run(`INSERT INTO settings (user_id, key, value) VALUES (?,?,?) ON CONFLICT (user_id, key) DO UPDATE SET value = excluded.value`,
    userId, FAMILY_KEY, encrypt(JSON.stringify({ name, phone, include_names: !!body.include_names })));
  audit.log(userId, 'perfil', userId, 'familiar que acompanha', null, { definido: !!(name || phone) });
  return getFamily(userId);
}

// ---------------------------------------------------------------- Backup
function exportDoses(userId) {
  return all('SELECT medication_id, date, time, status, at FROM medication_doses WHERE user_id = ? ORDER BY date, time', userId);
}
function importDoses(userId, rows = [], medMap = (id) => id) {
  for (const r of rows) {
    const mid = medMap(r.medication_id);
    if (!mid || !ISO.test(r.date || '') || !/^\d{2}:\d{2}$/.test(r.time || '') || !['tomado', 'pulado'].includes(r.status)) continue;
    run('INSERT OR IGNORE INTO medication_doses (user_id, medication_id, date, time, status, at) VALUES (?,?,?,?,?,?)', userId, mid, r.date, r.time, r.status, r.at || `${r.date} ${r.time}`);
  }
}
function importFamily(userId, f) {
  if (f && (f.name || f.phone)) { try { setFamily(userId, f); } catch { /* telefone inválido no arquivo: ignora */ } }
}

module.exports = { medTimes, day, mark, history, getFamily, setFamily, exportDoses, importDoses, importFamily, LATE_MIN };

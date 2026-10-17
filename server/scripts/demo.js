// Cria um usuário de demonstração com dados fictícios para conhecer o sistema.
// Uso: npm run demo   → login: demo@exemplo.com / demo1234
const { migrate, get, run } = require('../db');
migrate();
const { hashPassword } = require('../lib/crypto');
const M = require('../models');
const exams = require('../services/exams');
const cons = require('../services/consultations');
const meds = require('../services/medications');
const { localDate, addDays } = require('../services/overview');

const EMAIL = 'demo@exemplo.com';
const old = get('SELECT id FROM users WHERE email = ?', EMAIL);
if (old) { run('DELETE FROM exam_results WHERE user_id = ?', old.id); run('DELETE FROM users WHERE id = ?', old.id); }
const u = Number(run('INSERT INTO users (email, password_hash) VALUES (?, ?)', EMAIL, hashPassword('demo1234')).lastInsertRowid);
run('INSERT INTO profiles (user_id) VALUES (?)', u);
run(`UPDATE profiles SET full_name='Usuário Demonstração', birth_date='1960-04-12', sex='Masculino', weight_kg=82, height_cm=174, blood_type='O+' WHERE user_id = ?`, u);

const today = localDate();
const nefro = M.doctors.create(u, { name: 'Dra. Ana Exemplo', specialty: 'Nefrologia', is_reference: true, phone: '(31) 0000-0000' });
const cardio = M.doctors.create(u, { name: 'Dr. Bruno Exemplo', specialty: 'Cardiologia', is_reference: true });

const ref = { creat: { unit: 'mg/dL', ref_min: 0.7, ref_max: 1.3 }, k: { unit: 'mEq/L', ref_min: 3.5, ref_max: 5.1 }, na: { unit: 'mEq/L', ref_min: 136, ref_max: 145 } };
const res = (name, value, r, extra = {}) => ({ marker_name: name, value, ...r, ...extra });

meds.createMedication(u, { name: 'Valsartana', active_ingredient: 'valsartana', dosage: '320 mg', presentation: 'comprimido', frequency: '1 vez ao dia', schedule: '08:00',
  start_date: '2026-01-01', doctor_id: cardio.id, reason: 'Controle da pressão arterial', marker_names: ['Creatinina', 'Potássio', 'Sódio', 'Renina'] });

exams.saveExam(u, { collection_date: '2026-05-23', result_date: '2026-05-25', lab: 'Laboratório Exemplo', exam_type: 'Sangue', requested_by_doctor_id: cardio.id,
  results: [res('Creatinina', '1,57', ref.creat), res('Potássio', '4,9', ref.k), res('Sódio', '139', ref.na), res('TFG', '46', { unit: 'mL/min/1,73m²', ref_min: 60 })] });

const c1 = cons.saveConsultation(u, { date: '2026-06-02', time: '14:00', specialty: 'Nefrologia', doctor_id: nefro.id, location: 'Clínica Exemplo', status: 'realizada',
  reason: 'Avaliação da função renal', symptoms: 'Sem queixas', conduct: 'Repetir exames em 2 meses', requests: [{ description: 'Creatinina' }, { description: 'Potássio' }, { description: 'Urina tipo 1' }] });

exams.saveExam(u, { collection_date: '2026-08-10', result_date: '2026-08-12', lab: 'Laboratório Exemplo', exam_type: 'Sangue',
  results: [res('Creatinina', '1,48', ref.creat), res('Potássio', '5,3', ref.k), res('Sódio', '140', ref.na), res('TFG', '50', { unit: 'mL/min/1,73m²', ref_min: 60 })] });

const c2 = cons.saveConsultation(u, { date: '2026-09-02', time: '10:30', specialty: 'Nefrologia', doctor_id: nefro.id, status: 'realizada', is_return: true, previous_id: c1.id,
  reason: 'Retorno com exames', conduct: 'Investigar com renina e aldosterona', requests: [{ description: 'Renina' }, { description: 'Aldosterona' }, { description: 'Creatinina' }] });

exams.saveExam(u, { collection_date: '2026-09-10', lab: 'Laboratório Exemplo', exam_type: 'Sangue',
  results: [res('Renina', '0,4', { unit: 'ng/mL/h', ref_min: 0.5, ref_max: 3.3 }), res('Aldosterona', '18', { unit: 'ng/dL', ref_min: 3, ref_max: 16 }), res('Creatinina', '1,45', ref.creat)] });

const val = get("SELECT id FROM medications WHERE user_id = ? AND name = 'Valsartana'", u);
meds.updateMedication(u, val.id, { dosage: '160 mg', effective_date: '2026-09-15', change_reason: 'Ajuste após exames (orientação médica)', change_consultation_id: c2.id });

cons.saveConsultation(u, { date: addDays(today, 5), time: '09:00', specialty: 'Nefrologia', doctor_id: nefro.id, status: 'agendada', is_return: true, previous_id: c2.id, location: 'Clínica Exemplo' });
M.events.create(u, { type: 'exame', title: 'Coleta de sangue — Potássio e Creatinina', starts_at: `${addDays(today, 2)} 07:30`, location: 'Laboratório Exemplo' });
M.events.create(u, { type: 'vacina', title: 'Vacina da gripe', starts_at: addDays(today, 20) });
meds.createMedication(u, { name: 'Vitamina D', dosage: '7.000 UI', frequency: '1 vez por semana', start_date: '2026-07-01', end_date: addDays(today, 10), reason: 'Reposição' });

for (let i = 14; i >= 0; i -= 2) {
  const d = addDays(today, -i);
  M.measurements.create(u, { type: 'pressao', measured_at: `${d} 08:00`, value1: 128 + ((i * 7) % 11) - 5, value2: 80 + ((i * 3) % 7) - 3, unit: 'mmHg' });
  M.measurements.create(u, { type: 'fc', measured_at: `${d} 08:00`, value1: 68 + ((i * 5) % 9), unit: 'bpm' });
}
M.measurements.create(u, { type: 'peso', measured_at: `${addDays(today, -30)} 07:00`, value1: 83.4, unit: 'kg' });
M.measurements.create(u, { type: 'peso', measured_at: `${today} 07:00`, value1: 82.1, unit: 'kg' });

console.log('Usuário de demonstração criado → e-mail: demo@exemplo.com  senha: demo1234');

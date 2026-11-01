// Definição das entidades do domínio.
const { Resource } = require('./lib/resource');

const doctors = new Resource({
  table: 'doctors', entity: 'medico',
  fields: { name: 'text', specialty: 'text', crm: 'text', phone: 'text', email: 'text', address: 'text', is_reference: 'bool', notes: 'text' },
  encrypted: ['notes'], required: ['name'],
});

const consultations = new Resource({
  table: 'consultations', entity: 'consulta',
  fields: {
    date: 'date', time: 'text', specialty: 'text', doctor_id: 'int', location: 'text',
    status: ['agendada', 'realizada', 'cancelada'], is_return: 'bool', previous_id: 'int',
    reason: 'text', symptoms: 'text', diagnoses: 'text', conduct: 'text', prescribed: 'text', recommendations: 'text', notes: 'text',
  },
  encrypted: ['reason', 'symptoms', 'diagnoses', 'conduct', 'prescribed', 'recommendations', 'notes'],
  required: ['date'], refs: { doctor_id: 'doctors', previous_id: 'consultations' },
});

const exams = new Resource({
  table: 'exams', entity: 'exame',
  fields: { collection_date: 'date', result_date: 'date', lab: 'text', exam_type: 'text', title: 'text', requested_by_doctor_id: 'int', consultation_id: 'int',
    reason: 'text', findings: 'text', conclusion: 'text', notes: 'text', category_id: 'int' },
  encrypted: ['reason', 'findings', 'conclusion', 'notes'], required: ['collection_date'],
  refs: { requested_by_doctor_id: 'doctors', consultation_id: 'consultations', category_id: 'exam_categories' },
});

const markers = new Resource({
  table: 'markers', entity: 'marcador',
  fields: { name: 'text', unit: 'text', ref_min: 'num', ref_max: 'num', ref_text: 'text', category: 'text' },
  required: ['name'],
});

const medications = new Resource({
  table: 'medications', entity: 'medicamento',
  fields: {
    name: 'text', active_ingredient: 'text', dosage: 'text', presentation: 'text', schedule: 'text', frequency: 'text',
    start_date: 'date', end_date: 'date', doctor_id: 'int', consultation_id: 'int',
    status: ['ativo', 'suspenso', 'encerrado'], reason: 'text', notes: 'text',
  },
  encrypted: ['reason', 'notes'], required: ['name'],
  refs: { doctor_id: 'doctors', consultation_id: 'consultations' },
});

const measurements = new Resource({
  table: 'measurements', entity: 'medicao',
  fields: { type: ['pressao', 'fc', 'peso', 'glicemia', 'temperatura', 'saturacao', 'outro'], label: 'text', measured_at: 'datetime', value1: 'num', value2: 'num', unit: 'text', notes: 'text' },
  encrypted: ['notes'], required: ['type', 'measured_at', 'value1'],
});

const events = new Resource({
  table: 'events', entity: 'agenda',
  fields: {
    type: ['consulta', 'exame', 'retorno', 'vacina', 'procedimento', 'medicamento', 'receita', 'outro'],
    title: 'text', starts_at: 'datetime', location: 'text', status: ['agendado', 'concluido', 'cancelado'],
    remind_minutes: 'int', consultation_id: 'int', exam_id: 'int', medication_id: 'int', notes: 'text',
  },
  encrypted: ['notes'], required: ['type', 'title', 'starts_at'],
  refs: { consultation_id: 'consultations', exam_id: 'exams', medication_id: 'medications' },
});

const PROFILE_FIELDS = ['full_name', 'birth_date', 'sex', 'weight_kg', 'height_cm', 'blood_type', 'allergies', 'conditions', 'emergency_contacts', 'notes'];
const PROFILE_ENCRYPTED = ['allergies', 'conditions', 'emergency_contacts', 'notes'];

const MEASUREMENT_TYPES = {
  pressao: { label: 'Pressão arterial', unit: 'mmHg' },
  fc: { label: 'Frequência cardíaca', unit: 'bpm' },
  peso: { label: 'Peso', unit: 'kg' },
  glicemia: { label: 'Glicemia', unit: 'mg/dL' },
  temperatura: { label: 'Temperatura', unit: '°C' },
  saturacao: { label: 'Saturação', unit: '%' },
  outro: { label: 'Outro', unit: '' },
};

module.exports = { doctors, consultations, exams, markers, medications, measurements, events, PROFILE_FIELDS, PROFILE_ENCRYPTED, MEASUREMENT_TYPES };

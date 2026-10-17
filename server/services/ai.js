// Ponto de extensão do módulo de IA (etapa 4).
// buildContext() monta um retrato estruturado e já decifrado dos dados do usuário.
// O provedor de IA só é chamado com autorização explícita do usuário (consentimento
// registrado) — nenhum dado de saúde sai do computador sem isso.
const { get } = require('../db');
const { timeline, dashboard, addDays, localDate } = require('./overview');
const { listMarkers, markerHistory } = require('./exams');
const { listMedications, getMedication } = require('./medications');
const { listConsultations } = require('./consultations');
const { HttpError } = require('../lib/http');

const SYSTEM_RULES = [
  'Você organiza informações de saúde pessoais. Você NÃO é médico e NÃO faz diagnóstico.',
  'Deixe claro quando estiver apenas organizando dados.',
  'Nunca apresente hipóteses como diagnóstico confirmado; relações entre medicamentos e exames são apenas temporais.',
  'Sugira sempre levar as dúvidas ao médico responsável.',
];

function buildContext(userId, { months = 12, specialty = null } = {}) {
  const to = localDate();
  const from = addDays(to, -Math.round(months * 30.4));
  return {
    periodo: { de: from, ate: to },
    regras: SYSTEM_RULES,
    painel: dashboard(userId),
    marcadores: listMarkers(userId).filter((m) => m.count).map((m) => ({ nome: m.name, unidade: m.unit,
      serie: markerHistory(userId, m.id, { from }).points.map((p) => ({ data: p.date, valor: p.value_num ?? p.value_text, situacao: p.situation })) })),
    medicamentos: listMedications(userId).map((m) => ({ ...getMedication(userId, m.id) })),
    consultas: listConsultations(userId).filter((c) => c.date >= from && (!specialty || String(c.specialty).toLowerCase() === String(specialty).toLowerCase())),
    linha_do_tempo: timeline(userId, { from, to }),
  };
}

async function ask(userId, question) {
  const consent = get("SELECT 1 FROM audit_log WHERE user_id = ? AND entity = 'ia' AND action = 'consentimento' LIMIT 1", userId);
  if (!process.env.SAUDE_IA_PROVEDOR || !consent) {
    throw new HttpError(501, 'O assistente de IA ainda não está ativado. Ele será liberado numa próxima etapa e só funcionará com sua autorização.');
  }
  // Implementação do provedor entra aqui (ex.: API da Anthropic), enviando buildContext() + pergunta.
  throw new HttpError(501, 'Provedor de IA não implementado nesta versão.');
}

module.exports = { buildContext, ask, SYSTEM_RULES };

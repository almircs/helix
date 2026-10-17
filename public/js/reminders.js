// Lembretes enquanto o sistema está aberto: notificação do navegador (se permitida) e aviso na tela.
// O módulo de notificações em segundo plano (e-mail/celular) entra na etapa 3.
import { api, today, addDays, toast } from './lib.js';

const shown = new Set();
const DEFAULT_MIN = { consulta: 120, retorno: 120, exame: 60, procedimento: 120, vacina: 60, medicamento: 0, receita: 0, outro: 30 };

async function check() {
  let items;
  try { items = await api(`/agenda?from=${today()}&to=${addDays(today(), 1)}`); } catch { return; }
  const now = Date.now();
  for (const e of items) {
    if (e.status !== 'agendado' || !e.time) continue;
    const at = new Date(`${e.date}T${e.time}:00`).getTime();
    const before = (e.remind_minutes ?? DEFAULT_MIN[e.type] ?? 30) * 60e3;
    const key = `${e.source}-${e.id}-${e.date}-${e.time}`;
    if (shown.has(key) || now < at - before || now > at) continue;
    shown.add(key);
    const msg = `${e.title} às ${e.time}${e.location ? ' — ' + e.location : ''}`;
    toast('Lembrete: ' + msg);
    try { if ('Notification' in window && Notification.permission === 'granted') new Notification('Prontuário Pessoal', { body: msg, icon: '/icon.svg' }); } catch { /* sem suporte */ }
  }
}

export function startReminders() { check(); setInterval(check, 60e3); }

export async function askPermission() {
  if (!('Notification' in window)) return 'indisponivel';
  return Notification.requestPermission();
}

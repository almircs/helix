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
    // Discreto: sem nome, especialidade ou local (o aviso pode aparecer com outras pessoas por perto)
    const msg = `${e.type === 'medicamento' ? 'Hora do remédio' : 'Compromisso de saúde'} às ${e.time}`;
    toast('Lembrete: ' + msg);
    try { if ('Notification' in window && Notification.permission === 'granted') new Notification('Helyx', { body: msg, icon: '/icon.png' }); } catch { /* sem suporte */ }
  }
}

// Doses do dia (horários dos medicamentos): avisa na hora e de novo se ficar 30 min sem anotação
async function checkDoses() {
  let day;
  try { day = await api('/doses'); } catch { return; }
  if (!day.enabled) return; // controle de doses desligado: sem avisos de dose
  for (const d of day.doses) {
    if (d.status || !d.due) continue;
    const key = `dose-${d.medication_id}-${d.date}-${d.time}-${d.late ? 'atraso' : 'hora'}`;
    if (shown.has(key)) continue;
    shown.add(key);
    // sem o nome do remédio: o aviso pode aparecer com outras pessoas por perto
    const msg = d.late ? `O remédio das ${d.time} ainda não foi anotado` : `Hora do remédio das ${d.time}`;
    toast('Lembrete: ' + msg);
    try { if ('Notification' in window && Notification.permission === 'granted') new Notification('Helyx', { body: msg, icon: '/icon.png' }); } catch { /* sem suporte */ }
  }
}

export function startReminders() { check(); checkDoses(); setInterval(() => { check(); checkDoses(); }, 60e3); }

export async function askPermission() {
  if (!('Notification' in window)) return 'indisponivel';
  return Notification.requestPermission();
}

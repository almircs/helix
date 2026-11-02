// Controle de doses: textos prontos para avisar o familiar pelo WhatsApp.
// Nada é enviado pelo Helyx: o link abre o WhatsApp da pessoa com a mensagem, e ela decide enviar.
const WD = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

export function waLink(phone, text) {
  let n = String(phone || '').replace(/\D/g, '');
  if (n.length === 10 || n.length === 11) n = '55' + n; // DDD + número, sem o código do país
  return `https://wa.me/${n}?text=${encodeURIComponent(text)}`;
}
export function doseMessage(fam, d) {
  const who = fam.my_name || 'Eu';
  const what = fam.include_names ? ` (${[d.name, d.dosage].filter(Boolean).join(' ')})` : '';
  return d.status === 'tomado'
    ? `✅ ${who} tomou o remédio das ${d.time}${what}. Anotado às ${String(d.at || '').slice(11, 16)} no Helyx.`
    : `⚠️ ${who} anotou que não tomou o remédio das ${d.time}${what}.`;
}
export function weekMessage(fam, hist) {
  const who = fam.my_name || 'Eu';
  const lines = hist.filter((h) => h.total).map((h) => {
    const d = new Date(h.date + 'T12:00:00');
    return `${WD[d.getDay()]} ${h.date.slice(8, 10)}/${h.date.slice(5, 7)}: ${h.taken} de ${h.total} tomados${h.skipped ? `, ${h.skipped} não tomado(s)` : ''}${h.missing ? `, ${h.missing} sem anotação` : ''}`;
  });
  return `Remédios de ${who} — últimos ${lines.length} dia(s) (Helyx)\n${lines.join('\n') || 'Nenhuma dose anotada.'}`;
}

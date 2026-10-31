const path = require('node:path');

const dataDir = process.env.SAUDE_DATA_DIR || path.join(__dirname, '..', 'data');

module.exports = {
  port: Number(process.env.PORT || 4321),
  host: process.env.HOST || '127.0.0.1',        // por padrão só aceita acesso deste computador
  dataDir,
  dbPath: path.join(dataDir, 'saude.db'),
  keyPath: path.join(dataDir, 'chave.key'),
  secureCookies: process.env.SAUDE_HTTPS === '1',
  sessionHours: Number(process.env.SAUDE_SESSAO_HORAS || 12),  // validade máxima da sessão
  idleMinutes: Number(process.env.SAUDE_INATIVIDADE_MIN || 60), // encerra após inatividade
  // Com login (padrão): cada pessoa entra com usuário e senha e vê só os próprios dados.
  // Para abrir direto num perfil único deste computador, sem senha, defina SAUDE_EXIGIR_LOGIN=0.
  requireLogin: process.env.SAUDE_EXIGIR_LOGIN !== '0',
  allowRegistration: process.env.SAUDE_PERMITIR_CADASTRO !== '0',
  // Variação (%) entre dois resultados a partir da qual o sistema sinaliza "alteração relevante"
  relevantChangePct: Number(process.env.SAUDE_VARIACAO_RELEVANTE || 10),
  stableChangePct: Number(process.env.SAUDE_VARIACAO_ESTAVEL || 3),
};

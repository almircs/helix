// Cria uma cópia consistente do banco (e da chave) em data/backups/AAAA-MM-DD_HHMM/
// Uso: npm run backup
const { backupNow } = require('../lib/backup');
const target = backupNow();
console.log(`Backup criado em ${target}`);
console.log('IMPORTANTE: sem o arquivo chave.key os dados sensíveis do backup não podem ser lidos. Guarde os dois juntos, em local seguro.');

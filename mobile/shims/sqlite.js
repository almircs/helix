// Substituto de node:sqlite (DatabaseSync) no celular, com o SQLite compilado para o navegador (sql.js).
// O banco fica na memória e é gravado no "disco" do aparelho (IndexedDB) depois de cada alteração.
const fs = require('fs');

let SQL = null;
const setSQL = (s) => { SQL = s; };
const open = new Set();
const clean = (p) => p.map((v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v));

class DatabaseSync {
  constructor(file) {
    if (!SQL) throw new Error('SQLite ainda não carregado');
    this.file = file;
    this.db = fs.existsSync(file) ? new SQL.Database(new Uint8Array(fs.readFileSync(file))) : new SQL.Database();
    open.add(this);
  }
  exec(sql) {
    // PRAGMAs de arquivo (WAL, busy_timeout) não se aplicam aqui
    this.db.exec(String(sql).replace(/PRAGMA\s+(journal_mode|busy_timeout)\s*=\s*[^;]+;?/gi, ''));
    if (!/^\s*(SELECT|PRAGMA)/i.test(sql)) this.modified = true;
  }
  prepare(sql) {
    const db = this.db; const self = this;
    const withStmt = (params, fn) => { const st = db.prepare(sql); try { st.bind(clean(params)); return fn(st); } finally { st.free(); } };
    return {
      all: (...p) => withStmt(p, (st) => { const out = []; while (st.step()) out.push(st.getAsObject()); return out; }),
      get: (...p) => withStmt(p, (st) => (st.step() ? st.getAsObject() : undefined)),
      run: (...p) => {
        withStmt(p, (st) => { while (st.step()) { /* executa */ } });
        const id = db.exec('SELECT last_insert_rowid() AS id')[0]?.values[0][0] ?? 0;
        const changes = db.getRowsModified();
        if (changes) self.modified = true;
        return { changes, lastInsertRowid: id };
      },
    };
  }
  // Grava o banco no "disco"; export() reabre o banco, então as chaves estrangeiras são religadas
  save() {
    if (!this.modified && fs.existsSync(this.file)) return;
    this.modified = false;
    fs.writeFileSync(this.file, this.db.export());
    this.db.exec('PRAGMA foreign_keys = ON;');
  }
  exportBytes() { const b = this.db.export(); this.db.exec('PRAGMA foreign_keys = ON;'); return b; }
}

const saveAll = () => { for (const d of open) d.save(); };

module.exports = { DatabaseSync, setSQL, saveAll };

// Repositório genérico por usuário: valida campos, criptografa os sensíveis,
// garante que chaves estrangeiras pertencem ao mesmo usuário e registra auditoria.
const { all, get, run } = require('../db');
const { encrypt, decrypt } = require('./crypto');
const { HttpError } = require('./http');
const audit = require('./audit');

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME = /^\d{4}-\d{2}-\d{2}( \d{2}:\d{2})?$/;

function toNumber(v) {
  if (v === '' || v === null || v === undefined) return null;
  let s = String(v).trim();
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.'); // formato brasileiro 1.234,56
  const n = typeof v === 'number' ? v : Number(s);
  if (!Number.isFinite(n)) throw new HttpError(400, `Número inválido: ${v}`);
  return n;
}

class Resource {
  /**
   * @param {object} o
   * @param {string} o.table
   * @param {string} o.entity  nome amigável para auditoria
   * @param {object} o.fields  { campo: 'text'|'num'|'int'|'date'|'datetime'|'bool'|['opcao',...] }
   * @param {string[]} [o.encrypted]
   * @param {string[]} [o.required]
   * @param {object} [o.refs]  { campo_id: 'tabela' }
   */
  constructor(o) { Object.assign(this, { encrypted: [], required: [], refs: {}, ...o }); }

  clean(input, partial = false) {
    const out = {};
    for (const [f, type] of Object.entries(this.fields)) {
      if (!(f in input)) continue;
      let v = input[f];
      if (typeof v === 'string') v = v.trim();
      if (v === '' || v === undefined) v = null;
      if (v !== null) {
        if (type === 'num') v = toNumber(v);
        else if (type === 'int' || this.refs[f]) v = toNumber(v) === null ? null : Math.trunc(toNumber(v));
        else if (type === 'bool') v = v ? 1 : 0;
        else if (type === 'date' && !DATE.test(v)) throw new HttpError(400, `Data inválida em ${f}`);
        else if (type === 'datetime' && !DATETIME.test(v)) throw new HttpError(400, `Data/hora inválida em ${f}`);
        else if (Array.isArray(type) && !type.includes(v)) throw new HttpError(400, `Valor inválido em ${f}`);
        else if (type === 'text') v = String(v).slice(0, 20000);
      }
      out[f] = v;
    }
    if (!partial) for (const r of this.required) if (out[r] === null || out[r] === undefined) throw new HttpError(400, `Campo obrigatório: ${r}`);
    return out;
  }

  checkRefs(userId, data) {
    for (const [f, table] of Object.entries(this.refs)) {
      if (data[f] == null) continue;
      if (!get(`SELECT 1 FROM ${table} WHERE id = ? AND user_id = ?`, data[f], userId)) throw new HttpError(400, `Referência inválida em ${f}`);
    }
  }

  enc(data) {
    const o = { ...data };
    for (const f of this.encrypted) if (f in o) o[f] = encrypt(o[f]);
    return o;
  }

  dec(row) {
    if (!row) return row;
    const o = { ...row };
    for (const f of this.encrypted) if (f in o) o[f] = decrypt(o[f]);
    delete o.user_id;
    return o;
  }

  list(userId, where = '', params = [], order = 'id DESC') {
    return all(`SELECT * FROM ${this.table} WHERE user_id = ? ${where ? 'AND ' + where : ''} ORDER BY ${order}`, userId, ...params).map((r) => this.dec(r));
  }

  get(userId, id) {
    const row = get(`SELECT * FROM ${this.table} WHERE id = ? AND user_id = ?`, Number(id), userId);
    if (!row) throw new HttpError(404, 'Registro não encontrado');
    return this.dec(row);
  }

  create(userId, input) {
    const data = this.clean(input);
    this.checkRefs(userId, data);
    const e = this.enc(data);
    const cols = Object.keys(e);
    const r = run(`INSERT INTO ${this.table} (user_id${cols.map((c) => ', ' + c).join('')}) VALUES (?${cols.map(() => ', ?').join('')})`,
      userId, ...cols.map((c) => e[c]));
    const id = Number(r.lastInsertRowid);
    audit.log(userId, this.entity, id, 'criar', null, data);
    return this.get(userId, id);
  }

  update(userId, id, input) {
    const before = this.get(userId, id);
    const data = this.clean(input, true);
    this.checkRefs(userId, data);
    const e = this.enc(data);
    const cols = Object.keys(e);
    if (cols.length) {
      const hasUpdated = 'updated_at' in before;
      run(`UPDATE ${this.table} SET ${cols.map((c) => `${c} = ?`).join(', ')}${hasUpdated ? ", updated_at = datetime('now')" : ''} WHERE id = ? AND user_id = ?`,
        ...cols.map((c) => e[c]), Number(id), userId);
    }
    const changed = {};
    for (const c of cols) if (before[c] !== data[c]) changed[c] = [before[c], data[c]];
    if (Object.keys(changed).length) audit.log(userId, this.entity, Number(id), 'alterar', Object.fromEntries(Object.entries(changed).map(([k, v]) => [k, v[0]])), Object.fromEntries(Object.entries(changed).map(([k, v]) => [k, v[1]])));
    return this.get(userId, id);
  }

  remove(userId, id) {
    const before = this.get(userId, id);
    run(`DELETE FROM ${this.table} WHERE id = ? AND user_id = ?`, Number(id), userId);
    audit.log(userId, this.entity, Number(id), 'excluir', before, null);
    return { ok: true };
  }
}

module.exports = { Resource, toNumber };

// Substituto de node:zlib no celular (só o que o leitor de .docx/.xlsx usa)
const { Buffer } = require('buffer');
const { inflateSync } = require('fflate');

module.exports = { inflateRawSync: (buf) => Buffer.from(inflateSync(new Uint8Array(buf))) };

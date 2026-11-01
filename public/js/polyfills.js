// Recursos que o leitor de PDF (pdf.js) usa e que faltam em versões mais antigas do Safari (iPhone/iPad):
// - Promise.withResolvers (iOS 17.4+)
// - percorrer um ReadableStream com "for await" (o Safari ainda não tem; usado para ler o texto das páginas)
if (typeof Promise.withResolvers !== 'function') {
  Promise.withResolvers = function withResolvers() {
    let resolve; let reject;
    const promise = new this((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
  };
}
if (typeof ReadableStream !== 'undefined' && !ReadableStream.prototype[Symbol.asyncIterator]) {
  ReadableStream.prototype[Symbol.asyncIterator] = async function* streamIterator() {
    const reader = this.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return;
        yield value;
      }
    } finally { reader.releaseLock(); }
  };
  if (!ReadableStream.prototype.values) ReadableStream.prototype.values = ReadableStream.prototype[Symbol.asyncIterator];
}

/** Estimativa de estouro de texto: caracteres que cabem vs. caracteres escritos. */
const fs = require('fs'), vm = require('vm'), path = require('path');
const { criarSlidesApp } = require('./_slides_falso');
const RAIZ = path.join(__dirname, '..');
const DECK = '1axfQX9FW1U4EIlnhJKDA2XizGoERMGNNXF8nmPCOpSI';

const { SlidesApp, deck, registro } = criarSlidesApp(DECK, {});
const planilha = { abas: {}, getSheetByName: n => planilha.abas[n] || null, insertSheet(n) { planilha.abas[n] = aba(n); return planilha.abas[n]; } };
function aba(nome) {
  const a = { nome, dados: [], _g(l, c) { while (a.dados.length < l) a.dados.push([]); const li = a.dados[l - 1]; while (li.length < c) li.push(''); },
    clear() { a.dados = []; return a; }, appendRow(x) { a.dados.push(x.slice()); return a; },
    getLastRow: () => a.dados.length, getMaxRows: () => a.dados.length,
    setFrozenRows: () => a, autoResizeColumn: () => a, setColumnWidth: () => a,
    deleteRows(i, q) { a.dados.splice(i - 1, q); return a; },
    getDataRange: () => ({ getValues: () => a.dados.map(l => l.slice()) }),
    getRange(l, c) { const f = { setValues(v) { v.forEach((lv, i) => { a._g(l + i, c + lv.length - 1); lv.forEach((x, j) => { a.dados[l + i - 1][c + j - 1] = x; }); }); return f; },
      setValue(v) { a._g(l, c); a.dados[l - 1][c - 1] = v; return f; },
      setBackground: () => f, setFontColor: () => f, setFontWeight: () => f, setWrap: () => f }; return f; } };
  return a;
}
let uid = 0;
const s = { SpreadsheetApp: { openById: () => planilha }, SlidesApp,
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => null, setProperty: () => {} }) },
  Logger: { log: () => {} }, MimeType: { CSV: 'text/csv' },
  DriveApp: { createFile: () => ({ setSharing: () => {}, getUrl: () => '' }), getFileById: () => ({ getBlob: () => ({}) }), Access: {}, Permission: {} },
  Utilities: { getUuid: () => 'u' + (++uid), formatDate: (d, tz, f) => (String(f).indexOf('HH:mm') > -1 ? '2026-08-20 10:00' : '2026-08-20') }, console };
vm.createContext(s);
vm.runInContext(fs.readFileSync(path.join(RAIZ, 'sheets.gs'), 'utf8'), s);
vm.runInContext(fs.readFileSync(path.join(RAIZ, 'apresentacao.gs'), 'utf8'), s);
vm.runInContext("inserirDadosDeTeste(); gerarApresentacaoDaArea('Planejamento & Gestão');", s);

// Montserrat/Open Sans ≈ 0.52 em de avanço médio; altura de linha ≈ 1.25 × fs.
const LARG = 0.52, ALT = 1.28;
const suspeitos = [];
registro.textos.forEach(t => {
  const fs_ = t.fs || 11;
  const porLinha = Math.max(1, Math.floor((t.w - 8) / (fs_ * LARG)));
  const linhas = String(t.texto).split('\n').reduce((n, p) => n + Math.max(1, Math.ceil(p.length / porLinha)), 0);
  const alturaNecessaria = linhas * fs_ * ALT;
  if (alturaNecessaria > t.h + 2) {
    suspeitos.push({ slide: t.slide - 2, fs: fs_, w: t.w, h: t.h, precisa: Math.round(alturaNecessaria),
      linhas, texto: String(t.texto).slice(0, 70) });
  }
});
console.log('caixas de texto:', registro.textos.length, '| possível estouro vertical:', suspeitos.length);
suspeitos.forEach(x => console.log(`  slide ${x.slide}  ${x.fs}pt  caixa ${x.w}×${x.h}  precisa ~${x.precisa}pt (${x.linhas} linhas)  "${x.texto}"`));

console.log('\n— textos por slide —');
for (let i = 3; i < 10; i++) {
  const ts = registro.textos.filter(t => t.slide === i);
  console.log(`slide ${i - 2}: ${ts.length} caixas`);
}

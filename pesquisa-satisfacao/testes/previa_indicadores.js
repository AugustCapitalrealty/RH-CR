/**
 * Prévia do consolidado de indicadores, em SVG: um slide por área.
 * Uso:  node testes/previa_indicadores.js [pasta-de-saida]
 * A quebra de linha e o ajuste de fonte são estimados; o Slides faz o dele.
 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { criarSlidesApp } = require('./_slides_falso');
const { svgDoSlide } = require('./_previa_svg');

const RAIZ = path.join(__dirname, '..');
const DECK = '1axfQX9FW1U4EIlnhJKDA2XizGoERMGNNXF8nmPCOpSI';
const { SlidesApp, registro } = criarSlidesApp(DECK, { slidesIniciais: 0 });

const p = {
  abas: {},
  getSheetByName: n => p.abas[n] || null,
  insertSheet(n) { p.abas[n] = aba(n); return p.abas[n]; }
};
function aba(nome) {
  const a = {
    nome, dados: [],
    _g(l, c) { while (a.dados.length < l) a.dados.push([]); const li = a.dados[l - 1]; while (li.length < c) li.push(''); },
    clear() { a.dados = []; return a; },
    appendRow(x) { a.dados.push(x.slice()); return a; },
    getLastRow: () => a.dados.length,
    getMaxRows: () => a.dados.length,
    setFrozenRows: () => a, autoResizeColumn: () => a, setColumnWidth: () => a,
    deleteRows(i, q) { a.dados.splice(i - 1, q); return a; },
    getDataRange: () => ({ getValues: () => a.dados.map(l => l.slice()) }),
    getRange(l, c) {
      const f = {
        setValues(v) { v.forEach((lv, i) => { a._g(l + i, c + lv.length - 1); lv.forEach((x, j) => { a.dados[l + i - 1][c + j - 1] = x; }); }); return f; },
        setValue(v) { a._g(l, c); a.dados[l - 1][c - 1] = v; return f; },
        setBackground: () => f, setFontColor: () => f, setFontWeight: () => f, setWrap: () => f
      };
      return f;
    }
  };
  return a;
}

const props = {};
let u = 0;
const s = {
  SpreadsheetApp: { openById: () => p },
  SlidesApp,
  PropertiesService: {
    getScriptProperties: () => ({
      getProperty: k => (k in props ? props[k] : null),
      setProperty: (k, v) => { props[k] = v; },
      deleteProperty: k => { delete props[k]; }
    })
  },
  Logger: { log: () => {} },
  MimeType: { CSV: 'c' },
  DriveApp: {
    createFile: () => ({ setSharing: () => {}, getUrl: () => '' }),
    getFileById: () => ({ getBlob: () => ({}) }),
    Access: {}, Permission: {}
  },
  Utilities: {
    getUuid: () => 'u' + (++u),
    formatDate: (d, t, f) => (String(f).indexOf('HH:mm') > -1 ? '2026-08-20 10:00' : '2026-08-20')
  },
  console
};
vm.createContext(s);
vm.runInContext(fs.readFileSync(path.join(RAIZ, 'sheets.gs'), 'utf8'), s);
vm.runInContext(fs.readFileSync(path.join(RAIZ, 'apresentacao.gs'), 'utf8'), s);
vm.runInContext('inserirDadosDeTeste();', s);

const r = vm.runInContext('gerarIndicadoresDeTodasAsAreas()', s);
const out = process.argv[2] || path.join(__dirname, '..', 'previa');
fs.mkdirSync(out, { recursive: true });

let html = '<style>body{background:#334;font-family:system-ui;margin:0;padding:24px}' +
  'h2{color:#fff;font-size:14px;margin:18px 0 8px}svg{box-shadow:0 4px 18px #0006;display:block}</style>';
r.areas.forEach((area, i) => {
  html += `<h2>${i + 1}. ${area}</h2>` + svgDoSlide(registro, i, 720, 405);
});
fs.writeFileSync(path.join(out, 'previa-indicadores.html'), html);
console.log('ok →', path.join(out, 'previa-indicadores.html'), '·', r.slides, 'slides');

/**
 * Ambiente compartilhado pelo teste e pela prévia da apresentação da empresa.
 * Carrega sheets.gs + painel.gs + apresentacao.gs + apresentacao_empresa.gs
 * num SlidesApp falso. Nenhum deck real é tocado.
 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { criarSlidesApp } = require('./_slides_falso');

const RAIZ = path.join(__dirname, '..');
// O mesmo ID configurado em PRHE_CONFIG.deckId: como o código tem precedência
// sobre a propriedade de script, o deck falso precisa atender por esse ID.
const DECK = '1axfQX9FW1U4EIlnhJKDA2XizGoERMGNNXF8nmPCOpSI';

function criarAba(nome) {
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

function montarEmpresa(opts) {
  opts = opts || {};
  const { SlidesApp, deck, registro } = criarSlidesApp(DECK, opts.deck || {});

  const planilha = {
    abas: {},
    getSheetByName(n) { return planilha.abas[n] || null; },
    insertSheet(n) { planilha.abas[n] = criarAba(n); return planilha.abas[n]; }
  };
  const props = opts.props || { DECK_EMPRESA: DECK };
  const logs = [];
  let uid = 0;

  const sandbox = {
    SpreadsheetApp: { openById: () => planilha },
    SlidesApp,
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: k => (k in props ? props[k] : null),
        setProperty: (k, v) => { props[k] = v; }
      })
    },
    // painel.gs usa ScriptApp para saber se o gatilho automático está ligado.
    ScriptApp: { getProjectTriggers: () => [] },
    HtmlService: { createHtmlOutput: h => ({ _h: h, setTitle() { return this; }, addMetaTag() { return this; }, setWidth() { return this; }, setHeight() { return this; } }) },
    Logger: { log: m => logs.push(String(m)) },
    MimeType: { CSV: 'text/csv' },
    DriveApp: {
      createFile: () => ({ setSharing: () => {}, getUrl: () => '', getName: () => '' }),
      getFileById: id => {
        if (opts.logoQuebrado) throw new Error('acesso negado ao arquivo ' + id);
        return { getBlob: () => ({ _id: id }) };
      },
      Access: { PRIVATE: 1 }, Permission: { NONE: 1 }
    },
    Utilities: {
      getUuid: () => 'uuid-' + (++uid),
      formatDate: (d, tz, fmt) => (String(fmt).indexOf('HH:mm') > -1 ? (opts.agora || '2026-08-20 10:00') : '2026-08-20')
    },
    console
  };
  vm.createContext(sandbox);
  ['sheets.gs', 'painel.gs', 'apresentacao.gs', 'apresentacao_empresa.gs']
    .forEach(f => vm.runInContext(fs.readFileSync(path.join(RAIZ, f), 'utf8'), sandbox));

  return { sandbox, planilha, props, logs, deck, registro, rodar: e => vm.runInContext(e, sandbox) };
}

module.exports = { montarEmpresa, DECK, RAIZ };

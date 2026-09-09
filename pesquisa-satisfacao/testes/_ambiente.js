/**
 * Ambiente falso do Apps Script para rodar os .gs no Node.
 * Os testes deste diretório não tocam a planilha real — tudo em memória.
 *
 * Uso:  node testes/painel.test.js
 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const RAIZ = path.join(__dirname, '..');

function criarAba(nome) {
  const a = {
    nome: nome, dados: [],
    _g(l, c) { while (a.dados.length < l) a.dados.push([]); const li = a.dados[l - 1]; while (li.length < c) li.push(''); },
    clear() { a.dados = []; return a; },
    appendRow(x) { a.dados.push(x.slice()); return a; },
    getLastRow() { return a.dados.length; },
    getMaxRows() { return a.dados.length; },
    setFrozenRows: () => a, autoResizeColumn: () => a, setColumnWidth: () => a,
    deleteRows(i, q) { a.dados.splice(i - 1, q); return a; },
    getDataRange() { return { getValues: () => a.dados.map(l => l.slice()) }; },
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

/**
 * @param {object} opts
 *   arquivos: quais .gs carregar (padrão: os três)
 *   agora:    'AAAA-MM-DD HH:MM' devolvido por Utilities.formatDate no formato com hora
 */
function criarAmbiente(opts) {
  opts = opts || {};
  const arquivos = opts.arquivos || ['sheets.gs', 'painel.gs', 'main.gs'];
  const agora = opts.agora || '2026-08-20 10:00';

  const planilha = {
    abas: {},
    getSheetByName(n) { return planilha.abas[n] || null; },
    insertSheet(n) { planilha.abas[n] = criarAba(n); return planilha.abas[n]; }
  };
  const props = {};
  const logs = [];
  const arquivosDrive = [];
  let uid = 0;

  const sandbox = {
    SpreadsheetApp: { openById: () => planilha },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: k => (k in props ? props[k] : null),
        setProperty: (k, v) => { props[k] = v; }
      })
    },
    HtmlService: {
      createHtmlOutput: h => ({ _h: h, setTitle() { return this; }, addMetaTag() { return this; }, setWidth() { return this; }, setHeight() { return this; } })
    },
    Logger: { log: m => logs.push(String(m)) },
    MimeType: { CSV: 'text/csv' },
    DriveApp: {
      createFile: (n, c, t) => { arquivosDrive.push({ nome: n, conteudo: c, tipo: t }); return { setSharing: () => {}, getUrl: () => 'https://drive.mock/' + n, getName: () => n }; },
      Access: { PRIVATE: 1 }, Permission: { NONE: 1 }
    },
    Utilities: {
      getUuid: () => 'uuid-' + (++uid),
      // Só o formato com hora precisa ser "agora"; o resto é a data da resposta.
      formatDate: (d, tz, fmt) => (String(fmt).indexOf('HH:mm') > -1 ? agora : '2026-08-20')
    },
    console
  };
  vm.createContext(sandbox);
  arquivos.forEach(f => vm.runInContext(fs.readFileSync(path.join(RAIZ, f), 'utf8'), sandbox));

  return {
    sandbox, planilha, props, logs, arquivosDrive,
    rodar: expr => vm.runInContext(expr, sandbox),
    linhasRespostas: () => (planilha.abas['Respostas'] || { dados: [] }).dados
  };
}

/** Verificador mínimo, com contagem de falhas no processo */
function criarVerificador() {
  const estado = { falhas: 0 };
  const ok = (rotulo, condicao, extra) => {
    if (!condicao) estado.falhas++;
    console.log(`${condicao ? '✅' : '❌'} ${rotulo}${extra !== undefined ? ': ' + extra : ''}`);
  };
  const fim = (titulo) => {
    console.log(estado.falhas === 0 ? `\n🎉 ${titulo}` : `\n⚠️ ${estado.falhas} falha(s) em ${titulo}`);
    process.exitCode = estado.falhas === 0 ? 0 : 1;
    return estado.falhas;
  };
  return { ok, fim, estado };
}

/** Uma submissão do formulário, pronta para salvarResposta() */
function envio(avaliacoes) { return { pesquisa_id: 'pesquisa_360', avaliacoes: avaliacoes }; }
function notas(v) { const r = {}; for (let q = 0; q < 7; q++) r['q' + q] = String(v); return r; }

module.exports = { criarAmbiente, criarVerificador, envio, notas, RAIZ };

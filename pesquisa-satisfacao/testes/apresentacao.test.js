/**
 * Roda gerarApresentacaoDaArea('Planejamento & Gestão') contra um SlidesApp falso.
 * Nenhum deck real é tocado.
 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { criarSlidesApp } = require('./_slides_falso');

const RAIZ = path.join(__dirname, '..');
const DECK = '1axfQX9FW1U4EIlnhJKDA2XizGoERMGNNXF8nmPCOpSI';

const GERAR = "gerarApresentacaoDaArea('Planejamento & Gestão')";
let falhas = 0;
function ok(rotulo, cond, extra) {
  if (!cond) falhas++;
  console.log(`${cond ? '✅' : '❌'} ${rotulo}${extra !== undefined ? ': ' + extra : ''}`);
}

function montar(opts) {
  opts = opts || {};
  const { SlidesApp, deck, registro } = criarSlidesApp(DECK, opts.deck || {});

  const planilha = {
    abas: {},
    getSheetByName(n) { return planilha.abas[n] || null; },
    insertSheet(n) { planilha.abas[n] = criarAba(n); return planilha.abas[n]; }
  };
  function criarAba(nome) {
    const a = {
      nome, dados: [],
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

  const props = opts.props || {};
  const logs = [];
  let uid = 0;
  const sandbox = {
    SpreadsheetApp: { openById: () => planilha },
    SlidesApp,
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: k => (k in props ? props[k] : null),
        setProperty: (k, v) => { props[k] = v; },
        deleteProperty: k => { delete props[k]; }
      })
    },
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
      formatDate: (d, tz, fmt) => (String(fmt).indexOf('HH:mm') > -1 ? '2026-08-20 10:00' : '2026-08-20')
    },
    console
  };
  vm.createContext(sandbox);
  ['sheets.gs'].forEach(f => vm.runInContext(fs.readFileSync(path.join(RAIZ, f), 'utf8'), sandbox));
  vm.runInContext(fs.readFileSync(path.join(RAIZ, 'apresentacao.gs'), 'utf8'), sandbox);

  return { sandbox, planilha, props, logs, deck, registro, rodar: e => vm.runInContext(e, sandbox) };
}

// ─────────────────────────────────────────────────────────────
console.log('\n── 1. Deck vazio (planilha sem respostas) ──');
{
  const a = montar();
  let erro = null;
  try { a.rodar(GERAR); } catch (e) { erro = e; }
  ok('recusa rodar sem respostas', !!erro, erro && erro.message);
  ok('nenhum slide antigo foi removido', a.registro.removidos === 0, a.registro.removidos);
}

console.log('\n── 2. Fluxo feliz (dados de teste seeded) ──');
const cheio = montar();
{
  const a = cheio;
  a.rodar('inserirDadosDeTeste()');
  const linhas = a.planilha.abas['Respostas'].dados.length - 1;
  console.log('   linhas na planilha:', linhas);

  let r = null, erro = null;
  try { r = a.rodar(GERAR); } catch (e) { erro = e; }
  if (erro) console.log('   ERRO:', erro.stack);
  ok('gerou sem exceção', !erro);
  ok('retorno ok:true', r && r.ok === true);
  const fixos = a.rodar('PRH_CONFIG.slidesFixos');
  ok('pelo menos os slides fixos', r && r.slides >= fixos, r && r.slides);
  ok('deck final bate com o roteiro', a.deck._slides.length === (r && r.slides), a.deck._slides.length);
  ok('os 3 slides originais foram removidos', a.registro.removidos === 3, a.registro.removidos);
  ok('deck salvo', a.registro.salvo === true);
  ok('formas desenhadas', a.registro.formas.length > 50, a.registro.formas.length);
  ok('logos inseridos', a.registro.imagens.length >= 1, a.registro.imagens.length);

  // limites do slide
  const W = 720, H = 405;
  // elipses de fundo sangram de propósito; o que importa é o conteúdo
  const fora = a.registro.formas.filter(f => f.tipo !== 'ELLIPSE' && (f.x < -1 || f.y < -1 || f.x + f.w > W + 1 || f.y + f.h > H + 1));
  ok('nenhuma forma de conteúdo estoura o slide', fora.length === 0,
    fora.slice(0, 6).map(f => `s${f.slide} ${f.tipo} x=${f.x} y=${f.y} w=${f.w} h=${f.h} "${String(f.texto || '').slice(0, 25)}"`).join(' | '));

  // sobreposição de rodapé
  const textos = a.registro.textos;
  ok('todo texto tem conteúdo', textos.every(t => String(t.texto).trim() !== ''),
    textos.filter(t => !String(t.texto).trim()).length + ' vazios');

  const semND = textos.filter(t => String(t.texto).indexOf('N/D') > -1);
  console.log('   textos com N/D:', semND.length);
  console.log('   textos com NaN:', textos.filter(t => /NaN|undefined|null/.test(String(t.texto))).length);
  ok('sem NaN/undefined/null em texto', !textos.some(t => /NaN|undefined|\bnull\b/.test(String(t.texto))),
    textos.filter(t => /NaN|undefined|\bnull\b/.test(String(t.texto))).map(t => t.texto).slice(0, 4).join(' | '));

  // texto por slide
  for (let s = 0; s < (r ? r.slides : 0); s++) {
    const n = textos.filter(t => t.slide === s + 3).length;
    if (!n) ok('slide ' + (s + 1) + ' tem texto', false);
  }
}

console.log('\n── 3. Área abaixo do corte externo (poucos avaliadores) ──');
{
  const a = montar();
  // só 2 avaliações externas de Planejamento & Gestão + 1 auto
  a.rodar(`
    salvarResposta({ pesquisa_id:'p', avaliacoes: [
      { area_avaliada:'Planejamento & Gestão', is_autoavaliacao:true,  respostas:{q0:'4',q1:'4',q2:'4',q3:'4',q4:'4',q5:'4',q6:'4'}, abertas:{q7:'Somos ágeis',q8:'Nada a mudar'} },
      { area_avaliada:'Jurídico',              is_autoavaliacao:false, respostas:{q0:'3',q1:'3',q2:'3',q3:'3',q4:'3',q5:'3',q6:'3'}, abertas:{} }
    ]});
    salvarResposta({ pesquisa_id:'p', avaliacoes: [
      { area_avaliada:'Jurídico',              is_autoavaliacao:true,  respostas:{q0:'4',q1:'4',q2:'4',q3:'4',q4:'4',q5:'4',q6:'4'}, abertas:{} },
      { area_avaliada:'Planejamento & Gestão', is_autoavaliacao:false, respostas:{q0:'2',q1:'2',q2:'2',q3:'2',q4:'2',q5:'2',q6:'2'}, abertas:{q7:'Comentario externo aqui',q8:'Melhorar prazos'} }
    ]});
  `);
  let r = null, erro = null;
  try { r = a.rodar(GERAR); } catch (e) { erro = e; }
  if (erro) console.log('   ERRO:', erro.stack);
  ok('gera mesmo com externo abaixo do corte', !erro && r && r.ok);
  const textos = a.registro.textos.map(t => String(t.texto));
  ok('exibe N/D em algum lugar', textos.some(t => t.indexOf('N/D') > -1));
  ok('não vaza comentário externo', !textos.some(t => t.indexOf('Comentario externo aqui') > -1 || t.indexOf('Melhorar prazos') > -1));
  const vazouAuto = textos.filter(t => t.indexOf('Somos ágeis') > -1);
  console.log('   ⚠️  comentário de autoavaliação exposto com 1 resposta:', vazouAuto.length > 0);
  console.log('   textos N/D:', textos.filter(t => t.indexOf('N/D') > -1).slice(0, 6).join(' | '));
}

console.log('\n── 4. Deck fora de 16:9 ──');
{
  const a = montar({ deck: { largura: 720, altura: 540 } });
  a.rodar('inserirDadosDeTeste()');
  let erro = null;
  try { a.rodar(GERAR); } catch (e) { erro = e; }
  ok('recusa deck 4:3', !!erro, erro && erro.message);
  ok('nada removido', a.registro.removidos === 0);
  ok('nenhum slide novo sobrou', a.deck._slides.length === 3, a.deck._slides.length);
}

console.log('\n── 5. Logo inacessível (rollback) ──');
{
  const a = montar({ logoQuebrado: true });
  a.rodar('inserirDadosDeTeste()');
  let r = null, erro = null;
  try { r = a.rodar(GERAR); } catch (e) { erro = e; }
  console.log('   erro?', erro ? erro.message : 'nenhum');
  ok('logo quebrado não derruba a geração (ou faz rollback limpo)',
    (!erro && a.deck._slides.length >= 7) || (erro && a.deck._slides.length === 3),
    a.deck._slides.length + ' slides');
}

console.log('\n── 6. Área inexistente no config ──');
{
  const a = montar();
  a.rodar(`
    salvarResposta({ pesquisa_id:'p', avaliacoes: [
      { area_avaliada:'Jurídico', is_autoavaliacao:true, respostas:{q0:'4',q1:'4',q2:'4',q3:'4',q4:'4',q5:'4',q6:'4'}, abertas:{} }
    ]});
  `);
  let erro = null;
  try { a.rodar(GERAR); } catch (e) { erro = e; }
  ok('erro explica áreas disponíveis', !!erro && /Áreas disponíveis/.test(erro.message), erro && erro.message);
  ok('deck intacto', a.deck._slides.length === 3);
}

console.log('\n── 7. Consolidado de indicadores (uma área por slide) ──');
{
  const a = montar();
  a.rodar('inserirDadosDeTeste()');

  let r = null, erro = null;
  try { r = a.rodar('gerarIndicadoresDeTodasAsAreas()'); } catch (e) { erro = e; }
  if (erro) console.log('   ERRO:', erro.stack);
  ok('gerou sem exceção', !erro);
  ok('retorno ok:true', r && r.ok === true);

  const areas = a.rodar('PRH_areasComRespostas_(lerRespostas_())');
  ok('um slide por área', r && r.slides === areas.length, `${r && r.slides} de ${areas.length}`);
  ok('deck final com a mesma contagem', a.deck._slides.length === areas.length, a.deck._slides.length);
  ok('os 3 slides originais foram removidos', a.registro.removidos === 3, a.registro.removidos);
  ok('deck salvo', a.registro.salvo === true);

  // Cada slide precisa dizer de quem é: o subtítulo do cabeçalho leva a área.
  const textos = a.registro.textos.map(t => String(t.texto));
  const semArea = areas.filter(n => textos.indexOf(n) < 0);
  ok('toda área aparece nomeada em algum slide', semArea.length === 0, semArea.join(', '));
  ok('todo slide é o de indicadores-chave',
    a.registro.textos.filter(t => t.texto === 'INDICADORES-CHAVE').length === areas.length);

  ok('nada de NaN/undefined/null em texto', !textos.some(t => /NaN|undefined|\bnull\b/.test(t)),
    textos.filter(t => /NaN|undefined|\bnull\b/.test(t)).slice(0, 3).join(' | '));

  const W = 720, H = 405;
  const fora = a.registro.formas.filter(f => f.tipo !== 'ELLIPSE' && (f.x < -1 || f.y < -1 || f.x + f.w > W + 1 || f.y + f.h > H + 1));
  ok('nenhuma forma estoura o slide', fora.length === 0,
    fora.slice(0, 3).map(f => `s${f.slide} x=${f.x} y=${f.y}`).join(' | '));

  // O arquivo é o mesmo entre rodadas: o id fica guardado nas propriedades.
  const idGuardado = a.props['DECK_INDICADORES'];
  ok('id do consolidado guardado em propriedade', !!idGuardado, idGuardado);
  const criadosAntes = (a.registro.criados || []).length;
  const r2 = a.rodar('gerarIndicadoresDeTodasAsAreas()');
  ok('segunda rodada reaproveita o arquivo', (a.registro.criados || []).length === criadosAntes);
  ok('e não duplica slides', a.deck._slides.length === areas.length, a.deck._slides.length);
  ok('mesmo deck nas duas rodadas', r2.deckId === r.deckId);
}

console.log('\n── 8. Consolidado sem respostas ──');
{
  const a = montar();
  let erro = null;
  try { a.rodar('gerarIndicadoresDeTodasAsAreas()'); } catch (e) { erro = e; }
  ok('recusa rodar sem respostas', !!erro, erro && erro.message);
  ok('nenhum slide antigo removido', a.registro.removidos === 0, a.registro.removidos);
}

console.log(falhas === 0 ? '\n🎉 tudo passou' : `\n⚠️ ${falhas} falha(s)`);
process.exitCode = falhas ? 1 : 0;

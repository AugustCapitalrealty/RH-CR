/**
 * Painel do RH: segurança, dados e interface.
 * Roda o painel de verdade num navegador (Playwright) contra o servidor falso.
 *
 *   node testes/painel.test.js
 */
const fs = require('fs');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const { criarAmbiente, criarVerificador, envio, notas } = require('./_ambiente');

const { ok, fim } = criarVerificador();
const amb = criarAmbiente();
const rodar = amb.rodar;
const SENHA = 'SenhaForte#2026';

(async () => {
  console.log('══ SEGURANÇA (servidor) ══');
  ok('sem senha configurada, ninguém entra', rodar('obterDadosPainel("qualquer")').negado === true);
  ok('nem com senha vazia', rodar('obterDadosPainel("")').negado === true);

  amb.sandbox.__senha = SENHA;
  rodar('PropertiesService.getScriptProperties().setProperty(CHAVE_SENHA_PAINEL, __senha)');
  ok('senha errada é rejeitada', rodar('obterDadosPainel("errada")').negado === true);
  ok('regravar abas também exige senha', rodar('regerarAbasDaPlanilha("errada")').negado === true);
  ok('exportar também exige senha', rodar('exportarComentarios("errada", {})').negado === true);

  rodar('inicializarPlanilha()');
  rodar('inserirDadosDeTeste()');

  console.log('\n══ DADOS ══');
  const d = rodar('obterDadosPainel(__senha)');
  ok('senha correta libera os dados', !d.negado && d.vazio === false);
  ok('13 áreas', d.areas.length === 13, d.areas.length);
  ok('7 critérios', d.criterios.length === 7, d.criterios.length);
  ok('comentários vieram', d.comentarios.length > 0, d.comentarios.length);
  ok('comentário não carrega ID de avaliação', d.comentarios.every(c => !('id' in c) && !('idAvaliacao' in c)));
  ok('detalhe por área tem nº de notas por pergunta', typeof d.detalhe[d.areas[0].nome][0].n === 'number');

  const p = d.participacao;
  ok('participação usa TOTAL_COLABORADORES', p.total === rodar('TOTAL_COLABORADORES'), p.total);
  ok('respondentes = soma das autoavaliações', p.respondentes === d.areas.reduce((s, a) => s + a.nAuto, 0), p.respondentes);
  ok('percentual coerente', p.percentual === Math.round((p.respondentes / p.total) * 100), p.percentual + '%');

  console.log('\n══ INTERFACE ══');
  fs.writeFileSync('/tmp/painel.test.html', rodar('getPainelHTML()'));
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  const erros = [];
  page.on('pageerror', e => erros.push(e.message));

  await page.exposeFunction('__servidor', (fn, args) => rodar(`${fn}(${args.map(a => JSON.stringify(a)).join(',')})`));
  await page.addInitScript(() => {
    window.google = { script: { run: {
      _s: null, _f: null,
      withSuccessHandler(f) { const c = Object.create(this); c._s = f; c._f = this._f; return c; },
      withFailureHandler(f) { const c = Object.create(this); c._f = f; c._s = this._s; return c; },
      obterDadosPainel(s) { window.__servidor('obterDadosPainel', [s]).then(this._s).catch(this._f); },
      regerarAbasDaPlanilha(s) { window.__servidor('regerarAbasDaPlanilha', [s]).then(this._s).catch(this._f); },
      exportarComentarios(s, f) { window.__servidor('exportarComentarios', [s, f]).then(this._s).catch(this._f); }
    } } };
  });
  await page.goto('file:///tmp/painel.test.html');
  await page.waitForTimeout(300);

  ok('abre pedindo senha', await page.evaluate(() => !document.getElementById('telaEntrada').classList.contains('oculto')));
  await page.fill('#campoSenha', 'errada');
  await page.click('#btnEntrar');
  await page.waitForTimeout(350);
  ok('senha errada mostra erro', (await page.evaluate(() => document.getElementById('erroSenha').textContent)).includes('incorreta'));

  await page.fill('#campoSenha', SENHA);
  await page.click('#btnEntrar');
  await page.waitForTimeout(900);
  ok('senha certa entra', await page.evaluate(() => !document.getElementById('telaPainel').classList.contains('oculto')));

  const conta = sel => page.evaluate(s => document.querySelectorAll(s).length, sel);
  ok('5 KPIs', await conta('.kpi') === 5, await conta('.kpi'));
  ok('8 seções', await conta('#conteudo section') === 8, await conta('#conteudo section'));
  ok('índice com 8 links', await conta('#indice a') === 8, await conta('#indice a'));

  console.log('\n── Pergunta por área ──');
  ok('seletor com as 7 perguntas', await conta('#perguntaAlvo option') === 7);
  ok('13 áreas na pergunta escolhida', await conta('#graficoPergunta .linha-barra') === 13);
  ok('resumo em texto', (await page.evaluate(() => document.getElementById('resumoPergunta').textContent)).includes('média da empresa'));
  ok('marca da média da empresa nas barras', await conta('#graficoPergunta .marca-ref') > 0);

  const notasVis = () => page.evaluate(() => [...document.querySelectorAll('#graficoPergunta .valor-barra')]
    .map(e => parseFloat(e.textContent.replace(',', '.'))).filter(n => !isNaN(n)));
  await page.selectOption('#ordemPergunta', 'nota-asc'); await page.waitForTimeout(250);
  let v = await notasVis();
  ok('ordem crescente por nota', v.every((n, i) => i === 0 || v[i - 1] <= n), v.slice(0, 3).join(' '));
  await page.selectOption('#ordemPergunta', 'respostas-asc'); await page.waitForTimeout(250);
  const av = await page.evaluate(() => [...document.querySelectorAll('#graficoPergunta .secao')].map(e => parseInt(e.textContent, 10)).filter(n => !isNaN(n)));
  ok('ordem crescente por nº de avaliações', av.every((n, i) => i === 0 || av[i - 1] <= n), av.slice(0, 3).join(' '));

  console.log('\n── Detalhe por área: ordenação ──');
  const criteriosVis = () => page.evaluate(() => [...document.querySelectorAll('#detalheArea tbody tr td:first-child strong')].map(e => e.textContent));
  const valoresDet = () => page.evaluate(() => [...document.querySelectorAll('#detalheArea tbody tr')]
    .map(tr => parseFloat((tr.children[1] || {}).textContent?.replace(',', '.'))).filter(n => !isNaN(n)));
  const ordemForm = await criteriosVis();
  ok('tabela começa na ordem do formulário', ordemForm.length === 7, ordemForm.length);
  await page.selectOption('#ordemDetalhe', 'asc'); await page.waitForTimeout(300);
  const asc = await valoresDet();
  ok('critérios em ordem crescente', asc.length === 7 && asc.every((n, i) => i === 0 || asc[i - 1] <= n), asc.join(' '));
  await page.selectOption('#ordemDetalhe', 'desc'); await page.waitForTimeout(300);
  const desc = await valoresDet();
  ok('e decrescente', desc.length === 7 && desc.every((n, i) => i === 0 || desc[i - 1] >= n), desc.join(' '));
  await page.selectOption('#ordemDetalhe', 'alfabetica'); await page.waitForTimeout(300);
  const alfa = await criteriosVis();
  ok('e alfabética', alfa.every((x, i) => i === 0 || alfa[i - 1].localeCompare(x, 'pt-BR') <= 0), alfa[0]);
  ok('a ordenação também reordena o gráfico',
    (await page.evaluate(() => [...document.querySelectorAll('#radarArea svg text')].map(e => e.textContent).join('|'))).length > 0);
  await page.selectOption('#ordemDetalhe', 'formulario'); await page.waitForTimeout(250);

  console.log('\n── Autoavaliação × percepção: ordenação e filtro ──');
  const autos = () => page.evaluate(() => [...document.querySelectorAll('#graficoComparacao .comp')]
    .map(c => parseFloat(c.querySelectorAll('.valor-barra')[0].textContent.replace(',', '.'))));
  await page.selectOption('#ordemComparacao', 'auto-asc'); await page.waitForTimeout(300);
  const aAsc = await autos();
  ok('ordem crescente por autoavaliação', aAsc.every((n, i) => i === 0 || aAsc[i - 1] <= n), aAsc.slice(0, 3).join(' '));
  await page.selectOption('#ordemComparacao', 'descompasso-asc'); await page.waitForTimeout(300);
  ok('ordem crescente por descompasso não quebra', await conta('#graficoComparacao .comp') === 13);

  await page.selectOption('#ladoComparacao', 'auto'); await page.waitForTimeout(300);
  ok('filtro "só autoavaliação" deixa 1 barra por área', await conta('#graficoComparacao .par') === 13, await conta('#graficoComparacao .par'));
  await page.selectOption('#ladoComparacao', 'externa'); await page.waitForTimeout(300);
  ok('filtro "só como a empresa avalia" idem', await conta('#graficoComparacao .par') === 13);
  await page.selectOption('#ladoComparacao', 'ambos'); await page.waitForTimeout(300);
  ok('os dois lados voltam a 2 barras por área', await conta('#graficoComparacao .par') === 26);

  await page.click('#s-auto button[data-formato="colunas"]'); await page.waitForTimeout(350);
  ok('em colunas, os dois lados = 26 barras', await conta('#graficoComparacao svg rect') === 26);
  await page.selectOption('#ladoComparacao', 'auto'); await page.waitForTimeout(350);
  ok('em colunas, filtro reduz para 13', await conta('#graficoComparacao svg rect') === 13);
  await page.selectOption('#ladoComparacao', 'ambos');
  await page.click('#s-auto button[data-formato="barras"]'); await page.waitForTimeout(300);

  console.log('\n── Participação: contagem sem casa decimal ──');
  await page.click('#s-participacao button[data-formato="colunas"]'); await page.waitForTimeout(350);
  const rotulos = await page.evaluate(() => [...document.querySelectorAll('#graficoParticipacao svg text')]
    .map(e => e.textContent).filter(t => /^\d/.test(t)));
  ok('rótulos de pessoas são inteiros', rotulos.every(t => t.indexOf(',') === -1), rotulos.slice(0, 5).join(' '));
  await page.click('#s-participacao button[data-formato="barras"]'); await page.waitForTimeout(250);

  console.log('\n── Termos mais citados ──');
  const termos = await page.evaluate(() => [...document.querySelectorAll('#blocoTermos .termo')].map(e => ({
    texto: e.childNodes[0].textContent.trim(),
    n: +e.querySelector('.qtd').textContent,
    fundo: e.style.background, tamanho: parseFloat(e.style.fontSize)
  })));
  ok('termos renderizados', termos.length >= 3, termos.length);
  ok('nenhum nome de área entre os termos', !termos.some(t => ['financeiro', 'engenharia', 'juridico', 'jurídico'].includes(t.texto)));
  ok('cada termo tem cor de fundo própria', termos.every(t => !!t.fundo));
  ok('o mais citado é maior que o menos citado', termos[0].tamanho >= termos[termos.length - 1].tamanho,
    termos[0].tamanho + ' vs ' + termos[termos.length - 1].tamanho);
  ok('legenda diz sobre quantos comentários conta',
    (await page.evaluate(() => document.getElementById('blocoTermos').textContent)).includes('comentários'));

  console.log('\n── Comentários ──');
  const antes = await conta('.comentario');
  await page.selectOption('#filtroOrigem', 'Autoavaliação'); await page.waitForTimeout(300);
  ok('filtro de origem: só autoavaliação', await page.evaluate(() =>
    [...document.querySelectorAll('.comentario')].every(c => !!c.querySelector('.tag-auto'))));
  await page.selectOption('#filtroOrigem', ''); await page.waitForTimeout(300);
  ok('voltar restaura a lista', await conta('.comentario') === antes);
  await page.fill('#buscaComentario', 'zzzznaoexiste'); await page.waitForTimeout(300);
  ok('busca sem resultado avisa', (await page.evaluate(() => document.getElementById('listaComentarios').textContent)).includes('Nenhum comentário'));
  await page.fill('#buscaComentario', ''); await page.waitForTimeout(300);
  await page.evaluate(() => { const b = document.querySelector('#paginacao button'); if (b) b.click(); });
  await page.waitForTimeout(300);
  ok('"carregar mais" traz mais', await conta('.comentario') > antes);

  console.log('\n── Exportar CSV ──');
  const baixados = [];
  page.on('download', d => baixados.push(d.suggestedFilename()));
  await page.evaluate(() => { document.getElementById('avisoExport').innerHTML = ''; });
  await page.click('#btnExportar');
  await page.waitForTimeout(900);
  const aviso = await page.evaluate(() => document.getElementById('avisoExport').textContent);
  ok('exportação confirma quantos comentários', /\d+ comentários prontos/.test(aviso), aviso.slice(0, 70));
  ok('não afirma que o download começou sem saber', aviso.indexOf('foi iniciado') === -1);
  ok('oferece link manual de fallback',
    await page.evaluate(() => !!document.querySelector('#avisoExport a[download]')));
  const href = await page.evaluate(() => document.querySelector('#avisoExport a[download]').getAttribute('href'));
  ok('o link aponta para um blob válido', /^blob:/.test(href), href.slice(0, 20));

  // o conteúdo do CSV vem do servidor: confere separador, cabeçalho e linhas
  const csv = rodar('exportarComentarios(__senha, {})');
  ok('CSV tem cabeçalho com ; como separador', csv.conteudo.split('\r\n')[0] === '"Área Avaliada";"Origem";"Pergunta";"Comentário"');
  ok('CSV tem uma linha por comentário', csv.conteudo.trim().split('\r\n').length === csv.total + 1, csv.total);
  ok('CSV vem sem BOM (quem põe é o navegador)', csv.conteudo.charCodeAt(0) !== 0xFEFF);
  const filtrado = rodar('exportarComentarios(__senha, {"origem":"Autoavaliação"})');
  ok('exportação respeita o filtro', filtrado.total < csv.total, filtrado.total + ' de ' + csv.total);
  ok('nome do arquivo reflete o filtro', filtrado.nome.indexOf('Autoavaliação') !== -1, filtrado.nome);

  ok('nenhum erro de JavaScript na página', erros.length === 0, erros.join('; '));
  await browser.close();
  fim('Painel OK.');
})();

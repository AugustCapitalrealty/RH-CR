/** Apresentação da empresa contra um SlidesApp falso. */
const { montarEmpresa, DECK } = require('./_empresa');
const { criarVerificador } = require('./_ambiente');

const { ok, fim } = criarVerificador();

console.log('\n── De onde vem o ID do deck ──');
{
  const a = montarEmpresa({ props: {} });
  ok('o código tem precedência sobre a propriedade de script',
    a.rodar('PRHE_deckId_()') === a.rodar('PRHE_CONFIG.deckId'));
  ok('deck configurado bate com o do teste', a.rodar('PRHE_deckId_()') === DECK);
  // Hoje os dois decks são o mesmo; se um dia se separarem, este aviso some.
  const mesmo = a.rodar('PRH_CONFIG.deckId === PRHE_deckId_()');
  console.log('   ⚠️  empresa e área apontam para o mesmo deck:', mesmo);
}

console.log('\n── Planilha vazia ──');
{
  const a = montarEmpresa();
  let erro = null;
  try { a.rodar('PRHE_gerarApresentacaoEmpresa()'); } catch (e) { erro = e; }
  ok('recusa rodar sem respostas', !!erro, erro && erro.message);
  ok('nenhum slide antigo removido', a.registro.removidos === 0);
}

console.log('\n── Fluxo completo ──');
const cheio = montarEmpresa();
{
  const a = cheio;
  a.rodar('inserirDadosDeTeste()');
  let r = null, erro = null;
  try { r = a.rodar('PRHE_gerarApresentacaoEmpresa()'); } catch (e) { erro = e; }
  if (erro) console.log('   ERRO:', erro.stack);
  ok('gerou sem exceção', !erro);
  ok('retorno ok:true', r && r.ok === true);

  const perguntasNota = a.rodar("PERGUNTAS.filter(function(p){return p.tipo==='rating';}).length");
  const esperado = 5 + perguntasNota;
  ok('um slide por pergunta + os 5 fixos', r && r.slides === esperado, (r && r.slides) + ' de ' + esperado);
  ok('deck final com a mesma contagem', a.deck._slides.length === esperado, a.deck._slides.length);
  ok('os 3 slides originais foram removidos', a.registro.removidos === 3, a.registro.removidos);
  ok('deck salvo', a.registro.salvo === true);

  const W = 720, H = 405;
  const fora = a.registro.formas.filter(f => f.tipo !== 'ELLIPSE' && (f.x < -1 || f.y < -1 || f.x + f.w > W + 1 || f.y + f.h > H + 1));
  ok('nenhuma forma de conteúdo estoura o slide', fora.length === 0,
    fora.slice(0, 5).map(f => `s${f.slide} ${f.tipo} x=${f.x} y=${f.y} w=${f.w} h=${f.h}`).join(' | '));

  const textos = a.registro.textos.map(t => String(t.texto));
  ok('sem NaN/undefined/null em texto', !textos.some(t => /NaN|undefined|\bnull\b/.test(t)),
    textos.filter(t => /NaN|undefined|\bnull\b/.test(t)).slice(0, 3).join(' | '));
  ok('sem tag HTML vinda dos destaques do painel', !textos.some(t => /<[a-z/]/i.test(t)),
    textos.filter(t => /<[a-z/]/i.test(t)).slice(0, 3).join(' | '));
  ok('todo texto tem conteúdo', a.registro.textos.every(t => String(t.texto).trim() !== ''));

  // Os números do deck têm de bater com os do painel: mesma origem.
  const d = a.rodar('dadosDaEmpresa_()');
  ok('nota média da empresa aparece no deck',
    textos.indexOf(d.notaGeral.toFixed(2).replace('.', ',')) > -1, d.notaGeral);
  ok('participação aparece no deck',
    textos.some(t => t.indexOf(d.participacao.respondentes + '/' + d.participacao.total) > -1),
    d.participacao.respondentes + '/' + d.participacao.total);

  // A ordenação de cada slide é a prometida.
  const m = a.rodar('PRHE_montarModelo_(dadosDaEmpresa_())');
  const decrescente = (lista, campo) => lista.every((x, i) => i === 0 || lista[i - 1][campo] >= x[campo]);
  const crescente = (lista, campo) => lista.every((x, i) => i === 0 || lista[i - 1][campo] <= x[campo]);
  ok('ranking em ordem decrescente de nota externa', decrescente(m.ranking, 'notaExterna'));
  // O confronto ordena pelo gap, não pela autoavaliação: quem mais se
  // superestima abre o slide, quem é mais bem visto do que se vê fecha.
  ok('confronto do gap mais negativo para o mais positivo', crescente(m.confronto, 'diferenca'));
  ok('critérios do melhor para o pior', decrescente(m.criterios, 'media'));
  ok('cada slide de pergunta em ordem decrescente',
    m.porPergunta.every(p => decrescente(p.areas, 'externa')));
  ok('todas as perguntas de nota viraram slide', m.porPergunta.length === perguntasNota, m.porPergunta.length);

  // A contagem "N de M áreas abaixo da média" precisa fechar.
  const contaConfere = m.porPergunta.every(p =>
    p.media === null || p.abaixoDaMedia === p.areas.filter(a2 => a2.externa < p.media).length);
  ok('contagem de áreas abaixo da média confere', contaConfere);
}

console.log('\n── Deck fora de 16:9 ──');
{
  const a = montarEmpresa({ deck: { largura: 720, altura: 540 } });
  a.rodar('inserirDadosDeTeste()');
  let erro = null;
  try { a.rodar('PRHE_gerarApresentacaoEmpresa()'); } catch (e) { erro = e; }
  ok('recusa deck 4:3', !!erro && /16:9/.test(erro.message));
  ok('nada removido', a.registro.removidos === 0);
  ok('nenhum slide novo sobrou', a.deck._slides.length === 3, a.deck._slides.length);
}

console.log('\n── Rollback quando o desenho falha ──');
{
  // Um deck com zero slides iniciais e o logo quebrado: se o desenho explodir,
  // os novos precisam sumir e os antigos ficar.
  const a = montarEmpresa({ logoQuebrado: true });
  a.rodar('inserirDadosDeTeste()');
  let erro = null;
  try { a.rodar('PRHE_gerarApresentacaoEmpresa()'); } catch (e) { erro = e; }
  ok('logo inacessível não derruba nem deixa lixo',
    (!erro && a.deck._slides.length > 3) || (erro && a.deck._slides.length === 3),
    a.deck._slides.length + ' slides');
}

fim('Apresentação da empresa OK.');

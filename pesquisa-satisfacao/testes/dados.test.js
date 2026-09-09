/**
 * Camada de dados: cálculo dos indicadores, cortes de anonimato,
 * separação entre dados de teste e reais.
 *   node testes/dados.test.js
 */
const { criarAmbiente, criarVerificador, envio, notas } = require('./_ambiente');
const { ok, fim } = criarVerificador();

console.log('══ CORTES DE ANONIMATO ══');
{
  const a = criarAmbiente();
  ok('MINIMO_EXTERNO protege quem avalia', a.rodar('MINIMO_EXTERNO') === 5, a.rodar('MINIMO_EXTERNO'));
  ok('MINIMO_AUTOAVALIACAO sem corte (áreas pequenas)', a.rodar('MINIMO_AUTOAVALIACAO') === 1, a.rodar('MINIMO_AUTOAVALIACAO'));

  a.rodar('PropertiesService.getScriptProperties().setProperty(CHAVE_SENHA_PAINEL,"s")');
  a.rodar('inicializarPlanilha()');

  // Jurídico: UMA autoavaliação, SEIS avaliações externas
  a.sandbox.__e = [envio([{ area_avaliada: 'Jurídico', is_autoavaliacao: true, respostas: notas(5), abertas: {} }])];
  for (let i = 0; i < 6; i++) {
    a.sandbox.__e.push(envio([
      { area_avaliada: 'Engenharia', is_autoavaliacao: true, respostas: notas(3), abertas: {} },
      { area_avaliada: 'Jurídico', is_autoavaliacao: false, respostas: notas(2), abertas: {} }
    ]));
  }
  a.rodar('__e.forEach(function(x){ salvarResposta(x); })');

  const d = a.rodar('obterDadosPainel("s")');
  const jur = d.areas.filter(x => x.nome === 'Jurídico')[0];
  ok('1 autoavaliação já libera a comparação', jur.diferenca !== null, jur.diferenca);
  ok('autoavaliação é a resposta daquela pessoa', jur.notaAuto === 5, jur.notaAuto);
  ok('nota externa calculada', jur.notaExterna === 2, jur.notaExterna);

  const eng = d.areas.filter(x => x.nome === 'Engenharia')[0];
  ok('sem avaliação externa, nota fica oculta', eng.notaExterna === null);
  ok('e não há comparação', eng.diferenca === null);

  const html = a.rodar('getPainelHTML()');
  ok('painel marca o caso de resposta única', html.indexOf('selo-unico') !== -1);
}

console.log('\n══ DADOS DE TESTE × DADOS REAIS ══');
{
  const a = criarAmbiente();
  a.rodar('inicializarPlanilha()');
  a.rodar('inserirDadosDeTeste()');
  const soTeste = a.linhasRespostas().length - 1;

  a.sandbox.__reais = [
    envio([
      { area_avaliada: 'Jurídico', is_autoavaliacao: true, respostas: notas(4),
        abertas: { q7: 'Atendem rápido quando é urgente.', q8: 'Poderiam antecipar prazos.' } },
      { area_avaliada: 'Engenharia', is_autoavaliacao: false, respostas: notas(2),
        abertas: { q7: 'Time técnico competente.', q8: 'Comunicação de prazo é falha.' } }
    ]),
    envio([{ area_avaliada: 'Facilities', is_autoavaliacao: true, respostas: notas(3),
        abertas: { q7: 'Resolvem no mesmo dia.', q8: 'Falta previsibilidade.' } }])
  ];
  a.rodar('__reais.forEach(function(x){ salvarResposta(x); })');
  const reais = a.linhasRespostas().length - 1 - soTeste;

  a.logs.length = 0;
  a.rodar('apagarDadosDeTeste()');
  const restou = a.linhasRespostas().slice(1);

  ok('sobrou exatamente o nº de linhas reais', restou.length === reais, restou.length + ' de ' + reais);
  ok('nenhuma linha de teste sobrou', !restou.some(l => String(l[6]).indexOf('Resposta de teste (') === 0));
  ok('comentário real preservado', restou.some(l => l[6] === 'Comunicação de prazo é falha.'));
  ok('nota real preservada', restou.some(l => l[2] === 'Engenharia' && String(l[6]) === '2'));
  ok('cabeçalho intacto', a.linhasRespostas()[0][0] === 'Data');

  a.logs.length = 0;
  a.rodar('apagarDadosDeTeste()');
  ok('rodar de novo não apaga as reais', a.linhasRespostas().length - 1 === reais);
  ok('e avisa que só há dados reais', /NADA foi apagado/.test(a.logs.join(' ')));

  a.logs.length = 0;
  a.rodar('apagarTODASasRespostas()');
  ok('apagar tudo exige confirmação explícita', a.linhasRespostas().length - 1 === reais);
  ok('e explica o que faria', /NADA foi apagado/.test(a.logs.join(' ')));
}

console.log('\n══ PERGUNTAS EM SINCRONIA COM O FORMULÁRIO ══');
{
  const a = criarAmbiente();
  ok('7 critérios objetivos', a.rodar('CRITERIOS').length === 7, a.rodar('CRITERIOS').length);
  ok('9 perguntas no total', a.rodar('PERGUNTAS').length === 9, a.rodar('PERGUNTAS').length);
  // O formulário faz a pergunta por extenso ("Como você avalia a clareza…") e a
  // planilha guarda o nome curto ("Clareza da comunicação"). A ligação entre os
  // dois é o ÍNDICE — é isso que precisa bater, não o texto.
  const form = a.rodar('getFormHTML()');
  const ratings = (form.match(/type:\s*"rating"/g) || []).length;
  const textos = (form.match(/type:\s*"text"/g) || []).length;
  ok('formulário tem 7 perguntas de nota', ratings === 7, ratings);
  ok('formulário tem 2 perguntas abertas', textos === 2, textos);
  ok('índices 0..6 viram os nomes dos critérios', a.rodar('CRITERIOS').every((nome, i) =>
    a.rodar('nomeDaPergunta_(' + i + ', "q' + i + '")') === nome));
  ok('índices 7 e 8 viram as perguntas abertas',
    a.rodar('nomeDaPergunta_(7,"q7")') === 'O que esta área faz muito bem?' &&
    a.rodar('nomeDaPergunta_(8,"q8")') === 'O que esta área poderia melhorar?');
  ok('resposta de pergunta que não existe mais é ignorada na média', (function () {
    const b = criarAmbiente();
    b.rodar('inicializarPlanilha()');
    const aba = b.planilha.abas['Respostas'];
    aba.appendRow(['2026-08-20', 'x1', 'Jurídico', 'Não', 'Pergunta Removida', 'rating', '5']);
    const r = b.rodar('agregarRespostas_(lerRespostas_())');
    return r.perguntasDesconhecidas.indexOf('Pergunta Removida') !== -1;
  })());
}

console.log('\n══ ABAS DE ANÁLISE ══');
{
  const a = criarAmbiente();
  a.rodar('inicializarPlanilha()');
  a.rodar('inserirDadosDeTeste()');
  a.rodar('gerarIndicadores()');
  ['PAINEL', 'POR_PERGUNTA', 'RESUMO_PERGUNTAS', 'COMENTARIOS'].forEach(aba => {
    ok('aba ' + aba + ' gerada com dados', (a.planilha.abas[aba] || { dados: [] }).dados.length > 1);
  });
}

fim('Camada de dados OK.');

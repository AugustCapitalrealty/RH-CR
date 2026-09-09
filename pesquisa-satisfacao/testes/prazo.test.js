/**
 * Encerramento da pesquisa: a trava tem que estar no SERVIDOR.
 *   node testes/prazo.test.js
 */
const { criarAmbiente, criarVerificador, envio, notas } = require('./_ambiente');
const { ok, fim } = criarVerificador();

const PRAZO = '2026-08-28 23:59';
const resposta = envio([{ area_avaliada: 'Jurídico', is_autoavaliacao: true,
  respostas: notas(4), abertas: { q7: 'comentário real' } }]);

function em(agora) {
  const a = criarAmbiente({ agora: agora });
  a.rodar('inicializarPlanilha()');
  a.sandbox.__r = resposta;
  return a;
}

console.log('══ ANTES DO PRAZO (22:00) ══');
let a = em('2026-08-28 22:00');
ok('não está encerrada', a.rodar('pesquisaEncerrada_()') === false);
ok('envio aceito', a.rodar('submitForm(__r)').success === true);
ok('gravou na planilha', a.linhasRespostas().length > 1, a.linhasRespostas().length + ' linhas');
ok('doGet serve o formulário', a.rodar('doGet({parameter:{}})')._h.indexOf('stageIntro') !== -1);
ok('formulário mostra o prazo', a.rodar('getFormHTML()').indexOf('Responda até 28/08/2026 às 23:59') !== -1);

console.log('\n══ NO LIMITE (23:59) ══');
a = em('2026-08-28 23:59');
ok('23:59 em ponto ainda aceita', a.rodar('pesquisaEncerrada_()') === false);
ok('envio às 23:59 aceito', a.rodar('submitForm(__r)').success === true);

console.log('\n══ DEPOIS (00:00 do dia seguinte) ══');
a = em('2026-08-29 00:00');
ok('está encerrada', a.rodar('pesquisaEncerrada_()') === true);
const r = a.rodar('submitForm(__r)');
ok('envio RECUSADO', r.success === false, JSON.stringify(r));
ok('recusa identificada como encerramento', r.encerrada === true);
ok('recusa informa o prazo', r.prazo === '28/08/2026 às 23:59', r.prazo);
ok('NADA foi gravado', a.linhasRespostas().length <= 1, a.linhasRespostas().length + ' linhas');

const pagina = a.rodar('doGet({parameter:{}})')._h;
ok('doGet serve a página de encerrada', pagina.indexOf('Pesquisa encerrada') !== -1);
ok('e NÃO serve o formulário', pagina.indexOf('stageIntro') === -1);
ok('a página informa o prazo', pagina.indexOf('28/08/2026 às 23:59') !== -1);

console.log('\n══ O PAINEL NÃO É AFETADO ══');
ok('painel do RH continua servindo', typeof a.rodar('getPainelHTML()') === 'string');
ok('gerarIndicadores continua rodando', (a.rodar('gerarIndicadores()'), true));

console.log('\n══ MESES/ANOS: comparação de texto ordena certo ══');
ok('setembro > agosto', criarAmbiente({ agora: '2026-09-01 08:00' }).rodar('pesquisaEncerrada_()') === true);
ok('ano seguinte também', criarAmbiente({ agora: '2027-01-01 08:00' }).rodar('pesquisaEncerrada_()') === true);
ok('dia anterior não', criarAmbiente({ agora: '2026-08-27 23:59' }).rodar('pesquisaEncerrada_()') === false);

fim('Encerramento OK.');

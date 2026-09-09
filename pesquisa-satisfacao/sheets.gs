/**
 * ══════════════════════════════════════════════════════════════════════════
 * PESQUISA DE SATISFAÇÃO INTERDEPARTAMENTAL — CAMADA DE DADOS E INDICADORES
 * ══════════════════════════════════════════════════════════════════════════
 *
 * FUNÇÕES PARA EXECUTAR MANUALMENTE (menu "Executar" do editor):
 *
 *   inicializarPlanilha()   → 1x, na configuração inicial. Cria as abas base.
 *   gerarIndicadores()      → sempre que quiser atualizar os resultados.
 *                             Reconstrói PAINEL, POR_PERGUNTA, RESUMO_PERGUNTAS
 *                             e COMENTARIOS a partir da aba Respostas.
 *   inserirDadosDeTeste()   → opcional, popula respostas fictícias para teste.
 *   apagarDadosDeTeste()    → remove APENAS as respostas fictícias, preservando as reais.
 *   verificarConfiguracao() → mostra no Log o que está valendo agora (prazo,
 *                             mínimos, dados de teste). Use quando "colei e
 *                             salvei mas nada mudou".
 *
 * AUTOMAÇÃO (opcional — dispensa rodar gerarIndicadores() na mão):
 *   ativarAtualizacaoAutomatica()    → 1x. Passa a atualizar sozinho todo dia.
 *   desativarAtualizacaoAutomatica() → desliga.
 *   verificarAutomacao()             → mostra se está ligada e a última atualização.
 *
 * As demais funções terminadas em "_" são internas (não aparecem no menu).
 */

// ═══════════════════════ CONFIGURAÇÃO ═══════════════════════

/** ID da planilha onde tudo é gravado (troque pelo ID da sua planilha) */
const ID_PLANILHA = '1v1SEGIhzfBYkI4xBCexZlRfRoqn_2WaHz83S9kR9x6g';

/**
 * ANONIMATO — mínimo de respostas para exibir números.
 * Abaixo desse valor a linha aparece sem nota e com aviso na coluna Status.
 *
 * MINIMO_EXTERNO → avaliações que uma área recebeu DE OUTRAS áreas.
 *   Protege quem avalia. Mantenha em 5.
 *
 * MINIMO_AUTOAVALIACAO → autoavaliações (pessoas da própria área).
 *   Está em 1 porque as áreas da empresa são pequenas e, com um mínimo maior,
 *   a comparação auto × externa simplesmente não aparecia para a maioria delas.
 *
 *   ⚠️ O QUE ISSO CUSTA: com 1, a "média" de uma área de uma pessoa só É a
 *   resposta daquela pessoa. O painel deixa isso à vista (mostra quantas
 *   pessoas sustentam cada barra e marca o caso de uma pessoa), mas o texto
 *   do formulário promete ao respondente que os resultados são "analisados de
 *   forma agregada por área — nunca de forma individual".
 *
 *   Se quiser manter essa promessa literalmente verdadeira, use 2: aí o número
 *   exibido é sempre média de pelo menos duas pessoas, e só áreas de uma pessoa
 *   ficam de fora. Trocar aqui vale para o painel E para as abas da planilha.
 */
const MINIMO_EXTERNO = 5;
const MINIMO_AUTOAVALIACAO = 1;

/**
 * PARTICIPAÇÃO — quantas pessoas a empresa tem hoje.
 * Serve de denominador para o indicador "X de 55 responderam".
 * Atualize quando o quadro mudar; nenhum cálculo de nota depende disto.
 */
const TOTAL_COLABORADORES = 55;

/** Diferença (auto − externo) a partir da qual consideramos que há desalinhamento */
const LIMITE_DESALINHAMENTO = 0.3;

/**
 * ENCERRAMENTO DA PESQUISA — depois deste instante o formulário não aceita
 * mais respostas. Horário de Brasília (America/Sao_Paulo).
 *
 * Formato: 'AAAA-MM-DD HH:MM'.  Deixe vazio ('') para manter a pesquisa aberta
 * por tempo indeterminado.
 *
 * A trava é aplicada NO SERVIDOR, em salvarResposta(). O relógio do
 * computador de quem responde não interfere — quem deixou a página aberta e
 * enviar depois do horário recebe recusa.
 */
const ENCERRAMENTO = '2026-08-28 23:59';

/** true se a pesquisa já passou do horário de encerramento */
function pesquisaEncerrada_() {
  if (!ENCERRAMENTO) return false;
  return agoraEmBrasilia_() > ENCERRAMENTO;
}

/**
 * "Agora" no fuso de Brasília, no mesmo formato de ENCERRAMENTO.
 * Comparar as duas strings funciona porque o formato AAAA-MM-DD HH:MM
 * é ordenável lexicograficamente — e evita erro de fuso ao construir Date.
 */
function agoraEmBrasilia_() {
  return Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'yyyy-MM-dd HH:mm');
}

/** Data/hora do encerramento em formato legível, para mostrar na tela */
function encerramentoLegivel_() {
  if (!ENCERRAMENTO) return '';
  const partes = ENCERRAMENTO.split(' ');
  const d = partes[0].split('-');
  return d[2] + '/' + d[1] + '/' + d[0] + ' às ' + partes[1];
}

/**
 * Marca que identifica respostas fictícias criadas por inserirDadosDeTeste().
 * É por ela que apagarDadosDeTeste() distingue teste de resposta real —
 * não mude sem apagar os dados de teste antes.
 */
const MARCA_TESTE = 'Resposta de teste (';

/** Nomes das abas */
const ABA_RESPOSTAS = 'Respostas';
const ABA_PAINEL = 'PAINEL';
const ABA_POR_PERGUNTA = 'POR_PERGUNTA';
const ABA_RESUMO_PERGUNTAS = 'RESUMO_PERGUNTAS';
const ABA_COMENTARIOS = 'COMENTARIOS';
const ABA_CONFIG = 'CONFIG';

/** Cores (mesma paleta do formulário) */
const COR_NAVY = '#151E49';
const COR_VERDE = '#21C45D';
const COR_VERMELHO = '#E63351';
const COR_CINZA = '#657386';

/**
 * Perguntas na mesma ordem do formulário (main.gs → QUESTIONS).
 * O campo "nome" é exatamente o texto gravado na coluna "Pergunta" da aba Respostas.
 * Se você mudar as perguntas no main.gs, atualize esta lista também.
 */
const PERGUNTAS = [
  { nome: 'Clareza da comunicação',            secao: 'Comunicação',            tipo: 'rating' },
  { nome: 'Cordialidade',                      secao: 'Comunicação',            tipo: 'rating' },
  { nome: 'Velocidade de resposta',            secao: 'Agilidade (SLA)',        tipo: 'rating' },
  { nome: 'Cumprimento de prazos (SLA)',       secao: 'Agilidade (SLA)',        tipo: 'rating' },
  { nome: 'Qualidade das soluções entregues',  secao: 'Qualidade de entrega',   tipo: 'rating' },
  { nome: 'Parceria estratégica',              secao: 'Parceria e colaboração', tipo: 'rating' },
  { nome: 'Grau de esforço / simplicidade',    secao: 'Grau de esforço',        tipo: 'rating' },
  { nome: 'O que esta área faz muito bem?',    secao: 'Comentários',            tipo: 'texto'  },
  { nome: 'O que esta área poderia melhorar?', secao: 'Comentários',            tipo: 'texto'  }
];

/** Só os nomes das perguntas objetivas (notas), na ordem */
const CRITERIOS = PERGUNTAS.filter(function (p) { return p.tipo === 'rating'; })
                           .map(function (p) { return p.nome; });


// ═══════════════════════ GRAVAÇÃO DAS RESPOSTAS ═══════════════════════

/**
 * Grava uma submissão do formulário na aba Respostas.
 * Chamada por submitForm() / doPost() no main.gs.
 *
 * Formato recebido:
 *   { pesquisa_id, timestamp, avaliacoes: [
 *       { area_avaliada, is_autoavaliacao, respostas: {q0..q7}, abertas: {q8,q9} }
 *   ]}
 *
 * Cada área avaliada recebe um ID aleatório PRÓPRIO — não compartilhado entre as
 * áreas de uma mesma pessoa. Assim ninguém consegue juntar todas as respostas de
 * um mesmo respondente cruzando um ID comum.
 */
function salvarResposta(dados) {
  try {
    // Trava de encerramento. Fica aqui, e não só na tela, porque a página pode
    // estar aberta desde antes do prazo e o relógio do cliente não é confiável.
    if (pesquisaEncerrada_()) {
      throw new Error('PESQUISA_ENCERRADA');
    }

    const planilha = SpreadsheetApp.openById(ID_PLANILHA);

    let aba = planilha.getSheetByName(ABA_RESPOSTAS);
    if (!aba) {
      aba = planilha.insertSheet(ABA_RESPOSTAS);
      criarCabecalhoRespostas_(aba);
    }

    // Grava apenas a DATA, sem hora. Se guardássemos o horário exato, todas as
    // linhas de um mesmo envio compartilhariam um carimbo único de milissegundos,
    // permitindo agrupar tudo que uma pessoa respondeu — e, junto com a linha de
    // autoavaliação, descobrir de qual área ela é. A data basta para a análise.
    const dataResposta = formatarDataResposta_(dados.timestamp);
    const linhas = [];

    (dados.avaliacoes || []).forEach(function (avaliacao) {
      const idAvaliacao = Utilities.getUuid();
      const areaAvaliada = avaliacao.area_avaliada || '';
      const ehAuto = !!avaliacao.is_autoavaliacao;

      const notas = avaliacao.respostas || {};
      for (const chave in notas) {
        const indice = parseInt(chave.replace('q', ''), 10);
        linhas.push([
          dataResposta, idAvaliacao, areaAvaliada, ehAuto ? 'Sim' : 'Não',
          nomeDaPergunta_(indice, chave), 'rating', notas[chave]
        ]);
      }

      const comentarios = avaliacao.abertas || {};
      for (const chave in comentarios) {
        if (!comentarios[chave]) continue; // comentário vazio não é gravado
        const indice = parseInt(chave.replace('q', ''), 10);
        linhas.push([
          dataResposta, idAvaliacao, areaAvaliada, ehAuto ? 'Sim' : 'Não',
          nomeDaPergunta_(indice, chave), 'texto', comentarios[chave]
        ]);
      }
    });

    if (linhas.length > 0) {
      aba.getRange(aba.getLastRow() + 1, 1, linhas.length, linhas[0].length).setValues(linhas);
    }

    return { success: true };

  } catch (erro) {
    Logger.log('Erro ao salvar resposta: ' + erro);
    throw erro;
  }
}

/** Converte o índice da pergunta (q0, q1…) no texto legível */
function nomeDaPergunta_(indice, chaveOriginal) {
  return (PERGUNTAS[indice] && PERGUNTAS[indice].nome) || chaveOriginal;
}

/** Devolve só a data (yyyy-MM-dd), descartando o horário — ver comentário em salvarResposta */
function formatarDataResposta_(timestampIso) {
  let data = timestampIso ? new Date(timestampIso) : new Date();
  if (isNaN(data.getTime())) data = new Date(); // timestamp inválido → usa agora
  return Utilities.formatDate(data, 'America/Sao_Paulo', 'yyyy-MM-dd');
}

/** Cria e formata o cabeçalho da aba Respostas */
function criarCabecalhoRespostas_(aba) {
  const cabecalho = [
    'Data', 'Avaliação ID', 'Área Avaliada', 'Autoavaliação',
    'Pergunta', 'Tipo', 'Resposta'
  ];
  aba.appendRow(cabecalho);
  formatarCabecalho_(aba, cabecalho.length, COR_NAVY);
  aba.setFrozenRows(1);
}


/**
 * DIAGNÓSTICO — mostra no Log o que está valendo AGORA no código salvo
 * e na planilha. Use quando "colei e salvei mas nada mudou".
 *
 * Atenção à distinção que essa função ajuda a enxergar:
 *   • O que ela mostra é o CÓDIGO SALVO (Ctrl+S).
 *   • O que o público vê é o CÓDIGO IMPLANTADO (Nova versão).
 * Se o log aqui mostrar o valor novo e a URL continuar antiga, o que falta
 * é criar uma nova versão da implantação.
 */
function verificarConfiguracao() {
  const linhas = [];
  linhas.push('═══ CÓDIGO SALVO NO EDITOR ═══');
  linhas.push('Encerramento da pesquisa .. ' + (ENCERRAMENTO ? encerramentoLegivel_() : 'sem prazo (aberta)'));
  linhas.push('Pesquisa está encerrada? .. ' + (pesquisaEncerrada_() ? 'SIM, não aceita mais respostas' : 'não, aceitando respostas'));
  linhas.push('Agora (Brasília) .......... ' + agoraEmBrasilia_());
  linhas.push('Mínimo externo ............ ' + MINIMO_EXTERNO);
  linhas.push('Mínimo autoavaliação ...... ' + MINIMO_AUTOAVALIACAO);
  linhas.push('Total de colaboradores .... ' + TOTAL_COLABORADORES);

  // BLOQUEAR_REENVIO vive dentro do HTML do formulário (main.gs)
  try {
    const form = getFormHTML();
    linhas.push('Trava de reenvio .......... ' + (form.indexOf('BLOQUEAR_REENVIO = true') !== -1 ? 'LIGADA' : 'desligada'));
    linhas.push('Aviso de prazo no form .... ' + (form.indexOf('Responda até') !== -1 ? 'presente' : 'AUSENTE'));
  } catch (e) {
    linhas.push('Trava de reenvio .......... não deu para ler o main.gs (' + e + ')');
  }

  // Painel: só existe se painel.gs estiver colado
  try {
    linhas.push('Painel do RH .............. ' + (typeof getPainelHTML === 'function' ? 'painel.gs presente' : 'AUSENTE'));
    linhas.push('Senha do painel ........... ' +
      (PropertiesService.getScriptProperties().getProperty(CHAVE_SENHA_PAINEL) ? 'configurada' : 'NÃO configurada'));
  } catch (e) {
    linhas.push('Painel do RH .............. AUSENTE — cole o painel.gs');
  }

  linhas.push('');
  linhas.push('═══ PLANILHA ═══');
  try {
    const aba = SpreadsheetApp.openById(ID_PLANILHA).getSheetByName(ABA_RESPOSTAS);
    if (!aba) {
      linhas.push('Aba Respostas ............. NÃO EXISTE — rode inicializarPlanilha()');
    } else {
      const dados = aba.getDataRange().getValues();
      const idsTeste = {}, autos = {};
      for (let i = 1; i < dados.length; i++) {
        if (String(dados[i][6] || '').indexOf(MARCA_TESTE) === 0) idsTeste[dados[i][1]] = true;
        if (dados[i][3] === 'Sim') autos[dados[i][1]] = true;   // 1 autoavaliação = 1 envio
      }
      const qtdTeste = Object.keys(idsTeste).length;

      linhas.push('Linhas de resposta ........ ' + (dados.length - 1));
      linhas.push('Pessoas que responderam ... ' + Object.keys(autos).length + ' de ' + TOTAL_COLABORADORES);
      linhas.push('Dados de teste ............ ' + (qtdTeste ? qtdTeste + ' avaliações fictícias — rode apagarDadosDeTeste()' : 'nenhum'));
    }
  } catch (e) {
    linhas.push('Planilha .................. ERRO ao abrir: ' + e);
  }

  linhas.push('');
  linhas.push('⚠️ Isto é o CÓDIGO SALVO. Para o público ver, é preciso');
  linhas.push('   Implantar → Gerenciar implantações → ✏️ → Nova versão.');

  const texto = linhas.join('\n');
  Logger.log(texto);
  return texto;
}


// ═══════════════════════ CONFIGURAÇÃO INICIAL ═══════════════════════

/**
 * EXECUTE UMA VEZ na configuração inicial.
 * Cria a aba CONFIG e a aba Respostas (vazia, com cabeçalho).
 * As abas de indicadores são criadas por gerarIndicadores().
 */
function inicializarPlanilha() {
  const planilha = SpreadsheetApp.openById(ID_PLANILHA);

  let config = planilha.getSheetByName(ABA_CONFIG);
  if (!config) {
    config = planilha.insertSheet(ABA_CONFIG, 0);
    config.appendRow(['Chave', 'Valor']);
    config.appendRow(['pesquisa_id', 'pesquisa_360']);
    config.appendRow(['titulo_pesquisa', 'Pesquisa de Satisfação Interdepartamental']);
    config.appendRow(['status', 'ativa']);
    config.appendRow(['criado_em', new Date().toISOString()]);
    formatarCabecalho_(config, 2, COR_NAVY);
  }

  if (!planilha.getSheetByName(ABA_RESPOSTAS)) {
    criarCabecalhoRespostas_(planilha.insertSheet(ABA_RESPOSTAS));
  }

  Logger.log('Planilha inicializada. Agora publique o formulário e rode gerarIndicadores() quando houver respostas.');
}


// ═══════════════════════ GERAÇÃO DOS INDICADORES ═══════════════════════

/**
 * ★ FUNÇÃO PRINCIPAL — EXECUTE ESTA para atualizar todos os resultados.
 *
 * Reconstrói do zero, a partir da aba Respostas:
 *   PAINEL             → nota de cada área, nota da autoavaliação e a diferença
 *   POR_PERGUNTA       → cada pergunta × cada área (análise individual)
 *   RESUMO_PERGUNTAS   → média da empresa em cada pergunta (ranking de temas)
 *   COMENTARIOS        → respostas qualitativas, separadas e embaralhadas
 */
function gerarIndicadores() {
  const registros = lerRespostas_();
  if (!registros || registros.length === 0) {
    Logger.log('Nenhuma resposta encontrada na aba "' + ABA_RESPOSTAS + '".');
    return;
  }

  const resultado = agregarRespostas_(registros);

  if (resultado.perguntasDesconhecidas.length > 0) {
    Logger.log('⚠️ ATENÇÃO: a planilha tem respostas de perguntas que não estão mais no formulário — '
      + 'elas foram IGNORADAS nos cálculos: ' + resultado.perguntasDesconhecidas.join(', ')
      + '. Isso acontece quando a pesquisa muda no meio da coleta. Se for o caso, considere '
      + 'arquivar as respostas antigas antes de continuar.');
  }

  gerarPainel_(resultado);
  gerarAnalisePorPergunta_(resultado);
  gerarResumoPerguntas_(resultado);
  gerarComentarios_(registros, resultado);
  registrarAtualizacao_(registros.length);

  Logger.log('Indicadores gerados a partir de ' + registros.length + ' linhas de resposta.');
}

/** Anota na aba CONFIG quando os indicadores foram atualizados pela última vez */
function registrarAtualizacao_(totalLinhas) {
  try {
    const planilha = SpreadsheetApp.openById(ID_PLANILHA);
    const config = planilha.getSheetByName(ABA_CONFIG);
    if (!config) return;

    const agora = Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'dd/MM/yyyy HH:mm');
    const valores = { ultima_atualizacao: agora, linhas_processadas: totalLinhas };

    const dados = config.getDataRange().getValues();
    Object.keys(valores).forEach(function (chave) {
      let linha = -1;
      for (let i = 0; i < dados.length; i++) {
        if (String(dados[i][0]).trim() === chave) { linha = i + 1; break; }
      }
      if (linha === -1) config.appendRow([chave, valores[chave]]);
      else config.getRange(linha, 2).setValue(valores[chave]);
    });
  } catch (erro) {
    Logger.log('Não foi possível registrar a data da atualização: ' + erro);
  }
}

/** Lê a aba Respostas e devolve uma lista de registros normalizados */
function lerRespostas_() {
  const planilha = SpreadsheetApp.openById(ID_PLANILHA);
  const aba = planilha.getSheetByName(ABA_RESPOSTAS);
  if (!aba) return [];

  const dados = aba.getDataRange().getValues();
  if (dados.length < 2) return [];

  const registros = [];
  // Colunas: 0 Timestamp | 1 Avaliação ID | 2 Área Avaliada | 3 Autoavaliação | 4 Pergunta | 5 Tipo | 6 Resposta
  for (let i = 1; i < dados.length; i++) {
    const linha = dados[i];
    if (!linha[2]) continue;
    registros.push({
      idAvaliacao: String(linha[1]),
      area: String(linha[2]).trim(),
      ehAuto: String(linha[3]).trim().toLowerCase() === 'sim',
      pergunta: String(linha[4]).trim(),
      tipo: String(linha[5]).trim(),
      resposta: linha[6]
    });
  }
  return registros;
}

/**
 * Núcleo do cálculo (função pura — não toca na planilha).
 *
 * Devolve:
 *   areas: {
 *     [nomeDaArea]: {
 *       externo: { avaliadores:n, soma, qtd, media },   ← como as OUTRAS áreas veem
 *       auto:    { avaliadores:n, soma, qtd, media },   ← como a PRÓPRIA área se vê
 *       perguntas: { [pergunta]: { externo:{...}, auto:{...} } }
 *     }
 *   }
 *   perguntas: { [pergunta]: { externo:{...}, auto:{...} } }   ← consolidado da empresa
 */
function agregarRespostas_(registros) {
  const areas = {};
  const perguntas = {};
  const desconhecidas = {}; // perguntas na planilha que não existem mais em PERGUNTAS

  // Perguntas de nota atualmente válidas. Respostas de perguntas removidas do
  // formulário são IGNORADAS, para não misturar versões diferentes da pesquisa.
  const criteriosValidos = {};
  CRITERIOS.forEach(function (nome) { criteriosValidos[nome] = true; });

  function novoAcumulador() {
    return { avaliadores: {}, soma: 0, qtd: 0 };
  }
  function garantirArea(nome) {
    if (!areas[nome]) {
      areas[nome] = { externo: novoAcumulador(), auto: novoAcumulador(), perguntas: {} };
    }
    return areas[nome];
  }
  function garantirPergunta(mapa, nome) {
    if (!mapa[nome]) {
      mapa[nome] = { externo: novoAcumulador(), auto: novoAcumulador() };
    }
    return mapa[nome];
  }
  function acumular(acc, idAvaliacao, nota) {
    acc.avaliadores[idAvaliacao] = true;
    if (nota !== null) { acc.soma += nota; acc.qtd++; }
  }

  registros.forEach(function (r) {
    const area = garantirArea(r.area);
    const origem = r.ehAuto ? 'auto' : 'externo';

    // Conta o avaliador mesmo em linhas de texto ou "na" — é uma avaliação existente
    area[origem].avaliadores[r.idAvaliacao] = true;

    if (r.tipo !== 'rating') return;
    if (r.resposta === 'na' || r.resposta === '' || r.resposta === null) return;

    // Pergunta que já não faz parte do formulário (versão antiga da pesquisa)
    if (!criteriosValidos[r.pergunta]) { desconhecidas[r.pergunta] = true; return; }

    const nota = parseFloat(r.resposta);
    if (isNaN(nota)) return;

    area[origem].soma += nota;
    area[origem].qtd++;

    acumular(garantirPergunta(area.perguntas, r.pergunta)[origem], r.idAvaliacao, nota);
    acumular(garantirPergunta(perguntas, r.pergunta)[origem], r.idAvaliacao, nota);
  });

  // Fecha as médias e converte os mapas de avaliadores em contagem
  function fechar(acc) {
    acc.avaliadores = Object.keys(acc.avaliadores).length;
    acc.media = acc.qtd > 0 ? acc.soma / acc.qtd : null;
    return acc;
  }
  Object.keys(areas).forEach(function (nome) {
    const a = areas[nome];
    fechar(a.externo); fechar(a.auto);
    Object.keys(a.perguntas).forEach(function (p) {
      fechar(a.perguntas[p].externo); fechar(a.perguntas[p].auto);
    });
  });
  Object.keys(perguntas).forEach(function (p) {
    fechar(perguntas[p].externo); fechar(perguntas[p].auto);
  });

  return {
    areas: areas,
    perguntas: perguntas,
    perguntasDesconhecidas: Object.keys(desconhecidas)
  };
}

/**
 * PAINEL — uma linha por área:
 * nota que a área recebeu das outras, nota que ela deu a si mesma, e a diferença.
 */
function gerarPainel_(resultado) {
  const aba = prepararAba_(ABA_PAINEL);

  const cabecalho = [
    'Área', 'Avaliações recebidas (n)', 'Nota da Área',
    'Autoavaliações (n)', 'Nota da Autoavaliação',
    'Gap (Externa − Auto)', 'Leitura', 'Status'
  ];
  aba.appendRow(cabecalho);
  formatarCabecalho_(aba, cabecalho.length, COR_NAVY);

  const linhas = [];
  const coresDiferenca = [];

  Object.keys(resultado.areas).sort(compararTexto_).forEach(function (nomeArea) {
    const area = resultado.areas[nomeArea];

    const temExterno = area.externo.avaliadores >= MINIMO_EXTERNO && area.externo.media !== null;
    const temAuto = area.auto.avaliadores >= MINIMO_AUTOAVALIACAO && area.auto.media !== null;

    const notaExterna = temExterno ? arredondar_(area.externo.media) : '';
    const notaAuto = temAuto ? arredondar_(area.auto.media) : '';
    // Gap = externa − auto: positivo, as outras a veem melhor do que ela se vê.
    const diferenca = (temExterno && temAuto) ? arredondar_(area.externo.media - area.auto.media) : '';

    linhas.push([
      nomeArea,
      area.externo.avaliadores,
      notaExterna,
      area.auto.avaliadores,
      notaAuto,
      diferenca,
      lerDiferenca_(temExterno, temAuto, diferenca),
      montarStatus_(area, temExterno, temAuto)
    ]);
    coresDiferenca.push(corDaDiferenca_(diferenca));
  });

  if (linhas.length === 0) return;

  aba.getRange(2, 1, linhas.length, cabecalho.length).setValues(linhas);
  // Colore a coluna "Gap" (verde = as outras a veem melhor, vermelho = ela se superestima)
  for (let i = 0; i < coresDiferenca.length; i++) {
    if (coresDiferenca[i]) aba.getRange(2 + i, 6).setFontColor(coresDiferenca[i]).setFontWeight('bold');
  }
  finalizarAba_(aba, cabecalho.length);
}

/** Texto interpretando o gap (externa − auto) entre percepção externa e autoavaliação */
function lerDiferenca_(temExterno, temAuto, diferenca) {
  if (!temExterno || !temAuto) return 'Dados insuficientes para comparar';
  if (diferenca <= -LIMITE_DESALINHAMENTO) return 'A área se vê melhor do que as outras a veem';
  if (diferenca >= LIMITE_DESALINHAMENTO) return 'As outras áreas a veem melhor do que ela própria';
  return 'Percepção alinhada';
}

function corDaDiferenca_(diferenca) {
  if (diferenca === '') return null;
  if (diferenca <= -LIMITE_DESALINHAMENTO) return COR_VERMELHO;   // ponto de atenção
  if (diferenca >= LIMITE_DESALINHAMENTO) return COR_VERDE;       // modéstia / reconhecimento
  return COR_CINZA;
}

function montarStatus_(area, temExterno, temAuto) {
  const pendencias = [];
  if (!temExterno) pendencias.push('avaliações externas < ' + MINIMO_EXTERNO);
  if (!temAuto) pendencias.push('sem autoavaliação');
  return pendencias.length === 0 ? 'OK' : 'Oculto por anonimato (' + pendencias.join('; ') + ')';
}

/**
 * POR_PERGUNTA — análise individual de cada questão, por área.
 * Uma linha por (área × pergunta). Formato longo, ideal para filtrar e para o dashboard.
 */
function gerarAnalisePorPergunta_(resultado) {
  const aba = prepararAba_(ABA_POR_PERGUNTA);

  const cabecalho = [
    'Área', 'Seção', 'Pergunta', 'Respostas (n)',
    'Nota (externa)', 'Nota (autoavaliação)', 'Gap (Externa − Auto)', 'Status'
  ];
  aba.appendRow(cabecalho);
  formatarCabecalho_(aba, cabecalho.length, COR_NAVY);

  const linhas = [];

  Object.keys(resultado.areas).sort(compararTexto_).forEach(function (nomeArea) {
    const area = resultado.areas[nomeArea];
    const liberadoExterno = area.externo.avaliadores >= MINIMO_EXTERNO;
    const liberadoAuto = area.auto.avaliadores >= MINIMO_AUTOAVALIACAO;

    PERGUNTAS.filter(function (p) { return p.tipo === 'rating'; }).forEach(function (p) {
      const dado = area.perguntas[p.nome];
      const externo = (dado && dado.externo) || { avaliadores: 0, qtd: 0, media: null };
      const auto = (dado && dado.auto) || { avaliadores: 0, qtd: 0, media: null };

      const temExterno = liberadoExterno && externo.media !== null;
      const temAuto = liberadoAuto && auto.media !== null;

      const notaExterna = temExterno ? arredondar_(externo.media) : '';
      const notaAuto = temAuto ? arredondar_(auto.media) : '';
      const diferenca = (temExterno && temAuto) ? arredondar_(externo.media - auto.media) : '';

      linhas.push([
        nomeArea, p.secao, p.nome, externo.qtd,
        notaExterna, notaAuto, diferenca,
        temExterno ? 'OK' : 'Oculto por anonimato'
      ]);
    });
  });

  if (linhas.length === 0) return;
  aba.getRange(2, 1, linhas.length, cabecalho.length).setValues(linhas);
  finalizarAba_(aba, cabecalho.length);
}

/**
 * RESUMO_PERGUNTAS — média da empresa inteira em cada pergunta.
 * Responde "em qual tema somos melhores/piores como companhia?".
 * Não precisa de corte de anonimato: é o agregado de todas as áreas.
 */
function gerarResumoPerguntas_(resultado) {
  const aba = prepararAba_(ABA_RESUMO_PERGUNTAS);

  const cabecalho = ['Pergunta', 'Seção', 'Respostas (n)', 'Nota média (empresa)', 'Posição'];
  aba.appendRow(cabecalho);
  formatarCabecalho_(aba, cabecalho.length, COR_NAVY);

  const itens = [];
  PERGUNTAS.filter(function (p) { return p.tipo === 'rating'; }).forEach(function (p) {
    const dado = resultado.perguntas[p.nome];
    if (!dado || dado.externo.media === null) return;
    itens.push({ nome: p.nome, secao: p.secao, qtd: dado.externo.qtd, media: dado.externo.media });
  });

  if (itens.length === 0) return;

  itens.sort(function (a, b) { return b.media - a.media; });

  const linhas = itens.map(function (item, indice) {
    return [item.nome, item.secao, item.qtd, arredondar_(item.media), (indice + 1) + 'º'];
  });

  aba.getRange(2, 1, linhas.length, cabecalho.length).setValues(linhas);
  // Verde no melhor tema, vermelho no pior
  aba.getRange(2, 4).setFontColor(COR_VERDE).setFontWeight('bold');
  aba.getRange(1 + linhas.length, 4).setFontColor(COR_VERMELHO).setFontWeight('bold');
  finalizarAba_(aba, cabecalho.length);
}

/**
 * COMENTARIOS — respostas qualitativas separadas das notas.
 *
 * Cuidados de anonimato:
 *  - as linhas são EMBARALHADAS, então não dá para saber quais comentários vieram
 *    da mesma pessoa;
 *  - o ID da avaliação NÃO é exportado, pelo mesmo motivo;
 *  - áreas com poucas avaliações ficam de fora (mesmo corte do PAINEL).
 */
function gerarComentarios_(registros, resultado) {
  const aba = prepararAba_(ABA_COMENTARIOS);

  const cabecalho = ['Área Avaliada', 'Origem', 'Pergunta', 'Comentário'];
  aba.appendRow(cabecalho);
  formatarCabecalho_(aba, cabecalho.length, COR_NAVY);

  const linhas = [];
  const ocultadas = {};

  registros.forEach(function (r) {
    if (r.tipo !== 'texto') return;
    const texto = String(r.resposta || '').trim();
    if (!texto) return;

    const area = resultado.areas[r.area];
    const liberado = area && (r.ehAuto
      ? area.auto.avaliadores >= MINIMO_AUTOAVALIACAO
      : area.externo.avaliadores >= MINIMO_EXTERNO);

    if (!liberado) { ocultadas[r.area] = true; return; }

    linhas.push([r.area, r.ehAuto ? 'Autoavaliação' : 'Outra área', r.pergunta, texto]);
  });

  embaralhar_(linhas);

  if (linhas.length > 0) {
    aba.getRange(2, 1, linhas.length, cabecalho.length).setValues(linhas);
    aba.getRange(2, 4, linhas.length, 1).setWrap(true);
  }

  finalizarAba_(aba, cabecalho.length);
  aba.setColumnWidth(4, 520); // coluna do comentário mais larga

  const nomesOcultos = Object.keys(ocultadas);
  if (nomesOcultos.length > 0) {
    Logger.log('Comentários ocultados por anonimato nas áreas: ' + nomesOcultos.join(', '));
  }
}


// ═══════════════════════ UTILITÁRIOS INTERNOS ═══════════════════════

/** Cria a aba se não existir e limpa o conteúdo anterior */
function prepararAba_(nome) {
  const planilha = SpreadsheetApp.openById(ID_PLANILHA);
  let aba = planilha.getSheetByName(nome);
  if (!aba) aba = planilha.insertSheet(nome);
  aba.clear();
  return aba;
}

function formatarCabecalho_(aba, colunas, cor) {
  aba.getRange(1, 1, 1, colunas)
     .setBackground(cor).setFontColor('#ffffff').setFontWeight('bold');
}

function finalizarAba_(aba, colunas) {
  aba.setFrozenRows(1);
  for (let i = 1; i <= colunas; i++) aba.autoResizeColumn(i);
}

/** Arredonda para 2 casas devolvendo NÚMERO (não texto) — importante para gráficos */
function arredondar_(valor) {
  return Math.round(valor * 100) / 100;
}

function compararTexto_(a, b) {
  return String(a).localeCompare(String(b), 'pt-BR');
}

/** Embaralha no lugar (Fisher–Yates) */
function embaralhar_(lista) {
  for (let i = lista.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = lista[i]; lista[i] = lista[j]; lista[j] = tmp;
  }
  return lista;
}


// ═══════════════════════ AUTOMAÇÃO (ACIONADORES) ═══════════════════════

/**
 * Hora do dia (0–23) em que os indicadores são atualizados automaticamente.
 * O Google executa dentro de uma janela de ~1h em torno desse horário.
 */
const HORA_ATUALIZACAO = 6;

/**
 * EXECUTE UMA VEZ para ligar a atualização automática.
 * A partir daí o Google roda gerarIndicadores() sozinho, todo dia, sem você
 * precisar abrir o editor.
 *
 * Para mudar a frequência, troque a linha .everyDays(1).atHour(HORA_ATUALIZACAO) por:
 *   .everyHours(1)    → de hora em hora
 *   .everyHours(4)    → a cada 4 horas
 *   .everyWeeks(1).onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(8)  → toda segunda às 8h
 * e rode esta função de novo (ela substitui o acionador anterior).
 */
function ativarAtualizacaoAutomatica() {
  desativarAtualizacaoAutomatica(); // evita acionadores duplicados

  ScriptApp.newTrigger('gerarIndicadores')
    .timeBased()
    .everyDays(1)
    .atHour(HORA_ATUALIZACAO)
    .create();

  Logger.log('✅ Atualização automática ATIVADA: todo dia por volta das ' + HORA_ATUALIZACAO + 'h.');
}

/** EXECUTE para desligar a atualização automática. */
function desativarAtualizacaoAutomatica() {
  let removidos = 0;
  ScriptApp.getProjectTriggers().forEach(function (acionador) {
    if (acionador.getHandlerFunction() === 'gerarIndicadores') {
      ScriptApp.deleteTrigger(acionador);
      removidos++;
    }
  });
  Logger.log(removidos > 0
    ? '🛑 Atualização automática DESATIVADA (' + removidos + ' acionador(es) removido(s)).'
    : 'Nenhuma atualização automática estava ativa.');
}

/** EXECUTE para conferir se a automação está ligada e quando rodou pela última vez. */
function verificarAutomacao() {
  const acionadores = ScriptApp.getProjectTriggers().filter(function (a) {
    return a.getHandlerFunction() === 'gerarIndicadores';
  });

  if (acionadores.length === 0) {
    Logger.log('⚪ Atualização automática DESLIGADA. Rode ativarAtualizacaoAutomatica() para ligar.');
  } else {
    Logger.log('🟢 Atualização automática LIGADA (' + acionadores.length + ' acionador).');
  }

  const planilha = SpreadsheetApp.openById(ID_PLANILHA);
  const config = planilha.getSheetByName(ABA_CONFIG);
  if (config) {
    config.getDataRange().getValues().forEach(function (linha) {
      if (String(linha[0]).trim() === 'ultima_atualizacao') {
        Logger.log('Última atualização dos indicadores: ' + linha[1]);
      }
    });
  }
}


// ═══════════════════════ TESTES / MANUTENÇÃO ═══════════════════════

/**
 * Popula a planilha com respostas fictícias para você testar os indicadores.
 *
 * Simula PESSOAS_POR_AREA respondentes de cada área. Cada pessoa avalia a própria
 * área (autoavaliação) + algumas outras escolhidas ao acaso — igual ao formulário real.
 * A autoavaliação é puxada levemente para cima, para a coluna "Diferença" ter o que mostrar.
 */
function inserirDadosDeTeste() {
  const PESSOAS_POR_AREA = 4;   // pessoas fictícias por área
  const AREAS_AVALIADAS = 5;    // quantas outras áreas cada pessoa avalia

  const areas = [
    'Planejamento & Gestão', 'Administrativo/Secretárias', 'Arquitetura',
    'Comercial/Marketing', 'Deminvest', 'Diretoria', 'Engenharia', 'Facilities',
    'Financeiro/Contábil', 'Jurídico', 'Propriedades', 'Recursos Humanos',
    'Tecnologia da Informação'
  ];

  let contador = 0;

  areas.forEach(function (suaArea) {
    for (let pessoa = 0; pessoa < PESSOAS_POR_AREA; pessoa++) {

      const outras = embaralhar_(areas.filter(function (a) { return a !== suaArea; }))
                       .slice(0, AREAS_AVALIADAS);
      const selecionadas = [suaArea].concat(outras);

      const avaliacoes = selecionadas.map(function (area) {
        const ehAuto = area === suaArea;
        const notas = {};
        const comentarios = {};

        // Os índices vêm da lista PERGUNTAS, então isto continua correto
        // mesmo que perguntas sejam adicionadas ou removidas.
        PERGUNTAS.forEach(function (pergunta, indice) {
          if (pergunta.tipo === 'rating') {
            const base = ehAuto ? 3 : 2; // autoavaliação um pouco mais generosa
            notas['q' + indice] = String(Math.min(5, base + Math.floor(Math.random() * 3)));
          } else {
            comentarios['q' + indice] = MARCA_TESTE + pergunta.nome + ') para ' + area;
          }
        });

        return {
          area_avaliada: area,
          is_autoavaliacao: ehAuto,
          respostas: notas,
          abertas: comentarios
        };
      });

      salvarResposta({
        avaliacoes: avaliacoes,
        timestamp: new Date(Date.now() - (contador++) * 600000).toISOString()
      });
    }
  });

  Logger.log(contador + ' respondentes fictícios inseridos. Rode gerarIndicadores() para ver os resultados.');
}

/** Apaga TODAS as respostas (mantém o cabeçalho). Use com cuidado. */
function apagarDadosDeTeste() {
  const planilha = SpreadsheetApp.openById(ID_PLANILHA);
  const aba = planilha.getSheetByName(ABA_RESPOSTAS);
  if (!aba) { Logger.log('A aba de respostas não existe.'); return; }

  const dados = aba.getDataRange().getValues();
  if (dados.length < 2) { Logger.log('Não há respostas na planilha.'); return; }

  // Toda avaliação fictícia grava comentários com a MARCA_TESTE, e as linhas de
  // nota da mesma avaliação compartilham o Avaliação ID — então o ID identifica
  // o bloco inteiro, inclusive as notas, que sozinhas seriam indistinguíveis.
  const idsDeTeste = {};
  for (let i = 1; i < dados.length; i++) {
    if (String(dados[i][6] || '').indexOf(MARCA_TESTE) === 0) idsDeTeste[dados[i][1]] = true;
  }

  const avaliacoesFicticias = Object.keys(idsDeTeste).length;
  if (!avaliacoesFicticias) {
    Logger.log('Nenhum dado de teste encontrado. NADA foi apagado — as ' +
               (dados.length - 1) + ' linhas da planilha são respostas reais.');
    return;
  }

  const manter = dados.slice(1).filter(function (linha) { return !idsDeTeste[linha[1]]; });
  const apagadas = (dados.length - 1) - manter.length;

  // Reescreve de uma vez só. Apagar linha a linha seriam milhares de chamadas,
  // o que estoura o limite de 6 minutos de execução do Apps Script.
  aba.deleteRows(2, dados.length - 1);
  if (manter.length) {
    aba.getRange(2, 1, manter.length, manter[0].length).setValues(manter);
  }

  Logger.log(apagadas + ' linhas de teste apagadas (' + avaliacoesFicticias +
             ' avaliações fictícias). ' + manter.length + ' linhas reais foram MANTIDAS.');
}

/**
 * ⚠️ APAGA TODAS AS RESPOSTAS, reais inclusive. Não tem desfazer.
 * Protegida de propósito: troque CONFIRMO para true, execute, e devolva para false.
 * Use só para zerar a planilha antes de um novo ciclo — e faça uma cópia antes.
 */
function apagarTODASasRespostas() {
  const CONFIRMO = false;

  const planilha = SpreadsheetApp.openById(ID_PLANILHA);
  const aba = planilha.getSheetByName(ABA_RESPOSTAS);
  if (!aba) { Logger.log('A aba de respostas não existe.'); return; }
  const ultima = aba.getLastRow();

  if (!CONFIRMO) {
    Logger.log('NADA foi apagado. Esta função apagaria as ' + Math.max(0, ultima - 1) +
               ' respostas da planilha, incluindo as reais.\n' +
               'Se é isso mesmo que você quer: faça uma cópia da planilha, troque ' +
               'CONFIRMO para true no código, execute, e volte para false depois.\n' +
               'Para remover apenas as respostas fictícias, use apagarDadosDeTeste().');
    return;
  }

  if (ultima > 1) aba.deleteRows(2, ultima - 1);
  Logger.log('Todas as ' + (ultima - 1) + ' respostas foram apagadas.');
}

/**
 * APRESENTAÇÃO POR ÁREA — PESQUISA RH 360º
 *
 * Um deck para cada área avaliada. Depende de sheets.gs (lerRespostas_,
 * agregarRespostas_, PERGUNTAS, compararTexto_).
 *
 * Como rodar, do menu Executar do Apps Script:
 *   gerarApresentacoesDeTodasAsAreas()  — todas as áreas, em ordem alfabética
 *   gerarApresentacaoDeUmaArea()        — só a área na propriedade AREA_UNICA
 *   gerarIndicadoresDeTodasAsAreas()    — um só arquivo, o slide de indicadores
 *                                         de cada área, uma área por slide
 *
 * Cada área tem o seu próprio deck, criado na primeira execução e reaproveitado
 * nas seguintes: o mapa área → deck fica na propriedade de script DECKS_POR_AREA.
 * Rodar de novo atualiza os mesmos arquivos, não cria duplicatas.
 */

const PRH_CONFIG = Object.freeze({
  logoPositivoId: '1XqFtIobiEq7VC2H41sKnFNUuOluw_J4V',
  logoNegativeId: '1Tx9cwk1-1_P1TSGoXLZ828JNQ-rY-w6p',
  locale: 'pt-BR',
  timezone: 'America/Sao_Paulo',
  expectedRatio: 16 / 9,
  slidesFixos: 7,   // capa, kpis, comparação, critérios, 1 de cada comentário, ação
  // Nome dos arquivos criados no Drive, com o nome da área no lugar de {area}.
  nomeDoDeck: 'Pesquisa RH 360º — {area}',
  nomeDoDeckIndicadores: 'Pesquisa RH 360º — Indicadores por área',
  // O Apps Script derruba a execução por tempo. Ao passar disto, a rotina para
  // sozinha e guarda o progresso; a próxima execução continua de onde parou.
  limiteSegundos: 260
});

/** Propriedades de script usadas pela geração por área. */
const PRH_PROP_DECKS = 'DECKS_POR_AREA';     // {"Jurídico": "1AbC...", ...}
const PRH_PROP_FEITAS = 'AREAS_CONCLUIDAS';  // ["Jurídico", ...] da rodada atual
const PRH_PROP_PASTA = 'PASTA_DOS_DECKS';    // opcional: id da pasta do Drive
const PRH_PROP_AREA_UNICA = 'AREA_UNICA';    // usada por gerarApresentacaoDeUmaArea()
const PRH_PROP_DECK_INDICADORES = 'DECK_INDICADORES';  // id do consolidado de indicadores

const PRH_DS = Object.freeze({
  colors: Object.freeze({
    brandDark: '#151E49', brandMed: '#003D7B', brandLight: '#065CA9',
    brandSoft: '#93C5FD', premium: '#60A5FA', bg: '#F8FAFC', card: '#FFFFFF',
    text: '#151E49', body: '#475569', muted: '#94A3B8', lines: '#E2E8F0',
    grid: '#EEF2F7', green: '#10B981', orange: '#F97316', red: '#EF4444'
  }),
  fonts: Object.freeze({ title: 'Montserrat', body: 'Open Sans' }),
  margin: 30,
  headerY: 62,
  contentY: 78
});

const PRH_ASSET_CACHE = {};

/**
 * Gera o deck de todas as áreas, em ordem alfabética.
 *
 * Se o tempo acabar antes do fim, para sozinha e guarda o que já ficou pronto;
 * rodar de novo continua da área seguinte. Ao terminar a última, o progresso é
 * zerado — a próxima execução recomeça do zero e regera tudo com dados novos.
 */
function gerarApresentacoesDeTodasAsAreas() {
  const inicio = new Date();
  PRH_conferirDependencias_();

  const registros = lerRespostas_();
  const areas = PRH_areasComRespostas_(registros);
  if (!areas.length) throw new Error('A aba Respostas está vazia; nenhum deck foi alterado.');

  const feitas = PRH_lerJson_(PRH_PROP_FEITAS, []);
  const pendentes = areas.filter(function (a) { return feitas.indexOf(a) < 0; });
  Logger.log('PRH_: ' + areas.length + ' áreas, ' + pendentes.length + ' pendentes nesta rodada.');

  const resultados = [];
  for (let i = 0; i < pendentes.length; i++) {
    const decorridos = (new Date().getTime() - inicio.getTime()) / 1000;
    if (decorridos > PRH_CONFIG.limiteSegundos) {
      PRH_gravarJson_(PRH_PROP_FEITAS, feitas);
      Logger.log('PRH_: parando por tempo com ' + (pendentes.length - i) + ' área(s) pendente(s). ' +
        'Rode a mesma função de novo para continuar de "' + pendentes[i] + '".');
      return { ok: true, concluidas: resultados, pendentes: pendentes.slice(i) };
    }

    const r = PRH_gerarDeArea_(pendentes[i], registros);
    resultados.push(r);
    feitas.push(pendentes[i]);
    PRH_gravarJson_(PRH_PROP_FEITAS, feitas);
  }

  // Rodada completa: limpa o progresso para a próxima começar do início.
  PropertiesService.getScriptProperties().deleteProperty(PRH_PROP_FEITAS);
  const segundos = Math.round((new Date().getTime() - inicio.getTime()) / 1000);
  Logger.log('PRH_: concluído — ' + resultados.length + ' área(s) nesta execução, ' + segundos + 's.');
  return { ok: true, concluidas: resultados, pendentes: [] };
}

/**
 * Gera o deck de uma área só. Como o menu Executar não passa argumentos, o nome
 * vem da propriedade de script AREA_UNICA (Configurações do projeto →
 * Propriedades do script). Em código, prefira gerarApresentacaoDaArea(nome).
 */
function gerarApresentacaoDeUmaArea() {
  const nome = String(PropertiesService.getScriptProperties().getProperty(PRH_PROP_AREA_UNICA) || '').trim();
  if (!nome) {
    throw new Error('Defina a propriedade de script ' + PRH_PROP_AREA_UNICA + ' com o nome da área. ' +
      'Áreas disponíveis: ' + PRH_areasComRespostas_(lerRespostas_()).join(', '));
  }
  return gerarApresentacaoDaArea(nome);
}

/** Gera o deck de uma área pelo nome. */
function gerarApresentacaoDaArea(area) {
  PRH_conferirDependencias_();
  return PRH_gerarDeArea_(String(area || '').trim(), lerRespostas_());
}

/**
 * Um único arquivo com o slide de indicadores-chave de cada área, uma área por
 * slide, em ordem alfabética.
 *
 * Serve para circular a leitura do gap sem regerar os treze decks completos:
 * é o mesmo slide que abre o deck de cada área, com os mesmos números, só que
 * lado a lado. O deck é sempre o mesmo arquivo — o link que você compartilhar
 * continua valendo depois de cada rodada.
 *
 * Áreas abaixo do corte de anonimato entram assim mesmo: o slide já sabe
 * mostrar "N/D" e dizer que não há notas externas liberadas. Escondê-las aqui
 * faria a lista mentir sobre quantas áreas existem.
 */
function gerarIndicadoresDeTodasAsAreas() {
  const inicio = new Date();
  PRH_conferirDependencias_();

  const registros = lerRespostas_();
  const areas = PRH_areasComRespostas_(registros);
  if (!areas.length) throw new Error('A aba Respostas está vazia; nenhum deck foi alterado.');

  // Os modelos são montados antes de tocar no deck: se alguma área falhar, o
  // arquivo anterior fica intacto, em vez de virar uma lista pela metade.
  const paginas = areas.map(function (area) {
    const modelo = PRH_montarModelo_(registros, area);
    return { id: 'kpis', titulo: 'Indicadores-chave · ' + modelo.area, modelo: modelo };
  });

  const deck = PRH_deckDeIndicadores_();
  Logger.log('PRH_: o conteúdo atual de ' + deck.getId() + ' será substituído por ' + paginas.length + ' slides.');
  PRH_reconstruirPaginas_(deck, paginas, 1);

  const segundos = Math.round((new Date().getTime() - inicio.getTime()) / 1000);
  Logger.log('PRH_: indicadores por área prontos — ' + paginas.length + ' áreas, ' + segundos + 's · ' + deck.getUrl());
  return { ok: true, areas: areas, slides: paginas.length, deckId: deck.getId(), url: deck.getUrl() };
}

/** O arquivo consolidado de indicadores: o mesmo de sempre, criado na primeira vez. */
function PRH_deckDeIndicadores_() {
  const guardado = String(PropertiesService.getScriptProperties().getProperty(PRH_PROP_DECK_INDICADORES) || '').trim();
  if (guardado) {
    try {
      return SlidesApp.openById(guardado);
    } catch (erro) {
      Logger.log('PRH_: o consolidado de indicadores não abriu (' + erro + '); criando outro.');
    }
  }

  const nova = SlidesApp.create(PRH_CONFIG.nomeDoDeckIndicadores);
  PropertiesService.getScriptProperties().setProperty(PRH_PROP_DECK_INDICADORES, nova.getId());
  PRH_guardarNaPasta_(nova.getId());
  Logger.log('PRH_: consolidado de indicadores criado: ' + nova.getUrl());
  return SlidesApp.openById(nova.getId());
}

function PRH_conferirDependencias_() {
  if (typeof lerRespostas_ !== 'function' || typeof agregarRespostas_ !== 'function') {
    throw new Error('Dependências ausentes: copie este arquivo para o mesmo projeto de sheets.gs.');
  }
  if (typeof ID_PLANILHA === 'undefined' || !ID_PLANILHA) {
    throw new Error('ID_PLANILHA não está definido em sheets.gs.');
  }
}

/** Áreas presentes nas respostas, em ordem alfabética de pt-BR. */
function PRH_areasComRespostas_(registros) {
  const vistas = {};
  (registros || []).forEach(function (r) {
    const nome = r && String(r.area || '').trim();
    if (nome) vistas[nome] = true;
  });
  // compararTexto_ vem de sheets.gs e trata acento como o leitor espera:
  // "Água" antes de "Banco", não depois de "Zebra".
  return Object.keys(vistas).sort(typeof compararTexto_ === 'function' ? compararTexto_ : undefined);
}

function PRH_gerarDeArea_(area, registros) {
  const inicio = new Date();
  const modelo = PRH_montarModelo_(registros, area);
  const roteiro = PRH_definirRoteiro_(modelo);
  const deck = PRH_deckDaArea_(modelo.area);

  Logger.log('PRH_: "' + modelo.area + '" — o conteúdo atual de ' + deck.getId() + ' será substituído.');
  PRH_reconstruirDeck_(deck, modelo, roteiro);

  const segundos = Math.round((new Date().getTime() - inicio.getTime()) / 1000);
  Logger.log('PRH_: "' + modelo.area + '" pronta — ' + roteiro.length + ' slides, ' + segundos + 's · ' + deck.getUrl());
  return { ok: true, area: modelo.area, deckId: deck.getId(), url: deck.getUrl(), slides: roteiro.length };
}

/**
 * O deck da área: o mesmo de sempre, criado na primeira vez.
 *
 * O mapa área → deck mora em propriedade de script, e não no código, porque o
 * repositório é público e porque a lista muda quando uma área entra ou sai.
 * Se o arquivo foi apagado ou perdeu o compartilhamento, um novo é criado e o
 * mapa se corrige sozinho.
 */
function PRH_deckDaArea_(area) {
  const mapa = PRH_lerJson_(PRH_PROP_DECKS, {});
  if (mapa[area]) {
    try {
      return SlidesApp.openById(mapa[area]);
    } catch (erro) {
      Logger.log('PRH_: o deck de "' + area + '" não abriu (' + erro + '); criando outro.');
    }
  }

  const nova = SlidesApp.create(PRH_CONFIG.nomeDoDeck.replace('{area}', area));
  mapa[area] = nova.getId();
  PRH_gravarJson_(PRH_PROP_DECKS, mapa);
  PRH_guardarNaPasta_(nova.getId());
  Logger.log('PRH_: deck criado para "' + area + '": ' + nova.getUrl());
  return SlidesApp.openById(nova.getId());
}

/** Move o deck recém-criado para a pasta configurada, se houver uma. */
function PRH_guardarNaPasta_(deckId) {
  const pasta = String(PropertiesService.getScriptProperties().getProperty(PRH_PROP_PASTA) || '').trim();
  if (!pasta) return;
  try {
    DriveApp.getFileById(deckId).moveTo(DriveApp.getFolderById(pasta));
  } catch (erro) {
    // Falhar aqui não invalida o deck — ele só fica na raiz do Drive.
    Logger.log('PRH_: não consegui mover o deck para a pasta ' + pasta + ' (' + erro + ').');
  }
}

function PRH_lerJson_(chave, padrao) {
  try {
    const bruto = PropertiesService.getScriptProperties().getProperty(chave);
    return bruto ? JSON.parse(bruto) : padrao;
  } catch (erro) {
    Logger.log('PRH_: propriedade ' + chave + ' ilegível (' + erro + '); recomeçando dela.');
    return padrao;
  }
}

function PRH_gravarJson_(chave, valor) {
  PropertiesService.getScriptProperties().setProperty(chave, JSON.stringify(valor));
}

/** Lista os decks já criados, com link. Útil para conferir e para distribuir. */
function listarDecksDasAreas() {
  const mapa = PRH_lerJson_(PRH_PROP_DECKS, {});
  const nomes = Object.keys(mapa).sort(typeof compararTexto_ === 'function' ? compararTexto_ : undefined);
  if (!nomes.length) { Logger.log('PRH_: nenhum deck criado ainda.'); return []; }
  return nomes.map(function (area) {
    const url = 'https://docs.google.com/presentation/d/' + mapa[area] + '/edit';
    Logger.log(area + '  →  ' + url);
    return { area: area, deckId: mapa[area], url: url };
  });
}

function PRH_montarModelo_(registros, area) {
  if (!Array.isArray(registros)) throw new Error('A fonte de respostas não devolveu uma lista.');
  if (!registros.length) throw new Error('A aba Respostas está vazia; nenhum deck foi alterado.');

  if (!area) throw new Error('Nenhuma área informada para montar o modelo.');
  const alvoNormalizado = PRH_normalizar_(area);
  const daArea = registros.filter(function (r) {
    return r && PRH_normalizar_(r.area) === alvoNormalizado;
  });
  if (!daArea.length) {
    const areas = PRH_unicos_(registros.map(function (r) { return r && r.area; }).filter(Boolean));
    throw new Error('Área "' + area + '" não encontrada. Áreas disponíveis: ' + areas.join(', '));
  }

  const agregadoArea = agregarRespostas_(daArea);
  const nomes = Object.keys(agregadoArea.areas);
  if (nomes.length !== 1) throw new Error('Filtro de escopo retornou mais de uma área.');
  // "area" é o nome pedido; "dados" é o que a agregação apurou sobre ele.
  const dados = agregadoArea.areas[nomes[0]];
  const liberaExterno = dados.externo.avaliadores >= MINIMO_EXTERNO && dados.externo.media !== null;
  const liberaAuto = dados.auto.avaliadores >= MINIMO_AUTOAVALIACAO && dados.auto.media !== null;

  const benchmarks = PRH_calcularBenchmarksSeguros_(registros);
  const criterios = PERGUNTAS.filter(function (p) { return p.tipo === 'rating'; }).map(function (p) {
    const d = dados.perguntas[p.nome] || {};
    const ext = d.externo || { media: null, qtd: 0 };
    const aut = d.auto || { media: null, qtd: 0 };
    const externa = liberaExterno && ext.media !== null ? PRH_arredondar_(ext.media) : null;
    const auto = liberaAuto && aut.media !== null ? PRH_arredondar_(aut.media) : null;
    return {
      nome: p.nome,
      secao: p.secao,
      externa: externa,
      auto: auto,
      diferenca: externa !== null && auto !== null ? PRH_arredondar_(externa - auto) : null,
      nExterno: liberaExterno ? ext.qtd : null,
      benchmark: benchmarks.porPergunta[p.nome] === undefined ? null : benchmarks.porPergunta[p.nome]
    };
  });

  const comentarios = PRH_selecionarComentarios_(daArea, liberaExterno, liberaAuto);
  // Distribuição e posição só existem se a percepção externa passou do corte:
  // abaixo dele, contar as notas uma a uma diria mais do que a média já diz.
  const distribuicao = liberaExterno ? PRH_distribuicaoExterna_(daArea) : null;
  const posicao = liberaExterno ? PRH_posicaoNoRanking_(registros, nomes[0]) : null;
  const notaExterna = liberaExterno ? PRH_arredondar_(dados.externo.media) : null;
  const notaAuto = liberaAuto ? PRH_arredondar_(dados.auto.media) : null;
  // Gap = externa − auto: positivo, as outras a veem melhor do que ela se vê.
  const diferenca = notaExterna !== null && notaAuto !== null
    ? PRH_arredondar_(notaExterna - notaAuto) : null;

  const modelo = {
    area: nomes[0],   // como está escrito na planilha, não como foi digitado
    minimoExterno: MINIMO_EXTERNO,
    minimoAuto: MINIMO_AUTOAVALIACAO,
    nExterno: dados.externo.avaliadores,
    nAuto: dados.auto.avaliadores,
    liberaExterno: liberaExterno,
    liberaAuto: liberaAuto,
    notaExterna: notaExterna,
    notaAuto: notaAuto,
    diferenca: diferenca,
    notaEmpresa: benchmarks.geral,
    nEmpresa: benchmarks.avaliacoes,
    // Quanto a área está acima (+) ou abaixo (−) da média da empresa.
    contraEmpresa: notaExterna !== null && benchmarks.geral !== null
      ? PRH_arredondar_(notaExterna - benchmarks.geral) : null,
    distribuicao: distribuicao,
    posicao: posicao,
    criterios: criterios,
    comentarios: comentarios
  };
  return modelo;
}

/**
 * Quantas notas de cada valor a área recebeu das outras.
 *
 * A média sozinha esconde a forma: 4,25 pode ser todo mundo dando 4, ou metade
 * dando 5 e metade dando 3 — e as duas situações pedem conversas diferentes.
 * As respostas "na" (não sei avaliar) ficam de fora da média e são contadas à
 * parte, porque dizem outra coisa: quanta gente não se sentiu capaz de julgar.
 */
function PRH_distribuicaoExterna_(daArea) {
  const contagem = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let na = 0, total = 0;
  daArea.forEach(function (r) {
    if (!r || r.ehAuto || r.tipo !== 'rating') return;
    if (r.resposta === 'na') { na++; return; }
    if (r.resposta === '' || r.resposta === null || r.resposta === undefined) return;
    const nota = Math.round(Number(r.resposta));
    if (isNaN(nota) || contagem[nota] === undefined) return;
    contagem[nota]++;
    total++;
  });
  return { contagem: contagem, na: na, total: total };
}

/**
 * Posição da área no ranking de percepção externa, entre as áreas elegíveis.
 * Mesmo corte do resto: quem não alcançou MINIMO_EXTERNO não entra na lista
 * nem no denominador.
 */
function PRH_posicaoNoRanking_(registros, area) {
  const porArea = {};
  registros.forEach(function (r) {
    if (!r || r.ehAuto) return;
    const nome = String(r.area || '').trim();
    if (!nome) return;
    if (!porArea[nome]) porArea[nome] = { ids: {}, soma: 0, qtd: 0 };
    porArea[nome].ids[String(r.idAvaliacao || '')] = true;
    if (r.tipo !== 'rating' || r.resposta === 'na' || r.resposta === '' || r.resposta === null) return;
    const nota = Number(r.resposta);
    if (isNaN(nota)) return;
    porArea[nome].soma += nota;
    porArea[nome].qtd++;
  });

  const lista = [];
  Object.keys(porArea).forEach(function (nome) {
    const d = porArea[nome];
    if (Object.keys(d.ids).length >= MINIMO_EXTERNO && d.qtd > 0) {
      lista.push({ nome: nome, media: d.soma / d.qtd });
    }
  });
  lista.sort(function (a, b) { return b.media - a.media; });

  const alvo = PRH_normalizar_(area);
  for (let i = 0; i < lista.length; i++) {
    if (PRH_normalizar_(lista[i].nome) === alvo) return { lugar: i + 1, total: lista.length };
  }
  return null;
}

function PRH_calcularBenchmarksSeguros_(registros) {
  const porArea = {};
  registros.forEach(function (r) {
    if (!r || r.ehAuto) return;
    const nome = String(r.area || '').trim();
    if (!nome) return;
    if (!porArea[nome]) porArea[nome] = {};
    porArea[nome][String(r.idAvaliacao || '')] = true;
  });
  const elegiveis = {};
  Object.keys(porArea).forEach(function (nome) {
    if (Object.keys(porArea[nome]).length >= MINIMO_EXTERNO) elegiveis[nome] = true;
  });

  const acc = {};
  registros.forEach(function (r) {
    if (!r || r.ehAuto || !elegiveis[r.area] || r.tipo !== 'rating') return;
    if (r.resposta === 'na' || r.resposta === '' || r.resposta === null) return;
    const nota = Number(r.resposta);
    if (isNaN(nota)) return;
    if (!acc[r.pergunta]) acc[r.pergunta] = { soma: 0, qtd: 0, ids: {} };
    acc[r.pergunta].soma += nota;
    acc[r.pergunta].qtd++;
    acc[r.pergunta].ids[String(r.area) + '|' + String(r.idAvaliacao)] = true;
  });

  const porPergunta = {};
  let somaGeral = 0, qtdGeral = 0;
  const avaliacoesGerais = {};
  Object.keys(acc).forEach(function (pergunta) {
    const d = acc[pergunta];
    if (Object.keys(d.ids).length >= MINIMO_EXTERNO && d.qtd > 0) {
      porPergunta[pergunta] = PRH_arredondar_(d.soma / d.qtd);
      somaGeral += d.soma;
      qtdGeral += d.qtd;
      Object.keys(d.ids).forEach(function (id) { avaliacoesGerais[id] = true; });
    }
  });

  return {
    porPergunta: porPergunta,
    // Média da empresa: todas as notas externas das áreas elegíveis, juntas.
    // É ponderada por avaliação, não por área — uma área muito avaliada pesa
    // mais. É a mesma conta que a pessoa faria somando a coluna inteira.
    geral: qtdGeral > 0 ? PRH_arredondar_(somaGeral / qtdGeral) : null,
    avaliacoes: Object.keys(avaliacoesGerais).length
  };
}

/**
 * Devolve os comentários já anonimizados, separados pelas duas perguntas
 * abertas: o que a área faz bem e o que pode melhorar. Cada grupo vira um
 * slide próprio.
 */
function PRH_selecionarComentarios_(registros, liberaExterno, liberaAuto) {
  const vistos = {};
  const abertas = PERGUNTAS.filter(function (p) { return p.tipo === 'texto'; });
  const chavePositiva = abertas[0] ? PRH_normalizar_(abertas[0].nome) : '';
  const chaveMelhoria = abertas[1] ? PRH_normalizar_(abertas[1].nome) : '';

  const grupos = { positivos: [], melhorias: [] };
  registros.forEach(function (r) {
    if (!r || r.tipo !== 'texto') return;
    if (r.ehAuto ? !liberaAuto : !liberaExterno) return;
    if (String(r.resposta || '').trim() === '') return;

    const pergunta = PRH_normalizar_(r.pergunta);
    const destino = pergunta === chavePositiva ? 'positivos' : (pergunta === chaveMelhoria ? 'melhorias' : null);
    if (!destino) return;

    const texto = PRH_anonimizarComentario_(r.resposta);
    if (!texto) return;
    const chave = destino + '|' + PRH_normalizar_(texto);
    if (vistos[chave]) return;
    vistos[chave] = true;

    grupos[destino].push({ origem: r.ehAuto ? 'Autoavaliação' : 'Percepção externa', texto: texto });
  });

  // Percepção externa antes da autoavaliação; dentro de cada origem, o trecho
  // mais longo primeiro, para o comentário mais substancial abrir a lista.
  // É uma ordem, não um ranking de relevância — e o rodapé diz isso.
  Object.keys(grupos).forEach(function (k) {
    grupos[k].sort(function (a, b) {
      if (a.origem !== b.origem) return a.origem === 'Percepção externa' ? -1 : 1;
      if (b.texto.length !== a.texto.length) return b.texto.length - a.texto.length;
      return a.texto.localeCompare(b.texto, 'pt-BR');
    });
  });

  return {
    positivos: grupos.positivos,
    melhorias: grupos.melhorias,
    // As páginas são montadas aqui, uma vez, e usadas tanto pelo roteiro
    // quanto pelo desenho. Se cada um paginasse por conta própria, bastaria
    // um ajuste de altura para o título dizer 3/4 e o slide mostrar outra coisa.
    paginasPositivos: PRH_paginarComentarios_(grupos.positivos),
    paginasMelhorias: PRH_paginarComentarios_(grupos.melhorias),
    tituloPositivos: abertas[0] ? abertas[0].nome : 'Pontos fortes',
    tituloMelhorias: abertas[1] ? abertas[1].nome : 'Pontos a melhorar'
  };
}

// Área útil de uma página de comentários, entre o cabeçalho e o rodapé.
const PRH_COMENT_TOPO = 78;
const PRH_COMENT_BASE = 348;
const PRH_COMENT_GAP = 6;

/**
 * Altura que um comentário precisa, estimada pelo tamanho do texto.
 * Os fatores acompanham o que PRH_texto_ usa para encolher a fonte: corpo 9,2,
 * fonte de texto (0,52 de avanço médio) e entrelinha de 116%.
 */
function PRH_alturaComentario_(texto) {
  const largura = 720 - 60 - 62 - 14;   // slide − margens − coluna do número − respiro
  const porLinha = Math.max(20, Math.floor(largura / (9.2 * 0.52)));
  const linhas = Math.max(1, Math.ceil((String(texto).length + 2) / porLinha));
  return Math.max(40, Math.round(linhas * 9.2 * 1.37) + 14);
}

/**
 * Quebra a lista em páginas pelo espaço que cada comentário ocupa, não por uma
 * contagem fixa. Com o texto inteiro no slide, um comentário de três linhas e
 * outro de trinta não cabem no mesmo molde — cinco por página deixaria umas
 * páginas vazias e outras estourando.
 */
function PRH_paginarComentarios_(lista) {
  const paginas = [];
  let atual = [], altura = 0;
  const disponivel = PRH_COMENT_BASE - PRH_COMENT_TOPO;

  lista.forEach(function (c) {
    const h = Math.min(PRH_alturaComentario_(c.texto), disponivel);
    const precisa = altura === 0 ? h : altura + PRH_COMENT_GAP + h;
    if (atual.length && precisa > disponivel) {
      paginas.push(atual);
      atual = [c];
      altura = h;
      return;
    }
    atual.push(c);
    altura = precisa;
  });
  if (atual.length) paginas.push(atual);
  return paginas;
}

function PRH_anonimizarComentario_(texto) {
  let t = String(texto || '').replace(/\s+/g, ' ').trim();
  t = t.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[contato removido]');
  t = t.replace(/https?:\/\/\S+/gi, '[link removido]');
  t = t.replace(/(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?\d{4,5}[-.\s]?\d{4}/g, '[contato removido]');
  return t;   // sem corte: o comentário vai inteiro para o slide
}

function PRH_definirRoteiro_(m) {
  // Os comentários entram todos: cada bloco vira quantos slides forem precisos,
  // cabendo pela altura do texto. Lista vazia ainda rende um slide, com a
  // explicação de por que não há nada para mostrar.
  const paginas = function (grupos, id, titulo) {
    const total = Math.max(1, grupos.length);
    const saida = [];
    for (let i = 0; i < total; i++) {
      saida.push({ id: id + ':' + i, titulo: titulo + (total > 1 ? ' (' + (i + 1) + '/' + total + ')' : '') });
    }
    return saida;
  };

  return [
    { id: 'capa', titulo: 'Pesquisa de satisfação interdepartamental' },
    { id: 'kpis', titulo: 'Indicadores-chave' },
    { id: 'comparacao', titulo: 'Autoavaliação × percepção externa' },
    { id: 'criterios', titulo: 'Os sete critérios' }
  ]
    .concat(paginas(m.comentarios.paginasPositivos, 'fortes', m.comentarios.tituloPositivos))
    .concat(paginas(m.comentarios.paginasMelhorias, 'melhorias', m.comentarios.tituloMelhorias))
    .concat([{ id: 'acao', titulo: 'Plano de ação para validação' }]);
}

function PRH_reconstruirDeck_(deck, modelo, roteiro) {
  // O total varia com a quantidade de comentários, então o piso é o que não muda.
  PRH_reconstruirPaginas_(deck, roteiro.map(function (item) {
    return { id: item.id, titulo: item.titulo, modelo: modelo };
  }), PRH_CONFIG.slidesFixos);
}

/**
 * O núcleo da reconstrução: desenha as páginas novas, e só depois remove as
 * antigas. Cada página traz o próprio modelo, o que permite tanto um deck de
 * uma área só (todas as páginas com o mesmo modelo) quanto o consolidado, com
 * uma área por página.
 *
 * A ordem importa: se o desenho falhar no meio, os slides novos somem e o
 * conteúdo anterior continua onde estava. Ninguém fica com um deck pela metade.
 */
function PRH_reconstruirPaginas_(deck, paginas, minimo) {
  const W = deck.getPageWidth(), H = deck.getPageHeight();
  if (!W || !H || Math.abs(W / H - PRH_CONFIG.expectedRatio) > 0.015) {
    throw new Error('O deck alvo não está em 16:9 (dimensões atuais: ' + W + ' × ' + H + ' pt).');
  }
  if (paginas.length < minimo) {
    throw new Error('Roteiro inválido: esperado ao menos ' + minimo + ' slides, montados ' + paginas.length + '.');
  }

  const anteriores = deck.getSlides().slice();
  const novos = [];
  try {
    paginas.forEach(function (item, indice) {
      const slide = deck.appendSlide(SlidesApp.PredefinedLayout.BLANK);
      novos.push(slide);
      PRH_desenharSlide_(slide, deck, item.id, item.modelo);
      Logger.log('PRH_: slide ' + (indice + 1) + '/' + paginas.length + ' — ' + item.titulo + '.');
    });
  } catch (erro) {
    Logger.log('PRH_: desenho interrompido; removendo somente os novos slides e preservando a versão anterior.');
    novos.forEach(function (slide) {
      try { slide.remove(); } catch (falhaRollback) { Logger.log('PRH_: falha no rollback de um slide novo: ' + falhaRollback); }
    });
    try { deck.saveAndClose(); } catch (falhaSalvar) { Logger.log('PRH_: falha ao salvar rollback: ' + falhaSalvar); }
    throw erro;
  }

  Logger.log('PRH_: ' + paginas.length + ' novos slides prontos; iniciando substituição do conteúdo anterior.');
  anteriores.forEach(function (slide) { slide.remove(); });
  if (deck.getSlides().length !== paginas.length) throw new Error('Contagem final de slides divergente.');
  deck.saveAndClose();
}

function PRH_desenharSlide_(slide, deck, id, m) {
  const W = deck.getPageWidth(), H = deck.getPageHeight();
  if (id === 'capa') return PRH_slideCapa_(slide, W, H, m);
  PRH_fundoClaro_(slide);

  // Slides de comentário: o subtítulo é só a área — a data já está na capa e
  // no rodapé de todo o resto, e aqui ela roubava atenção do texto das pessoas.
  const parte = id.split(':');
  if (parte[0] === 'fortes' || parte[0] === 'melhorias') {
    const positivo = parte[0] === 'fortes';
    const lista = positivo ? m.comentarios.positivos : m.comentarios.melhorias;
    const titulo = (positivo ? m.comentarios.tituloPositivos : m.comentarios.tituloMelhorias).toUpperCase();
    // Duas páginas seguidas com o mesmo título deixam quem folheia sem saber
    // se avançou; o contador no cabeçalho resolve.
    const totalPaginas = Math.max(1, PRH_paginarComentarios_(lista).length);
    const marcador = totalPaginas > 1 ? '  ·  ' + (Number(parte[1]) + 1) + '/' + totalPaginas : '';
    PRH_header_(slide, W, titulo + marcador, m.area);
    PRH_slideComentarios_(slide, W, H, lista, positivo ? PRH_DS.colors.green : PRH_DS.colors.orange, Number(parte[1]));
    return;
  }

  PRH_header_(slide, W, PRH_tituloPorId_(id), m.area);
  if (id === 'kpis') PRH_slideKpis_(slide, W, H, m);
  else if (id === 'comparacao') PRH_slideComparacao_(slide, W, H, m);
  else if (id === 'criterios') PRH_slideCriterios_(slide, W, H, m);
  else if (id === 'acao') PRH_slideAcao_(slide, W, H, m);
  else throw new Error('Tipo de slide desconhecido: ' + id);
}

function PRH_tituloPorId_(id) {
  const mapa = {
    kpis: 'INDICADORES-CHAVE',
    comparacao: 'AUTOAVALIAÇÃO × PERCEPÇÃO EXTERNA', criterios: 'OS SETE CRITÉRIOS',
    acao: 'PLANO DE AÇÃO PARA VALIDAÇÃO'
  };
  return mapa[id] || id;
}

function PRH_slideCapa_(slide, W, H, m) {
  slide.getBackground().setSolidFill(PRH_DS.colors.brandDark);
  PRH_shape_(slide, SlidesApp.ShapeType.RECTANGLE, 0, 0, 7, H, PRH_DS.colors.brandLight, null);
  const halo = PRH_shape_(slide, SlidesApp.ShapeType.ELLIPSE, W - 270, -80, 430, 430, PRH_DS.colors.brandLight, null, 0.16);
  halo.sendToBack();
  PRH_logo_(slide, PRH_CONFIG.logoNegativeId, 42, 28, 130, 36, true);
  PRH_texto_(slide, 44, 116, 560, 20, 'PESQUISA DE SATISFAÇÃO INTERDEPARTAMENTAL', { fs: 9, min: 8, bold: true, color: PRH_DS.colors.premium, family: PRH_DS.fonts.title, oneLine: true });
  PRH_shape_(slide, SlidesApp.ShapeType.RECTANGLE, 44, 145, 68, 4, PRH_DS.colors.premium, null);
  PRH_texto_(slide, 40, 164, 620, 100, String(m.area).toUpperCase(), { fs: 40, min: 22, bold: true, color: '#FFFFFF', family: PRH_DS.fonts.title, spacing: 100 });
  // No lugar da data, o tamanho da amostra: diz o que a capa precisa dizer
  // sobre o peso do que vem a seguir.
  PRH_texto_(slide, 44, 278, 520, 24,
    PRH_inteiro_(m.nExterno) + ' avaliações de outras áreas' +
    (m.notaExterna === null ? '' : ' · nota média ' + PRH_num_(m.notaExterna)),
    { fs: 13, min: 10, color: '#CBD5E1', family: PRH_DS.fonts.body, oneLine: true });
  PRH_texto_(slide, 44, H - 38, W - 88, 14, 'CAPITAL REALTY · USO INTERNO',{ fs: 7, min: 7, bold: true, color: '#CBD5E1', family: PRH_DS.fonts.title, oneLine: true });
}

function PRH_slideKpis_(slide, W, H, m) {
  const cards = [
    // Só os cards de média levam nota de rodapé: contagem e diferença se
    // explicam pelo rótulo, e "corte: 5" era regra interna, não indicador.
    { l: 'AVALIAÇÕES EXTERNAS', v: PRH_inteiro_(m.nExterno), n: '', c: PRH_DS.colors.brandLight },
    { l: 'MÉDIA EXTERNA', v: PRH_numOuND_(m.notaExterna), n: 'escala de 1 a 5', c: PRH_DS.colors.brandMed },
    { l: 'AUTOAVALIAÇÕES', v: PRH_inteiro_(m.nAuto), n: '', c: PRH_DS.colors.premium },
    { l: 'MÉDIA AUTO', v: PRH_numOuND_(m.notaAuto), n: 'escala de 1 a 5', c: PRH_DS.colors.brandLight },
    { l: 'EXTERNA − AUTO', v: m.diferenca === null ? 'N/D' : PRH_numSinal_(m.diferenca), n: '', c: m.diferenca === null ? PRH_DS.colors.muted : PRH_DS.colors.orange }
  ];
  const gap = 12, x = 30, y = 92, cw = (W - 60 - gap * 4) / 5;
  cards.forEach(function (d, i) { PRH_kpi_(slide, x + i * (cw + gap), y, cw, 102, d); });

  PRH_blocoDistribuicao_(slide, x, 206, 430, 148, m);
  PRH_blocoContexto_(slide, 472, 206, W - 502, 148, m);
}

/** Escala de notas do painel: 1 crítico → 5 ótimo. Mesmas cores, mesmo sentido. */
const PRH_ESCALA_NOTA = ['#E63351', '#F47125', '#F9B310', '#73B82E', '#24A85B'];

function PRH_blocoDistribuicao_(slide, x, y, w, h, m) {
  PRH_card_(slide, x, y, w, h, PRH_DS.colors.brandMed);
  PRH_texto_(slide, x + 14, y + 9, w - 28, 14, 'COMO AS NOTAS SE DISTRIBUEM', { fs: 8, min: 7, bold: true, color: PRH_DS.colors.brandMed, family: PRH_DS.fonts.title, oneLine: true });

  const d = m.distribuicao;
  if (!d || !d.total) {
    PRH_texto_(slide, x + 14, y + 32, w - 28, h - 44, 'Sem notas externas liberadas para detalhar.', { fs: 10, min: 8, color: PRH_DS.colors.muted, family: PRH_DS.fonts.body, middle: true });
    return;
  }

  const legenda = PRH_inteiro_(d.total) + ' notas dadas por outras áreas' +
    (d.na > 0 ? ' · ' + PRH_inteiro_(d.na) + ' vezes "não sei avaliar", fora da média' : '');
  PRH_texto_(slide, x + 14, y + 25, w - 28, 12, legenda, { fs: 7, min: 6, color: PRH_DS.colors.muted, family: PRH_DS.fonts.body, oneLine: true });

  // A barra é proporcional à maior contagem, não ao total: com sete notas
  // possíveis concentradas em duas, a escala pelo total achataria tudo.
  let maior = 1;
  for (let v = 1; v <= 5; v++) maior = Math.max(maior, d.contagem[v]);

  const rotuloW = 16, barraX = x + 14 + rotuloW + 6, valorW = 62;
  const barraW = w - (barraX - x) - valorW - 14;
  const linhaH = 19;
  for (let v = 5; v >= 1; v--) {
    const ry = y + 42 + (5 - v) * linhaH;
    const n = d.contagem[v];
    const cor = PRH_ESCALA_NOTA[v - 1];
    PRH_texto_(slide, x + 14, ry, rotuloW, linhaH, String(v), { fs: 9, min: 7, bold: true, color: cor, family: PRH_DS.fonts.title, oneLine: true, middle: true, align: 'center' });
    PRH_shape_(slide, SlidesApp.ShapeType.RECTANGLE, barraX, ry + 5, barraW, 9, PRH_DS.colors.grid, null);
    if (n > 0) PRH_shape_(slide, SlidesApp.ShapeType.RECTANGLE, barraX, ry + 5, Math.max(2, barraW * n / maior), 9, cor, null);
    PRH_texto_(slide, barraX + barraW + 6, ry, valorW - 6, linhaH,
      PRH_inteiro_(n) + '  (' + Math.round(n * 100 / d.total) + '%)',
      { fs: 7.4, min: 6, bold: n > 0, color: n > 0 ? PRH_DS.colors.text : PRH_DS.colors.muted, family: PRH_DS.fonts.title, oneLine: true, middle: true });
  }
}

function PRH_blocoContexto_(slide, x, y, w, h, m) {
  const validos = m.criterios.filter(function (c) { return c.externa !== null; })
    .sort(function (a, b) { return b.externa - a.externa; });

  const itens = [
    { l: 'POSIÇÃO ENTRE AS ÁREAS',
      v: m.posicao ? m.posicao.lugar + 'ª de ' + m.posicao.total : 'N/D',
      c: PRH_DS.colors.brandLight },
    { l: 'CRITÉRIO MAIS FORTE',
      v: validos.length ? validos[0].nome + ' · ' + PRH_num_(validos[0].externa) : 'N/D',
      c: PRH_DS.colors.green },
    { l: 'CRITÉRIO MAIS FRACO',
      v: validos.length ? validos[validos.length - 1].nome + ' · ' + PRH_num_(validos[validos.length - 1].externa) : 'N/D',
      c: PRH_DS.colors.orange }
  ];

  const gap = 6, ch = (h - gap * 2) / 3;
  itens.forEach(function (d, i) {
    const cy = y + i * (ch + gap);
    PRH_card_(slide, x, cy, w, ch, d.c);
    PRH_texto_(slide, x + 12, cy + 7, w - 20, 12, d.l, { fs: 6.6, min: 6, bold: true, color: PRH_DS.colors.body, family: PRH_DS.fonts.body, oneLine: true });
    PRH_texto_(slide, x + 12, cy + 20, w - 22, ch - 26, d.v, { fs: 11, min: 7, bold: true, color: d.c, family: PRH_DS.fonts.title, spacing: 106, middle: true });
  });
}

function PRH_slideComparacao_(slide, W, H, m) {
  const x = 48, chartW = 430;
  PRH_card_(slide, 30, 82, 480, 244, PRH_DS.colors.brandLight);
  PRH_texto_(slide, x, 94, 300, 17, 'MÉDIAS GERAIS · ESCALA 1–5', { fs: 9, min: 8, bold: true, color: PRH_DS.colors.brandMed, family: PRH_DS.fonts.title, oneLine: true });
  PRH_barraNota_(slide, x, 118, chartW, 'Percepção externa', m.notaExterna, PRH_DS.colors.brandMed, m.nExterno);
  PRH_barraNota_(slide, x, 188, chartW, 'Autoavaliação', m.notaAuto, PRH_DS.colors.brandLight, m.nAuto);
  PRH_barraNota_(slide, x, 258, chartW, 'Média da empresa', m.notaEmpresa, PRH_DS.colors.muted, m.nEmpresa);

  PRH_card_(slide, 526, 82, W - 556, 244, PRH_DS.colors.orange);
  PRH_texto_(slide, 542, 98, W - 588, 18, 'GAP · EXTERNA − AUTO', { fs: 9, min: 8, bold: true, color: PRH_DS.colors.orange, family: PRH_DS.fonts.title, oneLine: true });
  PRH_texto_(slide, 542, 126, W - 588, 50, m.diferenca === null ? 'N/D' : PRH_numSinal_(m.diferenca), { fs: 28, min: 20, bold: true, color: PRH_DS.colors.text, family: PRH_DS.fonts.title, oneLine: true });
  PRH_texto_(slide, 542, 186, W - 588, 62, m.diferenca === null
    ? 'Comparação retida até ambos os lados alcançarem seus cortes.'
    : PRH_frasePosicao_('A percepção externa está', m.diferenca, 'a autoavaliação'),
    { fs: 9.5, min: 7.5, color: PRH_DS.colors.body, family: PRH_DS.fonts.body, spacing: 118 });
  PRH_texto_(slide, 542, 254, W - 588, 62, m.contraEmpresa === null
    ? 'Comparação com a empresa retida pelo mesmo corte.'
    : PRH_frasePosicao_('A área está', m.contraEmpresa, 'a média da empresa'),
    { fs: 9.5, min: 7.5, color: PRH_DS.colors.body, family: PRH_DS.fonts.body, spacing: 118 });
}

/** "A área está 0,12 ponto acima da média da empresa." */
function PRH_frasePosicao_(sujeito, delta, referencia) {
  const d = Math.abs(delta);
  if (d < 0.005) return sujeito + ' no mesmo nível que ' + referencia + '.';
  const de = referencia.indexOf('a ') === 0 ? 'd' + referencia : 'de ' + referencia;
  return sujeito + ' ' + PRH_num_(d) + ' ponto' + (d > 1 ? 's' : '') +
    (delta > 0 ? ' acima ' : ' abaixo ') + de + '.';
}

/** Os sete critérios em colunas: externa e autoavaliação lado a lado. */
function PRH_slideCriterios_(slide, W, H, m) {
  const esquerda = 52, base = 306, alturaMax = 190, topo = base - alturaMax;
  const larguraPlot = W - esquerda - 30, grupo = larguraPlot / m.criterios.length;
  const larguraBarra = 30, folga = (grupo - larguraBarra * 2 - 6) / 2;

  PRH_legendaAutoExterna_(slide, W - 250, 80);

  // Grade horizontal de 1 a 5, com a escala à esquerda.
  for (let v = 0; v <= 5; v++) {
    const gy = base - alturaMax * v / 5;
    PRH_linha_(slide, esquerda - 6, gy, esquerda + larguraPlot, gy, v === 0 ? PRH_DS.colors.lines : PRH_DS.colors.grid, v === 0 ? 1 : 0.6);
    PRH_texto_(slide, 24, gy - 7, 22, 14, String(v), { fs: 7, min: 6, color: PRH_DS.colors.muted, family: PRH_DS.fonts.body, oneLine: true, align: 'right' });
  }

  // Os traços da empresa vão ANTES das colunas: no Slides a ordem de inserção
  // é a ordem de empilhamento, então as barras cobrem o miolo do traço e sobram
  // só as pontas, de cada lado do grupo. Assim o traço nunca corta o rótulo.
  m.criterios.forEach(function (c, i) {
    if (c.benchmark === null) return;
    const gx = esquerda + i * grupo;
    const by = base - alturaMax * Number(c.benchmark) / 5;
    PRH_linha_(slide, gx + folga - 10, by, gx + folga + larguraBarra * 2 + 16, by, PRH_DS.colors.orange, 1.5);
  });

  m.criterios.forEach(function (c, i) {
    const gx = esquerda + i * grupo;
    [{ valor: c.externa, cor: PRH_DS.colors.brandLight, dx: folga },
     { valor: c.auto, cor: PRH_DS.colors.premium, dx: folga + larguraBarra + 6 }].forEach(function (b) {
      const bx = gx + b.dx;
      if (b.valor === null) {
        PRH_texto_(slide, bx - 6, base - 22, larguraBarra + 12, 14, 'N/D', { fs: 7, min: 6, bold: true, color: PRH_DS.colors.muted, family: PRH_DS.fonts.title, oneLine: true, align: 'center' });
        return;
      }
      const altura = Math.max(2, alturaMax * Number(b.valor) / 5);
      PRH_shape_(slide, SlidesApp.ShapeType.RECTANGLE, bx, base - altura, larguraBarra, altura, b.cor, null);
      // O rótulo vai dentro do topo da coluna. Flutuando acima, ele disputava
      // espaço com o traço da empresa sempre que os dois valores eram próximos.
      const cabeDentro = altura >= 22;
      PRH_texto_(slide, bx - 8, cabeDentro ? base - altura + 3 : base - altura - 15, larguraBarra + 16, 14,
        PRH_num_(b.valor), { fs: 7.6, min: 6.2, bold: true, color: cabeDentro ? '#FFFFFF' : b.cor, family: PRH_DS.fonts.title, oneLine: true, align: 'center' });
    });
    PRH_texto_(slide, gx + 2, base + 8, grupo - 4, 42, c.nome, { fs: 6.6, min: 5.6, bold: true, color: PRH_DS.colors.text, family: PRH_DS.fonts.body, align: 'center', spacing: 110 });
  });

  PRH_texto_(slide, esquerda, topo - 14, 300, 13, 'ESCALA DE 1 A 5', { fs: 6.5, min: 6, bold: true, color: PRH_DS.colors.muted, family: PRH_DS.fonts.title, oneLine: true });
  PRH_texto_(slide, 38, H - 48, W - 76, 14, 'O traço laranja em cada grupo é a média da empresa naquele critério — referência, sem ranking.', { fs: 7, min: 6.5, color: PRH_DS.colors.muted, family: PRH_DS.fonts.body, oneLine: true });
}

/** Legenda compartilhada pelas duas versões do slide de critérios. */
function PRH_legendaAutoExterna_(slide, x, y) {
  PRH_shape_(slide, SlidesApp.ShapeType.RECTANGLE, x, y + 4, 10, 8, PRH_DS.colors.brandLight, null);
  PRH_texto_(slide, x + 15, y, 92, 14, 'Percepção externa', { fs: 7, min: 6, color: PRH_DS.colors.body, family: PRH_DS.fonts.body, oneLine: true });
  PRH_shape_(slide, SlidesApp.ShapeType.RECTANGLE, x + 112, y + 4, 10, 8, PRH_DS.colors.premium, null);
  PRH_texto_(slide, x + 127, y, 78, 14, 'Autoavaliação', { fs: 7, min: 6, color: PRH_DS.colors.body, family: PRH_DS.fonts.body, oneLine: true });
}

/** Comentários em sequência, um por linha. Usado pelos dois slides abertos. */
function PRH_slideComentarios_(slide, W, H, lista, cor, pagina) {
  if (!lista.length) {
    PRH_card_(slide, 30, 92, W - 60, 190, PRH_DS.colors.muted);
    PRH_texto_(slide, 54, 125, W - 108, 100, 'Nenhum comentário pode ser exibido nesta pergunta. O bloco qualitativo respeita o corte de cada origem e não usa conteúdo abaixo do mínimo.', { fs: 16, min: 12, bold: true, color: PRH_DS.colors.text, family: PRH_DS.fonts.title, spacing: 116, middle: true });
    return;
  }

  const x = 30, w = W - 60;
  const paginas = PRH_paginarComentarios_(lista);
  const indice = pagina || 0;
  const mostrados = paginas[indice] || [];
  // Número do primeiro item desta página: a contagem é contínua no bloco todo.
  let inicio = 0;
  for (let k = 0; k < indice; k++) inicio += paginas[k].length;

  let ry = PRH_COMENT_TOPO;
  mostrados.forEach(function (c, i) {
    const linhaH = Math.min(PRH_alturaComentario_(c.texto), PRH_COMENT_BASE - PRH_COMENT_TOPO);
    PRH_card_(slide, x, ry, w, linhaH, cor);
    // A caixa do número precisa comportar dois dígitos: em 26pt o "14" não
    // cabia nem no menor corpo e quebrava em duas linhas.
    PRH_texto_(slide, x + 10, ry, 34, linhaH, PRH_inteiro_(inicio + i + 1), { fs: 15, min: 10, bold: true, color: cor, family: PRH_DS.fonts.title, oneLine: true, middle: true });
    PRH_texto_(slide, x + 48, ry + 5, w - 62, linhaH - 10, '“' + c.texto + '”', { fs: 9.2, min: 6.8, color: PRH_DS.colors.body, family: PRH_DS.fonts.body, spacing: 116, middle: true });
    ry += linhaH + PRH_COMENT_GAP;
  });

}

function PRH_slideAcao_(slide, W, H) {
  const cols = [
    { t: '1 · PRIORIDADE', body: '[EDITÁVEL] Definir qual fato automático merece investigação.', c: PRH_DS.colors.brandLight },
    { t: '2 · AÇÃO', body: '[EDITÁVEL] Descrever a iniciativa sem atribuir causa ainda não validada.', c: PRH_DS.colors.brandMed },
    { t: '3 · RESPONSÁVEL', body: '[EDITÁVEL] Nomear uma pessoa responsável e áreas de apoio.', c: PRH_DS.colors.premium },
    { t: '4 · PRAZO E EVIDÊNCIA', body: '[EDITÁVEL] Informar data, indicador de sucesso e fonte de comprovação.', c: PRH_DS.colors.orange }
  ];
  const gap = 12, x = 30, y = 94, cw = (W - 60 - gap * 3) / 4;
  cols.forEach(function (d, i) {
    const cx = x + i * (cw + gap);
    PRH_card_(slide, cx, y, cw, 180, d.c);
    PRH_pill_(slide, cx + 12, y + 15, cw - 24, 23, d.t, d.c, '#FFFFFF');
    PRH_texto_(slide, cx + 14, y + 56, cw - 28, 94, d.body, { fs: 10.2, min: 8, color: PRH_DS.colors.text, family: PRH_DS.fonts.body, spacing: 122 });
  });
}

function PRH_fundoClaro_(slide) { slide.getBackground().setSolidFill(PRH_DS.colors.bg); }

function PRH_header_(slide, W, titulo, subtitulo) {
  PRH_shape_(slide, SlidesApp.ShapeType.ELLIPSE, W - 350, -80, 450, 450, PRH_DS.colors.brandLight, null, 0.03).sendToBack();
  PRH_shape_(slide, SlidesApp.ShapeType.RECTANGLE, 30, 13, 5, 36, PRH_DS.colors.brandLight, null);
  PRH_texto_(slide, 44, 6, W - 230, 30, titulo, { fs: 19, min: 12, bold: true, color: PRH_DS.colors.text, family: PRH_DS.fonts.title, oneLine: true, middle: true });
  PRH_texto_(slide, 44, 34, W - 230, 18, subtitulo, { fs: 9.5, min: 7.5, color: PRH_DS.colors.body, family: PRH_DS.fonts.body, oneLine: true, middle: true });
  PRH_logo_(slide, PRH_CONFIG.logoPositivoId, W - 142, 14, 112, 32, false);
  PRH_linha_(slide, 0, 62, W, 62, PRH_DS.colors.lines, 1);
  PRH_linha_(slide, 30, 62, 140, 62, PRH_DS.colors.brandLight, 3);
}

/** O rótulo é opcional: os dois decks usam o mesmo rodapé com textos diferentes. */
function PRH_card_(slide, x, y, w, h, cor) {
  PRH_shape_(slide, SlidesApp.ShapeType.RECTANGLE, x, y, w, h, PRH_DS.colors.card, PRH_DS.colors.lines);
  PRH_shape_(slide, SlidesApp.ShapeType.RECTANGLE, x, y, 4, h, cor || PRH_DS.colors.brandLight, null);
}

function PRH_kpi_(slide, x, y, w, h, d) {
  PRH_card_(slide, x, y, w, h, d.c);
  PRH_texto_(slide, x + 12, y + 8, w - 18, 15, d.l, { fs: 7.3, min: 6, bold: true, color: PRH_DS.colors.body, family: PRH_DS.fonts.body, oneLine: true });
  // Sem nota de rodapé o valor ocupa o espaço dela, senão o card fica com o
  // número encostado no topo e um vazio embaixo.
  PRH_texto_(slide, x + 12, y + 27, w - 20, d.n ? 42 : 58, d.v, { fs: 22, min: 15, bold: true, color: d.c, family: PRH_DS.fonts.title, oneLine: true, middle: true });
  PRH_texto_(slide, x + 12, y + 77, w - 20, 14, d.n, { fs: 7, min: 6.5, color: PRH_DS.colors.muted, family: PRH_DS.fonts.body, oneLine: true });
}

function PRH_barraNota_(slide, x, y, w, label, valor, cor, n) {
  PRH_texto_(slide, x, y, 200, 16, label, { fs: 10, min: 8, bold: true, color: PRH_DS.colors.text, family: PRH_DS.fonts.title, oneLine: true });
  const quantas = Number(n) === 1 ? '1 resposta' : PRH_inteiro_(n) + ' respostas';
  PRH_texto_(slide, x, y + 16, 200, 13, quantas, { fs: 7.5, min: 6.5, color: PRH_DS.colors.muted, family: PRH_DS.fonts.body, oneLine: true });
  PRH_texto_(slide, x + w - 110, y, 110, 24, valor === null ? 'N/D' : PRH_num_(valor), { fs: 15, min: 11, bold: true, color: cor, family: PRH_DS.fonts.title, oneLine: true, align: 'right' });
  PRH_escalaBarra_(slide, x, y + 33, w, 16, valor, cor);
}

function PRH_escalaBarra_(slide, x, y, w, h, valor, cor) {
  PRH_shape_(slide, SlidesApp.ShapeType.RECTANGLE, x, y, w, h, PRH_DS.colors.grid, null);
  for (let i = 1; i < 5; i++) PRH_linha_(slide, x + (w * i / 5), y, x + (w * i / 5), y + h, '#CBD5E1', 0.6);
  if (valor !== null && !isNaN(valor)) {
    const largura = Math.max(0, Math.min(w, w * Number(valor) / 5));
    if (largura > 0) PRH_shape_(slide, SlidesApp.ShapeType.RECTANGLE, x, y, largura, h, cor, null);
  }
}

function PRH_pill_(slide, x, y, w, h, texto, fundo, corTexto) {
  PRH_shape_(slide, SlidesApp.ShapeType.ROUND_RECTANGLE, x, y, w, h, fundo, null);
  PRH_texto_(slide, x - 7, y, w + 14, h, texto, { fs: 7, min: 5.8, bold: true, color: corTexto, family: PRH_DS.fonts.title, oneLine: true, align: 'center', middle: true });
}

function PRH_shape_(slide, tipo, x, y, w, h, fill, border, alpha) {
  const s = slide.insertShape(tipo, x, y, w, h);
  if (fill && alpha !== undefined) s.getFill().setSolidFill(fill, alpha);
  else if (fill) s.getFill().setSolidFill(fill);
  else s.getFill().setTransparent();
  if (border) {
    s.getBorder().getLineFill().setSolidFill(border);
    s.getBorder().setWeight(1);
  } else s.getBorder().setTransparent();
  return s;
}

function PRH_linha_(slide, x1, y1, x2, y2, cor, peso) {
  const l = slide.insertLine(SlidesApp.LineCategory.STRAIGHT, x1, y1, x2, y2);
  l.getLineFill().setSolidFill(cor);
  l.setWeight(peso || 1);
  return l;
}

function PRH_texto_(slide, x, y, w, h, texto, op) {
  const t = String(texto === null || texto === undefined ? '' : texto);
  if (!t) return null;
  const o = op || {}, family = o.family || PRH_DS.fonts.body;
  const factor = family === PRH_DS.fonts.title ? 0.58 : 0.52;
  const lineFactor = (o.spacing || 118) / 100 * 1.18;
  let fs = o.fs || 10, min = o.min || 6.5;
  if (o.oneLine) {
    while (fs > min && t.length * fs * factor * (o.bold ? 1.04 : 1) > Math.max(12, w - 14)) fs -= 0.25;
  } else {
    while (fs > min) {
      const chars = Math.max(1, Math.floor((w - 14) / (fs * factor)));
      const linhas = t.split('\n').reduce(function (soma, linha) { return soma + Math.max(1, Math.ceil(linha.length / chars)); }, 0);
      if (linhas * fs * lineFactor <= h) break;
      fs -= 0.25;
    }
  }
  const box = slide.insertShape(SlidesApp.ShapeType.TEXT_BOX, x, y, w, h);
  if (o.middle) box.setContentAlignment(SlidesApp.ContentAlignment.MIDDLE);
  const tr = box.getText();
  tr.setText(t).getTextStyle().setFontSize(fs).setBold(!!o.bold).setForegroundColor(o.color || PRH_DS.colors.body).setFontFamily(family);
  tr.getParagraphStyle().setParagraphAlignment(
    o.align === 'center' ? SlidesApp.ParagraphAlignment.CENTER : o.align === 'right' ? SlidesApp.ParagraphAlignment.END : SlidesApp.ParagraphAlignment.START
  ).setLineSpacing(Math.max(100, o.spacing || 118));
  return box;
}

function PRH_logo_(slide, id, x, y, w, h, negativo) {
  try {
    if (!PRH_ASSET_CACHE[id]) PRH_ASSET_CACHE[id] = DriveApp.getFileById(id).getBlob();
    const img = slide.insertImage(PRH_ASSET_CACHE[id]);
    const iw = img.getWidth(), ih = img.getHeight();
    const escala = Math.min(w / iw, h / ih);
    img.setWidth(iw * escala).setHeight(ih * escala);
    img.setLeft(x + (w - iw * escala) / 2).setTop(y + (h - ih * escala) / 2);
    return true;
  } catch (erro) {
    Logger.log('PRH_: asset indisponível (' + id + '); aplicado fallback textual. ' + erro);
    PRH_texto_(slide, x, y, w, h, 'CAPITAL REALTY', { fs: 10, min: 7, bold: true, color: negativo ? '#FFFFFF' : PRH_DS.colors.brandDark, family: PRH_DS.fonts.title, oneLine: true, middle: true, align: 'center' });
    return false;
  }
}

function PRH_arredondar_(v) { return Math.round(Number(v) * 100) / 100; }
function PRH_num_(v) { return Number(v).toLocaleString(PRH_CONFIG.locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
/** Contagem: nunca leva casa decimal — "12 respostas", não "12,00 respostas". */
function PRH_inteiro_(v) { return Number(v).toLocaleString(PRH_CONFIG.locale, { maximumFractionDigits: 0 }); }
function PRH_numOuND_(v) { return v === null || v === undefined ? 'N/D' : PRH_num_(v); }
function PRH_numSinal_(v) { return (Number(v) > 0 ? '+' : '') + PRH_num_(v); }
function PRH_limitarTexto_(t, max) { return t.length <= max ? t : t.slice(0, max - 1).replace(/\s+\S*$/, '') + '…'; }
function PRH_unicos_(lista) { const m = {}; return lista.filter(function (v) { const k = String(v); if (m[k]) return false; m[k] = true; return true; }).sort(); }
function PRH_normalizar_(v) {
  return String(v || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');
}

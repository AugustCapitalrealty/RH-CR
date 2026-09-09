/**
 * APRESENTAÇÃO DA EMPRESA — PESQUISA RH 360º
 *
 * Deck consolidado, com os números de todas as áreas. Depende de:
 *   sheets.gs        — lerRespostas_(), agregarRespostas_(), PERGUNTAS
 *   painel.gs        — dadosDaEmpresa_(), a MESMA conta que alimenta o painel
 *   apresentacao.gs  — os utilitários de desenho PRH_*
 *
 * Roda com PRHE_gerarApresentacaoEmpresa(). ATENÇÃO: substitui todos os
 * slides do deck configurado em PRHE_CONFIG.deckId.
 */

const PRHE_CONFIG = Object.freeze({
  // ID do deck da apresentação geral: o trecho da URL entre /d/ e /edit.
  // Pode ficar aqui ou na propriedade de script DECK_EMPRESA — ver PRHE_deckId_().
  //
  deckId: '1axfQX9FW1U4EIlnhJKDA2XizGoERMGNNXF8nmPCOpSI',
  expectedRatio: 16 / 9,
  slidesFixos: 5,   // capa, visão geral, ranking, confronto, critérios
  maxDestaques: 3
});

/** Escala de cores do painel — as mesmas faixas, para o deck e a tela concordarem. */
const PRHE_FAIXAS = Object.freeze([
  Object.freeze({ ate: 2.2, cor: '#E63351', rotulo: 'Crítico (abaixo de 2,2)' }),
  Object.freeze({ ate: 2.9, cor: '#F47125', rotulo: 'Ruim (2,2 a 2,9)' }),
  Object.freeze({ ate: 3.6, cor: '#F9B310', rotulo: 'Regular (2,9 a 3,6)' }),
  Object.freeze({ ate: 4.3, cor: '#73B82E', rotulo: 'Bom (3,6 a 4,3)' }),
  Object.freeze({ ate: 99, cor: '#24A85B', rotulo: 'Ótimo (acima de 4,3)' })
]);

const PRHE_COR_AUTO = '#151E49';      // autoavaliação, igual ao painel
const PRHE_COR_EXTERNA = '#F9B310';   // como as outras áreas veem
const PRHE_SEM_DADOS = '#DADFE7';

const PRHE_ROTULO_CURTO = Object.freeze({
  'Clareza da comunicação': 'Clareza',
  'Cordialidade': 'Cordialidade',
  'Velocidade de resposta': 'Velocidade',
  'Cumprimento de prazos (SLA)': 'Prazos',
  'Qualidade das soluções entregues': 'Qualidade',
  'Parceria estratégica': 'Parceria',
  'Grau de esforço / simplicidade': 'Esforço'
});

function PRHE_gerarApresentacaoEmpresa() {
  const inicio = new Date();
  Logger.log('PRHE_: início da apresentação geral da empresa.');

  try {
    const deckId = PRHE_deckId_();
    if (typeof dadosDaEmpresa_ !== 'function') {
      // Distinguir os dois casos importa: "painel.gs não está aqui" e "painel.gs
      // está aqui, mas é a versão antiga" pedem coisas diferentes de quem lê.
      if (typeof obterDadosPainel === 'function') {
        throw new Error('painel.gs está desatualizado: falta a função dadosDaEmpresa_(). ' +
          'Atualize painel.gs — obterDadosPainel() passou a só checar a senha e delegar o ' +
          'cálculo para dadosDaEmpresa_(), que é o que esta apresentação usa.');
      }
      throw new Error('Dependência ausente: painel.gs precisa estar no mesmo projeto.');
    }
    if (typeof PRH_texto_ !== 'function') {
      throw new Error('Dependência ausente: apresentacao.gs precisa estar no mesmo projeto.');
    }

    const dados = dadosDaEmpresa_();
    if (dados.vazio) throw new Error('A aba Respostas está vazia; nenhum deck foi alterado.');

    const modelo = PRHE_montarModelo_(dados);
    const roteiro = PRHE_definirRoteiro_(modelo);
    Logger.log('PRHE_: ATENÇÃO — o conteúdo atual do deck ' + deckId + ' será substituído.');

    const deck = SlidesApp.openById(deckId);
    if (!deck || String(deck.getId()) !== deckId) {
      throw new Error('Validação de segurança falhou: o deck aberto não corresponde ao ID autorizado.');
    }

    PRHE_reconstruirDeck_(deck, modelo, roteiro);
    const segundos = Math.round((new Date().getTime() - inicio.getTime()) / 1000);
    Logger.log('PRHE_: concluído — ' + roteiro.length + ' slides, ' + segundos + 's.');
    Logger.log('PRHE_: ' + deck.getUrl());
    return { ok: true, deckId: deckId, slides: roteiro.length };
  } catch (erro) {
    Logger.log('PRHE_: FALHA — ' + (erro && erro.stack ? erro.stack : erro));
    throw erro;
  }
}

/**
 * Onde mora o ID do deck. Fica no código (PRHE_CONFIG.deckId) ou, se preferir
 * não versionar, na propriedade de script DECK_EMPRESA — Configurações do
 * projeto → Propriedades do script. O código tem precedência.
 */
function PRHE_deckId_() {
  const noCodigo = String(PRHE_CONFIG.deckId || '').trim();
  if (noCodigo) return noCodigo;
  let daPropriedade = '';
  try {
    daPropriedade = String(PropertiesService.getScriptProperties().getProperty('DECK_EMPRESA') || '').trim();
  } catch (erro) {
    daPropriedade = '';
  }
  if (daPropriedade) return daPropriedade;
  throw new Error('Nenhum deck configurado. Crie a apresentação no Google Slides em 16:9 e ' +
    'cole o ID dela em PRHE_CONFIG.deckId, ou na propriedade de script DECK_EMPRESA. ' +
    'O ID é o trecho da URL entre /d/ e /edit.');
}

// ─────────────────────────────────────────── modelo

function PRHE_montarModelo_(d) {
  const comNota = d.areas.filter(function (a) { return a.notaExterna !== null; });
  const comAuto = d.areas.filter(function (a) { return a.diferenca !== null; });

  let maior = null;
  d.areas.forEach(function (a) {
    if (a.diferenca === null) return;
    if (!maior || Math.abs(a.diferenca) > Math.abs(maior.diferenca)) maior = a;
  });

  return {
    geradoEm: d.atualizadoEm,
    participacao: d.participacao,
    totalAvaliacoes: d.totalAvaliacoes,
    notaGeral: d.notaGeral,
    areasComNota: comNota.length,
    areasTotal: d.areas.length,
    areasComAuto: comAuto.length,
    maiorDesalinhamento: maior,
    minimoExterno: d.minimoExterno,
    minimoAuto: d.minimoAuto,
    // Os destaques do painel vêm com <strong> — aqui viram texto puro.
    destaques: (d.destaques || []).slice(0, PRHE_CONFIG.maxDestaques).map(function (x) {
      return { tipo: x.tipo, texto: PRHE_semTags_(x.texto) };
    }),
    // "Nota de cada área": só quem tem nota externa, da maior para a menor.
    ranking: comNota.slice().sort(function (x, y) { return y.notaExterna - x.notaExterna; }),
    areasOcultas: d.areas.length - comNota.length,
    // "Autoavaliação × percepção": só quem tem os dois lados, ordenado pelo gap —
    // quem mais se superestima no topo, quem é mais bem visto do que se vê no fim.
    confronto: comAuto.slice().sort(function (x, y) { return x.diferenca - y.diferenca; }),
    criterios: d.criterios.slice(),  // já vem do maior para o menor
    porPergunta: PRHE_montarPorPergunta_(d)
  };
}

/**
 * Uma entrada por pergunta de nota: as áreas ordenadas da maior para a menor,
 * a média da empresa naquela pergunta e a leitura em uma frase.
 * d.detalhe é {área: [{pergunta, externa, ...}]} — aqui o eixo é invertido.
 */
function PRHE_montarPorPergunta_(d) {
  const mediaPorPergunta = {};
  d.criterios.forEach(function (c) { mediaPorPergunta[c.nome] = c.media; });

  return PERGUNTAS.filter(function (p) { return p.tipo === 'rating'; }).map(function (p) {
    const areas = [];
    Object.keys(d.detalhe).forEach(function (nomeArea) {
      const linha = d.detalhe[nomeArea].filter(function (l) { return l.pergunta === p.nome; })[0];
      if (linha && linha.externa !== null) areas.push({ nome: nomeArea, externa: linha.externa });
    });
    areas.sort(function (x, y) { return y.externa - x.externa; });

    const media = mediaPorPergunta[p.nome] === undefined ? null : mediaPorPergunta[p.nome];
    const abaixo = media === null ? 0 : areas.filter(function (a) { return a.externa < media; }).length;

    return {
      nome: p.nome,
      curto: PRHE_curto_(p.nome),
      secao: p.secao,
      media: media,
      areas: areas,
      melhor: areas.length ? areas[0] : null,
      pior: areas.length ? areas[areas.length - 1] : null,
      abaixoDaMedia: abaixo
    };
  });
}

function PRHE_semTags_(html) {
  return String(html || '')
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ').trim();
}

function PRHE_corDaNota_(n) {
  if (n === null || n === undefined) return PRHE_SEM_DADOS;
  for (let i = 0; i < PRHE_FAIXAS.length; i++) if (n < PRHE_FAIXAS[i].ate) return PRHE_FAIXAS[i].cor;
  return PRHE_FAIXAS[PRHE_FAIXAS.length - 1].cor;
}

function PRHE_curto_(nome) {
  return PRHE_ROTULO_CURTO[nome] || String(nome).split(/[\s/]+/)[0];
}

function PRHE_definirRoteiro_(m) {
  const roteiro = [
    { id: 'capa', titulo: 'Pesquisa de satisfação interdepartamental' },
    { id: 'visao', titulo: 'Visão geral' },
    { id: 'ranking', titulo: 'Nota de cada área' },
    { id: 'confronto', titulo: 'Autoavaliação × percepção das outras áreas' },
    { id: 'criterios', titulo: 'Pontos fortes e fracos da empresa' }
  ];
  // Um slide por pergunta de nota, na ordem em que aparecem no formulário.
  m.porPergunta.forEach(function (p, i) {
    roteiro.push({ id: 'pergunta:' + i, titulo: p.nome });
  });
  return roteiro;
}

// ─────────────────────────────────────────── montagem do deck

function PRHE_reconstruirDeck_(deck, modelo, roteiro) {
  const W = deck.getPageWidth(), H = deck.getPageHeight();
  if (!W || !H || Math.abs(W / H - PRHE_CONFIG.expectedRatio) > 0.015) {
    throw new Error('O deck alvo não está em 16:9 (dimensões atuais: ' + W + ' × ' + H + ' pt).');
  }
  const esperado = PRHE_CONFIG.slidesFixos + PERGUNTAS.filter(function (p) { return p.tipo === 'rating'; }).length;
  if (roteiro.length !== esperado) {
    throw new Error('Roteiro inválido: esperado ' + esperado + ' slides, montados ' + roteiro.length + '.');
  }

  const anteriores = deck.getSlides().slice();
  const novos = [];
  try {
    roteiro.forEach(function (item, indice) {
      const slide = deck.appendSlide(SlidesApp.PredefinedLayout.BLANK);
      novos.push(slide);
      PRHE_desenharSlide_(slide, deck, item.id, modelo);
      Logger.log('PRHE_: slide ' + (indice + 1) + '/' + roteiro.length + ' — ' + item.titulo + '.');
    });
  } catch (erro) {
    Logger.log('PRHE_: desenho interrompido; removendo só os novos slides e preservando a versão anterior.');
    novos.forEach(function (slide) {
      try { slide.remove(); } catch (falha) { Logger.log('PRHE_: falha no rollback de um slide: ' + falha); }
    });
    try { deck.saveAndClose(); } catch (falha) { Logger.log('PRHE_: falha ao salvar rollback: ' + falha); }
    throw erro;
  }

  anteriores.forEach(function (slide) { slide.remove(); });
  if (deck.getSlides().length !== roteiro.length) throw new Error('Contagem final de slides divergente.');
  deck.saveAndClose();
}

function PRHE_desenharSlide_(slide, deck, id, m) {
  const W = deck.getPageWidth(), H = deck.getPageHeight();
  if (id === 'capa') return PRHE_slideCapa_(slide, W, H, m);

  const cabecalhos = {
    visao: ['VISÃO GERAL', 'Leitura automática dos dados · atualizado em ' + m.geradoEm],
    ranking: ['NOTA DE CADA ÁREA', 'Como cada área é avaliada pelas outras, em escala de 0 a 5'],
    confronto: ['AUTOAVALIAÇÃO × PERCEPÇÃO DAS OUTRAS ÁREAS', 'Ordenado pelo gap, do mais negativo para o mais positivo'],
    criterios: ['PONTOS FORTES E FRACOS DA EMPRESA', 'Média de todas as áreas juntas em cada critério, do melhor para o pior']
  };
  PRH_fundoClaro_(slide);

  if (id.indexOf('pergunta:') === 0) {
    const p = m.porPergunta[Number(id.split(':')[1])];
    PRH_header_(slide, W, String(p.nome).toUpperCase(), p.secao + ' · como cada área é avaliada pelas outras');
    PRHE_slidePergunta_(slide, W, H, m, p);
    return;
  }

  PRH_header_(slide, W, cabecalhos[id][0], cabecalhos[id][1]);

  if (id === 'visao') PRHE_slideVisao_(slide, W, H, m);
  else if (id === 'ranking') PRHE_slideRanking_(slide, W, H, m);
  else if (id === 'confronto') PRHE_slideConfronto_(slide, W, H, m);
  else if (id === 'criterios') PRHE_slideCriterios_(slide, W, H, m);
  else throw new Error('Tipo de slide desconhecido: ' + id);
}

function PRHE_slideCapa_(slide, W, H, m) {
  slide.getBackground().setSolidFill(PRH_DS.colors.brandDark);
  PRH_shape_(slide, SlidesApp.ShapeType.RECTANGLE, 0, 0, 7, H, PRH_DS.colors.brandLight, null);
  PRH_shape_(slide, SlidesApp.ShapeType.ELLIPSE, W - 270, -80, 430, 430, PRH_DS.colors.brandLight, null, 0.16).sendToBack();
  PRH_logo_(slide, PRH_CONFIG.logoNegativeId, 42, 28, 130, 36, true);
  PRH_texto_(slide, 44, 116, 560, 20, 'PESQUISA DE SATISFAÇÃO INTERDEPARTAMENTAL', { fs: 9, min: 8, bold: true, color: PRH_DS.colors.premium, family: PRH_DS.fonts.title, oneLine: true });
  PRH_shape_(slide, SlidesApp.ShapeType.RECTANGLE, 44, 145, 68, 4, PRH_DS.colors.premium, null);
  PRH_texto_(slide, 40, 164, 620, 90, 'RESULTADO\nDA EMPRESA', { fs: 40, min: 32, bold: true, color: '#FFFFFF', family: PRH_DS.fonts.title, spacing: 100 });

  const p = m.participacao;
  const resumo = p && p.total
    ? PRH_inteiro_(p.respondentes) + ' de ' + PRH_inteiro_(p.total) + ' colaboradores · ' +
      PRH_inteiro_(m.areasTotal) + ' áreas · nota média ' + PRH_numOuND_(m.notaGeral)
    : PRH_inteiro_(m.areasTotal) + ' áreas · nota média ' + PRH_numOuND_(m.notaGeral);
  PRH_texto_(slide, 44, 268, 520, 24, resumo, { fs: 13, min: 10, color: '#CBD5E1', family: PRH_DS.fonts.body, oneLine: true });
  PRH_texto_(slide, 44, H - 38, W - 88, 14, 'CAPITAL REALTY · USO INTERNO', { fs: 7, min: 7, bold: true, color: '#CBD5E1', family: PRH_DS.fonts.title, oneLine: true });
}

function PRHE_slideVisao_(slide, W, H, m) {
  // Faixa de destaques, no mesmo tom do painel: verde/âmbar/vermelho/azul.
  const cores = { bom: '#24A85B', atencao: '#F9B310', alerta: '#E63351', info: PRH_DS.colors.brandLight };
  const x = 30, w = W - 60, alturaD = 40, gapD = 7;
  m.destaques.forEach(function (d, i) {
    const dy = 76 + i * (alturaD + gapD);
    const cor = cores[d.tipo] || PRH_DS.colors.brandLight;
    PRH_card_(slide, x, dy, w, alturaD, cor);
    PRH_shape_(slide, SlidesApp.ShapeType.ELLIPSE, x + 18, dy + 15, 10, 10, cor, null);
    PRH_texto_(slide, x + 38, dy + 4, w - 54, alturaD - 8, d.texto, { fs: 9.6, min: 7.5, color: PRH_DS.colors.text, family: PRH_DS.fonts.body, spacing: 116, middle: true });
  });

  const p = m.participacao || {};
  const faltam = m.areasTotal - m.areasComNota;
  const cards = [
    { l: 'PARTICIPAÇÃO', v: PRH_inteiro_(p.respondentes || 0) + '/' + PRH_inteiro_(p.total || 0),
      n: (p.percentual === null || p.percentual === undefined ? '—' : p.percentual + '%') +
         (p.faltam ? ' — faltam ' + PRH_inteiro_(p.faltam) : ' — meta atingida'),
      c: p.percentual >= 80 ? '#24A85B' : p.percentual >= 50 ? '#F9B310' : '#E63351' },
    { l: 'AVALIAÇÕES RECEBIDAS', v: PRH_inteiro_(m.totalAvaliacoes), n: 'somando todas as áreas', c: PRH_DS.colors.brandLight },
    { l: 'NOTA MÉDIA DA EMPRESA', v: PRH_numOuND_(m.notaGeral), n: 'entre áreas, de 0 a 5', c: PRH_DS.colors.brandMed },
    { l: 'ÁREAS COM DADOS', v: PRH_inteiro_(m.areasComNota) + '/' + PRH_inteiro_(m.areasTotal),
      n: PRH_inteiro_(m.areasComAuto) + ' com comparação auto', c: PRH_DS.colors.premium },
    { l: 'MAIOR DESALINHAMENTO',
      v: m.maiorDesalinhamento ? PRH_numSinal_(m.maiorDesalinhamento.diferenca) : '—',
      n: m.maiorDesalinhamento
        ? PRH_limitarTexto_(m.maiorDesalinhamento.nome, 24) + ' · ' + PRH_inteiro_(m.maiorDesalinhamento.nAuto) + ' autoav.'
        : 'ainda sem comparação possível',
      c: m.maiorDesalinhamento ? PRH_DS.colors.orange : PRH_DS.colors.muted }
  ];
  const gap = 12, cw = (W - 60 - gap * 4) / 5, cy = 76 + m.destaques.length * (alturaD + gapD) + 8;
  cards.forEach(function (d, i) { PRH_kpi_(slide, x + i * (cw + gap), cy, cw, 100, d); });
}

function PRHE_slideRanking_(slide, W, H, m) {
  PRHE_legendaEscala_(slide, 30, 64, W - 60);
  const rodape = 'Escala fixa de 0 a 5.' +
    (m.areasOcultas > 0
      ? ' ' + PRH_inteiro_(m.areasOcultas) + ' área(s) com menos de ' + PRH_inteiro_(m.minimoExterno) +
        ' avaliações ficam ocultas para preservar o anonimato.'
      : ' Todas as áreas alcançaram o mínimo de ' + PRH_inteiro_(m.minimoExterno) + ' avaliações.');

  PRHE_grafico_(slide, W, H, m.ranking.map(function (a) {
    return { rotulo: a.nome, series: [{ valor: a.notaExterna, cor: PRHE_corDaNota_(a.notaExterna) }] };
  }), rodape);
}

function PRHE_slideConfronto_(slide, W, H, m) {
  PRHE_legendaSeries_(slide, W - 300, 64, [
    { rotulo: 'Autoavaliação', cor: PRHE_COR_AUTO },
    { rotulo: 'Como as outras veem', cor: PRHE_COR_EXTERNA }
  ]);
  const rodape = 'Gap = como as outras veem − autoavaliação: negativo, a área se vê melhor do que é vista. ' +
    'A autoavaliação vem do próprio time, que costuma ser pequeno — um gap apoiado em poucas pessoas é indício, não conclusão.';

  PRHE_grafico_(slide, W, H, m.confronto.map(function (a) {
    return {
      rotulo: a.nome,
      series: [{ valor: a.notaAuto, cor: PRHE_COR_AUTO }, { valor: a.notaExterna, cor: PRHE_COR_EXTERNA }],
      extras: [PRHE_celulaGap_(a.diferenca)]
    };
  }), rodape, { titulosColunas: ['AUTO', 'EXTERNA', 'GAP'] });
}

/**
 * A célula de GAP de uma área. Cor com o mesmo sentido do painel e da planilha:
 * vermelho quando a área se superestima (gap negativo), verde quando as outras
 * a veem melhor, cinza dentro da faixa de alinhamento.
 */
function PRHE_celulaGap_(gap) {
  if (gap === null || gap === undefined) return { texto: '—', cor: PRH_DS.colors.muted };
  const cor = gap <= -LIMITE_DESALINHAMENTO ? '#E63351'
            : gap >= LIMITE_DESALINHAMENTO ? '#24A85B'
            : PRH_DS.colors.muted;
  return { texto: PRH_numSinal_(gap), cor: cor };
}

function PRHE_slideCriterios_(slide, W, H, m) {
  PRHE_legendaEscala_(slide, 30, 70, W - 60);
  PRHE_grafico_(slide, W, H, m.criterios.map(function (c) {
    return { rotulo: PRHE_curto_(c.nome), series: [{ valor: c.media, cor: PRHE_corDaNota_(c.media) }] };
  }), 'Média de todas as notas que as áreas deram umas às outras, critério a critério. Não inclui autoavaliações.');
}

function PRHE_slidePergunta_(slide, W, H, m, p) {
  // Leitura em uma frase, como o painel mostra acima do gráfico.
  const frase = p.media === null
    ? 'Ainda não há áreas suficientes com nota liberada nesta pergunta.'
    : 'A média da empresa é ' + PRH_num_(p.media) + '.' +
      (p.melhor ? ' Melhor: ' + p.melhor.nome + ' (' + PRH_num_(p.melhor.externa) + ').' : '') +
      (p.pior && p.pior !== p.melhor ? ' Pior: ' + p.pior.nome + ' (' + PRH_num_(p.pior.externa) + ').' : '') +
      ' ' + PRH_inteiro_(p.abaixoDaMedia) + ' de ' + PRH_inteiro_(p.areas.length) + ' áreas estão abaixo da média.';

  PRH_card_(slide, 30, 70, W - 60, 34, PRH_DS.colors.brandLight);
  PRH_texto_(slide, 46, 72, W - 92, 30, frase, { fs: 9.2, min: 7, color: PRH_DS.colors.text, family: PRH_DS.fonts.body, oneLine: true, middle: true });

  PRHE_grafico_(slide, W, H, p.areas.map(function (a) {
    return { rotulo: a.nome, series: [{ valor: a.externa, cor: PRHE_corDaNota_(a.externa) }] };
  }), 'Escala fixa de 0 a 5. A linha vertical marca a média da empresa nesta pergunta.',
    { topo: 126, referencia: p.media === null ? null : { valor: p.media, rotulo: 'média ' + PRH_num_(p.media) } });
}

// ─────────────────────────────────────────── desenho

/**
 * Acima deste número de itens, colunas verticais não cabem legíveis num slide:
 * "Administrativo/Secretárias" em 50pt de largura vira um borrão. O painel
 * resolve com rolagem horizontal; um slide não rola, então vira barra deitada,
 * onde o nome tem 140pt inteiros para ele.
 */
const PRHE_MAX_COLUNAS = 8;

/**
 * Escolhe entre coluna e barra deitada pelo número de itens. Colunas numéricas
 * extras (o GAP do confronto) só existem na barra deitada, onde há uma linha por
 * item para pendurá-las — pedir extras força esse formato, mesmo com poucos itens.
 */
function PRHE_grafico_(slide, W, H, itens, rodape, opts) {
  const comExtras = itens.length > 0 && (itens[0].extras || []).length > 0;
  if (itens.length > PRHE_MAX_COLUNAS || comExtras) PRHE_barras_(slide, W, H, itens, rodape, opts);
  else PRHE_colunas_(slide, W, H, itens, rodape, opts);
}

/**
 * Barras deitadas: um item por linha, escala fixa de 0 a 5.
 * A altura da linha se ajusta à quantidade de itens, com teto para 7 itens não
 * virarem tarjas gordas.
 */
function PRHE_barras_(slide, W, H, itens, rodape, opts) {
  const o = opts || {};
  const topo = o.topo || 100, fim = 350;
  const rotuloW = 140, x0 = 30, barraX = x0 + rotuloW + 6;
  const nSeries = itens[0].series.length;
  // Cada coluna numérica extra rouba largura da barra, então entra na conta
  // antes de a escala ser dimensionada — senão a barra vaza por cima do número.
  const nExtras = (itens[0].extras || []).length;
  const valorW = 40, extraW = 52;
  const barraW = W - barraX - 30 - valorW * nSeries - extraW * nExtras - 6;
  const colunaX = function (k) {
    return k < nSeries
      ? barraX + barraW + 4 + k * valorW
      : barraX + barraW + 4 + nSeries * valorW + (k - nSeries) * extraW;
  };
  const linhaH = Math.min(26, (fim - topo) / itens.length);
  const alturaBarra = nSeries === 1 ? Math.min(13, linhaH - 6) : Math.min(7, (linhaH - 8) / 2);

  // Marcas de escala e verticais de grade, atrás de tudo.
  for (let v = 0; v <= 5; v++) {
    const gx = barraX + barraW * v / 5;
    PRH_linha_(slide, gx, topo - 2, gx, topo + linhaH * itens.length, v === 0 ? PRH_DS.colors.lines : PRH_DS.colors.grid, v === 0 ? 1 : 0.6);
    PRH_texto_(slide, gx - 14, topo - 16, 28, 12, String(v), { fs: 6.5, min: 6, color: PRH_DS.colors.muted, family: PRH_DS.fonts.body, oneLine: true, align: 'center' });
  }
  if (o.referencia && o.referencia.valor !== null && o.referencia.valor !== undefined) {
    const rx = barraX + barraW * Number(o.referencia.valor) / 5;
    PRH_linha_(slide, rx, topo - 2, rx, topo + linhaH * itens.length, PRH_DS.colors.text, 1.2);
    PRH_texto_(slide, rx - 44, topo - 16, 88, 12, o.referencia.rotulo, { fs: 6.5, min: 5.6, bold: true, color: PRH_DS.colors.text, family: PRH_DS.fonts.title, oneLine: true, align: 'center' });
  }

  // Com três números seguidos, a cor da legenda deixa de bastar para dizer qual
  // é qual: as colunas ganham título quando o slide pede.
  //
  // O rótulo é alinhado à direita como os números, mas não cabe na largura da
  // coluna — "EXTERNA" pede ~26pt e sobram 22 depois da margem interna que o
  // Slides reserva. A caixa cresce para a esquerda, sobre o vão, com a borda
  // direita no lugar; e min = fs impede o autoajuste de encolher um rótulo só,
  // que era o que deixava EXTERNA menor que AUTO e GAP, e ainda quebrado em duas.
  if (o.titulosColunas) {
    const folgaTitulo = 24;
    o.titulosColunas.forEach(function (t, k) {
      PRH_texto_(slide, colunaX(k) - folgaTitulo, topo - 16, (k < nSeries ? valorW : extraW) - 4 + folgaTitulo, 12, t,
        { fs: 6.2, min: 6.2, bold: true, color: PRH_DS.colors.muted, family: PRH_DS.fonts.title, oneLine: true, align: 'right' });
    });
  }

  itens.forEach(function (item, i) {
    const ry = topo + i * linhaH;
    if (i % 2 === 0) PRH_shape_(slide, SlidesApp.ShapeType.RECTANGLE, x0, ry, W - 60, linhaH - 1, '#FFFFFF', null).sendToBack();
    PRH_texto_(slide, x0 + 6, ry, rotuloW - 10, linhaH, item.rotulo, { fs: 7.6, min: 5.8, bold: true, color: PRH_DS.colors.text, family: PRH_DS.fonts.body, oneLine: true, middle: true });

    item.series.forEach(function (s, k) {
      const by = nSeries === 1
        ? ry + (linhaH - alturaBarra) / 2
        : ry + (linhaH - alturaBarra * 2 - 2) / 2 + k * (alturaBarra + 2);
      if (s.valor !== null && s.valor !== undefined) {
        const largura = Math.max(1, barraW * Number(s.valor) / 5);
        PRH_shape_(slide, SlidesApp.ShapeType.RECTANGLE, barraX, by, largura, alturaBarra, s.cor, null);
      }
      PRH_texto_(slide, colunaX(k), ry, valorW - 4, linhaH,
        s.valor === null || s.valor === undefined ? '—' : PRH_num_(s.valor),
        { fs: 8.4, min: 6.5, bold: true, color: s.cor, family: PRH_DS.fonts.title, oneLine: true, middle: true, align: 'right' });
    });

    (item.extras || []).forEach(function (e, k) {
      PRH_texto_(slide, colunaX(nSeries + k), ry, extraW - 4, linhaH, e.texto,
        { fs: 8.4, min: 6.5, bold: true, color: e.cor, family: PRH_DS.fonts.title, oneLine: true, middle: true, align: 'right' });
    });
  });

  PRH_texto_(slide, 38, H - 48, W - 76, 14, rodape, { fs: 7.5, min: 6, color: PRH_DS.colors.muted, family: PRH_DS.fonts.body, oneLine: true });
}

/**
 * Colunas verticais genéricas: um grupo por item, uma ou duas séries por grupo.
 * Escala fixa de 0 a 5 — a mesma do painel, para as alturas serem comparáveis
 * entre slides. Escala automática faria uma diferença de 0,3 parecer enorme.
 */
function PRHE_colunas_(slide, W, H, itens, rodape, opts) {
  if (!itens.length) {
    PRH_card_(slide, 30, 100, W - 60, 170, PRH_DS.colors.muted);
    PRH_texto_(slide, 54, 130, W - 108, 110, 'Nenhuma área alcançou o mínimo necessário para aparecer aqui.', { fs: 16, min: 12, bold: true, color: PRH_DS.colors.text, family: PRH_DS.fonts.title, spacing: 116, middle: true });
    return;
  }

  const o = opts || {};
  const esquerda = 50, base = 296, alturaMax = base - (o.topo || 120);
  const larguraPlot = W - esquerda - 24, grupo = larguraPlot / itens.length;
  const nSeries = itens[0].series.length;
  const vaoBarras = Math.min(grupo - 8, nSeries === 1 ? 40 : 48);
  const larguraBarra = nSeries === 1 ? vaoBarras : (vaoBarras - 4) / 2;
  const folga = (grupo - vaoBarras) / 2;

  for (let v = 0; v <= 5; v++) {
    const gy = base - alturaMax * v / 5;
    PRH_linha_(slide, esquerda - 6, gy, esquerda + larguraPlot, gy, v === 0 ? PRH_DS.colors.lines : PRH_DS.colors.grid, v === 0 ? 1 : 0.6);
    PRH_texto_(slide, 22, gy - 7, 22, 14, String(v), { fs: 7, min: 6, color: PRH_DS.colors.muted, family: PRH_DS.fonts.body, oneLine: true, align: 'right' });
  }

  // A referência entra antes das colunas: assim as barras a cobrem e sobram só
  // os vãos, e ela nunca corta um rótulo. Mesmo motivo do traço de benchmark
  // no deck de área.
  if (o.referencia && o.referencia.valor !== null && o.referencia.valor !== undefined) {
    const ry = base - alturaMax * Number(o.referencia.valor) / 5;
    PRH_linha_(slide, esquerda, ry, esquerda + larguraPlot, ry, PRH_DS.colors.muted, 1.2);
    PRH_texto_(slide, esquerda + larguraPlot - 86, ry - 15, 86, 13, o.referencia.rotulo, { fs: 6.8, min: 6, bold: true, color: PRH_DS.colors.muted, family: PRH_DS.fonts.title, oneLine: true, align: 'right' });
  }

  itens.forEach(function (item, i) {
    const gx = esquerda + i * grupo;
    item.series.forEach(function (s, k) {
      const bx = gx + folga + k * (larguraBarra + 4);
      if (s.valor === null || s.valor === undefined) {
        PRH_texto_(slide, bx - 6, base - 20, larguraBarra + 12, 13, '—', { fs: 8, min: 6, bold: true, color: PRH_DS.colors.muted, family: PRH_DS.fonts.title, oneLine: true, align: 'center' });
        return;
      }
      const altura = Math.max(2, alturaMax * Number(s.valor) / 5);
      PRH_shape_(slide, SlidesApp.ShapeType.RECTANGLE, bx, base - altura, larguraBarra, altura, s.cor, null);
      // Rótulo dentro do topo quando a coluna comporta; caso raro de nota baixa,
      // ele sobe para fora e assume a cor da própria coluna.
      const cabeDentro = altura >= 20;
      PRH_texto_(slide, bx - 7, cabeDentro ? base - altura + 3 : base - altura - 14, larguraBarra + 14, 13,
        PRH_num_(s.valor), { fs: 7.2, min: 5.6, bold: true, color: cabeDentro ? '#FFFFFF' : s.cor, family: PRH_DS.fonts.title, oneLine: true, align: 'center' });
    });
    PRH_texto_(slide, gx + 1, base + 7, grupo - 2, 40, item.rotulo, { fs: 6.6, min: 5.2, bold: true, color: PRH_DS.colors.text, family: PRH_DS.fonts.body, align: 'center', spacing: 108 });
  });

  PRH_texto_(slide, 38, H - 48, W - 76, 14, rodape, { fs: 7.5, min: 6, color: PRH_DS.colors.muted, family: PRH_DS.fonts.body, oneLine: true });
}

/** Legenda das cinco faixas de nota, igual à do painel. */
function PRHE_legendaEscala_(slide, x, y, largura) {
  const passo = Math.min(132, largura / PRHE_FAIXAS.length);
  PRHE_FAIXAS.forEach(function (f, i) {
    const fx = x + i * passo;
    PRH_shape_(slide, SlidesApp.ShapeType.RECTANGLE, fx, y + 4, 9, 9, f.cor, null);
    PRH_texto_(slide, fx + 13, y, passo - 16, 15, f.rotulo, { fs: 6.6, min: 5.6, color: PRH_DS.colors.body, family: PRH_DS.fonts.body, oneLine: true });
  });
}

/** Legenda de séries nomeadas (autoavaliação × percepção externa). */
function PRHE_legendaSeries_(slide, x, y, series) {
  let fx = x;
  series.forEach(function (s) {
    PRH_shape_(slide, SlidesApp.ShapeType.RECTANGLE, fx, y + 4, 10, 9, s.cor, null);
    PRH_texto_(slide, fx + 14, y, 128, 15, s.rotulo, { fs: 7.2, min: 6, color: PRH_DS.colors.body, family: PRH_DS.fonts.body, oneLine: true });
    fx += 146;
  });
}

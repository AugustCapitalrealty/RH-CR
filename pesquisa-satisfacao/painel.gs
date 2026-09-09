/**
 * ══════════════════════════════════════════════════════════════════════════
 * PAINEL DO RH — dashboard de resultados
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Acesso: a MESMA URL do formulário + "?page=painel"
 *   https://script.google.com/macros/s/SEU_ID/exec?page=painel
 *
 * ─────────────────────────────────────────────────────────────────────────
 * 🔒 SEGURANÇA — LEIA ANTES DE USAR
 *
 * O formulário é publicado como "Qualquer pessoa" (sem login), então o Google
 * NÃO informa quem está acessando — não dá para liberar por e-mail. Por isso o
 * painel é protegido por SENHA, validada no servidor.
 *
 * A senha NÃO fica no código: ela é guardada nas Propriedades do Script. Assim
 * não vai parar no repositório nem em cópias do arquivo.
 *
 * PARA CONFIGURAR (uma vez):
 *   1. Abra a função configurarSenhaDoPainel() aqui embaixo
 *   2. Escreva a senha na linha indicada
 *   3. Execute a função (menu Executar)
 *   4. APAGUE a senha da linha e salve de novo
 *
 * Sem senha configurada, o painel fica inacessível — o que é o comportamento
 * seguro por padrão.
 *
 * ⚠️ Limite conhecido: quem tiver o link E a senha entra. Não há registro de
 * quem acessou. Para controle por pessoa seria necessário exigir login, o que
 * quebraria o anonimato do formulário nesta mesma URL.
 * ─────────────────────────────────────────────────────────────────────────
 */

const CHAVE_SENHA_PAINEL = 'SENHA_PAINEL';

/**
 * EXECUTE UMA VEZ para definir a senha do painel.
 * Escreva a senha abaixo, execute, e depois apague a senha da linha.
 */
function configurarSenhaDoPainel() {
  const NOVA_SENHA = '';   // ←── escreva a senha aqui, execute, e apague depois

  if (!NOVA_SENHA) {
    Logger.log('Escreva a senha na variável NOVA_SENHA e execute de novo.');
    return;
  }
  PropertiesService.getScriptProperties().setProperty(CHAVE_SENHA_PAINEL, NOVA_SENHA);
  Logger.log('✅ Senha do painel definida. Agora APAGUE a senha da linha e salve o arquivo.');
}

/** EXECUTE para conferir se a senha já foi configurada (não mostra a senha). */
function verificarSenhaDoPainel() {
  const definida = !!PropertiesService.getScriptProperties().getProperty(CHAVE_SENHA_PAINEL);
  Logger.log(definida
    ? '🟢 Senha configurada. O painel está acessível em ?page=painel'
    : '⚪ Senha NÃO configurada. Rode configurarSenhaDoPainel() — sem isso o painel fica bloqueado.');
}

/** Confere a senha enviada pelo painel. Toda função de dados passa por aqui. */
function senhaConfere_(senha) {
  const correta = PropertiesService.getScriptProperties().getProperty(CHAVE_SENHA_PAINEL);
  if (!correta) return false;
  return String(senha || '') === String(correta);
}


// ═══════════════════════ ROTEAMENTO ═══════════════════════

/** Chamada pelo doGet do main.gs quando a URL tem ?page=painel */
function servirPainel_() {
  return HtmlService.createHtmlOutput(getPainelHTML())
    .setTitle('Painel do RH — Pesquisa de Satisfação')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}


// ═══════════════════════ DADOS (protegidos por senha) ═══════════════════════

/**
 * Chamada pelo painel via google.script.run.
 * A senha é conferida AQUI, no servidor — a página é pública, então validar
 * apenas no navegador não protegeria nada.
 */
function obterDadosPainel(senha) {
  if (!senhaConfere_(senha)) {
    return { negado: true };
  }
  return dadosDaEmpresa_();
}

/**
 * Todos os números da empresa, sem checagem de senha.
 *
 * Separado de obterDadosPainel() para a apresentação da empresa poder usar
 * exatamente a mesma conta que o painel. Se as duas recalculassem por conta
 * própria, um dia divergiriam — e ninguém saberia qual está certa.
 * É interna (sufixo _): não é exposta ao cliente, só ao código do projeto.
 */
function dadosDaEmpresa_() {
  const registros = lerRespostas_();
  if (!registros || registros.length === 0) {
    return { vazio: true, minimoExterno: MINIMO_EXTERNO, minimoAuto: MINIMO_AUTOAVALIACAO };
  }

  const resultado = agregarRespostas_(registros);

  // ── Áreas ──
  const areas = Object.keys(resultado.areas).sort(compararTexto_).map(function (nome) {
    const a = resultado.areas[nome];
    const temExterno = a.externo.avaliadores >= MINIMO_EXTERNO && a.externo.media !== null;
    const temAuto = a.auto.avaliadores >= MINIMO_AUTOAVALIACAO && a.auto.media !== null;
    // Gap = externa − auto. Positivo: as outras veem a área melhor do que ela
    // mesma se vê. Negativo: a área se superestima — o caso que pede atenção.
    const dif = (temExterno && temAuto) ? arredondar_(a.externo.media - a.auto.media) : null;
    return {
      nome: nome,
      nExterno: a.externo.avaliadores,
      nAuto: a.auto.avaliadores,
      notaExterna: temExterno ? arredondar_(a.externo.media) : null,
      notaAuto: temAuto ? arredondar_(a.auto.media) : null,
      diferenca: dif,
      leitura: lerDiferenca_(temExterno, temAuto, dif === null ? '' : dif)
    };
  });

  // ── Critérios consolidados da empresa ──
  const criterios = [];
  PERGUNTAS.filter(function (p) { return p.tipo === 'rating'; }).forEach(function (p) {
    const d = resultado.perguntas[p.nome];
    if (!d || d.externo.media === null) return;
    criterios.push({ nome: p.nome, secao: p.secao, media: arredondar_(d.externo.media), n: d.externo.qtd });
  });
  criterios.sort(function (x, y) { return y.media - x.media; });

  // ── Detalhe: área × critério ──
  const detalhe = {};
  Object.keys(resultado.areas).forEach(function (nomeArea) {
    const a = resultado.areas[nomeArea];
    const liberadoExterno = a.externo.avaliadores >= MINIMO_EXTERNO;
    const liberadoAuto = a.auto.avaliadores >= MINIMO_AUTOAVALIACAO;

    detalhe[nomeArea] = PERGUNTAS.filter(function (p) { return p.tipo === 'rating'; }).map(function (p) {
      const d = a.perguntas[p.nome];
      const ext = (d && d.externo) || { media: null, qtd: 0 };
      const aut = (d && d.auto) || { media: null };
      const temE = liberadoExterno && ext.media !== null;
      const temA = liberadoAuto && aut.media !== null;
      return {
        pergunta: p.nome,
        secao: p.secao,
        externa: temE ? arredondar_(ext.media) : null,
        auto: temA ? arredondar_(aut.media) : null,
        diferenca: (temE && temA) ? arredondar_(ext.media - aut.media) : null,
        // Nº de notas externas nesta pergunta. Pode ser menor que o total de
        // avaliadores da área: quem respondeu "na" não entra na média.
        n: ext.qtd || 0
      };
    });
  });

  // ── Comentários (embaralhados, sem ID) ──
  const comentarios = [];
  registros.forEach(function (r) {
    if (r.tipo !== 'texto') return;
    const texto = String(r.resposta || '').trim();
    if (!texto) return;
    const a = resultado.areas[r.area];
    const liberado = a && (r.ehAuto
      ? a.auto.avaliadores >= MINIMO_AUTOAVALIACAO
      : a.externo.avaliadores >= MINIMO_EXTERNO);
    if (!liberado) return;
    comentarios.push({
      area: r.area,
      origem: r.ehAuto ? 'Autoavaliação' : 'Outra área',
      pergunta: r.pergunta,
      texto: texto
    });
  });
  embaralhar_(comentarios);

  // ── Totais ──
  // Participação: todo envio traz exatamente UM bloco de autoavaliação (a própria
  // área do respondente é sempre a primeira do formulário). Então o nº de blocos
  // de autoavaliação = nº de pessoas que enviaram a pesquisa.
  let totalAvaliacoes = 0, respondentes = 0, somaGeral = 0, qtdGeral = 0;
  Object.keys(resultado.areas).forEach(function (nome) {
    const a = resultado.areas[nome];
    totalAvaliacoes += a.externo.avaliadores + a.auto.avaliadores;
    respondentes += a.auto.avaliadores;
    somaGeral += a.externo.soma; qtdGeral += a.externo.qtd;
  });

  const notaGeral = qtdGeral > 0 ? arredondar_(somaGeral / qtdGeral) : null;
  const participacao = {
    respondentes: respondentes,
    total: TOTAL_COLABORADORES,
    percentual: TOTAL_COLABORADORES > 0
      ? Math.round((respondentes / TOTAL_COLABORADORES) * 100) : null,
    faltam: Math.max(0, TOTAL_COLABORADORES - respondentes),
    porArea: areas.map(function (a) { return { nome: a.nome, respondentes: a.nAuto }; })
                  .sort(function (x, y) { return y.respondentes - x.respondentes; })
  };

  return {
    vazio: false,
    atualizadoEm: Utilities.formatDate(new Date(), 'America/Sao_Paulo', "dd/MM/yyyy 'às' HH:mm"),
    totalAvaliacoes: totalAvaliacoes,
    participacao: participacao,
    notaGeral: notaGeral,
    areas: areas,
    criterios: criterios,
    detalhe: detalhe,
    comentarios: comentarios,
    destaques: montarDestaques_(areas, criterios, notaGeral, participacao),
    automacao: estadoDaAutomacao_(),
    minimoExterno: MINIMO_EXTERNO,
    minimoAuto: MINIMO_AUTOAVALIACAO,
    perguntasDesconhecidas: resultado.perguntasDesconhecidas
  };
}

/**
 * Leituras automáticas dos dados — o que o RH veria se lesse o painel inteiro.
 * São observações factuais (contagens e comparações), não interpretações.
 */
function montarDestaques_(areas, criterios, notaGeral, participacao) {
  const destaques = [];
  const comNota = areas.filter(function (a) { return a.notaExterna !== null; });

  // Participação vem primeiro: sem gente respondendo, nenhum outro número vale.
  if (participacao && participacao.total > 0) {
    const p = participacao;
    destaques.push({
      tipo: p.percentual >= 80 ? 'bom' : p.percentual >= 50 ? 'atencao' : 'alerta',
      texto: p.faltam === 0
        ? '<strong>' + p.respondentes + ' de ' + p.total + ' colaboradores</strong> responderam — a meta foi atingida.'
        : '<strong>' + p.respondentes + ' de ' + p.total + ' colaboradores</strong> responderam (' +
          p.percentual + '%). Faltam <strong>' + p.faltam + '</strong>.'
    });
  }

  const fracas = comNota.filter(function (a) { return a.notaExterna < 3; })
                        .sort(function (x, y) { return x.notaExterna - y.notaExterna; });
  if (fracas.length > 0) {
    destaques.push({
      tipo: 'alerta',
      texto: fracas.length === 1
        ? '<strong>' + fracas[0].nome + '</strong> está abaixo de 3,00 (' + formatarNum_(fracas[0].notaExterna) + ').'
        : '<strong>' + fracas.length + ' áreas</strong> estão abaixo de 3,00: ' +
          fracas.slice(0, 3).map(function (a) { return a.nome + ' (' + formatarNum_(a.notaExterna) + ')'; }).join(', ') +
          (fracas.length > 3 ? ' e mais ' + (fracas.length - 3) + '.' : '.')
    });
  }

  // Com o gap em externa − auto, quem se superestima aparece com gap negativo:
  // a lista é a das mais negativas, e o texto usa o módulo.
  const superestimadas = areas.filter(function (a) { return a.diferenca !== null && a.diferenca <= -0.5; })
                             .sort(function (x, y) { return x.diferenca - y.diferenca; });
  if (superestimadas.length > 0) {
    const a = superestimadas[0];
    const distancia = Math.abs(a.diferenca);
    destaques.push({
      tipo: 'atencao',
      texto: '<strong>' + a.nome + '</strong> se avalia ' + formatarNum_(distancia) +
             (distancia >= 2 ? ' pontos' : ' ponto') + ' acima do que as outras áreas a avaliam' +
             (superestimadas.length === 2 ? ' — e mais 1 área tem o mesmo padrão.'
              : superestimadas.length > 2 ? ' — e mais ' + (superestimadas.length - 1) + ' áreas têm o mesmo padrão.' : '.')
    });
  }

  if (criterios.length > 1) {
    const melhor = criterios[0], pior = criterios[criterios.length - 1];
    destaques.push({
      tipo: 'info',
      texto: 'Como empresa, o ponto mais forte é <strong>' + melhor.nome + '</strong> (' + formatarNum_(melhor.media) +
             ') e o mais fraco é <strong>' + pior.nome + '</strong> (' + formatarNum_(pior.media) + ').'
    });
  }

  const semDados = areas.length - comNota.length;
  if (semDados > 0) {
    destaques.push({
      tipo: 'info',
      texto: semDados === 1
        ? '<strong>1 área</strong> ainda não atingiu ' + MINIMO_EXTERNO +
          ' avaliações e fica oculta para preservar o anonimato.'
        : '<strong>' + semDados + ' áreas</strong> ainda não atingiram ' + MINIMO_EXTERNO +
          ' avaliações e ficam ocultas para preservar o anonimato.'
    });
  }

  return destaques;
}

function formatarNum_(v) {
  return (v === null || v === undefined) ? '—' : v.toFixed(2).replace('.', ',');
}

/** Diz se a atualização automática das abas está ligada (mostrado no painel) */
function estadoDaAutomacao_() {
  try {
    const ligada = ScriptApp.getProjectTriggers().some(function (t) {
      return t.getHandlerFunction() === 'gerarIndicadores';
    });
    return { ligada: ligada };
  } catch (erro) {
    return { ligada: null };
  }
}

/** Botão "Atualizar abas da planilha" — também protegido */
function regerarAbasDaPlanilha(senha) {
  if (!senhaConfere_(senha)) return { negado: true };
  gerarIndicadores();
  return { ok: true };
}

/**
 * Monta o CSV dos comentários filtrados e devolve o conteúdo ao navegador.
 * O download é feito no cliente, evitando exigir permissão de acesso ao Drive.
 */
function exportarComentarios(senha, filtros) {
  if (!senhaConfere_(senha)) return { negado: true };

  const dados = obterDadosPainel(senha);
  if (dados.vazio) return { erro: 'Não há comentários para exportar.' };

  // Aceita string (versões antigas do painel) ou o objeto com os três filtros da tela.
  const f = (typeof filtros === 'string') ? { area: filtros } : (filtros || {});
  const lista = dados.comentarios.filter(function (c) {
    if (f.area && c.area !== f.area) return false;
    if (f.pergunta && c.pergunta !== f.pergunta) return false;
    if (f.origem && c.origem !== f.origem) return false;
    return true;
  });
  if (lista.length === 0) return { erro: 'Nenhum comentário com esse filtro.' };

  function celula(v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; }
  const linhas = [['Área Avaliada', 'Origem', 'Pergunta', 'Comentário'].map(celula).join(';')];
  lista.forEach(function (c) {
    linhas.push([c.area, c.origem, c.pergunta, c.texto].map(celula).join(';'));
  });

  // Sem BOM aqui: quem adiciona é baixarCsv_, ao montar o Blob no navegador.
  const conteudo = linhas.join('\r\n');
  const pedaco = function (v) { return v ? '-' + String(v).replace(/[^\wÀ-ÿ]+/g, '_').slice(0, 30) : ''; };
  const nome = 'Comentarios' + pedaco(f.area) + pedaco(f.origem) + pedaco(f.pergunta) + '-' +
               Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'yyyy-MM-dd_HHmm') + '.csv';

  return { ok: true, conteudo: conteudo, nome: nome, total: lista.length };
}


// ═══════════════════════ HTML DO PAINEL ═══════════════════════


function getPainelHTML() {
  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Painel do RH</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --navy:#151E49; --bg:#F6F7F9; --card:#FFFFFF;
      --border:#DADFE7; --muted:#EAEDF1; --muted-fg:#657386;
      --hairline:rgba(21,30,73,0.08);
      /* Cores das barras (vivas) */
      --e1:#E63351; --e2:#F47125; --e3:#F9B310; --e4:#73B82E; --e5:#24A85B;
      /* Versões escuras para TEXTO — as vivas não têm contraste suficiente sobre branco */
      --t1:#C42342; --t2:#B44A0C; --t3:#8A6100; --t4:#4A7A18; --t5:#1B7A44;
      --suave:cubic-bezier(0.22,1,0.36,1);
      --sombra-1:0 1px 2px rgba(21,30,73,.04), 0 4px 16px rgba(21,30,73,.05);
      --sombra-2:0 2px 6px rgba(21,30,73,.05), 0 16px 40px rgba(21,30,73,.10);
      --sombra-alta:0 8px 24px rgba(21,30,73,.10), 0 32px 64px rgba(21,30,73,.16);
    }
    * { margin:0; padding:0; box-sizing:border-box; }
    body {
      font-family:'Montserrat',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;
      background:var(--bg); color:var(--navy); min-height:100vh;
      -webkit-font-smoothing:antialiased; -moz-osx-font-smoothing:grayscale;
      font-variant-numeric:tabular-nums;
    }
    a { color:#065CA9; }
    :focus-visible { outline:none; box-shadow:0 0 0 2px #fff, 0 0 0 4px #065CA9; border-radius:8px; }

    /* ── Tela de senha ── */
    .entrada { display:flex; align-items:center; justify-content:center; min-height:100vh; padding:20px; }
    .caixa-entrada {
      background:var(--card); border:1px solid var(--hairline); border-radius:22px;
      box-shadow:var(--sombra-alta); padding:38px; max-width:400px; width:100%; text-align:center;
    }
    .caixa-entrada .cadeado { font-size:44px; margin-bottom:14px; }
    .caixa-entrada h1 { font-size:20px; font-weight:600; letter-spacing:-.02em; margin-bottom:8px; }
    .caixa-entrada p { font-size:13.5px; color:var(--muted-fg); line-height:1.6; margin-bottom:22px; }
    .erro { color:var(--t1); font-size:12.5px; margin-top:12px; min-height:18px; }

    /* ── Topo ── */
    .topo {
      background:rgba(255,255,255,.88);
      -webkit-backdrop-filter:saturate(180%) blur(20px); backdrop-filter:saturate(180%) blur(20px);
      border-bottom:1px solid var(--hairline);
      padding:12px 24px; position:sticky; top:0; z-index:30;
    }
    .topo-inner { max-width:1180px; margin:0 auto; display:flex; align-items:center; gap:14px; flex-wrap:wrap; }
    .topo h1 { font-size:17px; font-weight:700; letter-spacing:-.022em; }
    .sub { font-size:11.5px; color:var(--muted-fg); }
    .divisor { width:1px; height:26px; background:var(--border); }
    .topo-dir { margin-left:auto; display:flex; align-items:center; gap:8px; flex-wrap:wrap; }

    /* ── Índice ── */
    .indice {
      background:rgba(255,255,255,.94);
      -webkit-backdrop-filter:blur(14px); backdrop-filter:blur(14px);
      border-bottom:1px solid var(--hairline);
      position:sticky; top:57px; z-index:25; padding:0 24px;
    }
    .indice-inner { max-width:1180px; margin:0 auto; display:flex; gap:2px; overflow-x:auto; }
    .indice a {
      font-size:12.5px; font-weight:600; color:var(--muted-fg); text-decoration:none;
      padding:12px 14px; white-space:nowrap; border-bottom:2px solid transparent;
      transition:color .2s ease, border-color .2s ease;
    }
    .indice a:hover { color:var(--navy); }
    .indice a.ativo { color:var(--navy); border-bottom-color:var(--navy); }

    .pagina { max-width:1180px; margin:0 auto; padding:24px 20px 80px; }

    .bloco {
      background:var(--card); border:1px solid var(--hairline); border-radius:20px;
      box-shadow:var(--sombra-1); padding:26px; margin-bottom:20px;
      scroll-margin-top:110px;
    }
    /* Hierarquia: página > seção > card */
    .bloco > h2 { font-size:19px; font-weight:700; letter-spacing:-.022em; margin-bottom:5px; display:flex; align-items:center; gap:9px; }
    .bloco-sub { font-size:12.5px; color:var(--muted-fg); margin-bottom:20px; line-height:1.55; max-width:75ch; }

    /* ── Destaques automáticos ── */
    .destaques { display:flex; flex-direction:column; gap:9px; margin-bottom:20px; }
    .destaque { display:flex; gap:11px; align-items:flex-start; padding:14px 17px; border-radius:15px; font-size:13.5px; line-height:1.55; }
    .destaque .ic { font-size:16px; line-height:1.3; flex-shrink:0; }
    .d-alerta  { background:rgba(230,51,81,.07);  border:1px solid rgba(230,51,81,.20); }
    .d-atencao { background:rgba(249,179,16,.09); border:1px solid rgba(249,179,16,.28); }
    .d-info    { background:rgba(21,30,73,.035);  border:1px solid var(--hairline); }
    .d-bom     { background:rgba(22,140,74,.07);  border:1px solid rgba(22,140,74,.22); }

    /* ── KPIs ── */
    .kpis { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:14px; margin-bottom:20px; }
    .kpi { background:var(--card); border:1px solid var(--hairline); border-radius:18px; padding:20px; box-shadow:var(--sombra-1); }
    /* Altura fixa: sem isto, rótulo de 2 linhas empurra o número para baixo e a
       régua de cinco KPIs — o elemento mais consultado da tela — sai torta. */
    .kpi-topo { display:flex; align-items:flex-start; gap:7px; margin-bottom:8px; min-height:32px; }
    /* Barra do cartão de participação: 0–100%, não 0–5 — por isso sem as marcas. */
    .kpi .trilho-fino { height:7px; margin:9px 0 7px; }
    .kpi .trilho-fino::before { display:none; }
    /* Barra de contagem de pessoas: não é escala 0–5, então sem as marcas. */
    .trilho-liso::before { display:none; }
    /* Marca da média da empresa dentro do trilho (equivalente à linha tracejada das colunas) */
    /* Amplitude do critério entre as áreas, desenhada por cima da barra da média.
       Precisa de contraste próprio: o fundo pode ser barra colorida ou trilho cinza. */
    .faixa-areas {
      position:absolute; top:50%; height:2px; transform:translateY(-50%);
      background:var(--navy); opacity:.75; pointer-events:none;
    }
    .faixa-areas .ponta {
      position:absolute; top:-4px; width:2px; height:10px; background:var(--navy); border-radius:1px;
    }
    .faixa-areas .ponta:first-child { left:-1px; }
    .faixa-areas .ponta:last-child { right:-1px; }
    .linha-barra .trilho { position:relative; }
    .marca-ref {
      position:absolute; top:-3px; bottom:-3px; width:2px; transform:translateX(-1px);
      background:var(--navy); opacity:.62; border-radius:2px; pointer-events:none;
    }
    .kpi .ic { font-size:14px; line-height:1.35; }
    .kpi .rotulo { font-size:10.5px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; color:var(--muted-fg); }
    .kpi .valor { font-size:31px; font-weight:700; letter-spacing:-.03em; line-height:1.1; }
    .kpi .nota { font-size:11.5px; color:var(--muted-fg); margin-top:6px; line-height:1.45; }
    .ajuda {
      display:inline-flex; align-items:center; justify-content:center;
      width:15px; height:15px; border-radius:50%; background:var(--muted); color:var(--muted-fg);
      font-size:9.5px; font-weight:700; cursor:help; flex-shrink:0;
      margin-left:auto; margin-top:1px;
    }

    /* ── Legenda de cores ── */
    .legenda { display:flex; gap:16px; flex-wrap:wrap; align-items:center; margin-bottom:18px;
               padding:11px 15px; background:var(--bg); border-radius:13px; font-size:11.5px; color:var(--muted-fg); }
    .legenda-item { display:flex; align-items:center; gap:6px; }
    .bolinha { width:11px; height:11px; border-radius:3px; }

    /* ── Barras com escala 0–5 visível ── */
    .grafico { position:relative; }
    .linha-barra { display:grid; grid-template-columns:minmax(150px,230px) 1fr auto; gap:14px; align-items:center; padding:10px 0; }
    .linha-barra + .linha-barra { border-top:1px solid var(--hairline); }
    .rotulo-area { font-size:13.5px; font-weight:600; display:flex; flex-direction:column; gap:2px; }
    .rotulo-area .secao { font-weight:500; color:var(--muted-fg); font-size:11px; }
    .trilho { background:var(--muted); border-radius:999px; height:10px; position:relative; overflow:hidden; }
    /* marcas de 1 a 4 — deixam a escala 0–5 evidente */
    .trilho::before {
      content:''; position:absolute; inset:0; pointer-events:none; z-index:2;
      background:repeating-linear-gradient(to right, transparent, transparent calc(20% - 1px), rgba(255,255,255,.45) calc(20% - 1px), rgba(255,255,255,.45) 20%);
      mix-blend-mode:overlay;
    }
    .preenche { height:100%; border-radius:999px; width:0; transition:width .9s var(--suave); position:relative; }
    .valor-barra { font-size:13.5px; font-weight:700; min-width:46px; text-align:right; }
    .escala-eixo { display:grid; grid-template-columns:minmax(150px,230px) 1fr auto; gap:14px; margin-top:6px; }
    .escala-marcas { display:flex; justify-content:space-between; font-size:10px; color:var(--muted-fg); font-weight:600; }
    .sem-dado { font-size:11.5px; color:var(--muted-fg); font-style:italic; }

    /* ── Comparação ── */
    .comp { padding:15px 0; }
    .comp + .comp { border-top:1px solid var(--hairline); }
    .comp-topo { display:flex; align-items:center; justify-content:space-between; margin-bottom:11px; gap:12px; flex-wrap:wrap; }
    .comp-nome { font-size:14px; font-weight:600; }
    .par { display:grid; grid-template-columns:150px 1fr auto; gap:12px; align-items:center; margin-bottom:9px; }
    .par .leg { font-size:11.5px; color:var(--muted-fg); font-weight:600; display:flex; align-items:flex-start; gap:5px; }
    .par .leg-ic { line-height:1.3; flex-shrink:0; }
    .par .leg-txt { display:block; line-height:1.35; }
    .selo { font-size:11px; font-weight:700; padding:5px 11px; border-radius:999px; }
    .selo-alerta { background:rgba(230,51,81,.10); color:var(--t1); }
    .selo-ok { background:rgba(33,196,93,.14); color:var(--t5); }
    .selo-neutro { background:var(--muted); color:var(--muted-fg); }

    table { width:100%; border-collapse:collapse; font-size:13px; }
    caption { text-align:left; font-size:12.5px; color:var(--muted-fg); padding-bottom:12px; }
    th { text-align:left; font-size:10.5px; font-weight:700; letter-spacing:.05em; text-transform:uppercase;
         color:var(--muted-fg); padding:0 10px 10px; border-bottom:1px solid var(--hairline); }
    td { padding:11px 10px; border-bottom:1px solid var(--hairline); }
    tr:last-child td { border-bottom:none; }
    .num { text-align:right; font-weight:600; }

    label.rotulo-campo { display:block; font-size:11px; font-weight:700; letter-spacing:.04em;
                         text-transform:uppercase; color:var(--muted-fg); margin-bottom:6px; }
    select, input {
      font-family:inherit; font-size:13.5px; padding:11px 14px;
      border:1px solid var(--border); border-radius:12px; background:#fff; color:var(--navy);
      transition:border-color .2s ease, box-shadow .25s var(--suave);
    }
    select:focus, input:focus { outline:none; border-color:var(--navy); box-shadow:0 0 0 3px rgba(21,30,73,.08); }
    .campos { display:flex; gap:12px; margin-bottom:18px; flex-wrap:wrap; align-items:flex-end; }

    .btn {
      font-family:inherit; font-size:13.5px; font-weight:600; letter-spacing:-.01em;
      padding:11px 18px; border:none; border-radius:12px; cursor:pointer;
      background:var(--navy); color:#fff;
      transition:transform .25s var(--suave), background .2s ease, box-shadow .25s var(--suave);
    }
    .btn:hover:not(:disabled) { background:#0e1533; box-shadow:var(--sombra-2); }
    .btn:active:not(:disabled) { transform:scale(.98); transition-duration:.09s; }
    .btn:disabled { opacity:.5; cursor:not-allowed; }
    .btn-claro { background:#fff; color:var(--navy); border:1px solid var(--border); box-shadow:var(--sombra-1); }
    .btn-claro:hover:not(:disabled) { background:var(--muted); box-shadow:var(--sombra-2); }
    .btn-largo { width:100%; }
    .btn-pequeno { font-size:12.5px; padding:9px 15px; }

    /* ── Gráfico de aranha ── */
    .radar-caixa { display:flex; flex-direction:column; align-items:center; gap:6px; margin:6px 0 22px; }
    .radar { width:100%; max-width:520px; height:auto; display:block; overflow:visible; }
    .opcoes-radar { display:flex; flex-wrap:wrap; align-items:center; gap:10px 22px; margin:14px 0 4px; }
    .opcoes-formato { margin:2px 0 14px; }
    .leg-n { display:block; font-size:10.5px; color:#8A94A6; font-weight:500; margin-top:1px; white-space:nowrap; }
    .selo-unico { background:rgba(230,51,81,.08); color:#A8243C; border:1px solid rgba(230,51,81,.22); }
    .comp-selos { display:flex; gap:7px; align-items:center; flex-wrap:wrap; justify-content:flex-end; }
    .gcart { width:100%; max-width:760px; height:auto; display:block; }
    /* Charts largos (muitas categorias, ex. 13 áreas): rolam na horizontal em vez de espremer. */
    .gcart-scroll { width:100%; overflow-x:auto; -webkit-overflow-scrolling:touch; padding-bottom:4px; position:relative; }
    /* Sem pista visual, o corte na borda direita lê como elemento quebrado. */
    .gcart-scroll.tem-mais { -webkit-mask-image:linear-gradient(to right,#000 calc(100% - 34px),transparent);
                             mask-image:linear-gradient(to right,#000 calc(100% - 34px),transparent); }
    .dica-rolagem { font-size:11.5px; color:#55627A; margin-bottom:6px; align-self:flex-start; }
    .gcart-scroll .gcart { max-width:none; }
    .seg { display:inline-flex; background:var(--muted); border-radius:11px; padding:3px; gap:2px; }
    .seg-btn {
      border:0; background:transparent; border-radius:9px; padding:7px 13px; cursor:pointer;
      font-family:inherit; font-size:12.5px; font-weight:600; color:#55627A;
      transition:background .18s ease, color .18s ease, box-shadow .18s ease;
    }
    .seg-btn:hover { color:var(--navy); }
    .seg-btn.ativo { background:var(--card); color:var(--navy); box-shadow:var(--sombra-1); }
    .marcador {
      display:inline-flex; align-items:center; gap:8px; font-size:13px; color:#3C4763;
      cursor:pointer; user-select:none;
    }
    .marcador input { width:15px; height:15px; accent-color:var(--navy); cursor:pointer; margin:0; }

    /* ── Termos mais citados ── */
    .termos { display:flex; flex-wrap:wrap; gap:8px; }
    .termo {
      font-family:inherit; border:1px solid var(--border); background:#fff; color:var(--navy);
      border-radius:999px; padding:7px 14px; cursor:pointer; transition:all .2s var(--suave);
    }
    .termo:hover { filter:brightness(1.14); transform:translateY(-1px); }
    .termo { transition:filter .18s ease, transform .18s ease; }
    .termo .qtd { color:var(--muted-fg); font-weight:600; font-size:11px; margin-left:5px; }

    /* ── Comentários ── */
    .comentario { border:1px solid var(--hairline); border-radius:16px; padding:15px 17px; margin-bottom:11px; }
    .comentario-topo { display:flex; align-items:center; gap:8px; margin-bottom:7px; flex-wrap:wrap; }
    .tag { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.04em; padding:3px 9px; border-radius:999px; }
    .tag-area { background:rgba(21,30,73,.08); color:var(--navy); }
    .tag-auto { background:rgba(21,30,73,.06); color:#3C4763; }
    .tag-ext { background:rgba(21,30,73,.11); color:var(--navy); }
    .comentario .pergunta { font-size:11.5px; color:var(--muted-fg); margin-bottom:5px; }
    .comentario .texto { font-size:13.5px; line-height:1.6; }
    .comentario mark { background:rgba(249,179,16,.35); color:inherit; padding:1px 2px; border-radius:3px; }

    .aviso { background:rgba(249,179,16,.10); border:1px solid rgba(249,179,16,.3); border-radius:14px;
             padding:14px 16px; font-size:12.5px; line-height:1.6; margin-bottom:20px; }
    .vazio { text-align:center; padding:60px 20px; color:var(--muted-fg); }
    .vazio .emoji { font-size:52px; margin-bottom:14px; }
    .carregando { text-align:center; padding:80px 20px; color:var(--muted-fg); font-size:14px; }
    .oculto { display:none; }
    .visualmente-oculto { position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap; }

    /* ── Responsivo ── */
    @media (max-width:900px) {
      .linha-barra, .escala-eixo { grid-template-columns:1fr auto; }
      .linha-barra .trilho { grid-column:1 / -1; grid-row:2; }
      .escala-eixo .escala-marcas { grid-column:1 / -1; }
      .par { grid-template-columns:132px 1fr auto; }
      .bloco { padding:20px; border-radius:18px; }
      .kpi .valor { font-size:27px; }
    }
    @media (max-width:600px) {
      /* No celular o topo rola junto (senão come 1/3 da tela); quem fica fixo é o índice. */
      .topo { padding:10px 14px; position:static; }
      .topo h1 { font-size:16px; }
      .divisor { display:none; }
      .topo-dir {
        width:100%; margin-left:0; flex-wrap:nowrap;
        overflow-x:auto; -webkit-overflow-scrolling:touch; padding-bottom:2px;
      }
      .topo-dir .btn { flex:0 0 auto; white-space:nowrap; padding:8px 12px; font-size:12.5px; }
      .indice { top:0; padding:0 14px; }
      .pagina { padding:16px 14px 60px; }
      .bloco { padding:17px; }
      .bloco > h2 { font-size:17px; }
      .par { grid-template-columns:1fr; gap:4px; }
      .par .leg { margin-top:6px; }
      .campos > * { width:100%; }
      table { font-size:12px; }
      td, th { padding:9px 6px; }
    }

    .cabecalho-impressao { display:none; }

    /* ── Impressão / PDF ── */
    @media print {
      body { background:#fff; }
      .topo, .indice, .campos, .opcoes-radar, .opcoes-formato, .btn, .termos, .ajuda, .nao-imprime { display:none !important; }
      /* O título vive no .topo, que é escondido — sem isto o PDF sai sem identificação. */
      .cabecalho-impressao {
        display:flex !important; justify-content:space-between; align-items:baseline;
        border-bottom:1.5px solid var(--navy); padding-bottom:8px; margin-bottom:18px;
      }
      .cabecalho-impressao strong { font-size:15px; color:var(--navy); }
      .cabecalho-impressao span { font-size:11px; color:var(--muted-fg); }
      body { print-color-adjust:exact; -webkit-print-color-adjust:exact; }
      .bloco { break-inside:avoid; page-break-inside:avoid; box-shadow:none; border:1px solid #ccc; margin-bottom:14px; }
      .preenche { transition:none !important; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
      .comentario { break-inside:avoid; }
      .pagina { padding:0; max-width:none; }
    }
  </style>
</head>
<body>

  <!-- ══ SENHA ══ -->
  <main id="telaEntrada" class="entrada">
    <div class="caixa-entrada">
      <div class="cadeado" aria-hidden="true">🔒</div>
      <h1>Painel do RH</h1>
      <p>Esta área mostra os resultados da pesquisa. Informe a senha para continuar.</p>
      <label class="visualmente-oculto" for="campoSenha">Senha do painel</label>
      <input type="password" id="campoSenha" placeholder="Senha" style="width:100%;text-align:center" autocomplete="current-password">
      <div class="erro" id="erroSenha" role="alert"></div>
      <button class="btn btn-largo" id="btnEntrar" style="margin-top:6px" onclick="entrar()">Entrar</button>
    </div>
  </main>

  <!-- ══ PAINEL ══ -->
  <div id="telaPainel" class="oculto">
    <header class="topo">
      <div class="topo-inner">
        <div>
          <h1>Painel do RH</h1>
          <div class="sub">Pesquisa de Satisfação Interdepartamental</div>
        </div>
        <div class="divisor" aria-hidden="true"></div>
        <div class="sub" id="atualizadoEm"></div>
        <div class="topo-dir">
          <button class="btn btn-claro btn-pequeno" onclick="window.print()"
                  title="Abre a janela de impressão do navegador — escolha 'Salvar como PDF' para gerar um arquivo.">🖨️ Imprimir / PDF</button>
          <button class="btn btn-claro btn-pequeno" id="btnPlanilha" onclick="atualizarPlanilha()"
                  title="Regrava as abas PAINEL, POR_PERGUNTA, RESUMO_PERGUNTAS e COMENTARIOS na planilha do Google. Use quando for exportar ou abrir no Looker Studio.">Regravar abas da planilha</button>
          <button class="btn btn-pequeno" onclick="carregar()"
                  title="Busca as respostas mais recentes da planilha e redesenha o painel.">↻ Buscar dados novos</button>
        </div>
      </div>
    </header>

    <nav class="indice" id="indice" aria-label="Seções do painel">
      <div class="indice-inner">
        <a href="#s-visao">Visão geral</a>
        <a href="#s-participacao">Participação</a>
        <a href="#s-areas">Notas por área</a>
        <a href="#s-auto">Autoavaliação</a>
        <a href="#s-criterios">Pontos fortes e fracos</a>
        <a href="#s-pergunta">Pergunta por área</a>
        <a href="#s-detalhe">Detalhe por área</a>
        <a href="#s-comentarios">Comentários</a>
      </div>
    </nav>

    <main class="pagina">
      <div class="cabecalho-impressao" aria-hidden="true">
        <strong>Painel do RH — Pesquisa de Satisfação Interdepartamental</strong>
        <span>Capital Realty · <span id="dataImpressao"></span></span>
      </div>
      <div id="carregando" class="carregando">Carregando os dados da planilha…</div>
      <div id="conteudo" class="oculto"></div>
    </main>
  </div>

  <script>
    const CORES = ['#E63351','#F47125','#F9B310','#73B82E','#24A85B'];
    const CORES_TEXTO = ['#C42342','#B44A0C','#8A6100','#4A7A18','#1B7A44'];
    const FAIXAS = [
      { ate: 2.2, rotulo: 'Crítico (abaixo de 2,2)' },
      { ate: 2.9, rotulo: 'Ruim (2,2 a 2,9)' },
      { ate: 3.6, rotulo: 'Regular (2,9 a 3,6)' },
      { ate: 4.3, rotulo: 'Bom (3,6 a 4,3)' },
      { ate: 99,  rotulo: 'Ótimo (acima de 4,3)' }
    ];
    // Palavras sem valor analítico — removidas da contagem de termos
    const VAZIAS = ('a o e de da do das dos que para com em no na nos nas um uma uns umas por se ao aos as os ' +
      'não sim mais menos muito muita pouco pouca ser está estao estão sao são tem têm ter foi era como mas ' +
      'quando onde qual quais isso isto esse essa este esta aquele aquela nosso nossa seu sua meu minha ' +
      'area areas área áreas setor setores equipe time pessoal galera sempre nunca ainda já também apenas ' +
      'pode podem poderia deve devem precisa precisam fazer faz feito bem melhor pior nada tudo todos todas ' +
      'sobre entre até desde após antes durante porque pois então assim outro outra outros outras cada ' +
      'lhe nos vos eles elas ele ela eu tu você vocês nós').split(/\\s+/);

    let senhaAtual = '';
    let dados = null;
    let comentariosVisiveis = 50;
    const POR_PAGINA = 50;

    function faixaDe(n) {
      if (n === null || n === undefined) return -1;
      for (let i = 0; i < FAIXAS.length; i++) if (n < FAIXAS[i].ate) return i;
      return FAIXAS.length - 1;
    }
    function corDaNota(n) { const i = faixaDe(n); return i < 0 ? '#DADFE7' : CORES[i]; }
    function corDoTexto(n) { const i = faixaDe(n); return i < 0 ? '#657386' : CORES_TEXTO[i]; }
    function esc(t) {
      return String(t == null ? '' : t)
        .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
        .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
    }
    function num(v) { return v === null || v === undefined ? '—' : v.toFixed(2).replace('.', ','); }
    function largura(n) { return n === null ? 0 : Math.max(0, Math.min(100, (n / 5) * 100)); }

    // ── Entrada ──
    document.getElementById('campoSenha').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') entrar();
    });

    function entrar() {
      const senha = document.getElementById('campoSenha').value;
      if (!senha) { document.getElementById('erroSenha').textContent = 'Digite a senha.'; return; }
      const btn = document.getElementById('btnEntrar');
      btn.disabled = true; btn.textContent = 'Verificando…';
      document.getElementById('erroSenha').textContent = '';

      google.script.run
        .withSuccessHandler(function (d) {
          btn.disabled = false; btn.textContent = 'Entrar';
          if (d && d.negado) {
            document.getElementById('erroSenha').textContent = 'Senha incorreta.';
            document.getElementById('campoSenha').select();
            return;
          }
          senhaAtual = senha; dados = d;
          document.getElementById('telaEntrada').classList.add('oculto');
          document.getElementById('telaPainel').classList.remove('oculto');
          desenhar();
        })
        .withFailureHandler(function (e) {
          btn.disabled = false; btn.textContent = 'Entrar';
          document.getElementById('erroSenha').textContent = 'Erro: ' + (e && e.message ? e.message : e);
        })
        .obterDadosPainel(senha);
    }

    function carregar() {
      document.getElementById('carregando').classList.remove('oculto');
      document.getElementById('conteudo').classList.add('oculto');
      google.script.run
        .withSuccessHandler(function (d) {
          if (d && d.negado) { location.reload(); return; }
          dados = d; comentariosVisiveis = POR_PAGINA; desenhar();
        })
        .withFailureHandler(function (e) {
          document.getElementById('carregando').innerHTML =
            '<div style="color:#C42342">Erro ao carregar: ' + esc(e && e.message ? e.message : e) + '</div>';
        })
        .obterDadosPainel(senhaAtual);
    }

    // ── Desenho ──
    function desenhar() {
      document.getElementById('carregando').classList.add('oculto');
      const alvo = document.getElementById('conteudo');
      alvo.classList.remove('oculto');

      if (dados.vazio) {
        document.getElementById('atualizadoEm').textContent = 'sem respostas ainda';
        alvo.innerHTML = '<section class="bloco"><div class="vazio"><div class="emoji">📭</div>' +
          '<div style="font-size:16px;font-weight:600;color:#151E49;margin-bottom:6px">Ainda não há respostas</div>' +
          '<div>Os indicadores aparecem aqui assim que a primeira pessoa responder.</div></div></section>';
        return;
      }

      let atualiz = 'atualizado em ' + dados.atualizadoEm;
      if (dados.automacao && dados.automacao.ligada) atualiz += ' · abas atualizam sozinhas todo dia';
      document.getElementById('atualizadoEm').textContent = atualiz;
      const carimbo = document.getElementById('dataImpressao');
      if (carimbo) carimbo.textContent = dados.atualizadoEm;

      alvo.innerHTML = blocoAviso() + blocoVisaoGeral() + blocoParticipacao() + blocoRanking() + blocoComparacao() +
                       blocoCriterios() + blocoPorPergunta() + blocoDetalhe() + blocoComentarios();
      ligarInteracoes();

      requestAnimationFrame(function () {
        document.querySelectorAll('[data-largura]').forEach(function (el) {
          el.style.width = el.dataset.largura + '%';
        });
      });
    }

    function blocoAviso() {
      if (!dados.perguntasDesconhecidas || !dados.perguntasDesconhecidas.length) return '';
      return '<div class="aviso">⚠️ <strong>Respostas de perguntas que não estão mais no formulário</strong> foram ignoradas nos cálculos: ' +
        esc(dados.perguntasDesconhecidas.join(', ')) + '.</div>';
    }

    // ── Visão geral: destaques + KPIs ──
    function blocoVisaoGeral() {
      const destaques = (dados.destaques || []).map(function (d) {
        const ic = d.tipo === 'alerta' ? '🔴' : d.tipo === 'atencao' ? '🟡' : d.tipo === 'bom' ? '🟢' : 'ℹ️';
        return '<div class="destaque d-' + d.tipo + '"><span class="ic" aria-hidden="true">' + ic + '</span><div>' + d.texto + '</div></div>';
      }).join('');

      const liberadas = dados.areas.filter(function (a) { return a.notaExterna !== null; }).length;
      const total = dados.areas.length;
      const faltam = total - liberadas;
      let maior = null;
      dados.areas.forEach(function (a) {
        if (a.diferenca === null) return;
        if (!maior || Math.abs(a.diferenca) > Math.abs(maior.diferenca)) maior = a;
      });

      const comAuto = dados.areas.filter(function (a) { return a.diferenca !== null; }).length;
      const p = dados.participacao;
      const kpis = '<div class="kpis">' +
        kpiParticipacao(p) +
        kpi('👥', 'Avaliações recebidas', dados.totalAvaliacoes, 'somando todas as áreas',
            'Cada avaliação é uma pessoa avaliando uma área. Quem avalia 5 áreas gera 5 avaliações — ' +
            'por isso este número é bem maior que o de pessoas.') +
        kpi('📊', 'Nota média da empresa', num(dados.notaGeral), 'percepção entre áreas, de 0 a 5',
            'Média de todas as notas que as áreas deram umas às outras. Não inclui autoavaliações.') +
        kpi('🔓', 'Áreas com dados', liberadas + '<span style="font-size:19px;color:#657386">/' + total + '</span>',
            (faltam === 0 ? 'todas com nota externa' : faltam + ' ainda ' + (faltam === 1 ? 'aguarda' : 'aguardam') + ' mais respostas') +
            ' · ' + comAuto + ' com comparação auto',
            'São duas coberturas diferentes. Nota externa exige ' + dados.minimoExterno +
            ' avaliações de outras áreas; a comparação com a autoavaliação exige, além disso, ' +
            dados.minimoAuto + ' autoavaliações. Por isso o segundo número costuma ser menor.') +
        kpi('⚖️', 'Maior desalinhamento',
            maior ? (maior.diferenca > 0 ? '+' : '') + num(maior.diferenca) : '—',
            maior ? esc(maior.nome) + ' · ' + maior.nAuto + ' autoav.' : 'ainda sem comparação possível',
            'Maior distância entre como as outras áreas avaliam uma área e como ela se avalia. ' +
            'Negativo = a área se vê melhor do que a veem.') +
        '</div>';

      return '<section class="bloco" id="s-visao"><h2>Visão geral</h2>' +
        '<div class="bloco-sub">Leitura automática dos dados — o que salta aos olhos sem precisar percorrer o painel inteiro.</div>' +
        (destaques ? '<div class="destaques">' + destaques + '</div>' : '') + kpis + '</section>';
    }
    function kpiParticipacao(p) {
      if (!p || !p.total) return '';
      const cor = p.percentual >= 80 ? '#168C4A' : p.percentual >= 50 ? '#F9B310' : '#E63351';
      const largura = Math.min(100, p.percentual);
      const ajuda = 'Quantas pessoas enviaram a pesquisa, de ' + p.total + ' colaboradores. ' +
        'Contado pelos blocos de autoavaliação: cada envio tem exatamente um.';
      return '<div class="kpi"><div class="kpi-topo"><span class="ic" aria-hidden="true">🙋</span>' +
        '<span class="rotulo">Participação</span>' +
        '<span class="ajuda" title="' + esc(ajuda) + '" role="img" aria-label="' + esc(ajuda) + '">?</span></div>' +
        '<div class="valor">' + p.respondentes +
        '<span style="font-size:19px;color:#657386">/' + p.total + '</span></div>' +
        '<div class="trilho trilho-fino" role="img" aria-label="' + p.percentual + '% de participação">' +
        '<div class="preenche" style="background:' + cor + '" data-largura="' + largura + '"></div></div>' +
        '<div class="nota">' + p.percentual + '% — ' +
        (p.faltam === 0 ? 'meta atingida' : 'faltam ' + p.faltam) + '</div></div>';
    }

    function kpi(icone, rotulo, valor, nota, ajuda) {
      return '<div class="kpi"><div class="kpi-topo"><span class="ic" aria-hidden="true">' + icone + '</span>' +
        '<span class="rotulo">' + rotulo + '</span>' +
        '<span class="ajuda" title="' + esc(ajuda) + '" role="img" aria-label="' + esc(ajuda) + '">?</span></div>' +
        '<div class="valor">' + valor + '</div><div class="nota">' + nota + '</div></div>';
    }

    // ── Participação por área ──
    function blocoParticipacao() {
      const p = dados.participacao;
      if (!p || !p.total) return '';

      const escalaNota = 'Barra proporcional à área que mais respondeu — serve para comparar áreas entre si, não é percentual concluído.';

      return '<section class="bloco" id="s-participacao"><h2>Participação</h2>' +
        '<div class="bloco-sub">Quantas pessoas de cada área já enviaram a pesquisa. ' +
        'Total esperado: <strong>' + p.total + ' colaboradores</strong>.</div>' +
        '<div class="bloco-sub" style="margin-bottom:4px">' + escalaNota + '</div>' +
        '<div class="opcoes-formato">' + segFormato_('participacao') + '</div>' +
        '<div id="graficoParticipacao"></div>' +
        '<div class="aviso" style="margin-top:16px">' +
        '<strong>Como este número é contado:</strong> cada envio da pesquisa contém exatamente uma ' +
        'autoavaliação (a própria área do respondente), então contamos essas autoavaliações. ' +
        'Não há identificação de quem respondeu — só quantos, e de qual área. ' +
        'É contagem de <em>envios</em>: como a trava de reenvio é por navegador, quem responder ' +
        'duas vezes conta duas vezes. Se o total passar de ' + p.total + ', é isso.' +
        '</div></section>';
    }
    function desenharParticipacao() {
      const p = dados.participacao;
      if (!p || !p.total) return;
      const alvo = document.getElementById('graficoParticipacao');
      if (!alvo) return;

      if (formato.participacao === 'colunas') {
        const eixos = p.porArea.map(function (a) { return a.nome; });
        const maxArea = p.porArea.reduce(function (m, a) { return Math.max(m, a.respondentes); }, 0);
        const passo = Math.max(1, Math.ceil(maxArea / 5));
        const serie = [{ nome: 'Respondentes', cor: '#151E49', valores: p.porArea.map(function (a) { return a.respondentes; }) }];
        alvo.innerHTML = colunas(eixos, serie, { maxValor: Math.max(passo, maxArea), passo: passo, truncar: false, inteiro: true });
        return;
      }

      const maxArea = p.porArea.reduce(function (m, a) { return Math.max(m, a.respondentes); }, 0);
      alvo.innerHTML = '<div class="grafico">' + p.porArea.map(function (a) {
        const larg = maxArea > 0 ? (a.respondentes / maxArea) * 100 : 0;
        return '<div class="linha-barra"><div class="rotulo-area">' + esc(a.nome) + '</div>' +
          '<div class="trilho trilho-liso" role="img" aria-label="' + a.respondentes + ' pessoas">' +
          '<div class="preenche" style="background:var(--navy)" data-largura="' + larg + '"></div></div>' +
          '<div class="numero" style="color:#151E49">' + a.respondentes + '</div></div>';
      }).join('') + '</div>';
      requestAnimationFrame(function () {
        alvo.querySelectorAll('[data-largura]').forEach(function (el) { el.style.width = el.dataset.largura + '%'; });
      });
    }

    // ── Legenda + eixo ──
    function legenda() {
      return '<div class="legenda"><strong style="color:#151E49">Escala:</strong>' +
        FAIXAS.map(function (f, i) {
          return '<span class="legenda-item"><span class="bolinha" style="background:' + CORES[i] + '"></span>' + f.rotulo + '</span>';
        }).join('') + '</div>';
    }
    function eixo() {
      return '<div class="escala-eixo"><div></div><div class="escala-marcas">' +
        '<span>0</span><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span></div><div style="min-width:46px"></div></div>';
    }
    function barra(nota, cor, rotuloAcessivel) {
      return '<div class="trilho" role="img" aria-label="' + esc(rotuloAcessivel) + '">' +
        '<div class="preenche" style="background:' + cor + '" data-largura="' + largura(nota) + '"></div></div>';
    }

    // ── Ranking de áreas ──
    function blocoRanking() {
      return '<section class="bloco" id="s-areas"><h2>Nota de cada área</h2>' +
        '<div class="bloco-sub">Como cada área é avaliada pelas <strong>outras</strong> áreas, numa escala fixa de 0 a 5. ' +
        'Áreas com menos de ' + dados.minimoExterno + ' avaliações ficam ocultas para preservar o anonimato.</div>' +
        legenda() +
        '<div class="campos"><div><label class="rotulo-campo" for="ordemAreas">Ordenar por</label>' +
        '<select id="ordemAreas"><option value="nota">Maior nota</option><option value="nota-asc">Menor nota</option>' +
        '<option value="respostas">Mais avaliações</option><option value="alfabetica">Ordem alfabética</option></select></div>' +
        segFormato_('ranking') + '</div>' +
        '<div id="graficoAreas"></div></section>';
    }
    function desenharRanking() {
      const ordem = document.getElementById('ordemAreas').value;
      const lista = dados.areas.slice().sort(function (a, b) {
        if (ordem === 'alfabetica') return a.nome.localeCompare(b.nome, 'pt-BR');
        if (ordem === 'respostas') return b.nExterno - a.nExterno;
        if (a.notaExterna === null) return 1;
        if (b.notaExterna === null) return -1;
        return ordem === 'nota-asc' ? a.notaExterna - b.notaExterna : b.notaExterna - a.notaExterna;
      });
      const alvo = document.getElementById('graficoAreas');

      if (formato.ranking === 'colunas') {
        const eixos = lista.map(function (a) { return a.nome; });
        const valores = lista.map(function (a) { return a.notaExterna; });
        const cores = lista.map(function (a) { return a.notaExterna === null ? '#DADFE7' : corDaNota(a.notaExterna); });
        const serie = [{ nome: 'Nota', cor: '#151E49', cores: cores, valores: valores }];
        alvo.innerHTML = colunas(eixos, serie, { truncar: false });
        return;
      }

      alvo.innerHTML = '<div class="grafico">' + lista.map(function (a) {
        if (a.notaExterna === null) {
          return '<div class="linha-barra"><div class="rotulo-area">' + esc(a.nome) + '</div>' +
                 '<div class="sem-dado">aguardando ' + dados.minimoExterno + ' avaliações (tem ' + a.nExterno + ')</div>' +
                 '<div class="valor-barra" style="color:#657386">—</div></div>';
        }
        return '<div class="linha-barra"><div class="rotulo-area">' + esc(a.nome) +
          '<span class="secao">' + a.nExterno + ' avaliações</span></div>' +
          barra(a.notaExterna, corDaNota(a.notaExterna), a.nome + ': nota ' + num(a.notaExterna) + ' de 5') +
          '<div class="valor-barra" style="color:' + corDoTexto(a.notaExterna) + '">' + num(a.notaExterna) + '</div></div>';
      }).join('') + '</div>' + eixo();
      requestAnimationFrame(function () {
        alvo.querySelectorAll('[data-largura]').forEach(function (el) { el.style.width = el.dataset.largura + '%'; });
      });
    }

    // ── Autoavaliação × externo ──
    function blocoComparacao() {
      const lista = dados.areas.filter(function (a) { return a.diferenca !== null; })
        .sort(function (a, b) { return Math.abs(b.diferenca) - Math.abs(a.diferenca); });

      if (!lista.length) {
        return '<section class="bloco" id="s-auto"><h2>Autoavaliação × percepção das outras áreas</h2>' +
          '<div class="bloco-sub">Nenhuma área tem, ao mesmo tempo, ' + dados.minimoExterno + ' avaliações externas e ' +
          dados.minimoAuto + ' autoavaliações. A comparação aparece quando houver respostas suficientes.</div></section>';
      }

      return '<section class="bloco" id="s-auto"><h2>Autoavaliação × percepção das outras áreas</h2>' +
        '<div class="bloco-sub">🪞 é como a área se avalia; 👁️ é como as outras a avaliam. ' +
        'O gap é <strong>como a veem − como se vê</strong>: negativo significa que a área se vê melhor do que é vista.<br>' +
        '<strong>Repare no número de respostas de cada lado.</strong> A autoavaliação vem do próprio time, ' +
        'que costuma ser pequeno — uma diferença apoiada em 3 pessoas é um indício, não uma conclusão.</div>' +
        '<div class="campos">' +
        '<div><label class="rotulo-campo" for="ordemComparacao">Ordenar por</label>' +
        '<select id="ordemComparacao">' +
        '<option value="descompasso">Maior descompasso</option>' +
        '<option value="descompasso-asc">Menor descompasso</option>' +
        '<option value="auto">Autoavaliação: maior</option>' +
        '<option value="auto-asc">Autoavaliação: menor</option>' +
        '<option value="externa">Como a veem: maior</option>' +
        '<option value="externa-asc">Como a veem: menor</option>' +
        '<option value="alfabetica">Ordem alfabética</option>' +
        '</select></div>' +
        '<div><label class="rotulo-campo" for="ladoComparacao">Mostrar</label>' +
        '<select id="ladoComparacao">' +
        '<option value="ambos">Os dois lados</option>' +
        '<option value="auto">Só a autoavaliação</option>' +
        '<option value="externa">Só como a empresa avalia</option>' +
        '</select></div>' +
        segFormato_('comparacao') + '</div>' +
        '<div id="graficoComparacao"></div></section>';
    }
    function desenharComparacao() {
      const alvo = document.getElementById('graficoComparacao');
      if (!alvo) return;
      const ordem = (document.getElementById('ordemComparacao') || {}).value || 'descompasso';
      const lado = (document.getElementById('ladoComparacao') || {}).value || 'ambos';

      const lista = dados.areas.filter(function (a) { return a.diferenca !== null; })
        .sort(function (a, b) {
          switch (ordem) {
            case 'descompasso-asc': return Math.abs(a.diferenca) - Math.abs(b.diferenca);
            case 'auto':            return b.notaAuto - a.notaAuto;
            case 'auto-asc':        return a.notaAuto - b.notaAuto;
            case 'externa':         return b.notaExterna - a.notaExterna;
            case 'externa-asc':     return a.notaExterna - b.notaExterna;
            case 'alfabetica':      return a.nome.localeCompare(b.nome, 'pt-BR');
            default:                return Math.abs(b.diferenca) - Math.abs(a.diferenca);
          }
        });
      if (!lista.length) return;

      if (formato.comparacao === 'colunas') {
        const eixos = lista.map(function (a) { return a.nome; });
        const series = [];
        if (lado !== 'externa') {
          series.push({ nome: 'Como se vê', cor: '#151E49', valores: lista.map(function (a) { return a.notaAuto; }) });
        }
        if (lado !== 'auto') {
          series.push({ nome: 'Como a veem', cor: '#F9B310', valores: lista.map(function (a) { return a.notaExterna; }) });
        }
        alvo.innerHTML = colunas(eixos, series, { truncar: false });
        return;
      }

      // Quantas pessoas sustentam cada lado. Sem isso, "−1,24 — a área se vê melhor"
      // parece igualmente sólido apoiado em 3 ou em 25 respostas.
      alvo.innerHTML = lista.map(function (a) {
        // Vermelho reservado para o descompasso grande: com quase todas as áreas
        // abaixo de −0,3, pintar todas de rosa faz a cor perder função.
        const classe = a.diferenca <= -1 ? 'selo-alerta'
                     : a.diferenca >= 1 ? 'selo-ok' : 'selo-neutro';
        const seta = a.diferenca > 0 ? '↑' : (a.diferenca < 0 ? '↓' : '');
        // Uma pessoa não é uma média. O RH precisa ver isso antes de tratar o
        // número como posição do time.
        const umaPessoa = a.nAuto === 1;
        return '<div class="comp"><div class="comp-topo"><div class="comp-nome">' + esc(a.nome) + '</div>' +
          '<div class="comp-selos">' +
          '<div class="selo ' + classe + '" title="' + esc(a.leitura) + '">' + seta + ' ' +
          (a.diferenca > 0 ? '+' : '') + num(a.diferenca) + '</div>' +
          (umaPessoa ? '<div class="selo selo-unico" title="A autoavaliação desta área tem uma resposta só. ' +
            'O número não é média de time — é a opinião de uma pessoa.">1 resposta</div>' : '') + '</div></div>' +
          (lado === 'externa' ? '' :
            '<div class="par"><div class="leg"><span class="leg-ic" aria-hidden="true">🪞</span>' +
            '<span class="leg-txt">Como se vê<span class="leg-n">' + a.nAuto +
            (a.nAuto === 1 ? ' pessoa' : ' pessoas') + '</span></span></div>' +
            barra(a.notaAuto, '#151E49', a.nome + ', autoavaliação: ' + num(a.notaAuto) + ', ' + a.nAuto + ' pessoas') +
            '<div class="valor-barra">' + num(a.notaAuto) + '</div></div>') +
          (lado === 'auto' ? '' :
            '<div class="par"><div class="leg"><span class="leg-ic" aria-hidden="true">👁️</span>' +
            '<span class="leg-txt">Como a veem<span class="leg-n">' + a.nExterno +
            ' avaliações</span></span></div>' +
            barra(a.notaExterna, corDaNota(a.notaExterna), a.nome + ', percepção externa: ' + num(a.notaExterna) + ', ' + a.nExterno + ' avaliações') +
            '<div class="valor-barra" style="color:' + corDoTexto(a.notaExterna) + '">' + num(a.notaExterna) + '</div></div>') +
          '</div>';
      }).join('') + rodapeForaDaComparacao_(lista);
      requestAnimationFrame(function () {
        alvo.querySelectorAll('[data-largura]').forEach(function (el) { el.style.width = el.dataset.largura + '%'; });
      });
    }

    // Quem não entra na comparação some da tela sem explicação nenhuma — o que,
    // somado ao cartão "áreas com dados", passa a impressão de cobertura total.
    function rodapeForaDaComparacao_(lista) {
      const dentro = {};
      lista.forEach(function (a) { dentro[a.nome] = true; });
      const fora = dados.areas.filter(function (a) { return !dentro[a.nome]; });
      if (!fora.length) return '';
      // Diz o que falta em cada caso, em vez de repetir a regra inteira.
      const porque = function (a) {
        const faltas = [];
        if (a.nExterno < dados.minimoExterno) faltas.push('só ' + a.nExterno + ' de ' + dados.minimoExterno + ' avaliações externas');
        if (a.nAuto < dados.minimoAuto) faltas.push('nenhuma autoavaliação');
        return esc(a.nome) + ' (' + (faltas.join(' e ') || 'sem nota calculável') + ')';
      };
      return '<div class="aviso" style="margin-top:16px"><strong>' + fora.length +
        (fora.length === 1 ? ' área não aparece' : ' áreas não aparecem') + ' nesta comparação</strong> — ' +
        fora.map(porque).join('; ') + '.</div>';
    }

    // ── Critérios ──
    function blocoCriterios() {
      if (!dados.criterios.length) return '';
      return '<section class="bloco" id="s-criterios"><h2>Pontos fortes e fracos da empresa</h2>' +
        '<div class="bloco-sub">Média de <strong>todas as áreas juntas</strong> em cada critério, do melhor para o pior.</div>' +
        legenda() +
        '<div class="opcoes-formato">' + segFormato_('criterios') + '</div>' +
        '<div id="graficoCriterios"></div></section>';
    }
    function desenharCriterios() {
      const alvo = document.getElementById('graficoCriterios');
      if (!alvo || !dados.criterios.length) return;

      if (formato.criterios === 'colunas') {
        const eixos = dados.criterios.map(function (c) { return c.nome; });
        const cores = dados.criterios.map(function (c) { return corDaNota(c.media); });
        const serie = [{ nome: 'Nota', cor: '#151E49', cores: cores, valores: dados.criterios.map(function (c) { return c.media; }) }];
        alvo.innerHTML = colunas(eixos, serie);
        return;
      }

      const linhas = dados.criterios.map(function (c) {
        const f = faixaEntreAreas_(c.nome);
        const detalhe = f
          ? '<span class="secao">' + esc(c.secao) + ' · entre áreas: ' + num(f.min) + '–' + num(f.max) +
            (f.abaixo > 0 ? ' · ' + f.abaixo + ' abaixo de 3' : '') + '</span>'
          : '<span class="secao">' + esc(c.secao) + '</span>';
        // Faixa desenhada no mesmo trilho: mostra que a média esconde dispersão.
        const extensao = f
          ? '<div class="faixa-areas" style="left:' + largura(f.min) + '%;width:' +
            Math.max(0.6, largura(f.max) - largura(f.min)) + '%" aria-hidden="true">' +
            '<i class="ponta"></i><i class="ponta"></i></div>'
          : '';
        return '<div class="linha-barra"><div class="rotulo-area">' + esc(c.nome) + detalhe + '</div>' +
          '<div class="trilho" role="img" aria-label="' + esc(c.nome + ': média ' + num(c.media) +
            (f ? ', variando de ' + num(f.min) + ' a ' + num(f.max) + ' entre as áreas' : '')) + '">' +
          '<div class="preenche" style="background:' + corDaNota(c.media) + '" data-largura="' + largura(c.media) + '"></div>' +
          extensao + '</div>' +
          '<div class="valor-barra" style="color:' + corDoTexto(c.media) + '">' + num(c.media) + '</div></div>';
      }).join('');
      alvo.innerHTML = '<div class="grafico">' + linhas + '</div>' + eixo() +
        '<div class="bloco-sub" style="margin-top:10px">A barra colorida é a média da empresa. O traço escuro ' +
        'sobre ela mostra <strong>da pior à melhor área naquele critério</strong>. Traço largo = problema ' +
        'concentrado em algumas áreas. Traço estreito com nota baixa = problema de toda a empresa.</div>';
      requestAnimationFrame(function () {
        alvo.querySelectorAll('[data-largura]').forEach(function (el) { el.style.width = el.dataset.largura + '%'; });
      });
    }

    // Amplitude de um critério entre as áreas. Sai do detalhe que já está no
    // navegador — nenhuma leitura extra da planilha.
    function faixaEntreAreas_(nomeCriterio) {
      const valores = [];
      Object.keys(dados.detalhe).forEach(function (area) {
        const d = (dados.detalhe[area] || []).filter(function (x) { return x.pergunta === nomeCriterio; })[0];
        if (d && d.externa !== null) valores.push(d.externa);
      });
      if (valores.length < 2) return null;
      return {
        min: Math.min.apply(null, valores),
        max: Math.max.apply(null, valores),
        abaixo: valores.filter(function (v) { return v < 3; }).length,
        n: valores.length
      };
    }

    // ── Uma pergunta, todas as áreas ──
    // Vira a leitura de lado: em vez de "como está esta área nos 7 critérios",
    // responde "quem está bem e quem está mal NESTE critério".
    function blocoPorPergunta() {
      if (!dados.criterios.length) return '';
      const perguntas = (dados.detalhe[Object.keys(dados.detalhe)[0]] || []);
      if (!perguntas.length) return '';

      const opcoes = perguntas.map(function (p, i) {
        return '<option value="' + i + '">' + esc(p.pergunta) + '</option>';
      }).join('');

      return '<section class="bloco" id="s-pergunta"><h2>Pergunta por área</h2>' +
        '<div class="bloco-sub">Escolha um critério e veja <strong>todas as áreas</strong> nele, ' +
        'lado a lado, com a média da empresa marcada no gráfico.</div>' +
        legenda() +
        '<div class="campos">' +
        '<div style="flex:1;min-width:240px"><label class="rotulo-campo" for="perguntaAlvo">Pergunta</label>' +
        '<select id="perguntaAlvo" style="width:100%">' + opcoes + '</select></div>' +
        '<div><label class="rotulo-campo" for="ordemPergunta">Ordenar por</label>' +
        '<select id="ordemPergunta">' +
        '<option value="nota">Maior nota</option>' +
        '<option value="nota-asc">Menor nota</option>' +
        '<option value="respostas">Mais avaliações</option>' +
        '<option value="respostas-asc">Menos avaliações</option>' +
        '<option value="alfabetica">Ordem alfabética</option>' +
        '</select></div>' +
        segFormato_('pergunta') + '</div>' +
        '<div class="opcoes-radar"><label class="marcador">' +
        '<input type="checkbox" id="perguntaAuto"> Mostrar também a autoavaliação de cada área</label></div>' +
        '<div id="resumoPergunta"></div>' +
        '<div id="graficoPergunta"></div></section>';
    }

    function desenharPorPergunta() {
      const seletor = document.getElementById('perguntaAlvo');
      const alvo = document.getElementById('graficoPergunta');
      if (!seletor || !alvo) return;

      const idx = parseInt(seletor.value, 10) || 0;
      const ordem = document.getElementById('ordemPergunta').value;
      const comAuto = document.getElementById('perguntaAuto').checked;

      // Uma linha por área, já com a nota daquela pergunta
      const linhas = dados.areas.map(function (a) {
        const d = (dados.detalhe[a.nome] || [])[idx] || {};
        return {
          nome: a.nome,
          externa: d.externa === undefined ? null : d.externa,
          auto: d.auto === undefined ? null : d.auto,
          n: d.n || 0,
          pergunta: d.pergunta || ''
        };
      });

      linhas.sort(function (x, y) {
        if (ordem === 'alfabetica') return x.nome.localeCompare(y.nome, 'pt-BR');
        if (ordem === 'respostas') return y.n - x.n;
        if (ordem === 'respostas-asc') return x.n - y.n;
        if (x.externa === null) return 1;
        if (y.externa === null) return -1;
        return ordem === 'nota-asc' ? x.externa - y.externa : y.externa - x.externa;
      });

      const nomePergunta = (perguntasDoDetalhe_()[idx] || {}).pergunta || '';
      const mediaEmpresa = mediaDaEmpresaEm_(nomePergunta);
      desenharResumoPergunta_(linhas, mediaEmpresa, nomePergunta);

      if (formato.pergunta === 'colunas') {
        const eixos = linhas.map(function (l) { return l.nome; });
        const series = [{
          nome: 'Como as outras avaliam',
          cor: '#151E49',
          cores: linhas.map(function (l) { return l.externa === null ? '#DADFE7' : corDaNota(l.externa); }),
          valores: linhas.map(function (l) { return l.externa; })
        }];
        if (comAuto) {
          series.push({
            nome: 'Autoavaliação', cor: '#151E49', tracejado: true,
            valores: linhas.map(function (l) { return l.auto; })
          });
        }
        alvo.innerHTML = colunas(eixos, series, { truncar: false, referencia: mediaEmpresa, rotuloReferencia: 'média da empresa' });
        return;
      }

      // Marca da média da empresa dentro de cada trilho — o equivalente da linha
      // tracejada do modo Colunas. Sem isso o subtítulo prometeria algo que não aparece.
      const marca = mediaEmpresa === null ? '' :
        '<div class="marca-ref" style="left:' + largura(mediaEmpresa) + '%" aria-hidden="true"></div>';

      alvo.innerHTML = '<div class="grafico">' + linhas.map(function (l) {
        if (l.externa === null) {
          return '<div class="linha-barra"><div class="rotulo-area">' + esc(l.nome) + '</div>' +
                 '<div class="sem-dado">aguardando ' + dados.minimoExterno + ' avaliações</div>' +
                 '<div class="valor-barra" style="color:#657386">—</div></div>';
        }
        const auto = (comAuto && l.auto !== null)
          ? '<span class="secao">autoavaliação ' + num(l.auto) + '</span>'
          : '<span class="secao">' + l.n + (l.n === 1 ? ' avaliação' : ' avaliações') + '</span>';
        const acima = mediaEmpresa !== null && l.externa >= mediaEmpresa;
        return '<div class="linha-barra"><div class="rotulo-area">' + esc(l.nome) + auto + '</div>' +
          '<div class="trilho" role="img" aria-label="' + esc(l.nome + ': ' + num(l.externa) + ' de 5, ' +
            (acima ? 'acima' : 'abaixo') + ' da média da empresa') + '">' +
          '<div class="preenche" style="background:' + corDaNota(l.externa) + '" data-largura="' + largura(l.externa) + '"></div>' +
          marca + '</div>' +
          '<div class="valor-barra" style="color:' + corDoTexto(l.externa) + '">' + num(l.externa) + '</div></div>';
      }).join('') + '</div>' + eixo() +
      (mediaEmpresa === null ? '' :
        '<div class="bloco-sub" style="margin-top:10px">A marca vertical em cada barra é a ' +
        '<strong>média da empresa neste critério (' + num(mediaEmpresa) + ')</strong>.</div>');
      requestAnimationFrame(function () {
        alvo.querySelectorAll('[data-largura]').forEach(function (el) { el.style.width = el.dataset.largura + '%'; });
      });
    }

    function perguntasDoDetalhe_() {
      return dados.detalhe[Object.keys(dados.detalhe)[0]] || [];
    }
    function mediaDaEmpresaEm_(nomePergunta) {
      const c = dados.criterios.filter(function (x) { return x.nome === nomePergunta; })[0];
      return c ? c.media : null;
    }

    // Leitura em texto do que o gráfico mostra: melhor, pior e quantas áreas
    // ficam abaixo da média da empresa naquele critério.
    function desenharResumoPergunta_(linhas, mediaEmpresa, nomePergunta) {
      const alvo = document.getElementById('resumoPergunta');
      if (!alvo) return;
      const comNota = linhas.filter(function (l) { return l.externa !== null; });
      if (!comNota.length) { alvo.innerHTML = ''; return; }

      const ordenadas = comNota.slice().sort(function (a, b) { return b.externa - a.externa; });
      const melhor = ordenadas[0], pior = ordenadas[ordenadas.length - 1];
      const abaixo = mediaEmpresa === null ? null
        : comNota.filter(function (l) { return l.externa < mediaEmpresa; }).length;

      alvo.innerHTML = '<div class="destaques" style="margin-top:16px">' +
        '<div class="destaque d-info"><span class="ic" aria-hidden="true">ℹ️</span><div>' +
        'Em <strong>' + esc(nomePergunta) + '</strong>, a média da empresa é <strong>' +
        num(mediaEmpresa) + '</strong>. Melhor: <strong>' + esc(melhor.nome) + '</strong> (' + num(melhor.externa) + ')' +
        '. Pior: <strong>' + esc(pior.nome) + '</strong> (' + num(pior.externa) + ')' +
        (abaixo === null ? '' : '. <strong>' + abaixo + '</strong> de ' + comNota.length + ' áreas estão abaixo da média.') +
        '</div></div></div>';
    }

    // ── Detalhe / comparação entre áreas ──
    // ── Gráfico de aranha (radar) ──
    // SVG montado à mão: o Apps Script bloqueia bibliotecas externas (CSP).
    const ROTULO_CURTO = {
      'Clareza da comunicação': 'Clareza',
      'Cordialidade': 'Cordialidade',
      'Velocidade de resposta': 'Velocidade',
      'Cumprimento de prazos (SLA)': 'Prazos',
      'Qualidade das soluções entregues': 'Qualidade',
      'Parceria estratégica': 'Parceria',
      'Grau de esforço / simplicidade': 'Esforço'
    };
    const CORES_SERIE = ['#151E49', '#5B8DEF', '#E8833A'];

    function curto(nome) {
      return ROTULO_CURTO[nome] || String(nome).split(/[\s/]+/)[0];
    }

    /**
     * series: [{ nome, cor, valores:[n|null], tracejado:bool }]
     * eixos:  [nome do critério] — sempre na ordem do formulário
     * Escala fixa 0–5, igual às barras do resto do painel.
     */
    function radar(eixos, series) {
      const n = eixos.length;
      if (n < 3) return '';
      const cx = 260, cy = 215, R = 140, MAX = 5;

      function ponto(i, valor) {
        const ang = (Math.PI * 2 * i) / n - Math.PI / 2;
        const r = (Math.max(0, Math.min(MAX, valor)) / MAX) * R;
        return [cx + r * Math.cos(ang), cy + r * Math.sin(ang)];
      }
      function anelPontos(valor) {
        const p = [];
        for (let i = 0; i < n; i++) { const q = ponto(i, valor); p.push(q[0].toFixed(1) + ',' + q[1].toFixed(1)); }
        return p.join(' ');
      }

      // teia: anéis de 1 a 5
      let teia = '';
      for (let v = 1; v <= MAX; v++) {
        teia += '<polygon points="' + anelPontos(v) + '" fill="none" stroke="rgba(21,30,73,' +
                (v === MAX ? '.28' : '.12') + ')" stroke-width="1"/>';
      }
      // raios + rótulos
      let raios = '', rotulos = '';
      for (let i = 0; i < n; i++) {
        const fim = ponto(i, MAX);
        raios += '<line x1="' + cx + '" y1="' + cy + '" x2="' + fim[0].toFixed(1) + '" y2="' + fim[1].toFixed(1) +
                 '" stroke="rgba(21,30,73,.14)" stroke-width="1"/>';
        const rot = ponto(i, MAX + 0.62);
        const dx = rot[0] - cx;
        const anchor = Math.abs(dx) < 12 ? 'middle' : (dx > 0 ? 'start' : 'end');
        rotulos += '<text x="' + rot[0].toFixed(1) + '" y="' + (rot[1] + 4).toFixed(1) + '" text-anchor="' + anchor +
                   '" font-size="12.5" font-weight="600" fill="#151E49">' + esc(curto(eixos[i])) + '</text>';
      }
      // números da escala — desenhados por cima das séries, com halo branco
      let marcas = '';
      for (let v = 1; v < MAX; v++) {   // o 5 é a própria borda externa
        const q = ponto(0, v);
        marcas += '<text x="' + (cx + 6) + '" y="' + (q[1] + 3.5).toFixed(1) +
                  '" font-size="9.5" fill="#8A94A6" paint-order="stroke" stroke="#fff" stroke-width="3" ' +
                  'stroke-linejoin="round">' + v + '</text>';
      }

      // séries
      let formas = '', pontos = '', rotulosValor = '', legenda = '', descricao = [];
      const desenhaveis = series.filter(function (s) {
        let q = 0;
        for (let i = 0; i < n; i++) if (s.valores[i] !== null && s.valores[i] !== undefined) q++;
        return q >= 3;
      }).length;
      // Com 3+ camadas as manchas se somam e viram borrão: aí vale só o contorno.
      const opacidade = desenhaveis > 2 ? '.05' : '.14';
      // E com muitas camadas, um número em cada vértice de cada uma vira ruído — aí só o hover.
      const mostrarRotulo = desenhaveis <= 2;

      series.forEach(function (s) {
        const validos = [];
        for (let i = 0; i < n; i++) if (s.valores[i] !== null && s.valores[i] !== undefined) validos.push(i);
        if (validos.length < 3) return;   // polígono não fecha — melhor não desenhar

        const pts = validos.map(function (i) {
          const q = ponto(i, s.valores[i]);
          return q[0].toFixed(1) + ',' + q[1].toFixed(1);
        }).join(' ');

        formas += '<polygon points="' + pts + '" fill="' + s.cor + '" fill-opacity="' + (s.tracejado ? '.04' : opacidade) +
                  '" stroke="' + s.cor + '" stroke-width="2.2" stroke-linejoin="round"' +
                  (s.tracejado ? ' stroke-dasharray="5 4"' : '') + '/>';
        validos.forEach(function (i) {
          const q = ponto(i, s.valores[i]);
          pontos += '<circle cx="' + q[0].toFixed(1) + '" cy="' + q[1].toFixed(1) + '" r="3.2" fill="' + s.cor +
                    '"><title>' + esc(s.nome + ' — ' + curto(eixos[i]) + ': ' + num(s.valores[i])) + '</title></circle>';
          // Só a série principal ganha número. A camada de referência (empresa,
          // autoavaliação) é régua, não dado — e como as notas ficam quase todas
          // entre 2,7 e 3,3, dois rótulos no mesmo eixo se sobrepõem sempre.
          if (mostrarRotulo && !s.tracejado) {
            const fora = ponto(i, s.valores[i] + 0.42);
            rotulosValor += rotuloValor_(fora[0], fora[1] + 3, num(s.valores[i]), 9.5, 700);
          }
        });

        legenda += '<span class="legenda-item"><span class="bolinha" style="background:' + s.cor +
                   (s.tracejado ? ';opacity:.55' : '') + '"></span>' + esc(s.nome) + '</span>';
        descricao.push(s.nome + ': ' + validos.map(function (i) {
          return curto(eixos[i]) + ' ' + num(s.valores[i]);
        }).join(', '));
      });

      if (!formas) return semDados_();

      return caixaGrafico_(
        '<svg viewBox="0 38 520 350" class="radar" role="img" aria-label="' +
        esc('Gráfico de aranha, escala 0 a 5. ' + descricao.join('. ')) + '">' +
        teia + raios + formas + pontos + rotulosValor + marcas + rotulos + '</svg>', legenda);
    }

    function semDados_() {
      return '<div class="aviso">Sem dados suficientes para desenhar o gráfico.</div>';
    }
    function caixaGrafico_(svg, legenda, larguraSvg) {
      // Gráficos largos (muitas categorias) rolam na horizontal em vez de espremer tudo.
      const rola = larguraSvg && larguraSvg > 720;
      const miolo = rola
        ? '<div class="dica-rolagem nao-imprime">← arraste o gráfico para ver todas as áreas →</div>' +
          '<div class="gcart-scroll"><div style="min-width:' + larguraSvg + 'px">' + svg + '</div></div>'
        : svg;
      return '<div class="radar-caixa">' + miolo +
        (legenda ? '<div class="legenda" style="margin-top:4px">' + legenda + '</div>' : '') + '</div>';
    }
    function legendaSerie_(s, corForcada) {
      return '<span class="legenda-item"><span class="bolinha" style="background:' + (corForcada || s.cor) +
        (s.tracejado ? ';opacity:.55' : '') + '"></span>' + esc(s.nome) + '</span>';
    }
    function indicesComNota_(s, n) {
      const v = [];
      for (let i = 0; i < n; i++) if (s.valores[i] !== null && s.valores[i] !== undefined) v.push(i);
      return v;
    }

    /** Texto de valor sobre um ponto do gráfico, com halo branco para não sumir na grade/barra. */
    // dentroDaForma: quando o rótulo cai por cima de uma barra saturada (valor perto do teto da
    // escala, sem espaço acima), o halo branco fica ilegível — nesse caso usa branco sólido.
    function rotuloValor_(x, y, texto, tamanho, peso, dentroDaForma) {
      const estilo = dentroDaForma
        ? 'fill="#fff"'
        : 'fill="#151E49" paint-order="stroke" stroke="#fff" stroke-width="3" stroke-linejoin="round"';
      return '<text x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" text-anchor="middle" font-size="' +
        (tamanho || 10.5) + '" font-weight="' + (peso || 700) + '" ' + estilo + '>' + esc(texto) + '</text>';
    }

    /**
     * Eixo cartesiano compartilhado por colunas e linhas.
     * Escala configurável (0–5 por padrão, igual ao resto do painel) com linhas de grade.
     * Nomes completos são quebrados em várias linhas e cada categoria recebe largura
     * própria. Assim nenhum nome de área é cortado, mesmo nos gráficos mais cheios.
     *
     * opts: { maxValor, passo, truncar }
     */
    function planoCartesiano_(eixos, opts) {
      opts = opts || {};
      const MAX = opts.maxValor || 5;
      const passo = opts.passo || 1;
      const truncar = opts.truncar !== false;
      const muitasCategorias = eixos.length > 7;

      function quebrarRotulo_(nome) {
        // A barra vira um ponto natural de quebra, sem desaparecer do texto.
        const palavras = String(nome).trim().replace(/\\//g, '/ ').split(/\\s+/);
        const linhas = [];
        let atual = '';
        palavras.forEach(function (palavra) {
          const candidata = atual ? atual + ' ' + palavra : palavra;
          if (atual && candidata.length > 17) {
            linhas.push(atual);
            atual = palavra;
          } else {
            atual = candidata;
          }
        });
        if (atual) linhas.push(atual);
        return linhas.length ? linhas : [''];
      }

      const rotulosQuebrados = truncar ? [] : eixos.map(quebrarRotulo_);
      const maxLinhas = rotulosQuebrados.reduce(function (maior, linhas) {
        return Math.max(maior, linhas.length);
      }, 1);
      const L = muitasCategorias || !truncar ? 55 : 34, T = 16, R = 14, alt = 266;
      const B = truncar ? 58 : 28 + maxLinhas * 15;
      const H = T + alt + B;
      // Nomes completos precisam de espaço horizontal real. Quando necessário,
      // caixaGrafico_ ativa a rolagem horizontal em vez de comprimir os textos.
      const larguraSlot = truncar ? (muitasCategorias ? 62 : null) : 104;
      const larg = larguraSlot ? larguraSlot * eixos.length : 720 - L - R;
      const W = L + larg + R;
      const fatia = larguraSlot || (larg / eixos.length);

      const y = function (v) { return T + alt * (1 - Math.max(0, Math.min(MAX, v)) / MAX); };
      const xc = function (i) { return L + fatia * (i + 0.5); };

      let grade = '';
      for (let v = 0; v <= MAX + 0.001; v += passo) {
        const vv = Math.min(MAX, v);
        const yy = y(vv);
        const rotuloEixo = passo < 1 ? vv.toFixed(1).replace('.', ',') : String(Math.round(vv));
        grade += '<line x1="' + L + '" y1="' + yy.toFixed(1) + '" x2="' + (W - R) + '" y2="' + yy.toFixed(1) +
                 '" stroke="rgba(21,30,73,' + (vv === 0 ? '.28' : '.10') + ')" stroke-width="1"/>' +
                 '<text x="' + (L - 8) + '" y="' + (yy + 3.5).toFixed(1) +
                 '" text-anchor="end" font-size="10.5" fill="#8A94A6">' + rotuloEixo + '</text>';
      }
      let rotulos = '';
      eixos.forEach(function (nome, i) {
        const texto = truncar ? curto(nome) : nome;
        if (!truncar) {
          const x = xc(i), yy = T + alt + 18;
          rotulos += '<text x="' + x.toFixed(1) + '" y="' + yy + '" text-anchor="middle" font-size="11" ' +
            'font-weight="600" fill="#151E49">' +
            rotulosQuebrados[i].map(function (linha, j) {
              return '<tspan x="' + x.toFixed(1) + '" dy="' + (j === 0 ? 0 : 15) + '">' + esc(linha) + '</tspan>';
            }).join('') + '</text>';
        } else {
          rotulos += '<text x="' + xc(i).toFixed(1) + '" y="' + (T + alt + 20) +
            '" text-anchor="middle" font-size="12" font-weight="600" fill="#151E49">' + esc(texto) + '</text>';
        }
      });

      return { L: L, T: T, W: W, H: H, MAX: MAX, alt: alt, fatia: fatia, y: y, xc: xc, grade: grade, rotulos: rotulos };
    }

    /**
     * Colunas agrupadas — uma barra por série em cada critério/categoria.
     * series: [{ nome, cor, valores:[n|null], tracejado?, cores?:[corPorIndice] }]
     * opts é repassado ao eixo (maxValor, passo, truncar) — ver planoCartesiano_.
     * Mostra o valor em cima de cada barra quando há espaço e não são muitas séries de uma vez.
     */
    function colunas(eixos, series, opts) {
      const n = eixos.length;
      if (!n) return '';
      const g = planoCartesiano_(eixos, opts);

      const vivas = series.filter(function (s) { return indicesComNota_(s, n).length > 0; });
      if (!vivas.length) return semDados_();

      const grupo = g.fatia * 0.72;
      const larguraBarra = grupo / vivas.length;
      const mostrarRotulo = vivas.length <= 2 && larguraBarra >= 15;
      const fonteRotulo = larguraBarra < 26 ? 8.5 : larguraBarra < 40 ? 9.5 : 10.5;
      // Contagens (pessoas, respostas) são inteiras — "7,00" só polui.
      const fmt = (opts && opts.inteiro) ? function (v) { return String(Math.round(v)); } : num;

      let barras = '', rotulosValor = '', legenda = '', descricao = [];
      vivas.forEach(function (s, j) {
        indicesComNota_(s, n).forEach(function (i) {
          const v = s.valores[i];
          const cor = (s.cores && s.cores[i]) || s.cor;
          const x = g.xc(i) - grupo / 2 + j * larguraBarra;
          const topo = g.y(v);
          const altura = Math.max(2, g.y(0) - topo);
          barras += '<rect x="' + (x + 1).toFixed(1) + '" y="' + topo.toFixed(1) +
                    '" width="' + Math.max(2, larguraBarra - 2).toFixed(1) + '" height="' + altura.toFixed(1) +
                    '" rx="3" fill="' + cor + '" fill-opacity="' + (s.tracejado ? '.42' : '.92') + '"' +
                    (s.tracejado ? ' stroke="' + cor + '" stroke-width="1.4" stroke-dasharray="4 3"' : '') +
                    '><title>' + esc(s.nome + ' — ' + curto(eixos[i]) + ': ' + fmt(v)) + '</title></rect>';
          if (mostrarRotulo) {
            const espacoFora = topo - 6 >= g.T + 10;
            const y = espacoFora ? topo - 6 : Math.min(topo + 14, g.y(0) - 6);
            rotulosValor += rotuloValor_(x + larguraBarra / 2, y, fmt(v), fonteRotulo, 700, !espacoFora);
          }
        });
        // Série colorida por faixa (crítico→ótimo) não precisa de legenda própria:
        // a legenda de escala acima do gráfico já explica as cores. Mas se houver
        // outra série junto, o leitor precisa saber qual barra é qual.
        legenda += (s.cores && vivas.length === 1) ? '' : legendaSerie_(s, s.cores ? '#F9B310' : null);
        descricao.push(s.nome + ': ' + indicesComNota_(s, n).map(function (i) {
          return curto(eixos[i]) + ' ' + fmt(s.valores[i]);
        }).join(', '));
      });

      // Linha de referência opcional (ex.: média da empresa naquele critério).
      // Fica ATRÁS das barras; o rótulo vai para o lado do gráfico onde as barras
      // estão abaixo da linha — senão ele cai em cima das colunas mais altas.
      let referencia = '', linhaRef = '';
      if (opts && typeof opts.referencia === 'number') {
        const ref = opts.referencia;
        const yr = g.y(ref);
        linhaRef = '<line x1="' + g.L + '" y1="' + yr.toFixed(1) + '" x2="' + (g.W - 14) + '" y2="' + yr.toFixed(1) +
          '" stroke="#151E49" stroke-width="1.6" stroke-dasharray="6 4" opacity=".5"/>';

        const principal = vivas[0].valores;
        function livre(inicio, fim) {   // quantas barras do trecho ficam abaixo da linha
          let q = 0;
          for (let i = inicio; i < fim && i < n; i++) if (principal[i] !== null && principal[i] < ref) q++;
          return q;
        }
        const janela = Math.min(3, n);
        const aEsquerda = livre(0, janela) >= livre(n - janela, n);
        referencia = '<text x="' + (aEsquerda ? g.L + 6 : g.W - 18) + '" y="' + (yr - 6).toFixed(1) +
          '" text-anchor="' + (aEsquerda ? 'start' : 'end') + '" font-size="10.5" font-weight="700" fill="#151E49" ' +
          'paint-order="stroke" stroke="#fff" stroke-width="3.5" stroke-linejoin="round">' +
          esc((opts.rotuloReferencia || 'referência') + ' ' + num(ref)) + '</text>';
      }

      return caixaGrafico_(
        '<svg viewBox="0 0 ' + g.W + ' ' + g.H + '" class="gcart" role="img" aria-label="' +
        esc('Gráfico de colunas, escala 0 a ' + g.MAX + '. ' + descricao.join('. ')) + '">' +
        g.grade + linhaRef + barras + rotulosValor + referencia + g.rotulos + '</svg>', legenda, g.W);
    }

    /**
     * Linhas — uma linha por série ao longo dos critérios/categorias.
     * Com até 2 séries, mostra o valor junto de cada ponto; com mais, só o hover (title) — senão vira poluição visual.
     */
    function linhas(eixos, series, opts) {
      const n = eixos.length;
      if (!n) return '';
      const g = planoCartesiano_(eixos, opts);
      const mostrarRotulo = series.filter(function (s) { return indicesComNota_(s, n).length > 0; }).length <= 2;

      let tracos = '', rotulosValor = '', legenda = '', descricao = [], desenhou = false;
      series.forEach(function (s) {
        const validos = indicesComNota_(s, n);
        if (!validos.length) return;
        desenhou = true;

        if (validos.length > 1) {
          const pts = validos.map(function (i) {
            return g.xc(i).toFixed(1) + ',' + g.y(s.valores[i]).toFixed(1);
          }).join(' ');
          tracos += '<polyline points="' + pts + '" fill="none" stroke="' + s.cor +
                    '" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"' +
                    (s.tracejado ? ' stroke-dasharray="5 4"' : '') + '/>';
        }
        validos.forEach(function (i) {
          const py = g.y(s.valores[i]);
          tracos += '<circle cx="' + g.xc(i).toFixed(1) + '" cy="' + py.toFixed(1) +
                    '" r="3.6" fill="#fff" stroke="' + s.cor + '" stroke-width="2.2">' +
                    '<title>' + esc(s.nome + ' — ' + curto(eixos[i]) + ': ' + num(s.valores[i])) + '</title></circle>';
          if (mostrarRotulo && !s.tracejado) {
            rotulosValor += rotuloValor_(g.xc(i), Math.max(g.T + 10, py - 10), num(s.valores[i]), 10, 700);
          }
        });

        legenda += legendaSerie_(s);
        descricao.push(s.nome + ': ' + validos.map(function (i) {
          return curto(eixos[i]) + ' ' + num(s.valores[i]);
        }).join(', '));
      });

      if (!desenhou) return semDados_();

      return caixaGrafico_(
        '<svg viewBox="0 0 ' + g.W + ' ' + g.H + '" class="gcart" role="img" aria-label="' +
        esc('Gráfico de linhas, escala 0 a ' + g.MAX + '. ' + descricao.join('. ')) + '">' +
        g.grade + tracos + rotulosValor + g.rotulos + '</svg>', legenda, g.W);
    }

    function blocoDetalhe() {
      const opcoes = dados.areas.map(function (a) { return '<option value="' + esc(a.nome) + '">' + esc(a.nome) + '</option>'; }).join('');
      return '<section class="bloco" id="s-detalhe"><h2>Detalhe por área</h2>' +
        '<div class="bloco-sub">Escolha uma área para ver a nota em cada critério. Adicione uma segunda ou terceira para comparar lado a lado.</div>' +
        '<div class="campos">' +
        '<div><label class="rotulo-campo" for="areaA">Área</label><select id="areaA">' + opcoes + '</select></div>' +
        '<div><label class="rotulo-campo" for="areaB">Comparar com</label><select id="areaB"><option value="">— nenhuma —</option>' + opcoes + '</select></div>' +
        '<div><label class="rotulo-campo" for="areaC">E com</label><select id="areaC"><option value="">— nenhuma —</option>' + opcoes + '</select></div>' +
        '<div><label class="rotulo-campo" for="ordemDetalhe">Ordenar critérios</label>' +
        '<select id="ordemDetalhe">' +
        '<option value="formulario">Ordem do formulário</option>' +
        '<option value="asc">Menor nota primeiro</option>' +
        '<option value="desc">Maior nota primeiro</option>' +
        '<option value="dif">Maior diferença auto × externa</option>' +
        '<option value="alfabetica">Ordem alfabética</option>' +
        '</select></div>' +
        '</div>' +
        '<div class="opcoes-radar">' +
        '<div class="seg" role="group" aria-label="Formato do gráfico">' +
          '<button type="button" class="seg-btn ativo" data-grafico="aranha" onclick="trocarGrafico(this)">🕸️ Aranha</button>' +
          '<button type="button" class="seg-btn" data-grafico="colunas" onclick="trocarGrafico(this)">📊 Colunas</button>' +
          '<button type="button" class="seg-btn" data-grafico="linhas" onclick="trocarGrafico(this)">📈 Linhas</button>' +
        '</div>' +
        '<label class="marcador"><input type="checkbox" id="radarEmpresa" checked> Comparar com a média da empresa</label>' +
        '<label class="marcador"><input type="checkbox" id="radarAuto"> Mostrar a autoavaliação da 1ª área</label>' +
        '</div>' +
        '<div id="radarArea"></div>' +
        '<div id="detalheArea" style="overflow-x:auto"></div></section>';
    }
    function desenharDetalhe() {
      const escolhidas = ['areaA','areaB','areaC']
        .map(function (id) { return document.getElementById(id).value; })
        .filter(function (v, i, arr) { return v && arr.indexOf(v) === i; });
      if (!escolhidas.length) { document.getElementById('detalheArea').innerHTML = ''; return; }

      let criterios = (dados.detalhe[escolhidas[0]] || []).map(function (d) { return { nome: d.pergunta, secao: d.secao }; });

      // A ordem vale para a tabela e para o gráfico — os dois precisam contar
      // a mesma história, senão a leitura cruzada engana.
      const ordemC = (document.getElementById('ordemDetalhe') || {}).value || 'formulario';
      if (ordemC !== 'formulario') {
        const daPrimeira = function (nome) {
          return (dados.detalhe[escolhidas[0]] || []).filter(function (x) { return x.pergunta === nome; })[0] || {};
        };
        criterios = criterios.slice().sort(function (a, b) {
          if (ordemC === 'alfabetica') return a.nome.localeCompare(b.nome, 'pt-BR');
          const da = daPrimeira(a.nome), db = daPrimeira(b.nome);
          if (ordemC === 'dif') {
            return Math.abs(db.diferenca === null ? -1 : db.diferenca) - Math.abs(da.diferenca === null ? -1 : da.diferenca);
          }
          const va = da.externa, vb = db.externa;
          if (va === null) return 1;
          if (vb === null) return -1;
          return ordemC === 'asc' ? va - vb : vb - va;
        });
      }

      const cabecalho = '<tr><th>Critério</th>' + escolhidas.map(function (a) {
        return '<th style="text-align:right">' + esc(a) + '</th>';
      }).join('') + (escolhidas.length === 1 ? '<th style="text-align:right">Autoavaliação</th><th style="text-align:right">Gap</th>' : '') + '</tr>';

      const corpo = criterios.map(function (c) {
        let linha = '<td><strong>' + esc(c.nome) + '</strong><div style="font-size:11px;color:#657386">' + esc(c.secao) + '</div></td>';
        escolhidas.forEach(function (area) {
          const d = (dados.detalhe[area] || []).filter(function (x) { return x.pergunta === c.nome; })[0];
          const v = d ? d.externa : null;
          linha += '<td class="num" style="color:' + corDoTexto(v) + '">' + num(v) + '</td>';
        });
        if (escolhidas.length === 1) {
          const d = (dados.detalhe[escolhidas[0]] || []).filter(function (x) { return x.pergunta === c.nome; })[0];
          let dif = '—';
          if (d && d.diferenca !== null) {
            const cor = d.diferenca <= -0.3 ? '#C42342' : (d.diferenca >= 0.3 ? '#1B7A44' : '#657386');
            dif = '<span style="color:' + cor + '">' + (d.diferenca > 0 ? '+' : '') + num(d.diferenca) + '</span>';
          }
          linha += '<td class="num">' + num(d ? d.auto : null) + '</td><td class="num">' + dif + '</td>';
        }
        return '<tr>' + linha + '</tr>';
      }).join('');

      document.getElementById('detalheArea').innerHTML =
        '<table><caption>Notas dadas pelas outras áreas, por critério (escala 0 a 5).</caption>' +
        '<thead>' + cabecalho + '</thead><tbody>' + corpo + '</tbody></table>';

      desenharRadar(escolhidas, criterios);
    }

    let tipoGrafico = 'aranha';
    function trocarGrafico(botao) {
      tipoGrafico = botao.dataset.grafico;
      const irmaos = botao.parentNode.querySelectorAll('.seg-btn');
      for (let i = 0; i < irmaos.length; i++) irmaos[i].classList.toggle('ativo', irmaos[i] === botao);
      desenharDetalhe();
    }

    // ── Barras × colunas, nos gráficos que não são o comparativo de "Detalhe por área" ──
    const formato = { participacao: 'barras', ranking: 'barras', comparacao: 'barras', criterios: 'barras', pergunta: 'barras' };
    function segFormato_(secao) {
      return '<div class="seg" role="group" aria-label="Formato do gráfico">' +
        '<button type="button" class="seg-btn' + (formato[secao] === 'barras' ? ' ativo' : '') +
        '" data-formato="barras" onclick="trocarFormato(\\'' + secao + '\\', this)">📏 Barras</button>' +
        '<button type="button" class="seg-btn' + (formato[secao] === 'colunas' ? ' ativo' : '') +
        '" data-formato="colunas" onclick="trocarFormato(\\'' + secao + '\\', this)">📊 Colunas</button></div>';
    }
    function trocarFormato(secao, botao) {
      formato[secao] = botao.dataset.formato;
      const irmaos = botao.parentNode.querySelectorAll('.seg-btn');
      for (let i = 0; i < irmaos.length; i++) irmaos[i].classList.toggle('ativo', irmaos[i] === botao);
      if (secao === 'participacao') desenharParticipacao();
      else if (secao === 'ranking') desenharRanking();
      else if (secao === 'comparacao') desenharComparacao();
      else if (secao === 'criterios') desenharCriterios();
      else if (secao === 'pergunta') desenharPorPergunta();
      ativarPistasDeRolagem();
    }

    function desenharRadar(escolhidas, criterios) {
      const eixos = criterios.map(function (c) { return c.nome; });
      const series = [];

      function valores(area, campo) {
        return eixos.map(function (nome) {
          const d = (dados.detalhe[area] || []).filter(function (x) { return x.pergunta === nome; })[0];
          return d ? d[campo] : null;
        });
      }

      escolhidas.forEach(function (area, i) {
        series.push({ nome: area, cor: CORES_SERIE[i % CORES_SERIE.length], valores: valores(area, 'externa') });
      });

      if (document.getElementById('radarAuto').checked && escolhidas.length) {
        series.push({
          nome: escolhidas[0] + ' (autoavaliação)',
          cor: CORES_SERIE[0], tracejado: true,
          valores: valores(escolhidas[0], 'auto')
        });
      }

      if (document.getElementById('radarEmpresa').checked) {
        const porNome = {};
        dados.criterios.forEach(function (c) { porNome[c.nome] = c.media; });
        series.push({
          nome: 'Média da empresa', cor: '#657386', tracejado: true,
          valores: eixos.map(function (nome) {
            return porNome[nome] === undefined ? null : porNome[nome];
          })
        });
      }

      const desenhar = tipoGrafico === 'colunas' ? colunas : tipoGrafico === 'linhas' ? linhas : radar;
      document.getElementById('radarArea').innerHTML = desenhar(eixos, series);
    }

    // ── Comentários ──
    function blocoComentarios() {
      const areas = [];
      dados.comentarios.forEach(function (c) { if (areas.indexOf(c.area) === -1) areas.push(c.area); });
      areas.sort();
      const perguntas = [];
      dados.comentarios.forEach(function (c) { if (perguntas.indexOf(c.pergunta) === -1) perguntas.push(c.pergunta); });

      return '<section class="bloco" id="s-comentarios"><h2>O que escreveram</h2>' +
        '<div class="bloco-sub">' + dados.comentarios.length + ' comentários, em <strong>ordem aleatória</strong> e sem identificação — ' +
        'não é possível saber quais vieram da mesma pessoa.</div>' +
        '<div id="blocoTermos" style="margin-bottom:20px"></div>' +
        '<div class="campos">' +
        '<div><label class="rotulo-campo" for="filtroArea">Área</label><select id="filtroArea"><option value="">Todas</option>' +
          areas.map(function (a) { return '<option value="' + esc(a) + '">' + esc(a) + '</option>'; }).join('') + '</select></div>' +
        '<div><label class="rotulo-campo" for="filtroPergunta">Pergunta</label><select id="filtroPergunta"><option value="">Todas</option>' +
          perguntas.map(function (p) { return '<option value="' + esc(p) + '">' + esc(p) + '</option>'; }).join('') + '</select></div>' +
        '<div><label class="rotulo-campo" for="filtroOrigem">Origem</label><select id="filtroOrigem">' +
          '<option value="">Todas</option>' +
          '<option value="Outra área">Só de outras áreas</option>' +
          '<option value="Autoavaliação">Só autoavaliação</option></select></div>' +
        '<div style="flex:1;min-width:200px"><label class="rotulo-campo" for="buscaComentario">Buscar no texto</label>' +
          '<input type="search" id="buscaComentario" placeholder="palavra ou trecho…" style="width:100%"></div>' +
        '<button class="btn btn-claro" id="btnExportar" onclick="exportar()" title="Baixa um arquivo CSV com os comentários filtrados.">⬇️ Exportar CSV</button>' +
        '</div><div id="avisoExport" class="nao-imprime"></div>' +
        '<div id="listaComentarios"></div>' +
        '<div id="paginacao" style="text-align:center;margin-top:16px" class="nao-imprime"></div></section>';
    }

    function comentariosFiltrados() {
      const area = document.getElementById('filtroArea').value;
      const pergunta = document.getElementById('filtroPergunta').value;
      const origem = document.getElementById('filtroOrigem').value;
      const busca = document.getElementById('buscaComentario').value.toLowerCase().trim();
      return dados.comentarios.filter(function (c) {
        if (area && c.area !== area) return false;
        if (pergunta && c.pergunta !== pergunta) return false;
        if (origem && c.origem !== origem) return false;
        if (busca && c.texto.toLowerCase().indexOf(busca) === -1) return false;
        return true;
      });
    }

    // Nomes das áreas viram ruído na contagem: aparecem em quase todo comentário
    // e a área já está no crachá de cada card e no filtro acima.
    let vaziasArea = null;
    function palavrasDeArea() {
      if (vaziasArea) return vaziasArea;
      vaziasArea = {};
      (dados && dados.areas ? dados.areas : []).forEach(function (a) {
        a.nome.toLowerCase().replace(/[^\\wÀ-ÿ\\s]/g, ' ').split(/\\s+/).forEach(function (p) {
          if (p.length >= 4) vaziasArea[p] = true;
        });
      });
      return vaziasArea;
    }

    function desenharTermos() {
      const lista = comentariosFiltrados();
      const daArea = palavrasDeArea();
      const contagem = {};
      lista.forEach(function (c) {
        const palavras = c.texto.toLowerCase().replace(/[^\\wÀ-ÿ\\s]/g, ' ').split(/\\s+/);
        const jaContadas = {};
        palavras.forEach(function (p) {
          if (p.length < 4) return;
          if (VAZIAS.indexOf(p) !== -1) return;
          if (daArea[p]) return;
          if (jaContadas[p]) return;      // conta uma vez por comentário
          jaContadas[p] = true;
          contagem[p] = (contagem[p] || 0) + 1;
        });
      });
      const top = Object.keys(contagem).map(function (p) { return { p: p, n: contagem[p] }; })
        .sort(function (a, b) { return b.n - a.n; }).slice(0, 18);

      // Cor e tamanho carregam a frequência, em vez de serem enfeite: o termo
      // mais citado precisa saltar antes de o olho ler o número.
      // Tom único (navy) de propósito — a rampa vermelho→verde significa NOTA
      // no resto do painel e não pode virar "citado muitas vezes" aqui.
      const maior = top.length ? top[0].n : 1;
      const menor = top.length ? top[top.length - 1].n : 1;
      const intensidade = function (n) {
        return maior === menor ? 1 : (n - menor) / (maior - menor);   // 0..1
      };

      document.getElementById('blocoTermos').innerHTML = top.length < 3 ? '' :
        '<div class="bloco-sub" style="margin-bottom:9px"><strong>Termos mais citados</strong> — clique para filtrar. ' +
        'Palavra contada uma vez por comentário, em ' + lista.length +
        (lista.length === 1 ? ' comentário' : ' comentários') + '. Quanto mais forte, mais citada.</div>' +
        '<div class="termos">' +
        top.map(function (t) {
          const f = intensidade(t.n);
          const fundo = 'rgba(21,30,73,' + (0.05 + f * 0.82).toFixed(3) + ')';
          const cor = f > 0.45 ? '#fff' : 'var(--navy)';
          const tamanho = (12.5 + f * 3.5).toFixed(1);
          const peso = f > 0.55 ? 700 : 600;
          return '<button class="termo" style="background:' + fundo + ';color:' + cor +
                 ';border-color:transparent;font-size:' + tamanho + 'px;font-weight:' + peso + '" ' +
                 'onclick="filtrarPorTermo(\\'' + esc(t.p) + '\\')">' +
                 esc(t.p) + '<span class="qtd" style="color:inherit;opacity:.7">' + t.n + '</span></button>';
        }).join('') + '</div>';
    }
    function filtrarPorTermo(termo) {
      document.getElementById('buscaComentario').value = termo;
      comentariosVisiveis = POR_PAGINA;
      desenharComentarios();
      document.getElementById('s-comentarios').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function realcar(texto, busca) {
      if (!busca) return esc(texto);
      const partes = String(texto).split(new RegExp('(' + busca.replace(/[.*+?^$\{\}()|[\\]\\\\]/g, '\\\\$&') + ')', 'gi'));
      return partes.map(function (p, i) { return i % 2 ? '<mark>' + esc(p) + '</mark>' : esc(p); }).join('');
    }

    function desenharComentarios() {
      const filtrados = comentariosFiltrados();
      const busca = document.getElementById('buscaComentario').value.trim();
      const alvo = document.getElementById('listaComentarios');
      const pag = document.getElementById('paginacao');

      if (!filtrados.length) {
        alvo.innerHTML = '<div class="vazio" style="padding:40px">Nenhum comentário encontrado com esses filtros.</div>';
        pag.innerHTML = ''; desenharTermos(); return;
      }

      const mostrando = Math.min(comentariosVisiveis, filtrados.length);
      alvo.innerHTML = filtrados.slice(0, mostrando).map(function (c) {
        return '<article class="comentario"><div class="comentario-topo">' +
          '<span class="tag tag-area">' + esc(c.area) + '</span>' +
          '<span class="tag ' + (c.origem === 'Autoavaliação' ? 'tag-auto' : 'tag-ext') + '">' + esc(c.origem) + '</span></div>' +
          '<div class="pergunta">' + esc(c.pergunta) + '</div>' +
          '<div class="texto">' + realcar(c.texto, busca) + '</div></article>';
      }).join('');

      pag.innerHTML = mostrando < filtrados.length
        ? '<div class="sem-dado" style="margin-bottom:10px">Mostrando ' + mostrando + ' de ' + filtrados.length + '</div>' +
          '<button class="btn btn-claro" onclick="verMais()">Carregar mais ' +
          Math.min(POR_PAGINA, filtrados.length - mostrando) + '</button>'
        : '<div class="sem-dado">' + filtrados.length + ' comentário(s) — fim da lista.</div>';

      desenharTermos();
    }
    function verMais() { comentariosVisiveis += POR_PAGINA; desenharComentarios(); }

    /**
     * Tenta baixar o CSV pelo navegador e devolve a URL do blob.
     * O clique programático pode ser bloqueado pelo sandbox do iframe do Apps
     * Script — e não há como detectar isso. Por isso a URL volta daqui: quem
     * chama mostra um link visível para o usuário clicar se nada acontecer.
     */
    function baixarCsv_(nome, conteudo) {
      // BOM na frente para o Excel abrir os acentos corretamente.
      const blob = new Blob(['\ufeff' + conteudo], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = nome;
      link.style.display = 'none';
      document.body.appendChild(link);
      try { link.click(); } catch (e) { /* sandbox pode recusar; o link manual resolve */ }
      document.body.removeChild(link);
      return url;   // não revogamos: o link manual abaixo ainda precisa dela
    }

    function exportar() {
      const b = document.getElementById('btnExportar');
      const filtros = {
        area: document.getElementById('filtroArea').value,
        pergunta: document.getElementById('filtroPergunta').value,
        origem: document.getElementById('filtroOrigem').value
      };
      const original = b.textContent;
      b.disabled = true; b.textContent = 'Gerando…';
      document.getElementById('avisoExport').innerHTML = '';

      google.script.run
        .withSuccessHandler(function (r) {
          b.disabled = false; b.textContent = original;
          if (r && r.negado) { location.reload(); return; }
          if (r && r.erro) { document.getElementById('avisoExport').innerHTML = '<div class="aviso">' + esc(r.erro) + '</div>'; return; }
          const url = baixarCsv_(r.nome, r.conteudo);
          document.getElementById('avisoExport').innerHTML =
            '<div class="aviso">✅ <strong>' + r.total + ' comentários prontos</strong> em <em>' + esc(r.nome) + '</em>. ' +
            'O download costuma começar sozinho — se não começou, ' +
            '<a href="' + url + '" download="' + esc(r.nome) + '" target="_blank" rel="noopener"><strong>clique aqui</strong></a>.' +
            '</div>';
        })
        .withFailureHandler(function (e) {
          b.disabled = false; b.textContent = original;
          document.getElementById('avisoExport').innerHTML = '<div class="aviso">Erro ao exportar: ' + esc(e && e.message ? e.message : e) + '</div>';
        })
        .exportarComentarios(senhaAtual, filtros);
    }

    // ── Ligações ──
    function ligarInteracoes() {
      document.getElementById('ordemAreas').addEventListener('change', desenharRanking);
      desenharRanking();
      desenharParticipacao();
      ['ordemComparacao','ladoComparacao'].forEach(function (id) {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', desenharComparacao);
      });
      desenharComparacao();
      desenharCriterios();

      ['perguntaAlvo','ordemPergunta','perguntaAuto'].forEach(function (id) {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', desenharPorPergunta);
      });
      desenharPorPergunta();

      ['areaA','areaB','areaC','ordemDetalhe','radarEmpresa','radarAuto'].forEach(function (id) {
        document.getElementById(id).addEventListener('change', desenharDetalhe);
      });
      desenharDetalhe();

      ['filtroArea','filtroPergunta','filtroOrigem'].forEach(function (id) {
        document.getElementById(id).addEventListener('change', function () { comentariosVisiveis = POR_PAGINA; desenharComentarios(); });
      });
      document.getElementById('buscaComentario').addEventListener('input', function () { comentariosVisiveis = POR_PAGINA; desenharComentarios(); });
      comentariosVisiveis = POR_PAGINA;
      desenharComentarios();

      ativarIndice();
      ativarPistasDeRolagem();
    }

    // A máscara na borda direita só faz sentido enquanto ainda há gráfico escondido.
    function ativarPistasDeRolagem() {
      document.querySelectorAll('.gcart-scroll').forEach(function (el) {
        function atualizar() {
          const sobra = el.scrollWidth - el.clientWidth - el.scrollLeft;
          el.classList.toggle('tem-mais', sobra > 4);
          const dica = el.previousElementSibling;
          if (dica && dica.classList.contains('dica-rolagem')) {
            dica.style.visibility = (el.scrollWidth - el.clientWidth > 4) ? 'visible' : 'hidden';
          }
        }
        el.addEventListener('scroll', atualizar, { passive: true });
        atualizar();
      });
    }

    // Marca no índice a seção visível
    function ativarIndice() {
      const secoes = ['s-visao','s-areas','s-auto','s-criterios','s-pergunta','s-detalhe','s-comentarios']
        .map(function (id) { return document.getElementById(id); }).filter(Boolean);
      const links = Array.prototype.slice.call(document.querySelectorAll('.indice a'));
      if (!('IntersectionObserver' in window)) return;
      const obs = new IntersectionObserver(function (entradas) {
        entradas.forEach(function (e) {
          if (!e.isIntersecting) return;
          links.forEach(function (l) { l.classList.toggle('ativo', l.getAttribute('href') === '#' + e.target.id); });
        });
      }, { rootMargin: '-120px 0px -70% 0px' });
      secoes.forEach(function (s) { obs.observe(s); });
    }

    function atualizarPlanilha() {
      const b = document.getElementById('btnPlanilha');
      const original = b.textContent;
      b.disabled = true; b.textContent = 'Atualizando…';
      google.script.run
        .withSuccessHandler(function (r) {
          if (r && r.negado) { location.reload(); return; }
          b.textContent = '✓ Abas regravadas';
          setTimeout(function () { b.textContent = original; b.disabled = false; }, 2500);
        })
        .withFailureHandler(function (e) {
          b.textContent = 'Erro'; alert('Erro: ' + e);
          setTimeout(function () { b.textContent = original; b.disabled = false; }, 2000);
        })
        .regerarAbasDaPlanilha(senhaAtual);
    }

    document.getElementById('campoSenha').focus();
  </script>
</body>
</html>
  `;
}

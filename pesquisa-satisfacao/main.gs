/**
 * Entry point - Render a página inicial do formulário
 */
function doGet(e) {
  // Mesma URL serve as duas telas:
  //   ...?page=painel  → painel do RH (protegido por senha, ver painel.gs)
  //   sem parâmetro    → formulário público
  const pagina = (e && e.parameter && e.parameter.page) || '';
  if (pagina === 'painel') return servirPainel_();

  // Depois do prazo, nem chega a montar o formulário.
  if (pesquisaEncerrada_()) {
    return HtmlService.createHtmlOutput(getEncerradaHTML());
  }

  const html = HtmlService.createHtmlOutput(getFormHTML());
  html.setWidth(1000);
  html.setHeight(800);
  return html;
}

/**
 * POST handler - Recebe dados do formulário
 */
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);

    if (!data.pesquisa_id || !data.avaliacoes) {
      return ContentService.createTextOutput(
        JSON.stringify({ success: false, error: "Dados inválidos" })
      ).setMimeType(ContentService.MimeType.JSON);
    }

    salvarResposta(data);

    return ContentService.createTextOutput(
      JSON.stringify({ success: true, message: "Resposta salva com sucesso!" })
    ).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    Logger.log("Erro ao processar formulário: " + error);
    return ContentService.createTextOutput(
      JSON.stringify({ success: false, error: error.toString() })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Função chamada do formulário HTML via google.script.run
 */
function submitForm(data) {
  try {
    salvarResposta(data);
    return { success: true, message: "Resposta salva com sucesso!" };
  } catch (error) {
    // Quem ficou com a página aberta e enviou depois do prazo precisa de uma
    // resposta específica, não de uma mensagem genérica de erro.
    if (String(error && error.message) === 'PESQUISA_ENCERRADA') {
      return { success: false, encerrada: true, prazo: encerramentoLegivel_() };
    }
    Logger.log("Erro ao salvar resposta: " + error);
    return { success: false, error: error.toString() };
  }
}

/** Data/hora de encerramento para o formulário exibir. '' = sem prazo. */
function prazoDaPesquisa() {
  return encerramentoLegivel_();
}

/** Página mostrada quando alguém abre o link depois do prazo */
function getEncerradaHTML() {
  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Pesquisa encerrada — Capital Realty</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body {
      font-family:'Montserrat',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;
      background:#F6F7F9; color:#151E49; min-height:100vh;
      display:flex; align-items:center; justify-content:center; padding:24px;
    }
    .caixa {
      background:#fff; border:1px solid rgba(21,30,73,.08); border-radius:22px;
      box-shadow:0 1px 2px rgba(21,30,73,.05), 0 12px 32px rgba(21,30,73,.08);
      padding:44px 38px; max-width:480px; text-align:center;
    }
    .emoji { font-size:38px; line-height:1; margin-bottom:18px; }
    h1 { font-size:21px; font-weight:700; letter-spacing:-.022em; margin-bottom:12px; }
    p { font-size:14.5px; line-height:1.65; color:#55627A; }
    p + p { margin-top:12px; }
    .prazo { font-weight:600; color:#151E49; }
    .marca { margin-top:26px; font-size:11.5px; color:#8A94A6; letter-spacing:.04em; text-transform:uppercase; }
  </style>
</head>
<body>
  <main class="caixa">
    <div class="emoji" aria-hidden="true">🔒</div>
    <h1>Pesquisa encerrada</h1>
    <p>O prazo para responder terminou em <span class="prazo">${encerramentoLegivel_()}</span>.</p>
    <p>Obrigado a todos que participaram. Os resultados estão sendo consolidados
       e serão compartilhados pelo RH.</p>
    <div class="marca">Capital Realty</div>
  </main>
</body>
</html>`;
}

/**
 * Retorna o HTML do formulário — layout "uma pergunta por tela, todas as áreas de uma vez",
 * réplica o mais fiel possível do fluxo de resposta do projeto original (Lovable):
 * paleta navy #151E49, fundo cinza claro, escala emoji compacta com cores 1-5 (vermelho→verde),
 * header fixo com progresso + %, animações, foco acessível (aria + focus ring), autosave de rascunho.
 * Adaptado para funcionar sem login (Google Apps Script + Sheets).
 */
function getFormHTML() {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pesquisa RH 360º - Capital Realty</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --navy: #151E49;
      --navy-04: rgba(21,30,73,0.04);
      --navy-10: rgba(21,30,73,0.10);
      --navy-20: rgba(21,30,73,0.20);
      --navy-40: rgba(21,30,73,0.40);
      --bg: #F6F7F9;
      --card: #FFFFFF;
      --border: #DADFE7;
      --muted: #EAEDF1;
      --muted-fg: #657386;
      --success: #21C45D;
      --ring: #065CA9;
      --e1: #E63351;
      --e2: #F47125;
      --e3: #F9B310;
      --e4: #73B82E;
      --e5: #24A85B;

      /* Curva de animação natural (desaceleração suave, sem "salto") */
      --suave: cubic-bezier(0.22, 1, 0.36, 1);

      /* Sombras em camadas: uma rente à borda + uma difusa e ampla.
         Dá profundidade sem a "faixa cinza" de uma sombra única. */
      --sombra-1: 0 1px 2px rgba(21,30,73,0.04), 0 4px 16px rgba(21,30,73,0.05);
      --sombra-2: 0 2px 6px rgba(21,30,73,0.05), 0 16px 40px rgba(21,30,73,0.10);
      --sombra-alta: 0 8px 24px rgba(21,30,73,0.10), 0 32px 64px rgba(21,30,73,0.16);

      /* Bordas quase invisíveis — separam sem "riscar" a tela */
      --hairline: rgba(21,30,73,0.08);
    }

    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: 'Montserrat', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
      background: var(--bg);
      min-height: 100vh;
      color: var(--navy);
      /* Texto mais fino e nítido, como em telas Retina */
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      text-rendering: optimizeLegibility;
      /* Números de mesma largura: as notas não "dançam" ao trocar de tela */
      font-variant-numeric: tabular-nums;
    }

    /* ==== TOP NAV ==== */
    .topnav {
      background: rgba(255,255,255,0.86);
      -webkit-backdrop-filter: saturate(180%) blur(20px);
      backdrop-filter: saturate(180%) blur(20px);
      border-bottom: 1px solid var(--hairline);
      padding: 12px 20px;
      position: sticky;
      top: 0;
      z-index: 20;
    }

    .topnav-inner { max-width: 1040px; margin: 0 auto; display: flex; align-items: center; gap: 14px; }

    .brand-logo-img { height: 30px; width: auto; display: block; }
    .brand-divider { width: 1px; height: 26px; background: var(--border); display: inline-block; }
    .brand-sub2 { font-size: 13px; font-weight: 600; color: var(--muted-fg); }

    .page { padding: 24px 16px; }

    .container {
      max-width: 1040px;
      margin: 0 auto;
      background: var(--card);
      border-radius: 20px;
      border: 1px solid var(--hairline);
      box-shadow: var(--sombra-1);
      padding: 28px;
      position: relative;
    }

    /* ==== STICKY STEP HEADER ==== */
    .survey-sticky {
      position: sticky;
      top: 58px;
      z-index: 9;
      background: rgba(255,255,255,0.82);
      -webkit-backdrop-filter: saturate(180%) blur(20px);
      backdrop-filter: saturate(180%) blur(20px);
      margin: -28px -28px 20px;
      padding: 18px 28px 14px;
      border-bottom: 1px solid var(--hairline);
    }

    .step-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
    .step-label { font-size: 10px; font-weight: 700; letter-spacing: 0.1em; color: var(--muted-fg); text-transform: uppercase; }
    .step-pct { font-size: 10px; font-weight: 700; letter-spacing: 0.08em; color: var(--muted-fg); }

    .progress-bar { width: 100%; height: 6px; background: rgba(21,30,73,0.10); border-radius: 999px; overflow: hidden; }
    .survey-sticky .progress-bar { margin-bottom: 12px; }
    .progress-fill { height: 100%; background: var(--navy); border-radius: 999px; transition: width 0.6s var(--suave); }

    .section-row { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 6px; }
    .section-label { font-size: 10px; font-weight: 700; letter-spacing: 0.1em; color: var(--muted-fg); text-transform: uppercase; }

    .answered-count {
      font-size: 11px; color: var(--muted-fg);
      background: var(--muted);
      padding: 4px 10px; border-radius: 999px;
      transition: all 0.2s;
    }
    .answered-count.complete { background: #e8f7ee; color: #1e8a4c; font-weight: 700; }

    .question-text { font-size: 19px; font-weight: 600; color: var(--navy); line-height: 1.35; letter-spacing: -0.018em; }

    /* ==== INTRO ==== */
    h1 { color: var(--navy); text-align: center; margin-bottom: 10px; font-size: 26px; font-weight: 700; letter-spacing: -0.022em; }
    .stage-intro { text-align: center; max-width: 640px; margin: 0 auto; }
    .stage-intro h2 { font-size: 23px; color: var(--navy); margin-bottom: 10px; font-weight: 600; letter-spacing: -0.021em; }
    .stage-intro p { font-size: 14.5px; color: var(--muted-fg); line-height: 1.65; margin-bottom: 18px; }

    .info-box {
      background: rgba(21,30,73,0.035);
      border-left: 3px solid var(--navy);
      padding: 18px 18px 18px 26px;
      margin: 22px 0;
      border-radius: 14px;
      font-size: 13px;
      color: #444;
      text-align: left;
    }
    .info-box-title { display: block; margin-bottom: 8px; color: var(--navy); font-size: 13px; font-weight: 700; letter-spacing: 0.03em; }
    .info-box ul { margin: 0; padding-left: 18px; line-height: 1.7; }
    .info-box li { margin-bottom: 6px; }
    .info-box li strong { color: var(--navy); }

    .anon-tip {
      background: #eafaf0;
      border: 1px solid rgba(33,196,93,0.25);
      border-radius: 14px;
      padding: 12px 16px;
      margin-bottom: 14px;
      font-size: 12.5px;
      color: #1e6b3e;
      line-height: 1.5;
      text-align: left;
    }

    .badges { display: flex; justify-content: center; gap: 8px; flex-wrap: wrap; margin-bottom: 16px; }
    .badge {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 4px 12px; border-radius: 999px;
      font-size: 11px; font-weight: 700; letter-spacing: 0.03em; text-transform: uppercase;
      cursor: help;
    }
    .badge-green { background: #e8f7ee; color: #1e8a4c; }
    .badge-blue { background: var(--navy-10); color: var(--navy); }
    .badge-prazo { background: rgba(249,179,16,.16); color: #8A6100; }

    .info-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; margin: 20px 0; text-align: left; }
    .info-card { background: var(--bg); border: 1px solid var(--hairline); border-radius: 14px; padding: 14px 16px; }
    .info-card .label { font-size: 10px; font-weight: 700; letter-spacing: 0.04em; color: var(--muted-fg); text-transform: uppercase; margin-bottom: 4px; }
    .info-card .value { font-size: 14px; font-weight: 600; color: var(--navy); }

    .area-picker { text-align: left; margin: 24px 0; }
    .area-picker label { text-align: center; }

    .chips { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; }
    .chip {
      padding: 9px 18px; border: 1.5px solid var(--border); border-radius: 999px;
      background: #fff; font-family: inherit; font-size: 13px; cursor: pointer;
      transition: transform 0.25s var(--suave), border-color 0.2s ease, background 0.2s ease, color 0.2s ease;
      color: #444;
    }
    .chip:hover { border-color: var(--navy); color: var(--navy); }
    .chip.selected { background: var(--navy); border-color: var(--navy); color: #fff; font-weight: 600; box-shadow: var(--sombra-1); }
    .chip:active { transform: scale(0.97); transition-duration: 0.09s; }

    label { display: block; margin-bottom: 12px; font-weight: 600; color: var(--navy); font-size: 15px; }

    textarea {
      width: 100%; padding: 8px 12px;
      border: 1px solid var(--border); border-radius: 12px;
      font-family: inherit; font-size: 14px; resize: vertical; height: 68px;
      transition: border-color 0.2s ease, box-shadow 0.25s var(--suave);
    }
    textarea:focus-visible { outline: none; border-color: var(--ring); box-shadow: 0 0 0 3px rgba(6,92,169,.15); }

    .char-counter { font-size: 10px; font-weight: 600; color: var(--muted-fg); text-align: right; margin-top: 4px; }
    .char-counter.ok { color: var(--success); }

    /* ==== QUESTION CARD ==== */
    .question-card { border: 1px solid var(--hairline); border-radius: 18px; background: var(--card); overflow: hidden; box-shadow: var(--sombra-1); }

    .area-row { padding: 12px 16px; border-top: 1px solid var(--hairline); background: transparent; transition: background 0.4s var(--suave); }
    .area-row:first-child { border-top: none; }
    .area-row.self { background: var(--navy-04); border-left: 4px solid var(--navy); }
    .area-row.answered { background: rgba(33,196,93,0.03); }

    /* Em telas largas, mostra as áreas em 2 colunas lado a lado */
    @media (min-width: 700px) {
      .question-card { display: grid; grid-template-columns: 1fr 1fr; }
      .area-row:nth-child(1), .area-row:nth-child(2) { border-top: none; }
      .area-row:nth-child(odd) { border-right: 1px solid var(--border); }
    }

    .area-row-title { display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 600; color: var(--navy); margin-bottom: 8px; }

    .self-badge {
      font-size: 9px; font-weight: 700; letter-spacing: 0.03em; text-transform: uppercase;
      background: var(--navy-10); color: var(--navy); padding: 2px 6px; border-radius: 4px;
    }
    .check-ok { color: var(--success); font-weight: 700; font-size: 13px; margin-left: auto; }

    .scale-labels { display: grid; grid-template-columns: repeat(5, 1fr); gap: 4px; font-size: 11px; font-weight: 700; color: var(--muted-fg); margin-bottom: 6px; }
    .scale-labels .lo { grid-column: span 2; }
    .scale-labels .hi { grid-column: span 3; text-align: right; }

    .rating-group { display: grid; grid-template-columns: repeat(5, 1fr); gap: 4px; margin-bottom: 6px; }

    .emoji-btn {
      display: flex; flex-direction: row; align-items: center; justify-content: center; gap: 4px;
      padding: 6px 4px; border: 1.5px solid var(--border); border-radius: 14px;
      background: #fff; font-family: inherit; color: var(--muted-fg);
      cursor: pointer; transition: transform 0.25s var(--suave), border-color 0.2s ease, background 0.2s ease, box-shadow 0.25s var(--suave);
    }
    .emoji-btn span.em { font-size: 18px; line-height: 1; filter: grayscale(40%); transition: filter 0.15s, transform 0.15s; }
    .emoji-btn span.num { font-size: 10px; font-weight: 700; color: var(--muted-fg); }

    .emoji-btn:hover { transform: scale(1.05); border-color: var(--navy-40); }
    .emoji-btn:hover span.em { filter: grayscale(0); transform: scale(1.1); }
    .emoji-btn:active { transform: scale(0.94); transition-duration: 0.09s; }

    .emoji-btn.selected { color: #fff; transform: scale(1.04); box-shadow: var(--sombra-2); border-color: transparent; }
    .emoji-btn.selected span.em { filter: none; animation: scale-in 0.2s ease-out; }
    .emoji-btn.selected span.num { color: rgba(255,255,255,.95); }
    .emoji-btn.selected[data-nota="1"] { background: var(--e1); border-color: var(--e1); }
    .emoji-btn.selected[data-nota="2"] { background: var(--e2); border-color: var(--e2); }
    .emoji-btn.selected[data-nota="3"] { background: var(--e3); border-color: var(--e3); }
    .emoji-btn.selected[data-nota="4"] { background: var(--e4); border-color: var(--e4); }
    .emoji-btn.selected[data-nota="5"] { background: var(--e5); border-color: var(--e5); }

    .na-btn {
      width: 100%; display: flex; align-items: center; justify-content: center; gap: 6px;
      padding: 6px 10px; border: 1.5px dashed var(--border); border-radius: 14px;
      background: transparent; font-family: inherit; font-size: 11px; font-weight: 600;
      color: var(--muted-fg); cursor: pointer; transition: all 0.15s;
    }
    .na-btn:hover { border-color: var(--muted-fg); }
    .na-btn.selected { background: var(--muted); color: var(--navy); border-color: rgba(101,115,134,.6); }
    .na-btn strong { font-weight: 700; }
    .na-btn .na-tail { opacity: 0.7; }
    .na-btn:disabled { cursor: default; }
    .locked-note { font-size: 11.5px; color: var(--muted-fg); font-style: italic; line-height: 1.4; padding: 2px 0 2px 0; }

    /* ==== FOCUS RINGS ==== */
    .emoji-btn:focus-visible, .na-btn:focus-visible, .chip:focus-visible, .btn:focus-visible {
      outline: none;
      box-shadow: 0 0 0 2px var(--card), 0 0 0 4px var(--ring);
    }

    /* ==== NAVIGATION ==== */
    .navigation { display: flex; gap: 12px; margin-top: 24px; justify-content: space-between; }
    .btn {
      padding: 13px 26px; border: none; border-radius: 14px; font-family: inherit;
      font-size: 14.5px; font-weight: 600; letter-spacing: -0.01em; cursor: pointer;
      transition: transform 0.25s var(--suave), background 0.2s ease, box-shadow 0.25s var(--suave), opacity 0.2s ease;
    }

    .btn-prev { background: transparent; border: 1px solid var(--border); box-shadow: var(--sombra-1); color: var(--navy); }
    .btn-prev:hover:not(:disabled) { background: var(--muted); }

    .btn-next, .btn-submit, .btn-confirm { background: var(--navy); color: #fff; flex: 1; }
    .btn-next:hover:not(:disabled), .btn-submit:hover:not(:disabled), .btn-confirm:hover:not(:disabled) { background: #0e1533; transform: translateY(-1px); box-shadow: var(--sombra-2); }
    .btn:active:not(:disabled) { transform: scale(0.98); transition-duration: 0.09s; }
    .btn:disabled { opacity: 0.4; cursor: not-allowed; }

    .footer-disclaimer { margin-top: 18px; font-size: 11px; color: var(--muted-fg); text-align: center; line-height: 1.5; }

    .success-message { text-align: center; padding: 40px; }
    .success-message .big-emoji { font-size: 60px; margin-bottom: 16px; animation: pop-in 0.6s var(--suave); }
    .success-message h2 { font-size: 28px; color: var(--navy); margin-bottom: 16px; font-weight: 700; letter-spacing: -0.022em; }
    .success-message p { font-size: 15px; color: var(--muted-fg); line-height: 1.6; }

    .already-done { text-align: center; padding: 40px; }
    .already-done h2 { font-size: 22px; color: var(--navy); margin-bottom: 12px; font-weight: 700; }
    .already-done p { font-size: 15px; color: var(--muted-fg); line-height: 1.6; }

    /* ==== MODALS ==== */
    .modal-overlay {
      position: fixed; inset: 0; background: rgba(21,30,73,0.45);
      -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px);
      display: flex; align-items: center; justify-content: center; padding: 20px; z-index: 50;
      animation: overlay-in 0.2s ease-out;
    }
    .modal-box {
      background: #fff; border-radius: 20px; max-width: 512px; width: 100%; padding: 28px;
      box-shadow: var(--sombra-alta);
      animation: modal-in 0.4s var(--suave);
    }
    .modal-box h3 { font-size: 19px; color: var(--navy); margin-bottom: 8px; font-weight: 600; letter-spacing: -0.018em; }
    .modal-subtitle { font-size: 13px; color: var(--muted-fg); margin-bottom: 18px; line-height: 1.5; }
    .modal-list { list-style: none; margin-bottom: 20px; }
    .modal-list li { font-size: 13px; color: #444; line-height: 1.5; margin-bottom: 12px; padding-left: 22px; position: relative; }
    .modal-list li::before { content: "✓"; position: absolute; left: 0; color: var(--success); font-weight: 700; }
    .modal-list li strong { color: var(--navy); display: block; }
    .modal-body-text { font-size: 13.5px; color: #555; line-height: 1.6; margin-bottom: 20px; }
    .modal-actions { display: flex; gap: 10px; }
    .modal-box:focus { outline: none; }

    @keyframes pop-in { from { opacity: 0; transform: scale(0.5); } to { opacity: 1; transform: scale(1); } }
    @keyframes scale-in { from { opacity: 0; transform: scale(0.9); } to { opacity: 1; transform: scale(1); } }
    @keyframes overlay-in { from { opacity: 0; } to { opacity: 1; } }
    @keyframes modal-in { from { opacity: 0; transform: scale(0.96) translateY(8px); } to { opacity: 1; transform: scale(1) translateY(0); } }

    @media (prefers-reduced-motion: reduce) {
      .emoji-btn, .emoji-btn span.em, .btn, .modal-box, .modal-overlay, .progress-fill, .area-row {
        animation: none !important; transition: none !important;
      }
      .emoji-btn:hover { transform: none; }
      .emoji-btn:hover span.em { transform: none; }
    }

    @media (min-width: 640px) {
      .emoji-btn span.em { font-size: 20px; }
    }

    @media (max-width: 640px) {
      .scale-labels { font-size: 10px; }
      .container { padding: 18px; }
      .survey-sticky { margin: -18px -18px 16px; padding: 12px 18px 10px; }
    }

    .hidden { display: none; }
  </style>
</head>
<body>
  <div class="topnav">
    <div class="topnav-inner">
      <img class="brand-logo-img" src="data:image/png;base64,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" alt="Capital Realty">
      <span class="brand-divider"></span>
      <div class="brand-sub2">Hub de Pesquisas RH</div>
    </div>
  </div>

  <div class="page">
    <div class="container">

      <!-- JÁ RESPONDEU (bloqueio local) -->
      <div id="stageAlreadyDone" class="already-done hidden">
        <h2>✅ Você já respondeu esta pesquisa</h2>
      </div>

      <div id="stageClosed" class="already-done hidden">
        <h2>🔒 Pesquisa encerrada</h2>
        <p style="margin-top:10px;font-size:14px;color:var(--muted-fg);line-height:1.6">
          O prazo terminou em <strong class="prazo-encerrado"></strong> e esta resposta
          não pôde ser registrada. Obrigado pelo interesse em participar.
        </p>
      </div>

      <!-- INTRO -->
      <div id="stageIntro" class="stage-intro">
        <h1>📊 Pesquisa RH 360º</h1>
        <div class="badges">
          <span class="badge badge-green" title="Impossível associar respostas a pessoas. Os resultados são sempre analisados de forma agregada, nunca individual.">🛡️ Pesquisa Anônima</span>
          <span class="badge badge-blue">🏢 Capital Realty</span>
          ${ENCERRAMENTO ? '<span class="badge badge-prazo" title="Depois deste horário o formulário não aceita mais respostas.">⏰ Responda até ' + encerramentoLegivel_() + '</span>' : ''}
        </div>

        <h2>Pesquisa de Satisfação Interdepartamental</h2>
        <p>Avalie as áreas com as quais você interage. Suas respostas são anônimas — não pedimos nome nem e-mail.</p>

        <div class="info-box">
          <div class="info-box-title">⚙️ COMO FUNCIONA</div>
          <ul>
            <li>Você escolhe sua área e, em seguida, <strong>com quais áreas teve interação</strong> — avalia apenas essas.</li>
            <li>Cada tela tem <strong>1 pergunta</strong>, respondida para todas as áreas que você selecionou.</li>
            <li>Selecione a opção que melhor representa sua experiência 😞 😕 😐 🙂 😄.</li>
            <li><strong>Autoavaliação:</strong> você também avalia a sua própria área, para comparar com a percepção das outras.</li>
            <li>São <strong>7 perguntas objetivas</strong> + <strong>2 comentários</strong> (opcionais na sua própria área).</li>
          </ul>
        </div>

        <div class="info-cards">
          <div class="info-card"><div class="label">Sua área</div><div class="value" id="cardSuaArea">—</div></div>
          <div class="info-card"><div class="label">Áreas a avaliar</div><div class="value">Você seleciona</div></div>
          <div class="info-card"><div class="label">Autoavaliação</div><div class="value">Sua área</div></div>
        </div>

        <div class="area-picker">
          <label>Qual é a sua área? *</label>
          <div class="chips" id="areaChips"></div>
        </div>

        <div class="navigation">
          <button class="btn btn-next" id="btnStart" onclick="goToAreas()" disabled>Continuar →</button>
        </div>
      </div>

      <!-- SELEÇÃO DE ÁREAS COM INTERAÇÃO -->
      <div id="stageAreas" class="stage-intro hidden">
        <h2>Com quais áreas você teve interação?</h2>
        <p>Selecione as áreas com as quais você <strong>interagiu no dia a dia</strong> — você vai avaliar apenas essas. A sua própria área (<span id="areasSuaArea" style="font-weight:600;">—</span>) já entra automaticamente para a autoavaliação.</p>

        <div class="area-picker">
          <div class="chips" id="interactionChips"></div>
        </div>

        <p id="interactionCount" style="font-size:12px; color: var(--muted-fg); margin-top:8px;"></p>

        <div class="navigation">
          <button class="btn btn-prev" onclick="backToIntro()">← Voltar</button>
          <button class="btn btn-next" id="btnStartSurvey" onclick="startSurvey()" disabled>Começar pesquisa →</button>
        </div>
      </div>

      <!-- SURVEY -->
      <div id="stageSurvey" class="hidden">
        <div class="survey-sticky">
          <div class="step-row">
            <span class="step-label" id="stepLabel"></span>
            <span class="step-pct" id="stepPct"></span>
          </div>
          <div class="progress-bar"><div class="progress-fill" id="progressFill"></div></div>
          <div class="section-row">
            <span class="section-label" id="sectionLabel"></span>
            <span class="answered-count" id="answeredCount"></span>
          </div>
          <div class="question-text" id="questionText"></div>
        </div>

        <div id="anonTipHolder" style="margin-top:14px;"></div>
        <div id="questionsContainer" style="margin-top:14px;"></div>

        <div class="navigation">
          <button class="btn btn-prev" id="btnPrev" onclick="previousStep()">← Anterior</button>
          <button class="btn btn-next" id="btnNext" onclick="nextStep()">Próximo →</button>
          <button class="btn btn-submit hidden" id="btnSubmit" onclick="openConfirmModal()">Enviar</button>
        </div>

        <div class="footer-disclaimer">🔒 Não coletamos seu nome nem seu e-mail. Sua área é registrada apenas para permitir a comparação entre a autoavaliação e a percepção das outras áreas.</div>
      </div>

      <!-- SUCCESS -->
      <div id="stageSuccess" class="success-message hidden">
        <div class="big-emoji">🎉</div>
        <h2>Obrigado por participar!</h2>
        <p>Suas avaliações foram registradas de forma anônima: não guardamos seu nome, seu e-mail nem o horário exato do envio.</p>
        <p style="margin-top: 16px; font-weight: 600; color: var(--navy);">Sua opinião ajuda a melhorar a colaboração entre as áreas. 💙</p>
      </div>
    </div>
  </div>

  <!-- MODAL DE ANONIMATO (uma vez por navegador) -->
  <div id="anonModal" class="modal-overlay hidden">
    <div class="modal-box" tabindex="-1" role="dialog" aria-modal="true" aria-labelledby="anonModalTitle">
      <h3 id="anonModalTitle">🔒 Sua resposta é anônima</h3>
      <p class="modal-subtitle">Antes de começar, entenda como protegemos sua identidade nesta pesquisa.</p>
      <ul class="modal-list">
        <li><strong>Não gravamos quem você é</strong>Não pedimos nome nem e-mail. Nada na sua resposta identifica você individualmente.</li>
        <li><strong>Anonimato por grupo</strong>Os resultados são sempre analisados de forma agregada por área — nunca de forma individual.</li>
        <li><strong>Comentários desvinculados de você</strong>Os textos são lidos pelo RH em ordem embaralhada, sem nenhuma ligação com quem escreveu.</li>
      </ul>
      <div class="modal-actions">
        <button class="btn btn-confirm" onclick="closeAnonModal()">Entendi, começar</button>
      </div>
    </div>
  </div>

  <!-- MODAL DE CONFIRMAÇÃO DE ENVIO -->
  <div id="confirmModal" class="modal-overlay hidden">
    <div class="modal-box" tabindex="-1" role="dialog" aria-modal="true" aria-labelledby="confirmModalTitle">
      <h3 id="confirmModalTitle">🔒 Enviar respostas?</h3>
      <p class="modal-body-text">Suas respostas serão gravadas anonimamente e não poderão ser alteradas depois. Não é possível identificar você a partir delas.</p>
      <div class="modal-actions">
        <button class="btn btn-prev" style="flex:1" onclick="closeConfirmModal()">Cancelar</button>
        <button class="btn btn-confirm" id="btnConfirmSubmit" onclick="confirmSubmit()">Confirmar envio 🔒</button>
      </div>
    </div>
  </div>

  <script>
    const AREAS = [
      "Planejamento & Gestão",
      "Administrativo/Secretárias",
      "Arquitetura",
      "Comercial/Marketing",
      "Deminvest",
      "Diretoria",
      "Engenharia",
      "Facilities",
      "Financeiro/Contábil",
      "Jurídico",
      "Propriedades",
      "Recursos Humanos",
      "Tecnologia da Informação"
    ];

    const QUESTIONS = [
      { type: "rating", secao: "Comunicação", texto: "Como você avalia a clareza da comunicação dessa área?", familia: "satisfacao" },
      { type: "rating", secao: "Comunicação", texto: "Como você avalia a cordialidade dessa área?", familia: "satisfacao" },
      { type: "rating", secao: "Agilidade (SLA)", texto: "Como você avalia a velocidade de resposta dessa área?", familia: "satisfacao" },
      { type: "rating", secao: "Agilidade (SLA)", texto: "Como você avalia o cumprimento dos prazos acordados por essa área?", familia: "satisfacao" },
      { type: "rating", secao: "Qualidade de entrega", texto: "Como você avalia a assertividade e a qualidade das soluções entregues por essa área?", familia: "satisfacao" },
      { type: "rating", secao: "Parceria e colaboração", texto: "O quanto você sente que essa área atua como uma parceira estratégica do seu setor?", familia: "concordancia" },
      { type: "rating", secao: "Grau de esforço", texto: "Esta área simplifica a resolução dos problemas ou solicitações do meu setor?", familia: "concordancia" },
      { type: "text", secao: "Comentários", texto: "O que esta área faz muito bem?", placeholder: "Ex.: a área é muito ágil e me responde sempre no mesmo dia." },
      { type: "text", secao: "Comentários", texto: "O que esta área poderia melhorar na interação com o seu setor?", placeholder: "Ex.: alinhar prazos antes de iniciar uma demanda nova." }
    ];

    const EMOJIS = ["😞", "😕", "😐", "🙂", "😄"];
    const LABELS_SAT = ["Muito insatisfeito", "Insatisfeito", "Neutro", "Satisfeito", "Muito satisfeito"];
    const MIN_CHARS = 3;

    // Impede responder duas vezes no MESMO navegador (evita reenvio acidental).
    // Volte para false se precisar testar o formulário várias vezes.
    const BLOQUEAR_REENVIO = true;

    const STORAGE_SEEN_KEY = 'anon_intro_seen_pesquisa_360';
    const STORAGE_DONE_KEY = 'submitted_pesquisa_360';
    const STORAGE_DRAFT_KEY = 'draft_pesquisa_360_v3';
    const ANON_TIP_HTML = '<div class="anon-tip">🛡️ <strong>Dica de anonimato:</strong> não inclua nomes, e-mails ou telefones. Os textos são lidos pelo RH em ordem embaralhada, sem ligação com quem escreveu.</div>';
    const USERCHECK_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#151E49" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><polyline points="16 11 18 13 22 9"/></svg>';

    let currentStep = 0;
    let suaArea = '';
    let interacted = [];        // áreas com as quais a pessoa teve interação (selecionadas)
    let orderedAreas = [];      // [suaArea, ...interacted (ordem alfabética)]
    const answers = {};

    function safeStorageGet(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
    function safeStorageSet(key, value) { try { localStorage.setItem(key, value); } catch (e) {} }
    function safeStorageRemove(key) { try { localStorage.removeItem(key); } catch (e) {} }

    function buildOrderedAreas() {
      const outras = interacted.slice().sort((a, b) => a.localeCompare(b, 'pt-BR'));
      return [suaArea, ...outras];
    }

    function saveDraft() {
      safeStorageSet(STORAGE_DRAFT_KEY, JSON.stringify({ suaArea: suaArea, interacted: interacted, currentStep: currentStep, answers: answers }));
    }
    function clearDraft() { safeStorageRemove(STORAGE_DRAFT_KEY); }
    function loadDraft() {
      const raw = safeStorageGet(STORAGE_DRAFT_KEY);
      if (!raw) return null;
      try { return JSON.parse(raw); } catch (e) { return null; }
    }

    // ==== Etapa 1: escolher a sua área ====
    const chipsContainer = document.getElementById('areaChips');
    AREAS.forEach(area => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip';
      chip.dataset.area = area;
      chip.textContent = area;
      chip.setAttribute('aria-pressed', 'false');
      chip.addEventListener('click', () => {
        document.querySelectorAll('#areaChips .chip').forEach(c => { c.classList.remove('selected'); c.setAttribute('aria-pressed', 'false'); });
        chip.classList.add('selected');
        chip.setAttribute('aria-pressed', 'true');
        suaArea = area;
        interacted = []; // troca de área → recomeça a seleção de interação
        document.getElementById('cardSuaArea').textContent = area;
        document.getElementById('btnStart').disabled = false;
      });
      chipsContainer.appendChild(chip);
    });

    // ==== Etapa 2: escolher as áreas com interação ====
    function updateInteractionUI() {
      document.getElementById('interactionCount').textContent = interacted.length + ' área(s) selecionada(s)';
      document.getElementById('btnStartSurvey').disabled = interacted.length === 0;
    }

    function goToAreas() {
      if (!suaArea) return;
      document.getElementById('areasSuaArea').textContent = suaArea;
      const cont = document.getElementById('interactionChips');
      cont.innerHTML = '';
      AREAS.filter(a => a !== suaArea).forEach(area => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'chip';
        chip.dataset.area = area;
        chip.textContent = area;
        const isSel = interacted.indexOf(area) !== -1;
        if (isSel) chip.classList.add('selected');
        chip.setAttribute('aria-pressed', isSel ? 'true' : 'false');
        chip.addEventListener('click', () => {
          const i = interacted.indexOf(area);
          if (i === -1) { interacted.push(area); chip.classList.add('selected'); chip.setAttribute('aria-pressed', 'true'); }
          else { interacted.splice(i, 1); chip.classList.remove('selected'); chip.setAttribute('aria-pressed', 'false'); }
          updateInteractionUI();
        });
        cont.appendChild(chip);
      });
      updateInteractionUI();
      document.getElementById('stageIntro').classList.add('hidden');
      document.getElementById('stageSurvey').classList.add('hidden');
      document.getElementById('stageAreas').classList.remove('hidden');
      window.scrollTo(0, 0);
    }

    function backToIntro() {
      document.getElementById('stageAreas').classList.add('hidden');
      document.getElementById('stageIntro').classList.remove('hidden');
      window.scrollTo(0, 0);
    }

    function updateProgress() {
      const progress = ((currentStep + 1) / QUESTIONS.length) * 100;
      document.getElementById('progressFill').style.width = progress + '%';
      document.getElementById('stepPct').textContent = Math.round(progress) + '%';
    }

    function isAreaAnswered(stepIdx, areaIdx) {
      const q = QUESTIONS[stepIdx];
      const key = stepIdx + '_' + areaIdx;
      if (q.type === 'rating') return !!answers[key];
      // Comentário: obrigatório, exceto na sua própria área (índice 0), onde é opcional
      if (areaIdx === 0) return true;
      return ((answers[key] || '').trim().length >= MIN_CHARS);
    }

    function updateAnsweredCount() {
      const answered = orderedAreas.filter((_, i) => isAreaAnswered(currentStep, i)).length;
      const el = document.getElementById('answeredCount');
      const complete = answered === orderedAreas.length;
      el.textContent = (complete ? '✓ ' : '') + answered + '/' + orderedAreas.length;
      el.classList.toggle('complete', complete);
    }

    function renderStep() {
      const q = QUESTIONS[currentStep];

      document.getElementById('stepLabel').textContent = 'Etapa ' + (currentStep + 1) + ' de ' + QUESTIONS.length;

      if (q.type === 'rating') {
        const ratingIdx = QUESTIONS.slice(0, currentStep + 1).filter(x => x.type === 'rating').length;
        const totalRating = QUESTIONS.filter(x => x.type === 'rating').length;
        document.getElementById('sectionLabel').textContent = q.secao + ' · Pergunta ' + ratingIdx + ' de ' + totalRating;
      } else {
        const textIdx = QUESTIONS.slice(0, currentStep + 1).filter(x => x.type === 'text').length;
        const totalText = QUESTIONS.filter(x => x.type === 'text').length;
        document.getElementById('sectionLabel').textContent = q.secao + ' · Comentário ' + textIdx + ' de ' + totalText;
      }

      document.getElementById('questionText').textContent = q.texto;
      document.getElementById('anonTipHolder').innerHTML = q.type === 'text' ? ANON_TIP_HTML : '';

      const container = document.getElementById('questionsContainer');
      container.innerHTML = '';

      const wrapper = document.createElement('div');
      wrapper.className = 'question-card';

      if (q.type === 'rating') {
        const labels = LABELS_SAT; // todas as perguntas usam a escala Muito insatisfeito → Muito satisfeito

        orderedAreas.forEach((area, areaIdx) => {
          const isSelf = areaIdx === 0;
          const key = currentStep + '_' + areaIdx;
          const answered = !!answers[key];
          const titleHtml = '<div class="area-row-title">' + (isSelf ? USERCHECK_SVG : '') + area
            + (isSelf ? '<span class="self-badge">Sua área</span>' : '')
            + (answered ? '<span class="check-ok">✓</span>' : '') + '</div>';

          const row = document.createElement('div');
          row.className = 'area-row' + (isSelf ? ' self' : '') + (answered ? ' answered' : '');
          row.innerHTML = titleHtml + \`
            <div class="scale-labels"><span class="lo">😞 \${labels[0]}</span><span class="hi">\${labels[4]} 😄</span></div>
            <div class="rating-group" data-key="\${key}">
              \${EMOJIS.map((emoji, i) => \`
                <button type="button" class="emoji-btn" data-value="\${i + 1}" data-nota="\${i + 1}" data-key="\${key}" aria-label="Nota \${i + 1} de 5 — \${labels[i]}" aria-pressed="false"><span class="em">\${emoji}</span><span class="num">\${i + 1}</span></button>
              \`).join('')}
            </div>\`;
          wrapper.appendChild(row);
        });

        container.appendChild(wrapper);

        wrapper.querySelectorAll('.emoji-btn').forEach(btn => {
          const key = btn.dataset.key;
          const value = btn.dataset.value;
          if (answers[key] === value) { btn.classList.add('selected'); btn.setAttribute('aria-pressed', 'true'); }
          btn.addEventListener('click', (e) => {
            e.preventDefault();
            document.querySelectorAll('[data-key="' + key + '"]').forEach(b => {
              if (b.classList.contains('emoji-btn')) { b.classList.remove('selected'); b.setAttribute('aria-pressed', 'false'); }
            });
            btn.classList.add('selected');
            btn.setAttribute('aria-pressed', 'true');
            answers[key] = value;
            const row = btn.closest('.area-row');
            if (row) {
              row.classList.add('answered');
              const title = row.querySelector('.area-row-title');
              if (title && !title.querySelector('.check-ok')) {
                const chk = document.createElement('span');
                chk.className = 'check-ok';
                chk.textContent = '✓';
                title.appendChild(chk);
              }
            }
            updateAnsweredCount();
            updateNextButtonState();
            saveDraft();
          });
        });
      } else {
        orderedAreas.forEach((area, areaIdx) => {
          const isSelf = areaIdx === 0;
          const key = currentStep + '_' + areaIdx;
          const currentVal = answers[key] || '';
          const optional = isSelf; // comentário da própria área é opcional

          const counterHtml = optional
            ? '<div class="char-counter" data-counter-for="' + key + '">Opcional (sua área)</div>'
            : '<div class="char-counter" data-counter-for="' + key + '">' + currentVal.trim().length + ' / ' + MIN_CHARS + ' mín.</div>';

          const row = document.createElement('div');
          row.className = 'area-row' + (isSelf ? ' self' : '');
          row.innerHTML = \`
            <div class="area-row-title">\${isSelf ? USERCHECK_SVG : ''}\${area}\${isSelf ? '<span class="self-badge">Sua área</span>' : ''}</div>
            <textarea data-key="\${key}" data-optional="\${optional ? '1' : '0'}" placeholder="\${optional ? 'Comentário opcional' : q.placeholder}">\${currentVal}</textarea>
          \` + counterHtml;
          wrapper.appendChild(row);
        });

        container.appendChild(wrapper);

        wrapper.querySelectorAll('textarea[data-key]').forEach(ta => {
          const key = ta.dataset.key;
          if (ta.dataset.optional !== '1') updateCharCounter(key, ta.value);
          ta.addEventListener('input', () => {
            answers[key] = ta.value;
            if (ta.dataset.optional !== '1') updateCharCounter(key, ta.value);
            updateAnsweredCount();
            updateNextButtonState();
            saveDraft();
          });
        });
      }

      const isLast = currentStep === QUESTIONS.length - 1;
      document.getElementById('btnPrev').disabled = false; // sempre permite voltar (na 1ª pergunta volta à seleção de áreas)
      document.getElementById('btnNext').classList.toggle('hidden', isLast);
      document.getElementById('btnSubmit').classList.toggle('hidden', !isLast);

      updateAnsweredCount();
      updateNextButtonState();
      updateProgress();
    }

    function updateCharCounter(key, value) {
      const el = document.querySelector('[data-counter-for="' + key + '"]');
      if (!el) return;
      const len = value.trim().length;
      el.textContent = len + ' / ' + MIN_CHARS + ' mín.';
      el.classList.toggle('ok', len >= MIN_CHARS);
    }

    function stepIsComplete(stepIdx) {
      return orderedAreas.every((_, i) => isAreaAnswered(stepIdx, i));
    }

    function updateNextButtonState() {
      const complete = stepIsComplete(currentStep);
      document.getElementById('btnNext').disabled = !complete;
      document.getElementById('btnSubmit').disabled = !complete;
    }

    function startSurvey() {
      if (!suaArea || interacted.length === 0) return;
      orderedAreas = buildOrderedAreas();
      currentStep = 0;
      document.getElementById('stageIntro').classList.add('hidden');
      document.getElementById('stageAreas').classList.add('hidden');
      document.getElementById('stageSurvey').classList.remove('hidden');
      renderStep();
      saveDraft();
      window.scrollTo(0, 0);
    }

    function nextStep() {
      if (!stepIsComplete(currentStep)) { alert('Por favor, responda para todas as áreas antes de continuar'); return; }
      if (currentStep < QUESTIONS.length - 1) {
        currentStep++;
        renderStep();
        saveDraft();
        window.scrollTo(0, 0);
      }
    }

    function previousStep() {
      if (currentStep === 0) {
        // Da 1ª pergunta, volta para a seleção de áreas com interação
        goToAreas();
        return;
      }
      currentStep--;
      renderStep();
      saveDraft();
      window.scrollTo(0, 0);
    }

    function openConfirmModal() {
      if (!stepIsComplete(currentStep)) { alert('Por favor, responda para todas as áreas antes de enviar'); return; }
      openModal('confirmModal');
    }
    function closeConfirmModal() { closeModal('confirmModal'); }

    function confirmSubmit() {
      const btn = document.getElementById('btnConfirmSubmit');
      btn.disabled = true;
      btn.textContent = 'Enviando...';

      const avaliacoes = orderedAreas.map((area, areaIdx) => {
        const respostas = {};
        const abertas = {};
        QUESTIONS.forEach((q, qIdx) => {
          const val = answers[qIdx + '_' + areaIdx];
          if (q.type === 'rating') { respostas['q' + qIdx] = val || 'na'; }
          else { abertas['q' + qIdx] = (val || '').trim(); }
        });
        return { area_avaliada: area, is_autoavaliacao: areaIdx === 0, respostas: respostas, abertas: abertas };
      });

      const data = { pesquisa_id: 'pesquisa_360', avaliacoes: avaliacoes, timestamp: new Date().toISOString() };

      google.script.run.withSuccessHandler((r) => {
        // O servidor devolve {success:false} quando recusa — sem checar isto,
        // uma resposta rejeitada mostraria a tela de "obrigado" mesmo assim.
        if (r && r.success === false) {
          btn.disabled = false;
          btn.textContent = 'Confirmar envio 🔒';
          closeModal('confirmModal');
          if (r.encerrada) {
            document.getElementById('stageSurvey').classList.add('hidden');
            document.getElementById('stageIntro').classList.add('hidden');
            const tela = document.getElementById('stageClosed');
            tela.querySelector('.prazo-encerrado').textContent = r.prazo || '';
            tela.classList.remove('hidden');
            clearDraft();
            window.scrollTo(0, 0);
          } else {
            alert('Não foi possível salvar: ' + (r.error || 'erro desconhecido'));
          }
          return;
        }
        if (BLOQUEAR_REENVIO) safeStorageSet(STORAGE_DONE_KEY, '1');
        clearDraft();
        closeModal('confirmModal');
        document.getElementById('stageSurvey').classList.add('hidden');
        document.getElementById('stageSuccess').classList.remove('hidden');
        window.scrollTo(0, 0);
      }).withFailureHandler((error) => {
        console.error('Erro:', error);
        btn.disabled = false;
        btn.textContent = 'Confirmar envio 🔒';
        alert('Erro ao salvar: ' + error);
      }).submitForm(data);
    }

    function closeAnonModal() {
      safeStorageSet(STORAGE_SEEN_KEY, '1');
      closeModal('anonModal');
    }

    // ==== MODAIS: abertura/fechamento com Esc e foco ====
    let activeModal = null;
    function openModal(id) {
      const m = document.getElementById(id);
      m.classList.remove('hidden');
      activeModal = m;
      // Foca a caixa (não um botão) para não desenhar anel de foco em quem abriu com o mouse.
      // O leitor de tela ainda entra no modal e o Tab continua preso dentro dele.
      const caixa = m.querySelector('.modal-box');
      if (caixa) caixa.focus();
    }
    function closeModal(id) {
      document.getElementById(id).classList.add('hidden');
      activeModal = null;
    }
    document.addEventListener('keydown', (e) => {
      if (!activeModal) return;
      if (e.key === 'Escape') {
        // não deixa fechar o modal de anonimato sem confirmar? Lovable permite fechar; aqui só o de confirmação.
        if (activeModal.id === 'confirmModal') closeConfirmModal();
        return;
      }
      if (e.key === 'Tab') {
        const f = Array.prototype.slice.call(activeModal.querySelectorAll('button, textarea, [href], input, select'));
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });

    // ==== Inicialização ====
    (function init() {
      if (BLOQUEAR_REENVIO) {
        if (safeStorageGet(STORAGE_DONE_KEY)) {
          document.getElementById('stageIntro').classList.add('hidden');
          document.getElementById('stageAlreadyDone').classList.remove('hidden');
          return;
        }
      } else {
        // Modo teste: apaga marca de envios anteriores para não travar depois
        safeStorageRemove(STORAGE_DONE_KEY);
      }
      const draft = loadDraft();
      if (draft && draft.suaArea && AREAS.indexOf(draft.suaArea) !== -1 && Array.isArray(draft.interacted) && draft.interacted.length > 0) {
        suaArea = draft.suaArea;
        interacted = draft.interacted.filter(a => AREAS.indexOf(a) !== -1 && a !== suaArea);
        orderedAreas = buildOrderedAreas();
        if (draft.answers) Object.keys(draft.answers).forEach(k => { answers[k] = draft.answers[k]; });
        currentStep = Math.min(Math.max(draft.currentStep || 0, 0), QUESTIONS.length - 1);
        document.getElementById('stageIntro').classList.add('hidden');
        document.getElementById('stageSurvey').classList.remove('hidden');
        renderStep();
        return;
      }
      if (!safeStorageGet(STORAGE_SEEN_KEY)) {
        openModal('anonModal');
      }
    })();
  </script>
</body>
</html>
  `;
}

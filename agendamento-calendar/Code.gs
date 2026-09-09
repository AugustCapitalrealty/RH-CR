/**
 * ============================================================================
 * RH Capital Realty — Sistema de Inscrição para Devolutivas da Pesquisa RH
 * ============================================================================
 * 
 * Regras de Negócio:
 * - 13 Áreas avaliadas na pesquisa.
 * - Capacidade máxima da sala: 12 pessoas por sessão.
 * - Primeiros 12 inscritos: Vaga Confirmada + convite automático no Google Calendar.
 * - A partir do 13º: Inscrição na Lista de Espera (para formação de 2ª turma).
 * - Banco de dados em Google Sheets e sincronização com Google Calendar.
 */

// ID da Planilha do Google Sheets (deixe vazio '' para criar uma nova automaticamente ao inicializar)
const ID_PLANILHA = '';

// Limite de pessoas por sessão (capacidade da sala)
const LIMITE_VAGAS_PADRAO = 12;

// ID da Agenda do Google Calendar ('primary' para agenda principal da conta ou e-mail de agenda compartilhada)
const ID_AGENDA = 'primary';

// Lista das 13 Áreas da Capital Realty
const AREAS_EMPRESA = [
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

// ============================================================================
// 1. ROTAS E WEB APP
// ============================================================================

function doGet(e) {
  return HtmlService.createHtmlOutput(getHtmlInterface())
    .setTitle('Devolutivas Pesquisa RH — Inscrições')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// ============================================================================
// 2. BANCO DE DADOS (GOOGLE SHEETS)
// ============================================================================

/**
 * Retorna a planilha ativa de banco de dados
 */
function getPlanilhaDB() {
  let id = ID_PLANILHA;
  if (!id) {
    id = PropertiesService.getScriptProperties().getProperty('ID_PLANILHA');
  }
  if (!id) {
    throw new Error('A planilha ainda não foi configurada. Execute a função "inicializarSistema()" no Apps Script primeiro.');
  }
  return SpreadsheetApp.openById(id);
}

/**
 * Cria a planilha e as abas iniciais se ainda não existirem
 */
function inicializarSistema() {
  let ss;
  let id = ID_PLANILHA || PropertiesService.getScriptProperties().getProperty('ID_PLANILHA');

  if (id) {
    ss = SpreadsheetApp.openById(id);
  } else {
    ss = SpreadsheetApp.create('RH Capital Realty — Gestão de Devolutivas');
    PropertiesService.getScriptProperties().setProperty('ID_PLANILHA', ss.getId());
    Logger.log('Nova planilha criada com sucesso!');
    Logger.log('URL: ' + ss.getUrl());
    Logger.log('ID: ' + ss.getId());
  }

  // 1. Aba Sessoes
  let abaSessoes = ss.getSheetByName('Sessoes');
  if (!abaSessoes) {
    abaSessoes = ss.insertSheet('Sessoes');
    abaSessoes.getRange('A1:J1').setValues([[
      'ID_Sessao',
      'Area',
      'Data (DD/MM/AAAA)',
      'Horario_Inicio',
      'Horario_Fim',
      'Local',
      'Limite_Vagas',
      'Inscritos_Confirmados',
      'Fila_Espera',
      'ID_Evento_Calendar'
    ]]).setFontWeight('bold').setBackground('#1e3a8a').setFontColor('#ffffff');

    // Popula as 13 áreas como sessões iniciais
    const dadosIniciais = AREAS_EMPRESA.map((area, index) => [
      'SES-' + String(index + 1).padStart(2, '0'),
      area,
      '',         // Data a preencher pelo RH
      '10:00',    // Horário padrão
      '11:00',
      'Sala de Reunião Principal (Presencial)',
      LIMITE_VAGAS_PADRAO,
      0,          // Inscritos iniciais
      0,          // Espera inicial
      ''          // ID do evento Calendar
    ]);

    abaSessoes.getRange(2, 1, dadosIniciais.length, 10).setValues(dadosIniciais);
    abaSessoes.autoResizeColumns(1, 10);
  }

  // 2. Aba Inscricoes
  let abaInscricoes = ss.getSheetByName('Inscricoes');
  if (!abaInscricoes) {
    abaInscricoes = ss.insertSheet('Inscricoes');
    abaInscricoes.getRange('A1:G1').setValues([[
      'Data_Hora_Inscricao',
      'ID_Sessao',
      'Area_Sessao',
      'Nome_Colaborador',
      'Email_Colaborador',
      'Departamento_Colaborador',
      'Status_Inscricao'
    ]]).setFontWeight('bold').setBackground('#1e3a8a').setFontColor('#ffffff');
    abaInscricoes.autoResizeColumns(1, 7);
  }

  // Remove aba padrão se existir
  const abaPadrao = ss.getSheetByName('Página1') || ss.getSheetByName('Sheet1');
  if (abaPadrao && ss.getSheets().length > 1) {
    try { ss.deleteSheet(abaPadrao); } catch (e) {}
  }

  return { sucesso: true, url: ss.getUrl(), id: ss.getId() };
}

// ============================================================================
// 3. CONSULTA DE SESSÕES (FRONTEND)
// ============================================================================

/**
 * Retorna todas as sessões para exibição no formulário
 */
function obterSessoes() {
  try {
    const ss = getPlanilhaDB();
    const abaSessoes = ss.getSheetByName('Sessoes');
    if (!abaSessoes) throw new Error('Aba "Sessoes" não encontrada.');

    const valores = abaSessoes.getDataRange().getValues();
    if (valores.length <= 1) return { sucesso: true, sessoes: [] };

    const sessoes = [];
    for (let i = 1; i < valores.length; i++) {
      const row = valores[i];
      const idSessao = String(row[0]);
      const area = String(row[1]);
      let dataStr = row[2] ? Utilities.formatDate(new Date(row[2]), Session.getScriptTimeZone(), 'dd/MM/yyyy') : '';
      if (!dataStr && typeof row[2] === 'string') dataStr = row[2];

      const horaInicio = row[3] ? (row[3] instanceof Date ? Utilities.formatDate(row[3], Session.getScriptTimeZone(), 'HH:mm') : String(row[3])) : '';
      const horaFim = row[4] ? (row[4] instanceof Date ? Utilities.formatDate(row[4], Session.getScriptTimeZone(), 'HH:mm') : String(row[4])) : '';
      const local = String(row[5] || 'Sala de Reunião');
      const limite = Number(row[6]) || LIMITE_VAGAS_PADRAO;
      const confirmados = Number(row[7]) || 0;
      const espera = Number(row[8]) || 0;
      const idEvento = String(row[9] || '');

      const vagasRestantes = Math.max(0, limite - confirmados);
      const lotado = confirmados >= limite;

      sessoes.push({
        idSessao: idSessao,
        area: area,
        data: dataStr,
        horario: horaInicio ? (horaInicio + (horaFim ? ' às ' + horaFim : '')) : 'A definir pelo RH',
        local: local,
        limite: limite,
        confirmados: confirmados,
        espera: espera,
        vagasRestantes: vagasRestantes,
        lotado: lotado,
        temEventoCalendar: Boolean(idEvento)
      });
    }

    return { sucesso: true, sessoes: sessoes, areasDisponiveis: AREAS_EMPRESA };
  } catch (err) {
    return { sucesso: false, erro: err.message };
  }
}

// ============================================================================
// 4. PROCESSAMENTO DE INSCRIÇÃO
// ============================================================================

/**
 * Processa a inscrição do colaborador
 */
function realizarInscricao(dados) {
  try {
    // dados = { idSessao, nome, email, departamento }
    if (!dados.idSessao || !dados.nome || !dados.email) {
      throw new Error('Preencha todos os campos obrigatórios.');
    }

    const emailLimpo = dados.email.trim().toLowerCase();
    const nomeLimpo = dados.nome.trim();
    const deptoLimpo = dados.departamento || '-';

    const ss = getPlanilhaDB();
    const abaSessoes = ss.getSheetByName('Sessoes');
    const abaInscricoes = ss.getSheetByName('Inscricoes');

    const sessoesDados = abaSessoes.getDataRange().getValues();
    let linhaSessao = -1;
    let sessaoEncontrada = null;

    for (let i = 1; i < sessoesDados.length; i++) {
      if (String(sessoesDados[i][0]) === dados.idSessao) {
        linhaSessao = i + 1;
        sessaoEncontrada = {
          idSessao: sessoesDados[i][0],
          area: sessoesDados[i][1],
          limite: Number(sessoesDados[i][6]) || LIMITE_VAGAS_PADRAO,
          confirmados: Number(sessoesDados[i][7]) || 0,
          espera: Number(sessoesDados[i][8]) || 0,
          idEvento: String(sessoesDados[i][9] || '')
        };
        break;
      }
    }

    if (!sessaoEncontrada) {
      throw new Error('Sessão informada não foi encontrada.');
    }

    // Verifica duplicidade de inscrição (mesmo e-mail na mesma sessão)
    const inscricoesDados = abaInscricoes.getDataRange().getValues();
    for (let j = 1; j < inscricoesDados.length; j++) {
      const sessaoCadastrada = String(inscricoesDados[j][1]);
      const emailCadastrado = String(inscricoesDados[j][4]).trim().toLowerCase();
      if (sessaoCadastrada === dados.idSessao && emailCadastrado === emailLimpo) {
        throw new Error('Você já possui uma inscrição realizada para esta sessão!');
      }
    }

    const agora = new Date();
    const carimbo = Utilities.formatDate(agora, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss');
    let statusFinal = '';
    let ehConfirmado = false;

    if (sessaoEncontrada.confirmados < sessaoEncontrada.limite) {
      // Vaga garantida (até 12 pessoas)
      ehConfirmado = true;
      const numVaga = sessaoEncontrada.confirmados + 1;
      statusFinal = 'Confirmado (Vaga ' + numVaga + '/' + sessaoEncontrada.limite + ')';

      // Atualiza contador na aba Sessoes
      abaSessoes.getRange(linhaSessao, 8).setValue(numVaga);

      // Se houver evento do Google Calendar vinculado, adiciona como convidado
      if (sessaoEncontrada.idEvento) {
        try {
          const agenda = CalendarApp.getCalendarById(ID_AGENDA);
          const evento = agenda.getEventById(sessaoEncontrada.idEvento);
          if (evento) {
            evento.addGuest(emailLimpo);
          }
        } catch (eCal) {
          Logger.log('Erro ao adicionar convidado no Calendar: ' + eCal.message);
        }
      }
    } else {
      // Lista de espera (13º em diante)
      ehConfirmado = false;
      const numEspera = sessaoEncontrada.espera + 1;
      statusFinal = 'Lista de Espera (Posição ' + numEspera + ')';

      // Atualiza contador na aba Sessoes
      abaSessoes.getRange(linhaSessao, 9).setValue(numEspera);
    }

    // Registra na aba de Inscrições
    abaInscricoes.appendRow([
      carimbo,
      sessaoEncontrada.idSessao,
      sessaoEncontrada.area,
      nomeLimpo,
      emailLimpo,
      deptoLimpo,
      statusFinal
    ]);

    return {
      sucesso: true,
      confirmado: ehConfirmado,
      area: sessaoEncontrada.area,
      status: statusFinal,
      mensagem: ehConfirmado
        ? '🎉 Inscrição confirmada com sucesso! Sua vaga está garantida (limite de 12 pessoas).'
        : '⚠️ A sala atingiu o limite de 12 vagas. Sua inscrição foi registrada com prioridade na LISTA DE ESPERA para a 2ª turma!'
    };
  } catch (err) {
    return { sucesso: false, erro: err.message };
  }
}

// ============================================================================
// 5. SINCRONIZAÇÃO COM GOOGLE CALENDAR
// ============================================================================

/**
 * Cria os eventos na Google Agenda com base nas datas preenchidas na planilha
 */
function sincronizarComCalendar() {
  const ss = getPlanilhaDB();
  const abaSessoes = ss.getSheetByName('Sessoes');
  const dados = abaSessoes.getDataRange().getValues();
  const agenda = CalendarApp.getCalendarById(ID_AGENDA);

  let criados = 0;

  for (let i = 1; i < dados.length; i++) {
    const row = dados[i];
    const area = row[1];
    const dataVal = row[2];
    const horaIniVal = row[3];
    const horaFimVal = row[4];
    const local = row[5] || 'Sala de Reunião';
    let idEvento = row[9];

    // Só cria se tiver data preenchida e ainda não tiver ID de evento
    if (dataVal && !idEvento) {
      try {
        const d = new Date(dataVal);
        let horaIni = 10, minIni = 0, horaFim = 11, minFim = 0;

        if (horaIniVal) {
          const partes = String(horaIniVal).split(':');
          if (partes.length >= 2) { horaIni = parseInt(partes[0], 10); minIni = parseInt(partes[1], 10); }
        }
        if (horaFimVal) {
          const partesFim = String(horaFimVal).split(':');
          if (partesFim.length >= 2) { horaFim = parseInt(partesFim[0], 10); minFim = parseInt(partesFim[1], 10); }
        }

        const dataInicio = new Date(d.getFullYear(), d.getMonth(), d.getDate(), horaIni, minIni, 0);
        const dataTermino = new Date(d.getFullYear(), d.getMonth(), d.getDate(), horaFim, minFim, 0);

        const titulo = '📊 Devolutiva Pesquisa RH — ' + area;
        const descricao = 'Apresentação aberta dos resultados da Pesquisa de Clima / RH para a área: ' + area + '.\n\nCapacidade máxima da sala: ' + LIMITE_VAGAS_PADRAO + ' pessoas.';

        const evento = agenda.createEvent(titulo, dataInicio, dataTermino, {
          location: local,
          description: descricao,
          sendInvites: true
        });

        abaSessoes.getRange(i + 1, 10).setValue(evento.getId());
        criados++;
      } catch (err) {
        Logger.log('Erro ao criar evento para ' + area + ': ' + err.message);
      }
    }
  }

  return 'Sincronização concluída! ' + criados + ' novo(s) evento(s) criado(s) no Calendar.';
}

// ============================================================================
// 6. INTERFACE HTML (FRONTEND RESPONSIVO)
// ============================================================================

function getHtmlInterface() {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Inscrições — Devolutivas Pesquisa RH</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
  <style>
    :root {
      --cr-blue: #0f2b5c;
      --cr-blue-light: #1e3a8a;
      --cr-accent: #2563eb;
    }
    body {
      background-color: #f1f5f9;
      font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
      color: #1e293b;
    }
    .hero-banner {
      background: linear-gradient(135deg, var(--cr-blue), var(--cr-blue-light));
      color: white;
      padding: 40px 20px;
      border-radius: 0 0 24px 24px;
      box-shadow: 0 10px 25px rgba(15, 43, 92, 0.15);
      margin-bottom: 30px;
    }
    .card-sessao {
      border: none;
      border-radius: 16px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.05);
      transition: all 0.25s ease;
      background: #ffffff;
      height: 100%;
      display: flex;
      flex-direction: column;
    }
    .card-sessao:hover {
      transform: translateY(-4px);
      box-shadow: 0 12px 24px rgba(0,0,0,0.08);
    }
    .card-body {
      display: flex;
      flex-direction: column;
      flex: 1;
    }
    .badge-vaga {
      font-size: 0.85rem;
      padding: 6px 12px;
      border-radius: 20px;
      font-weight: 600;
    }
    .btn-inscrever {
      border-radius: 10px;
      font-weight: 600;
      padding: 10px;
    }
  </style>
</head>
<body>

  <!-- Top Hero -->
  <div class="hero-banner text-center">
    <div class="container" style="max-width: 800px;">
      <span class="badge bg-light text-primary px-3 py-2 rounded-pill fw-bold mb-3">
        <i class="fa-solid fa-users me-1"></i> RH Capital Realty
      </span>
      <h2 class="fw-bold mb-2">Devolutivas Abertas — Pesquisa RH 360</h2>
      <p class="lead opacity-90 mb-0" style="font-size: 1.05rem;">
        Participe da apresentação de resultados das áreas. <br>
        <span class="fw-bold text-warning"><i class="fa-solid fa-triangle-exclamation me-1"></i> Capacidade limitada a 12 pessoas por sessão</span> (ordem de inscrição).
      </p>
    </div>
  </div>

  <!-- Content Container -->
  <div class="container mb-5">

    <div class="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-2">
      <div>
        <h4 class="fw-bold mb-1"><i class="fa-regular fa-calendar-check text-primary me-2"></i>Escolha uma Área</h4>
        <p class="text-muted mb-0 small">As primeiras 12 pessoas garantem vaga na sala. Inscrições excedentes entram na lista de espera para a 2ª turma.</p>
      </div>
      <button class="btn btn-outline-secondary btn-sm rounded-pill" onclick="carregarSessoes()">
        <i class="fa-solid fa-arrows-rotate me-1"></i> Atualizar Vagas
      </button>
    </div>

    <!-- Loading State -->
    <div id="loadingBox" class="text-center py-5">
      <div class="spinner-border text-primary" role="status"></div>
      <p class="text-muted mt-2">Carregando sessões disponíveis...</p>
    </div>

    <!-- Cards Grid -->
    <div id="cardsGrid" class="row g-4" style="display: none;"></div>

  </div>

  <!-- Modal de Inscrição -->
  <div class="modal fade" id="modalInscricao" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content border-0 shadow-lg" style="border-radius: 16px;">
        <div class="modal-header border-0 bg-light" style="border-radius: 16px 16px 0 0;">
          <div>
            <h5 class="modal-title fw-bold text-primary" id="modalAreaTitulo">Inscrição</h5>
            <div class="text-muted small" id="modalInfoData">Data e horário</div>
          </div>
          <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
        </div>
        <div class="modal-body p-4">
          <div id="modalAvisoStatus" class="alert mb-3 small py-2"></div>
          
          <form id="formInscricao" onsubmit="submeterInscricao(event)">
            <input type="hidden" id="modalIdSessao">
            <div class="mb-3">
              <label class="form-label fw-bold small">Nome Completo *</label>
              <input type="text" id="inputNome" class="form-control" required placeholder="Digite seu nome">
            </div>
            <div class="mb-3">
              <label class="form-label fw-bold small">E-mail Corporativo *</label>
              <input type="email" id="inputEmail" class="form-control" required placeholder="seu.email@capitalrealty.com.br">
            </div>
            <div class="mb-3">
              <label class="form-label fw-bold small">Seu Departamento *</label>
              <select id="selectDepto" class="form-select" required>
                <option value="">Selecione sua área...</option>
              </select>
            </div>
            <div class="d-grid mt-4">
              <button type="submit" class="btn btn-primary btn-inscrever" id="btnConfirmar">
                Confirmar Inscrição
              </button>
            </div>
          </form>

          <div id="modalResultado" class="text-center py-3" style="display: none;"></div>
        </div>
      </div>
    </div>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
  <script>
    let sessoesCache = [];
    let modalInstance = null;

    window.onload = function() {
      modalInstance = new bootstrap.Modal(document.getElementById('modalInscricao'));
      carregarSessoes();
    };

    function carregarSessoes() {
      document.getElementById('loadingBox').style.display = 'block';
      document.getElementById('cardsGrid').style.display = 'none';

      google.script.run
        .withSuccessHandler(function(res) {
          document.getElementById('loadingBox').style.display = 'none';
          if (!res.sucesso) {
            alert('Erro ao carregar: ' + res.erro);
            return;
          }
          sessoesCache = res.sessoes;
          popularSelectDepartamentos(res.areasDisponiveis);
          renderizarCards(res.sessoes);
        })
        .withFailureHandler(function(err) {
          document.getElementById('loadingBox').style.display = 'none';
          alert('Erro de conexão: ' + err.message);
        })
        .obterSessoes();
    }

    function popularSelectDepartamentos(areas) {
      const select = document.getElementById('selectDepto');
      select.innerHTML = '<option value="">Selecione sua área...</option>';
      if (!areas) return;
      areas.forEach(function(a) {
        const opt = document.createElement('option');
        opt.value = a;
        opt.innerText = a;
        select.appendChild(opt);
      });
    }

    function renderizarCards(sessoes) {
      const grid = document.getElementById('cardsGrid');
      grid.innerHTML = '';

      if (!sessoes.length) {
        grid.innerHTML = '<div class="col-12 text-center text-muted py-5">Nenhuma sessão encontrada.</div>';
        grid.style.display = 'flex';
        return;
      }

      sessoes.forEach(function(s) {
        let badgeHtml = '';
        let btnText = '';
        let btnClass = '';

        if (!s.lotado) {
          const restantes = s.vagasRestantes;
          if (restantes <= 3) {
            badgeHtml = '<span class="badge bg-warning text-dark badge-vaga"><i class="fa-solid fa-clock me-1"></i>Últimas ' + restantes + ' vagas!</span>';
          } else {
            badgeHtml = '<span class="badge bg-success badge-vaga"><i class="fa-solid fa-circle-check me-1"></i>' + restantes + ' vagas livres</span>';
          }
          btnText = 'Garantir Minha Vaga';
          btnClass = 'btn-primary';
        } else {
          badgeHtml = '<span class="badge bg-secondary badge-vaga"><i class="fa-solid fa-user-group me-1"></i>Sala Lotada (12/12)</span>';
          btnText = 'Entrar na Lista de Espera';
          btnClass = 'btn-outline-warning text-dark fw-bold';
        }

        const dataFormatada = s.data ? ('📅 ' + s.data + ' — ⏰ ' + s.horario) : '📅 Data e horário a definir pelo RH';

        const col = document.createElement('div');
        col.className = 'col-md-6 col-lg-4';
        col.innerHTML = \`
          <div class="card card-sessao">
            <div class="card-body p-4">
              <div class="d-flex justify-content-between align-items-start mb-3">
                <h5 class="fw-bold mb-0 text-dark">\${s.area}</h5>
              </div>
              <div class="mb-3 text-muted small">
                \${dataFormatada} <br>
                <i class="fa-solid fa-location-dot text-danger me-1"></i> \${s.local}
              </div>
              <div class="d-flex align-items-center justify-content-between mb-4">
                \${badgeHtml}
                <small class="text-muted">\${s.confirmados}/\${s.limite} inscritos</small>
              </div>
              <div class="mt-auto">
                <button class="btn \${btnClass} w-100 btn-inscrever" onclick="abrirModalInscricao('\${s.idSessao}')">
                  \${btnText}
                </button>
              </div>
            </div>
          </div>
        \`;
        grid.appendChild(col);
      });

      grid.style.display = 'flex';
    }

    function abrirModalInscricao(idSessao) {
      const sessao = sessoesCache.find(s => s.idSessao === idSessao);
      if (!sessao) return;

      document.getElementById('modalIdSessao').value = sessao.idSessao;
      document.getElementById('modalAreaTitulo').innerText = 'Devolutiva: ' + sessao.area;
      document.getElementById('modalInfoData').innerText = sessao.data ? (sessao.data + ' às ' + sessao.horario) : 'Data em definição pelo RH';

      const aviso = document.getElementById('modalAvisoStatus');
      if (!sessao.lotado) {
        aviso.className = 'alert alert-success small py-2';
        aviso.innerHTML = '<i class="fa-solid fa-circle-check me-1"></i> Vaga presencial disponível (Restam ' + sessao.vagasRestantes + ' de 12 vagas).';
      } else {
        aviso.className = 'alert alert-warning small py-2 text-dark';
        aviso.innerHTML = '<i class="fa-solid fa-info-circle me-1"></i> A sala atingiu 12 pessoas. Você entrará na <b>Lista de Espera</b> para a 2ª turma!';
      }

      document.getElementById('formInscricao').style.display = 'block';
      document.getElementById('modalResultado').style.display = 'none';
      document.getElementById('btnConfirmar').disabled = false;
      document.getElementById('btnConfirmar').innerText = sessao.lotado ? 'Entrar na Lista de Espera' : 'Confirmar Vaga';

      modalInstance.show();
    }

    function submeterInscricao(event) {
      event.preventDefault();
      const idSessao = document.getElementById('modalIdSessao').value;
      const nome = document.getElementById('inputNome').value.trim();
      const email = document.getElementById('inputEmail').value.trim();
      const departamento = document.getElementById('selectDepto').value;

      const btn = document.getElementById('btnConfirmar');
      btn.disabled = true;
      btn.innerText = 'Processando...';

      google.script.run
        .withSuccessHandler(function(res) {
          if (res.sucesso) {
            document.getElementById('formInscricao').style.display = 'none';
            const resDiv = document.getElementById('modalResultado');
            resDiv.innerHTML = \`
              <div class="alert \${res.confirmado ? 'alert-success' : 'alert-warning'} text-start">
                <h5 class="fw-bold">\${res.confirmado ? '🎉 Vaga Confirmada!' : '📋 Lista de Espera Registrada!'}</h5>
                <p class="mb-1">\${res.mensagem}</p>
                <hr>
                <small class="text-muted"><b>Área:</b> \${res.area} | <b>Status:</b> \${res.status}</small>
              </div>
              <button class="btn btn-primary btn-sm mt-2" data-bs-dismiss="modal" onclick="carregarSessoes()">
                Fechar e Atualizar
              </button>
            \`;
            resDiv.style.display = 'block';
          } else {
            alert('Atenção: ' + res.erro);
            btn.disabled = false;
            btn.innerText = 'Tentar Novamente';
          }
        })
        .withFailureHandler(function(err) {
          alert('Erro ao processar inscrição: ' + err.message);
          btn.disabled = false;
          btn.innerText = 'Tentar Novamente';
        })
        .realizarInscricao({ idSessao: idSessao, nome: nome, email: email, departamento: departamento });
    }
  </script>
</body>
</html>`;
}
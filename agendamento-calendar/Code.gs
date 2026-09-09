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
 * - Identificação automática do colaborador via Google Workspace (sem precisar digitar).
 * - Banco de dados em Google Sheets e sincronização com Google Calendar.
 */

// ID da Planilha do Google Sheets (deixe vazio '' para usar a criada automaticamente)
const ID_PLANILHA = '';

// Limite de pessoas por sessão (capacidade da sala)
const LIMITE_VAGAS_PADRAO = 12;

// ID da Agenda do Google Calendar ('primary' para agenda principal da conta ou e-mail de agenda compartilhada)
const ID_AGENDA = 'primary';

// Nome de exibição nos e-mails enviados
const NOME_REMETENTE_EMAIL = 'RH Capital Realty';

// Sala física padrão no Google Workspace para as devolutivas
const SALA_PADRAO = 'Sala Andersen';

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

/**
 * Retorna o usuário corporativo logado no Google Workspace
 */
function obterUsuarioLogado() {
  try {
    const email = Session.getActiveUser().getEmail();
    let nomeSugerido = '';
    
    if (email) {
      // Extrai nome a partir do formato nome.sobrenome@empresa.com.br
      const usuario = email.split('@')[0];
      const partes = usuario.split(/[._-]/);
      nomeSugerido = partes.map(function(p) {
        return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
      }).join(' ');
    }

    return {
      sucesso: true,
      email: email || '',
      nomeSugerido: nomeSugerido || '',
      identificado: Boolean(email && email.trim() !== '')
    };
  } catch (err) {
    return { sucesso: false, email: '', nomeSugerido: '', identificado: false };
  }
}

// ============================================================================
// 2. BANCO DE DADOS (GOOGLE SHEETS)
// ============================================================================

function getPlanilhaDB() {
  let id = ID_PLANILHA;
  if (!id) {
    id = PropertiesService.getScriptProperties().getProperty('ID_PLANILHA');
  }
  if (!id) {
    throw new Error('A planilha ainda não foi configurada. Execute a função "inicializarSistema()" primeiro.');
  }
  return SpreadsheetApp.openById(id);
}

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

    const dadosIniciais = AREAS_EMPRESA.map((area, index) => [
      'SES-' + String(index + 1).padStart(2, '0'),
      area,
      '',         // Data a preencher pelo RH
      '14:00',    // Horário padrão
      '15:00',
      'Sala de Reunião Principal (Presencial)',
      LIMITE_VAGAS_PADRAO,
      0,
      0,
      ''
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

  const abaPadrao = ss.getSheetByName('Página1') || ss.getSheetByName('Sheet1');
  if (abaPadrao && ss.getSheets().length > 1) {
    try { ss.deleteSheet(abaPadrao); } catch (e) {}
  }

  return { sucesso: true, url: ss.getUrl(), id: ss.getId() };
}

// ============================================================================
// 3. CONSULTA DE SESSÕES (CORREÇÃO DE DATA E DISPLAY)
// ============================================================================

/**
 * Trata e formata a data da planilha para evitar o erro 31/12/1969
 */
function sanitizarData(valorBruto, valorTexto) {
  const txt = valorTexto ? String(valorTexto).trim() : '';
  
  // 1. Se a célula de texto estiver vazia ou com traço
  if (!txt || txt === '-' || txt === '0') return '';

  // 2. Se for formato DD/MM/AAAA ou AAAA-MM-DD
  if (txt.includes('/') || txt.includes('-')) {
    // Garante que não é apenas hora (ex: 14:00)
    if (!/^\d{1,2}:\d{2}/.test(txt)) {
      return txt;
    }
  }

  // 3. Se for objeto Date do Apps Script
  if (valorBruto instanceof Date && !isNaN(valorBruto.getTime())) {
    const ano = valorBruto.getFullYear();
    // Se o ano for menor que 2000 (ex: 1969, 1899), a célula continha apenas hora
    if (ano < 2000) return '';
    return Utilities.formatDate(valorBruto, Session.getScriptTimeZone(), 'dd/MM/yyyy');
  }

  return txt;
}

function obterSessoes(emailConsulta) {
  try {
    const ss = getPlanilhaDB();
    const abaSessoes = ss.getSheetByName('Sessoes');
    const abaInscricoes = ss.getSheetByName('Inscricoes');
    if (!abaSessoes) throw new Error('Aba "Sessoes" não encontrada.');

    let emailAlvo = (emailConsulta || '').trim().toLowerCase();
    if (!emailAlvo) {
      try {
        emailAlvo = Session.getActiveUser().getEmail().toLowerCase().trim();
      } catch (e) {}
    }

    // Mapeia as inscrições ativas do usuário
    const inscricoesUsuario = {};
    if (emailAlvo && abaInscricoes) {
      const inscricoesDados = abaInscricoes.getDataRange().getValues();
      for (let j = 1; j < inscricoesDados.length; j++) {
        const rowInsc = inscricoesDados[j];
        const sessaoId = String(rowInsc[1]);
        const emailInsc = String(rowInsc[4]).trim().toLowerCase();
        const statusInsc = String(rowInsc[6]);

        if (emailInsc === emailAlvo && !statusInsc.startsWith('Cancelado')) {
          inscricoesUsuario[sessaoId] = {
            inscrito: true,
            status: statusInsc,
            ehConfirmado: statusInsc.startsWith('Confirmado')
          };
        }
      }
    }

    const valores = abaSessoes.getDataRange().getValues();
    const displayValores = abaSessoes.getDataRange().getDisplayValues();

    if (valores.length <= 1) return { sucesso: true, sessoes: [] };

    const sessoes = [];
    for (let i = 1; i < valores.length; i++) {
      const row = valores[i];
      const rowDisplay = displayValores[i];

      const idSessao = String(row[0]);
      const area = String(row[1]);

      // Sanitiza a data para nunca dar 31/12/1969
      const dataStr = sanitizarData(row[2], rowDisplay[2]);

      // Horários
      const horaInicio = rowDisplay[3] ? rowDisplay[3].trim() : '';
      const horaFim = rowDisplay[4] ? rowDisplay[4].trim() : '';
      const local = String(row[5] || SALA_PADRAO);
      const limite = Number(row[6]) || LIMITE_VAGAS_PADRAO;
      const confirmados = Number(row[7]) || 0;
      const espera = Number(row[8]) || 0;
      const idEvento = String(row[9] || '');

      const vagasRestantes = Math.max(0, limite - confirmados);
      const lotado = confirmados >= limite;

      let horarioFormatado = '';
      if (horaInicio) {
        horarioFormatado = horaInicio + (horaFim ? ' às ' + horaFim : '');
      }

      const minhaInsc = inscricoesUsuario[idSessao] || null;

      sessoes.push({
        idSessao: idSessao,
        area: area,
        data: dataStr,
        temDataDefinida: Boolean(dataStr),
        horario: horarioFormatado,
        local: local,
        limite: limite,
        confirmados: confirmados,
        espera: espera,
        vagasRestantes: vagasRestantes,
        lotado: lotado,
        temEventoCalendar: Boolean(idEvento),
        minhaInscricao: minhaInsc
      });
    }

    return { sucesso: true, sessoes: sessoes, areasDisponiveis: AREAS_EMPRESA };
  } catch (err) {
    return { sucesso: false, erro: err.message };
  }
}

// ============================================================================
// 4. DISPARO DE E-MAIL DE CONFIRMAÇÃO
// ============================================================================

/**
 * Envia o e-mail estilizado de confirmação ou lista de espera
 */
function enviarEmailInscricao(dados) {
  try {
    const destinatario = dados.email;
    const nome = dados.nome;
    const area = dados.area;
    const confirmado = dados.confirmado;
    const dataHoraStr = dados.dataHoraStr || 'A definir pelo RH';
    const local = dados.local || 'Sala de Reunião Principal (Presencial)';

    let assunto = '';
    let htmlCorpo = '';

    if (confirmado) {
      assunto = '✅ Vaga Confirmada: Devolutiva RH — ' + area;
      htmlCorpo = `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
          <div style="background: linear-gradient(135deg, #0f2b5c, #1e3a8a); color: #ffffff; padding: 28px; text-align: center;">
            <span style="background: rgba(255,255,255,0.2); padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: bold; letter-spacing: 0.5px;">RH CAPITAL REALTY</span>
            <h2 style="margin: 12px 0 6px 0; font-size: 22px;">Inscrição Confirmada!</h2>
            <p style="margin: 0; opacity: 0.9; font-size: 14px;">Devolutiva Aberta — Pesquisa RH 360</p>
          </div>
          <div style="padding: 28px; color: #334155; line-height: 1.6;">
            <p style="font-size: 16px; margin-top: 0;">Olá, <b>${nome}</b>!</p>
            <p>Sua vaga presencial para a apresentação de resultados da área <b>${area}</b> está garantida.</p>
            
            <div style="background-color: #f8fafc; border-left: 4px solid #2563eb; padding: 16px; border-radius: 6px; margin: 20px 0;">
              <div style="margin-bottom: 8px;"><b>Área:</b> ${area}</div>
              <div style="margin-bottom: 8px;"><b>Data e Horário:</b> ${dataHoraStr}</div>
              <div style="margin-bottom: 8px;"><b>Local:</b> ${local}</div>
              <div><b>Status:</b> <span style="color: #16a34a; font-weight: bold;">${dados.status}</span></div>
            </div>

            <div style="background-color: #fefce8; border: 1px solid #fef08a; padding: 14px; border-radius: 8px; font-size: 13px; color: #854d0e; margin-bottom: 20px;">
              <b>⚠️ Aviso Importante:</b> A sala de reunião possui capacidade máxima de <b>12 pessoas</b>. Caso você tenha algum imprevisto e não possa comparecer, por favor avise o time de RH com antecedência para que possamos liberar a vaga para a lista de espera!
            </div>

            <p style="font-size: 14px; color: #64748b; margin-bottom: 0;">
              O convite na sua Google Agenda já foi vinculado ou será enviado assim que o cronograma for confirmado.
            </p>
          </div>
          <div style="background-color: #f1f5f9; padding: 16px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0;">
            Equipe de Recursos Humanos — Capital Realty
          </div>
        </div>
      `;
    } else {
      assunto = '📋 Lista de Espera: Devolutiva RH — ' + area;
      htmlCorpo = `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
          <div style="background: linear-gradient(135deg, #0f2b5c, #1e3a8a); color: #ffffff; padding: 28px; text-align: center;">
            <span style="background: rgba(255,255,255,0.2); padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: bold; letter-spacing: 0.5px;">RH CAPITAL REALTY</span>
            <h2 style="margin: 12px 0 6px 0; font-size: 22px;">Inscrição na Lista de Espera</h2>
            <p style="margin: 0; opacity: 0.9; font-size: 14px;">Devolutiva Aberta — Pesquisa RH 360</p>
          </div>
          <div style="padding: 28px; color: #334155; line-height: 1.6;">
            <p style="font-size: 16px; margin-top: 0;">Olá, <b>${nome}</b>!</p>
            <p>Recebemos o seu interesse em participar da apresentação de resultados da área <b>${area}</b>.</p>
            
            <div style="background-color: #fffbeb; border-left: 4px solid #f59e0b; padding: 16px; border-radius: 6px; margin: 20px 0;">
              <div style="margin-bottom: 8px;"><b>Área:</b> ${area}</div>
              <div><b>Situação:</b> <span style="color: #b45309; font-weight: bold;">${dados.status}</span></div>
            </div>

            <p>Como a sala presencial atingiu o limite de <b>12 vagas</b>, você foi registrado(a) com prioridade na <b>Lista de Espera</b>.</p>
            <p style="font-size: 14px; color: #64748b;">
              O time de RH está avaliando a demanda para a abertura de uma <b>2ª turma</b> para esta área. Havendo desistências ou a abertura de uma nova agenda, você será avisado(a) imediatamente por aqui!
            </p>
          </div>
          <div style="background-color: #f1f5f9; padding: 16px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0;">
            Equipe de Recursos Humanos — Capital Realty
          </div>
        </div>
      `;
    }

    MailApp.sendEmail({
      to: destinatario,
      subject: assunto,
      htmlBody: htmlCorpo,
      name: NOME_REMETENTE_EMAIL
    });

    return true;
  } catch (err) {
    Logger.log('Erro ao enviar e-mail: ' + err.message);
    return false;
  }
}

// ============================================================================
// 5. PROCESSAMENTO DE INSCRIÇÃO
// ============================================================================

function realizarInscricao(dados) {
  try {
    // dados = { idSessao, nome, email, departamento }
    let emailLimpo = (dados.email || '').trim().toLowerCase();
    let nomeLimpo = (dados.nome || '').trim();

    // Se o e-mail não veio do frontend, tenta obter da sessão corporativa
    if (!emailLimpo) {
      emailLimpo = Session.getActiveUser().getEmail().toLowerCase().trim();
    }
    if (!nomeLimpo && emailLimpo) {
      const usuario = emailLimpo.split('@')[0];
      nomeLimpo = usuario.split(/[._-]/).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
    }

    if (!dados.idSessao || !emailLimpo) {
      throw new Error('Identificação do colaborador ou sessão não informada.');
    }

    const deptoLimpo = dados.departamento || '-';

    const ss = getPlanilhaDB();
    const abaSessoes = ss.getSheetByName('Sessoes');
    const abaInscricoes = ss.getSheetByName('Inscricoes');

    const sessoesDados = abaSessoes.getDataRange().getValues();
    const sessoesDisplay = abaSessoes.getDataRange().getDisplayValues();

    let linhaSessao = -1;
    let sessaoEncontrada = null;

    for (let i = 1; i < sessoesDados.length; i++) {
      if (String(sessoesDados[i][0]) === dados.idSessao) {
        linhaSessao = i + 1;
        const dStr = sanitizarData(sessoesDados[i][2], sessoesDisplay[i][2]);
        const hIni = sessoesDisplay[i][3] ? sessoesDisplay[i][3].trim() : '';
        const hFim = sessoesDisplay[i][4] ? sessoesDisplay[i][4].trim() : '';
        const dataHoraFormatada = dStr ? (dStr + (hIni ? ' às ' + hIni : '')) : 'A definir pelo RH';

        sessaoEncontrada = {
          idSessao: sessoesDados[i][0],
          area: sessoesDados[i][1],
          dataHoraStr: dataHoraFormatada,
          dataLimpa: dStr,
          horaIni: hIni,
          horaFim: hFim,
          local: sessoesDados[i][5] || SALA_PADRAO,
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

    // Verifica duplicidade de inscrição ativa (mesmo e-mail na mesma sessão)
    const inscricoesDados = abaInscricoes.getDataRange().getValues();
    for (let j = 1; j < inscricoesDados.length; j++) {
      const sessaoCadastrada = String(inscricoesDados[j][1]);
      const emailCadastrado = String(inscricoesDados[j][4]).trim().toLowerCase();
      const statusCadastrado = String(inscricoesDados[j][6]);

      if (sessaoCadastrada === dados.idSessao && emailCadastrado === emailLimpo && !statusCadastrado.startsWith('Cancelado')) {
        throw new Error('Você já possui uma inscrição ativa para esta sessão!');
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

      // Garante ou cria o evento no Google Calendar e adiciona o colaborador
      const eventoCal = garantirEventoCalendar(
        sessaoEncontrada,
        linhaSessao,
        abaSessoes,
        sessaoEncontrada.dataLimpa,
        sessaoEncontrada.horaIni,
        sessaoEncontrada.horaFim
      );

      if (eventoCal) {
        try {
          eventoCal.addGuest(emailLimpo);
          Logger.log('Colaborador ' + emailLimpo + ' adicionado com sucesso ao evento!');
        } catch (eCal) {
          Logger.log('Erro ao convidar no Calendar: ' + eCal.message);
        }
      } else {
        Logger.log('Aviso: Evento do Calendar não criado pois a Data ainda não foi definida na planilha para ' + sessaoEncontrada.area);
      }
    } else {
      // Lista de espera (13º em diante)
      ehConfirmado = false;
      const numEspera = sessaoEncontrada.espera + 1;
      statusFinal = 'Lista de Espera (Posição ' + numEspera + ')';

      // Atualiza contador de espera na aba Sessoes
      abaSessoes.getRange(linhaSessao, 9).setValue(numEspera);
    }

    // Dispara o e-mail automático
    const emailEnviado = enviarEmailInscricao({
      email: emailLimpo,
      nome: nomeLimpo,
      area: sessaoEncontrada.area,
      dataHoraStr: sessaoEncontrada.dataHoraStr,
      local: sessaoEncontrada.local,
      confirmado: ehConfirmado,
      status: statusFinal,
      limite: sessaoEncontrada.limite
    });

    // Registra na aba de Inscrições
    abaInscricoes.appendRow([
      carimbo,
      sessaoEncontrada.idSessao,
      sessaoEncontrada.area,
      nomeLimpo,
      emailLimpo,
      deptoLimpo,
      statusFinal,
      emailEnviado ? 'Sim' : 'Erro no envio'
    ]);

    return {
      sucesso: true,
      confirmado: ehConfirmado,
      area: sessaoEncontrada.area,
      status: statusFinal,
      emailEnviado: emailEnviado,
      mensagem: ehConfirmado
        ? '🎉 Inscrição confirmada com sucesso! Enviamos um e-mail com os detalhes da sua vaga.'
        : '⚠️ A sala atingiu o limite de 12 vagas presenciais. Você foi registrado(a) na LISTA DE ESPERA para a 2ª turma e enviamos a confirmação no seu e-mail!'
    };
  } catch (err) {
    return { sucesso: false, erro: err.message };
  }
}

// ============================================================================
// 6. CANCELAMENTO / DESISTÊNCIA DE VAGA E PROMOÇÃO DA FILA
// ============================================================================

/**
 * Permite ao colaborador desistir da vaga, liberando o espaço e promovendo a lista de espera
 */
function cancelarInscricao(dados) {
  try {
    // dados = { idSessao, email }
    let emailLimpo = (dados.email || '').trim().toLowerCase();
    if (!emailLimpo) {
      try {
        emailLimpo = Session.getActiveUser().getEmail().toLowerCase().trim();
      } catch (e) {}
    }

    if (!dados.idSessao || !emailLimpo) {
      throw new Error('Identificação do colaborador ou sessão não informada.');
    }

    const ss = getPlanilhaDB();
    const abaSessoes = ss.getSheetByName('Sessoes');
    const abaInscricoes = ss.getSheetByName('Inscricoes');

    const sessoesDados = abaSessoes.getDataRange().getValues();
    let linhaSessao = -1;
    let sessaoObj = null;

    for (let i = 1; i < sessoesDados.length; i++) {
      if (String(sessoesDados[i][0]) === dados.idSessao) {
        linhaSessao = i + 1;
        sessaoObj = {
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

    if (!sessaoObj) throw new Error('Sessão não encontrada.');

    // Localiza a inscrição ativa do colaborador
    const inscricoesDados = abaInscricoes.getDataRange().getValues();
    let linhaInscricao = -1;
    let inscricaoAtiva = null;

    for (let j = 1; j < inscricoesDados.length; j++) {
      const sId = String(inscricoesDados[j][1]);
      const em = String(inscricoesDados[j][4]).trim().toLowerCase();
      const st = String(inscricoesDados[j][6]);

      if (sId === dados.idSessao && em === emailLimpo && !st.startsWith('Cancelado')) {
        linhaInscricao = j + 1;
        inscricaoAtiva = {
          nome: inscricoesDados[j][3],
          email: em,
          status: st,
          ehConfirmado: st.startsWith('Confirmado')
        };
        break;
      }
    }

    if (!inscricaoAtiva) {
      throw new Error('Nenhuma inscrição ativa encontrada para este e-mail nesta sessão.');
    }

    const agora = new Date();
    const carimbo = Utilities.formatDate(agora, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss');

    // 1. Marca como cancelado na planilha
    abaInscricoes.getRange(linhaInscricao, 7).setValue('Cancelado em ' + carimbo);

    let mensagemRetorno = '';

    if (inscricaoAtiva.ehConfirmado) {
      // O usuário tinha vaga confirmada: verifica se há alguém na Lista de Espera para promover
      let linhaPromovido = -1;
      let promovidoObj = null;

      for (let k = 1; k < inscricoesDados.length; k++) {
        const sIdK = String(inscricoesDados[k][1]);
        const emK = String(inscricoesDados[k][4]).trim().toLowerCase();
        const stK = String(inscricoesDados[k][6]);

        if (sIdK === dados.idSessao && stK.startsWith('Lista de Espera') && k !== (linhaInscricao - 1)) {
          linhaPromovido = k + 1;
          promovidoObj = {
            nome: inscricoesDados[k][3],
            email: emK
          };
          break; // Promove o primeiro da fila
        }
      }

      if (promovidoObj) {
        // Promove o primeiro da fila de espera!
        abaInscricoes.getRange(linhaPromovido, 7).setValue('Confirmado (Promovido da Fila - Vaga 12/12)');
        
        // Reduz contador da fila de espera
        const novaEspera = Math.max(0, sessaoObj.espera - 1);
        abaSessoes.getRange(linhaSessao, 9).setValue(novaEspera);

        // Adiciona o promovido ao evento do Calendar
        if (sessaoObj.idEvento) {
          try {
            const agenda = CalendarApp.getCalendarById(ID_AGENDA);
            const evento = agenda.getEventById(sessaoObj.idEvento);
            if (evento) {
              evento.addGuest(promovidoObj.email);
            }
          } catch (eC) {}
        }

        // Dispara e-mail avisando o colaborador promovido
        enviarEmailPromocao({
          email: promovidoObj.email,
          nome: promovidoObj.nome,
          area: sessaoObj.area
        });

        mensagemRetorno = 'Sua vaga foi liberada com sucesso! O próximo colega da lista de espera foi promovido automaticamente.';
      } else {
        // Não havia fila de espera: reduz contador de confirmados
        const novosConfirmados = Math.max(0, sessaoObj.confirmados - 1);
        abaSessoes.getRange(linhaSessao, 8).setValue(novosConfirmados);
        mensagemRetorno = 'Sua vaga foi cancelada com sucesso e liberada para novos interessados.';
      }

    } else {
      // O usuário estava apenas na lista de espera
      const novaEspera = Math.max(0, sessaoObj.espera - 1);
      abaSessoes.getRange(linhaSessao, 9).setValue(novaEspera);
      mensagemRetorno = 'Sua inscrição na lista de espera foi cancelada com sucesso.';
    }

    // Envia e-mail de confirmação do cancelamento para quem desistiu
    enviarEmailCancelamento({
      email: emailLimpo,
      nome: inscricaoAtiva.nome,
      area: sessaoObj.area
    });

    return {
      sucesso: true,
      mensagem: mensagemRetorno
    };
  } catch (err) {
    return { sucesso: false, erro: err.message };
  }
}

/**
 * Notifica colaborador que foi promovido da lista de espera para vaga presencial
 */
function enviarEmailPromocao(dados) {
  try {
    const assunto = '🎉 Vaga Liberada! Você foi promovido(a) na Devolutiva RH — ' + dados.area;
    const htmlCorpo = `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
        <div style="background: linear-gradient(135deg, #16a34a, #15803d); color: #ffffff; padding: 28px; text-align: center;">
          <span style="background: rgba(255,255,255,0.2); padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: bold;">RH CAPITAL REALTY</span>
          <h2 style="margin: 12px 0 6px 0; font-size: 22px;">Boa notícia! Vaga Confirmada!</h2>
          <p style="margin: 0; opacity: 0.9; font-size: 14px;">Você saiu da Lista de Espera</p>
        </div>
        <div style="padding: 28px; color: #334155; line-height: 1.6;">
          <p style="font-size: 16px; margin-top: 0;">Olá, <b>${dados.nome}</b>!</p>
          <p>Houve uma desistência na apresentação de resultados da área <b>${dados.area}</b> e você acaba de ser <b>promovido(a) com vaga presencial garantida</b> na Sala Andersen (limite de 12 pessoas)!</p>
          <p>O convite na sua Google Agenda já foi vinculado automaticamente.</p>
          <p style="font-size: 13px; color: #64748b;">Caso não possa comparecer, você também pode desistir pelo formulário para liberar a vaga para o próximo colega.</p>
        </div>
        <div style="background-color: #f1f5f9; padding: 16px; text-align: center; font-size: 12px; color: #94a3b8;">
          Equipe de Recursos Humanos — Capital Realty
        </div>
      </div>
    `;
    MailApp.sendEmail({ to: dados.email, subject: assunto, htmlBody: htmlCorpo, name: NOME_REMETENTE_EMAIL });
  } catch(e) {
    Logger.log('Erro ao enviar e-mail de promoção: ' + e.message);
  }
}

/**
 * Notifica colaborador sobre o cancelamento da sua inscrição
 */
function enviarEmailCancelamento(dados) {
  try {
    const assunto = 'Confirmação de Cancelamento — Devolutiva RH: ' + dados.area;
    const htmlCorpo = `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
        <div style="background: linear-gradient(135deg, #475569, #334155); color: #ffffff; padding: 24px; text-align: center;">
          <span style="background: rgba(255,255,255,0.2); padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: bold;">RH CAPITAL REALTY</span>
          <h3 style="margin: 10px 0 0 0; color: #ffffff;">Cancelamento Confirmado</h3>
        </div>
        <div style="padding: 24px; color: #334155; line-height: 1.6;">
          <p>Olá, <b>${dados.nome}</b>!</p>
          <p>Confirmamos que a sua inscrição para a Devolutiva da área <b>${dados.area}</b> foi cancelada com sucesso.</p>
          <p>Agradecemos por avisar com antecedência e liberar o espaço na sala para os seus colegas!</p>
        </div>
        <div style="background-color: #f1f5f9; padding: 16px; text-align: center; font-size: 12px; color: #94a3b8;">
          Equipe de Recursos Humanos — Capital Realty
        </div>
      </div>
    `;
    MailApp.sendEmail({ to: dados.email, subject: assunto, htmlBody: htmlCorpo, name: NOME_REMETENTE_EMAIL });
  } catch(e) {
    Logger.log('Erro ao enviar e-mail de cancelamento: ' + e.message);
  }
}

// ============================================================================
// 6. GESTÃO DO GOOGLE CALENDAR E RESERVA DE SALAS (RECURSOS)
// ============================================================================

/**
 * Busca o endereço de e-mail do recurso de sala (ex: Sala Andersen)
 */
function obterEmailRecursoSala(nomeProcurado) {
  try {
    const alvo = (nomeProcurado || 'andersen').toLowerCase();
    const todasAgendas = CalendarApp.getAllCalendars();
    for (let i = 0; i < todasAgendas.length; i++) {
      const ag = todasAgendas[i];
      const nome = (ag.getName() || '').toLowerCase();
      const id = ag.getId();
      // No Google Workspace, o recurso de sala tem o nome correspondente ou id de resource
      if (nome.includes(alvo) || nome.includes('andersen')) {
        Logger.log('Recurso de sala encontrado: ' + ag.getName() + ' (' + id + ')');
        return id;
      }
    }
  } catch (e) {
    Logger.log('Aviso ao buscar recurso de sala: ' + e.message);
  }
  return null;
}

/**
 * Garante que o evento no Calendar existe (busca ou cria) e reserva a sala
 */
function garantirEventoCalendar(sessao, linhaSessao, abaSessoes, dataLimpa, horaIniVal, horaFimVal) {
  const agenda = CalendarApp.getCalendarById(ID_AGENDA);
  let idEvento = sessao.idEvento;

  // 1. Se já tem ID gravado, tenta resgatar o evento existente
  if (idEvento) {
    let evento = agenda.getEventById(idEvento);
    if (!evento && idEvento.includes('@')) {
      evento = agenda.getEventById(idEvento.split('@')[0]);
    }
    if (!evento) {
      evento = CalendarApp.getEventById(idEvento);
    }
    if (evento) return evento;
  }

  // 2. Se não tem ID, mas tem data válida, cria o evento agora no Calendar!
  if (dataLimpa) {
    try {
      let dia = 1, mes = 0, ano = 2026;
      if (dataLimpa.includes('/')) {
        const partes = dataLimpa.split('/');
        dia = parseInt(partes[0], 10);
        mes = parseInt(partes[1], 10) - 1;
        ano = parseInt(partes[2], 10);
      } else if (dataLimpa.includes('-')) {
        const partes = dataLimpa.split('-');
        ano = parseInt(partes[0], 10);
        mes = parseInt(partes[1], 10) - 1;
        dia = parseInt(partes[2], 10);
      }

      let horaIni = 14, minIni = 0, horaFim = 15, minFim = 0;
      if (horaIniVal) {
        const pIni = horaIniVal.split(':');
        if (pIni.length >= 2) { horaIni = parseInt(pIni[0], 10); minIni = parseInt(pIni[1], 10); }
      }
      if (horaFimVal) {
        const pFim = horaFimVal.split(':');
        if (pFim.length >= 2) { horaFim = parseInt(pFim[0], 10); minFim = parseInt(pFim[1], 10); }
      }

      const inicio = new Date(ano, mes, dia, horaIni, minIni, 0);
      const fim = new Date(ano, mes, dia, horaFim, minFim, 0);

      const localFinal = sessao.local || SALA_PADRAO;
      const titulo = '📊 Devolutiva Pesquisa RH — ' + sessao.area;
      const descricao = 'Apresentação aberta dos resultados da Pesquisa RH 360 para a área: ' + sessao.area + '.\n\nLocal: ' + localFinal + ' (Limite: ' + LIMITE_VAGAS_PADRAO + ' pessoas).';

      const novoEvento = agenda.createEvent(titulo, inicio, fim, {
        location: localFinal,
        description: descricao,
        sendInvites: true
      });

      // Tenta reservar o recurso de sala no Google Workspace (ex: Sala Andersen)
      const emailSala = obterEmailRecursoSala(localFinal);
      if (emailSala) {
        try {
          novoEvento.addGuest(emailSala);
          Logger.log('Recurso de sala ' + localFinal + ' reservado com sucesso no Google Calendar!');
        } catch (eSala) {
          Logger.log('Aviso ao adicionar sala: ' + eSala.message);
        }
      }

      // Grava o ID do evento na planilha
      if (linhaSessao && abaSessoes) {
        abaSessoes.getRange(linhaSessao, 10).setValue(novoEvento.getId());
      }

      return novoEvento;
    } catch (err) {
      Logger.log('Erro ao criar evento sob demanda no Calendar: ' + err.message);
    }
  }

  return null;
}

/**
 * Cria ou atualiza os eventos no Calendar para todas as sessões com data preenchida
 */
function sincronizarComCalendar() {
  const ss = getPlanilhaDB();
  const abaSessoes = ss.getSheetByName('Sessoes');
  const abaInscricoes = ss.getSheetByName('Inscricoes');
  const dados = abaSessoes.getDataRange().getValues();
  const displayValores = abaSessoes.getDataRange().getDisplayValues();
  const inscricoesDados = abaInscricoes ? abaInscricoes.getDataRange().getValues() : [];

  let criados = 0;
  let convidadosTotal = 0;

  for (let i = 1; i < dados.length; i++) {
    const row = dados[i];
    const rowDisplay = displayValores[i];
    const idSessao = String(row[0]);
    const area = row[1];
    const dataLimpa = sanitizarData(row[2], rowDisplay[2]);
    const horaIniVal = rowDisplay[3] || '14:00';
    const horaFimVal = rowDisplay[4] || '15:00';
    const local = row[5] || SALA_PADRAO;
    let idEvento = row[9];

    if (dataLimpa) {
      const sessaoObj = {
        idSessao: idSessao,
        area: area,
        local: local,
        idEvento: idEvento
      };

      const evento = garantirEventoCalendar(sessaoObj, i + 1, abaSessoes, dataLimpa, horaIniVal, horaFimVal);

      if (evento) {
        if (!idEvento) criados++;

        // Convida todos os inscritos confirmados na planilha
        for (let j = 1; j < inscricoesDados.length; j++) {
          const sessaoInsc = String(inscricoesDados[j][1]);
          const emailInsc = String(inscricoesDados[j][4]).trim().toLowerCase();
          const statusInsc = String(inscricoesDados[j][6]);

          if (sessaoInsc === idSessao && statusInsc.startsWith('Confirmado') && emailInsc) {
            try {
              evento.addGuest(emailInsc);
              convidadosTotal++;
            } catch (eG) {}
          }
        }
      }
    }
  }

  return 'Sincronização concluída! ' + criados + ' novo(s) evento(s) criado(s) e ' + convidadosTotal + ' convite(s) sincronizado(s).';
}

/**
 * Função utilitária para imprimir no Log do Apps Script todos os recursos/salas encontrados
 */
function descobrirSalasERecursos() {
  const todasAgendas = CalendarApp.getAllCalendars();
  Logger.log('=== LISTA DE AGENDAS E RECURSOS DO GOOGLE WORKSPACE ===');
  todasAgendas.forEach(function(ag) {
    Logger.log('Nome: ' + ag.getName() + ' | ID: ' + ag.getId());
  });
}

// ============================================================================
// 6. INTERFACE HTML (FRONTEND COM IDENTIFICAÇÃO AUTOMÁTICA)
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
      background-color: #f8fafc;
      font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
      color: #1e293b;
    }
    .hero-banner {
      background: linear-gradient(135deg, var(--cr-blue), var(--cr-blue-light));
      color: white;
      padding: 35px 20px;
      border-radius: 0 0 24px 24px;
      box-shadow: 0 10px 25px rgba(15, 43, 92, 0.15);
      margin-bottom: 25px;
    }
    .user-pill {
      background: rgba(255,255,255,0.15);
      border: 1px solid rgba(255,255,255,0.25);
      padding: 6px 16px;
      border-radius: 30px;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-size: 0.9rem;
      backdrop-filter: blur(4px);
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
      <p class="lead opacity-90 mb-3" style="font-size: 1.05rem;">
        Participe da apresentação de resultados das áreas. <br>
        <span class="fw-bold text-warning"><i class="fa-solid fa-triangle-exclamation me-1"></i> Limite de 12 pessoas na sala</span> (ordem de inscrição).
      </p>

      <!-- Identificação do Usuário Logado -->
      <div id="boxUsuarioLogado" style="display: none;">
        <div class="user-pill">
          <i class="fa-solid fa-circle-user text-warning"></i>
          <span>Conectado como: <b id="lblNomeUsuario">-</b> (<span id="lblEmailUsuario">-</span>)</span>
        </div>
      </div>
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
        <i class="fa-solid fa-arrows-rotate me-1"></i> Atualizar
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

  <!-- Modal de Inscrição Rápida -->
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

            <!-- Quando identificado automaticamente via Google Workspace -->
            <div id="boxAutoIdentificado" class="card bg-light border-0 p-3 mb-3" style="display:none; border-radius: 12px;">
              <div class="d-flex align-items-center gap-3">
                <div class="fs-2 text-primary"><i class="fa-solid fa-id-badge"></i></div>
                <div>
                  <div class="fw-bold" id="autoNome">Nome</div>
                  <div class="small text-muted" id="autoEmail">email@capitalrealty.com.br</div>
                  <span class="badge bg-success mt-1" style="font-size:0.75rem;"><i class="fa-solid fa-check me-1"></i>Identificado pelo Google</span>
                </div>
              </div>
            </div>

            <!-- Campos manuais se não for possível obter pelo Google Workspace -->
            <div id="boxCamposManuais">
              <div class="mb-3">
                <label class="form-label fw-bold small">Nome Completo *</label>
                <input type="text" id="inputNome" class="form-control" placeholder="Digite seu nome">
              </div>
              <div class="mb-3">
                <label class="form-label fw-bold small">E-mail Corporativo *</label>
                <input type="email" id="inputEmail" class="form-control" placeholder="seu.email@capitalrealty.com.br">
              </div>
            </div>

            <div class="mb-3">
              <label class="form-label fw-bold small">Seu Departamento *</label>
              <select id="selectDepto" class="form-select" required>
                <option value="">Selecione sua área...</option>
              </select>
            </div>

            <div class="d-grid mt-4">
              <button type="submit" class="btn btn-primary btn-inscrever" id="btnConfirmar">
                Confirmar Minha Vaga
              </button>
            </div>
          </form>

          <div id="modalResultado" class="text-center py-3" style="display: none;"></div>
        </div>
      </div>
    </div>
  </div>

  <!-- Modal de Cancelamento / Desistência de Vaga -->
  <div class="modal fade" id="modalCancelamento" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content border-0 shadow-lg" style="border-radius: 16px;">
        <div class="modal-header border-0 bg-light" style="border-radius: 16px 16px 0 0;">
          <div>
            <h5 class="modal-title fw-bold text-danger"><i class="fa-solid fa-triangle-exclamation me-1"></i>Desistir da Vaga</h5>
            <div class="text-muted small" id="modalCancelArea">Área</div>
          </div>
          <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
        </div>
        <div class="modal-body p-4">
          <input type="hidden" id="modalCancelIdSessao">
          
          <div id="boxConfirmarCancelamento">
            <div class="alert alert-secondary small py-2 mb-3">
              <b>Sua situação atual:</b> <span id="modalCancelStatusAtual">-</span>
            </div>
            <p class="mb-3">
              Tem certeza que deseja desistir da sua vaga na devolutiva de <b id="modalCancelNomeArea">-</b>?
            </p>
            <p class="small text-muted mb-4">
              <i class="fa-solid fa-circle-info me-1"></i> Ao confirmar, sua vaga será liberada imediatamente para o próximo colega na lista de espera.
            </p>
            <div class="d-flex gap-2">
              <button type="button" class="btn btn-light w-50" data-bs-dismiss="modal">Voltar</button>
              <button type="button" class="btn btn-danger w-50" id="btnExecutarCancelamento" onclick="executarCancelamento()">
                Sim, Desistir da Vaga
              </button>
            </div>
          </div>

          <div id="boxResultadoCancelamento" class="text-center py-3" style="display: none;"></div>
        </div>
      </div>
    </div>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
  <script>
    let sessoesCache = [];
    let modalInstance = null;
    let modalCancelInstance = null;
    let usuarioConectado = null;

    window.onload = function() {
      modalInstance = new bootstrap.Modal(document.getElementById('modalInscricao'));
      modalCancelInstance = new bootstrap.Modal(document.getElementById('modalCancelamento'));
      detectarUsuario();
    };

    function detectarUsuario() {
      google.script.run
        .withSuccessHandler(function(res) {
          if (res && res.identificado) {
            usuarioConectado = res;
            document.getElementById('lblNomeUsuario').innerText = res.nomeSugerido || res.email;
            document.getElementById('lblEmailUsuario').innerText = res.email;
            document.getElementById('boxUsuarioLogado').style.display = 'block';
          }
          carregarSessoes();
        })
        .withFailureHandler(function() {
          carregarSessoes();
        })
        .obterUsuarioLogado();
    }

    function carregarSessoes() {
      document.getElementById('loadingBox').style.display = 'block';
      document.getElementById('cardsGrid').style.display = 'none';

      const emailAtual = usuarioConectado ? usuarioConectado.email : '';

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
        .obterSessoes(emailAtual);
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
        let btnHtml = '';

        if (s.minhaInscricao && s.minhaInscricao.inscrito) {
          // O usuário atual já está inscrito nesta sessão!
          if (s.minhaInscricao.ehConfirmado) {
            badgeHtml = '<span class="badge bg-success text-white badge-vaga"><i class="fa-solid fa-circle-check me-1"></i>Sua vaga está garantida!</span>';
          } else {
            badgeHtml = '<span class="badge bg-warning text-dark badge-vaga"><i class="fa-solid fa-clock me-1"></i>Você está na Lista de Espera</span>';
          }
          btnHtml = \`
            <button class="btn btn-outline-danger w-100 btn-inscrever" onclick="abrirModalCancelamento('\${s.idSessao}')">
              <i class="fa-solid fa-arrow-right-from-bracket me-1"></i> Desistir da Vaga
            </button>
          \`;
        } else {
          // O usuário não está inscrito nesta sessão
          if (!s.lotado) {
            const restantes = s.vagasRestantes;
            if (restantes <= 3) {
              badgeHtml = '<span class="badge bg-warning text-dark badge-vaga"><i class="fa-solid fa-clock me-1"></i>Últimas ' + restantes + ' vagas!</span>';
            } else {
              badgeHtml = '<span class="badge bg-success badge-vaga"><i class="fa-solid fa-circle-check me-1"></i>' + restantes + ' vagas livres</span>';
            }
            btnHtml = \`
              <button class="btn btn-primary w-100 btn-inscrever" onclick="abrirModalInscricao('\${s.idSessao}')">
                Garantir Minha Vaga
              </button>
            \`;
          } else {
            badgeHtml = '<span class="badge bg-secondary badge-vaga"><i class="fa-solid fa-user-group me-1"></i>Sala Lotada (12/12)</span>';
            btnHtml = \`
              <button class="btn btn-outline-warning text-dark fw-bold w-100 btn-inscrever" onclick="abrirModalInscricao('\${s.idSessao}')">
                Entrar na Lista de Espera
              </button>
            \`;
          }
        }

        // Formatação da data (sem 31/12/1969!)
        let dataFormatada = '';
        if (s.temDataDefinida) {
          dataFormatada = '🗓️ ' + s.data + (s.horario ? ' — ⏰ ' + s.horario : '');
        } else {
          dataFormatada = '<span class="text-muted"><i class="fa-regular fa-calendar me-1"></i>Data a definir pelo RH</span>';
        }

        const col = document.createElement('div');
        col.className = 'col-md-6 col-lg-4';
        col.innerHTML = \`
          <div class="card card-sessao">
            <div class="card-body p-4">
              <div class="d-flex justify-content-between align-items-start mb-2">
                <h5 class="fw-bold mb-0 text-dark">\${s.area}</h5>
              </div>
              <div class="mb-3 small">
                \${dataFormatada} <br>
                <span class="text-muted"><i class="fa-solid fa-location-dot text-danger me-1"></i>\${s.local}</span>
              </div>
              <div class="d-flex align-items-center justify-content-between mb-4">
                \${badgeHtml}
                <small class="text-muted">\${s.confirmados}/\${s.limite} inscritos</small>
              </div>
              <div class="mt-auto">
                \${btnHtml}
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
      document.getElementById('modalInfoData').innerText = sessao.temDataDefinida ? (sessao.data + (sessao.horario ? ' às ' + sessao.horario : '')) : 'Data em definição pelo RH';

      const aviso = document.getElementById('modalAvisoStatus');
      if (!sessao.lotado) {
        aviso.className = 'alert alert-success small py-2';
        aviso.innerHTML = '<i class="fa-solid fa-circle-check me-1"></i> Vaga presencial disponível (Restam ' + sessao.vagasRestantes + ' de 12 vagas).';
      } else {
        aviso.className = 'alert alert-warning small py-2 text-dark';
        aviso.innerHTML = '<i class="fa-solid fa-info-circle me-1"></i> A sala atingiu 12 pessoas. Você entrará na <b>Lista de Espera</b> para a 2ª turma!';
      }

      if (usuarioConectado && usuarioConectado.identificado) {
        document.getElementById('boxAutoIdentificado').style.display = 'block';
        document.getElementById('autoNome').innerText = usuarioConectado.nomeSugerido;
        document.getElementById('autoEmail').innerText = usuarioConectado.email;
        document.getElementById('boxCamposManuais').style.display = 'none';
        document.getElementById('inputNome').required = false;
        document.getElementById('inputEmail').required = false;
      } else {
        document.getElementById('boxAutoIdentificado').style.display = 'none';
        document.getElementById('boxCamposManuais').style.display = 'block';
        document.getElementById('inputNome').required = true;
        document.getElementById('inputEmail').required = true;
      }

      document.getElementById('formInscricao').style.display = 'block';
      document.getElementById('modalResultado').style.display = 'none';
      document.getElementById('btnConfirmar').disabled = false;
      document.getElementById('btnConfirmar').innerText = sessao.lotado ? 'Entrar na Lista de Espera' : 'Confirmar Vaga';

      modalInstance.show();
    }

    function abrirModalCancelamento(idSessao) {
      const sessao = sessoesCache.find(s => s.idSessao === idSessao);
      if (!sessao) return;

      document.getElementById('modalCancelIdSessao').value = sessao.idSessao;
      document.getElementById('modalCancelArea').innerText = 'Devolutiva: ' + sessao.area;
      document.getElementById('modalCancelNomeArea').innerText = sessao.area;
      document.getElementById('modalCancelStatusAtual').innerText = (sessao.minhaInscricao && sessao.minhaInscricao.status) ? sessao.minhaInscricao.status : 'Inscrito';

      document.getElementById('boxConfirmarCancelamento').style.display = 'block';
      document.getElementById('boxResultadoCancelamento').style.display = 'none';
      document.getElementById('btnExecutarCancelamento').disabled = false;
      document.getElementById('btnExecutarCancelamento').innerText = 'Sim, Desistir da Vaga';

      modalCancelInstance.show();
    }

    function executarCancelamento() {
      const idSessao = document.getElementById('modalCancelIdSessao').value;
      const email = (usuarioConectado && usuarioConectado.email) ? usuarioConectado.email : '';

      const btn = document.getElementById('btnExecutarCancelamento');
      btn.disabled = true;
      btn.innerText = 'Processando desistência...';

      google.script.run
        .withSuccessHandler(function(res) {
          if (res.sucesso) {
            document.getElementById('boxConfirmarCancelamento').style.display = 'none';
            const resDiv = document.getElementById('boxResultadoCancelamento');
            resDiv.innerHTML = \`
              <div class="alert alert-info text-start">
                <h5 class="fw-bold"><i class="fa-solid fa-circle-check me-1"></i> Desistência Realizada</h5>
                <p class="mb-0">\${res.mensagem}</p>
              </div>
              <button class="btn btn-secondary btn-sm mt-2" data-bs-dismiss="modal" onclick="carregarSessoes()">
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
          alert('Erro ao cancelar: ' + err.message);
          btn.disabled = false;
          btn.innerText = 'Tentar Novamente';
        })
        .cancelarInscricao({ idSessao: idSessao, email: email });
    }

    function submeterInscricao(event) {
      event.preventDefault();
      const idSessao = document.getElementById('modalIdSessao').value;
      const departamento = document.getElementById('selectDepto').value;

      let nome = '';
      let email = '';

      if (usuarioConectado && usuarioConectado.identificado) {
        nome = usuarioConectado.nomeSugerido;
        email = usuarioConectado.email;
      } else {
        nome = document.getElementById('inputNome').value.trim();
        email = document.getElementById('inputEmail').value.trim();
      }

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
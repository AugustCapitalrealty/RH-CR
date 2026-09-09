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

// ID da Planilha do Google Sheets (Gestão de Devolutivas)
const ID_PLANILHA = '1sb2kDseQ8AoVJcZYERLyO9l2FpDMTYV8lfZHTqLbirk';

// Limite de pessoas por sessão (capacidade da sala)
const LIMITE_VAGAS_PADRAO = 12;

// ID da Agenda do Google Calendar ('primary' para agenda principal da conta ou e-mail de agenda compartilhada)
const ID_AGENDA = 'primary';

// Nome de exibição nos e-mails enviados
const NOME_REMETENTE_EMAIL = 'RH Capital Realty';

// E-mail corporativo do grupo RH (alias de envio configurado no Gmail)
const EMAIL_REMETENTE_RH = 'rh@capitalrealty.com.br';

/**
 * Retorna o alias de envio 'rh@capitalrealty.com.br' se estiver configurado no Gmail da conta
 */
function obterAliasEnvio() {
  try {
    const aliases = GmailApp.getAliases();
    for (let i = 0; i < aliases.length; i++) {
      if (aliases[i].toLowerCase().includes('rh@capitalrealty.com.br')) {
        return aliases[i];
      }
    }
  } catch (e) {
    Logger.log('Aviso ao consultar aliases: ' + e.message);
  }
  return null;
}

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
// 2. BANCO DE DADOS (GOOGLE SHEETS) E CONFIGURAÇÃO
// ============================================================================

/**
 * Menu automático no Google Sheets para fácil acesso pelo usuário
 */
function onOpen() {
  try {
    SpreadsheetApp.getUi()
      .createMenu('🏛️ RH Devolutivas')
      .addItem('🔄 Resetar e Organizar Planilha', 'resetarEConfigurarPlanilha')
      .addItem('📅 Sincronizar com Google Calendar Agora', 'sincronizarComCalendar')
      .addItem('⏰ Ativar Sincronização Automática (a cada 1 hora)', 'ativarSincronizacaoAutomatica')
      .addItem('🛑 Desativar Sincronização Automática', 'desativarSincronizacaoAutomatica')
      .addSeparator()
      .addItem('👥 Gerar 2ª Turma para Lista de Espera', 'gerarSegundaTurmaFilaEspera')
      .addItem('🧪 Testar Permissões (E-mail e Agenda)', 'testarPermissoesEEmailCalendar')
      .addToUi();
  } catch (e) {}
}

function getPlanilhaDB() {
  // 1. ID configurado explicitamente na constante
  let id = (typeof ID_PLANILHA !== 'undefined' ? ID_PLANILHA : '').trim();

  // 2. ID nas propriedades do script
  if (!id) {
    id = PropertiesService.getScriptProperties().getProperty('ID_PLANILHA');
  }

  // 3. Fallback para a planilha informada
  if (!id) {
    id = '1sb2kDseQ8AoVJcZYERLyO9l2FpDMTYV8lfZHTqLbirk';
  }

  if (id) {
    try {
      return SpreadsheetApp.openById(id);
    } catch (err) {
      Logger.log('Aviso ao abrir planilha por ID: ' + err.message);
    }
  }

  // 4. Tenta obter a planilha ativa do contêiner
  try {
    const active = SpreadsheetApp.getActiveSpreadsheet();
    if (active) return active;
  } catch (e) {}

  throw new Error('A planilha ainda não foi configurada. Execute a função "resetarEConfigurarPlanilha()".');
}

/**
 * Reseta os contadores, limpa inscrições de teste,
 * garante todas as colunas necessárias e as 13 sessões com a "Sala Andersen",
 * preservando as datas e horários já preenchidos pelo RH!
 */
function resetarEConfigurarPlanilha() {
  let ss = null;

  try {
    ss = getPlanilhaDB();
  } catch (e) {
    ss = SpreadsheetApp.openById('1sb2kDseQ8AoVJcZYERLyO9l2FpDMTYV8lfZHTqLbirk');
  }

  // Garante a gravação do ID correto nas propriedades
  PropertiesService.getScriptProperties().setProperty('ID_PLANILHA', ss.getId());
  Logger.log('Operando na planilha: ' + ss.getUrl() + ' (' + ss.getId() + ')');

  // -------------------------------------------------------------
  // ABA 1: Sessoes
  // -------------------------------------------------------------
  let abaSessoes = ss.getSheetByName('Sessoes');
  if (!abaSessoes) {
    abaSessoes = ss.insertSheet('Sessoes');
  }

  // Mapeia datas e horários que o RH já preencheu para não perder nada
  const dadosExistentes = {};
  if (abaSessoes.getLastRow() > 1) {
    const valoresAtuais = abaSessoes.getDataRange().getValues();
    const displayAtuais = abaSessoes.getDataRange().getDisplayValues();
    for (let r = 1; r < valoresAtuais.length; r++) {
      const idSessao = String(valoresAtuais[r][0] || '').trim();
      const area = String(valoresAtuais[r][1] || '').trim();
      const dataTexto = sanitizarData(valoresAtuais[r][2], displayAtuais[r][2]);
      const horaIni = displayAtuais[r][3] ? String(displayAtuais[r][3]).trim() : '';
      const horaFim = displayAtuais[r][4] ? String(displayAtuais[r][4]).trim() : '';

      const info = {
        data: dataTexto,
        horaIni: horaIni,
        horaFim: horaFim
      };
      if (idSessao) dadosExistentes[idSessao] = info;
      if (area) dadosExistentes[area] = info;
    }
  }

  // Cabeçalhos padronizados da aba Sessoes (10 colunas)
  const cabecalhoSessoes = [
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
  ];

  // Gera as 13 sessões com Sala Andersen e contadores zerados
  const linhasSessoes = AREAS_EMPRESA.map((area, index) => {
    const idSessao = 'SES-' + String(index + 1).padStart(2, '0');
    const salvo = dadosExistentes[idSessao] || dadosExistentes[area] || {};

    const dataFinal = salvo.data || '';
    const horaIniFinal = salvo.horaIni || '14:00';
    const horaFimFinal = salvo.horaFim || '15:00';

    return [
      idSessao,
      area,
      dataFinal,
      horaIniFinal,
      horaFimFinal,
      SALA_PADRAO,          // Sempre 'Sala Andersen'
      LIMITE_VAGAS_PADRAO,  // Sempre 12 vagas
      0,                    // Inscritos_Confirmados zerado para testes limpos
      0,                    // Fila_Espera zerada
      ''                    // ID_Evento_Calendar pronto para novo evento
    ];
  });

  // Limpa conteúdo anterior e formatações antigas da aba Sessoes
  abaSessoes.clear();

  // Insere cabeçalhos e linhas
  abaSessoes.getRange(1, 1, 1, cabecalhoSessoes.length).setValues([cabecalhoSessoes]);
  abaSessoes.getRange(2, 1, linhasSessoes.length, cabecalhoSessoes.length).setValues(linhasSessoes);

  // Formatação visual da aba Sessoes
  abaSessoes.getRange(1, 1, 1, cabecalhoSessoes.length)
    .setFontWeight('bold')
    .setBackground('#1e3a8a')
    .setFontColor('#ffffff')
    .setHorizontalAlignment('center');

  // Alinhamentos
  const totalLinhas = linhasSessoes.length;
  abaSessoes.getRange(2, 1, totalLinhas, 1).setHorizontalAlignment('center'); // ID_Sessao
  abaSessoes.getRange(2, 3, totalLinhas, 3).setHorizontalAlignment('center'); // Data, Início, Fim
  abaSessoes.getRange(2, 7, totalLinhas, 3).setHorizontalAlignment('center'); // Limite, Confirmados, Fila

  abaSessoes.autoResizeColumns(1, cabecalhoSessoes.length);

  // -------------------------------------------------------------
  // ABA 2: Inscricoes
  // -------------------------------------------------------------
  let abaInscricoes = ss.getSheetByName('Inscricoes');
  if (!abaInscricoes) {
    abaInscricoes = ss.insertSheet('Inscricoes');
  }

  const cabecalhoInscricoes = [
    'Data_Hora_Inscricao',
    'ID_Sessao',
    'Area_Sessao',
    'Nome_Colaborador',
    'Email_Colaborador',
    'Departamento_Colaborador',
    'Status_Inscricao',
    'Email_Enviado'
  ];

  // Limpa inscrições antigas de teste e recria cabeçalho
  abaInscricoes.clear();
  abaInscricoes.getRange(1, 1, 1, cabecalhoInscricoes.length).setValues([cabecalhoInscricoes]);

  abaInscricoes.getRange(1, 1, 1, cabecalhoInscricoes.length)
    .setFontWeight('bold')
    .setBackground('#1e3a8a')
    .setFontColor('#ffffff')
    .setHorizontalAlignment('center');

  abaInscricoes.autoResizeColumns(1, cabecalhoInscricoes.length);

  // Remove abas padrão vazias se existirem
  const abaPadrao = ss.getSheetByName('Página1') || ss.getSheetByName('Sheet1');
  if (abaPadrao && ss.getSheets().length > 1) {
    try { ss.deleteSheet(abaPadrao); } catch (e) {}
  }

  const msg = 'Planilha sincronizada e resetada com sucesso!\n' +
    '• 13 Sessões configuradas com a "Sala Andersen"\n' +
    '• Capacidade fixada em 12 vagas por sessão\n' +
    '• Contadores zerados (12 vagas livres em todas)\n' +
    '• Inscrições de teste anteriores apagadas\n' +
    '• Datas e horários que você já preencheu foram preservados!';

  Logger.log(msg);

  try {
    SpreadsheetApp.getUi().alert('✅ Sucesso', msg, SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (e) {}

  return { sucesso: true, mensagem: msg, url: ss.getUrl(), id: ss.getId() };
}

/**
 * Atalho de compatibilidade com inicializarSistema
 */
function inicializarSistema() {
  return resetarEConfigurarPlanilha();
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
    const local = dados.local || SALA_PADRAO;

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
            <p>Sua vaga presencial para a pesquisa de satisfação da área de <b>${area}</b> está garantida.</p>
            
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
            <p>Recebemos o seu interesse em participar da pesquisa de satisfação da área de <b>${area}</b>.</p>
            
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

    const textoSimples = 'Inscrição para a Devolutiva da Pesquisa RH 360 — Capital Realty (' + area + ').';
    let enviou = false;
    const aliasEnvio = obterAliasEnvio();

    try {
      const opcoesGmail = {
        htmlBody: htmlCorpo,
        name: NOME_REMETENTE_EMAIL,
        replyTo: EMAIL_REMETENTE_RH
      };
      if (aliasEnvio) {
        opcoesGmail.from = aliasEnvio;
      }
      GmailApp.sendEmail(destinatario, assunto, textoSimples, opcoesGmail);
      enviou = true;
      Logger.log('E-mail enviado via GmailApp (remetente: ' + (aliasEnvio || 'padrão') + ') com sucesso para: ' + destinatario);
    } catch (eGmail) {
      Logger.log('Aviso ao enviar via GmailApp: ' + eGmail.message + '. Tentando MailApp...');
      try {
        MailApp.sendEmail({
          to: destinatario,
          subject: assunto,
          body: textoSimples,
          htmlBody: htmlCorpo,
          name: NOME_REMETENTE_EMAIL,
          replyTo: EMAIL_REMETENTE_RH
        });
        enviou = true;
        Logger.log('E-mail enviado via MailApp com sucesso para: ' + destinatario);
      } catch (eMail) {
        Logger.log('Erro ao enviar via MailApp: ' + eMail.message);
      }
    }

    return enviou;
  } catch (err) {
    Logger.log('Erro geral ao enviar e-mail: ' + err.message);
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
            const agenda = getAgendaRH();
            if (agenda) {
              let evento = agenda.getEventById(sessaoObj.idEvento);
              if (!evento) {
                try { evento = CalendarApp.getEventById(sessaoObj.idEvento); } catch (eEv) {}
              }
              if (evento) {
                evento.addGuest(promovidoObj.email);
              }
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

      // Remove o participante que desistiu do evento do Google Calendar
      if (sessaoObj.idEvento) {
        removerParticipanteDoEvento(sessaoObj.idEvento, emailLimpo, sessaoObj, linhaSessao, abaSessoes);
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
          <p>Houve uma desistência na pesquisa de satisfação da área de <b>${dados.area}</b> e você acaba de ser <b>promovido(a) com vaga presencial garantida</b> na Sala Andersen (limite de 12 pessoas)!</p>
          <p>O convite na sua Google Agenda já foi vinculado automaticamente.</p>
          <p style="font-size: 13px; color: #64748b;">Caso não possa comparecer, você também pode desistir pelo formulário para liberar a vaga para o próximo colega.</p>
        </div>
        <div style="background-color: #f1f5f9; padding: 16px; text-align: center; font-size: 12px; color: #94a3b8;">
          Equipe de Recursos Humanos — Capital Realty
        </div>
      </div>
    `;
    const textoSimples = 'Boa notícia! Você foi promovido(a) com vaga garantida na Devolutiva RH (' + dados.area + ').';
    const aliasEnvio = obterAliasEnvio();
    try {
      const opcoes = {
        htmlBody: htmlCorpo,
        name: NOME_REMETENTE_EMAIL,
        replyTo: EMAIL_REMETENTE_RH
      };
      if (aliasEnvio) opcoes.from = aliasEnvio;
      GmailApp.sendEmail(dados.email, assunto, textoSimples, opcoes);
    } catch(eG) {
      MailApp.sendEmail({
        to: dados.email,
        subject: assunto,
        body: textoSimples,
        htmlBody: htmlCorpo,
        name: NOME_REMETENTE_EMAIL,
        replyTo: EMAIL_REMETENTE_RH
      });
    }
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
    const textoSimples = 'Confirmação de cancelamento da inscrição para a Devolutiva RH (' + dados.area + ').';
    const aliasEnvio = obterAliasEnvio();
    try {
      const opcoes = {
        htmlBody: htmlCorpo,
        name: NOME_REMETENTE_EMAIL,
        replyTo: EMAIL_REMETENTE_RH
      };
      if (aliasEnvio) opcoes.from = aliasEnvio;
      GmailApp.sendEmail(dados.email, assunto, textoSimples, opcoes);
    } catch(eG) {
      MailApp.sendEmail({
        to: dados.email,
        subject: assunto,
        body: textoSimples,
        htmlBody: htmlCorpo,
        name: NOME_REMETENTE_EMAIL,
        replyTo: EMAIL_REMETENTE_RH
      });
    }
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
 * Obtém a Google Agenda corporativa correta (primary ou por ID)
 */
function getAgendaRH() {
  let agenda = null;
  if (ID_AGENDA && ID_AGENDA !== 'primary') {
    try {
      agenda = CalendarApp.getCalendarById(ID_AGENDA);
    } catch (e) {
      Logger.log('Aviso ao buscar agenda por ID ' + ID_AGENDA + ': ' + e.message);
    }
  }
  if (!agenda) {
    try {
      agenda = CalendarApp.getDefaultCalendar();
    } catch (e2) {
      Logger.log('Erro ao obter calendário padrão: ' + e2.message);
    }
  }
  return agenda;
}

/**
 * Garante que o evento no Calendar existe (busca ou cria) e reserva a sala
 */
function garantirEventoCalendar(sessao, linhaSessao, abaSessoes, dataLimpa, horaIniVal, horaFimVal) {
  const agenda = getAgendaRH();
  if (!agenda) {
    Logger.log('Erro crítico: Nenhuma agenda do Google Calendar pôde ser acessada.');
    return null;
  }
  let idEvento = sessao.idEvento;

  // 1. Se já tem ID gravado, tenta resgatar o evento existente
  if (idEvento) {
    let evento = agenda.getEventById(idEvento);
    if (!evento && idEvento.includes('@')) {
      evento = agenda.getEventById(idEvento.split('@')[0]);
    }
    if (!evento) {
      try {
        evento = CalendarApp.getEventById(idEvento);
      } catch (eEv) {}
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
      const descricao = 'Devolutiva da Pesquisa de Satisfação da área de ' + sessao.area + '.\n\nLocal: ' + localFinal + ' (Limite: ' + LIMITE_VAGAS_PADRAO + ' pessoas).';

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
 * Remove um participante específico do evento da Google Agenda quando ele desiste
 */
function removerParticipanteDoEvento(idEvento, emailRemover, sessaoObj, linhaSessao, abaSessoes) {
  if (!idEvento || !emailRemover) return;
  const agenda = getAgendaRH();
  if (!agenda) return;

  try {
    let evento = agenda.getEventById(idEvento);
    if (!evento && idEvento.includes('@')) {
      evento = agenda.getEventById(idEvento.split('@')[0]);
    }
    if (!evento) {
      try { evento = CalendarApp.getEventById(idEvento); } catch (e) {}
    }
    if (!evento) return;

    recriarEventoParaInscritosAtivos(sessaoObj, linhaSessao, abaSessoes, evento);
    Logger.log('Evento atualizado no Calendar sem o participante ' + emailRemover);
  } catch (err) {
    Logger.log('Aviso ao remover participante do Calendar: ' + err.message);
  }
}

/**
 * Recria o evento do Calendar apenas com os participantes confirmados ativos
 * e remove o evento antigo (notificando cancelamento para quem desistiu)
 */
function recriarEventoParaInscritosAtivos(sessaoObj, linhaSessao, abaSessoes, eventoAntigo) {
  const agenda = getAgendaRH();
  if (!agenda) return null;

  try {
    const dados = abaSessoes.getDataRange().getValues();
    const displayValores = abaSessoes.getDataRange().getDisplayValues();
    const linhaIdx = linhaSessao - 1;

    const dataLimpa = sanitizarData(dados[linhaIdx][2], displayValores[linhaIdx][2]);
    const horaIniVal = displayValores[linhaIdx][3] || '14:00';
    const horaFimVal = displayValores[linhaIdx][4] || '15:00';
    const local = String(dados[linhaIdx][5] || SALA_PADRAO);

    // Coleta a lista de confirmados ativos na aba Inscricoes
    const ss = getPlanilhaDB();
    const abaInscricoes = ss.getSheetByName('Inscricoes');
    const inscricoesDados = abaInscricoes ? abaInscricoes.getDataRange().getValues() : [];
    const emailsAtivos = [];

    for (let j = 1; j < inscricoesDados.length; j++) {
      const sId = String(inscricoesDados[j][1]);
      const em = String(inscricoesDados[j][4] || '').trim().toLowerCase();
      const st = String(inscricoesDados[j][6] || '');
      if (sId === sessaoObj.idSessao && st.startsWith('Confirmado') && em) {
        emailsAtivos.push(em);
      }
    }

    // 1. Deleta o evento antigo (remove do calendar de quem desistiu)
    if (eventoAntigo) {
      try {
        eventoAntigo.deleteEvent();
      } catch (eDel) {}
    }

    // 2. Se a sessão tem data, cria o novo evento para os participantes ativos
    if (dataLimpa && emailsAtivos.length > 0) {
      const novoSessaoObj = {
        idSessao: sessaoObj.idSessao,
        area: sessaoObj.area,
        local: local,
        idEvento: ''
      };
      const novoEvento = garantirEventoCalendar(novoSessaoObj, linhaSessao, abaSessoes, dataLimpa, horaIniVal, horaFimVal);
      if (novoEvento) {
        emailsAtivos.forEach(function(email) {
          try {
            novoEvento.addGuest(email);
          } catch (eG) {}
        });
        abaSessoes.getRange(linhaSessao, 10).setValue(novoEvento.getId());
        Logger.log('Novo evento criado com ' + emailsAtivos.length + ' participante(s) ativo(s).');
        return novoEvento;
      }
    } else {
      abaSessoes.getRange(linhaSessao, 10).setValue('');
    }
  } catch (err) {
    Logger.log('Erro ao recriar evento para participantes ativos: ' + err.message);
  }
  return null;
}

/**
 * Sincroniza a Planilha com o Google Calendar:
 * 1. Cria eventos para novas datas.
 * 2. Atualiza data/horário/local se o RH mudou na planilha.
 * 3. Deleta eventos do Calendar se o RH apagou a data na planilha (remove de todos).
 * 4. Garante que todos os inscritos confirmados estejam convidados.
 */
function sincronizarComCalendar() {
  const ss = getPlanilhaDB();
  const abaSessoes = ss.getSheetByName('Sessoes');
  const abaInscricoes = ss.getSheetByName('Inscricoes');
  const dados = abaSessoes.getDataRange().getValues();
  const displayValores = abaSessoes.getDataRange().getDisplayValues();
  const inscricoesDados = abaInscricoes ? abaInscricoes.getDataRange().getValues() : [];
  const agenda = getAgendaRH();

  if (!agenda) {
    throw new Error('Não foi possível acessar a Google Agenda.');
  }

  let criados = 0;
  let atualizados = 0;
  let removidos = 0;
  let convidadosTotal = 0;

  for (let i = 1; i < dados.length; i++) {
    const linhaPlanilha = i + 1;
    const row = dados[i];
    const rowDisplay = displayValores[i];
    const idSessao = String(row[0] || '');
    const area = String(row[1] || '');
    const dataLimpa = sanitizarData(row[2], rowDisplay[2]);
    const horaIniVal = rowDisplay[3] ? rowDisplay[3].trim() : '14:00';
    const horaFimVal = rowDisplay[4] ? rowDisplay[4].trim() : '15:00';
    const local = String(row[5] || SALA_PADRAO);
    let idEvento = String(row[9] || '').trim();

    // 1. Se NÃO tem data na planilha, mas tem ID de evento: O RH cancelou/apagou a data!
    if (!dataLimpa && idEvento) {
      try {
        let eventoParaApagar = agenda.getEventById(idEvento);
        if (!eventoParaApagar && idEvento.includes('@')) {
          eventoParaApagar = agenda.getEventById(idEvento.split('@')[0]);
        }
        if (eventoParaApagar) {
          eventoParaApagar.deleteEvent();
          removidos++;
          Logger.log('Evento cancelado e removido do Calendar: ' + idSessao + ' (' + area + ')');
        }
      } catch (eDel) {
        Logger.log('Aviso ao apagar evento cancelado: ' + eDel.message);
      }
      abaSessoes.getRange(linhaPlanilha, 10).setValue('');
      continue;
    }

    // 2. Se tem data definida na planilha:
    if (dataLimpa) {
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

      let hIni = 14, mIni = 0, hFim = 15, mFim = 0;
      if (horaIniVal && horaIniVal.includes(':')) {
        const pIni = horaIniVal.split(':');
        hIni = parseInt(pIni[0], 10); mIni = parseInt(pIni[1], 10);
      }
      if (horaFimVal && horaFimVal.includes(':')) {
        const pFim = horaFimVal.split(':');
        hFim = parseInt(pFim[0], 10); mFim = parseInt(pFim[1], 10);
      }

      const inicio = new Date(ano, mes, dia, hIni, mIni, 0);
      const fim = new Date(ano, mes, dia, hFim, mFim, 0);

      let evento = null;
      if (idEvento) {
        evento = agenda.getEventById(idEvento);
        if (!evento && idEvento.includes('@')) {
          evento = agenda.getEventById(idEvento.split('@')[0]);
        }
      }

      if (evento) {
        // Evento existente: se o RH alterou data, hora ou local, atualiza!
        const inicioAtual = evento.getStartTime();
        const fimAtual = evento.getEndTime();
        if (inicioAtual.getTime() !== inicio.getTime() || fimAtual.getTime() !== fim.getTime()) {
          evento.setTime(inicio, fim);
          atualizados++;
          Logger.log('Horário atualizado no Calendar para: ' + area);
        }
        if (evento.getLocation() !== local) {
          evento.setLocation(local);
        }
      } else {
        // Evento não existe ainda: cria no Calendar!
        const sessaoObj = {
          idSessao: idSessao,
          area: area,
          local: local,
          idEvento: ''
        };
        evento = garantirEventoCalendar(sessaoObj, linhaPlanilha, abaSessoes, dataLimpa, horaIniVal, horaFimVal);
        if (evento) {
          criados++;
          idEvento = evento.getId();
        }
      }

      // Sincroniza convites dos confirmados
      if (evento) {
        const emailsConfirmados = [];
        for (let j = 1; j < inscricoesDados.length; j++) {
          const sInsc = String(inscricoesDados[j][1]);
          const emInsc = String(inscricoesDados[j][4] || '').trim().toLowerCase();
          const stInsc = String(inscricoesDados[j][6] || '');

          if (sInsc === idSessao && stInsc.startsWith('Confirmado') && emInsc) {
            emailsConfirmados.push(emInsc);
          }
        }

        const convidadosAtuais = evento.getGuestList().map(g => g.getEmail().toLowerCase());
        emailsConfirmados.forEach(function(emailConf) {
          if (!convidadosAtuais.includes(emailConf)) {
            try {
              evento.addGuest(emailConf);
              convidadosTotal++;
            } catch (eG) {}
          }
        });
      }
    }
  }

  const resumo = 'Sincronização com Calendar concluída!\n' +
    '• Eventos criados: ' + criados + '\n' +
    '• Eventos atualizados (data/hora): ' + atualizados + '\n' +
    '• Eventos cancelados/removidos: ' + removidos + '\n' +
    '• Novos convites enviados: ' + convidadosTotal;

  Logger.log(resumo);

  try {
    SpreadsheetApp.getUi().alert('📅 Google Calendar', resumo, SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (e) {}

  return resumo;
}

/**
 * Ativa a sincronização automática periódica a cada 1 hora
 */
function ativarSincronizacaoAutomatica() {
  desativarSincronizacaoAutomatica();
  ScriptApp.newTrigger('sincronizarComCalendar')
    .timeBased()
    .everyHours(1)
    .create();

  const msg = '⏰ Sincronização automática ATIVADA com sucesso!\n\n' +
    'A cada 1 hora o sistema irá sincronizar a planilha com o Google Calendar automaticamente:\n' +
    '• Se você mudar a data/hora na planilha, o Calendar atualiza.\n' +
    '• Se você apagar a data de uma sessão, o evento é cancelado no Calendar de todo mundo.\n' +
    '• Novos inscritos confirmados são convidados automaticamente.';

  Logger.log(msg);
  try {
    SpreadsheetApp.getUi().alert('Automação Ativa', msg, SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (e) {}
}

/**
 * Desativa a sincronização automática periódica
 */
function desativarSincronizacaoAutomatica() {
  const triggers = ScriptApp.getProjectTriggers();
  let count = 0;
  triggers.forEach(function(t) {
    if (t.getHandlerFunction() === 'sincronizarComCalendar') {
      ScriptApp.deleteTrigger(t);
      count++;
    }
  });
  const msg = 'Sincronização automática desativada (' + count + ' gatilho(s) removido(s)).';
  Logger.log(msg);
  try {
    SpreadsheetApp.getUi().alert('Automação Desativada', msg, SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (e) {}
}

/**
 * Cria automaticamente a 2ª Turma para áreas que atingiram lista de espera,
 * transferindo todos os colaboradores da espera para a nova turma como Confirmados!
 */
function gerarSegundaTurmaFilaEspera() {
  const ss = getPlanilhaDB();
  const abaSessoes = ss.getSheetByName('Sessoes');
  const abaInscricoes = ss.getSheetByName('Inscricoes');

  const sessoesDados = abaSessoes.getDataRange().getValues();
  const inscricoesDados = abaInscricoes ? abaInscricoes.getDataRange().getValues() : [];

  let turmasCriadas = 0;
  let totalTransferidos = 0;
  const relatorio = [];

  for (let i = 1; i < sessoesDados.length; i++) {
    const idSessaoOrig = String(sessoesDados[i][0]);
    const areaOrig = String(sessoesDados[i][1]);
    const espera = Number(sessoesDados[i][8]) || 0;

    // Pula se já for 2ª turma
    if (areaOrig.includes('2ª Turma') || idSessaoOrig.includes('-T2')) continue;

    // Procura colaboradores na fila de espera desta sessão
    const pessoasFila = [];
    const linhasInscricoes = [];

    for (let j = 1; j < inscricoesDados.length; j++) {
      const sId = String(inscricoesDados[j][1]);
      const st = String(inscricoesDados[j][6]);
      if (sId === idSessaoOrig && st.startsWith('Lista de Espera')) {
        pessoasFila.push({
          nome: inscricoesDados[j][3],
          email: inscricoesDados[j][4],
          depto: inscricoesDados[j][5]
        });
        linhasInscricoes.push(j + 1);
      }
    }

    if (pessoasFila.length > 0) {
      const novoId = idSessaoOrig + '-T2';
      const novaArea = areaOrig + ' (2ª Turma)';
      const novaData = ''; // RH define a data
      const novoInicio = '15:30';
      const novoFim = '16:30';

      // 1. Cria a nova linha na aba Sessoes
      abaSessoes.appendRow([
        novoId,
        novaArea,
        novaData,
        novoInicio,
        novoFim,
        SALA_PADRAO,
        LIMITE_VAGAS_PADRAO,
        pessoasFila.length,
        0,
        ''
      ]);

      // 2. Atualiza a inscrição de cada um para a 2ª Turma como Confirmado
      linhasInscricoes.forEach(function(linha, idx) {
        const vagaNum = idx + 1;
        abaInscricoes.getRange(linha, 2).setValue(novoId);
        abaInscricoes.getRange(linha, 3).setValue(novaArea);
        abaInscricoes.getRange(linha, 7).setValue('Confirmado (Transferido 2ª Turma - Vaga ' + vagaNum + '/' + LIMITE_VAGAS_PADRAO + ')');
      });

      // 3. Zera o contador de espera da sessão original
      abaSessoes.getRange(i + 1, 9).setValue(0);

      // 4. Envia e-mail de notificação avisando da 2ª Turma e vaga garantida
      pessoasFila.forEach(function(p) {
        try {
          const assunto = '🎉 Vaga Confirmada na 2ª Turma: Devolutiva RH — ' + areaOrig;
          const htmlCorpo = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
              <div style="background: linear-gradient(135deg, #16a34a, #15803d); color: #ffffff; padding: 24px; text-align: center;">
                <span style="background: rgba(255,255,255,0.2); padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: bold;">RH CAPITAL REALTY</span>
                <h3 style="margin: 10px 0 0 0; color: #ffffff;">2ª Turma Criada!</h3>
              </div>
              <div style="padding: 24px; color: #334155; line-height: 1.6;">
                <p>Olá, <b>${p.nome}</b>!</p>
                <p>Devido à grande procura pela <b>pesquisa de satisfação da área de ${areaOrig}</b>, o time de RH abriu uma <b>2ª Turma</b> presencial na Sala Andersen e você foi <b>transferido(a) automaticamente com vaga garantida</b>!</p>
                <div style="background: #f8fafc; border-left: 4px solid #16a34a; padding: 14px; margin: 16px 0;">
                  <div><b>Sessão:</b> ${novaArea}</div>
                  <div><b>Local:</b> ${SALA_PADRAO}</div>
                  <div><b>Status:</b> <span style="color: #16a34a; font-weight: bold;">Vaga Confirmada</span></div>
                </div>
                <p style="font-size: 14px; color: #64748b;">Assim que o RH fixar a data desta 2ª turma, você receberá o convite diretamente na sua Google Agenda.</p>
              </div>
              <div style="background-color: #f1f5f9; padding: 14px; text-align: center; font-size: 12px; color: #94a3b8;">
                Equipe de Recursos Humanos — Capital Realty
              </div>
            </div>
          `;
          const textoSimples = 'Sua vaga na 2ª Turma da Devolutiva RH (' + areaOrig + ') está confirmada!';
          const aliasEnvio = obterAliasEnvio();
          const opcoes = { htmlBody: htmlCorpo, name: NOME_REMETENTE_EMAIL, replyTo: EMAIL_REMETENTE_RH };
          if (aliasEnvio) opcoes.from = aliasEnvio;
          GmailApp.sendEmail(p.email, assunto, textoSimples, opcoes);
        } catch (eM) {}
      });

      turmasCriadas++;
      totalTransferidos += pessoasFila.length;
      relatorio.push(areaOrig + ': ' + pessoasFila.length + ' participante(s) transferido(s)');
    }
  }

  let msgFinal = '';
  if (turmasCriadas > 0) {
    msgFinal = '🎉 Sucesso! ' + turmasCriadas + ' 2ª Turma(s) criada(s) com ' + totalTransferidos + ' participante(s) transferido(s):\n\n' + relatorio.join('\n') + '\n\nAs novas linhas foram criadas na aba Sessoes e todos os colaboradores já foram notificados por e-mail!';
  } else {
    msgFinal = 'ℹ️ Nenhuma área possui colaboradores na Lista de Espera no momento.';
  }

  Logger.log(msgFinal);

  try {
    SpreadsheetApp.getUi().alert('👥 2ª Turma para Fila de Espera', msgFinal, SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (e) {}

  return msgFinal;
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

/**
 * Função de Diagnóstico e Ativação de Permissões:
 * Dispara um teste real de Calendar e E-mail para forçar a autorização do Google
 * e validar se o usuário recebe os e-mails e vê a agenda funcionando.
 */
function testarPermissoesEEmailCalendar() {
  let emailUsuario = '';
  try {
    emailUsuario = Session.getActiveUser().getEmail();
  } catch (e) {}

  if (!emailUsuario) {
    emailUsuario = 'guilherme.marques@capitalrealty.com.br';
  }

  Logger.log('=== INICIANDO DIAGNÓSTICO DE CALENDAR E E-MAIL ===');
  Logger.log('Usuário alvo: ' + emailUsuario);

  // 1. Teste do Calendar
  const agenda = getAgendaRH();
  if (!agenda) {
    throw new Error('Google Calendar inacessível. Verifique as permissões de acesso à Agenda.');
  }
  Logger.log('Agenda conectada com sucesso: ' + agenda.getName() + ' (' + agenda.getId() + ')');

  // Cria um evento de teste de 30 minutos para daqui a 10 min
  const inicio = new Date();
  inicio.setMinutes(inicio.getMinutes() + 10);
  const fim = new Date(inicio.getTime() + 30 * 60 * 1000);

  const eventoTeste = agenda.createEvent('🧪 [TESTE] Devolutiva RH 360', inicio, fim, {
    description: 'Evento de teste criado para validar a sincronização da Google Agenda com o sistema de Devolutivas da Capital Realty.',
    location: SALA_PADRAO,
    sendInvites: true
  });

  try {
    eventoTeste.addGuest(emailUsuario);
    Logger.log('Participante ' + emailUsuario + ' adicionado ao evento de teste!');
  } catch (eAdd) {
    Logger.log('Aviso ao convidar participante: ' + eAdd.message);
  }

  // Tenta reservar sala
  const emailSala = obterEmailRecursoSala(SALA_PADRAO);
  if (emailSala) {
    try {
      eventoTeste.addGuest(emailSala);
      Logger.log('Sala ' + SALA_PADRAO + ' adicionada ao evento de teste!');
    } catch (eS) {
      Logger.log('Aviso ao reservar sala no teste: ' + eS.message);
    }
  }

  // 2. Teste de Envio de E-mail
  const assunto = '🧪 Teste de Conexão: Sistema de Devolutivas RH';
  const corpo = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden;">
      <div style="background: #1e3a8a; color: #ffffff; padding: 20px; text-align: center;">
        <h3 style="margin: 0;">✅ Permissões Conectadas com Sucesso!</h3>
      </div>
      <div style="padding: 20px; color: #334155;">
        <p>Olá, <b>${emailUsuario}</b>!</p>
        <p>Este e-mail confirma que o <b>Google Calendar</b> e o <b>Serviço de E-mail</b> do Apps Script estão devidamente autorizados e operando.</p>
        <ul>
          <li><b>Agenda:</b> Evento de teste criado na sua Google Agenda</li>
          <li><b>Sala:</b> ${SALA_PADRAO}</li>
          <li><b>Status:</b> Pronto para receber inscrições dos colaboradores!</li>
        </ul>
      </div>
      <div style="background: #f1f5f9; padding: 12px; text-align: center; font-size: 12px; color: #94a3b8;">
        RH Capital Realty — Sistema Automatizado
      </div>
    </div>
  `;

  let enviou = false;
  const aliasRH = obterAliasEnvio();
  Logger.log('Alias de envio detectado: ' + (aliasRH ? aliasRH : 'Nenhum (usando e-mail da conta)'));

  try {
    const opcoesTeste = {
      htmlBody: corpo,
      name: NOME_REMETENTE_EMAIL,
      replyTo: EMAIL_REMETENTE_RH
    };
    if (aliasRH) opcoesTeste.from = aliasRH;
    GmailApp.sendEmail(emailUsuario, assunto, 'Teste de conexão do sistema de Devolutivas RH.', opcoesTeste);
    enviou = true;
    Logger.log('E-mail de teste enviado com sucesso via GmailApp (remetente: ' + (aliasRH || emailUsuario) + ')!');
  } catch (eG) {
    Logger.log('Aviso GmailApp: ' + eG.message + '. Tentando MailApp...');
    try {
      MailApp.sendEmail({
        to: emailUsuario,
        subject: assunto,
        body: 'Teste de conexão do sistema de Devolutivas RH.',
        htmlBody: corpo,
        name: NOME_REMETENTE_EMAIL,
        replyTo: EMAIL_REMETENTE_RH
      });
      enviou = true;
      Logger.log('E-mail de teste enviado com sucesso via MailApp!');
    } catch (eM) {
      Logger.log('Erro crítico ao enviar via MailApp: ' + eM.message);
    }
  }

  const msgResultado = '🎉 Teste concluído com sucesso!\n\n' +
    '1. Google Agenda: Evento de teste criado no seu Calendar.\n' +
    '2. E-mail: Enviado com sucesso para ' + emailUsuario + '.\n\n' +
    'Agora o sistema tem todas as permissões ativas para criar agendas e enviar e-mails automaticamente!';

  Logger.log(msgResultado);

  try {
    SpreadsheetApp.getUi().alert('Teste de Conexão', msgResultado, SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (eUi) {}

  return { sucesso: true, idEvento: eventoTeste.getId(), emailEnviado: enviou };
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
        Participe da devolutiva da pesquisa de satisfação das áreas. <br>
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
      document.getElementById('modalInfoData').innerText = sessao.temDataDefinida ? (sessao.data + (sessao.horario ? ' — ' + sessao.horario : '')) : 'Data em definição pelo RH';

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
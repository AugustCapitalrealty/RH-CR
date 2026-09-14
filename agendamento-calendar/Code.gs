/**
 * ============================================================================
 * RH Capital Realty — Sistema de Inscrição para Devolutivas da Pesquisa RH
 * ============================================================================
 * 
 * Regras de Negócio:
 * - 13 Áreas avaliadas na pesquisa.
 * - Capacidade máxima da sala: 12 pessoas por sessão.
 * - Primeiros 12 inscritos: Vaga Confirmada + convite automático no Google Calendar.
 * - Ao atingir 12 inscritos (12/12): Vagas esgotadas, inscrições encerradas automaticamente.
 * - Identificação automática do colaborador via Google Workspace.
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
    'Vagas_Restantes',
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
      12,                   // Vagas_Restantes iniciais
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
 * Envia o e-mail corporativo estilizado de confirmação com dados do evento
 */
function enviarEmailInscricao(dados) {
  try {
    const destinatario = dados.email;
    const nome = dados.nome;
    const area = dados.area;
    const dataHoraStr = dados.dataHoraStr || 'A definir pelo RH';
    const local = dados.local || SALA_PADRAO;

    const assunto = '✅ Vaga Confirmada: Devolutiva RH — ' + area;
    const htmlCorpo = `
      <div style="font-family: 'Montserrat', 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 16px rgba(21,30,73,0.08);">
        
        <!-- Header Corporativo com Logo -->
        <div style="background: linear-gradient(135deg, #151E49 0%, #003D7B 100%); color: #ffffff; padding: 32px 24px; text-align: center; border-bottom: 3px solid #065CA9;">
          <img src="https://lh3.googleusercontent.com/d/1Tx9cwk1-1_P1TSGoXLZ828JNQ-rY-w6p" alt="Capital Realty" width="180" style="height: auto; width: 180px; max-width: 180px; display: inline-block; margin-bottom: 14px; border: 0;">
          <div>
            <span style="background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.25); color: #ffffff; padding: 4px 14px; border-radius: 20px; font-size: 11px; font-weight: 600; letter-spacing: 0.8px; text-transform: uppercase;">
              Recursos Humanos
            </span>
          </div>
          <h2 style="margin: 14px 0 6px 0; font-size: 23px; font-weight: 700; color: #ffffff;">Inscrição Confirmada!</h2>
          <p style="margin: 0; opacity: 0.9; font-size: 13.5px; color: #e2e8f0;">Devolutivas Abertas — Pesquisa de Satisfação Interdepartamental</p>
        </div>

        <!-- Corpo do E-mail -->
        <div style="padding: 32px 28px; color: #1e293b; line-height: 1.6;">
          <p style="font-size: 16px; margin-top: 0; color: #151E49;">Olá, <b>${nome}</b>!</p>
          <p style="color: #334155; font-size: 14.5px; line-height: 1.6; text-align: justify; margin-bottom: 24px;">
            Sua vaga presencial para a devolutiva da pesquisa de satisfação da área de <b style="color: #151E49;">${area}</b> está garantida.
          </p>
          
          <!-- Box de Informações da Sessão com Alinhamento Tabular Justificado -->
          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #065CA9; padding: 18px 20px; border-radius: 10px; margin-bottom: 22px;">
            <table style="width: 100%; border-collapse: collapse; font-size: 14.5px;">
              <tr>
                <td style="padding: 6px 0; color: #64748b; font-weight: 600; width: 130px; vertical-align: top;">Área:</td>
                <td style="padding: 6px 0; color: #151E49; font-weight: 700; vertical-align: top;">${area}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #64748b; font-weight: 600; vertical-align: top;">Data e Horário:</td>
                <td style="padding: 6px 0; color: #065CA9; font-weight: 700; vertical-align: top;">${dataHoraStr}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #64748b; font-weight: 600; vertical-align: top;">Local:</td>
                <td style="padding: 6px 0; color: #334155; font-weight: 600; vertical-align: top;">${local}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0 2px 0; color: #64748b; font-weight: 600; vertical-align: middle;">Status:</td>
                <td style="padding: 6px 0 2px 0; vertical-align: middle;">
                  <span style="background: rgba(22, 163, 74, 0.12); color: #15803d; padding: 4px 12px; border-radius: 12px; font-weight: 700; font-size: 12.5px; border: 1px solid rgba(22, 163, 74, 0.25); display: inline-block;">
                    &#10003; ${dados.status}
                  </span>
                </td>
              </tr>
            </table>
          </div>

          <!-- Alerta de Limite com Ícone Alinhado e Texto Justificado -->
          <div style="background-color: #fefce8; border: 1px solid #fef08a; border-radius: 10px; margin-bottom: 22px; padding: 14px 18px;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="width: 28px; vertical-align: top; font-size: 17px; line-height: 1.4;">
                  &#9888;&#65039;
                </td>
                <td style="font-size: 13px; color: #854d0e; line-height: 1.6; text-align: justify;">
                  <b>Importante:</b> A sala de reunião possui capacidade máxima de <b>12 pessoas</b>. Caso tenha algum imprevisto e não possa comparecer, por favor avise o time de RH ou utilize o sistema para registrar sua desistência e liberar a vaga para outros colegas!
                </td>
              </tr>
            </table>
          </div>

          <!-- Google Agenda com Ícone Alinhado e Texto Justificado -->
          <table style="width: 100%; border-collapse: collapse; margin-top: 8px;">
            <tr>
              <td style="width: 28px; vertical-align: top; font-size: 16px; line-height: 1.4;">
                &#128197;
              </td>
              <td style="font-size: 13.5px; color: #64748b; line-height: 1.55; text-align: justify;">
                O convite na sua Google Agenda já foi vinculado ou será atualizado assim que o cronograma for confirmado.
              </td>
            </tr>
          </table>
        </div>

        <!-- Rodapé do E-mail -->
        <div style="background-color: #f8fafc; padding: 20px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0;">
          <div style="font-weight: 600; color: #151E49; margin-bottom: 3px;">Capital Realty — Recursos Humanos</div>
          <div>Pesquisa de Satisfação Interdepartamental</div>
        </div>
      </div>
    `;

    const textoSimples = 'Sua vaga para a Devolutiva da Pesquisa de Satisfação Interdepartamental (' + area + ') está confirmada!';
    const aliasEnvio = obterAliasEnvio();

    try {
      const opcoes = {
        htmlBody: htmlCorpo,
        name: NOME_REMETENTE_EMAIL,
        replyTo: EMAIL_REMETENTE_RH
      };
      if (aliasEnvio) opcoes.from = aliasEnvio;
      GmailApp.sendEmail(destinatario, assunto, textoSimples, opcoes);
      Logger.log('E-mail de confirmação enviado para ' + destinatario + ' via GmailApp (from: ' + (aliasEnvio || 'padrão') + ')');
    } catch (eG) {
      Logger.log('Aviso GmailApp: ' + eG.message + '. Tentando MailApp...');
      MailApp.sendEmail({
        to: destinatario,
        subject: assunto,
        body: textoSimples,
        htmlBody: htmlCorpo,
        name: NOME_REMETENTE_EMAIL,
        replyTo: EMAIL_REMETENTE_RH
      });
      Logger.log('E-mail de confirmação enviado via MailApp para ' + destinatario);
    }
  } catch (err) {
    Logger.log('Erro ao enviar e-mail de inscrição: ' + err.message);
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

    // Limite rígido de 12 pessoas: sem lista de espera nem 2ª turma
    if (sessaoEncontrada.confirmados >= sessaoEncontrada.limite) {
      throw new Error('As vagas presenciais para a área de ' + sessaoEncontrada.area + ' já estão esgotadas (12/12).');
    }

    const agora = new Date();
    const carimbo = Utilities.formatDate(agora, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss');
    const numVaga = sessaoEncontrada.confirmados + 1;
    const statusFinal = 'Confirmado (Vaga ' + numVaga + '/' + sessaoEncontrada.limite + ')';

    // Atualiza contador na aba Sessoes (coluna 8 = Inscritos_Confirmados, coluna 9 = Vagas_Restantes)
    abaSessoes.getRange(linhaSessao, 8).setValue(numVaga);
    const vagasRestantes = Math.max(0, sessaoEncontrada.limite - numVaga);
    abaSessoes.getRange(linhaSessao, 9).setValue(vagasRestantes);

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

    // Dispara o e-mail automático de confirmação
    enviarEmailInscricao({
      email: emailLimpo,
      nome: nomeLimpo,
      area: sessaoEncontrada.area,
      dataHoraStr: sessaoEncontrada.dataHoraStr,
      local: sessaoEncontrada.local,
      status: statusFinal,
      confirmado: true
    });

    // Registra na aba Inscricoes
    abaInscricoes.appendRow([
      carimbo,
      dados.idSessao,
      sessaoEncontrada.area,
      nomeLimpo,
      emailLimpo,
      deptoLimpo,
      statusFinal,
      'Sim'
    ]);

    return {
      sucesso: true,
      confirmado: true,
      mensagem: 'Sua vaga presencial foi confirmada com sucesso! Um convite foi enviado para ' + emailLimpo + '.',
      status: statusFinal,
      area: sessaoEncontrada.area
    };
  } catch (err) {
    Logger.log('Erro ao realizar inscrição: ' + err.message);
    return { sucesso: false, erro: err.message };
  }
}

// ============================================================================
// 6. CANCELAMENTO / DESISTÊNCIA DE VAGA E PROMOÇÃO DA FILA
// ============================================================================

/**
 * Permite ao colaborador desistir da vaga, liberando o espaço para outros colegas
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
          status: st
        };
        break;
      }
    }

    if (!inscricaoAtiva) {
      throw new Error('Nenhuma inscrição ativa encontrada para este e-mail nesta sessão.');
    }

    const agora = new Date();
    const carimbo = Utilities.formatDate(agora, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss');

    // Marca como cancelado na planilha
    abaInscricoes.getRange(linhaInscricao, 7).setValue('Cancelado em ' + carimbo);

    // Decrementa contador de inscritos confirmados na aba Sessoes
    const novosConfirmados = Math.max(0, sessaoObj.confirmados - 1);
    abaSessoes.getRange(linhaSessao, 8).setValue(novosConfirmados);
    const vagasRestantes = Math.max(0, sessaoObj.limite - novosConfirmados);
    abaSessoes.getRange(linhaSessao, 9).setValue(vagasRestantes);

    // Remove do Google Calendar
    if (sessaoObj.idEvento) {
      try {
        removerParticipanteDoEvento(sessaoObj.idEvento, emailLimpo, sessaoObj, linhaSessao, abaSessoes);
      } catch (eR) {
        Logger.log('Aviso ao remover participante do Calendar: ' + eR.message);
      }
    }

    // Envia e-mail de confirmação do cancelamento
    enviarEmailCancelamento({
      email: emailLimpo,
      nome: inscricaoAtiva.nome,
      area: sessaoObj.area
    });

    const mensagemRetorno = 'Sua desistência foi registrada com sucesso e a vaga na sessão de ' + sessaoObj.area + ' foi reaberta para outros colegas.';

    return {
      sucesso: true,
      mensagem: mensagemRetorno
    };
  } catch (err) {
    Logger.log('Erro ao cancelar inscrição: ' + err.message);
    return { sucesso: false, erro: err.message };
  }
}

function enviarEmailCancelamento(dados) {
  try {
    const assunto = 'Confirmação de Cancelamento — Devolutiva RH: ' + dados.area;
    const htmlCorpo = `
      <div style="font-family: 'Montserrat', 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 16px rgba(21,30,73,0.08);">
        
        <!-- Header Corporativo com Logo -->
        <div style="background: linear-gradient(135deg, #475569 0%, #334155 100%); color: #ffffff; padding: 28px 24px; text-align: center; border-bottom: 3px solid #94a3b8;">
          <img src="https://lh3.googleusercontent.com/d/1Tx9cwk1-1_P1TSGoXLZ828JNQ-rY-w6p" alt="Capital Realty" width="170" style="height: auto; width: 170px; max-width: 170px; display: inline-block; margin-bottom: 12px; border: 0;">
          <div>
            <span style="background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.25); color: #ffffff; padding: 4px 14px; border-radius: 20px; font-size: 11px; font-weight: 600; letter-spacing: 0.8px; text-transform: uppercase;">
              Recursos Humanos
            </span>
          </div>
          <h3 style="margin: 12px 0 0 0; color: #ffffff; font-size: 20px; font-weight: 700;">Cancelamento Confirmado</h3>
        </div>

        <!-- Corpo do E-mail -->
        <div style="padding: 28px; color: #1e293b; line-height: 1.6;">
          <p style="font-size: 15px; margin-top: 0;">Olá, <b>${dados.nome}</b>!</p>
          <p style="color: #334155; text-align: justify; line-height: 1.6; margin-bottom: 12px;">Confirmamos que a sua inscrição para a Devolutiva da área de <b>${dados.area}</b> foi cancelada com sucesso.</p>
          <p style="color: #64748b; font-size: 13.5px; text-align: justify; line-height: 1.6; margin-bottom: 0;">Agradecemos por avisar com antecedência e liberar o espaço na sala para os seus colegas!</p>
        </div>

        <!-- Rodapé do E-mail -->
        <div style="background-color: #f8fafc; padding: 18px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0;">
          <div style="font-weight: 600; color: #151E49; margin-bottom: 3px;">Capital Realty — Recursos Humanos</div>
          <div>Pesquisa de Satisfação Interdepartamental</div>
        </div>
      </div>
    `;
    const textoSimples = 'Confirmação de cancelamento da inscrição para a Devolutiva da Pesquisa de Satisfação Interdepartamental (' + dados.area + ').';
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
        try {
          evento = agenda.getEventById(idEvento);
          if (!evento && idEvento.includes('@')) {
            evento = agenda.getEventById(idEvento.split('@')[0]);
          }
          if (evento) {
            evento.getTitle(); // Testa se o evento está vivo e não foi excluído
          }
        } catch (eGet) {
          Logger.log('Aviso: Evento ' + idEvento + ' não encontrado ou inacessível. Criando novo...');
          evento = null;
          idEvento = '';
        }
      }

      if (evento) {
        try {
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
        } catch (eAtt) {
          Logger.log('Erro ao atualizar horário de ' + area + ': ' + eAtt.message);
        }
      } else {
        // Evento não existe ainda ou foi apagado: cria no Calendar!
        try {
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
            Logger.log('Novo evento criado no Calendar para: ' + area + ' em ' + dataLimpa + ' às ' + horaIniVal);
          }
        } catch (eCriar) {
          Logger.log('Erro ao criar evento para ' + area + ': ' + eCriar.message);
        }
      }

      // Sincroniza convites dos confirmados
      if (evento) {
        try {
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
          const emailDonoAgenda = agenda.getId().toLowerCase();

          emailsConfirmados.forEach(function(emailConf) {
            if (emailConf === emailDonoAgenda) {
              Logger.log('Colaborador ' + emailConf + ' é o organizador/dono da agenda (o evento já consta na agenda dele).');
              return;
            }
            if (!convidadosAtuais.includes(emailConf)) {
              try {
                evento.addGuest(emailConf);
                convidadosTotal++;
                Logger.log('Convidado adicionado ao Calendar: ' + emailConf + ' na sessão ' + area);
              } catch (eG) {
                Logger.log('Aviso ao adicionar ' + emailConf + ': ' + eG.message);
              }
            }
          });
        } catch (eConv) {
          Logger.log('Erro ao sincronizar convidados de ' + area + ': ' + eConv.message);
        }
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

  const eventoTeste = agenda.createEvent('🧪 [TESTE] Devolutiva — Pesquisa de Satisfação Interdepartamental', inicio, fim, {
    description: 'Evento de teste criado para validar a sincronização da Google Agenda com o sistema de Devolutivas da Pesquisa de Satisfação Interdepartamental da Capital Realty.',
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
    <div style="font-family: 'Montserrat', 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 16px rgba(21,30,73,0.08);">
      <div style="background: linear-gradient(135deg, #151E49 0%, #003D7B 100%); color: #ffffff; padding: 28px 24px; text-align: center; border-bottom: 3px solid #065CA9;">
        <img src="https://lh3.googleusercontent.com/d/1Tx9cwk1-1_P1TSGoXLZ828JNQ-rY-w6p" alt="Capital Realty" width="180" style="height: auto; width: 180px; max-width: 180px; display: inline-block; margin-bottom: 12px; border: 0;">
        <h3 style="margin: 8px 0 0 0; color: #ffffff; font-size: 20px;">✅ Conexão Validada com Sucesso!</h3>
      </div>
      <div style="padding: 28px; color: #1e293b; line-height: 1.6;">
        <p style="font-size: 15px; margin-top: 0;">Olá, <b>${emailUsuario}</b>!</p>
        <p style="color: #334155;">Este e-mail confirma que o <b>Google Calendar</b> e o <b>Serviço de E-mail</b> do Apps Script estão devidamente autorizados e operando com a identidade visual da <b>Capital Realty</b>.</p>
        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #065CA9; padding: 16px; border-radius: 8px; margin: 20px 0;">
          <div style="margin-bottom: 6px;"><b>Agenda:</b> Evento de teste criado no Google Calendar</div>
          <div style="margin-bottom: 6px;"><b>Sala:</b> ${SALA_PADRAO}</div>
          <div><b>Status:</b> <span style="color: #15803d; font-weight: bold;">Pronto para operar</span></div>
        </div>
      </div>
      <div style="background: #f8fafc; padding: 16px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0;">
        Capital Realty — Recursos Humanos
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
  <title>Inscri&ccedil;&otilde;es &mdash; Devolutivas Pesquisa de Satisfa&ccedil;&atilde;o Interdepartamental | Capital Realty</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
  <style>
    :root {
      --cr-navy: #151E49;
      --cr-marine: #003D7B;
      --cr-blue: #065CA9;
      --cr-blue-hover: #054B88;
      --cr-bg: #F6F7F9;
      --cr-card: #FFFFFF;
      --cr-hairline: rgba(21, 30, 73, 0.08);
      --cr-text: #151E49;
      --cr-text-muted: #55627A;
      --cr-success: #15803D;
      --cr-success-bg: rgba(21, 128, 61, 0.10);
      --cr-warning: #B45309;
      --cr-warning-bg: rgba(245, 158, 11, 0.12);
      --cr-danger: #DC2626;
      --cr-danger-bg: rgba(220, 38, 38, 0.10);
      --cr-shadow-card: 0 2px 4px rgba(21, 30, 73, 0.03), 0 8px 24px rgba(21, 30, 73, 0.06);
      --cr-shadow-hover: 0 4px 8px rgba(21, 30, 73, 0.05), 0 16px 36px rgba(21, 30, 73, 0.10);
    }

    * {
      box-sizing: border-box;
    }

    body {
      background-color: var(--cr-bg);
      font-family: 'Montserrat', system-ui, -apple-system, sans-serif;
      color: var(--cr-text);
      min-height: 100vh;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }

    /* ==== HERO BANNER COM IDENTIDADE CAPITAL REALTY ==== */
    .hero-banner {
      background: linear-gradient(135deg, var(--cr-navy) 0%, var(--cr-marine) 100%);
      color: white;
      padding: 42px 20px 48px;
      border-radius: 0 0 28px 28px;
      box-shadow: 0 12px 30px rgba(21, 30, 73, 0.20);
      margin-bottom: 35px;
      position: relative;
    }

    .hero-banner::after {
      content: '';
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      height: 3px;
      background: linear-gradient(90deg, #065CA9, #003D7B, #065CA9);
      border-radius: 0 0 28px 28px;
    }

    .cr-logo-hero {
      height: 44px;
      width: auto;
      max-width: 90%;
      display: inline-block;
      transition: transform 0.2s ease;
      filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.25));
    }
    .cr-logo-hero:hover {
      transform: scale(1.02);
    }

    .hero-pill {
      background: rgba(255, 255, 255, 0.14);
      border: 1px solid rgba(255, 255, 255, 0.24);
      color: #ffffff;
      padding: 6px 18px;
      border-radius: 999px;
      display: inline-flex;
      align-items: center;
      gap: 7px;
      font-size: 0.82rem;
      font-weight: 600;
      letter-spacing: 0.6px;
      text-transform: uppercase;
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
    }

    .hero-title {
      font-weight: 800;
      font-size: 2rem;
      letter-spacing: -0.02em;
      margin-top: 14px;
      margin-bottom: 10px;
    }

    .hero-subtitle {
      font-size: 1.05rem;
      color: rgba(255, 255, 255, 0.92);
      line-height: 1.6;
      max-width: 680px;
      margin: 0 auto 18px;
    }

    .alert-capacidade {
      display: inline-block;
      background: rgba(245, 158, 11, 0.18);
      border: 1px solid rgba(245, 158, 11, 0.40);
      color: #FDE68A;
      font-weight: 600;
      padding: 4px 12px;
      border-radius: 8px;
      font-size: 0.9rem;
    }

    .user-pill {
      background: rgba(255, 255, 255, 0.12);
      border: 1px solid rgba(255, 255, 255, 0.22);
      padding: 8px 20px;
      border-radius: 30px;
      display: inline-flex;
      align-items: center;
      gap: 10px;
      font-size: 0.9rem;
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      margin-top: 12px;
    }

    /* ==== CARDS DAS SESSOES ==== */
    .card-sessao {
      border: 1px solid var(--cr-hairline);
      border-radius: 18px;
      box-shadow: var(--cr-shadow-card);
      transition: all 0.28s cubic-bezier(0.22, 1, 0.36, 1);
      background: var(--cr-card);
      height: 100%;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      position: relative;
    }

    .card-sessao:hover {
      transform: translateY(-4px);
      box-shadow: var(--cr-shadow-hover);
      border-color: rgba(6, 92, 169, 0.25);
    }

    .card-body {
      display: flex;
      flex-direction: column;
      flex: 1;
      padding: 24px;
    }

    .card-area-title {
      color: var(--cr-navy);
      font-weight: 700;
      font-size: 1.18rem;
      letter-spacing: -0.01em;
      line-height: 1.35;
    }

    .card-info-box {
      background: #F8FAFC;
      border: 1px solid rgba(21, 30, 73, 0.05);
      border-radius: 10px;
      padding: 10px 14px;
      margin-bottom: 16px;
      font-size: 0.88rem;
      color: #334155;
    }

    .badge-vaga {
      font-size: 0.82rem;
      padding: 6px 12px;
      border-radius: 20px;
      font-weight: 600;
      letter-spacing: 0.2px;
    }

    .badge-vagas-livres {
      background-color: var(--cr-success-bg);
      color: var(--cr-success);
      border: 1px solid rgba(21, 128, 61, 0.25);
    }

    .badge-ultimas-vagas {
      background-color: var(--cr-warning-bg);
      color: var(--cr-warning);
      border: 1px solid rgba(180, 83, 9, 0.25);
    }

    .badge-lotada {
      background-color: rgba(100, 116, 139, 0.12);
      color: #475569;
      border: 1px solid rgba(100, 116, 139, 0.20);
    }

    .badge-garantida {
      background-color: var(--cr-success);
      color: #ffffff;
      box-shadow: 0 2px 6px rgba(21, 128, 61, 0.25);
    }

    

    /* ==== BOTOES COM ACENTO CAPITAL REALTY ==== */
    .btn-primary, .btn-primary:active, .btn-primary:visited {
      background-color: var(--cr-blue) !important;
      border-color: var(--cr-blue) !important;
      color: #ffffff !important;
      box-shadow: 0 2px 6px rgba(6, 92, 169, 0.22);
    }

    .btn-primary:hover, .btn-primary:focus {
      background-color: var(--cr-blue-hover) !important;
      border-color: var(--cr-blue-hover) !important;
      color: #ffffff !important;
      box-shadow: 0 4px 12px rgba(6, 92, 169, 0.32);
    }

    .btn-inscrever {
      border-radius: 10px;
      font-weight: 600;
      padding: 11px 16px;
      font-size: 0.95rem;
      transition: all 0.2s ease;
    }

    .text-primary {
      color: var(--cr-blue) !important;
    }

    .btn-atualizar {
      border: 1px solid var(--cr-hairline);
      background: #ffffff;
      color: var(--cr-text-muted);
      font-weight: 600;
      transition: all 0.2s ease;
    }
    .btn-atualizar:hover {
      background: #F1F5F9;
      color: var(--cr-navy);
      border-color: rgba(21, 30, 73, 0.15);
    }

    /* ==== MODAL DE INSCRICAO & CANCELAMENTO ==== */
    .modal-content {
      border: 1px solid var(--cr-hairline);
      border-radius: 20px;
      box-shadow: 0 20px 48px rgba(21, 30, 73, 0.18);
    }

    .modal-header {
      background: #F8FAFC;
      border-bottom: 1px solid var(--cr-hairline);
      border-radius: 20px 20px 0 0;
      padding: 20px 24px;
    }

    .form-control:focus, .form-select:focus {
      border-color: var(--cr-blue);
      box-shadow: 0 0 0 3px rgba(6, 92, 169, 0.18);
    }

    .badge-google-id {
      background-color: var(--cr-success-bg);
      color: var(--cr-success);
      border: 1px solid rgba(21, 128, 61, 0.25);
      font-size: 0.78rem;
    }

    /* Rodape Institucional */
    .cr-footer {
      text-align: center;
      padding: 25px 20px 35px;
      color: var(--cr-text-muted);
      font-size: 0.85rem;
      border-top: 1px solid var(--cr-hairline);
      margin-top: 50px;
    }

    @media (max-width: 576px) {
      .hero-title { font-size: 1.55rem; }
      .cr-logo-hero { height: 38px; }
      .hero-banner { padding: 32px 16px 38px; }
      .card-body { padding: 18px; }
    }
  </style>
</head>
<body>

  <!-- Top Hero Banner com Identidade Visual Oficial -->
  <div class="hero-banner text-center">
    <div class="container" style="max-width: 820px;">
      
      <!-- Logo Oficial Capital Realty em Destaque -->
      <div class="mb-3">
        <img class="cr-logo-hero" src="data:image/png;base64,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" alt="Capital Realty &mdash; Infraestrutura Log&iacute;stica">
      </div>

      <!-- Badge do Setor -->
      <div class="mb-2">
        <span class="hero-pill">
          <i class="fa-solid fa-users me-1"></i> Recursos Humanos
        </span>
      </div>

      <h1 class="hero-title">Devolutivas Abertas &mdash; Pesquisa de Satisfação Interdepartamental</h1>
      
      <p class="hero-subtitle">
        Participe da devolutiva presencial da pesquisa de satisfa&ccedil;&atilde;o das &aacute;reas. <br>
        <span class="alert-capacidade mt-2 d-inline-block">
          <i class="fa-solid fa-triangle-exclamation me-1"></i> Limite de 12 pessoas na sala (ordem de inscri&ccedil;&atilde;o)
        </span>
      </p>

      <!-- Identificacao do Usuario Logado -->
      <div id="boxUsuarioLogado" style="display: none;">
        <div class="user-pill">
          <i class="fa-solid fa-circle-user text-warning fs-5"></i>
          <span>Conectado como: <b id="lblNomeUsuario">-</b> (<span id="lblEmailUsuario" class="opacity-90">-</span>)</span>
        </div>
      </div>

    </div>
  </div>

  <!-- Content Container -->
  <div class="container mb-5">

    <div class="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-2">
      <div>
        <h4 class="fw-bold mb-1"><i class="fa-regular fa-calendar-check text-primary me-2"></i>Escolha uma &Aacute;rea</h4>
        <p class="text-muted mb-0 small">Limite de 12 vagas por área na Sala Andersen. Garanta sua participação presencial por ordem de inscrição.</p>
      </div>
      <button class="btn btn-atualizar btn-sm rounded-pill px-3 py-2" onclick="carregarSessoes()">
        <i class="fa-solid fa-arrows-rotate me-1 text-primary"></i> Atualizar
      </button>
    </div>

    <!-- Loading State -->
    <div id="loadingBox" class="text-center py-5">
      <div class="spinner-border text-primary" role="status"></div>
      <p class="text-muted mt-2">Carregando sess&otilde;es dispon&iacute;veis...</p>
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
              <i class="fa-solid fa-circle-info me-1"></i> Ao confirmar, sua vaga será liberada imediatamente para outros colegas.
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
          badgeHtml = '<span class="badge bg-success text-white badge-vaga"><i class="fa-solid fa-circle-check me-1"></i>Sua vaga est&aacute; garantida!</span>';
          btnHtml = \`
            <button class="btn btn-outline-danger w-100 btn-inscrever" onclick="abrirModalCancelamento(\'\${s.idSessao}\')">
              <i class="fa-solid fa-arrow-right-from-bracket me-1"></i> Desistir da Vaga
            </button>
          \`;
        } else {
          // O usuário não está inscrito nesta sessão
          if (!s.lotado) {
            const restantes = s.vagasRestantes;
            if (restantes <= 3) {
              badgeHtml = '<span class="badge bg-warning text-dark badge-vaga"><i class="fa-solid fa-clock me-1"></i>&Uacute;ltimas ' + restantes + ' vagas!</span>';
            } else {
              badgeHtml = '<span class="badge badge-vaga badge-vagas-livres"><i class="fa-solid fa-circle-check me-1"></i>' + restantes + ' vagas livres</span>';
            }
            btnHtml = \`
              <button class="btn btn-primary w-100 btn-inscrever" onclick="abrirModalInscricao(\'\${s.idSessao}\')">
                Garantir Minha Vaga
              </button>
            \`;
          } else {
            badgeHtml = '<span class="badge badge-vaga badge-lotada"><i class="fa-solid fa-ban me-1"></i>Vagas Esgotadas (12/12)</span>';
            btnHtml = \`
              <button class="btn btn-secondary w-100 btn-inscrever" disabled style="opacity: 0.65; cursor: not-allowed;">
                <i class="fa-solid fa-lock me-1"></i> Inscrições Esgotadas
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
                <h5 class="card-area-title mb-0">\${s.area}</h5>
              </div>
              <div class="card-info-box small">
                \${dataFormatada} <br>
                <span class="text-muted"><i class="fa-solid fa-location-dot text-primary me-1"></i>\${s.local}</span>
              </div>
              <div class="d-flex align-items-center justify-content-between mb-4">
                \${badgeHtml}
                <small class="text-muted fw-semibold">\${s.confirmados}/\${s.limite} inscritos</small>
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
      if (sessao.lotado) {
        alert('As vagas para a área de ' + sessao.area + ' já estão esgotadas.');
        return;
      }

      document.getElementById('modalIdSessao').value = sessao.idSessao;
      document.getElementById('modalAreaTitulo').innerText = 'Devolutiva: ' + sessao.area;
      document.getElementById('modalInfoData').innerText = sessao.temDataDefinida ? (sessao.data + (sessao.horario ? ' — ' + sessao.horario : '')) : 'Data em definição pelo RH';

      const aviso = document.getElementById('modalAvisoStatus');
      aviso.className = 'alert alert-success small py-2';
      aviso.innerHTML = '<i class="fa-solid fa-circle-check me-1"></i> Vaga presencial disponível (Restam ' + sessao.vagasRestantes + ' de 12 vagas).';

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
      document.getElementById('btnConfirmar').innerText = 'Confirmar Minha Vaga';

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
              <div class="alert alert-success text-start">
                <h5 class="fw-bold">🎉 Vaga Confirmada!</h5>
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

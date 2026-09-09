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

function obterSessoes() {
  try {
    const ss = getPlanilhaDB();
    const abaSessoes = ss.getSheetByName('Sessoes');
    if (!abaSessoes) throw new Error('Aba "Sessoes" não encontrada.');

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
      const local = String(row[5] || 'Sala de Reunião Principal');
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

      sessoes.push({
        idSessao: idSessao,
        area: area,
        data: dataStr, // Retorna '' se não tiver data definida
        temDataDefinida: Boolean(dataStr),
        horario: horarioFormatado,
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
          local: sessoesDados[i][5] || 'Sala de Reunião Principal',
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

      // Adiciona convidado no Calendar se o evento já existir
      if (sessaoEncontrada.idEvento) {
        try {
          const agenda = CalendarApp.getCalendarById(ID_AGENDA);
          const evento = agenda.getEventById(sessaoEncontrada.idEvento);
          if (evento) {
            evento.addGuest(emailLimpo);
          }
        } catch (eCal) {
          Logger.log('Erro ao convidar no Calendar: ' + eCal.message);
        }
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
// 5. SINCRONIZAÇÃO COM GOOGLE CALENDAR
// ============================================================================

function sincronizarComCalendar() {
  const ss = getPlanilhaDB();
  const abaSessoes = ss.getSheetByName('Sessoes');
  const dados = abaSessoes.getDataRange().getValues();
  const displayValores = abaSessoes.getDataRange().getDisplayValues();
  const agenda = CalendarApp.getCalendarById(ID_AGENDA);

  let criados = 0;

  for (let i = 1; i < dados.length; i++) {
    const row = dados[i];
    const rowDisplay = displayValores[i];
    const area = row[1];
    const dataLimpa = sanitizarData(row[2], rowDisplay[2]);
    const horaIniVal = rowDisplay[3] || '14:00';
    const horaFimVal = rowDisplay[4] || '15:00';
    const local = row[5] || 'Sala de Reunião';
    let idEvento = row[9];

    if (dataLimpa && !idEvento) {
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
        const pIni = horaIniVal.split(':');
        if (pIni.length >= 2) { horaIni = parseInt(pIni[0], 10); minIni = parseInt(pIni[1], 10); }
        const pFim = horaFimVal.split(':');
        if (pFim.length >= 2) { horaFim = parseInt(pFim[0], 10); minFim = parseInt(pFim[1], 10); }

        const inicio = new Date(ano, mes, dia, horaIni, minIni, 0);
        const fim = new Date(ano, mes, dia, horaFim, minFim, 0);

        const titulo = '📊 Devolutiva Pesquisa RH — ' + area;
        const descricao = 'Apresentação aberta dos resultados da Pesquisa RH 360 para a área: ' + area + '.\n\nCapacidade máxima da sala: ' + LIMITE_VAGAS_PADRAO + ' pessoas.';

        const evento = agenda.createEvent(titulo, inicio, fim, {
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

  <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
  <script>
    let sessoesCache = [];
    let modalInstance = null;
    let usuarioConectado = null;

    window.onload = function() {
      modalInstance = new bootstrap.Modal(document.getElementById('modalInscricao'));
      detectarUsuario();
      carregarSessoes();
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
        })
        .obterUsuarioLogado();
    }

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
      document.getElementById('modalInfoData').innerText = sessao.temDataDefinida ? (sessao.data + (sessao.horario ? ' às ' + sessao.horario : '')) : 'Data em definição pelo RH';

      const aviso = document.getElementById('modalAvisoStatus');
      if (!sessao.lotado) {
        aviso.className = 'alert alert-success small py-2';
        aviso.innerHTML = '<i class="fa-solid fa-circle-check me-1"></i> Vaga presencial disponível (Restam ' + sessao.vagasRestantes + ' de 12 vagas).';
      } else {
        aviso.className = 'alert alert-warning small py-2 text-dark';
        aviso.innerHTML = '<i class="fa-solid fa-info-circle me-1"></i> A sala atingiu 12 pessoas. Você entrará na <b>Lista de Espera</b> para a 2ª turma!';
      }

      // Se o usuário já foi identificado pelo Google Workspace
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
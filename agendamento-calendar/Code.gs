/**
 * Agendamento de Horários - RH Capital Realty
 * Integrado ao Google Calendar
 */

// ID da agenda do RH (use 'primary' para a agenda principal da conta ou o e-mail do calendário compartilhado)
const ID_AGENDA = 'primary';

// Duração padrão de cada agendamento em minutos
const DURACAO_MINUTOS = 30;

// Horário comercial permitido para agendamentos
const HORA_INICIO_EXPEDIENTE = 9;  // 09:00
const HORA_FIM_EXPEDIENTE = 18;   // 18:00

/**
 * Ponto de entrada do Web App
 */
function doGet(e) {
  return HtmlService.createHtmlOutput(getHtmlInterface())
    .setTitle('Agendamento de Entrevistas - RH')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * Retorna os slots disponíveis para uma determinada data (formato YYYY-MM-DD)
 */
function obterHorariosDisponiveis(dataStr) {
  try {
    const dataPartes = dataStr.split('-');
    const ano = parseInt(dataPartes[0], 10);
    const mes = parseInt(dataPartes[1], 10) - 1;
    const dia = parseInt(dataPartes[2], 10);

    const inicioDia = new Date(ano, mes, dia, HORA_INICIO_EXPEDIENTE, 0, 0);
    const fimDia = new Date(ano, mes, dia, HORA_FIM_EXPEDIENTE, 0, 0);

    const agora = new Date();
    if (inicioDia < agora) {
      // Ajusta para não permitir horários passados no dia de hoje
      if (fimDia <= agora) return [];
    }

    const agenda = CalendarApp.getCalendarById(ID_AGENDA);
    if (!agenda) {
      throw new Error('Agenda não encontrada: ' + ID_AGENDA);
    }

    const eventos = agenda.getEvents(inicioDia, fimDia);
    const slotsDisponiveis = [];

    let slotAtual = new Date(inicioDia);
    while (slotAtual < fimDia) {
      const fimSlot = new Date(slotAtual.getTime() + DURACAO_MINUTOS * 60000);
      if (fimSlot > fimDia) break;

      // Não exibe horário se já passou
      if (slotAtual > agora) {
        // Verifica se há conflito com algum evento existente
        const conflito = eventos.some(function(evento) {
          return (slotAtual < evento.getEndTime() && fimSlot > evento.getStartTime());
        });

        if (!conflito) {
          slotsDisponiveis.push(Utilities.formatDate(slotAtual, Session.getScriptTimeZone(), 'HH:mm'));
        }
      }

      slotAtual = fimSlot;
    }

    return { sucesso: true, horarios: slotsDisponiveis };
  } catch (err) {
    return { sucesso: false, erro: err.message };
  }
}

/**
 * Realiza o agendamento no Google Calendar
 */
function confirmarAgendamento(dados) {
  try {
    // dados: { nome, email, telefone, dataStr, horario, observacoes }
    if (!dados.nome || !dados.email || !dados.dataStr || !dados.horario) {
      throw new Error('Campos obrigatórios ausentes.');
    }

    const partesData = dados.dataStr.split('-');
    const partesHora = dados.horario.split(':');
    const ano = parseInt(partesData[0], 10);
    const mes = parseInt(partesData[1], 10) - 1;
    const dia = parseInt(partesData[2], 10);
    const hora = parseInt(partesHora[0], 10);
    const minuto = parseInt(partesHora[1], 10);

    const inicio = new Date(ano, mes, dia, hora, minuto, 0);
    const fim = new Date(inicio.getTime() + DURACAO_MINUTOS * 60000);

    const agenda = CalendarApp.getCalendarById(ID_AGENDA);
    const titulo = 'Entrevista RH: ' + dados.nome;
    const descricao = 'Agendamento de Entrevista via formulário do RH.\n\n' +
      'Nome: ' + dados.nome + '\n' +
      'E-mail: ' + dados.email + '\n' +
      'Telefone: ' + (dados.telefone || '-') + '\n' +
      'Observações: ' + (dados.observacoes || '-');

    const evento = agenda.createEvent(titulo, inicio, fim, {
      description: descricao,
      guests: dados.email,
      sendInvites: true
    });

    return { sucesso: true, idEvento: evento.getId() };
  } catch (err) {
    return { sucesso: false, erro: err.message };
  }
}

/**
 * Retorna o HTML do formulário de agendamento
 */
function getHtmlInterface() {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Agendamento com o RH</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css">
  <style>
    body { background-color: #f8fafc; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
    .card-agenda { max-width: 600px; margin: 40px auto; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); border: none; }
    .header-box { background: linear-gradient(135deg, #1e3a8a, #3b82f6); color: white; padding: 24px; border-radius: 12px 12px 0 0; }
    .btn-horario { margin: 4px; border-radius: 8px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="card card-agenda">
      <div class="header-box text-center">
        <h3>📅 Agendamento de Entrevista</h3>
        <p class="mb-0 text-white-50">Selecione uma data e horário para falar com o time de RH</p>
      </div>
      <div class="card-body p-4" id="app">
        <div class="mb-3">
          <label class="form-label fw-bold">1. Escolha a data:</label>
          <input type="date" id="dataInput" class="form-control" onchange="carregarHorarios()">
        </div>
        <div class="mb-3" id="boxHorarios" style="display:none;">
          <label class="form-label fw-bold">2. Escolha o horário:</label>
          <div id="listaHorarios" class="d-flex flex-wrap gap-2"></div>
        </div>
        <div id="boxFormulario" style="display:none;">
          <hr>
          <h5 class="fw-bold mb-3">3. Seus dados:</h5>
          <div class="mb-2">
            <label class="form-label">Nome completo *</label>
            <input type="text" id="nome" class="form-control" required>
          </div>
          <div class="mb-2">
            <label class="form-label">E-mail *</label>
            <input type="email" id="email" class="form-control" required>
          </div>
          <div class="mb-2">
            <label class="form-label">Telefone / WhatsApp</label>
            <input type="tel" id="telefone" class="form-control">
          </div>
          <div class="mb-3">
            <label class="form-label">Observações / Vaga de interesse</label>
            <textarea id="observacoes" class="form-control" rows="2"></textarea>
          </div>
          <button class="btn btn-primary w-100 py-2 fw-bold" onclick="enviarAgendamento()" id="btnConfirmar">
            Confirmar Agendamento
          </button>
        </div>
        <div id="msgSucesso" class="alert alert-success text-center mt-3" style="display:none;"></div>
        <div id="msgErro" class="alert alert-danger text-center mt-3" style="display:none;"></div>
      </div>
    </div>
  </div>
  <script>
    let horarioSelecionado = null;

    // Define data mínima como hoje
    document.getElementById('dataInput').min = new Date().toISOString().split('T')[0];

    function carregarHorarios() {
      const data = document.getElementById('dataInput').value;
      if (!data) return;
      const lista = document.getElementById('listaHorarios');
      lista.innerHTML = '<span class="text-muted">Buscando horários disponíveis...</span>';
      document.getElementById('boxHorarios').style.display = 'block';

      google.script.run
        .withSuccessHandler(function(res) {
          lista.innerHTML = '';
          if (!res.sucesso || !res.horarios.length) {
            lista.innerHTML = '<span class="text-danger">Nenhum horário disponível para esta data.</span>';
            return;
          }
          res.horarios.forEach(function(h) {
            const btn = document.createElement('button');
            btn.className = 'btn btn-outline-primary btn-horario';
            btn.innerText = h;
            btn.onclick = function() {
              document.querySelectorAll('.btn-horario').forEach(b => b.classList.remove('btn-primary', 'text-white'));
              btn.classList.add('btn-primary', 'text-white');
              horarioSelecionado = h;
              document.getElementById('boxFormulario').style.display = 'block';
            };
            lista.appendChild(btn);
          });
        })
        .withFailureHandler(function(err) {
          lista.innerHTML = '<span class="text-danger">Erro ao carregar: ' + err.message + '</span>';
        })
        .obterHorariosDisponiveis(data);
    }

    function enviarAgendamento() {
      const nome = document.getElementById('nome').value.trim();
      const email = document.getElementById('email').value.trim();
      const telefone = document.getElementById('telefone').value.trim();
      const observacoes = document.getElementById('observacoes').value.trim();
      const dataStr = document.getElementById('dataInput').value;

      if (!nome || !email || !horarioSelecionado) {
        alert('Por favor, preencha nome, e-mail e selecione um horário.');
        return;
      }

      const btn = document.getElementById('btnConfirmar');
      btn.disabled = true;
      btn.innerText = 'Agendando...';

      google.script.run
        .withSuccessHandler(function(res) {
          if (res.sucesso) {
            document.getElementById('app').innerHTML = '<div class="alert alert-success text-center py-4"><h4>🎉 Agendamento Confirmado!</h4><p>Enviamos os detalhes e o link do convite para <b>' + email + '</b>.</p></div>';
          } else {
            alert('Erro: ' + res.erro);
            btn.disabled = false;
            btn.innerText = 'Confirmar Agendamento';
          }
        })
        .withFailureHandler(function(err) {
          alert('Erro ao agendar: ' + err.message);
          btn.disabled = false;
          btn.innerText = 'Confirmar Agendamento';
        })
        .confirmarAgendamento({ nome, email, telefone, observacoes, dataStr, horario: horarioSelecionado });
    }
  </script>
</body>
</html>`;
}

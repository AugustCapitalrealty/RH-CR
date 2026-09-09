# 📅 Agendamento de Horários — Google Calendar (RH)

Web App desenvolvido em **Google Apps Script** conectado ao **Google Calendar** do time de RH.

Permite que o RH envie um link público para candidatos ou colaboradores, onde a pessoa:
1. Visualiza os dias e horários disponíveis na agenda do RH.
2. Seleciona o melhor horário para a entrevista/reunião.
3. Preenche seus dados (nome, e-mail, telefone/observações).
4. O sistema cria o evento automaticamente no Google Calendar com Google Meet e envia convites por e-mail para ambas as partes.

---

## 📁 Estrutura de Arquivos
* `appsscript.json`: Manifesto de permissões do Google Apps Script (acesso a Agenda e E-mail).
* `Code.gs`: Lógica de backend (consulta de horários livres, criação de eventos no Calendar) e frontend do formulário.
* `.clasp.json`: Arquivo de sincronização local do Clasp.

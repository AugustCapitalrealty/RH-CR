# 📊 Sistema de Inscrição — Devolutivas da Pesquisa RH

Web App desenvolvido em **Google Apps Script** conectado ao **Google Sheets** e **Google Calendar** para gerenciar a participação aberta dos colaboradores nas devolutivas das **13 áreas** da Capital Realty.

---

## 🎯 Regras de Negócio e Funcionamento

1. **Capacidade da Sala:** Limite de **12 pessoas** por sessão.
2. **Ordem de Chegada:**
   * **1º ao 12º inscrito:** Recebe **Vaga Confirmada** na sala e é adicionado automaticamente ao evento do Google Calendar (com convite por e-mail).
   * **13º em diante:** O sistema avisa que as 12 vagas foram esgotadas e registra o colaborador na **Lista de Espera** para viabilizar a abertura de uma 2ª turma pelo RH.
3. **13 Áreas Disponíveis:**
   * *Planejamento & Gestão, Administrativo/Secretárias, Arquitetura, Comercial/Marketing, Deminvest, Diretoria, Engenharia, Facilities, Financeiro/Contábil, Jurídico, Propriedades, Recursos Humanos e Tecnologia da Informação.*
4. **Sem Duplicidade:** Bloqueia inscrições repetidas do mesmo e-mail na mesma área.

---

## ⚙️ Configuração Inicial (Passo a Passo)

### 1. Inicializar o Banco de Dados (Google Sheets)
No editor do Google Apps Script:
1. No menu superior de funções, selecione **`inicializarSistema`** e clique em **Executar**.
2. O script criará automaticamente a planilha **"RH Capital Realty — Gestão de Devolutivas"** no Google Drive (se você não definiu um ID prévio) com as abas `Sessoes` e `Inscricoes`.
3. Abra o Log de Execução para ver a URL da planilha gerada.

### 2. Definir Datas e Horários
Na aba `Sessoes` da planilha:
* Preencha a coluna **Data** e **Horário** para cada uma das 13 áreas.

### 3. Criar os Eventos no Google Calendar
* Execute a função **`sincronizarComCalendar`** no Apps Script.
* O script lerá as datas preenchidas e criará automaticamente os eventos na sua Google Agenda, salvando os IDs dos eventos na planilha.

### 4. Publicar o Web App
* Clique em **Implantar > Gerenciar implantações > ✏️ > Nova versão > Implantar**.
* Compartilhe a URL do Web App com os colaboradores!
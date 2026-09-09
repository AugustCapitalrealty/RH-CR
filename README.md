# ===============================================
# RH Capital Realty — Automações Google Apps Script
# ===============================================

Monorepo contendo as ferramentas e automações desenvolvidas em **Google Apps Script** para o setor de Recursos Humanos da Capital Realty.

---

## 📂 Projetos no Repositório

### 1. [Pesquisa de Satisfação (RH 360)](./pesquisa-satisfacao)
* **Objetivo:** Formulário web público e anônimo para avaliação interdepartamental, com painel gerencial no Google Sheets e geração automatizada de apresentações de resultados no Google Slides.
* **Pasta:** `pesquisa-satisfacao/`
* **Tecnologias:** Google Apps Script, Google Sheets, Google Slides, HTML5/CSS3.

### 2. [Agendamento de Entrevistas (Google Calendar)](./agendamento-calendar)
* **Objetivo:** Web App para candidatos e colaboradores escolherem horários vagos e agendarem entrevistas/reuniões automaticamente no Google Calendar do RH com link do Google Meet e convite por e-mail.
* **Pasta:** `agendamento-calendar/`
* **Tecnologias:** Google Apps Script, Google Calendar API, HTML5/Bootstrap.

---

## 🚀 Como Desenvolver Localmente com o Clasp

Cada projeto possui sua própria configuração independente do **Clasp** (`.clasp.json`).

### Para trabalhar na Pesquisa de Satisfação:
```bash
cd pesquisa-satisfacao
clasp status
clasp push
```

### Para trabalhar no Agendamento Calendar:
```bash
cd agendamento-calendar
clasp status
clasp push
```

---

## 🔄 Fluxo do Git
```bash
git add .
git commit -m "Sua mensagem aqui"
git push
```

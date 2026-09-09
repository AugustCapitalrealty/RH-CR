# 📊 Pesquisa de Satisfação Interdepartamental — Google Apps Script

Versão da **Pesquisa RH 360º** (originalmente feita no Lovable/React+Supabase) reconstruída em **Google Apps Script + Google Sheets**, sem necessidade de login. Serve um formulário web público, anônimo, e grava as respostas numa planilha do Google.

---

## 📁 Arquivos do projeto

| Arquivo | O que é |
|---|---|
| `appsscript.json` | Manifesto do projeto (fuso horário, escopos OAuth, runtime V8). |
| `main.gs` | **Frontend + roteamento.** Todo o HTML/CSS/JS do formulário está dentro da função `getFormHTML()`. Também contém `doGet`, `doPost` e `submitForm`. |
| `sheets.gs` | **Backend de dados.** Grava respostas na planilha e calcula estatísticas. |
| `painel.gs` | **Painel do RH.** Dashboard de resultados, na mesma URL + `?page=painel`. Protegido por senha. |
| `README.md` | Este arquivo. |

> ⚠️ O `main.gs` é grande (~100 KB) porque a **logo da Capital Realty está embutida em base64** dentro do HTML. Isso é necessário: o Apps Script bloqueia imagens externas (CSP). É normal.

---

## 🎯 Sequência de operação (resumo rápido)

### A) Primeira vez — colocar no ar

| # | O que fazer | Onde |
|---|---|---|
| 1 | Colar `main.gs`, `sheets.gs` e `painel.gs` nos três arquivos, trocar `ID_PLANILHA` e **salvar** (Ctrl+S) | Editor |
| 2 | Executar **`inicializarPlanilha()`** e autorizar o acesso | Menu *Executar* |
| 3 | Executar **`inserirDadosDeTeste()`** — cria respostas fictícias | Menu *Executar* |
| 4 | Executar **`gerarIndicadores()`** — gera as 4 abas de análise | Menu *Executar* |
| 5 | Conferir as abas **PAINEL**, **POR_PERGUNTA**, **RESUMO_PERGUNTAS**, **COMENTARIOS** e validar o formato com a diretoria | Planilha |
| 6 | Executar **`apagarDadosDeTeste()`** — remove só as respostas fictícias | Menu *Executar* |
| 7 | *Implantar → Nova implantação → App da Web* (Executar como: **Eu**, Acesso: **Qualquer pessoa**) e copiar a URL | Editor |
| 8 | Compartilhar a URL com os colaboradores | — |
| 9 | *(opcional)* Rodar **`configurarSenhaDoPainel()`** para liberar o painel do RH em `?page=painel` | Menu *Executar* |

> 🚨 **Não pule o passo 6.** Se os dados de teste ficarem na planilha, eles se misturam com as respostas reais e contaminam todos os indicadores.
>
> ✅ **`apagarDadosDeTeste()` é seguro rodar a qualquer momento**, mesmo com a pesquisa no ar e respostas reais já gravadas: ela remove só o que foi criado por `inserirDadosDeTeste()`. Depois rode `gerarIndicadores()` para os números se refazerem sem o teste.

### B) No dia a dia — durante a coleta

Nada a fazer. As respostas caem sozinhas na aba `Respostas`.

### C) Quando quiser ver os resultados

Execute **`gerarIndicadores()`**. Só isso. Pode rodar quantas vezes quiser — ela sempre reconstrói as 4 abas do zero a partir das respostas atuais.

> 💡 **Ou deixe no automático:** execute **`ativarAtualizacaoAutomatica()`** uma única vez e o Google passa a rodar `gerarIndicadores()` sozinho todo dia. Veja a seção *Automação* abaixo.

### D) Quando mudar o código

| Você mudou… | O que precisa fazer |
|---|---|
| Qualquer coisa do **formulário** (perguntas, áreas, textos, visual) | Salvar **e** criar nova versão: *Implantar → Gerenciar implantações → ✏️ → Nova versão*. Sem isso o público continua vendo a versão antiga. |
| Só as **funções de análise** (`gerarIndicadores` e afins) | Basta salvar. Funções executadas pelo menu *Executar* sempre usam o código salvo, não o implantado. |

---

## 🚀 Como colocar no ar (deploy)

### 1. Criar o projeto no Apps Script
1. Acesse https://script.google.com/ → **Novo projeto**.
2. Crie três arquivos de script: **`main`**, **`sheets`** e **`painel`** (ícone **+** → *Script*).
3. Cole cada arquivo do repositório no arquivo de mesmo nome.
   - ❗ **Cole sempre os três arquivos juntos** ao atualizar — eles chamam funções uns dos outros.
   - ❗ **Não** deixe o conteúdo repetido em dois arquivos. Cada `const` no topo (ex.: `PERGUNTAS`) só pode existir **uma vez** no projeto inteiro, senão dá erro `Identifier 'X' has already been declared`.
4. (Opcional) Substitua o conteúdo de `appsscript.json` — clique em ⚙️ *Configurações do projeto* → marque *Mostrar o arquivo de manifesto `appsscript.json`*.

### 2. Conectar a planilha
1. Crie (ou abra) uma planilha no Google Sheets.
2. Copie o **ID da planilha** da URL: `https://docs.google.com/spreadsheets/d/`**`ESTE_ID`**`/edit`.
3. No `sheets.gs`, troque o valor da constante no topo do arquivo (**um único lugar**):
   ```js
   const ID_PLANILHA = '1v1SEGIhzfBYkI4xBCexZlRfRoqn_2WaHz83S9kR9x6g';
   ```

### 3. Inicializar a planilha (uma vez)
1. No editor, selecione a função **`inicializarPlanilha`** e clique em **Executar**.
2. Autorize o acesso quando o Google pedir.
   - Isso cria as abas **CONFIG** e **Respostas**. As abas de análise são criadas depois, por `gerarIndicadores()`.

### 4. Publicar como aplicativo web
1. **Implantar** → **Nova implantação** → tipo **App da Web**.
2. Configure:
   - **Executar como:** *Eu* (a sua conta) — é o que permite gravar na planilha sem login do respondente.
   - **Quem pode acessar:** *Qualquer pessoa* (formulário público e anônimo).
3. **Implantar** → copie a **URL do app da Web** → compartilhe com os colaboradores.

### 5. Atualizar depois de mudar o código
Sempre que editar qualquer `.gs`: salve (**Ctrl+S**) → **Implantar** → **Gerenciar implantações** → ✏️ (editar) → **Nova versão** → **Implantar**. A URL continua a mesma.

---

## 🔧 Funções — o que cada uma faz

### `main.gs`
| Função | Quando roda | O que faz |
|---|---|---|
| `doGet(e)` | Automático, quando alguém abre a URL | Roteia: com `?page=painel` abre o painel do RH; sem parâmetro, o formulário. |
| `doPost(e)` | Automático, em requisições HTTP POST | Handler alternativo de POST (o formulário **não** usa isto — usa `google.script.run`). Deixado para integrações externas. |
| `submitForm(data)` | Chamada pelo formulário via `google.script.run` ao enviar | Recebe as avaliações e chama `salvarResposta` (no `sheets.gs`). |
| `getFormHTML()` | Chamada por `doGet` | Devolve **todo** o HTML/CSS/JS do formulário (é aqui que você mexe em textos, cores, perguntas, áreas). |

### `sheets.gs`

**Funções para executar manualmente** (aparecem no menu *Executar* do editor):

| Função | Quando rodar | O que faz |
|---|---|---|
| `inicializarPlanilha()` | **1x**, na configuração inicial | Cria as abas **CONFIG** e **Respostas**. |
| **`gerarIndicadores()`** ⭐ | **Sempre que quiser atualizar os resultados** | Reconstrói do zero as 4 abas de análise: **PAINEL**, **POR_PERGUNTA**, **RESUMO_PERGUNTAS** e **COMENTARIOS**. |
| `inserirDadosDeTeste()` | Opcional, para testar | Cria 52 respondentes fictícios (4 por área) para você ver os indicadores funcionando. |
| `apagarDadosDeTeste()` | Depois de testar | Remove **apenas** as respostas fictícias. As respostas reais ficam intactas. Pode rodar com a pesquisa no ar. |
| `apagarTODASasRespostas()` | Só para zerar um ciclo | ⚠️ Apaga **tudo**, real inclusive. Protegida: só funciona depois de você trocar `CONFIRMO` para `true` no código. |
| **`verificarConfiguracao()`** 🔎 | Quando algo "não mudou" | Mostra no Log o prazo, os mínimos, se há dados de teste e quantas pessoas responderam. Não altera nada. |

### 🔎 "Colei, salvei, e não mudou nada"

Quase sempre é a diferença entre **salvar** e **implantar**:

| | Vale a partir de |
|---|---|
| **Ctrl+S** (salvar) | As funções do menu *Executar* — `gerarIndicadores()`, `verificarConfiguracao()`, etc. |
| **Nova versão da implantação** | O que o **público** vê na URL: formulário e painel |

Ou seja: salvar muda o que **você** executa; implantar muda o que **os outros** veem.

Para descobrir em qual camada está o problema:

1. Rode **`verificarConfiguracao()`** e olhe o Log.
   - Se os valores estiverem **errados** → o código não foi colado/salvo direito. Confira se colou nos três arquivos.
   - Se os valores estiverem **certos** mas a URL continua antiga → falta criar a nova versão.
2. Para criar: *Implantar → **Gerenciar implantações** → ✏️ (lápis) → em **Versão**, escolher **Nova versão** → **Implantar***.
   - ❗ Não adianta *Nova implantação*: isso cria uma **URL diferente**. Você quer editar a que já existe.
3. Recarregue a URL com **Ctrl+Shift+R** (o navegador guarda a página em cache).

**Funções de automação** (opcional — dispensam rodar `gerarIndicadores()` na mão):

| Função | Quando rodar | O que faz |
|---|---|---|
| `ativarAtualizacaoAutomatica()` | **1x**, se quiser automatizar | Cria um acionador: o Google passa a rodar `gerarIndicadores()` sozinho, todo dia. |
| `desativarAtualizacaoAutomatica()` | Quando quiser parar | Remove o acionador. |
| `verificarAutomacao()` | Para conferir | Mostra no Log se está ligada e quando foi a última atualização. |

**Funções internas** (chamadas automaticamente, terminam com `_` e não aparecem no menu):

| Função | O que faz |
|---|---|
| `salvarResposta(dados)` | Grava uma submissão do formulário. Chamada por `submitForm` no `main.gs`. |
| `lerRespostas_()` | Lê a aba Respostas e normaliza os dados. |
| `agregarRespostas_(registros)` | **Núcleo do cálculo**: separa percepção externa × autoavaliação, por área e por pergunta. |
| `gerarPainel_`, `gerarAnalisePorPergunta_`, `gerarResumoPerguntas_`, `gerarComentarios_` | Escrevem cada aba de análise. |

### `painel.gs`

| Função | Quando rodar | O que faz |
|---|---|---|
| `configurarSenhaDoPainel()` | **1x**, para liberar o painel | Define a senha de acesso (guardada fora do código). |
| `verificarSenhaDoPainel()` | Para conferir | Diz se a senha já foi configurada, sem revelá-la. |
| `obterDadosPainel(senha)` | Chamada pelo painel | Devolve todos os indicadores em JSON — **só com a senha correta**. |
| `regerarAbasDaPlanilha(senha)` | Botão do painel | Roda `gerarIndicadores()`, também protegido por senha. |
| `exportarComentarios(senha, area)` | Botão *Exportar CSV* do painel | Gera o CSV dos comentários (do filtro de área ativo) **no seu Google Drive** e devolve o link. Também protegido por senha. |

> 🔐 **Toda** função do painel confere a senha **no servidor**, não só na tela. Como a URL é pública, alguém poderia chamar `google.script.run` direto pelo console do navegador — a validação server-side é o que impede isso.

> 🔁 **Rotina de operação:** deixe a pesquisa coletando respostas → quando quiser ver os números, rode **`gerarIndicadores()`** e abra as abas de análise. Pode rodar quantas vezes quiser; ela sempre reconstrói tudo a partir da aba Respostas.

---

## 🗂️ Como os dados ficam na planilha

### Aba `Respostas` — dados brutos (uma linha por área avaliada × pergunta)
| Coluna | Exemplo | Observação |
|---|---|---|
| Data | `2026-08-12` | Apenas a data, **sem horário** — ver "Modelo de anonimato". |
| Avaliação ID | `a1b2c3…` (UUID) | **Aleatório por área**, não por pessoa. Ver "Anonimato" abaixo. |
| Área Avaliada | `Diretoria` | Área que está sendo avaliada. |
| Autoavaliação | `Sim` / `Não` | `Sim` quando é a própria área do respondente. |
| Pergunta | `Clareza da comunicação` | Nome da pergunta (ver constante `PERGUNTAS`). |
| Tipo | `rating` / `texto` | Nota (1–5) ou comentário aberto. |
| Resposta | `4` / `"a área é ágil"` | O valor respondido. |

> ⚠️ **Não edite esta aba à mão.** Ela é a fonte de tudo; as abas de análise são descartáveis e recriadas a cada `gerarIndicadores()`.

---

### 📊 Aba `PAINEL` — visão executiva (uma linha por área)

O indicador principal: como a área é vista pelas outras, como ela se vê, e o descompasso entre as duas coisas.

| Coluna | O que é |
|---|---|
| Área | Área avaliada. |
| Avaliações recebidas (n) | Quantas pessoas **de outras áreas** a avaliaram. |
| **Nota da Área** | Média que a área recebeu **das outras áreas** (0–5). |
| Autoavaliações (n) | Quantas pessoas **da própria área** se autoavaliaram. |
| **Nota da Autoavaliação** | Média que a área deu **a si mesma**. |
| **Gap (Externa − Auto)** | Negativo = a área se vê melhor do que é vista. Positivo = as outras a veem melhor do que ela própria. |
| Leitura | Interpretação em texto da diferença. |
| Status | `OK` ou o motivo de estar oculto por anonimato. |

A coluna **Gap** vem colorida: 🔴 vermelho quando a área se superestima — gap negativo, ponto de atenção —, 🟢 verde quando é mais bem vista do que imagina, cinza quando está alinhada. O limite é `LIMITE_DESALINHAMENTO` (padrão `0.3`).

---

### 🔍 Aba `POR_PERGUNTA` — análise individual de cada questão

Uma linha por **(área × pergunta)** — permite ver exatamente em qual critério cada área vai bem ou mal.

`Área | Seção | Pergunta | Respostas (n) | Nota (externa) | Nota (autoavaliação) | Gap (Externa − Auto) | Status`

Use os filtros do Sheets para isolar uma área ou um critério específico.

---

### 🏅 Aba `RESUMO_PERGUNTAS` — ranking dos temas na empresa

Média da **empresa inteira** em cada uma das 7 perguntas, ordenada da melhor para a pior. Responde "em qual dimensão somos bons/ruins como companhia?".

`Pergunta | Seção | Respostas (n) | Nota média (empresa) | Posição`

---

### 💬 Aba `COMENTARIOS` — respostas qualitativas

Todos os textos abertos, separados das notas.

`Área Avaliada | Origem | Pergunta | Comentário`

- **Origem** distingue `Autoavaliação` de `Outra área`.
- As linhas são **embaralhadas** e o ID da avaliação **não** é exportado — assim ninguém consegue juntar os comentários de uma mesma pessoa.
- Comentários de áreas abaixo do mínimo de anonimato ficam de fora (o Log informa quais).

---

### Aba `CONFIG`
Metadados chave/valor (`pesquisa_id`, `titulo_pesquisa`, `status`, `criado_em`).

---

## ✏️ O que você pode configurar no código

| Quero mudar… | Onde | Como |
|---|---|---|
| **As áreas/departamentos** | `main.gs` → array `AREAS` (e o mesmo array em `sheets.gs` → `inserirDadosDeTeste`) | Adicione/remova strings. |
| **As perguntas** | `main.gs` → array `QUESTIONS` | Cada item tem `type` (`rating`/`text`), `secao`, `texto`. **Se mexer, atualize também `PERGUNTAS` no `sheets.gs`** — os nomes precisam bater. |
| **Mínimo de caracteres do comentário** | `main.gs` → `const MIN_CHARS = 3` | Troque o número. |
| **Mínimo de avaliações externas** | `sheets.gs` → `const MINIMO_EXTERNO = 5` | Abaixo disso a nota da área fica oculta. |
| **Mínimo de autoavaliações** | `sheets.gs` → `const MINIMO_AUTOAVALIACAO = 1` | **Sem mínimo**: as áreas da empresa são pequenas e um corte maior escondia a comparação da maioria delas. Veja a ressalva abaixo. |
| **Sensibilidade da coluna Gap** | `sheets.gs` → `const LIMITE_DESALINHAMENTO = 0.3` | Gaps menores que isso, em módulo, são lidos como "percepção alinhada". |
| **Total de colaboradores** | `sheets.gs` → `const TOTAL_COLABORADORES = 55` | Só o denominador do indicador de participação no painel. Nenhuma nota depende disso. |
| **Textos, cores, logo** | `main.gs` → dentro de `getFormHTML()` | HTML/CSS inline. A paleta usa variáveis CSS (`--navy`, `--e1..e5`, etc.). |
| **ID da planilha** | `sheets.gs` → `const ID_PLANILHA` | Um só lugar. |

---

## ⏰ Automação — atualizar os indicadores sozinho

Se você não quiser rodar `gerarIndicadores()` manualmente toda vez:

1. Execute **`ativarAtualizacaoAutomatica()`** (uma única vez).
2. Autorize novamente quando o Google pedir — a automação usa uma permissão a mais (criar acionadores).
3. Pronto. Todo dia, por volta das **6h**, os indicadores são recalculados sozinhos.

Para conferir se está funcionando, execute **`verificarAutomacao()`** e olhe o Log — ele mostra se está ligada e a data da última atualização. Essa data também fica gravada na aba **CONFIG**, nas chaves `ultima_atualizacao` e `linhas_processadas`.

Para desligar: **`desativarAtualizacaoAutomatica()`**.

### Mudar o horário ou a frequência

No `sheets.gs`, a hora fica na constante do topo da seção de automação:
```js
const HORA_ATUALIZACAO = 6;   // 0 a 23
```

Para mudar a frequência, edite a linha dentro de `ativarAtualizacaoAutomatica()`:
```js
.everyDays(1).atHour(HORA_ATUALIZACAO)   // padrão: todo dia
.everyHours(4)                            // a cada 4 horas
.everyHours(1)                            // de hora em hora
```
Depois **rode `ativarAtualizacaoAutomatica()` de novo** — ela substitui o acionador anterior em vez de criar um segundo.

### Por que não atualizar a cada resposta enviada?

Seria possível chamar `gerarIndicadores()` dentro de `submitForm()`, mas **não é recomendado**:

- o respondente esperaria o recálculo de toda a planilha só para ver a tela de "Obrigado";
- com duas pessoas enviando ao mesmo tempo, as duas execuções escreveriam nas mesmas abas simultaneamente, podendo corromper o resultado;
- é desperdício: ninguém acompanha o painel em tempo real numa pesquisa de clima.

Uma atualização diária (ou de poucas em poucas horas durante a semana de coleta) resolve o mesmo problema sem nenhum desses riscos.

> ℹ️ O acionador roda **na sua conta**, com as suas permissões, mesmo com o navegador fechado. Se a execução falhar (ex.: planilha renomeada), o Google envia um e-mail de erro automaticamente.

---

## 📈 Painel do RH (dashboard)

Mesma URL do formulário, com `?page=painel` no final:

```
https://script.google.com/macros/s/SEU_ID/exec?page=painel
```

### Configurar a senha (uma vez)

O painel é **protegido por senha**, porque a URL é pública. A senha **não fica no código** — é guardada nas Propriedades do Script, então não vai para o repositório.

1. Abra `painel.gs` → função **`configurarSenhaDoPainel()`**
2. Escreva a senha na linha `const NOVA_SENHA = '';`
3. **Execute** a função
4. **Apague a senha da linha** e salve de novo

Confira com **`verificarSenhaDoPainel()`** (mostra se está configurada, sem revelar a senha).

> Enquanto não houver senha configurada, o painel fica **inacessível** — o padrão é seguro.

### O que o painel mostra

| Bloco | O que responde |
|---|---|
| **Visão geral** | Participação (X de 55) + leituras automáticas (áreas abaixo de 3,00, maior desalinhamento, critério mais forte/fraco, áreas ocultas) + 4 cartões: total de avaliações, nota média da empresa, áreas com dados, maior desalinhamento |
| **Participação** | Quantas pessoas já responderam, no total e por área |
| **Nota de cada área** | Ranking das áreas pela nota recebida das outras, com seletor de ordenação (maior nota, menor nota, mais avaliações, alfabética) |
| **Autoavaliação × percepção** | Onde a área se vê melhor (ou pior) do que a veem, ordenado pelo maior descompasso |
| **Pontos fortes e fracos** | Ranking dos 7 critérios na empresa inteira, com a **amplitude entre áreas** de cada um |
| **Pergunta por área** | Escolha **um critério** e veja **todas as áreas** nele, com ordenação e a média da empresa marcada |
| **Detalhe por área** | Escolha 1 área e, se quiser, mais 2 para **comparar lado a lado** → **gráfico de aranha** nos 7 critérios + tabela com auto e diferença |
| **O que escreveram** | Termos mais citados (clicáveis), filtros por área e por pergunta, busca com destaque no texto, paginação de 50 em 50 e exportação em CSV |

### Participação — de onde sai o número

O painel mostra **quantas pessoas enviaram a pesquisa**, contra o total esperado de colaboradores.

O denominador fica numa constante no `sheets.gs`:

```js
const TOTAL_COLABORADORES = 55;
```

Mude o número aí quando o quadro da empresa mudar. **Nenhum cálculo de nota depende disso** — é só o denominador do painel.

**Como as pessoas são contadas.** Cada envio da pesquisa contém exatamente **uma** autoavaliação, porque a própria área do respondente é sempre a primeira do formulário. O painel conta esses blocos de autoavaliação. Não existe identificador de pessoa na planilha (é justamente o que garante o anonimato) — sabemos *quantos* responderam e *de qual área*, nunca *quem*.

Duas ressalvas honestas sobre esse número:

- É contagem de **envios**, não de pessoas distintas. A trava de reenvio é por navegador, então quem responder duas vezes conta duas vezes — e o total pode passar de 55.
- Na barra **por área**, o comprimento é proporcional à área que mais respondeu, não a um percentual concluído: serve para comparar áreas entre si. Não temos o número de pessoas de cada área, só o total da empresa.

**Como ler os gráficos.** Todas as barras usam a **mesma escala fixa de 0 a 5**, com linhas de grade e o eixo numerado embaixo — barras de blocos diferentes são diretamente comparáveis. A legenda no topo do ranking explica as cores. O **valor exato fica escrito em cima de cada barra/coluna** (ou dentro dela, em branco, quando não sobra espaço acima) — não é preciso posicionar o mouse para saber o número.

| Cor | Faixa |
|---|---|
| 🔴 Crítico | abaixo de 2,2 |
| 🟠 Ruim | 2,2 a 2,9 |
| 🟡 Regular | 2,9 a 3,6 |
| 🟢 Bom | 3,6 a 4,3 |
| 🟩 Ótimo | acima de 4,3 |

### Pergunta por área — o corte transversal

As outras seções olham **uma área nos 7 critérios**. Esta vira a leitura de lado: **um critério em todas as áreas**.

É a pergunta que aparece em reunião — *"em cumprimento de prazos, quem está bem e quem está mal?"* — e que antes exigia abrir cada área uma por uma.

- Seletor de **pergunta** (os 7 critérios)
- Ordenação: maior nota, menor nota, mais avaliações, menos avaliações, alfabética
- **Média da empresa** marcada no gráfico (traço vertical em cada barra, ou linha tracejada no modo colunas)
- Opção de sobrepor a **autoavaliação** de cada área
- Uma leitura em texto no topo: melhor área, pior área e quantas estão abaixo da média

### Barras ou colunas — nos cinco gráficos principais

**Participação**, **Nota de cada área**, **Autoavaliação × percepção**, **Pontos fortes e fracos** e **Pergunta por área** têm um seletor **📏 Barras / 📊 Colunas** logo acima do gráfico. É a mesma informação nos dois formatos — troque conforme o que for mais fácil de comparar:

- **Barras** (padrão): melhor para ler o nome de cada área de uma vez, lado a lado com o número.
- **Colunas**: melhor para comparar visualmente a *altura* — no comparativo autoavaliação × percepção, por exemplo, a diferença entre as duas colunas de cada área salta aos olhos mais rápido do que duas barras empilhadas.

Com muitas categorias (as 13 áreas), a versão em colunas rola na horizontal — arraste ou use a barra de rolagem para ver todas.

### Gráfico comparativo — aranha, colunas ou linhas (Detalhe por área)

Fica no bloco **Detalhe por área** e usa os mesmos seletores da tabela. Os botões no topo trocam o formato, sempre com os **mesmos dados** e a **mesma escala 0–5**:

| Formato | Melhor para |
|---|---|
| 🕸️ **Aranha** | ver o "formato" de uma área de relance — onde ela é forte e onde afunda |
| 📊 **Colunas** | comparar valor a valor num critério; é onde a diferença entre autoavaliação e percepção externa fica mais óbvia |
| 📈 **Linhas** | acompanhar várias áreas ao longo dos 7 critérios sem poluir |

Os 7 critérios ficam sempre na ordem do formulário. Na aranha a teia marca 1, 2, 3, 4 e a borda externa é o 5; em colunas e linhas o eixo vertical vai de 0 a 5 com grade em cada inteiro.

> A escala é fixa de propósito, igual ao resto do painel. Em *linhas*, quando as áreas estão todas perto de 3, as curvas ficam próximas — isso é o dado real, não um defeito do gráfico. Se quiser enxergar a diferença ampliada, use *colunas* com a autoavaliação ligada.

Serve para as três comparações:

| O que você quer ver | Como |
|---|---|
| **Uma área contra a empresa** | Escolha a área em *Área* e deixe *Comparar com a média da empresa* marcado (padrão). A linha cinza tracejada é a empresa. |
| **Área contra área** | Preencha também *Comparar com* e *E com* — até 3 áreas sobrepostas, cada uma com sua cor. |
| **Como a área se vê × como a veem** | Marque *Mostrar a autoavaliação da 1ª área*. O tracejado da mesma cor é a autoavaliação; quando ele fica **por fora** do sólido, a área se avalia melhor do que a avaliam. |

Detalhes: passar o mouse sobre um ponto mostra o valor exato; com 3 ou mais camadas o preenchimento fica quase transparente para não virar borrão; uma série só é desenhada se tiver pelo menos 3 critérios com nota (área oculta por anonimato simplesmente não aparece).

O gráfico é **SVG gerado no próprio código** — o Apps Script bloqueia bibliotecas externas (CSP), então não há Chart.js nem nada carregado de fora.

### Botões do painel

| Botão | O que faz |
|---|---|
| **Imprimir / PDF** | Abre a impressão do navegador já formatada (menus, filtros e botões somem; os blocos não quebram no meio). Escolha *"Salvar como PDF"* no destino. |
| **Regravar abas da planilha** | Roda `gerarIndicadores()` — regenera as abas de análise. Útil para Looker Studio ou para exportar. Não é necessário para o painel funcionar. |
| **Buscar dados novos** | Relê a planilha sem recarregar a página. |
| **Exportar CSV** (no bloco de comentários) | Gera um `.csv` com os comentários **dos filtros ativos** (área, pergunta e origem) e salva **no seu Google Drive** (o Apps Script não permite download direto). O painel devolve o link do arquivo. O CSV usa `;` e vem com BOM, então o Excel abre com os acentos certos. |

**Amplitude entre áreas (Pontos fortes e fracos):** cada critério mostra, além da média da empresa, **de quanto a quanto ele varia entre as áreas** — o traço escuro sobre a barra. Serve para separar dois problemas diferentes que a média sozinha confunde: traço largo = o problema está concentrado em algumas áreas (conversa com gestores); traço estreito com nota baixa = o problema é de toda a empresa (programa corporativo).

**Números de respostas em Autoavaliação × percepção:** cada lado mostra em quantas respostas se apoia. A autoavaliação vem do próprio time, que costuma ser pequeno — uma diferença de +1,2 apoiada em 3 pessoas é um indício, não uma conclusão, e agora dá para ver isso na tela.

**Filtro de origem:** separa o que veio **de outras áreas** do que a própria área escreveu sobre si (**autoavaliação**). Útil para ler os dois lados do mesmo assunto — o que a área acha que faz bem × o que as outras acham. O filtro também vale para a exportação e para os termos mais citados.

**Termos mais citados:** contagem simples de palavras, cada palavra contada **uma vez por comentário**. Palavras sem valor analítico (artigos, verbos genéricos) e os **nomes das áreas** ficam de fora — a área já aparece no crachá de cada comentário. Clicar num termo joga a palavra na busca. Não é análise de sentimento: é frequência, e serve para achar assunto, não para medir humor.

Os dados são lidos **direto da aba `Respostas`**, sempre atualizados — não é preciso rodar `gerarIndicadores()` antes.

Todos os cortes de anonimato valem aqui igual: áreas abaixo do mínimo aparecem sem nota, e os comentários vêm embaralhados e sem identificação.

### O que o painel **não** faz (de propósito)

- **Análise de sentimento automática.** Classificar texto em português como positivo/negativo sem um modelo treinado erra muito — principalmente com ironia e negação ("não é ruim"). Um rótulo errado num comentário sobre uma pessoa vira decisão errada de RH. Os textos são lidos, não pontuados.
- **Comparação com ciclos anteriores.** Ainda não existe histórico: só há um ciclo. Quando houver o segundo, dá para arquivar a aba `Respostas` do primeiro e comparar.

### ⚠️ Limites desta proteção

- **Quem tiver o link e a senha entra.** Não há registro de quem acessou.
- Como o formulário é público (sem login), o Google não informa quem está acessando — por isso não dá para liberar por e-mail nesta mesma URL.
- Trate a senha como confidencial e troque-a se alguém sair do time. Para trocar: rode `configurarSenhaDoPainel()` de novo com a senha nova.

---

## 🔒 Modelo de anonimato (importante)

- **Nenhuma identidade é coletada** — não há login, nome ou e-mail.
- **A área do respondente É registrada** — a linha de autoavaliação (`Autoavaliação = Sim`) mostra de qual área a pessoa é.
  Isso é inerente ao indicador de autoavaliação; sem isso não existe a comparação auto × externa.
  Os textos do formulário dizem isso ao respondente: não prometemos que a área não é gravada, só que **nome e e-mail** não são coletados.
- **Só a data é gravada, sem horário.** Se guardássemos a hora exata, todas as linhas de um envio teriam o mesmo carimbo de
  milissegundos — bastaria ordenar por ele para agrupar tudo que uma pessoa respondeu e, pela linha de autoavaliação,
  descobrir a área dela. Com a data, isso deixa de ser possível (desde que haja mais de um respondente no dia).
- Cada **área avaliada** recebe um **ID aleatório próprio** (não um ID único por pessoa). Assim não dá para juntar todas as respostas de um mesmo respondente cruzando um ID comum.
- Nas abas de análise, áreas com poucas respostas ficam **ocultas**: `MINIMO_EXTERNO` (5) para a nota recebida e `MINIMO_AUTOAVALIACAO` (3) para a autoavaliação. A coluna **Status** sempre explica o motivo.
- Os **comentários são embaralhados** e sem ID, para não permitir reconstruir o conjunto de respostas de uma pessoa.
  O RH tem acesso a eles assim que `gerarIndicadores()` roda — **não** existe trava de "só depois do ciclo encerrar".
  As telas do formulário dizem exatamente isso ao respondente; se um dia essa regra mudar, atualize também o texto do modal e da dica no `main.gs`.
- ⚠️ **Risco residual:** na aba `Respostas` crua, as linhas de um mesmo envio ficam **adjacentes** (foram inseridas juntas).
  Isso não é eliminável por código. Por isso o RH deve trabalhar pelas abas de análise (que agregam e embaralham) e o acesso à
  planilha bruta deve ser **restrito a quem realmente precisa**.
- **Bloqueio de duplicidade:** controlado pela constante `BLOQUEAR_REENVIO` no `main.gs`. **Está `true`.**
  - Ao enviar, o formulário marca o `localStorage` do navegador. Numa segunda visita aparece só "✅ Você já respondeu esta pesquisa".
  - Essa trava é **por navegador**, não no servidor. Ela resolve o reenvio acidental (recarregar a página, clicar duas vezes), mas
    **não** impede alguém decidido de usar outro navegador ou aba anônima. Impedir isso exigiria login — o que acabaria com o anonimato,
    que é justamente a premissa da pesquisa.
  - Por isso a contagem de participação no painel é de **envios**, não de pessoas distintas.
  - A tela de "já respondeu" **não menciona navegador nem aba anônima**, de propósito: não convém ensinar o caminho. Se você mexer nesse
    texto, mantenha assim.
  - Para testar o formulário várias vezes, mude para `false` temporariamente — e lembre de voltar para `true`.

> ⚖️ **Sobre os mínimos**
>
> **`MINIMO_EXTERNO = 5` protege quem avalia** e deve ficar como está. É ele que impede que a nota de uma área revele a opinião de um punhado de pessoas identificáveis de fora.
>
> **`MINIMO_AUTOAVALIACAO = 1` é uma decisão consciente.** As áreas da empresa têm poucas pessoas; com um corte de 3, a comparação auto × externa não aparecia para a maioria delas — que é justamente o indicador mais útil do painel.
>
> O custo: numa área de **uma pessoa só**, a "média" da autoavaliação **é** a resposta daquela pessoa. Isso entra em tensão com o que o formulário promete a quem responde — *"os resultados são sempre analisados de forma agregada por área, nunca de forma individual"*.
>
> Como o painel lida com isso: mostra **quantas pessoas sustentam cada barra** e marca com um selo vermelho **"1 resposta"** os casos em que a autoavaliação tem uma única resposta. O RH vê o número sabendo o que ele é.
>
> **Se preferir manter a promessa literalmente verdadeira**, troque para `2`: o número exibido passa a ser sempre média de pelo menos duas pessoas, e só áreas de uma pessoa ficam de fora. Uma linha, e vale para o painel e para as abas da planilha.

Para **testar do zero**, use uma **aba anônima** (Ctrl+Shift+N) ou limpe o `localStorage` do site.

---

## 🧭 Levando os dados para fora (Looker Studio / BI)

O painel do RH já cobre o uso do dia a dia. Se em algum momento for preciso montar relatórios fora do Apps Script, as abas de análise já foram desenhadas para isso — são **tabelas limpas** (uma linha de cabeçalho + dados, sem blocos intercalados) e as notas são gravadas como **números de verdade**, não texto. Qualquer ferramenta de BI consome direto, sem tratamento.

| Visualização | Aba fonte |
|---|---|
| Ranking de áreas / cartões com a nota | `PAINEL` |
| Gráfico "autoavaliação × percepção externa" | `PAINEL` |
| Radar de uma área nos 7 critérios | `POR_PERGUNTA` (filtrando a área) |
| Heatmap área × critério | `POR_PERGUNTA` |
| Ranking dos temas na empresa | `RESUMO_PERGUNTAS` |
| Lista de comentários | `COMENTARIOS` |

Rode **`gerarIndicadores()`** (ou o botão *"Regravar abas da planilha"*) antes de atualizar o relatório — essas abas só mudam quando a função roda.

### Cuidados

- **Compartilhe o relatório apenas com o RH.** Ele contém os mesmos dados do painel, mas sem a senha na frente.
- **Não leia a aba `Respostas` crua para montar médias** — use as abas de análise, que já aplicam os mínimos de anonimato. A `Respostas` não tem nenhum corte.
- **Ciclos de pesquisa:** hoje há um único ciclo. Para comparar períodos, use a aba `CONFIG` (`status`, `periodo_inicio`, `periodo_fim`) e **arquive a aba `Respostas`** (duplicar e renomear, ex.: `Respostas_2026_1`) antes de abrir o próximo ciclo.

---

## 🆘 Problemas comuns

| Erro | Causa / solução |
|---|---|
| `Identifier 'X' has already been declared` | Código duplicado em dois arquivos `.gs`. Deixe cada função/const só em um arquivo. |
| `salvarResposta is not defined` / `servirPainel_ is not defined` | Você atualizou só um dos arquivos. **Cole os três** (`main.gs`, `sheets.gs`, `painel.gs`) — eles se chamam entre si. |
| Tela em branco após enviar / logo cortada | Você colou uma versão antiga/incompleta. Cole o `main.gs` **completo** de novo. |
| `Cannot read properties of null` ao rodar funções | ID da planilha errado no `sheets.gs`, ou a aba não existe. Confira `ID_PLANILHA` e rode `inicializarPlanilha()`. |
| "Você já respondeu" aparecendo no teste | É a trava de reenvio, que está **ligada**. Para testar várias vezes, mude `BLOQUEAR_REENVIO` para `false` no `main.gs` (e lembre de voltar para `true`). |
| Abas de análise vazias | Rode **`gerarIndicadores()`**. Se continuar vazio, confira se a aba `Respostas` tem dados. |
| Colunas de nota em branco com "Oculto por anonimato" | Normal: a área ainda não atingiu o mínimo de respostas. A coluna **Status** diz exatamente o que falta. |
| `?page=painel` abre o **formulário** em vez do painel | A implantação está numa versão antiga do código. *Implantar → Gerenciar implantações → ✏️ → **Nova versão** → Implantar.* |
| Painel diz "Senha incorreta" com a senha certa | A senha foi gravada em **outro projeto** do Apps Script, ou `configurarSenhaDoPainel()` rodou com a linha em branco. Rode `verificarSenhaDoPainel()` e configure de novo. |
| *Exportar CSV* não baixa nada | Isso é esperado: o Apps Script não deixa a página iniciar downloads. O arquivo vai para o **seu Google Drive** e o painel mostra o link. |
| Comentários com "Resposta de teste…" no painel | Os dados fictícios ainda estão na planilha. Rode **`apagarDadosDeTeste()`** — ela remove só os fictícios e preserva as respostas reais. |

---

## 🧩 Fluxo do respondente (resumo)

1. **Intro** — modal de anonimato (1ª visita) → escolhe **sua área**.
2. **Seleção de interação** — escolhe **com quais áreas teve interação** (avalia só essas + a autoavaliação da própria área).
3. **7 perguntas objetivas** — escala de emoji 1–5 (Muito insatisfeito → Muito satisfeito), uma pergunta por tela respondida para todas as áreas selecionadas.
4. **2 comentários** — obrigatórios nas outras áreas, **opcionais na própria área**.
5. **Confirmação** → **Envio** → tela de **Obrigado**.

Navegação para trás disponível em todas as etapas (o botão **← Anterior** na 1ª pergunta volta para a seleção de áreas).

---

**Status:** ✅ Pronto para produção
**Escopo:** formulário de resposta anônimo + painel do RH com senha, na mesma URL (`?page=painel`).

### ✅ Antes de abrir para a empresa

- [ ] `apagarDadosDeTeste()` executado (nenhuma "Resposta de teste…" na planilha) — seguro mesmo com respostas reais já gravadas
- [x] `BLOQUEAR_REENVIO = true` no `main.gs` — já está ligado. Para voltar a testar o formulário várias vezes, mude para `false` temporariamente
- [ ] `configurarSenhaDoPainel()` executado e a senha **apagada da linha do código**
- [ ] Nova versão implantada depois da última alteração
- [ ] Acesso à aba **`Respostas`** restrito — ela é a única sem cortes de anonimato

---

## ⏰ Encerramento da pesquisa

O prazo fica numa constante no `sheets.gs`:

```js
const ENCERRAMENTO = '2026-08-28 23:59';   // horário de Brasília
```

Depois desse instante:

- quem abre o link vê uma página de **"Pesquisa encerrada"**, não o formulário;
- quem já estava com a página aberta e clica em enviar **tem a resposta recusada**, com a data do prazo na tela;
- o **painel do RH continua funcionando** normalmente.

A trava é aplicada **no servidor**, dentro de `salvarResposta()`. O relógio do computador de quem responde não interfere.

Enquanto está aberta, o formulário mostra o prazo na tela inicial: *"⏰ Responda até 28/08/2026 às 23:59"*.

Para **manter aberta por tempo indeterminado**, deixe vazio: `const ENCERRAMENTO = '';`
Para **estender o prazo**, mude a data e crie uma nova versão da implantação.

> ⚠️ Mudar essa constante exige **nova versão da implantação** para valer para o público — como qualquer mudança que afete o formulário.

---

## 🧪 Testes

As suítes ficam em `testes/` e rodam no Node, sem tocar a planilha real:

```bash
bash testes/rodar-tudo.sh
```

| Arquivo | O que cobre |
|---|---|
| `testes/dados.test.js` | Cálculo dos indicadores, cortes de anonimato, separação teste × real, sincronia formulário ↔ planilha |
| `testes/painel.test.js` | Painel completo num navegador de verdade: senha, ordenações, filtros, gráficos, comentários |
| `testes/prazo.test.js` | Encerramento: antes, no limite e depois do prazo |
| `testes/_ambiente.js` | Ambiente falso do Apps Script (planilha em memória, relógio controlável) |

Rode antes de colar o código no editor do Apps Script — pega erro de sintaxe e regressão de comportamento sem precisar publicar.

---

## 🛟 Como os dados de teste são separados dos reais

`inserirDadosDeTeste()` grava, em toda avaliação fictícia, comentários que começam com **`Resposta de teste (`**. As linhas de nota da mesma avaliação compartilham o **Avaliação ID** — então esse ID identifica o bloco inteiro, incluindo as notas, que sozinhas seriam indistinguíveis de uma resposta real.

`apagarDadosDeTeste()` usa exatamente isso:

1. Varre a aba `Respostas` procurando a marca nos comentários
2. Junta os `Avaliação ID` desses blocos
3. Reescreve a aba só com as linhas que **não** pertencem a esses IDs

Por isso ela é segura de rodar com a pesquisa no ar. Se não houver nada fictício, ela não apaga nada e diz isso no Log.

> ⚠️ **Não mude a constante `MARCA_TESTE`** enquanto houver dados de teste na planilha — é por ela que a separação acontece. Se mudar, os blocos antigos deixam de ser reconhecidos e passam a contar como respostas reais nos indicadores.

Para zerar a planilha de vez (novo ciclo), use `apagarTODASasRespostas()` — e **duplique a planilha antes**, porque não há desfazer.

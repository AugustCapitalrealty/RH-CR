# 🚀 Como publicar uma alteração

> **Este guia é sobre ATUALIZAR o que já está no ar.**
> Para a instalação do zero (criar o projeto, conectar a planilha, primeira
> publicação), veja a seção *"Como colocar no ar"* do [README.md](README.md).

---

## O erro mais comum: "colei, salvei, e não mudou nada"

No Apps Script existem **duas camadas**, e elas se atualizam de formas diferentes:

| Camada | Atualiza com | Quem enxerga |
|---|---|---|
| **Código salvo** | `Ctrl+S` | Só **você**, ao usar o menu *Executar* |
| **Código implantado** | Criar uma **nova versão** | O **público**, na URL do formulário e do painel |

Salvar **não** muda o que está no ar. É por isso que a alteração "não aparece".

---

## O passo a passo certo

### 1. Colar os três arquivos

`main.gs`, `sheets.gs` e `painel.gs` — **sempre os três juntos**. Eles chamam
funções uns dos outros; atualizar só um gera erro do tipo
`X is not defined`.

### 2. Salvar

`Ctrl+S`.

### 3. Conferir o que está salvo

Execute **`verificarConfiguracao()`** e leia o Log. Ela mostra o prazo de
encerramento, os mínimos de anonimato, se há dados de teste na planilha e
quantas pessoas responderam.

- Valores **errados** → o código não foi colado/salvo direito. Volte ao passo 1.
- Valores **certos** → siga para o passo 4.

### 4. Criar a nova versão

**Implantar** → **Gerenciar implantações** → ✏️ (lápis) → em **Versão**,
escolher **Nova versão** → **Implantar**.

> ⚠️ **Não use "Nova implantação".** Isso cria uma **URL diferente**, e a URL que
> as pessoas já têm continua servindo o código antigo. Se você já fez isso sem
> querer, volte em *Gerenciar implantações* e verifique qual entrada corresponde
> à URL que você divulgou — é essa que precisa da nova versão.

### 5. Recarregar sem cache

`Ctrl+Shift+R` na página. O navegador guarda a versão anterior.

---

## Como saber se deu certo

| O que olhar | Onde |
|---|---|
| Aviso **"⏰ Responda até…"** na tela inicial | Formulário |
| Seção **"Pergunta por área"** no menu do topo | Painel (`?page=painel`) |
| Seletores **Barras / Colunas** nos gráficos | Painel |

Se algum desses não aparecer, a implantação ainda está na versão antiga.

---

## Quando basta salvar (sem nova versão)

Funções executadas pelo menu *Executar* usam sempre o código **salvo**:

- `gerarIndicadores()`
- `verificarConfiguracao()`
- `apagarDadosDeTeste()`
- `configurarSenhaDoPainel()`
- `ativarAtualizacaoAutomatica()`

Ou seja: mudou só o cálculo dos indicadores e vai rodar pelo menu? Salvar
resolve. Mudou qualquer coisa que o **público** vê? Precisa de nova versão.

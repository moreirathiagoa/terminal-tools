# terminal-tools

Ferramentas CLI pessoais para produtividade no terminal. Todas rodam com Node.js sem dependências externas.

## Instalação

```bash
git clone git@github.com:moreirathiagoa/terminal-tools.git ~/_dev/_/_zsh-tools
```

No `~/.zshrc` (macOS/Linux), adicione os aliases:

```bash
alias histdevsync='$HOME/_dev/_/_zsh-tools/histdevsync.js'
alias histpop='$HOME/_dev/_/_zsh-tools/histpop.js'
alias xcurl='$HOME/_dev/_/_zsh-tools/xcurl.js'
alias pingc='$HOME/_dev/_/_zsh-tools/pingc.js'
```

Requisito: Node.js (qualquer versão recente).

## Ferramentas

### pingc

Ping com análise de latência e jitter em tempo real. Monitora qualidade de rede durante calls, detecta impacto de downloads concorrentes.

Funciona em macOS, Linux, Android (Termux) e Windows. Detecta a plataforma automaticamente e adapta parsing e flags do ping.

```bash
pingc                     # pinga 1.1.1.1 (default)
pingc -c 50 google.com   # 50 pings com resumo final
pingc -i 0.5 8.8.8.8     # intervalo de 0.5s
pingc -h                  # help completo
```

Métricas exibidas em tempo real:
- Latência instantânea e média (janela deslizante de 20 amostras)
- Spike (▲ degradação / ▼ melhoria) quando latência desvia >2x da média
- Tendência (↑/↓/─) comparando metades da janela
- Jitter (desvio padrão) com status colorido
- Adequação para videocall, streaming e gaming
- Packet loss acumulado

Teclas durante execução:
- `Enter` — resumo parcial (continua rodando)
- `h` — legenda dos ícones
- `Ctrl+C` — resumo final e sai
- `Ctrl+D` — sai sem resumo

### histdevsync

Sincroniza atalhos de abertura de projetos no histórico do zsh. Para cada projeto em `~/_dev`, garante que `kiro ~/_dev/<nome>/` e `code ~/_dev/<nome>/` estejam no histórico.

Deduplica na própria escrita: só anexa os comandos que ainda não existem (comparando por comando, ignorando o cabeçalho de extended-history `: <epoch>:<dur>;`). Não é mais preciso rodar `reload` só para remover duplicatas.

```bash
histdevsync            # usa ~/_dev
histdevsync /outro/dir # base alternativa
```

### histpop

Remove o último comando "real" do histórico do zsh (o penúltimo item, já que o próprio `histpop` foi gravado como último).

Opera por comando lógico: agrupa continuações multi-linha (linha terminada em `\`) e remove o comando inteiro, sem deixar fragmentos. Preserva os bytes originais das demais entradas.

```bash
histpop
```

### histpurge

Limpa comandos antigos do histórico, mantendo os N mais recentes por prefixo configurado (default: 50). Útil para podar ruído de alta frequência sem perder comandos que você reusa.

Detalhes de robustez:
- Opera por **comando lógico**: agrupa continuações multi-linha (`\`) e entende o formato extended-history (`: <epoch>:<dur>;cmd`).
- O prefixo especial `#` remove comentários que são o **topo** de um comando — nunca uma linha de comentário interna a um comando multi-linha (que quebraria o comando).
- Preserva os bytes originais (inclusive o formato "metafied" do zsh para acentos).

Os prefixos default miram ruído descartável (`sleep`, `ls`, `cat`, `cd`, `grep`, `git add`, `git status`, `yarn verify`, `gh run`, `docker`, `curl`, ...) e deliberadamente **não** incluem `git commit`/`push`/`checkout`/`merge`, que você pode querer recuperar exatos.

```bash
histpurge              # usa defaults (keep=50 + lista de prefixos)
histpurge 30 git yarn  # mantém 30 últimos comandos que começam com 'git' ou 'yarn'
```

### xcurl

Cliente HTTP simplificado (Node `fetch`, sem depender de `curl`/`jq`) com saída JSON formatada e colorida por tipo. Ideal para APIs JSON do dia a dia.

```bash
xcurl https://api.example.com/data
xcurl -X POST -H "Authorization: Bearer x" -d '{"key":"val"}' https://api.example.com
```

Comportamento:
- Coloriza JSON no terminal; em pipe/arquivo a saída sai limpa (sem cor).
- Saída longa (mais de 40 linhas) passa por `less` no terminal, com fallback para impressão direta se o `less` não existir.
- Entende apenas `-X`, `-H`, `-d`. Ao receber outra flag (ex.: `-u`, `-F`, `-L`, `--data-urlencode`, `-k`), **aborta com erro** e sugere o `scurl` — que é um wrapper do `curl` real e herda todas as flags. Assim os papéis ficam claros: `xcurl` para o caso simples, `scurl` para o request completo.

## Guia de montagem do shell (zsh) do zero

> Guia para remontar um ambiente zsh numa máquina nova (ou depois de um HD pifar).
> Não é uma cópia de um `.zshrc` específico — é um passo-a-passo comentado com blocos
> prontos para colar. Adapte os caminhos (`~/_dev`, versões do Homebrew) ao seu setup.

### 0. Pré-requisitos (Homebrew + pacotes)

```bash
# Homebrew (se ainda não tiver): https://brew.sh
brew install fzf nvm libpq jq
/opt/homebrew/opt/fzf/install --all --no-bash --no-fish   # configura o fzf
mkdir -p "$HOME/.nvm"                                       # dir do nvm
```

Clone as tools deste repo (os aliases mais abaixo apontam para cá):

```bash
git clone git@github.com:moreirathiagoa/terminal-tools.git ~/_dev/_/_zsh-tools
chmod +x ~/_dev/_/_zsh-tools/*.js   # garante que os scripts sejam executáveis
```

### 1. `~/.zshenv` — locale e TMPDIR (roda ANTES de tudo)

O `.zshenv` é o primeiro arquivo lido pelo zsh, antes de `.zprofile` e `.zshrc`.
Use-o para o que precisa valer cedo: locale UTF-8 (evita problemas de acento em
git/sort/CLI) e, no macOS, a normalização do `TMPDIR` (alguns lançadores herdam um
TMPDIR longo demais e quebram sockets Unix).

```zsh
# Normaliza TMPDIR no macOS (evita "path must be shorter than SUN_LEN").
if _darwin_tmp="$(getconf DARWIN_USER_TEMP_DIR 2>/dev/null)" && [[ -n "$_darwin_tmp" ]]; then
    export TMPDIR="$_darwin_tmp"
fi
unset _darwin_tmp

# Locale UTF-8 para qualquer shell (só LANG, sem LC_ALL, para permitir override).
export LANG="en_US.UTF-8"
```

### 2. Histórico robusto

As opções abaixo deduplicam de forma agressiva, gravam timestamp/duração e mantêm um
histórico grande. Ponto importante: `SHARE_HISTORY` costuma conflitar com
`INC_APPEND_HISTORY` — deixe só um (aqui usamos o append incremental).

```zsh
setopt HIST_IGNORE_SPACE      # não salva comando iniciado por espaço
setopt HIST_IGNORE_DUPS       # ignora duplicata consecutiva
setopt HIST_IGNORE_ALL_DUPS   # remove duplicatas antigas ao salvar (cobre FIND_NO_DUPS)
setopt HIST_SAVE_NO_DUPS      # não salva comando duplicado no arquivo
setopt HIST_EXPIRE_DUPS_FIRST # descarta duplicatas primeiro quando enche
setopt INC_APPEND_HISTORY     # salva assim que executado
setopt EXTENDED_HISTORY       # grava timestamp + duração (: <epoch>:<dur>;cmd)
setopt HIST_REDUCE_BLANKS     # remove espaços redundantes
setopt PROMPT_SUBST           # permite variáveis no prompt
# setopt SHARE_HISTORY        # NÃO ligar junto com INC_APPEND_HISTORY

HISTSIZE=100000
SAVEHIST=100000
HISTFILE=~/.zsh_history
```

> Nota sobre o arquivo de histórico: o zsh grava certos bytes acentuados em formato
> "metafied" (ex.: `á` vira `c3 83 81` no disco) e desfaz na leitura. Isso é normal,
> não é corrupção — no Ctrl+R aparece correto. Comandos multi-linha são gravados como
> um bloco com `\` no fim de cada linha interna; não são "entradas quebradas".

### 3. Completions com cache (shell abre mais rápido)

O `compinit` cru rescaneia completions a cada shell. Com cache, regenera o dump só
a cada 24h. Se instalar algo novo com completions e não aparecer: `rm ~/.zcompdump && compinit`.

```zsh
fpath=("$HOME/.zsh/completions" $fpath)   # ajuste/remova se não usar completions extras
autoload -Uz compinit
if [[ -n "$HOME"/.zcompdump(#qN.mh+24) ]]; then
    compinit
else
    compinit -C
fi
```

### 4. NVM

Carga direta (mais lenta na abertura, porém garante que ferramentas globais do node
estejam sempre disponíveis). Alternativa para shell mais rápido: lazy-load ou `fnm`.

```zsh
export NVM_DIR="$HOME/.nvm"
[[ -s "/opt/homebrew/opt/nvm/nvm.sh" ]] && source "/opt/homebrew/opt/nvm/nvm.sh"
```

### 5. Aliases e integração das tools deste repo

As tools ficam fora do `PATH` e são acessíveis por estes aliases. O `histpurge` é uma
função porque roda `reload` (recarrega o shell) no fim.

```zsh
export CLICOLOR=1
alias grep='grep --color=auto'
alias diff='diff --color=auto'
alias ls='ls -G'
alias histedit='code ~/.zsh_history'

alias histdevsync='$HOME/_dev/_/_zsh-tools/histdevsync.js'
alias histpop='$HOME/_dev/_/_zsh-tools/histpop.js'
alias xcurl='$HOME/_dev/_/_zsh-tools/xcurl.js'
alias pingc='$HOME/_dev/_/_zsh-tools/pingc.js'
histpurge() {
    "$HOME/_dev/_/_zsh-tools/histpurge.js"
    reload
}
```

### 6. Prompt informativo (duas linhas, com branch git e status)

Mostra caminho encurtado, branch git, horário e um marcador que fica verde/vermelho
conforme o exit code do último comando. Requer `setopt PROMPT_SUBST` (seção 2).

```zsh
parse_git_branch() {
    local branch
    branch=$(git symbolic-ref --quiet --short HEAD 2>/dev/null || git rev-parse --short HEAD 2>/dev/null) || return
    print -r -- "[$branch]"
}

PROMPT_GREEN=$'%F{82}'
PROMPT_BLUE=$'%F{45}'
PROMPT_RED=$'%F{196}'
PROMPT_GRAY=$'%F{242}'
PROMPT_WHITE=$'%f'

export PROMPT='╭┈ ${PROMPT_GREEN}%(4~|.../%3~|%~) ${PROMPT_BLUE}$(parse_git_branch)
${PROMPT_WHITE}╰┈%(?.${PROMPT_GREEN}.${PROMPT_RED})➤ ${PROMPT_GRAY}%* ${PROMPT_WHITE}$ '
```

### 7. Funções úteis

`reload` recarrega o shell (aplica mudanças de config); `scurl` é um `curl` com JSON
colorido e pager — complemento do `xcurl` para quando você precisa de flags do curl
real (`-u`, `-F`, `-L`, ...).

```zsh
reload() {
    echo "Recarregando o shell."
    exec zsh
}

scurl() {
    # Uso: scurl [opções do curl] "URL"  (use aspas: o ? é glob no zsh)
    local tmp_body http_code
    tmp_body=$(mktemp)
    http_code=$(curl -sS -H "Accept: application/json" -H "Content-Type: application/json" \
        -o "$tmp_body" -w "%{http_code}" "$@")
    echo "→ HTTP $http_code" >&2
    local is_json=0
    jq -e . "$tmp_body" >/dev/null 2>&1 && is_json=1
    if [[ -t 1 ]]; then
        if (( is_json )); then jq -C . "$tmp_body" | less -R -F -X; else less -R -F -X "$tmp_body"; fi
    else
        if (( is_json )); then jq . "$tmp_body"; else cat "$tmp_body"; fi
    fi
    rm -f "$tmp_body"
}
```

### 8. PATH e integrações finais

```zsh
export KUBE_EDITOR="code -w"
export PATH="/opt/homebrew/opt/libpq/bin:$PATH"       # libpq (psql etc.)
export PATH="$HOME/_dev/_/_scripts:$PATH"             # scripts pessoais viram comandos
[ -f ~/.fzf.zsh ] && source ~/.fzf.zsh                # fzf
```

Se usar o **Kiro CLI**, ele injeta blocos pre/post no topo/base do `.zshrc` e do
`.zprofile` — não remova essas linhas. A integração de shell do Kiro também entra no
`.zshrc`:

```zsh
[[ "$TERM_PROGRAM" == "kiro" ]] && . "$(kiro --locate-shell-integration-path zsh)"
```

### Ordem final e como aplicar

Ordem de carga do zsh: **`.zshenv` → `.zprofile` → `.zshrc`**. Coloque o locale/TMPDIR
no `.zshenv`; blocos de login (Homebrew `shellenv`, pre/post do Kiro) no `.zprofile`;
o resto (seções 2–8) no `.zshrc`. Depois:

```bash
exec zsh   # ou abra um terminal novo
```

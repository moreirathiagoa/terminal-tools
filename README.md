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

# terminal-tools

Ferramentas CLI pessoais para produtividade no terminal. Todas rodam com Node.js sem dependências externas.

## Instalação

```bash
git clone git@github.com:moreirathiagoa/terminal-tools.git ~/_dev/_/_zsh-tools
```

No `~/.zshrc`, adicione os aliases:

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

```bash
pingc                     # pinga 1.1.1.1 (default)
pingc -c 50 google.com   # 50 pings com resumo final
pingc -h                  # help completo
```

Exibe: latência, spike (▲/▼), tendência (↑/↓), jitter, desvio padrão, e adequação para videocall/streaming/gaming.

Teclas durante execução: `Enter` = resumo parcial, `h` = legenda, `Ctrl+C` = resumo + sai, `Ctrl+D` = sai.

### histdevsync

Sincroniza atalhos de abertura de projetos no histórico do zsh. Para cada projeto em `~/_dev`, adiciona `kiro ~/_dev/<nome>/` e `code ~/_dev/<nome>/` ao histórico.

```bash
histdevsync
```

### histpop

Remove o último comando do histórico do zsh.

```bash
histpop
```

### histpurge

Limpa comandos antigos do histórico, mantendo os N mais recentes por prefixo configurado.

```bash
histpurge           # usa defaults
histpurge 30 git    # mantém 30 últimos comandos git
```

### xcurl

curl simplificado com saída JSON formatada.

```bash
xcurl https://api.example.com/data
xcurl -X POST -d '{"key":"val"}' https://api.example.com
```

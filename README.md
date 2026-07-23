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

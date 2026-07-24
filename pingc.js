#!/usr/bin/env node

// pingc - ping com análise de latência e jitter em tempo real
//
// Uso:
//   pingc [opções do ping] [host]   (default: 1.1.1.1)
//   pingc -h, --help               Exibe ajuda
//
// Spawna o ping como child process e enriquece a saída com métricas
// de qualidade calculadas sobre janela deslizante de 20 amostras.

const { spawn } = require('child_process')
const readline = require('readline')

// ── configuração ─────────────────────────────────────────────────────────────
const WIN = 20
const DEFAULT_HOST = '1.1.1.1'
const IS_WIN = process.platform === 'win32'

// limiares de status por serviço: [ok, warn] para lat, jit, loss
const THRESHOLDS = {
	vid: { lat: [100, 200], jit: [15, 30], loss: [1, 2] },
	str: { lat: [250, 400], jit: [40, 60], loss: [1.5, 3] },
	game: { lat: [40, 80], jit: [5, 12], loss: [0.5, 1.5] },
}

// ── ANSI helpers ─────────────────────────────────────────────────────────────
const clr = (code, s) => `\x1b[${code}m${s}\x1b[0m`
const green = (s) => clr(32, s)
const yellow = (s) => clr(33, s)
const red = (s) => clr(31, s)
const gray = (s) => clr(37, s)

function useStatus(lat, jit, loss, th) {
	if (lat < th.lat[0] && jit < th.jit[0] && loss < th.loss[0]) return green('✓')
	if (lat < th.lat[1] && jit < th.jit[1] && loss < th.loss[1])
		return yellow('⚠')
	return red('✗')
}

// ── help ─────────────────────────────────────────────────────────────────────
const HELP = `
pingc - ping com análise de latência e jitter em tempo real

USO:
  pingc [opções do ping] [host]   (default: ${DEFAULT_HOST})
  pingc -h, --help               Exibe esta ajuda

OPÇÕES DO PING (todas suportadas):
  -c count      Número de pings (ex: pingc -c 100 google.com)
  -i interval   Intervalo entre pings em segundos (ex: pingc -i 0.5 8.8.8.8)
  -W timeout    Timeout por resposta em segundos

EXEMPLOS:
  pingc -c 50 google.com         # Diagnóstico robusto (≈50s)
  pingc -c 30 -i 0.2 1.1.1.1     # Teste rápido
  pingc 8.8.8.8                  # Ping contínuo (Ctrl+C para parar)

INTERPRETAÇÃO - LATÊNCIA (tempo de resposta):
    < 50ms:   ✓ EXCELENTE  → Imperceptível, ideal para todos os usos
    50-100ms: ✓ BOM        → Adequado para maioria das aplicações
    100-200ms: ⚠ ACEITÁVEL → Notável em videocalls e gaming
    > 200ms:  ✗ RUIM       → VoIP/gaming severamente afetados

INTERPRETAÇÃO - JITTER (desvio padrão da variação):
    < 5ms:    ✓ EXCELENTE  → Rede muito estável
    5-10ms:   ✓ BOM        → Adequado para videocalls e VoIP
    10-30ms:  ⚠ ACEITÁVEL  → Pode impactar áudio/vídeo
    > 30ms:   ✗ RUIM       → Investigar qualidade de conexão

INDICADORES VISUAIS:
  ▲          → Spike para cima: latência atual > 2x a média (degradação súbita)
  ▼          → Spike para baixo: latência atual < metade da média (melhoria súbita)
  ↑ ↓ ─     → Tendência: latência subindo / descendo / estável
               (compara metades da janela; limiar ±20%)

MÉTRICAS EXIBIDAS:
  lat        → Latência da resposta (ms)
  jit        → Variação instantânea desde o ping anterior
  avg        → Latência média (janela deslizante de ${WIN} amostras)
  sd         → Desvio padrão do jitter (mesma janela)
  loss       → Pacotes perdidos (total acumulado)
  vid/str/game → Adequação para videocall / streaming / gaming
    ✓ = adequado  ⚠ = limitado  ✗ = inadequado

LIMIARES POR SERVIÇO:
  Videocall (Zoom/Meet/Teams):
    ✓  lat < 100ms, jitter < 15ms, loss < 1%
    ⚠  lat < 200ms, jitter < 30ms, loss < 2%

  Streaming (Netflix/YouTube):
    ✓  lat < 250ms, jitter < 40ms, loss < 1.5%
    ⚠  lat < 400ms, jitter < 60ms, loss < 3%

  Gaming:
    ✓  lat < 40ms, jitter < 5ms, loss < 0.5%
    ⚠  lat < 80ms, jitter < 12ms, loss < 1.5%

NOTAS:
  - Janela deslizante de ${WIN} amostras (~${WIN}s com intervalo padrão)
  - Valores RTT (ida+volta); referências de VoIP usam one-way (≈metade)
  - Spike (▲/▼) ajuda a detectar impacto de downloads concorrentes

TECLAS (durante execução):
  Enter       → Exibe resumo parcial e continua
  h           → Exibe legenda dos ícones
  Ctrl+D      → Sai sem resumo
  Ctrl+C      → Exibe resumo final e sai
`.trim()

// ── parse args (platform-aware) ──────────────────────────────────────────────
const args = process.argv.slice(2)

if (args.includes('-h') || args.includes('--help')) {
	console.log(HELP)
	process.exit(0)
}

// Flags que recebem valor no ping unix
const UNIX_FLAGS_WITH_VALUE = new Set([
	'-c',
	'-i',
	'-W',
	'-s',
	'-t',
	'-S',
	'-G',
	'-g',
	'-l',
	'-m',
	'-p',
	'-T',
	'-z',
])

// Flags que recebem valor no ping Windows
const WIN_FLAGS_WITH_VALUE = new Set(['-n', '-w', '-l', '-i', '-S'])

function buildPingArgsUnix(args) {
	const flags = []
	let host = null

	for (let idx = 0; idx < args.length; idx++) {
		const arg = args[idx]
		if (arg.startsWith('-')) {
			flags.push(arg)
			if (UNIX_FLAGS_WITH_VALUE.has(arg) && idx + 1 < args.length) {
				flags.push(args[++idx])
			}
		} else {
			host = arg
		}
	}

	if (!host) host = DEFAULT_HOST
	return [...flags, host]
}

function buildPingArgsWindows(args) {
	const flags = []
	let host = null

	for (let idx = 0; idx < args.length; idx++) {
		const arg = args[idx]
		if (arg.startsWith('-')) {
			// Traduz flags unix comuns para equivalentes Windows
			if (arg === '-c' && idx + 1 < args.length) {
				flags.push('-n')
				flags.push(args[++idx])
			} else if (arg === '-W' && idx + 1 < args.length) {
				// -W timeout (s) → -w timeout (ms)
				flags.push('-w')
				flags.push(String(parseFloat(args[++idx]) * 1000))
			} else {
				flags.push(arg)
				if (WIN_FLAGS_WITH_VALUE.has(arg) && idx + 1 < args.length) {
					flags.push(args[++idx])
				}
			}
		} else {
			host = arg
		}
	}

	if (!host) host = DEFAULT_HOST
	// Windows: ping contínuo precisa de -t (não tem -c equivalente ao infinito)
	if (!flags.includes('-n') && !flags.includes('-t')) {
		flags.push('-t')
	}
	return [...flags, host]
}

const pingArgs = IS_WIN ? buildPingArgsWindows(args) : buildPingArgsUnix(args)

// ── estado ───────────────────────────────────────────────────────────────────
let i = 0
let n = 0
let prev = 0
let jitterMax = 0
let jitterMin = Infinity
let latMin = Infinity
let latMax = 0
let totalSent = 0
let totalLost = 0
let idxLoss = 0
let totalLatSum = 0
let totalJitSum = 0
let totalJitSumsq = 0
let totalJitCount = 0
const windowLat = new Array(WIN).fill(0)
const windowJit = new Array(WIN).fill(0)
const windowLoss = new Array(WIN).fill(0)

// ── funções de cálculo ───────────────────────────────────────────────────────
function calcStats() {
	let sumLat = 0
	let sumJit = 0
	let sumsqJit = 0
	for (let j = 0; j < n; j++) {
		sumLat += windowLat[j]
		sumJit += windowJit[j]
		sumsqJit += windowJit[j] * windowJit[j]
	}
	const avgLat = sumLat / n
	const avgJit = sumJit / n
	let varJit = sumsqJit / n - avgJit * avgJit
	if (varJit < 0) varJit = 0
	const stddevJit = Math.sqrt(varJit)
	return { avgLat, stddevJit }
}

function calcSpike(t, avgLat) {
	if (n >= 2 && t > avgLat * 2) return red('▲')
	if (n >= 2 && t < avgLat / 2) return green('▼')
	return '-'
}

function calcTrend() {
	if (n < 6) return gray('-')
	const half = Math.floor(n / 2)
	let s1 = 0
	let s2 = 0
	for (let j = 0; j < half; j++) s1 += windowLat[(i - n + j + WIN) % WIN]
	for (let j = half; j < n; j++) s2 += windowLat[(i - n + j + WIN) % WIN]
	const avgFirst = s1 / half
	const avgSecond = s2 / (n - half)
	const pct = ((avgSecond - avgFirst) / avgFirst) * 100
	if (pct > 20) return red('↑')
	if (pct < -20) return green('↓')
	return gray('-')
}

function calcWinLossPct() {
	const nLoss = Math.min(idxLoss, WIN)
	if (nLoss === 0) return 0
	let sum = 0
	for (let j = 0; j < nLoss; j++) sum += windowLoss[j]
	return (sum / nLoss) * 100
}

function ts() {
	const d = new Date()
	return [d.getHours(), d.getMinutes(), d.getSeconds()]
		.map((v) => String(v).padStart(2, '0'))
		.join(':')
}

function pad(num, width, decimals) {
	return num.toFixed(decimals).padStart(width)
}

// ── parsers por plataforma ───────────────────────────────────────────────────
function parsePingLineUnix(line) {
	const seqMatch = line.match(/icmp_seq=(\d+)/)
	const timeMatch = line.match(/time=([\d.]+)/)
	if (!timeMatch) return null
	return {
		seq: seqMatch ? seqMatch[1] : '?',
		t: parseFloat(timeMatch[1]),
	}
}

function parsePingLineWindows(line) {
	// "Reply from 8.8.8.8: bytes=32 time=12ms TTL=116"
	// "Reply from 8.8.8.8: bytes=32 time<1ms TTL=116"
	const timeMatch = line.match(/time[=<]([\d.]+)\s*ms/)
	if (!timeMatch) return null
	// Windows não mostra seq, extraímos do contador
	return {
		seq: String(totalSent + 1),
		t: parseFloat(timeMatch[1]),
	}
}

function isTimeoutUnix(line) {
	return /Request timeout|no answer/.test(line)
}

function isTimeoutWindows(line) {
	return /Request timed out|General failure/.test(line)
}

function isSummaryLine(line) {
	if (IS_WIN) return /Ping statistics for/.test(line)
	return /^---/.test(line)
}

function isResponseLine(line) {
	if (IS_WIN) return /time[=<]/.test(line)
	return /time=/.test(line)
}

const parsePingLine = IS_WIN ? parsePingLineWindows : parsePingLineUnix
const isTimeout = IS_WIN ? isTimeoutWindows : isTimeoutUnix

// ── processamento de linha ───────────────────────────────────────────────────
function updateState(t) {
	totalSent++
	windowLoss[idxLoss++ % WIN] = 0

	if (t < latMin) latMin = t
	if (t > latMax) latMax = t
	totalLatSum += t

	// primeiro ping: sem jitter ainda
	if (prev === 0) {
		prev = t
		return null
	}

	// jitter instantâneo
	const d = Math.abs(t - prev)
	if (d > jitterMax) jitterMax = d
	if (d < jitterMin) jitterMin = d
	totalJitSum += d
	totalJitSumsq += d * d
	totalJitCount++

	// janela circular
	windowLat[i % WIN] = t
	windowJit[i % WIN] = d
	i++
	n = Math.min(i, WIN)

	const { avgLat, stddevJit } = calcStats()
	const winLossPct = calcWinLossPct()

	prev = t

	return { d, avgLat, stddevJit, winLossPct }
}

function formatLine(seq, t, metrics) {
	const { d, avgLat, stddevJit, winLossPct } = metrics
	const now = ts()

	const spike = calcSpike(t, avgLat)
	const trend = calcTrend()

	const lossStr = totalLost > 0 ? ` loss:${totalLost}` : ''

	const latSt =
		avgLat < 50
			? green('✓')
			: avgLat < 100
				? yellow('✓')
				: avgLat < 200
					? yellow('⚠')
					: red('✗')
	const jitSt =
		stddevJit < 5
			? green('✓')
			: stddevJit < 10
				? yellow('✓')
				: stddevJit < 30
					? yellow('⚠')
					: red('✗')

	const vc = useStatus(avgLat, stddevJit, winLossPct, THRESHOLDS.vid)
	const st = useStatus(avgLat, stddevJit, winLossPct, THRESHOLDS.str)
	const gm = useStatus(avgLat, stddevJit, winLossPct, THRESHOLDS.game)

	return `#${seq.padStart(4)}  ${now} | lat:${pad(t, 6, 1)}ms ${spike} ${trend} avg:${pad(avgLat, 6, 1)} ${latSt} | jit:${pad(d, 5, 1)}  sd:${pad(stddevJit, 4, 1)} ${jitSt}${lossStr} | vid:${vc} str:${st} game:${gm}\n`
}

function processResponse(line) {
	const parsed = parsePingLine(line)
	if (!parsed) return
	const metrics = updateState(parsed.t)
	if (!metrics) return
	process.stdout.write(formatLine(parsed.seq, parsed.t, metrics))
}

function processTimeout() {
	totalSent++
	totalLost++
	windowLoss[idxLoss++ % WIN] = 1
	const lossPct = (totalLost / totalSent) * 100
	process.stdout.write(
		`       ${ts()}  ${red('✗ TIMEOUT')} | loss: ${totalLost}/${totalSent} (${lossPct.toFixed(1)}%)\n`,
	)
}

function printSummary(partial) {
	if (i < 2) {
		process.stdout.write('  (dados insuficientes para resumo)\n')
		return
	}

	const { avgLat, stddevJit } = calcStats()
	const lossPct = totalSent > 0 ? (totalLost / totalSent) * 100 : 0
	const totalAvgLat = totalLatSum / totalSent
	const lossStr = totalLost > 0 ? `  loss:${totalLost}/${totalSent}(${lossPct.toFixed(1)}%)` : ''

	// parcial: mesma formatação de uma linha de ping, mas com valores totais desde o início
	if (partial) {
		const totalAvgJit = totalJitCount > 0 ? totalJitSum / totalJitCount : 0
		let totalVarJit = totalJitCount > 0 ? (totalJitSumsq / totalJitCount) - (totalAvgJit * totalAvgJit) : 0
		if (totalVarJit < 0) totalVarJit = 0
		const totalSdJit = Math.sqrt(totalVarJit)
		const lossLabel = totalLost > 0 ? ` loss:${totalLost}` : ''
		const now = ts()

		const latSt = totalAvgLat < 50 ? green('✓') : totalAvgLat < 100 ? yellow('✓') : totalAvgLat < 200 ? yellow('⚠') : red('✗')
		const jitSt = totalSdJit < 5 ? green('✓') : totalSdJit < 10 ? yellow('✓') : totalSdJit < 30 ? yellow('⚠') : red('✗')

		const winLossPct = calcWinLossPct()
		const vc = useStatus(totalAvgLat, totalSdJit, winLossPct, THRESHOLDS.vid)
		const st = useStatus(totalAvgLat, totalSdJit, winLossPct, THRESHOLDS.str)
		const gm = useStatus(totalAvgLat, totalSdJit, winLossPct, THRESHOLDS.game)

		process.stdout.write(
			`\n>${String(totalSent).padStart(4)}  ${now} | lat: ${pad(latMin, 5, 1)}/${pad(totalAvgLat, 5, 1)}/${pad(latMax, 5, 1)} ${latSt} | jit: ${pad(jitterMin === Infinity ? 0 : jitterMin, 5, 2)}/${pad(totalSdJit, 5, 2)}/${pad(jitterMax, 5, 2)} ${jitSt}${lossLabel} | vid:${vc} str:${st} game:${gm}\n\n`,
		)
		return
	}

	// final: completo
	const SEP = '─────────────────────────────────────────────────────'
	const totalAvgJit = totalJitCount > 0 ? totalJitSum / totalJitCount : 0

	// min/max da janela
	let winLatMin = Infinity, winLatMax = 0
	let winJitMin = Infinity, winJitMax = 0
	for (let j = 0; j < n; j++) {
		if (windowLat[j] < winLatMin) winLatMin = windowLat[j]
		if (windowLat[j] > winLatMax) winLatMax = windowLat[j]
		if (windowJit[j] < winJitMin) winJitMin = windowJit[j]
		if (windowJit[j] > winJitMax) winJitMax = windowJit[j]
	}

	process.stdout.write(`\n${SEP}\nRESUMO FINAL\n${SEP}\n`)
	process.stdout.write(
		`  Latência:    ${totalSent} pings:   min ${latMin.toFixed(2)}  avg ${totalAvgLat.toFixed(2)}  max ${latMax.toFixed(2)} ms\n`,
	)
	process.stdout.write(
		`               Últimos ${n}: min ${winLatMin.toFixed(2)}  avg ${avgLat.toFixed(2)}  max ${winLatMax.toFixed(2)} ms\n`,
	)
	process.stdout.write(
		`  Jitter:      ${totalSent} pings:   min ${jitterMin === Infinity ? '—' : jitterMin.toFixed(2)}  avg ${totalAvgJit.toFixed(2)}  max ${jitterMax.toFixed(2)} ms\n`,
	)
	process.stdout.write(
		`               Últimos ${n}: min ${winJitMin.toFixed(2)}  avg ${stddevJit.toFixed(2)}  max ${winJitMax.toFixed(2)} ms\n`,
	)
	process.stdout.write(
		`  Packet loss: ${totalLost}/${totalSent} (${lossPct.toFixed(1)}%)\n`,
	)

	const latOk = avgLat < 100
	const jitOk = stddevJit < 10
	const lossOk = lossPct < 1

	if (latOk && jitOk && lossOk) {
		process.stdout.write(
			`\n  ${green('✓ EXCELENTE: Conexão estável e responsiva')}\n`,
		)
		process.stdout.write(
			'    Ideal para: VoIP, videoconferência HD/4K, gaming competitivo\n',
		)
	} else if (avgLat < 100 && stddevJit < 20 && lossPct < 3) {
		process.stdout.write(
			`\n  ${yellow('✓ BOM: Conexão adequada para a maioria dos usos')}\n`,
		)
		process.stdout.write(
			'    Adequado para: streaming, navegação, videocalls\n',
		)
	} else {
		const grade =
			avgLat >= 200 || stddevJit >= 30 || lossPct >= 5
				? red('✗ RUIM: Sérios problemas detectados')
				: yellow('⚠ ACEITÁVEL: Limitações detectadas')
		process.stdout.write(`\n  ${grade}\n`)
		if (avgLat >= 200)
			process.stdout.write(
				`    ${red(`✗ Latência muito alta (${avgLat.toFixed(1)} ms)`)}\n`,
			)
		else if (avgLat >= 100)
			process.stdout.write(
				`    ${yellow(`⚠ Latência elevada (${avgLat.toFixed(1)} ms)`)}\n`,
			)
		if (stddevJit >= 30)
			process.stdout.write(
				`    ${red(`✗ Jitter crítico (${stddevJit.toFixed(2)} ms) — rede instável`)}\n`,
			)
		else if (stddevJit >= 10)
			process.stdout.write(
				`    ${yellow(`⚠ Jitter elevado (${stddevJit.toFixed(2)} ms)`)}\n`,
			)
		if (lossPct >= 5)
			process.stdout.write(
				`    ${red(`✗ Perda de pacotes severa (${lossPct.toFixed(1)}%)`)}\n`,
			)
		else if (lossPct >= 1)
			process.stdout.write(
				`    ${yellow(`⚠ Perda de pacotes detectada (${lossPct.toFixed(1)}%)`)}\n`,
			)
		process.stdout.write(
			'    Investigar: provedor de internet, roteador, congestionamento\n',
		)
	}
	process.stdout.write(`${SEP}\n\n`)
}

function processSummary(line) {
	process.stdout.write(`\n${line}\n`)
	printSummary(false)
}

// ── main ─────────────────────────────────────────────────────────────────────
const ping = spawn('ping', pingArgs, { stdio: ['ignore', 'pipe', 'pipe'] })

const rl = readline.createInterface({ input: ping.stdout })

rl.on('line', (line) => {
	if (isResponseLine(line)) {
		processResponse(line)
	} else if (isTimeout(line)) {
		processTimeout()
	} else if (isSummaryLine(line)) {
		processSummary(line)
	} else {
		process.stdout.write(line + '\n')
	}
})

ping.stderr.on('data', (chunk) => process.stderr.write(chunk))

ping.on('close', (code) => {
	process.exit(code ?? 0)
})

// ── keypress: stdin em raw mode ──────────────────────────────────────────────
if (process.stdin.isTTY) {
	process.stdin.setRawMode(true)
	process.stdin.resume()
	process.stdin.on('data', (key) => {
		const ch = key.toString()
		switch (ch) {
			case '\x03':
				// Ctrl+C → mata o ping (que vai imprimir stats e disparar processSummary)
				ping.kill('SIGINT')
				break
			case '\x04':
				// Ctrl+D → sai direto sem resumo
				ping.kill('SIGTERM')
				process.exit(0)
			case '\r':
			case '\n':
				// Enter → resumo parcial, continua rodando
				printSummary(true)
				break
			case 'h':
			case 'H':
				// h → legenda dos ícones
				process.stdout.write(
					[
						'',
						gray('─── LEGENDA ────────────────────────────────────────'),
						`  ${red('▲')} Spike: latência > 2x a média (degradação)`,
						`  ${green('▼')} Spike: latência < metade da média (melhoria)`,
						`  ${red('↑')} Tendência de subida (>20%)   ${green('↓')} Descida   ${gray('-')} Estável`,
						`  ${green('✓')} Bom   ${yellow('⚠')} Aceitável   ${red('✗')} Ruim`,
						'',
						'  vid = videocall   str = streaming   game = gaming',
						'',
						gray('  Enter=resumo  Ctrl+D=sair  h=esta legenda'),
						gray('───────────────────────────────────────────────────'),
						'',
					].join('\n'),
				)
				break
		}
	})
} else {
	// Não é terminal (pipe), fallback sem raw mode
	process.on('SIGINT', () => {
		ping.kill('SIGINT')
	})
}

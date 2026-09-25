#!/usr/bin/env node

// Limpa comandos antigos do histórico do zsh, mantendo os N mais recentes
// por prefixo configurado. Opera por COMANDO LÓGICO, não por linha física:
// - entende histórico estendido (: <epoch>:<dur>;comando)
// - agrupa comandos multi-linha (continuação por "\" no fim da linha), para
//   nunca remover uma linha interna isolada e quebrar o comando.
// Preserva os bytes originais (inclusive o formato "metafied" do zsh).
//
// Uso: histpurge [keep_count] [prefixo...]   (sem args = usa defaults abaixo)
// Histórico lido de $HISTFILE (ou ~/.zsh_history).

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

// Config padrão (edite à vontade). Pode sobrescrever via argumentos:
//   histpurge <keep_count> <prefixo...>
const DEFAULT_KEEP_COUNT = 50
// Prefixos escolhidos com base no uso real (analise do historico). O histpurge
// mantem os N mais recentes POR PREFIXO, entao a lista mira ruido de alta
// frequencia e descartavel. NAO inclui git commit/push/checkout/merge nem
// docker/curl com args unicos, que voce pode querer recuperar exatos via Ctrl+R.
// O match usa o PRIMEIRO prefixo que casa, por isso os subcomandos especificos
// (ex.: 'git add') vem em vez de um 'git' generico, para nao purgar commits.
const DEFAULT_PREFIXES = [
	// ruido de alta frequencia
	'sleep',
	'ls',
	'cat',
	'cd',
	'echo',
	'grep',
	'find',
	// git: apenas o ruido (commit/push/checkout/merge ficam preservados)
	'git add',
	'git status',
	'git diff',
	'git log',
	// yarn/npm: builds e checks repetitivos
	'yarn verify',
	'yarn build',
	'yarn format',
	'yarn lint',
	'yarn test',
	'yarn vitest',
	'npx',
	// gh: comandos repetitivos
	'gh run',
	'gh pr',
	// infra local repetitiva
	'docker',
	'curl',
	// remove todos os comentarios (comportamento especial do '#')
	'#',
]

const keepCount = process.argv[2]
	? parseInt(process.argv[2], 10)
	: DEFAULT_KEEP_COUNT
const prefixes =
	process.argv.length > 3
		? process.argv
				.slice(3)
				.map((p) => p.trim())
				.filter(Boolean)
		: DEFAULT_PREFIXES

if (!Number.isInteger(keepCount) || keepCount < 0) {
	console.error('Erro: keep_count inválido.')
	process.exit(1)
}

if (prefixes.length === 0) {
	console.error('Erro: nenhum prefixo informado para limpeza.')
	process.exit(1)
}

const histFile = process.env.HISTFILE || path.join(os.homedir(), '.zsh_history')

if (!fs.existsSync(histFile)) {
	console.error('Erro: Arquivo de histórico não encontrado.')
	process.exit(1)
}

console.log(
	`Limpando comandos antigos (mantendo os ${keepCount} mais recentes por prefixo). Todos comentários removidos.`,
)

// Lê preservando bytes; quebra por linha física mantendo o \n de cada uma.
const raw = fs.readFileSync(histFile)
const physicalLines = []
{
	let start = 0
	for (let i = 0; i < raw.length; i++) {
		if (raw[i] === 0x0a) {
			physicalLines.push(raw.subarray(start, i + 1))
			start = i + 1
		}
	}
	if (start < raw.length) physicalLines.push(raw.subarray(start))
}

// Agrupa linhas físicas em COMANDOS LÓGICOS. Uma linha "continua" o comando
// seguinte quando termina em "\" (imediatamente antes do \n). O comando fecha
// na primeira linha física que NÃO termina em "\".
function endsWithBackslash(buf) {
	// Ignora o \n final (se houver) e testa o último byte útil.
	let end = buf.length
	if (end > 0 && buf[end - 1] === 0x0a) end--
	return end > 0 && buf[end - 1] === 0x5c // 0x5c = "\"
}

const commands = [] // cada item: { buf: Buffer, startLine: number }
{
	let group = []
	let groupStart = 0
	physicalLines.forEach((line, idx) => {
		if (group.length === 0) groupStart = idx
		group.push(line)
		if (!endsWithBackslash(line)) {
			commands.push({ buf: Buffer.concat(group), startLine: groupStart })
			group = []
		}
	})
	if (group.length > 0) {
		commands.push({ buf: Buffer.concat(group), startLine: groupStart })
	}
}

// Normaliza um comando lógico para casar prefixo: remove o cabeçalho de
// extended-history (": <epoch>:<dur>;") e os espaços iniciais. Usa só a
// primeira linha lógica para o match de prefixo (o prefixo é o começo do cmd).
function normalize(cmdBuf) {
	let text = cmdBuf.toString('utf8')
	if (text.startsWith(': ')) {
		const sep = text.indexOf(';')
		if (sep !== -1) text = text.slice(sep + 1)
	}
	return text.replace(/^\s+/, '')
}

function firstMatchingPrefix(command) {
	for (const prefix of prefixes) {
		if (command.startsWith(prefix)) return prefix
	}
	return null
}

const prefixToIndices = new Map(prefixes.map((p) => [p, []]))

commands.forEach((cmd, i) => {
	const match = firstMatchingPrefix(normalize(cmd.buf))
	if (match !== null) prefixToIndices.get(match).push(i)
})

const toRemove = new Set() // índices de COMANDOS lógicos a remover
const removedByPrefix = {}
const totalByPrefix = {}
let totalMatches = 0

for (const [prefix, indices] of prefixToIndices) {
	const count = indices.length
	totalByPrefix[prefix] = count
	totalMatches += count

	if (prefix === '#') {
		// Remove todos os comandos que SÃO comentários de topo (a 1ª linha
		// lógica começa com #). Comentários internos de um comando multi-linha
		// não entram aqui: eles fazem parte de outro comando lógico cujo
		// prefixo real não é "#", então ficam preservados junto do comando.
		indices.forEach((idx) => toRemove.add(idx))
		removedByPrefix[prefix] = indices.length
		continue
	}

	if (count > keepCount) {
		const oldIndices = indices.slice(0, count - keepCount)
		oldIndices.forEach((idx) => toRemove.add(idx))
		removedByPrefix[prefix] = oldIndices.length
	} else {
		removedByPrefix[prefix] = 0
	}
}

function formatStats() {
	return prefixes
		.map((p) => {
			const total = totalByPrefix[p] || 0
			const removed = removedByPrefix[p] || 0
			return `  - ${p}: total=${total}, removidos=${removed}, mantidos=${total - removed}`
		})
		.join('\n')
}

if (toRemove.size === 0) {
	console.log(
		`Nada para limpar. Existem ${totalMatches} comandos que batem com os prefixos ` +
			`(limite por prefixo: ${keepCount}).\n` +
			`Detalhes por prefixo:\n${formatStats()}`,
	)
	process.exit(0)
}

// Mantém os comandos lógicos não marcados, concatenando seus bytes originais.
const keptBuffers = commands
	.filter((_, i) => !toRemove.has(i))
	.map((c) => c.buf)

// Escreve em arquivo temporário e renomeia (atômico no mesmo filesystem).
const tmpFile = `${histFile}.tmp.${process.pid}`
try {
	fs.writeFileSync(tmpFile, Buffer.concat(keptBuffers))
	fs.renameSync(tmpFile, histFile)
} catch (err) {
	console.error(`Erro: falha ao atualizar o histórico: ${err.message}`)
	try {
		fs.unlinkSync(tmpFile)
	} catch {}
	process.exit(1)
}

console.log(
	`Sucesso! ${toRemove.size} comandos antigos removidos. ` +
		`Mantidos os ${keepCount} mais recentes por prefixo para: ${prefixes.join(', ')}.\n` +
		`Detalhes por prefixo:\n${formatStats()}`,
)
console.log('Para refletir no Ctrl+R sem duplicar numeracao, rode: exec zsh')

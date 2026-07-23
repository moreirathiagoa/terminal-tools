#!/usr/bin/env node

// Limpa comandos antigos do histórico do zsh, mantendo os N mais recentes
// por prefixo configurado. Lida com histórico estendido (: ts:dur;comando).
//
// Uso: histpurge [keep_count] [prefixo...]   (sem args = usa defaults abaixo)
// Histórico lido de $HISTFILE (ou ~/.zsh_history).

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

// Config padrão (edite à vontade). Pode sobrescrever via argumentos:
//   histpurge <keep_count> <prefixo...>
const DEFAULT_KEEP_COUNT = 50
const DEFAULT_PREFIXES = [
	'brew uninstall',
	'git commit',
	'git checkout',
	'git branch',
	'git pull',
	'git push',
	'git merge',
	'docker',
	'cd',
	'rm',
	'sudo rm',
	'ping',
	'echo',
	'curl',
	'scurl',
	'node',
	'python',
	'python3',
	'pip',
	'pip3',
	'mini-site-uuid-url.js',
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

// Preserva os bytes originais; divide por linha mantendo o \n.
const raw = fs.readFileSync(histFile)
const lines = []
{
	let start = 0
	for (let i = 0; i < raw.length; i++) {
		if (raw[i] === 0x0a) {
			lines.push(raw.subarray(start, i + 1))
			start = i + 1
		}
	}
	if (start < raw.length) lines.push(raw.subarray(start))
}

function normalize(lineBuf) {
	let text = lineBuf.toString('utf8')
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

lines.forEach((line, i) => {
	const match = firstMatchingPrefix(normalize(line))
	if (match !== null) prefixToIndices.get(match).push(i)
})

const toRemove = new Set()
const removedByPrefix = {}
const totalByPrefix = {}
let totalMatches = 0

for (const [prefix, indices] of prefixToIndices) {
	const count = indices.length
	totalByPrefix[prefix] = count
	totalMatches += count

	if (prefix === '#') {
		// Remove todos os comentários
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

const keptLines = lines.filter((_, i) => !toRemove.has(i))

// Escreve em arquivo temporário e renomeia (atômico no mesmo filesystem).
const tmpFile = `${histFile}.tmp.${process.pid}`
try {
	fs.writeFileSync(tmpFile, Buffer.concat(keptLines))
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

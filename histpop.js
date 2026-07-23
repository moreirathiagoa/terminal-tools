#!/usr/bin/env node

// Remove o último item "real" do histórico do zsh, ignorando o próprio
// comando histpop (que já foi anexado como última linha pelo INC_APPEND_HISTORY).
// Portanto remove o penúltimo item, juntando blocos multilinha com continuação (\).
//
// Uso: histpop   (sem parâmetros)
// Histórico lido de $HISTFILE (ou ~/.zsh_history).

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

if (process.argv.length > 2) {
  console.error("Uso: histpop (sem parametros).");
  process.exit(1);
}

const histFile = process.env.HISTFILE || path.join(os.homedir(), ".zsh_history");

if (!fs.existsSync(histFile)) {
  console.error("Erro: Arquivo de histórico não encontrado.");
  process.exit(1);
}

const raw = fs.readFileSync(histFile, "utf8");

// Divide em linhas equivalente ao `wc -l` / `sed`: cada \n encerra uma linha.
// Ignora um eventual conteúdo após o último \n (zsh sempre termina com \n).
const hasTrailingNewline = raw.endsWith("\n");
let lines = raw.split("\n");
if (hasTrailingNewline) lines.pop(); // remove o "" após o último \n

const lineCount = lines.length; // nº de linhas (igual ao wc -l)

if (lineCount === 0) {
  console.log("Histórico já está vazio.");
  process.exit(0);
}

if (lineCount < 2) {
  console.log("Não há penúltimo item para remover.");
  process.exit(0);
}

// Índices 1-based para espelhar o script original (sed/awk).
const targetLine = lineCount - 1; // penúltima linha
let targetStart = targetLine;

// Se o comando foi salvo em múltiplas linhas com continuação (\),
// volta até o início do bloco para remover tudo junto.
while (targetStart > 1) {
  const prevLine = lines[targetStart - 2]; // (targetStart-1) em 1-based
  if (!prevLine.endsWith("\\")) break;
  targetStart -= 1;
}

const removedItem = lines.slice(targetStart - 1, targetLine).join("\n");

// Mantém tudo fora do intervalo [targetStart, targetLine].
const kept = lines.filter((_, i) => {
  const nr = i + 1; // 1-based
  return nr < targetStart || nr > targetLine;
});

const tmpFile = `${histFile}.tmp.${process.pid}`;
const output = kept.length ? kept.join("\n") + "\n" : "";

try {
  fs.writeFileSync(tmpFile, output);
  fs.renameSync(tmpFile, histFile);
} catch (err) {
  console.error(`Erro: falha ao atualizar o histórico: ${err.message}`);
  try {
    fs.unlinkSync(tmpFile);
  } catch {}
  process.exit(1);
}

console.log(
  `Último item removido do histórico (linhas ${targetStart}-${targetLine}):`
);
console.log(`Comando: ${removedItem}`);

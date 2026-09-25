#!/usr/bin/env node

// Remove o último item "real" do histórico do zsh. Como o próprio comando
// histpop já foi anexado como último item (via INC_APPEND_HISTORY), o alvo é
// o PENÚLTIMO comando lógico.
//
// Opera por COMANDO LÓGICO, não por linha física: agrupa continuações
// multi-linha (linha que termina em "\") para remover o comando inteiro, e
// entende o cabeçalho de extended-history (": <epoch>:<dur>;") ao exibir.
// Preserva os bytes originais das demais entradas (formato "metafied" intacto).
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

// Lê preservando bytes; quebra por linha física mantendo o \n de cada uma.
const raw = fs.readFileSync(histFile);
const physicalLines = [];
{
  let start = 0;
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === 0x0a) {
      physicalLines.push(raw.subarray(start, i + 1));
      start = i + 1;
    }
  }
  if (start < raw.length) physicalLines.push(raw.subarray(start));
}

if (physicalLines.length === 0) {
  console.log("Histórico já está vazio.");
  process.exit(0);
}

// Uma linha "continua" o comando seguinte quando termina em "\" (antes do \n).
function endsWithBackslash(buf) {
  let end = buf.length;
  if (end > 0 && buf[end - 1] === 0x0a) end--;
  return end > 0 && buf[end - 1] === 0x5c; // 0x5c = "\"
}

// Agrupa linhas físicas em comandos lógicos.
const commands = []; // { buf: Buffer }
{
  let group = [];
  for (const line of physicalLines) {
    group.push(line);
    if (!endsWithBackslash(line)) {
      commands.push({ buf: Buffer.concat(group) });
      group = [];
    }
  }
  if (group.length > 0) commands.push({ buf: Buffer.concat(group) });
}

// O último comando é o próprio histpop; o alvo é o penúltimo.
if (commands.length < 2) {
  console.log("Não há penúltimo item para remover.");
  process.exit(0);
}

const targetIndex = commands.length - 2;

function displayCommand(buf) {
  let text = buf.toString("utf8").replace(/\n$/, "");
  // remove cabeçalho de extended-history, se houver, só para exibir
  if (text.startsWith(": ")) {
    const sep = text.indexOf(";");
    if (sep !== -1) text = text.slice(sep + 1);
  }
  return text;
}

const removedItem = displayCommand(commands[targetIndex].buf);

const keptBuffers = commands
  .filter((_, i) => i !== targetIndex)
  .map((c) => c.buf);

const tmpFile = `${histFile}.tmp.${process.pid}`;
try {
  fs.writeFileSync(tmpFile, Buffer.concat(keptBuffers));
  fs.renameSync(tmpFile, histFile);
} catch (err) {
  console.error(`Erro: falha ao atualizar o histórico: ${err.message}`);
  try {
    fs.unlinkSync(tmpFile);
  } catch {}
  process.exit(1);
}

console.log("Último item removido do histórico:");
console.log(`Comando: ${removedItem}`);

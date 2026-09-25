#!/usr/bin/env node

// Sincroniza comandos de abertura de projetos (_dev) no histórico do zsh.
// Para cada projeto em <base_dir> (default ~/_dev, ignorando o auxiliar "_"),
// garante que "kiro ~/_dev/<nome>/" e "code ~/_dev/<nome>/" estejam no histórico.
//
// Deduplica na PRÓPRIA escrita: só anexa os comandos que ainda não existem no
// histórico (comparando por comando lógico, ignorando o cabeçalho de
// extended-history ": <epoch>:<dur>;"). Assim não é mais preciso rodar `reload`
// só para remover as duplicatas que a versão antiga criava a cada execução.
//
// Uso: histdevsync.js [base_dir]
// Histórico lido de $HISTFILE (ou ~/.zsh_history).

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const baseDir = process.argv[2] || path.join(os.homedir(), "_dev");
const histFile = process.env.HISTFILE || path.join(os.homedir(), ".zsh_history");

if (!fs.existsSync(baseDir) || !fs.statSync(baseDir).isDirectory()) {
  console.error(`Erro: diretório base não encontrado: ${baseDir}`);
  process.exit(1);
}

if (!fs.existsSync(histFile)) {
  try {
    fs.writeFileSync(histFile, "");
  } catch {
    console.error(`Erro: não foi possível criar o histórico em: ${histFile}`);
    process.exit(1);
  }
}

const projects = fs
  .readdirSync(baseDir, { withFileTypes: true })
  .filter((e) => e.isDirectory() && e.name !== "_")
  .map((e) => e.name);

if (projects.length === 0) {
  console.log(`Nenhum projeto encontrado em: ${baseDir}`);
  process.exit(0);
}

// Remove o cabeçalho de extended-history (": <epoch>:<dur>;") de uma linha,
// para comparar o comando em si. Não altera o arquivo; só normaliza p/ o Set.
function stripExtendedHeader(line) {
  if (line.startsWith(": ")) {
    const sep = line.indexOf(";");
    if (sep !== -1) return line.slice(sep + 1);
  }
  return line;
}

// Monta o conjunto de comandos já presentes no histórico. Comandos de abertura
// de projeto são de uma linha só, então comparar linha a linha (normalizada)
// é suficiente e barato.
const existing = new Set();
{
  const raw = fs.readFileSync(histFile, "utf8");
  const lines = raw.split("\n");
  for (const line of lines) {
    if (line === "") continue;
    existing.add(stripExtendedHeader(line));
  }
}

let added = 0;
let skipped = 0;
let buffer = "";
for (const name of projects) {
  for (const cmd of [`kiro ~/_dev/${name}/`, `code ~/_dev/${name}/`]) {
    if (existing.has(cmd)) {
      skipped++;
      continue;
    }
    buffer += cmd + "\n";
    existing.add(cmd); // evita duplicar dentro desta mesma execução
    added++;
  }
}

if (added === 0) {
  console.log(
    `Nada a adicionar: todos os ${skipped} comandos de projeto já estão no histórico.`
  );
  process.exit(0);
}

try {
  fs.appendFileSync(histFile, buffer);
} catch (err) {
  console.error(`Erro: falha ao atualizar o histórico: ${err.message}`);
  process.exit(1);
}

console.log(`Comandos adicionados: ${added} (já existentes, ignorados: ${skipped})`);
console.log("Para refletir nesta sessão, rode: reload");

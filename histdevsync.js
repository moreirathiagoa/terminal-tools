#!/usr/bin/env node

// Sincroniza comandos de abertura de projetos (_dev) no histórico do zsh.
// Para cada projeto em <base_dir> (default ~/_dev, ignorando o auxiliar "_"),
// anexa "kiro ~/_dev/<nome>/" e "code ~/_dev/<nome>/" ao histórico.
//
// Uso: histdevsync.js [base_dir]
// Histórico lido de $HISTFILE (ou ~/.zsh_history).
//
// Obs: a função original rodava `reload` (exec zsh) ao final. Um script externo
// não pode substituir o shell pai, então aqui apenas instruímos a rodar `reload`.

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

let added = 0;
let buffer = "";
for (const name of projects) {
  for (const cmd of [`kiro ~/_dev/${name}/`, `code ~/_dev/${name}/`]) {
    buffer += cmd + "\n";
    added++;
  }
}

try {
  fs.appendFileSync(histFile, buffer);
} catch (err) {
  console.error(`Erro: falha ao atualizar o histórico: ${err.message}`);
  process.exit(1);
}

console.log(`Comandos adicionados: ${added}`);
console.log("Para remover duplicatas e refletir nesta sessão, rode: reload");

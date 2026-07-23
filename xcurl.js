#!/usr/bin/env node

// curl simplificado que loga a resposta JSON formatada com JSON.stringify(obj, null, 2).
//
// Uso:
//   xcurl <url>
//   xcurl -X POST -H "Authorization: Bearer x" -d '{"a":1}' <url>
//
// Flags suportadas: -X <metodo>, -H "Chave: valor" (repetível), -d <body>.
// Por padrão envia Accept/Content-Type: application/json.

const args = process.argv.slice(2);

if (args.length === 0) {
  console.error("uso: xcurl [-X metodo] [-H 'k: v'] [-d body] <url>");
  process.exit(1);
}

let method = "GET";
let body;
const headers = {
  Accept: "application/json",
  "Content-Type": "application/json",
};
let url;

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "-X") {
    method = args[++i];
  } else if (a === "-H") {
    const h = args[++i] || "";
    const sep = h.indexOf(":");
    if (sep !== -1) {
      headers[h.slice(0, sep).trim()] = h.slice(sep + 1).trim();
    }
  } else if (a === "-d") {
    body = args[++i];
  } else {
    url = a;
  }
}

if (!url) {
  console.error("erro: url não informada.");
  process.exit(1);
}

// Coloriza JSON já identado usando cores ANSI.
function colorizeJson(str) {
  const c = {
    key: "\x1b[37m", // cinza claro
    string: "\x1b[92m", // verde claro
    number: "\x1b[93m", // amarelo claro
    bool: "\x1b[95m", // magenta claro
    null: "\x1b[90m", // cinza
    reset: "\x1b[0m",
  };
  // Casa strings (com chave seguida de ':'), números, booleanos e null.
  return str.replace(
    /("(\\.|[^"\\])*"(\s*:)?|\b(true|false)\b|\bnull\b|-?\d+(\.\d+)?([eE][+-]?\d+)?)/g,
    (match) => {
      let color;
      if (/^"/.test(match)) {
        color = /:\s*$/.test(match) ? c.key : c.string;
      } else if (/true|false/.test(match)) {
        color = c.bool;
      } else if (/null/.test(match)) {
        color = c.null;
      } else {
        color = c.number;
      }
      return color + match + c.reset;
    }
  );
}

(async () => {
  try {
    const res = await fetch(url, { method, headers, body });
    console.error(`→ HTTP ${res.status} ${res.statusText}`);

    const text = await res.text();

    try {
      const data = JSON.parse(text);
      const pretty = JSON.stringify(data, null, 2);
      // Coloriza só quando a saída é o terminal (pipe/arquivo fica limpo).
      console.log(process.stdout.isTTY ? colorizeJson(pretty) : pretty);
    } catch {
      // Não é JSON: imprime o corpo cru.
      console.log(text);
    }
  } catch (err) {
    console.error(`falha na requisição: ${err.message}`);
    process.exit(1);
  }
})();

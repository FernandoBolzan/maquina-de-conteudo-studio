// Confere os feeds do electron-updater (latest*.yml) contra os arquivos que serão publicados.
// Uso: node scripts/verify-release-assets.mjs <pasta-com-os-assets> <tag vX.Y.Z>
// Um feed que aponta para um nome, tamanho ou hash que não existe na release quebra a atualização de todos os
// instaladores já distribuídos, então a publicação só prossegue se tudo bater.
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const [directory, tag] = process.argv.slice(2);
if (!directory || !/^v\d+\.\d+\.\d+$/.test(tag ?? '')) {
  console.error('Uso: node scripts/verify-release-assets.mjs <pasta> <vX.Y.Z>');
  process.exit(2);
}

async function sha512(path) {
  const hash = createHash('sha512');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('base64');
}

function parseFeed(text) {
  const feed = { version: undefined, path: undefined, files: [] };
  for (const line of text.split(/\r?\n/)) {
    let match;
    if ((match = /^version:\s*(.+?)\s*$/.exec(line))) feed.version = match[1];
    else if ((match = /^path:\s*(.+?)\s*$/.exec(line))) feed.path = match[1];
    else if ((match = /^\s+-\s+url:\s*(.+?)\s*$/.exec(line))) feed.files.push({ url: match[1] });
    else if ((match = /^\s+sha512:\s*(.+?)\s*$/.exec(line)) && feed.files.length) feed.files.at(-1).sha512 = match[1];
    else if ((match = /^\s+size:\s*(\d+)\s*$/.exec(line)) && feed.files.length) feed.files.at(-1).size = Number(match[1]);
  }
  return feed;
}

const feeds = readdirSync(directory).filter(name => /^latest(?:-[a-z]+)?\.yml$/.test(name));
const errors = [];
for (const required of ['latest.yml', 'latest-mac.yml', 'latest-linux.yml']) {
  if (!feeds.includes(required)) errors.push(`${required}: feed ausente (instaladores desse sistema não receberiam atualização).`);
}
for (const name of feeds) {
  const feed = parseFeed(readFileSync(join(directory, name), 'utf8'));
  if (feed.version !== tag.slice(1)) errors.push(`${name}: versão ${feed.version} difere da tag ${tag}.`);
  if (!feed.files.length) errors.push(`${name}: nenhum arquivo listado.`);
  if (feed.path && !feed.files.some(file => file.url === feed.path)) errors.push(`${name}: path ${feed.path} não está em files.`);
  for (const file of feed.files) {
    const path = join(directory, file.url);
    if (!existsSync(path)) { errors.push(`${name}: ${file.url} não existe entre os assets.`); continue; }
    if (file.size !== statSync(path).size) errors.push(`${name}: tamanho de ${file.url} difere (${file.size} no feed, ${statSync(path).size} no arquivo).`);
    if (file.sha512 !== await sha512(path)) errors.push(`${name}: sha512 de ${file.url} difere do arquivo.`);
    if (!file.url.includes(tag.slice(1))) errors.push(`${name}: ${file.url} não contém a versão ${tag.slice(1)}.`);
  }
}
if (errors.length) {
  for (const error of errors) console.error(`::error::${error}`);
  process.exit(1);
}
console.log(`Feeds conferidos: ${feeds.join(', ')} (${tag}).`);

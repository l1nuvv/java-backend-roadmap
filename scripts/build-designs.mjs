import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'previews/distinct');
await fs.mkdir(output, { recursive: true });
await build({
  absWorkingDir: root,
  entryPoints: ['designs/src/entry.js'],
  bundle: true, minify: true, format: 'esm', target: 'es2022',
  outfile: path.join(output, 'app.js'), charset: 'utf8', legalComments: 'none',
});
await fs.copyFile(path.join(root, 'src/styles.css'), path.join(output, 'base.css'));
await build({
  absWorkingDir: root,
  entryPoints: ['designs/src/designs.css'],
  bundle: true, outfile: path.join(output, 'designs.css'),
  charset: 'utf8', legalComments: 'none',
});
const source = await fs.readFile(path.join(root, 'src/index.html'), 'utf8');
for (const [id, name] of [['atlas','Карта зависимостей'],['session','Рабочая сессия'],['ledger','Реестр программы']]) {
  const html = source
    .replace('<html data-design="session"', `<html data-design="${id}"`)
    .replaceAll('__CSS__', 'base.css').replaceAll('__JS__', 'app.js')
    .replace('</head>', '<link rel="stylesheet" href="designs.css"></head>')
    .replace(/connect-src[^;]+;/, "connect-src 'none';")
    .replace('<title>', `<title>${name} / `);
  await fs.writeFile(path.join(output, id+'.html'), html);
  await fs.copyFile(path.join(root, 'designs/screenshots', id+'.png'), path.join(output, id+'.png'));
}
await fs.copyFile(path.join(root, 'designs/comparison.html'), path.join(root, 'previews/index.html'));
console.log('Built previews/: atlas, session, ledger');

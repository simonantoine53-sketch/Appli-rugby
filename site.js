/* Prépare la version publiée dans _site/ (lancé par .github/workflows/pages.yml, après build.js) :
   - tous les scripts de index.html regroupés en un seul fichier js/app.js, minifié (moins de fichiers à télécharger) ;
   - la feuille de style et les scripts chargés à la demande minifiés ;
   - la liste du service worker (SHELL) refaite pour ces fichiers.
   Le code du dépôt reste lisible : seule la copie publiée est compressée. Besoin de esbuild (npm install --no-save esbuild). */
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');
const root = __dirname, out = path.join(root, '_site');
const SKIP = new Set(['.git', '.github', '.claude', 'node_modules', '_site', 'tests', 'supabase', 'docs']);

fs.rmSync(out, { recursive: true, force: true });
(function copy(dir, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const f of fs.readdirSync(dir)) {
    if (SKIP.has(f) || f === '.DS_Store') continue;
    const s = path.join(dir, f), d = path.join(to, f);
    if (fs.statSync(s).isDirectory()) copy(s, d); else fs.copyFileSync(s, d);
  }
})(root, out);

const minJs = code => esbuild.transformSync(code, { loader: 'js', minify: true, target: 'es2019', legalComments: 'none' }).code;
let html = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
const stamp = (html.match(/\?v=(\d+)/) || [])[1] || 'dev';

// 1. Un seul fichier pour tous les scripts de la page, dans le même ordre
// (vendor/supabase.min.js reste à part : il charge ses morceaux à côté de lui, dans vendor/)
const tags = [...html.matchAll(/<script src="(js\/[^"?]+)\?v=[^"]*"><\/script>\n?/g)];
const bundle = tags.map(m => `/* ${m[1]} */\n` + minJs(fs.readFileSync(path.join(root, m[1]), 'utf8'))).join('\n;\n');
fs.writeFileSync(path.join(out, 'js/app.js'), bundle);
tags.forEach((m, i) => { html = html.replace(m[0], i === tags.length - 1 ? `<script src="js/app.js?v=${stamp}"></script>\n` : ''); });
fs.writeFileSync(path.join(out, 'index.html'), html);

// 2. Style et scripts chargés à la demande (vendor/ est déjà minifié)
const css = esbuild.transformSync(fs.readFileSync(path.join(root, 'css/style.css'), 'utf8'), { loader: 'css', minify: true }).code;
fs.writeFileSync(path.join(out, 'css/style.css'), css);
for (const f of fs.readdirSync(path.join(root, 'js'))) fs.writeFileSync(path.join(out, 'js', f), minJs(fs.readFileSync(path.join(root, 'js', f), 'utf8')));

// 3. Service worker : la liste des fichiers à garder hors ligne suit le regroupement
const shell = ['./', 'index.html', 'manifest.json', 'icons/icon-192.png', 'icons/icon-180.png', 'icons/icon-512.png', `css/style.css?v=${stamp}`, `js/app.js?v=${stamp}`]
  .concat([...html.matchAll(/src="(vendor\/[^"]+)"/g)].map(m => m[1]))
  .concat(fs.readdirSync(path.join(root, 'vendor')).filter(f => f.endsWith('.js') && !html.includes('"vendor/' + f)).map(f => 'vendor/' + f));
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8').replace(/const SHELL = \[[^\]]*\];/, `const SHELL = ${JSON.stringify(shell)};`);
fs.writeFileSync(path.join(out, 'sw.js'), minJs(sw));

const kb = f => Math.round(fs.statSync(path.join(out, f)).size / 1024);
console.log(`_site prêt : ${tags.length} scripts regroupés dans js/app.js (${kb('js/app.js')} Ko), css/style.css ${kb('css/style.css')} Ko`);

/* Génère dist/appli-rugby.html : une seule page avec CSS et JS intégrés, utilisable hors ligne. */
const fs = require('fs');
const path = require('path');
const root = __dirname;
// Numéro de version anti-cache (horodatage) injecté dans index.html à chaque build
const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);
let src = fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace(/\?v=[^"]*"/g, '?v=' + stamp + '"');
fs.writeFileSync(path.join(root, 'index.html'), src);
fs.writeFileSync(path.join(root, 'version.json'), JSON.stringify({ v: stamp }) + '\n');   // lu par js/update.js
// Service worker : même version, et liste des fichiers de l'appli à garder pour le hors ligne
const shell = ['./', 'index.html', 'manifest.json', 'icons/icon-192.png', 'icons/icon-180.png', 'icons/icon-512.png']
  .concat([...src.matchAll(/(?:src|href)="((?:js|css|vendor)\/[^"]+)"/g)].map(m => m[1]))
  .concat(fs.readdirSync(path.join(root, 'vendor')).filter(f => f.endsWith('.js')).map(f => 'vendor/' + f).filter(f => !src.includes('"' + f)));
let sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8')
  .replace(/const VERSION = '[^']*';/, `const VERSION = '${stamp}';`)
  .replace(/const SHELL = \[[^\]]*\];/, `const SHELL = ${JSON.stringify([...new Set(shell)])};`);
fs.writeFileSync(path.join(root, 'sw.js'), sw);
let html = src.replace(/\?v=[^"]*"/g, '"');
html = html.replace(/<link rel="stylesheet" href="([^"?]+)[^"]*">/g, (m, href) =>
  '<style>\n' + fs.readFileSync(path.join(root, href), 'utf8') + '\n</style>');
html = html.replace(/<script src="([^"?]+)[^"]*"><\/script>/g, (m, src) =>
  /^https?:/.test(src) ? m : '<script>\n' + fs.readFileSync(path.join(root, src), 'utf8').replace(/<\/script/g, '<\\/script') + '\n</script>');
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist', 'appli-rugby.html'), html);
console.log('dist/appli-rugby.html généré (' + Math.round(html.length / 1024) + ' Ko)');

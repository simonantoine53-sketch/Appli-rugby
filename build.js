/* Génère dist/appli-rugby.html : une seule page avec CSS et JS intégrés, utilisable hors ligne. */
const fs = require('fs');
const path = require('path');
const root = __dirname;
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, (m, href) =>
  '<style>\n' + fs.readFileSync(path.join(root, href), 'utf8') + '\n</style>');
html = html.replace(/<script src="([^"]+)"><\/script>/g, (m, src) =>
  /^https?:/.test(src) ? m : '<script>\n' + fs.readFileSync(path.join(root, src), 'utf8').replace(/<\/script/g, '<\\/script') + '\n</script>');
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist', 'appli-rugby.html'), html);
console.log('dist/appli-rugby.html généré (' + Math.round(html.length / 1024) + ' Ko)');

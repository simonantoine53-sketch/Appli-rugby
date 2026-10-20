/* Assemble toutes les migrations (supabase/migrations/*.sql, dans l'ordre) en un seul fichier
   supabase/test/schema_complet.sql, à coller une fois dans l'éditeur SQL d'une base de test vide.
   Usage : node supabase/test/build-schema.js */
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', 'migrations');
const files = fs.readdirSync(dir).filter(f => /^\d{4}_.*\.sql$/.test(f)).sort();
const parts = files.map(f => `-- =================================================================\n-- ${f}\n-- =================================================================\n` + fs.readFileSync(path.join(dir, f), 'utf8').trim() + '\n');
const head = `-- Schéma complet de Rugbeo : toutes les migrations ${files[0].slice(0, 4)} à ${files[files.length - 1].slice(0, 4)}, dans l'ordre.
-- Fichier généré par supabase/test/build-schema.js : ne pas modifier à la main.
-- À coller dans l'éditeur SQL d'une base de TEST vide (jamais sur la production, qui reçoit les migrations une par une).

`;
fs.writeFileSync(path.join(__dirname, 'schema_complet.sql'), head + parts.join('\n'));
console.log(`schema_complet.sql : ${files.length} migrations (${files[0]} → ${files[files.length - 1]})`);

/* Palette d'outils : définition des groupes, des outils et de leurs icônes (SVG 32x32). */
(function (global) {
  'use strict';

  const S = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
  const D = 'stroke-dasharray="3 3"';
  const ARROW = '<path d="M20 8l6 0 0 6" ' + S + '/>';

  const COLORS = {
    orange: '#f57c00', yellow: '#fbc02d', green: '#43a047', red: '#e53935',
    blue: '#1e88e5', purple: '#8e24aa', black: '#212121', grey: '#9e9e9e', white: '#ffffff'
  };

  const shapeTools = [
    { id: 'circle',   key: '1', label: 'Cercle',             kind: 'shape', shape: 'circle', icon: `<circle cx="16" cy="16" r="11" ${S}/>` },
    { id: 'circle-d', key: '2', label: 'Cercle pointillé',   kind: 'shape', shape: 'circle', dashed: true, icon: `<circle cx="16" cy="16" r="11" ${S} ${D}/>` },
    { id: 'rect',     key: '3', label: 'Rectangle',          kind: 'shape', shape: 'rect',   icon: `<rect x="5" y="5" width="22" height="22" ${S}/>` },
    { id: 'rect-d',   key: '4', label: 'Rectangle pointillé',kind: 'shape', shape: 'rect',   dashed: true, icon: `<rect x="5" y="5" width="22" height="22" ${S} ${D}/>` },
    { id: 'tri',      key: '5', label: 'Triangle',           kind: 'shape', shape: 'tri',    icon: `<path d="M16 5l12 22H4z" ${S}/>` },
    { id: 'tri-d',    key: '6', label: 'Triangle pointillé', kind: 'shape', shape: 'tri',    dashed: true, icon: `<path d="M16 5l12 22H4z" ${S} ${D}/>` },
    { id: 'poly',     key: '7', label: 'Quadrilatère',       kind: 'shape', shape: 'poly',   icon: `<path d="M10 5h18l-8 22H4z" ${S}/>` },
    { id: 'poly-d',   key: '8', label: 'Quadrilatère pointillé', kind: 'shape', shape: 'poly', dashed: true, icon: `<path d="M10 5h18l-8 22H4z" ${S} ${D}/>` },
    { id: 'line',     key: '9', label: 'Ligne',              kind: 'line', style: 'straight', icon: `<path d="M5 27L27 5" ${S}/>` },
    { id: 'line-d',   key: '0', label: 'Ligne pointillée',   kind: 'line', style: 'straight', dashed: true, icon: `<path d="M5 27L27 5" ${S} ${D}/>` },
    { id: 'arrow',    key: 'A', label: 'Flèche (passe / déplacement)', kind: 'line', style: 'straight', arrow: true, icon: `<path d="M5 27L26 6" ${S}/>${ARROW}` },
    { id: 'arrow-d',  key: 'E', label: 'Flèche pointillée (passe)', kind: 'line', style: 'straight', arrow: true, dashed: true, icon: `<path d="M5 27L26 6" ${S} ${D}/>${ARROW}` },
        { id: 'wavy',     key: 'S', label: 'Course avec ballon', kind: 'line', style: 'wavy', arrow: true, icon: `<g transform="rotate(-45 16 16)"><path d="M4 16c2-6 4-6 6 0s4 6 6 0 4-6 6 0" ${S}/><path d="M22 12l4 4-4 4" ${S}/></g>` },
        { id: 'zigzag',   key: 'D', label: 'Course en appuis',   kind: 'line', style: 'zigzag', arrow: true, icon: `<g transform="rotate(-45 16 16)"><path d="M4 16l3-5 4 10 4-10 4 10 3-5" ${S} ${D}/><path d="M22 12l4 4-4 4" ${S}/></g>` },
    { id: 'free',     key: 'F', label: 'Tracé libre',        kind: 'free', icon: `<path d="M5 24c4-10 8-12 10-8s-2 10 2 10 6-14 10-18" ${S}/><path d="M22 26l6-6" ${S}/>` },
    { id: 'text',     key: 'T', label: 'Texte',              kind: 'text', icon: `<path d="M6 8h20M16 8v18M12 26h8" ${S} stroke-width="2.5"/>` }
  ];

  const equipTools = [
    { id: 'ball',     label: 'Ballon',          kind: 'equip', equip: 'ball',     icon: `<ellipse cx="16" cy="16" rx="12" ry="7" ${S}/><path d="M11 16h10M13 14v4M16 13.5v5M19 14v4" ${S} stroke-width="1.5"/>` },
    { id: 'balls',    label: 'Ballons',         kind: 'equip', equip: 'balls',    icon: `<ellipse cx="11" cy="20" rx="7" ry="4" ${S}/><ellipse cx="21" cy="20" rx="7" ry="4" ${S}/><ellipse cx="16" cy="12" rx="7" ry="4" ${S}/>` },
    { id: 'bag',      label: 'Sac de plaquage', kind: 'equip', equip: 'bag',      icon: `<rect x="10" y="4" width="12" height="24" rx="6" ${S}/><path d="M13 10h6" ${S}/>` },
    { id: 'plot',     label: 'Plot',            kind: 'equip', equip: 'plot',     icon: `<ellipse cx="16" cy="20" rx="11" ry="5" fill="#f57c00"/><ellipse cx="16" cy="14" rx="5" ry="2.5" fill="#f57c00" stroke="#fff"/><path d="M11 14v6M21 14v6" stroke="#f57c00" stroke-width="2"/>` },
    { id: 'pole',     label: 'Piquet',          kind: 'equip', equip: 'pole',     icon: `<path d="M16 4v22" stroke="#f57c00" stroke-width="3" stroke-linecap="round"/><ellipse cx="16" cy="26" rx="8" ry="3" fill="#f57c00"/>` },
    { id: 'cone',     label: 'Cône',            kind: 'equip', equip: 'cone',     icon: `<path d="M16 5l8 20H8z" fill="#f57c00"/><rect x="5" y="24" width="22" height="3" rx="1.5" fill="#f57c00"/>` },
    { id: 'disc',     label: 'Coupelle',        kind: 'equip', equip: 'disc',     icon: `<path d="M8 20l6-8h4l6 8z" fill="#f57c00"/><ellipse cx="16" cy="20" rx="10" ry="3" fill="#f57c00"/>` },
    { id: 'ring',     label: 'Cerceau',         kind: 'equip', equip: 'ring',     icon: `<circle cx="16" cy="16" r="10" fill="none" stroke="#f57c00" stroke-width="4"/>` },
    { id: 'sled',     label: 'Joug',            kind: 'equip', equip: 'sled',     icon: `<rect x="3" y="12" width="26" height="8" rx="2" fill="#e53935"/><circle cx="8" cy="23" r="2.5" fill="#333"/><circle cx="24" cy="23" r="2.5" fill="#333"/><path d="M8 12V8M24 12V8" stroke="#e53935" stroke-width="2"/>` },
    { id: 'shield',   label: 'Bouclier',        kind: 'equip', equip: 'shield',   icon: `<rect x="6" y="4" width="20" height="24" rx="3" fill="#e53935"/><path d="M10 6v20M14 6v20M18 6v20M22 6v20" stroke="#fff" stroke-width="1.5"/>` },
    { id: 'ladder',   label: 'Échelle',         kind: 'equip', equip: 'ladder',   icon: `<rect x="3" y="11" width="26" height="10" ${S} stroke-width="1.5"/><path d="M8 11v10M13 11v10M18 11v10M23 11v10" stroke="currentColor" stroke-width="1.5"/>` }
  ];

  const playerColors = ['orange', 'yellow', 'green', 'red', 'blue', 'purple', 'black', 'grey'];
  const SHIRT = 'M8 3l3 0c0 2 6 2 6 0l3 0 7 4-2.5 4-2.5-1.5v19H9v-19L6.5 11 4 7z';
  const playerTools = playerColors.map(c => ({
    id: 'player-' + c, label: 'Joueur ' + c, kind: 'player', color: c, jersey: false,
    icon: `<circle cx="16" cy="16" r="11" fill="${COLORS[c]}"/>`
  })).concat(playerColors.map(c => ({
    id: 'jersey-' + c, label: 'Maillot ' + c, kind: 'player', color: c, jersey: true,
    icon: `<path d="${SHIRT}" transform="translate(1 1) scale(0.95)" fill="${COLORS[c]}" stroke="${c === 'white' ? '#999' : 'none'}"/>`
  })));

  const TOOL_GROUPS = [
    { id: 'shapes', title: 'Formes', tools: shapeTools },
    { id: 'equip', title: 'Équipement', tools: equipTools },
    { id: 'players', title: 'Joueurs', tools: playerTools }
  ];

  const TOOLS = {};
  TOOL_GROUPS.forEach(g => g.tools.forEach(t => { TOOLS[t.id] = t; }));

  global.RugbyPalette = { TOOL_GROUPS, TOOLS, COLORS, SHIRT };
})(window);

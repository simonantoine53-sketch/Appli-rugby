/* Éditeur d'exercices rugby : état, interactions, étapes, aperçu, export, sauvegarde. */
(function () {
  'use strict';

  const { svgEl, fieldSpec, renderField, frameRect, lerpFrame, SVG_NS, M, PAD } = window.RugbyField;
  const { renderObject, bounds, move, lerpObject, polyPoints, EQUIP_SIZE } = window.RugbyObjects;
  const { TOOL_GROUPS, TOOLS, COLORS } = window.RugbyPalette;

  const $ = s => document.querySelector(s);
  const uid = () => Math.random().toString(36).slice(2, 10);
  const clone = o => JSON.parse(JSON.stringify(o));
  const track = (name, props) => { if (window.RugbyTrack) window.RugbyTrack.track(name, props); };
  const TOOL_GROUP = {}; TOOL_GROUPS.forEach(g => g.tools.forEach(t => { TOOL_GROUP[t.id] = g.id; }));
  const LIB_KEY = 'rugby-drawings-v1';
  const CUR_KEY = 'rugby-drawing-current-v1';

  /* ---------- État ---------- */
  function newDrawing() {
    return { id: (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : uid(), title: 'Nouveau dessin', category: '', tags: '', settings: { field: 'full', orientation: 'landscape', stepDuration: 1200, snap: false }, steps: [{ id: uid(), objects: [] }], updatedAt: Date.now() };
  }
  const state = { drawing: newDrawing(), step: 0, tool: null, selected: null, multi: [], lastPlayerColor: 'blue', zoom: 1, history: [], future: [], multiMode: false, axisMode: false };
  /** Identifiants sélectionnés (sélection multiple avec Maj, sinon l'objet courant). */
  const selIds = () => { const ids = state.multi.filter(id => findObj(id)); if (ids.length) return ids; return state.selected && findObj(state.selected) ? [state.selected] : []; };
  const selObjs = () => selIds().map(findObj);
  function clearSelection() { state.selected = null; state.multi = []; }

  const svg = $('#canvas');
  const wrap = $('#canvas-wrap');
  const fieldG = svgEl('g');
  const objectsG = svgEl('g', { class: 'objects' });
  const overlayG = svgEl('g', { class: 'overlay' });
  svg.append(fieldG, objectsG, overlayG);

  const curStep = () => state.drawing.steps[state.step];
  const curObjects = () => curStep().objects;
  const findObj = id => curObjects().find(o => o.id === id);

  /* ---------- Historique ---------- */
  const snapshot = () => JSON.stringify(state.drawing);
  function commit(before) {
    const after = snapshot();
    if (before !== after) { state.history.push(before); if (state.history.length > 100) state.history.shift(); state.future = []; }
    afterChange();
  }
  function undo() { if (!state.history.length) return; state.future.push(snapshot()); state.drawing = JSON.parse(state.history.pop()); fixStepIndex(); afterChange(true); }
  function redo() { if (!state.future.length) return; state.history.push(snapshot()); state.drawing = JSON.parse(state.future.pop()); fixStepIndex(); afterChange(true); }
  function fixStepIndex() { state.step = Math.min(state.step, state.drawing.steps.length - 1); if (state.selected && !findObj(state.selected)) state.selected = null; state.multi = state.multi.filter(id => findObj(id)); }

  let saveTimer = null;
  function afterChange(full) {
    state.drawing.updatedAt = Date.now();
    if (full) { renderField_(); applySettingsToUI(); }
    render();
    renderSteps();
    $('#fab-undo').disabled = !state.history.length;
    $('#fab-redo').disabled = !state.future.length;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { try { localStorage.setItem(CUR_KEY, snapshot()); } catch (e) { /* stockage indisponible */ } }, 300);
  }

  /* ---------- Rendu ---------- */
  function renderField_() {
    const spec = fieldSpec(state.drawing.settings);
    svg.setAttribute('viewBox', `0 0 ${spec.W} ${spec.H}`);
    fieldG.replaceChildren(renderField(spec));
    fitZoom();
  }

  function render() {
    objectsG.replaceChildren(...curObjects().map(renderObject));
    renderOverlay();
    renderProps();
    // Sélection multiple et déplacement aligné : proposés seulement quand ils servent
    $('.fab-left').classList.toggle('with-modes', !!selIds().length || state.multiMode || state.axisMode);
  }

  function renderOverlay() {
    overlayG.replaceChildren();
    renderFrameOverlay();
    if (state.framing) return;
    const objs = selObjs();
    objs.forEach(o => { const b = bounds(o); overlayG.appendChild(svgEl('rect', { class: 'selection-box', x: b.x - 4, y: b.y - 4, width: b.w + 8, height: b.h + 8 })); });
    if (objs.length !== 1) return;
    const obj = objs[0];
    const handle = (x, y, name, cls) => svgEl('circle', { class: 'handle ' + (cls || ''), cx: x, cy: y, r: 5, 'data-handle': name });
    if (obj.type === 'shape' && obj.shape === 'poly') {
      polyPoints(obj).forEach((p, i) => overlayG.appendChild(handle(p[0], p[1], 'v' + i, 'vertex')));
    } else if (obj.type === 'shape') {
      overlayG.append(handle(obj.x, obj.y, 'nw'), handle(obj.x + obj.w, obj.y, 'ne'), handle(obj.x, obj.y + obj.h, 'sw'), handle(obj.x + obj.w, obj.y + obj.h, 'se'));
    } else if (obj.type === 'line') {
      overlayG.append(handle(obj.x1, obj.y1, 'p1', 'endpoint'), handle(obj.x2, obj.y2, 'p2', 'endpoint'));
      const curved = typeof obj.cx === 'number';
      const mx = curved ? (obj.x1 + 2 * obj.cx + obj.x2) / 4 : (obj.x1 + obj.x2) / 2, my = curved ? (obj.y1 + 2 * obj.cy + obj.y2) / 4 : (obj.y1 + obj.y2) / 2;
      const c = handle(mx, my, 'c', 'curve'); c.setAttribute('r', 6); if (!curved) c.setAttribute('fill-opacity', '.5'); overlayG.appendChild(c);
    }
  }

  /* ---------- Cadrage par étape ---------- */
  // Chaque étape peut mémoriser un cadre (zoom + centre). L'aperçu et les exports animent le passage d'un cadre à l'autre.
  function renderFrameOverlay() {
    const st = curStep();
    if (!st.frame && !state.framing) return;
    const spec = fieldSpec(state.drawing.settings), f = frameRect(state.drawing.settings, st.frame);
    const g = svgEl('g', { class: 'frame-layer' + (state.framing ? ' editing' : '') });
    g.appendChild(svgEl('path', { class: 'frame-mask', d: `M0 0H${spec.W}V${spec.H}H0Z M${f.x} ${f.y}v${f.h}h${f.w}v${-f.h}Z`, 'fill-rule': 'evenodd' }));
    g.appendChild(svgEl('rect', { class: 'frame-box', x: f.x, y: f.y, width: f.w, height: f.h, 'data-frame': 'move' }));
    if (state.framing) {
      const r = Math.max(9, spec.W / 110);
      [['nw', f.x, f.y], ['ne', f.x + f.w, f.y], ['sw', f.x, f.y + f.h], ['se', f.x + f.w, f.y + f.h]].forEach(([n, x, y]) => g.appendChild(svgEl('circle', { class: 'frame-handle', cx: x, cy: y, r, 'data-frame': n })));
    } else {
      g.appendChild(svgEl('text', { class: 'frame-label', x: f.x + 8, y: f.y + 22 }, [`Cadrage de l’étape ${state.step + 1}`]));
    }
    overlayG.appendChild(g);
  }
  function startFraming() {
    const st = curStep();
    state.framing = { before: snapshot() };
    if (!st.frame) {
      // Cadre de départ : 45 % du terrain, centré sur l'objet sélectionné ou sur le terrain
      const spec = fieldSpec(state.drawing.settings), w = spec.W * 0.45, h = w * spec.H / spec.W;
      const o = state.selected && findObj(state.selected), b = o && bounds(o);
      const cx = b ? b.x + b.w / 2 : spec.W / 2, cy = b ? b.y + b.h / 2 : spec.H / 2;
      st.frame = frameRect(state.drawing.settings, { x: cx - w / 2, y: cy - h / 2, w });
    }
    clearSelection(); setTool(null);
    $('#frame-bar').classList.remove('hidden');
    $('#frame-bar-title').textContent = `Cadrage de l’étape ${state.step + 1}`;
    closeDrawer(); render();
  }
  function endFraming(keep) {
    if (!state.framing) return;
    const before = state.framing.before; state.framing = null;
    $('#frame-bar').classList.add('hidden');
    if (keep) { const st = curStep(); if (st.frame) { const f = frameRect(state.drawing.settings, st.frame); st.frame = f.full ? undefined : { x: Math.round(f.x), y: Math.round(f.y), w: Math.round(f.w) }; } commit(before); track('frame', { step: state.step + 1 }); }
    else { state.drawing = JSON.parse(before); fixStepIndex(); afterChange(); }
  }
  function zoomFrame(k) {
    const st = curStep(), f = frameRect(state.drawing.settings, st.frame), cx = f.x + f.w / 2, cy = f.y + f.h / 2;
    const w = frameRect(state.drawing.settings, { x: 0, y: 0, w: f.w * k }).w, h = w * f.h / f.w;
    st.frame = frameRect(state.drawing.settings, { x: cx - w / 2, y: cy - h / 2, w }); render();
  }
  $('#frame-ok').onclick = () => endFraming(true);
  $('#frame-cancel').onclick = () => endFraming(false);
  $('#frame-in').onclick = () => zoomFrame(1 / 1.25);
  $('#frame-out').onclick = () => zoomFrame(1.25);
  $('#frame-full').onclick = () => { curStep().frame = undefined; endFraming(true); toast('Cette étape montre tout le terrain.'); };

  /* ---------- Zoom ---------- */
  let baseWidth = 800;
  function fitZoom() {
    const spec = fieldSpec(state.drawing.settings);
    const availW = wrap.clientWidth - 48, availH = wrap.clientHeight - 48;
    baseWidth = Math.max(200, Math.min(availW, availH * spec.W / spec.H));
    applyZoom();
  }
  function applyZoom() {
    svg.style.width = Math.round(baseWidth * state.zoom) + 'px';
    $('#zoom-val').textContent = Math.round(state.zoom * 100) + '%';
  }
  /** Change le zoom en gardant fixe le point du terrain situé sous (cx, cy) (coordonnées écran). */
  function zoomAt(newZoom, cx, cy) {
    newZoom = Math.max(0.5, Math.min(4, newZoom));
    const r0 = svg.getBoundingClientRect();
    const px = cx - r0.left, py = cy - r0.top, k = newZoom / state.zoom;
    state.zoom = newZoom; applyZoom();
    const r1 = svg.getBoundingClientRect();
    wrap.scrollLeft += r1.left - (cx - px * k);
    wrap.scrollTop += r1.top - (cy - py * k);
  }
  function zoomCenter(delta) { const r = wrap.getBoundingClientRect(); zoomAt(state.zoom + delta, r.left + r.width / 2, r.top + r.height / 2); }
  document.querySelectorAll('[data-zoom]').forEach(b => b.onclick = () => {
    if (b.dataset.zoom === 'fit') { state.zoom = 1; fitZoom(); } else zoomCenter(b.dataset.zoom === 'in' ? 0.25 : -0.25);
  });
  wrap.addEventListener('wheel', e => { if (!e.ctrlKey && !e.metaKey) return; e.preventDefault(); zoomAt(state.zoom * (e.deltaY < 0 ? 1.1 : 0.9), e.clientX, e.clientY); }, { passive: false });
  window.addEventListener('resize', fitZoom);

  // Pincement à deux doigts : zoom + déplacement
  const pointers = new Map();
  let pinch = null;
  function cancelDrag() {
    if (!drag) return;
    const d = drag; drag = null;
    if (d.mode === 'create') { removeObj(d.obj.id); state.selected = null; }
    else if (d.orig) Object.assign(d.obj, clone(d.orig));
    render();
  }
  function pinchInfo() {
    const [a, b] = [...pointers.values()];
    return { d: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }
  svg.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'touch') return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) { cancelDrag(); const i = pinchInfo(); pinch = { d0: i.d, zoom0: state.zoom, x: i.x, y: i.y }; }
  }, true);
  svg.addEventListener('pointermove', e => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pointers.size === 2) {
      const i = pinchInfo();
      zoomAt(pinch.zoom0 * i.d / pinch.d0, i.x, i.y);
      wrap.scrollLeft -= i.x - pinch.x; wrap.scrollTop -= i.y - pinch.y;
      pinch.x = i.x; pinch.y = i.y;
    }
  }, true);
  const endTouch = e => { pointers.delete(e.pointerId); if (pointers.size < 2) pinch = null; };
  svg.addEventListener('pointerup', endTouch, true);
  svg.addEventListener('pointercancel', endTouch, true);

  /* ---------- Palette ---------- */
  function buildPalette() {
    const root = $('#palette');
    TOOL_GROUPS.forEach((g, gi) => {
      const grid = svgEl ? document.createElement('div') : null; grid.className = 'tools';
      g.tools.forEach(t => {
        const b = document.createElement('button');
        b.className = 'tool' + (t.kind === 'formation' ? ' labeled' : ''); b.dataset.tool = t.id; b.title = t.label + (t.key ? ` (raccourci ${t.key})` : '');
        b.setAttribute('aria-label', t.label);
        b.innerHTML = `<svg viewBox="0 0 32 32">${t.icon}</svg>` + (t.kind === 'formation' ? `<span class="cap">${t.label.split(' (')[0]}</span>` : '') + (t.key ? `<span class="key">${t.key}</span>` : '');
        b.onclick = () => t.kind === 'formation' ? openFormation(t) : setTool(state.tool === t.id ? null : t.id);
        grid.appendChild(b);
      });
      const head = document.createElement('div'); head.className = 'group-head';
      head.innerHTML = `<h3>${g.title}</h3>` + (g.id === 'formations' ? `<span class="mini-wrap"><button class="mini" id="btn-list-formations" title="Placer une formation que vous avez enregistrée">Mes formations</button><button class="mini" id="btn-save-formation" title="Enregistrer les joueurs du terrain comme formation réutilisable">+ Créer une formation</button></span>` : '');
      const sec = document.createElement('section'); sec.className = 'group'; sec.append(head, grid);
      root.appendChild(sec);
    });
    $('#btn-save-formation').onclick = saveCurrentFormation;
    $('#btn-list-formations').onclick = openSavedFormations;
    $('#fab-undo').onclick = undo; $('#fab-redo').onclick = redo;
    $('#fab-multi').onclick = () => { state.multiMode = !state.multiMode; $('#fab-multi').classList.toggle('on', state.multiMode); if (state.multiMode) setTool(null); toast(state.multiMode ? 'Sélection multiple : touchez les objets à ajouter.' : 'Sélection multiple désactivée.'); };
    $('#fab-axis').onclick = () => { state.axisMode = !state.axisMode; $('#fab-axis').classList.toggle('on', state.axisMode); toast(state.axisMode ? 'Déplacement aligné : horizontal ou vertical seulement.' : 'Déplacement libre.'); };
    $('#fab-select').onclick = () => { setTool(null); $('#hint').textContent = 'Mode sélection : touchez un objet pour le déplacer, double-touchez un texte ou un joueur pour le modifier.'; };
  }

  /* ---------- Formations (15 contre 15) ---------- */
  const formation = { tool: null, opts: { attack: 'blue', defense: 'red' } };
  function openFormation(t) {
    closeDrawer();
    formation.tool = t;
    $('#formation-title').textContent = t.formation === 'lineout' ? 'Touche : 15 contre 15' : 'Mêlée : 15 contre 15';
    $('#formation-size-group').classList.toggle('hidden', t.formation !== 'lineout');
    ['attack', 'defense'].forEach(side => {
      const box = $('#formation-' + side); box.replaceChildren();
      Object.keys(COLORS).filter(c => c !== 'white').forEach(c => {
        const sw = document.createElement('span'); sw.className = 'swatch' + (formation.opts[side] === c ? ' on' : ''); sw.style.background = COLORS[c]; sw.title = c;
        sw.onclick = () => { formation.opts[side] = c; if (formation.opts.attack === formation.opts.defense) formation.opts[side === 'attack' ? 'defense' : 'attack'] = c === 'red' ? 'blue' : 'red'; openFormation(t); };
        box.appendChild(sw);
      });
    });
    openModal('modal-formation');
  }
  $('#formation-form').onsubmit = e => {
    e.preventDefault();
    closeModal('modal-formation');
    formation.opts = { attack: formation.opts.attack, defense: formation.opts.defense };
    formation.opts.type = formation.tool.formation;
    formation.opts.dir = +document.querySelector('input[name=formation-dir]:checked').value;
    formation.opts.size = +document.querySelector('input[name=formation-size]:checked').value;
    formation.opts.numbers = $('#formation-numbers').checked;
    formation.opts.ball = $('#formation-ball').checked;
    setTool('formation');
  };
  /* ---------- Formations enregistrées ---------- */
  const FORM_KEY = 'rugby-formations-v1';
  const readForms = () => { try { return JSON.parse(localStorage.getItem(FORM_KEY) || '[]'); } catch (e) { return []; } };
  const writeForms = list => { try { localStorage.setItem(FORM_KEY, JSON.stringify(list)); } catch (e) { toast('Stockage local indisponible.'); } };
  const acc = () => (window.RugbyAccount && window.RugbyAccount.isActive()) ? window.RugbyAccount : null;

  async function saveCurrentFormation() {
    closeDrawer();
    const objs = curObjects();
    if (!objs.length) { toast('Le terrain est vide : placez d’abord des joueurs.'); return; }
    if (acc() && !acc().canUse('save')) return;
    const name = prompt('Nom de la formation (ex. « Touche à 5 attaque », « Mêlée 8 avants ») :', state.drawing.title !== 'Nouveau dessin' ? state.drawing.title : '');
    if (!name) return;
    const data = window.RugbyFormations.capture(state.drawing.settings, objs);
    if (!data) { toast('Rien à enregistrer.'); return; }
    if (acc()) { await acc().saveFormation(name.trim(), data); }
    else { const list = readForms(); list.unshift({ id: uid(), name: name.trim(), data, createdAt: Date.now() }); writeForms(list); toast(`Formation « ${name.trim()} » enregistrée sur cet appareil.`); }
  }

  async function openSavedFormations() {
    closeDrawer();
    const root = $('#saved-formations-list'); root.replaceChildren();
    openModal('modal-saved-formations');
    let list, scope;
    if (acc()) { const r = await acc().listFormations(); list = r.list; scope = r.scope; } else { list = readForms(); scope = 'Sur cet appareil'; }
    $('#saved-formations-scope').textContent = scope || '';
    if (!list.length) { const p = document.createElement('p'); p.className = 'muted'; p.textContent = 'Aucune formation enregistrée. Placez des joueurs sur le terrain puis cliquez « Enregistrer » dans le groupe Formations.'; root.appendChild(p); return; }
    list.forEach(f => {
      const row = document.createElement('div'); row.className = 'saved-row';
      const n = (f.data && f.data.objects || []).length;
      row.innerHTML = `<div class="who"></div>`;
      row.querySelector('.who').innerHTML = `<strong></strong><small>${n} objet${n > 1 ? 's' : ''}${f.team_name ? ' · ' + f.team_name : ''}${f.owner_name ? ' · ' + f.owner_name : ''}</small>`;
      row.querySelector('strong').textContent = f.name;
      const place = document.createElement('button'); place.className = 'btn primary small'; place.textContent = 'Placer';
      place.onclick = () => { closeModal('modal-saved-formations'); formation.opts = { type: 'custom', data: f.data, name: f.name }; setTool('formation'); };
      row.appendChild(place);
      if (f.canDelete !== false) {
        const del = document.createElement('button'); del.className = 'btn outline small danger'; del.textContent = 'Supprimer';
        del.onclick = async () => { if (!confirm(`Supprimer « ${f.name} » ?`)) return; if (acc()) await acc().deleteFormation(f.id); else writeForms(readForms().filter(x => x.id !== f.id)); openSavedFormations(); };
        row.appendChild(del);
      }
      root.appendChild(row);
    });
  }

  function placeFormation(p) {
    const before = snapshot();
    const objs = formation.opts.type === 'custom'
      ? window.RugbyFormations.buildCustom(state.drawing.settings, formation.opts.data, [p.x, p.y])
      : window.RugbyFormations.build(state.drawing.settings, formation.opts, [p.x, p.y]);
    curObjects().push(...objs);
    state.selected = null;
    commit(before);
    setTool(null);
    track('formation', { type: formation.opts.type });
    toast((formation.opts.type === 'custom' ? `Formation « ${formation.opts.name} »` : formation.opts.type === 'lineout' ? 'Touche' : 'Mêlée') + ` placée : ${objs.length} objet${objs.length > 1 ? 's' : ''}. Déplacez-les si besoin.`);
  }

  function setTool(id) {
    if (id && state.framing) endFraming(true);
    if (id && id !== state.tool && id !== 'formation') track('tool', { tool: id, group: TOOL_GROUP[id] || '?' });
    state.tool = id;
    if (id) closeDrawer();
    if (id && TOOLS[id] && TOOLS[id].kind === 'player' && TOOLS[id].color) state.lastPlayerColor = TOOLS[id].color;
    if (id) { state.selected = null; renderOverlay(); renderProps(); }
    document.querySelectorAll('.tool').forEach(b => b.classList.toggle('active', b.dataset.tool === id));
    svg.classList.toggle('tool-active', !!id);
    $('#hint').classList.toggle('tool-on', !!id);
    const t = id === 'formation' ? { label: 'Formation', kind: 'formation' } : id && TOOLS[id];
    const fab = $('#fab-select');
    fab.classList.toggle('tool-on', !!t); fab.classList.toggle('selecting', !t);
    $('#fab-select').title = t ? 'Revenir à la sélection (quitter l’outil ' + t.label.toLowerCase() + ')' : 'Mode sélection : touchez un élément pour le déplacer ou le modifier';
    const touch = window.matchMedia('(pointer: coarse)').matches, name = t ? t.label.split(' (')[0] : '';
    $('#hint').textContent = !t ? 'Mode sélection : cliquez un objet pour le déplacer, double-cliquez un texte ou un joueur pour le modifier.'
      : t.kind === 'formation' ? 'Touchez le terrain là où placer la formation.'
      : t.kind === 'shape' || t.kind === 'line' || t.kind === 'free' ? (touch ? `${name} : glissez le doigt sur le terrain` : `${t.label} : cliquez-glissez sur le terrain pour dessiner. Échap pour revenir à la sélection.`)
      : touch ? `${name} : touchez le terrain pour placer` : `${t.label} : cliquez sur le terrain pour placer. Échap pour revenir à la sélection.`;
  }

  /* ---------- Création d'objets ---------- */
  function makeObject(t, p) {
    const base = { id: uid(), type: t.kind };
    switch (t.kind) {
      case 'shape': return Object.assign(base, { shape: t.shape, x: p.x, y: p.y, w: 0, h: 0, dashed: !!t.dashed, color: 'white', width: 3, fill: false });
      case 'line': return Object.assign(base, { style: t.style, x1: p.x, y1: p.y, x2: p.x, y2: p.y, dashed: !!t.dashed, arrow: !!t.arrow, color: 'white', width: 3 });
      case 'free': return Object.assign(base, { points: [[p.x, p.y]], color: 'white', width: 3, dashed: false });
      case 'text': return Object.assign(base, { x: p.x, y: p.y, text: 'Texte', size: 18, color: 'white' });
      case 'equip': return Object.assign(base, { kind: t.equip, x: p.x, y: p.y, rot: 0, scale: 1 });
      case 'player': return Object.assign(base, { color: t.color || state.lastPlayerColor, jersey: !!t.jersey, ball: !!t.ball, x: p.x, y: p.y, label: '', scale: 1 });
    }
  }

  /* ---------- Grille magnétique (option) ---------- */
  function snapPoint(p) {
    if (!state.drawing.settings.snap) return p;
    const spec = fieldSpec(state.drawing.settings);
    const L = spec.lengthM, W = spec.widthM;
    const along = [0, 10, 15, 32, 50, 60].concat(L === 120 ? [70, 88, 105, 110, 120] : []);
    const across = [0, 5, 15, 35, W - 15, W - 5, W];
    const grid = 2.5;
    const snap1 = (v, lines) => { // v en mètres
      let best = null, bd = 1.2;
      lines.forEach(l => { const d = Math.abs(v - l); if (d < bd) { bd = d; best = l; } });
      if (best !== null) return best;
      const g = Math.round(v / grid) * grid; return Math.abs(v - g) < 0.6 ? g : v;
    };
    const toM = v => (v - PAD) / M, toPx = v => PAD + v * M;
    if (spec.landscape) return { x: toPx(snap1(toM(p.x), along)), y: toPx(snap1(toM(p.y), across)) };
    // portrait : x correspond à la largeur inversée, y à la longueur
    const lx = p.y, ly = spec.Hl - p.x;
    const sx = toPx(snap1(toM(lx), along)), sy = toPx(snap1(toM(ly), across));
    return { x: spec.Hl - sy, y: sx };
  }

  /* ---------- Interactions souris ---------- */
  function toSvg(evt) {
    const pt = svg.createSVGPoint(); pt.x = evt.clientX; pt.y = evt.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  }
  let drag = null;

  svg.addEventListener('pointerdown', e => {
    if (e.button !== 0 || pinch || pointers.size > 1) return;
    closeDrawer();
    const p = toSvg(e);
    const before = snapshot();
    if (state.framing) {
      const h = e.target.closest('[data-frame]');
      if (h) { drag = { mode: 'frame', name: h.dataset.frame, orig: frameRect(state.drawing.settings, curStep().frame), start: p }; svg.setPointerCapture(e.pointerId); }
      return;
    }
    if (state.tool === 'formation') { placeFormation(p); return; }
    const t = state.tool && TOOLS[state.tool];
    if (t) {
      const obj = makeObject(t, (t.kind === 'player' || t.kind === 'equip') ? snapPoint(p) : p);
      if (t.kind === 'text') {
        const txt = prompt('Texte à afficher :', 'Texte');
        if (!txt) return;
        obj.text = txt; curObjects().push(obj); state.selected = obj.id; commit(before); return;
      }
      curObjects().push(obj);
      state.selected = obj.id;
      if (t.kind === 'player' || t.kind === 'equip') { commit(before); return; }
      drag = { mode: 'create', obj, start: p, before, kind: t.kind };
      svg.setPointerCapture(e.pointerId);
      render();
      return;
    }
    // Mode sélection
    const h = e.target.closest('[data-handle]');
    if (h && state.selected) {
      const obj = findObj(state.selected);
      drag = { mode: 'handle', name: h.dataset.handle, obj, orig: clone(obj), start: p, before };
      svg.setPointerCapture(e.pointerId);
      return;
    }
    const g = e.target.closest('[data-id]');
    if (g) {
      const id = g.dataset.id;
      if (e.shiftKey || state.multiMode) {
        // Maj + clic (ou mode sélection multiple sur mobile) : ajoute ou retire l'objet de la sélection
        let ids = selIds();
        ids = ids.includes(id) ? ids.filter(x => x !== id) : ids.concat(id);
        state.multi = ids.length > 1 ? ids : []; state.selected = ids.length ? ids[ids.length - 1] : null;
        render(); return;
      }
      if (!selIds().includes(id)) { state.selected = id; state.multi = []; }
      const group = selObjs().map(o => ({ obj: o, orig: clone(o) }));
      const obj = findObj(id);
      drag = { mode: 'move', obj, orig: clone(obj), group, start: p, before };
      svg.setPointerCapture(e.pointerId);
      render();
      return;
    }
    clearSelection(); render();
  });

  svg.addEventListener('pointermove', e => {
    if (!drag || pinch) return;
    const p = toSvg(e);
    let dx = p.x - drag.start.x, dy = p.y - drag.start.y;
    // Maj : déplacement contraint sur un seul axe (horizontal ou vertical)
    const constrain = e.shiftKey || state.axisMode;
    if (constrain && drag.mode === 'move') { if (Math.abs(dx) >= Math.abs(dy)) dy = 0; else dx = 0; }
    // Maj (ou mode aligné) : lignes et flèches contraintes à 0°, 45° ou 90°
    const snapTo = (x0, y0) => {
      if (!constrain) return p;
      const vx = p.x - x0, vy = p.y - y0, len = Math.hypot(vx, vy);
      if (len < 1) return p;
      const a = Math.round(Math.atan2(vy, vx) / (Math.PI / 4)) * (Math.PI / 4);
      return { x: x0 + Math.cos(a) * len, y: y0 + Math.sin(a) * len };
    };
    const o = drag.obj;
    if (drag.mode === 'frame') {
      const r = drag.orig, st = curStep();
      if (drag.name === 'move') st.frame = frameRect(state.drawing.settings, { x: r.x + dx, y: r.y + dy, w: r.w });
      else {
        // Redimensionnement aux proportions du terrain, le coin opposé reste fixe
        const ax = drag.name.includes('w') ? r.x + r.w : r.x, ay = drag.name.includes('n') ? r.y + r.h : r.y;
        const w = Math.max(Math.abs(p.x - ax), Math.abs(p.y - ay) * r.w / r.h);
        const f = frameRect(state.drawing.settings, { x: 0, y: 0, w });
        st.frame = frameRect(state.drawing.settings, { x: drag.name.includes('w') ? ax - f.w : ax, y: drag.name.includes('n') ? ay - f.h : ay, w: f.w });
      }
      renderOverlay(); return;
    }
    if (drag.mode === 'create') {
      if (drag.kind === 'shape') { o.x = Math.min(drag.start.x, p.x); o.y = Math.min(drag.start.y, p.y); o.w = Math.abs(dx); o.h = Math.abs(dy); if (e.shiftKey) { o.w = o.h = Math.max(o.w, o.h); } }
      else if (drag.kind === 'line') { const q = snapTo(o.x1, o.y1); o.x2 = q.x; o.y2 = q.y; }
      else if (drag.kind === 'free') { const last = o.points[o.points.length - 1]; if (Math.hypot(p.x - last[0], p.y - last[1]) > 3) o.points.push([p.x, p.y]); }
    } else if (drag.mode === 'move') {
      const group = drag.group || [{ obj: o, orig: drag.orig }];
      let sdx = dx, sdy = dy;
      if (state.drawing.settings.snap && group.length === 1 && typeof o.x === 'number' && (o.type === 'player' || o.type === 'equip')) {
        const sp = snapPoint({ x: drag.orig.x + dx, y: drag.orig.y + dy }); sdx = sp.x - drag.orig.x; sdy = sp.y - drag.orig.y;
      }
      group.forEach(g => { Object.assign(g.obj, clone(g.orig)); move(g.obj, sdx, sdy); });
    } else if (drag.mode === 'handle') {
      const r = drag.orig; Object.assign(o, clone(r));
      const n = drag.name;
      if (n === 'c') { // point de passage : la courbe passe par le point tiré
        o.cx = 2 * p.x - (r.x1 + r.x2) / 2; o.cy = 2 * p.y - (r.y1 + r.y2) / 2;
      }
      else if (n === 'p1') { const q = snapTo(r.x2, r.y2); o.x1 = q.x; o.y1 = q.y; }
      else if (n === 'p2') { const q = snapTo(r.x1, r.y1); o.x2 = q.x; o.y2 = q.y; }
      else if (n[0] === 'v') { o.points = polyPoints(r).map(q => q.slice()); o.points[+n.slice(1)] = [p.x, p.y]; }
      else {
        let x1 = r.x, y1 = r.y, x2 = r.x + r.w, y2 = r.y + r.h;
        if (n.includes('w')) x1 = p.x; if (n.includes('e')) x2 = p.x; if (n.includes('n')) y1 = p.y; if (n.includes('s')) y2 = p.y;
        o.x = Math.min(x1, x2); o.y = Math.min(y1, y2); o.w = Math.max(8, Math.abs(x2 - x1)); o.h = Math.max(8, Math.abs(y2 - y1));
      }
    }
    render();
  });

  function endDrag() {
    if (!drag) return;
    const d = drag; drag = null;
    if (d.mode === 'frame') return;   // validé avec le bouton « Valider le cadrage »
    if (d.mode === 'create') {
      const o = d.obj;
      if (d.kind === 'shape' && (o.w < 6 || o.h < 6)) { o.w = o.h = 60; o.x = d.start.x - 30; o.y = d.start.y - 30; }
      if (d.kind === 'shape' && o.shape === 'poly') { o.points = polyPoints(o); }
      if (d.kind === 'line' && Math.hypot(o.x2 - o.x1, o.y2 - o.y1) < 6) { o.x2 = o.x1 + 80; o.y2 = o.y1; }
      if (d.kind === 'free' && o.points.length < 2) { removeObj(o.id); state.selected = null; }
    }
    commit(d.before);
  }
  svg.addEventListener('pointerup', endDrag);
  svg.addEventListener('pointercancel', endDrag);

  svg.addEventListener('dblclick', e => {
    const g = e.target.closest('[data-id]'); if (!g) return;
    const obj = findObj(g.dataset.id); if (!obj) return;
    const before = snapshot();
    if (obj.type === 'text') { const t = prompt('Texte :', obj.text); if (t !== null) { obj.text = t; commit(before); } }
    else if (obj.type === 'player') { const t = prompt('Numéro ou lettre du joueur :', obj.label || ''); if (t !== null) { obj.label = t.slice(0, 3); commit(before); } }
  });

  function removeObj(id) { const arr = curObjects(); const i = arr.findIndex(o => o.id === id); if (i >= 0) arr.splice(i, 1); }

  /* ---------- Clavier ---------- */
  document.addEventListener('keydown', e => {
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || e.target.isContentEditable) return;
    if (state.framing && (e.key === 'Escape' || e.key === 'Enter')) { endFraming(e.key === 'Enter'); return; }
    if (!$('#modal-preview').classList.contains('hidden')) {
      if (e.key === 'Escape') { if ($('#modal-preview').classList.contains('presenting')) setPresenting(false); else closeModal('modal-preview'); }
      else if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') { e.preventDefault(); previewNext(); }
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); previewPrev(); }
      else if (e.key.toLowerCase() === 'f') setPresenting(!$('#modal-preview').classList.contains('presenting'));
      else if (e.key.toLowerCase() === 'p') setPlaying(!preview.playing);
      return;
    }
    if (!$('#view-share').classList.contains('hidden')) {
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); previewNext(); } else if (e.key === 'ArrowLeft') { e.preventDefault(); previewPrev(); }
      return;
    }
    const k = e.key;
    if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
    if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === 'd') { e.preventDefault(); duplicateSelected(); return; }
    if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === 'a') { e.preventDefault(); const ids = curObjects().map(o => o.id); state.multi = ids.length > 1 ? ids : []; state.selected = ids[ids.length - 1] || null; render(); return; }
    if (k === 'Escape') { setTool(null); clearSelection(); render(); return; }
    if (k.toLowerCase() === 'v') { setTool(null); return; }
    if (k === 'Delete' || k === 'Backspace') { if (selIds().length) { const b = snapshot(); deleteSelected(); commit(b); } return; }
    if (k.startsWith('Arrow') && selIds().length) {
      e.preventDefault();
      const d = e.shiftKey ? 10 : 2, b = snapshot();
      selObjs().forEach(obj => move(obj, k === 'ArrowLeft' ? -d : k === 'ArrowRight' ? d : 0, k === 'ArrowUp' ? -d : k === 'ArrowDown' ? d : 0));
      commit(b); return;
    }
    const tool = Object.values(TOOLS).find(t => t.key && t.key.toLowerCase() === k.toLowerCase());
    if (tool && !e.ctrlKey && !e.metaKey) setTool(tool.id);
  });

  function duplicateSelected() {
    const objs = selObjs(); if (!objs.length) return;
    const b = snapshot();
    const copies = objs.map(o => { const c = clone(o); c.id = uid(); move(c, 20, 20); curObjects().push(c); return c.id; });
    state.multi = copies.length > 1 ? copies : []; state.selected = copies[copies.length - 1];
    commit(b);
  }
  function deleteSelected() { selIds().forEach(removeObj); clearSelection(); }

  /** Alignement et répartition des objets sélectionnés. */
  function alignSelection(kind) {
    const objs = selObjs(); if (objs.length < 2) return;
    const boxes = objs.map(o => ({ o, b: bounds(o) }));
    const minX = Math.min(...boxes.map(x => x.b.x)), maxX = Math.max(...boxes.map(x => x.b.x + x.b.w));
    const minY = Math.min(...boxes.map(x => x.b.y)), maxY = Math.max(...boxes.map(x => x.b.y + x.b.h));
    const midX = (minX + maxX) / 2, midY = (minY + maxY) / 2;
    if (kind === 'left') boxes.forEach(x => move(x.o, minX - x.b.x, 0));
    else if (kind === 'right') boxes.forEach(x => move(x.o, maxX - (x.b.x + x.b.w), 0));
    else if (kind === 'hcenter') boxes.forEach(x => move(x.o, midX - (x.b.x + x.b.w / 2), 0));
    else if (kind === 'top') boxes.forEach(x => move(x.o, 0, minY - x.b.y));
    else if (kind === 'bottom') boxes.forEach(x => move(x.o, 0, maxY - (x.b.y + x.b.h)));
    else if (kind === 'vcenter') boxes.forEach(x => move(x.o, 0, midY - (x.b.y + x.b.h / 2)));
    else if (kind === 'hdist' || kind === 'vdist') {
      const horiz = kind === 'hdist';
      const sorted = boxes.slice().sort((a, b) => horiz ? (a.b.x + a.b.w / 2) - (b.b.x + b.b.w / 2) : (a.b.y + a.b.h / 2) - (b.b.y + b.b.h / 2));
      const first = sorted[0], last = sorted[sorted.length - 1];
      const c0 = horiz ? first.b.x + first.b.w / 2 : first.b.y + first.b.h / 2;
      const c1 = horiz ? last.b.x + last.b.w / 2 : last.b.y + last.b.h / 2;
      sorted.forEach((x, i) => { const target = c0 + (c1 - c0) * i / (sorted.length - 1); const cur = horiz ? x.b.x + x.b.w / 2 : x.b.y + x.b.h / 2; move(x.o, horiz ? target - cur : 0, horiz ? 0 : target - cur); });
    }
  }

  /* ---------- Barre de propriétés ---------- */
  function renderProps() {
    const box = $('#props');
    const sel = selObjs();
    const obj = sel.length === 1 ? sel[0] : null;
    if (!sel.length) { box.classList.add('hidden'); return; }
    box.classList.remove('hidden');
    box.replaceChildren();
    const add = el => box.appendChild(el);
    const sep = () => { const s = document.createElement('span'); s.className = 'sep'; add(s); };
    const btn = (label, title, on, fn, cls) => { const b = document.createElement('button'); b.className = 'pbtn' + (on ? ' on' : '') + (cls ? ' ' + cls : ''); b.innerHTML = label; b.title = title; b.onclick = () => { const s = snapshot(); fn(); commit(s); }; add(b); return b; };
    if (!obj) {
      const lbl = document.createElement('span'); lbl.className = 'pcount'; lbl.textContent = `${sel.length} objets`; add(lbl); sep();
      const ico = (d) => `<svg viewBox="0 0 20 20" width="18" height="18">${d}</svg>`;
      btn(ico('<path d="M3 2v16" stroke="currentColor" stroke-width="2"/><rect x="5" y="4" width="10" height="4" fill="currentColor"/><rect x="5" y="12" width="6" height="4" fill="currentColor"/>'), 'Aligner à gauche', false, () => alignSelection('left'));
      btn(ico('<path d="M10 2v16" stroke="currentColor" stroke-width="2"/><rect x="4" y="4" width="12" height="4" fill="currentColor"/><rect x="6" y="12" width="8" height="4" fill="currentColor"/>'), 'Centrer horizontalement', false, () => alignSelection('hcenter'));
      btn(ico('<path d="M17 2v16" stroke="currentColor" stroke-width="2"/><rect x="5" y="4" width="10" height="4" fill="currentColor"/><rect x="9" y="12" width="6" height="4" fill="currentColor"/>'), 'Aligner à droite', false, () => alignSelection('right'));
      btn(ico('<path d="M2 3h16" stroke="currentColor" stroke-width="2"/><rect x="4" y="5" width="4" height="10" fill="currentColor"/><rect x="12" y="5" width="4" height="6" fill="currentColor"/>'), 'Aligner en haut', false, () => alignSelection('top'));
      btn(ico('<path d="M2 10h16" stroke="currentColor" stroke-width="2"/><rect x="4" y="4" width="4" height="12" fill="currentColor"/><rect x="12" y="6" width="4" height="8" fill="currentColor"/>'), 'Centrer verticalement', false, () => alignSelection('vcenter'));
      btn(ico('<path d="M2 17h16" stroke="currentColor" stroke-width="2"/><rect x="4" y="5" width="4" height="10" fill="currentColor"/><rect x="12" y="9" width="4" height="6" fill="currentColor"/>'), 'Aligner en bas', false, () => alignSelection('bottom'));
      sep();
      btn('⇔ Répartir', 'Espacer régulièrement à l’horizontale', false, () => alignSelection('hdist'));
      btn('⇕ Répartir', 'Espacer régulièrement à la verticale', false, () => alignSelection('vdist'));
      sep();
      btn('Dupliquer', 'Dupliquer la sélection (Ctrl+D)', false, () => { const copies = sel.map(o => { const c = clone(o); c.id = uid(); move(c, 20, 20); curObjects().push(c); return c.id; }); state.multi = copies; state.selected = copies[copies.length - 1]; });
      btn('Supprimer', 'Supprimer la sélection (Suppr)', false, () => deleteSelected(), 'danger');
      return;
    }

    const hasColor = obj.type !== 'equip';
    if (hasColor) {
      Object.keys(COLORS).forEach(c => {
        const s = document.createElement('span'); s.className = 'swatch' + (obj.color === c ? ' on' : ''); s.style.background = COLORS[c]; s.title = c;
        s.onclick = () => { const b = snapshot(); obj.color = c; commit(b); };
        add(s);
      });
      sep();
    }
    if (obj.type === 'shape' || obj.type === 'line' || obj.type === 'free') {
      btn('Pointillé', 'Trait pointillé', obj.dashed, () => { obj.dashed = !obj.dashed; });
      btn('Épais', 'Épaisseur du trait', obj.width >= 5, () => { obj.width = obj.width >= 5 ? 3 : 5; });
    }
    if (obj.type === 'shape') btn('Rempli', 'Remplir la forme', obj.fill, () => { obj.fill = !obj.fill; });
    if (obj.type === 'line') {
      btn('Flèche', 'Pointe de flèche', obj.arrow, () => { obj.arrow = !obj.arrow; });
      if (typeof obj.cx === 'number') btn('Redresser', 'Supprimer la courbure', false, () => { delete obj.cx; delete obj.cy; });
      const sel = document.createElement('select'); sel.className = 'pbtn';
      [['straight', 'Droite'], ['wavy', 'Ondulée'], ['zigzag', 'Zigzag']].forEach(([v, l]) => { const o = document.createElement('option'); o.value = v; o.textContent = l; o.selected = obj.style === v; sel.appendChild(o); });
      sel.onchange = () => { const b = snapshot(); obj.style = sel.value; commit(b); };
      add(sel);
    }
    if (obj.type === 'player') {
      const inp = document.createElement('input'); inp.type = 'text'; inp.placeholder = 'N°'; inp.maxLength = 3; inp.value = obj.label || '';
      inp.oninput = () => { obj.label = inp.value; render_objectsOnly(); };
      inp.onchange = () => { const b = snapshot(); commit(b); };
      inp.onfocus = () => { inp.dataset.before = snapshot(); };
      inp.onblur = () => { if (inp.dataset.before) { commit(inp.dataset.before); } };
      add(inp);
      const nameInp = document.createElement('input'); nameInp.type = 'text'; nameInp.placeholder = 'Nom'; nameInp.maxLength = 18; nameInp.value = obj.name || ''; nameInp.style.width = '110px'; nameInp.setAttribute('list', 'player-names');
      nameInp.oninput = () => { obj.name = nameInp.value; render_objectsOnly(); };
      nameInp.onfocus = () => { nameInp.dataset.before = snapshot(); if (window.RugbyAccount && window.RugbyAccount.memberNames) window.RugbyAccount.memberNames().then(names => { const dl = $('#player-names'); dl.replaceChildren(); names.forEach(n => { const o = document.createElement('option'); o.value = n; dl.appendChild(o); }); }); };
      nameInp.onblur = () => { if (nameInp.dataset.before) commit(nameInp.dataset.before); };
      add(nameInp);
      btn('Maillot', 'Afficher en maillot', obj.jersey, () => { obj.jersey = !obj.jersey; });
      btn('🏉 Ballon', 'Ce joueur porte le ballon', obj.ball, () => { obj.ball = !obj.ball; });
    }
    if (obj.type === 'text') {
      btn('Modifier', 'Modifier le texte', false, () => { const t = prompt('Texte :', obj.text); if (t !== null) obj.text = t; });
      btn('A−', 'Réduire', false, () => { obj.size = Math.max(10, (obj.size || 18) - 2); });
      btn('A+', 'Agrandir', false, () => { obj.size = Math.min(60, (obj.size || 18) + 2); });
    }
    if (obj.type === 'equip' || obj.type === 'player') {
      btn('−', 'Réduire', false, () => { obj.scale = Math.max(0.5, +((obj.scale || 1) - 0.1).toFixed(2)); });
      btn('+', 'Agrandir', false, () => { obj.scale = Math.min(3, +((obj.scale || 1) + 0.1).toFixed(2)); });
    }
    if (obj.type === 'equip') {
      btn('↺', 'Pivoter de −45°', false, () => { obj.rot = ((obj.rot || 0) - 45) % 360; });
      btn('↻', 'Pivoter de +45°', false, () => { obj.rot = ((obj.rot || 0) + 45) % 360; });
    }
    sep();
    btn('Dupliquer', 'Dupliquer (Ctrl+D)', false, () => { const c = clone(obj); c.id = uid(); move(c, 20, 20); curObjects().push(c); state.selected = c.id; });
    btn('Devant', 'Mettre au premier plan', false, () => { const a = curObjects(); const i = a.indexOf(obj); a.splice(i, 1); a.push(obj); });
    btn('Derrière', 'Mettre à l’arrière-plan', false, () => { const a = curObjects(); const i = a.indexOf(obj); a.splice(i, 1); a.unshift(obj); });
    btn('Supprimer', 'Supprimer (Suppr)', false, () => { removeObj(obj.id); clearSelection(); }, 'danger');
  }
  function render_objectsOnly() { objectsG.replaceChildren(...curObjects().map(renderObject)); renderOverlay(); }

  /* ---------- Étapes ---------- */
  function sceneSvg(settings, objects, note, frame) {
    const spec = fieldSpec(settings);
    const f = frameRect(settings, frame), k = f.w / spec.W;
    const s = svgEl('svg', { xmlns: SVG_NS, viewBox: `${f.x} ${f.y} ${f.w} ${f.h}` });
    s.appendChild(renderField(spec));
    s.appendChild(svgEl('g', {}, objects.map(renderObject)));
    if (note) {
      // La note garde la même taille à l'écran, quel que soit le cadrage
      const lines = String(note).split('\n').slice(0, 3);
      const w = Math.min(spec.W - 24, Math.max(...lines.map(l => l.length)) * 9.5 + 28), h = 14 + lines.length * 20;
      const g = svgEl('g', { transform: `translate(${f.x + 12 * k} ${f.y + 10 * k}) scale(${k})` });
      g.appendChild(svgEl('rect', { width: w, height: h, rx: 8, fill: 'rgba(15,23,42,.78)' }));
      lines.forEach((l, i) => g.appendChild(svgEl('text', { x: 14, y: 24 + i * 20, 'font-size': 16, 'font-weight': 700, fill: '#fff', 'font-family': 'Arial, Helvetica, sans-serif' }, [l])));
      s.appendChild(g);
    }
    return s;
  }

  function renderSteps() {
    const root = $('#steps');
    root.replaceChildren();
    state.drawing.steps.forEach((st, i) => {
      const card = document.createElement('div');
      card.className = 'step-card' + (i === state.step ? ' active' : '');
      card.innerHTML = `<span class="num">${i + 1}</span><div class="thumb"></div><div class="card-actions">
        <button class="dup" title="Dupliquer l'étape"><svg viewBox="0 0 24 24" width="15" height="15"><rect x="8" y="8" width="12" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M16 8V5a1 1 0 00-1-1H5a1 1 0 00-1 1v10a1 1 0 001 1h3" fill="none" stroke="currentColor" stroke-width="2"/></svg></button>
        <button class="del" title="Supprimer l'étape"><svg viewBox="0 0 24 24" width="15" height="15"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
      </div><div class="meta">${[st.note ? '📝 consigne' : '', st.hold ? '⏸ pause' : '', st.duration ? (st.duration / 1000).toLocaleString('fr-FR') + ' s' : '', st.frame ? '🔍 cadrée' : ''].filter(Boolean).join(' · ')}</div>`;
      card.querySelector('.thumb').appendChild(sceneSvg(state.drawing.settings, st.objects, st.note, st.frame));
      if (i === state.step) {
        const opts = document.createElement('div'); opts.className = 'step-opts';
        opts.innerHTML = `<input type="text" class="step-note" placeholder="Consigne pour les joueurs (facultatif)" title="Affichée pendant l'aperçu et dans les exports, ex. « Regarder la fixation du 10 »" maxlength="90">
          <div class="step-opts-row"><label>Durée <select class="step-dur"><option value="0">normale</option><option value="500">0,5 s</option><option value="1000">1 s</option><option value="2000">2 s</option><option value="3000">3 s</option><option value="5000">5 s</option></select></label>
          <label title="L'animation s'arrête sur cette étape jusqu'à ce qu'on appuie sur Lire"><input type="checkbox" class="step-hold"> Marquer une pause</label></div>
          <div class="step-opts-row"><button type="button" class="btn small secondary step-frame">🔍 ${st.frame ? 'Modifier le cadrage' : 'Cadrer (zoomer sur une zone)'}</button>${st.frame ? '<button type="button" class="btn small outline step-unframe">Tout le terrain</button>' : ''}</div>`;
        opts.onclick = e => e.stopPropagation(); opts.onpointerdown = e => e.stopPropagation();
        const note = opts.querySelector('.step-note'); note.value = st.note || '';
        note.onfocus = () => { note.dataset.before = snapshot(); }; note.oninput = () => { st.note = note.value; }; note.onblur = () => { if (note.dataset.before) { commit(note.dataset.before); } };
        const dur = opts.querySelector('.step-dur'); dur.value = String(st.duration || 0); dur.onchange = () => { const b = snapshot(); st.duration = +dur.value || undefined; commit(b); };
        const hold = opts.querySelector('.step-hold'); hold.checked = !!st.hold; hold.onchange = () => { const b = snapshot(); st.hold = hold.checked || undefined; commit(b); };
        opts.querySelector('.step-frame').onclick = startFraming;
        const unf = opts.querySelector('.step-unframe'); if (unf) unf.onclick = () => { const b = snapshot(); st.frame = undefined; commit(b); };
        card.appendChild(opts);
      }
      card.onclick = () => { if (state.framing) endFraming(true); state.step = i; state.selected = null; render(); renderSteps(); closeDrawer(); };
      card.querySelector('.dup').onclick = e => { e.stopPropagation(); const b = snapshot(); state.drawing.steps.splice(i + 1, 0, { id: uid(), objects: clone(st.objects), frame: st.frame ? clone(st.frame) : undefined }); state.step = i + 1; state.selected = null; commit(b); };
      card.querySelector('.del').onclick = e => {
        e.stopPropagation();
        if (state.drawing.steps.length === 1) { toast('Impossible de supprimer la seule étape.'); return; }
        if (!confirm(`Supprimer l'étape ${i + 1} ?`)) return;
        const b = snapshot(); state.drawing.steps.splice(i, 1); state.step = Math.max(0, Math.min(state.step, state.drawing.steps.length - 1)); state.selected = null; commit(b);
      };
      root.appendChild(card);
    });
  }
  $('#add-step').onclick = () => { const b = snapshot(); state.drawing.steps.push({ id: uid(), objects: clone(curObjects()), frame: curStep().frame ? clone(curStep().frame) : undefined }); state.step = state.drawing.steps.length - 1; state.selected = null; commit(b); track('step_add', { steps: state.drawing.steps.length }); };

  /* ---------- Onglets & réglages ---------- */
  function activateTab(name) {
    document.querySelectorAll('.panel .tab').forEach(x => x.classList.toggle('active', x.dataset.tab === name));
    $('#tab-steps').classList.toggle('hidden', name !== 'steps');
    $('#tab-settings').classList.toggle('hidden', name !== 'settings');
  }
  document.querySelectorAll('.panel .tab').forEach(t => t.onclick = () => activateTab(t.dataset.tab));

  /* ---------- Tiroirs mobiles ---------- */
  const isMobile = () => window.matchMedia('(max-width: 900px)').matches;
  let drawer = null;
  function openDrawer(which) {
    drawer = drawer === which ? null : which;
    $('.sidebar').classList.toggle('open', drawer === 'tools');
    $('.panel').classList.toggle('open', drawer === 'steps' || drawer === 'settings');
    if (drawer === 'steps' || drawer === 'settings') activateTab(drawer);
    document.querySelectorAll('[data-mtab]').forEach(b => b.classList.toggle('active', b.dataset.mtab === drawer));
  }
  const closeDrawer = () => { if (drawer && isMobile()) openDrawer(drawer); };
  document.addEventListener('pointerdown', e => {
    if (drawer && !e.target.closest('.sidebar, .panel, .mobile-bar, .modal')) closeDrawer();
  }, true);
  document.querySelectorAll('[data-mtab]').forEach(b => b.onclick = () => {
    const which = b.dataset.mtab;
    if (which === 'library') { closeDrawer(); go('home'); return; }
    if (which === 'account') { closeDrawer(); $('#btn-account').click(); return; }
    openDrawer(which);
  });
  window.addEventListener('resize', () => { if (!isMobile() && drawer) openDrawer(drawer); });
  document.querySelectorAll('input[name=field], input[name=orientation]').forEach(r => r.onchange = () => {
    const b = snapshot(); state.drawing.settings[r.name] = r.value; renderField_(); commit(b);
  });
  $('#step-duration').oninput = e => { state.drawing.settings.stepDuration = +e.target.value; $('#step-duration-val').textContent = (e.target.value / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' s'; };
  function applySettingsToUI() {
    const s = state.drawing.settings;
    document.querySelectorAll('input[name=field]').forEach(r => r.checked = r.value === (s.field || 'full'));
    document.querySelectorAll('input[name=orientation]').forEach(r => r.checked = r.value === (s.orientation || 'landscape'));
    $('#step-duration').value = s.stepDuration || 1200;
    $('#step-duration-val').textContent = ((s.stepDuration || 1200) / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' s';
    $('#title').value = state.drawing.title;
    $('#drawing-category').value = state.drawing.category || '';
    $('#drawing-tags').value = state.drawing.tags || '';
    $('#snap-toggle').checked = !!s.snap;
  }
  $('#title').onchange = e => { state.drawing.title = e.target.value.trim() || 'Sans titre'; e.target.value = state.drawing.title; afterChange(); };
  $('#drawing-category').onchange = e => { const b = snapshot(); state.drawing.category = e.target.value; commit(b); };
  $('#drawing-tags').onchange = e => { const b = snapshot(); state.drawing.tags = e.target.value.trim(); commit(b); };
  $('#snap-toggle').onchange = e => { state.drawing.settings.snap = e.target.checked; toast(e.target.checked ? 'Aimantation activée : les joueurs s’accrochent aux lignes et à une grille de 2,5 m.' : 'Aimantation désactivée.'); };

  /* ---------- Aperçu animé ---------- */
  const preview = { playing: false, step: 0, raf: null, drawing: null, canvas: '#preview-canvas', label: '#preview-step', playBtn: '#preview-play' };
  const pd = () => preview.drawing || state.drawing;
  function openPreview() {
    preview.drawing = null; preview.canvas = '#preview-canvas'; preview.label = '#preview-step'; preview.playBtn = '#preview-play';
    preview.step = state.step; preview.playing = false;
    openModal('modal-preview');
    track('preview', { steps: state.drawing.steps.length });
    $('#preview-title').textContent = state.drawing.title;
    showPreviewStep(preview.step);
  }
  function showPreviewStep(i, objects, frame) {
    const d = pd(); const st = d.steps[i];
    $(preview.canvas).replaceChildren(sceneSvg(d.settings, objects || st.objects, st.note, frame || st.frame));
    $(preview.label).textContent = `Étape ${i + 1} / ${d.steps.length}` + (st.hold ? ' · pause' : '');
  }
  function animateTo(next, done) {
    const d = pd();
    const a = d.steps[preview.step].objects, b = d.steps[next].objects;
    const dur = Math.max(200, (d.settings.stepDuration || 1200) * 0.7);
    const t0 = performance.now();
    const frame = now => {
      const t = Math.min(1, (now - t0) / dur), e = t < .5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      const list = [];
      a.forEach(o => { if (!b.find(x => x.id === o.id)) list.push(Object.assign(clone(o), { opacity: 1 - e })); });
      b.forEach(o => { const prev = a.find(x => x.id === o.id); list.push(prev ? lerpObject(prev, o, e, a) : Object.assign(clone(o), { opacity: e })); });
      const fa = d.steps[preview.step].frame, fb = d.steps[next].frame;
      showPreviewStep(next, list, (fa || fb) ? lerpFrame(d.settings, fa, fb, e) : null);
      if (t < 1) preview.raf = requestAnimationFrame(frame); else { preview.step = next; showPreviewStep(next); done && done(); }
    };
    cancelAnimationFrame(preview.raf);
    preview.raf = requestAnimationFrame(frame);
  }
  function playLoop() {
    if (!preview.playing) return;
    const d = pd();
    const cur = d.steps[preview.step];
    const next = (preview.step + 1) % d.steps.length;
    const hold = cur.duration || d.settings.stepDuration || 1200;
    preview.timer = setTimeout(() => {
      if (!preview.playing) return;
      animateTo(next, () => { if (d.steps[next].hold) { setPlaying(false); toast('Pause sur cette étape : appuyez sur Lire pour continuer.'); } else playLoop(); });
    }, hold * 0.6);
  }
  function setPlaying(on) {
    preview.playing = on; $(preview.playBtn).textContent = on ? '⏸ Pause' : '▶ Lire';
    clearTimeout(preview.timer); cancelAnimationFrame(preview.raf);
    if (on) { if (pd().steps.length < 2) { toast('Ajoutez au moins deux étapes pour animer.'); preview.playing = false; $(preview.playBtn).textContent = '▶ Lire'; return; } playLoop(); }
    else showPreviewStep(preview.step);
  }
  const previewNext = () => { setPlaying(false); animateTo((preview.step + 1) % pd().steps.length); };
  const previewPrev = () => { setPlaying(false); animateTo((preview.step - 1 + pd().steps.length) % pd().steps.length); };
  $('#btn-preview').onclick = openPreview;
  $('#preview-play').onclick = () => setPlaying(!preview.playing);
  $('#preview-next').onclick = previewNext;
  $('#preview-prev').onclick = previewPrev;

  /* ---------- Mode présentation (plein écran) ---------- */
  function setPresenting(on) {
    const m = $('#modal-preview');
    m.classList.toggle('presenting', on);
    $('#preview-full').textContent = on ? '⛶ Quitter' : '⛶ Plein écran';
    if (on && m.requestFullscreen && !document.fullscreenElement) m.requestFullscreen().catch(() => {});
    if (!on && document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
  }
  $('#preview-full').onclick = () => { const on = !$('#modal-preview').classList.contains('presenting'); if (on) track('present'); setPresenting(on); };
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && $('#modal-preview').classList.contains('presenting')) $('#modal-preview').classList.remove('presenting'), $('#preview-full').textContent = '⛶ Plein écran'; });
  $('#preview-canvas').addEventListener('click', () => { if ($('#modal-preview').classList.contains('presenting')) previewNext(); });

  /* ---------- Page « stratégie partagée » (lecture seule) ---------- */
  function stopPreview() { preview.playing = false; clearTimeout(preview.timer); cancelAnimationFrame(preview.raf); preview.drawing = null; preview.step = 0; }
  function openShare(token) {
    stopPreview();
    $('#share-error').classList.add('hidden'); $('#share-meta').textContent = 'Chargement…'; $('#share-canvas').replaceChildren(); $('#share-step').textContent = '';
    const acc = window.RugbyAccount;
    if (!acc) { setTimeout(() => openShare(token), 50); return; }   // account.js se charge après l'éditeur
    if (!acc.isActive() || !acc.fetchShared) { $('#share-error').classList.remove('hidden'); $('#share-meta').textContent = ''; return; }
    acc.fetchShared(token).then(row => {
      if (!row || !row.data) { $('#share-error').classList.remove('hidden'); $('#share-meta').textContent = ''; return; }
      const d = row.data; d.title = row.title; d.settings = Object.assign({ field: 'full', orientation: 'landscape', stepDuration: 1200 }, d.settings || {});
      $('#share-title').textContent = row.title;
      $('#share-meta').textContent = [row.team_name ? 'Équipe ' + row.team_name : '', row.owner_name ? 'par ' + row.owner_name : '', `${d.steps.length} étape${d.steps.length > 1 ? 's' : ''}`].filter(Boolean).join(' · ');
      preview.drawing = d; preview.canvas = '#share-canvas'; preview.label = '#share-step'; preview.playBtn = '#share-play'; preview.step = 0; preview.playing = false;
      showPreviewStep(0);
      if (d.steps.length > 1) setPlaying(true);
    });
  }
  $('#share-play').onclick = () => setPlaying(!preview.playing);
  $('#share-next').onclick = previewNext;
  $('#share-prev').onclick = previewPrev;
  $('#share-full').onclick = () => { const el = $('#view-share'); if (el.requestFullscreen) el.requestFullscreen().catch(() => {}); };
  $('#share-open-app').onclick = () => go('home');

  /* ---------- Export PNG ---------- */
  function exportPng() {
    const spec = fieldSpec(state.drawing.settings);
    const s = sceneSvg(state.drawing.settings, curObjects(), '', curStep().frame);
    s.setAttribute('width', spec.W); s.setAttribute('height', spec.H);
    const xml = new XMLSerializer().serializeToString(s);
    const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml;charset=utf-8' }));
    const img = new Image();
    img.onload = () => {
      const scale = 2, c = document.createElement('canvas');
      c.width = spec.W * scale; c.height = spec.H * scale;
      const ctx = c.getContext('2d'); ctx.scale(scale, scale); ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      c.toBlob(blob => download(blob, `${slug(state.drawing.title)}-etape-${state.step + 1}.png`), 'image/png');
      toast('Image exportée.');
    };
    img.onerror = () => toast("Échec de l'export de l'image.");
    img.src = url;
  }
  const slug = s => (s || 'dessin').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'dessin';
  function download(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }
  /* ---------- Menu d'export & exports animés ---------- */
  const exportMenu = $('#export-menu');
  $('#btn-export').onclick = e => { e.stopPropagation(); exportMenu.classList.toggle('hidden'); };
  document.addEventListener('click', () => exportMenu.classList.add('hidden'));
  exportMenu.querySelectorAll('[data-export]').forEach(b => b.onclick = () => {
    exportMenu.classList.add('hidden');
    if (window.RugbyAccount && window.RugbyAccount.isActive() && !window.RugbyAccount.canUse('export')) return;
    const kind = b.dataset.export;
    track('export', { kind, steps: state.drawing.steps.length });
    if (kind === 'png') return exportPng();
    if (kind === 'pdf') return exportPdf();
    if (state.drawing.steps.length < 2) { toast('Ajoutez au moins deux étapes pour un export animé.'); return; }
    const label = kind === 'gif' ? 'Création du GIF animé…' : 'Enregistrement de la vidéo…';
    const prog = showProgress(label);
    const fn = kind === 'gif' ? window.RugbyExport.exportGif : window.RugbyExport.exportWebm;
    state.drawing.__format = kind;
    fn(state.drawing, sceneSvg, prog.update)
      .then(blob => { const ext = kind === 'gif' ? 'gif' : (blob.ext || 'webm'); download(blob, `${slug(state.drawing.title)}.${ext}`); toast(kind === 'gif' ? 'GIF animé exporté.' : (ext === 'mp4' ? 'Vidéo exportée.' : 'Vidéo exportée au format WebM (ce navigateur ne sait pas faire de MP4).')); })
      .catch(err => toast('Export impossible : ' + (err && err.message ? err.message : err)))
      .finally(() => { delete state.drawing.__format; prog.close(); });
  });
  function showProgress(label) {
    const el = document.createElement('div'); el.className = 'progress';
    el.innerHTML = `<div class="box"><div class="lbl"></div><div class="bar"><i></i></div></div>`;
    el.querySelector('.lbl').textContent = label; document.body.appendChild(el);
    return { update: p => { el.querySelector('i').style.width = Math.round(p * 100) + '%'; }, close: () => el.remove() };
  }

  /* ---------- Fiche PDF (impression) ---------- */
  function exportPdf() {
    const d = state.drawing;
    const esc = t => String(t || '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    const steps = d.steps.map((st, i) => `<section class="step"><h2>Étape ${i + 1}${st.note ? ' · ' + esc(st.note) : ''}</h2>${new XMLSerializer().serializeToString(sceneSvg(d.settings, st.objects, '', st.frame))}</section>`).join('');
    const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>${esc(d.title)}</title>
      <style>body{font-family:Arial,Helvetica,sans-serif;margin:16mm;color:#1f2933}h1{margin:0 0 2px;font-size:22px}.sub{color:#666;margin:0 0 14px;font-size:13px}
      .grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}.step{break-inside:avoid;border:1px solid #ddd;border-radius:8px;padding:8px}.step h2{font-size:14px;margin:0 0 6px}.step svg{width:100%;height:auto;border-radius:6px}
      @media print{.noprint{display:none}}@page{margin:12mm}</style></head><body>
      <h1>${esc(d.title)}</h1><p class="sub">${esc([d.category, d.tags].filter(Boolean).join(' · '))}${d.category || d.tags ? ' · ' : ''}${d.steps.length} étape${d.steps.length > 1 ? 's' : ''} · Appli Rugby Strat</p>
      <p class="noprint"><button onclick="window.print()">Imprimer / enregistrer en PDF</button></p>
      <div class="grid">${steps}</div></body></html>`;
    const w = window.open('', '_blank');
    if (!w) { toast('Autorisez les fenêtres surgissantes pour la fiche PDF.'); return; }
    w.document.open(); w.document.write(html); w.document.close();
    w.focus(); setTimeout(() => { try { w.print(); } catch (e) { /* l'utilisateur imprimera depuis le bouton */ } }, 400);
  }

  /* ---------- JSON import / export ---------- */
  $('#btn-export-json').onclick = () => download(new Blob([snapshot()], { type: 'application/json' }), `${slug(state.drawing.title)}.json`);
  $('#btn-import-json').onclick = () => $('#file-import').click();
  $('#file-import').onchange = e => {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => { try { loadDrawing(JSON.parse(r.result)); toast('Dessin importé.'); } catch (err) { toast('Fichier invalide.'); } };
    r.readAsText(f); e.target.value = '';
  };

  /* ---------- Bibliothèque (localStorage) ---------- */
  function readLib() { try { return JSON.parse(localStorage.getItem(LIB_KEY) || '[]'); } catch (e) { return []; } }
  function writeLib(list) { try { localStorage.setItem(LIB_KEY, JSON.stringify(list)); } catch (e) { toast('Stockage local indisponible.'); } }
  function saveDrawing() {
    state.drawing.title = $('#title').value.trim() || 'Sans titre';
    const list = readLib(); const d = clone(state.drawing); d.updatedAt = Date.now();
    const i = list.findIndex(x => x.id === d.id); if (i >= 0) list[i] = d; else list.unshift(d);
    writeLib(list); toast('Dessin enregistré dans « Mes dessins ».');
  }
  $('#btn-save').onclick = () => (window.RugbyAccount && window.RugbyAccount.isActive()) ? window.RugbyAccount.save() : saveDrawing();

  function loadDrawing(d) {
    if (!d || !Array.isArray(d.steps) || !d.steps.length) throw new Error('bad drawing');
    d.settings = Object.assign({ field: 'full', orientation: 'landscape', stepDuration: 1200, snap: false }, d.settings || {});
    if (d.category === undefined) d.category = ''; if (d.tags === undefined) d.tags = '';
    state.drawing = d; state.step = 0; state.selected = null; state.history = []; state.future = [];
    state.framing = null; $('#frame-bar').classList.add('hidden');
    renderField_(); applySettingsToUI(); afterChange();
  }

  /** Page d'accueil en mode local : dessins stockés sur cet appareil. */
  const CATEGORIES = ['Attaque', 'Défense', 'Touche', 'Mêlée', 'Jeu au pied', 'Physique', 'Entraînement', 'Match', 'Autre'];
  const homeFilter = { q: '', cat: '' };
  /** Filtre une liste de dessins (objets avec title, category, tags) selon la recherche et la catégorie. */
  function filterDrawings(list) {
    const q = homeFilter.q.trim().toLowerCase();
    return list.filter(d => (!homeFilter.cat || (d.category || '') === homeFilter.cat) && (!q || `${d.title} ${d.category || ''} ${d.tags || ''}`.toLowerCase().includes(q)));
  }
  /** Barre de recherche + catégories, rendue au-dessus d'une liste. */
  function filterBar(onChange, counts) {
    const bar = document.createElement('div'); bar.className = 'filter-bar';
    const inp = document.createElement('input'); inp.type = 'search'; inp.placeholder = 'Rechercher un dessin…'; inp.value = homeFilter.q;
    inp.oninput = () => { homeFilter.q = inp.value; onChange(); };
    bar.appendChild(inp);
    const chips = document.createElement('div'); chips.className = 'chips';
    [['', 'Tout']].concat(CATEGORIES.map(c => [c, c])).forEach(([v, l]) => {
      const n = counts ? (v ? counts[v] || 0 : null) : null;
      if (v && counts && !n) return;
      const b = document.createElement('button'); b.className = 'chip' + (homeFilter.cat === v ? ' on' : ''); b.textContent = l + (n ? ` (${n})` : '');
      b.onclick = () => { homeFilter.cat = v; onChange(); }; chips.appendChild(b);
    });
    bar.appendChild(chips);
    return bar;
  }
  const countByCat = list => list.reduce((acc, d) => { if (d.category) acc[d.category] = (acc[d.category] || 0) + 1; return acc; }, {});

  function renderLocalHome() {
    $('#home-tabs').classList.add('hidden');
    const root = $('#home-list'); root.replaceChildren();
    const all = readLib();
    if (!all.length) { const p = document.createElement('p'); p.className = 'library-empty'; p.textContent = 'Aucun dessin enregistré pour le moment. Cliquez « Nouveau dessin » pour commencer.'; root.appendChild(p); return; }
    root.appendChild(filterBar(renderLocalHome, countByCat(all)));
    const list = filterDrawings(all);
    if (!list.length) { const p = document.createElement('p'); p.className = 'library-empty'; p.textContent = 'Aucun dessin ne correspond à la recherche.'; root.appendChild(p); }
    list.forEach(d => root.appendChild(localCard(d, () => { loadDrawing(clone(d)); go('editor'); }, () => {
      const c = clone(d); c.id = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : uid(); c.title = d.title + ' (copie)'; c.updatedAt = Date.now();
      const lib = readLib(); lib.unshift(c); writeLib(lib); renderHome(); toast('Dessin dupliqué.');
    })));
  }
  function localCard(d, onOpen, onDuplicate) {
    const c = document.createElement('div'); c.className = 'lib-card';
    c.innerHTML = `<div class="thumb"></div><div class="body"><span class="name"></span><button class="del" title="Supprimer">✕</button></div><div class="date"></div>`;
    c.querySelector('.thumb').appendChild(sceneSvg(d.settings || {}, (d.steps[0] || {}).objects || []));
    c.querySelector('.name').textContent = d.title;
    c.querySelector('.date').innerHTML = (d.category ? `<span class="vis-badge cat">${d.category}</span> ` : '') + `${d.steps.length} étape${d.steps.length > 1 ? 's' : ''} · ${new Date(d.updatedAt || 0).toLocaleDateString('fr-FR')}` + (d.tags ? ` · ${d.tags.replace(/[<>]/g, '')}` : '');
    if (onDuplicate) { const wrap = document.createElement('div'); wrap.className = 'card-btns'; const b = document.createElement('button'); b.className = 'btn small outline'; b.textContent = 'Dupliquer'; b.onclick = e => { e.stopPropagation(); onDuplicate(); }; wrap.appendChild(b); c.appendChild(wrap); }
    c.onclick = onOpen;
    c.querySelector('.del').onclick = e => { e.stopPropagation(); if (confirm(`Supprimer « ${d.title} » ?`)) { writeLib(readLib().filter(x => x.id !== d.id)); renderHome(); } };
    return c;
  }

  /* ---------- Navigation accueil / éditeur ---------- */
  function currentView() { return location.hash.startsWith('#/editor') ? 'editor' : location.hash.startsWith('#/team') ? 'team' : location.hash.startsWith('#/admin') ? 'admin' : location.hash.startsWith('#/s/') ? 'share' : 'home'; }
  const shareToken = () => location.hash.startsWith('#/s/') ? location.hash.slice(4).split(/[?&]/)[0] : '';
  function go(view) { const h = view === 'editor' ? '#/editor' : view === 'team' ? '#/team' : view === 'admin' ? '#/admin' : '#/'; if (location.hash === h) showView(view); else location.hash = h; }
  function showView(view) {
    const acc = window.RugbyAccount;
    if (view === 'team' && !(acc && acc.isActive() && acc.isLoggedIn())) {
      const waiting = acc && acc.isActive() && !acc.isReady();   // session pas encore connue : on affiche l'accueil sans changer l'URL
      view = 'home';
      if (!waiting && acc && acc.isActive()) acc.openAuth();
    }
    if (view === 'admin' && !(acc && acc.isActive() && acc.isLoggedIn() && acc.isSuper())) view = 'home';   // account.js redirige une fois la session connue
    ['home', 'editor', 'team', 'share', 'admin'].forEach(v => $('#view-' + v).classList.toggle('hidden', v !== view));
    if (view !== 'share' && preview.drawing) stopPreview();
    if (view === 'share') { closeDrawer(); openShare(shareToken()); return; }
    if (view === 'editor') requestAnimationFrame(fitZoom);
    else if (view === 'team') { closeDrawer(); acc.renderTeamPage(); }
    else if (view === 'admin') { closeDrawer(); if (window.RugbyAdmin) window.RugbyAdmin.render(); }
    else { closeDrawer(); renderHome(); }
  }
  $('#team-back').onclick = () => go('home');
  function renderHome() {
    const d = state.drawing;
    const acc = window.RugbyAccount;
    const visitor = acc && acc.isActive() && !acc.isLoggedIn();
    const hasContent = d.steps.some(st => st.objects.length) && !(visitor && d.title === 'Nouveau dessin');   // pas de carte pour l'exemple de démarrage
    $('#home-current').classList.toggle('hidden', !hasContent);
    $('#home-current-title').textContent = d.title;
    if (window.RugbyAccount && window.RugbyAccount.isActive()) window.RugbyAccount.renderHome(); else renderLocalHome();
  }
  window.addEventListener('hashchange', () => showView(currentView()));
  $('#home-resume').onclick = () => go('editor');
  $('#home-new').onclick = () => {
    track('new_drawing');
    const nd = newDrawing();
    if (window.matchMedia('(max-width: 700px) and (orientation: portrait)').matches) nd.settings.orientation = 'portrait';   // remplit l'écran du téléphone
    loadDrawing(nd); if (window.RugbyAccount && window.RugbyAccount.onNewDrawing) window.RugbyAccount.onNewDrawing(); go('editor'); };
  $('#btn-library').onclick = () => go('home');

  /* ---------- Modales & toast ---------- */
  function openModal(id) { $('#' + id).classList.remove('hidden'); }
  function closeModal(id) { $('#' + id).classList.add('hidden'); if (id === 'modal-preview') { setPlaying(false); setPresenting(false); } }
  document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => closeModal(b.dataset.close));
  document.querySelectorAll('.modal').forEach(m => m.addEventListener('click', e => { if (e.target === m) closeModal(m.id); }));
  let toastTimer;
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2200); }

  /* ---------- API pour les modules externes ---------- */
  window.RugbyEditor = {
    get drawing() { return state.drawing; },
    loadDrawing, newDrawing, sceneSvg, toast, openModal, closeModal, readLib, writeLib, afterChange, clone, go, renderHome, localCard,
    filterBar, filterDrawings, countByCat, CATEGORIES
  };

  /* ---------- Démarrage ---------- */
  buildPalette();
  setTool(null);
  let restored = null;
  try { restored = JSON.parse(localStorage.getItem(CUR_KEY) || 'null'); } catch (e) { /* ignore */ }
  try { loadDrawing(restored || newDrawing()); } catch (e) { loadDrawing(newDrawing()); }
  // Un dessin vide reçoit un petit exemple pour montrer les possibilités
  if (!restored) seedExample();
  showView(currentView());

  function seedExample() {
    const b = snapshot();
    const o = curObjects();
    const blue = [[500, 300], [480, 340], [480, 380], [480, 420], [480, 460], [480, 500]];
    blue.forEach((p, i) => o.push({ id: uid(), type: 'player', color: 'blue', jersey: false, x: p[0], y: p[1], label: String(i + 9), scale: 1 }));
    o.push({ id: uid(), type: 'equip', kind: 'ball', x: 522, y: 292, rot: -20, scale: 0.8 });
    o.push({ id: uid(), type: 'shape', shape: 'rect', x: 600, y: 360, w: 180, h: 150, dashed: false, color: 'white', width: 3, fill: true });
    [[640, 400], [720, 400], [680, 435], [640, 470], [720, 470]].forEach(p => o.push({ id: uid(), type: 'player', color: 'red', jersey: false, x: p[0], y: p[1], label: '', scale: 1 }));
    o.push({ id: uid(), type: 'line', style: 'wavy', x1: 520, y1: 300, x2: 600, y2: 350, dashed: false, arrow: true, color: 'white', width: 3 });
    o.push({ id: uid(), type: 'text', x: 600, y: 335, text: 'Zone de défense', size: 16, color: 'white' });
    commit(b);
    state.history = []; state.future = []; $('#fab-undo').disabled = true;
  }
})();

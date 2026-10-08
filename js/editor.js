/* Éditeur d'exercices rugby : état, interactions, étapes, aperçu, export, sauvegarde. */
(function () {
  'use strict';

  const { svgEl, fieldSpec, renderField, SVG_NS } = window.RugbyField;
  const { renderObject, bounds, move, lerpObject, polyPoints, EQUIP_SIZE } = window.RugbyObjects;
  const { TOOL_GROUPS, TOOLS, COLORS } = window.RugbyPalette;

  const $ = s => document.querySelector(s);
  const uid = () => Math.random().toString(36).slice(2, 10);
  const clone = o => JSON.parse(JSON.stringify(o));
  const LIB_KEY = 'rugby-drawings-v1';
  const CUR_KEY = 'rugby-drawing-current-v1';

  /* ---------- État ---------- */
  function newDrawing() {
    return { id: (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : uid(), title: 'Nouveau dessin', settings: { field: 'full', orientation: 'landscape', stepDuration: 1200 }, steps: [{ id: uid(), objects: [] }], updatedAt: Date.now() };
  }
  const state = { drawing: newDrawing(), step: 0, tool: null, selected: null, zoom: 1, history: [], future: [] };

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
  function fixStepIndex() { state.step = Math.min(state.step, state.drawing.steps.length - 1); if (state.selected && !findObj(state.selected)) state.selected = null; }

  let saveTimer = null;
  function afterChange(full) {
    state.drawing.updatedAt = Date.now();
    if (full) { renderField_(); applySettingsToUI(); }
    render();
    renderSteps();
    $('#btn-undo').disabled = !state.history.length;
    $('#btn-redo').disabled = !state.future.length;
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
  }

  function renderOverlay() {
    overlayG.replaceChildren();
    const obj = state.selected && findObj(state.selected);
    if (!obj) return;
    const b = bounds(obj);
    overlayG.appendChild(svgEl('rect', { class: 'selection-box', x: b.x - 4, y: b.y - 4, width: b.w + 8, height: b.h + 8 }));
    const handle = (x, y, name, cls) => svgEl('circle', { class: 'handle ' + (cls || ''), cx: x, cy: y, r: 5, 'data-handle': name });
    if (obj.type === 'shape' && obj.shape === 'poly') {
      polyPoints(obj).forEach((p, i) => overlayG.appendChild(handle(p[0], p[1], 'v' + i, 'vertex')));
    } else if (obj.type === 'shape') {
      overlayG.append(handle(obj.x, obj.y, 'nw'), handle(obj.x + obj.w, obj.y, 'ne'), handle(obj.x, obj.y + obj.h, 'sw'), handle(obj.x + obj.w, obj.y + obj.h, 'se'));
    } else if (obj.type === 'line') {
      overlayG.append(handle(obj.x1, obj.y1, 'p1', 'endpoint'), handle(obj.x2, obj.y2, 'p2', 'endpoint'));
    }
  }

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
        b.className = 'tool'; b.dataset.tool = t.id; b.title = t.label + (t.key ? ` (${t.key})` : '');
        b.innerHTML = `<svg viewBox="0 0 32 32">${t.icon}</svg>` + (t.key ? `<span class="key">${t.key}</span>` : '');
        b.onclick = () => setTool(state.tool === t.id ? null : t.id);
        grid.appendChild(b);
      });
      const head = document.createElement('div'); head.className = 'group-head';
      head.innerHTML = `<h3>${g.title}</h3>` + (gi === 0 ? `<button class="select-tool" id="btn-select" title="Sélection (V)"><svg viewBox="0 0 24 24" width="16" height="16"><path d="M5 3l14 8-6 2-3 6z" fill="currentColor"/></svg></button>` : '');
      const sec = document.createElement('section'); sec.className = 'group'; sec.append(head, grid);
      root.appendChild(sec);
    });
    $('#btn-select').onclick = () => setTool(null);
  }

  function setTool(id) {
    state.tool = id;
    if (id) closeDrawer();
    if (id) { state.selected = null; renderOverlay(); renderProps(); }
    document.querySelectorAll('.tool').forEach(b => b.classList.toggle('active', b.dataset.tool === id));
    $('#btn-select').classList.toggle('active', !id);
    svg.classList.toggle('tool-active', !!id);
    const t = id && TOOLS[id];
    $('#hint').textContent = !t ? 'Mode sélection : cliquez un objet pour le déplacer, double-cliquez un texte ou un joueur pour le modifier.'
      : t.kind === 'shape' || t.kind === 'line' || t.kind === 'free' ? `${t.label} : cliquez-glissez sur le terrain pour dessiner. Échap pour revenir à la sélection.`
      : `${t.label} : cliquez sur le terrain pour placer. Échap pour revenir à la sélection.`;
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
      case 'player': return Object.assign(base, { color: t.color, jersey: !!t.jersey, x: p.x, y: p.y, label: '', scale: 1 });
    }
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
    const t = state.tool && TOOLS[state.tool];
    if (t) {
      const obj = makeObject(t, p);
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
      state.selected = g.dataset.id;
      const obj = findObj(state.selected);
      drag = { mode: 'move', obj, orig: clone(obj), start: p, before };
      svg.setPointerCapture(e.pointerId);
      render();
      return;
    }
    state.selected = null; render();
  });

  svg.addEventListener('pointermove', e => {
    if (!drag || pinch) return;
    const p = toSvg(e);
    const dx = p.x - drag.start.x, dy = p.y - drag.start.y;
    const o = drag.obj;
    if (drag.mode === 'create') {
      if (drag.kind === 'shape') { o.x = Math.min(drag.start.x, p.x); o.y = Math.min(drag.start.y, p.y); o.w = Math.abs(dx); o.h = Math.abs(dy); if (e.shiftKey) { o.w = o.h = Math.max(o.w, o.h); } }
      else if (drag.kind === 'line') { o.x2 = p.x; o.y2 = p.y; }
      else if (drag.kind === 'free') { const last = o.points[o.points.length - 1]; if (Math.hypot(p.x - last[0], p.y - last[1]) > 3) o.points.push([p.x, p.y]); }
    } else if (drag.mode === 'move') {
      Object.assign(o, clone(drag.orig)); move(o, dx, dy);
    } else if (drag.mode === 'handle') {
      const r = drag.orig; Object.assign(o, clone(r));
      const n = drag.name;
      if (n === 'p1') { o.x1 = p.x; o.y1 = p.y; }
      else if (n === 'p2') { o.x2 = p.x; o.y2 = p.y; }
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
    if (!$('#modal-preview').classList.contains('hidden')) { if (e.key === 'Escape') closeModal('modal-preview'); return; }
    const k = e.key;
    if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
    if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === 'd') { e.preventDefault(); duplicateSelected(); return; }
    if (k === 'Escape') { setTool(null); state.selected = null; render(); return; }
    if (k.toLowerCase() === 'v') { setTool(null); return; }
    if (k === 'Delete' || k === 'Backspace') { if (state.selected) { const b = snapshot(); removeObj(state.selected); state.selected = null; commit(b); } return; }
    if (k.startsWith('Arrow') && state.selected) {
      e.preventDefault();
      const d = e.shiftKey ? 10 : 2, obj = findObj(state.selected), b = snapshot();
      move(obj, k === 'ArrowLeft' ? -d : k === 'ArrowRight' ? d : 0, k === 'ArrowUp' ? -d : k === 'ArrowDown' ? d : 0);
      commit(b); return;
    }
    const tool = Object.values(TOOLS).find(t => t.key && t.key.toLowerCase() === k.toLowerCase());
    if (tool && !e.ctrlKey && !e.metaKey) setTool(tool.id);
  });

  function duplicateSelected() {
    const obj = findObj(state.selected); if (!obj) return;
    const b = snapshot(); const c = clone(obj); c.id = uid(); move(c, 20, 20);
    curObjects().push(c); state.selected = c.id; commit(b);
  }

  /* ---------- Barre de propriétés ---------- */
  function renderProps() {
    const box = $('#props');
    const obj = state.selected && findObj(state.selected);
    if (!obj) { box.classList.add('hidden'); return; }
    box.classList.remove('hidden');
    box.replaceChildren();
    const add = el => box.appendChild(el);
    const sep = () => { const s = document.createElement('span'); s.className = 'sep'; add(s); };
    const btn = (label, title, on, fn, cls) => { const b = document.createElement('button'); b.className = 'pbtn' + (on ? ' on' : '') + (cls ? ' ' + cls : ''); b.innerHTML = label; b.title = title; b.onclick = () => { const s = snapshot(); fn(); commit(s); }; add(b); return b; };

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
      btn('Maillot', 'Afficher en maillot', obj.jersey, () => { obj.jersey = !obj.jersey; });
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
    btn('Supprimer', 'Supprimer (Suppr)', false, () => { removeObj(obj.id); state.selected = null; }, 'danger');
  }
  function render_objectsOnly() { objectsG.replaceChildren(...curObjects().map(renderObject)); renderOverlay(); }

  /* ---------- Étapes ---------- */
  function sceneSvg(settings, objects) {
    const spec = fieldSpec(settings);
    const s = svgEl('svg', { xmlns: SVG_NS, viewBox: `0 0 ${spec.W} ${spec.H}` });
    s.appendChild(renderField(spec));
    s.appendChild(svgEl('g', {}, objects.map(renderObject)));
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
      </div><div class="meta">${st.objects.length} objet${st.objects.length > 1 ? 's' : ''}</div>`;
      card.querySelector('.thumb').appendChild(sceneSvg(state.drawing.settings, st.objects));
      card.onclick = () => { state.step = i; state.selected = null; render(); renderSteps(); closeDrawer(); };
      card.querySelector('.dup').onclick = e => { e.stopPropagation(); const b = snapshot(); state.drawing.steps.splice(i + 1, 0, { id: uid(), objects: clone(st.objects) }); state.step = i + 1; state.selected = null; commit(b); };
      card.querySelector('.del').onclick = e => {
        e.stopPropagation();
        if (state.drawing.steps.length === 1) { toast('Impossible de supprimer la seule étape.'); return; }
        if (!confirm(`Supprimer l'étape ${i + 1} ?`)) return;
        const b = snapshot(); state.drawing.steps.splice(i, 1); state.step = Math.max(0, Math.min(state.step, state.drawing.steps.length - 1)); state.selected = null; commit(b);
      };
      root.appendChild(card);
    });
  }
  $('#add-step').onclick = () => { const b = snapshot(); state.drawing.steps.push({ id: uid(), objects: clone(curObjects()) }); state.step = state.drawing.steps.length - 1; state.selected = null; commit(b); };

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
    if (which === 'library') { closeDrawer(); $('#btn-library').click(); return; }
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
  }
  $('#title').onchange = e => { state.drawing.title = e.target.value.trim() || 'Sans titre'; e.target.value = state.drawing.title; afterChange(); };

  /* ---------- Aperçu animé ---------- */
  const preview = { playing: false, step: 0, raf: null };
  function openPreview() {
    preview.step = state.step; preview.playing = false;
    openModal('modal-preview');
    $('#preview-title').textContent = state.drawing.title;
    showPreviewStep(preview.step);
  }
  function showPreviewStep(i, objects) {
    const st = state.drawing.steps[i];
    $('#preview-canvas').replaceChildren(sceneSvg(state.drawing.settings, objects || st.objects));
    $('#preview-step').textContent = `Étape ${i + 1} / ${state.drawing.steps.length}`;
  }
  function animateTo(next, done) {
    const a = state.drawing.steps[preview.step].objects, b = state.drawing.steps[next].objects;
    const dur = Math.max(200, (state.drawing.settings.stepDuration || 1200) * 0.7);
    const t0 = performance.now();
    const frame = now => {
      const t = Math.min(1, (now - t0) / dur), e = t < .5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      const list = [];
      a.forEach(o => { if (!b.find(x => x.id === o.id)) list.push(Object.assign(clone(o), { opacity: 1 - e })); });
      b.forEach(o => { const prev = a.find(x => x.id === o.id); list.push(prev ? lerpObject(prev, o, e, a) : Object.assign(clone(o), { opacity: e })); });
      showPreviewStep(next, list);
      if (t < 1) preview.raf = requestAnimationFrame(frame); else { preview.step = next; showPreviewStep(next); done && done(); }
    };
    cancelAnimationFrame(preview.raf);
    preview.raf = requestAnimationFrame(frame);
  }
  function playLoop() {
    if (!preview.playing) return;
    const next = (preview.step + 1) % state.drawing.steps.length;
    const hold = state.drawing.settings.stepDuration || 1200;
    preview.timer = setTimeout(() => { if (!preview.playing) return; animateTo(next, playLoop); }, hold * 0.6);
  }
  function setPlaying(on) {
    preview.playing = on; $('#preview-play').textContent = on ? '⏸ Pause' : '▶ Lire';
    clearTimeout(preview.timer); cancelAnimationFrame(preview.raf);
    if (on) { if (state.drawing.steps.length < 2) { toast('Ajoutez au moins deux étapes pour animer.'); preview.playing = false; $('#preview-play').textContent = '▶ Lire'; return; } playLoop(); }
    else showPreviewStep(preview.step);
  }
  $('#btn-preview').onclick = openPreview;
  $('#preview-play').onclick = () => setPlaying(!preview.playing);
  $('#preview-next').onclick = () => { setPlaying(false); animateTo((preview.step + 1) % state.drawing.steps.length); };
  $('#preview-prev').onclick = () => { setPlaying(false); animateTo((preview.step - 1 + state.drawing.steps.length) % state.drawing.steps.length); };

  /* ---------- Export PNG ---------- */
  function exportPng() {
    const spec = fieldSpec(state.drawing.settings);
    const s = sceneSvg(state.drawing.settings, curObjects());
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
    const kind = b.dataset.export;
    if (kind === 'png') return exportPng();
    if (state.drawing.steps.length < 2) { toast('Ajoutez au moins deux étapes pour un export animé.'); return; }
    const label = kind === 'gif' ? 'Création du GIF animé…' : 'Enregistrement de la vidéo…';
    const prog = showProgress(label);
    const fn = kind === 'gif' ? window.RugbyExport.exportGif : window.RugbyExport.exportWebm;
    fn(state.drawing, sceneSvg, prog.update)
      .then(blob => { download(blob, `${slug(state.drawing.title)}.${kind}`); toast(kind === 'gif' ? 'GIF animé exporté.' : 'Vidéo exportée.'); })
      .catch(err => toast('Export impossible : ' + (err && err.message ? err.message : err)))
      .finally(prog.close);
  });
  function showProgress(label) {
    const el = document.createElement('div'); el.className = 'progress';
    el.innerHTML = `<div class="box"><div class="lbl"></div><div class="bar"><i></i></div></div>`;
    el.querySelector('.lbl').textContent = label; document.body.appendChild(el);
    return { update: p => { el.querySelector('i').style.width = Math.round(p * 100) + '%'; }, close: () => el.remove() };
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
    d.settings = Object.assign({ field: 'full', orientation: 'landscape', stepDuration: 1200 }, d.settings || {});
    state.drawing = d; state.step = 0; state.selected = null; state.history = []; state.future = [];
    renderField_(); applySettingsToUI(); afterChange();
  }

  function openLibrary() {
    $('#library-tabs').classList.add('hidden');
    const root = $('#library-list'); root.replaceChildren();
    const list = readLib();
    if (!list.length) { const p = document.createElement('p'); p.className = 'library-empty'; p.textContent = 'Aucun dessin enregistré pour le moment.'; root.appendChild(p); }
    list.forEach(d => {
      const c = document.createElement('div'); c.className = 'lib-card';
      c.innerHTML = `<div class="thumb"></div><div class="body"><span class="name"></span><button class="del" title="Supprimer">✕</button></div><div class="date"></div>`;
      c.querySelector('.thumb').appendChild(sceneSvg(d.settings || {}, (d.steps[0] || {}).objects || []));
      c.querySelector('.name').textContent = d.title;
      c.querySelector('.date').textContent = `${d.steps.length} étape${d.steps.length > 1 ? 's' : ''} · ${new Date(d.updatedAt || 0).toLocaleDateString('fr-FR')}`;
      c.onclick = () => { loadDrawing(clone(d)); closeModal('modal-library'); };
      c.querySelector('.del').onclick = e => { e.stopPropagation(); if (confirm(`Supprimer « ${d.title} » ?`)) { writeLib(readLib().filter(x => x.id !== d.id)); openLibrary(); } };
      root.appendChild(c);
    });
    openModal('modal-library');
  }
  $('#btn-library').onclick = () => (window.RugbyAccount && window.RugbyAccount.isActive()) ? window.RugbyAccount.openLibrary() : openLibrary();
  $('#btn-new-drawing').onclick = () => { loadDrawing(newDrawing()); if (window.RugbyAccount && window.RugbyAccount.onNewDrawing) window.RugbyAccount.onNewDrawing(); closeModal('modal-library'); };

  /* ---------- Modales & toast ---------- */
  function openModal(id) { $('#' + id).classList.remove('hidden'); }
  function closeModal(id) { $('#' + id).classList.add('hidden'); if (id === 'modal-preview') setPlaying(false); }
  document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => closeModal(b.dataset.close));
  document.querySelectorAll('.modal').forEach(m => m.addEventListener('click', e => { if (e.target === m) closeModal(m.id); }));
  let toastTimer;
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2200); }

  /* ---------- API pour les modules externes ---------- */
  window.RugbyEditor = {
    get drawing() { return state.drawing; },
    loadDrawing, newDrawing, sceneSvg, toast, openModal, closeModal, readLib, writeLib, afterChange, clone
  };

  /* ---------- Démarrage ---------- */
  buildPalette();
  setTool(null);
  let restored = null;
  try { restored = JSON.parse(localStorage.getItem(CUR_KEY) || 'null'); } catch (e) { /* ignore */ }
  try { loadDrawing(restored || newDrawing()); } catch (e) { loadDrawing(newDrawing()); }
  // Un dessin vide reçoit un petit exemple pour montrer les possibilités
  if (!restored) seedExample();

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
    state.history = []; state.future = []; $('#btn-undo').disabled = true;
  }
})();

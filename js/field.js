/* Rendu du terrain de rugby (SVG). Toutes les cotes sont en mètres, converties en pixels. */
(function (global) {
  'use strict';

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const M = 8;      // pixels par mètre
  const PAD = 40;   // marge de pelouse autour du terrain
  const WIDTH_M = 70;

  function svgEl(tag, attrs, children) {
    const el = document.createElementNS(SVG_NS, tag);
    if (attrs) for (const k in attrs) if (attrs[k] !== undefined && attrs[k] !== null) el.setAttribute(k, attrs[k]);
    if (children) children.forEach(c => { if (c) el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return el;
  }

  /** Dimensions du dessin selon les réglages. */
  function fieldSpec(settings) {
    const type = settings.field || 'full';
    const lengthM = type === 'half' ? 60 : 120;      // en-buts inclus (10 m chacun)
    const Wl = lengthM * M + PAD * 2;                // largeur en paysage
    const Hl = WIDTH_M * M + PAD * 2;
    const landscape = settings.orientation !== 'portrait';
    return { type, lengthM, widthM: WIDTH_M, Wl, Hl, landscape, W: landscape ? Wl : Hl, H: landscape ? Hl : Wl };
  }

  function line(x1, y1, x2, y2, extra) {
    const a = Object.assign({ x1: PAD + x1 * M, y1: PAD + y1 * M, x2: PAD + x2 * M, y2: PAD + y2 * M, stroke: 'rgba(255,255,255,.85)', 'stroke-width': 2 }, extra || {});
    return svgEl('line', a);
  }

  function posts(xGoal, dir, g) {
    // "H" vu du dessus : barre transversale sur la ligne de but + montants
    const y1 = 35 - 2.8, y2 = 35 + 2.8;
    g.appendChild(line(xGoal, y1, xGoal, y2, { 'stroke-width': 4, stroke: '#fff' }));
    g.appendChild(line(xGoal - 2.5 * dir, y1, xGoal + 2.5 * dir, y1, { 'stroke-width': 3, stroke: '#fff' }));
    g.appendChild(line(xGoal - 2.5 * dir, y2, xGoal + 2.5 * dir, y2, { 'stroke-width': 3, stroke: '#fff' }));
  }

  /** Construit le groupe <g> du terrain. */
  function renderField(spec) {
    const root = svgEl('g', { class: 'field' });
    root.appendChild(svgEl('rect', { x: 0, y: 0, width: spec.W, height: spec.H, fill: '#4a9e4f' }));

    if (spec.type === 'empty') return root;

    // Bandes de tonte pour le relief
    const stripes = svgEl('g', { transform: spec.landscape ? '' : `translate(${spec.Hl} 0) rotate(90)` });
    for (let i = 0; i < spec.lengthM / 10; i++) {
      if (i % 2 === 0) stripes.appendChild(svgEl('rect', { x: PAD + i * 10 * M, y: 0, width: 10 * M, height: spec.Hl, fill: 'rgba(255,255,255,.04)' }));
    }
    root.appendChild(stripes);

    const g = svgEl('g', { transform: spec.landscape ? '' : `translate(${spec.Hl} 0) rotate(90)` });
    const L = spec.lengthM, W = spec.widthM;
    const dash = { 'stroke-dasharray': '10 8' };

    // Contour (lignes de ballon mort + touches)
    g.appendChild(svgEl('rect', { x: PAD, y: PAD, width: L * M, height: W * M, fill: 'none', stroke: 'rgba(255,255,255,.85)', 'stroke-width': 2 }));

    // Lignes verticales (perpendiculaires à la touche)
    const solid = [10, 32, 60];               // but, 22 m, médiane
    const dashed = [15, 50];                  // 5 m, 10 m
    if (L === 120) { solid.push(88, 110); dashed.push(70, 105); }
    solid.forEach(x => g.appendChild(line(x, 0, x, W)));
    dashed.forEach(x => g.appendChild(line(x, 0, x, W, dash)));

    // Lignes des 5 m et 15 m (parallèles à la touche) entre les lignes de but
    const xEnd = L === 120 ? 110 : L;
    [5, 15, W - 15, W - 5].forEach(y => g.appendChild(line(10, y, xEnd, y, dash)));

    // Poteaux
    posts(10, 1, g);
    if (L === 120) posts(110, -1, g);

    root.appendChild(g);
    return root;
  }

  global.RugbyField = { SVG_NS, M, PAD, svgEl, fieldSpec, renderField };
})(window);

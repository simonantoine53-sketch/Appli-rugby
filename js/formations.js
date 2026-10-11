/* Formations complètes (15 contre 15) : mêlée et touche. Cotes en mètres, converties selon le terrain. */
(function (global) {
  'use strict';
  const { M, PAD, fieldSpec } = global.RugbyField;
  const uid = () => (global.crypto && crypto.randomUUID) ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);

  /** Convertit des coordonnées en mètres (repère paysage) en coordonnées SVG du dessin courant. */
  function toSvg(settings, mx, my) {
    const spec = fieldSpec(settings);
    const X = PAD + mx * M, Y = PAD + my * M;
    return spec.landscape ? [X, Y] : [spec.Hl - Y, X];
  }
  /** Inverse : coordonnées SVG -> mètres (repère paysage). */
  function fromSvg(settings, X, Y) {
    const spec = fieldSpec(settings);
    const lx = spec.landscape ? X : Y, ly = spec.landscape ? Y : spec.Hl - X;
    return [(lx - PAD) / M, (ly - PAD) / M];
  }

  /* Positions relatives (dx le long du terrain, dy en travers). dx négatif = côté attaque. */
  function scrumLayout() {
    const A = [ // attaque (espacement ~3 m pour que les pastilles ne se chevauchent pas)
      [1, -1.8, -3.2], [2, -1.8, 0], [3, -1.8, 3.2],
      [4, -4.6, -1.6], [5, -4.6, 1.6],
      [6, -7.2, -4.4], [7, -7.2, 4.4], [8, -8, 0],
      [9, -7, 7.5],
      [10, -13, 11], [12, -16, 17], [13, -19, 23], [11, -22, 31],
      [14, -10, -12], [15, -29, 11]
    ];
    // Défense : pack en face, 9 au pied, ligne de défense à plat derrière la ligne de hors-jeu, 15 en couverture
    const D = [
      [1, 1.8, -3.2], [2, 1.8, 0], [3, 1.8, 3.2],
      [4, 4.6, -1.6], [5, 4.6, 1.6],
      [6, 7.2, -4.4], [7, 7.2, 4.4], [8, 8, 0],
      [9, 7, 7.5],
      [10, 11, 10], [12, 11, 17], [13, 11, 24], [11, 11, 33],
      [14, 11, -11], [15, 24, 12]
    ];
    return { A, D, ball: [-9.5, 7] };
  }
  function lineoutLayout(n) {
    // d = distance à la ligne de touche (m), x = écart par rapport à la ligne de remise en jeu
    const spots = { 4: [5, 8.2, 11.4, 14.6], 5: [5, 8, 11, 14, 17], 7: [5, 8, 11, 14, 17, 20, 23] }[n] || [5, 8, 11, 14, 17];
    const jumpers = { 4: [3, 4, 5, 8], 5: [1, 3, 4, 5, 8], 7: [1, 3, 4, 5, 6, 7, 8] }[n] || [1, 3, 4, 5, 8];
    const rest = [1, 3, 4, 5, 6, 7, 8].filter(x => !jumpers.includes(x));
    const deep = spots[spots.length - 1];
    const A = [[2, 0, 1.6]];                        // talonneur au lancer, sur la ligne de touche
    jumpers.forEach((num, i) => A.push([num, -2.2, spots[i]]));
    A.push([9, -4.5, deep + 3.5]);                  // relayeur
    rest.forEach((num, i) => A.push([num, -12, deep + 4 + i * 3.5]));
    A.push([10, -14, deep + 10], [12, -17, deep + 16], [13, -20, deep + 22], [11, -24, deep + 32], [14, -10, 7], [15, -31, deep + 18]);
    // Défense : alignement en face, 9 sur le relayeur, le reste à 10 m sur une ligne à plat, 15 en couverture
    const D = [];
    jumpers.forEach((num, i) => D.push([num, 2.2, spots[i]]));
    D.push([9, 4.5, deep + 3.5]);
    D.push([2, 12, 2.5]);                           // talonneur défensif devant, couloir des 5 m
    rest.forEach((num, i) => D.push([num, 12, deep + 2 + i * 4]));
    D.push([10, 12, deep + 9], [12, 12, deep + 16], [13, 12, deep + 23], [11, 12, deep + 34], [14, 12, 8], [15, 25, deep + 18]);
    return { A, D, ball: [0, -0.4] };
  }

  /**
   * Génère les objets d'une formation.
   * opts : { type:'scrum'|'lineout', attack:'blue', defense:'red', dir: 1|-1, size: 4|5|7, numbers:true, ball:true }
   * anchor : [X, Y] en coordonnées SVG (point touché sur le terrain).
   */
  function build(settings, opts, anchor) {
    const spec = fieldSpec(settings);
    const L = spec.lengthM, W = spec.widthM;
    const [ax, ay] = fromSvg(settings, anchor[0], anchor[1]);
    const dir = opts.dir || 1;
    const objects = [];
    const player = (num, color, mx, my) => {
      const [X, Y] = toSvg(settings, Math.max(1, Math.min(L - 1, mx)), Math.max(1, Math.min(W - 1, my)));
      objects.push({ id: uid(), type: 'player', color, jersey: false, x: Math.round(X), y: Math.round(Y), label: opts.numbers === false ? '' : String(num), scale: 0.9 });
    };
    let lay, place;
    if (opts.type === 'lineout') {
      lay = lineoutLayout(opts.size || 7);
      const top = ay < W / 2;                       // ligne de touche la plus proche
      const base = top ? 0 : W, sgn = top ? 1 : -1; // d croît vers l'intérieur du terrain
      place = (dx, dy) => [ax + dx * dir, base + dy * sgn];
    } else {
      lay = scrumLayout();
      const open = ay < W / 2 ? 1 : -1;             // côté ouvert vers le grand côté
      place = (dx, dy) => [ax + dx * dir, ay + dy * open];
    }
    lay.A.forEach(([n, dx, dy]) => { const [mx, my] = place(dx, dy); player(n, opts.attack || 'blue', mx, my); });
    lay.D.forEach(([n, dx, dy]) => { const [mx, my] = place(dx, dy); player(n, opts.defense || 'red', mx, my); });
    if (opts.ball !== false) {
      const [mx, my] = place(lay.ball[0], lay.ball[1]);
      const [X, Y] = toSvg(settings, mx, my);
      objects.push({ id: uid(), type: 'equip', kind: 'ball', x: Math.round(X), y: Math.round(Y), rot: 0, scale: 0.8 });
    }
    return objects;
  }

  /* ---------- Formations personnalisées (enregistrées) ---------- */
  const PT_FIELDS = [['x', 'y'], ['x1', 'y1'], ['x2', 'y2']];

  /** Capture les objets du terrain en coordonnées relatives (mètres, repère paysage) au centre du groupe. */
  function capture(settings, objects) {
    const pts = [];
    objects.forEach(o => {
      PT_FIELDS.forEach(([kx, ky]) => { if (typeof o[kx] === 'number') pts.push(fromSvg(settings, o[kx], o[ky])); });
      (o.points || []).forEach(p => pts.push(fromSvg(settings, p[0], p[1])));
    });
    if (!pts.length) return null;
    const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length, cy = pts.reduce((a, p) => a + p[1], 0) / pts.length;
    const rel = objects.map(o => {
      const c = JSON.parse(JSON.stringify(o)); delete c.id;
      PT_FIELDS.forEach(([kx, ky]) => { if (typeof c[kx] === 'number') { const [mx, my] = fromSvg(settings, c[kx], c[ky]); c[kx] = +(mx - cx).toFixed(2); c[ky] = +(my - cy).toFixed(2); } });
      if (c.points) c.points = c.points.map(p => { const [mx, my] = fromSvg(settings, p[0], p[1]); return [+(mx - cx).toFixed(2), +(my - cy).toFixed(2)]; });
      return c;
    });
    return { version: 1, objects: rel };
  }

  /** Replace une formation capturée autour du point touché (coordonnées SVG). */
  function buildCustom(settings, data, anchor) {
    const [ax, ay] = fromSvg(settings, anchor[0], anchor[1]);
    return (data.objects || []).map(o => {
      const c = JSON.parse(JSON.stringify(o)); c.id = uid();
      PT_FIELDS.forEach(([kx, ky]) => { if (typeof c[kx] === 'number') { const [X, Y] = toSvg(settings, ax + c[kx], ay + c[ky]); c[kx] = Math.round(X); c[ky] = Math.round(Y); } });
      if (c.points) c.points = c.points.map(p => { const [X, Y] = toSvg(settings, ax + p[0], ay + p[1]); return [Math.round(X), Math.round(Y)]; });
      return c;
    });
  }

  global.RugbyFormations = { build, capture, buildCustom };
})(window);

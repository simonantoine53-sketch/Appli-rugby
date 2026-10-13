/* Formations prêtes à placer : mêlée, touche, ruck et engagement. Cotes en mètres, converties selon le terrain. */
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
  /* Ruck : le porteur plaqué au sol, deux soutiens liés au-dessus du ballon, le 9 au pied qui passe,
     puis l'alignement des arrières en escalier côté ouvert. Défense en option. */
  function ruckLayout() {
    const A = [
      [8, 0, 0, 'Plaqué'],
      [6, 3.5, -1.8], [7, 3.5, 1.8],
      [9, -5.4, 1.2],
      [10, -10, 6], [12, -12, 12], [13, -14, 18], [14, -16, 25], [15, -20, 14]
    ];
    // Défense : les deux poteaux de part et d'autre du ruck, une ligne à plat derrière le hors-jeu, l'arrière en couverture
    const D = [
      [1, 6.5, -3.5], [3, 6.5, 3.5],
      [10, 7, 9.5], [12, 7, 15.5], [13, 7, 21.5], [11, 7, 28], [14, 7, -10], [15, 22, 14]
    ];
    return { A, D, ball: [-2.6, 0], pass: [9, 10] };
  }
  /* Engagement en 4-4 : le botteur au centre de la ligne médiane, quatre avants de chaque côté pour la chasse ;
     en face, deux paquets de quatre avants (sauteur, deux lifteurs, un 3e ligne derrière) et les arrières en profondeur. */
  function kickoffLayout() {
    const A = [
      [10, -2.6, 0],
      [2, -1.5, -5.5], [1, -1.5, -10], [4, -1.5, -14.5], [6, -1.5, -19],
      [3, -1.5, 5.5], [8, -1.5, 10], [5, -1.5, 14.5], [7, -1.5, 19],
      [12, -1.5, -25], [11, -1.5, -31], [13, -1.5, 25], [14, -1.5, 31],
      [9, -6, -3], [15, -22, 0]
    ];
    const D = [
      [1, 14, -18.5], [4, 14, -15], [2, 14, -11.5], [6, 17.5, -15],
      [8, 14, 11.5], [5, 14, 15], [3, 14, 18.5], [7, 17.5, 15],
      [9, 19, 0], [12, 18, -26], [13, 18, 26], [10, 27, -5], [11, 31, -23], [14, 31, 23], [15, 39, 4]
    ];
    return { A, D, ball: [0, 0] };
  }

  /**
   * Génère les objets d'une formation.
   * opts : { type:'scrum'|'lineout'|'ruck'|'kickoff', attack:'blue', defense:'red', dir: 1|-1, size: 4|5|7, numbers:true, ball:true, withDefense:false }
   * Pour l'engagement, le point touché est ignoré : tout se place au centre de la ligne médiane.
   * anchor : [X, Y] en coordonnées SVG (point touché sur le terrain).
   */
  function build(settings, opts, anchor) {
    const spec = fieldSpec(settings);
    const L = spec.lengthM, W = spec.widthM;
    const [ax, ay] = fromSvg(settings, anchor[0], anchor[1]);
    let dir = opts.dir || 1;
    const objects = [];
    const player = (num, color, mx, my, name) => {
      if (opts.type === 'kickoff' && (mx < -3 || mx > L + 3)) return;   // demi-terrain : on ne garde que ce qui est visible
      const [X, Y] = toSvg(settings, Math.max(1, Math.min(L - 1, mx)), Math.max(1, Math.min(W - 1, my)));
      const o = { id: uid(), type: 'player', color, jersey: false, x: Math.round(X), y: Math.round(Y), label: opts.numbers === false ? '' : String(num), scale: 0.9 };
      if (name) o.name = name;
      objects.push(o);
    };
    let lay, place;
    if (opts.type === 'kickoff') {
      lay = kickoffLayout();
      // Ligne médiane : au milieu du grand terrain, au bord du demi-terrain (on botte alors vers l'intérieur)
      const mid = L >= 120 ? L / 2 : L;
      if (L < 120) dir = -1;
      place = (dx, dy) => [mid + dx * dir, W / 2 + dy];
    } else if (opts.type === 'ruck') {
      lay = ruckLayout();
      if (!opts.withDefense) lay.D = [];
      const open = ay < W / 2 ? 1 : -1;             // alignement vers le grand côté
      place = (dx, dy) => [ax + dx * dir, ay + dy * open];
    } else if (opts.type === 'lineout') {
      lay = lineoutLayout(opts.size || 7);
      const top = ay < W / 2;                       // ligne de touche la plus proche
      const base = top ? 0 : W, sgn = top ? 1 : -1; // d croît vers l'intérieur du terrain
      place = (dx, dy) => [ax + dx * dir, base + dy * sgn];
    } else {
      lay = scrumLayout();
      const open = ay < W / 2 ? 1 : -1;             // côté ouvert vers le grand côté
      place = (dx, dy) => [ax + dx * dir, ay + dy * open];
    }
    lay.A.forEach(([n, dx, dy, name]) => { const [mx, my] = place(dx, dy); player(n, opts.attack || 'blue', mx, my, name); });
    lay.D.forEach(([n, dx, dy]) => { const [mx, my] = place(dx, dy); player(n, opts.defense || 'red', mx, my); });
    if (lay.pass) {
      // Passe du 9 vers le 10 : flèche pointillée qui part et s'arrête au bord des pastilles
      const at = n => lay.A.find(a => a[0] === n);
      const [a, b] = lay.pass.map(n => place(at(n)[1], at(n)[2]));
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, ux = (b[0] - a[0]) / len, uy = (b[1] - a[1]) / len;
      const [X1, Y1] = toSvg(settings, a[0] + ux * 2, a[1] + uy * 2), [X2, Y2] = toSvg(settings, b[0] - ux * 2.2, b[1] - uy * 2.2);
      objects.push({ id: uid(), type: 'line', style: 'straight', x1: Math.round(X1), y1: Math.round(Y1), x2: Math.round(X2), y2: Math.round(Y2), dashed: true, arrow: true, color: 'white', width: 3 });
    }
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

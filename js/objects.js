/* Rendu SVG des objets du dessin + géométrie (bornes, déplacement, interpolation). */
(function (global) {
  'use strict';

  const { svgEl } = global.RugbyField;
  const { COLORS, SHIRT } = global.RugbyPalette;

  const EQUIP_SIZE = { ball: [30, 18], balls: [40, 30], bag: [18, 40], plot: [26, 16], pole: [16, 40], cone: [26, 34], disc: [22, 14], ring: [32, 32], sled: [48, 26], shield: [30, 40], ladder: [50, 18] };
  const PLAYER_R = 13;

  function colorOf(name) { return COLORS[name] || name || '#ffffff'; }
  function dashAttr(obj) { return obj.dashed ? { 'stroke-dasharray': `${(obj.width || 3) * 2.5} ${(obj.width || 3) * 2}` } : {}; }

  /* ---------- Géométrie des lignes ---------- */
  function linePath(obj) {
    const { x1, y1, x2, y2 } = obj;
    const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len, px = -uy, py = ux;
    const headLen = obj.arrow ? 10 + (obj.width || 3) * 1.5 : 0;
    const bodyLen = Math.max(0, len - headLen * 0.8);
    let d;
    if (obj.style === 'wavy' || obj.style === 'zigzag') {
      const wave = obj.style === 'wavy' ? 18 : 22, amp = obj.style === 'wavy' ? 6 : 7;
      const pts = [];
      const step = obj.style === 'wavy' ? 2 : wave / 2;
      for (let t = 0; t <= bodyLen; t += step) {
        const off = obj.style === 'wavy' ? Math.sin(t / wave * Math.PI * 2) * amp : (Math.round(t / (wave / 2)) % 2 === 0 ? -amp : amp) * (t === 0 ? 0 : 1);
        pts.push([x1 + ux * t + px * off, y1 + uy * t + py * off]);
      }
      pts.push([x1 + ux * bodyLen, y1 + uy * bodyLen]);
      d = 'M' + pts.map(p => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('L');
    } else {
      d = `M${x1} ${y1}L${x1 + ux * bodyLen} ${y1 + uy * bodyLen}`;
    }
    let head = null;
    if (obj.arrow) {
      const hw = headLen * 0.5;
      const bx = x2 - ux * headLen, by = y2 - uy * headLen;
      head = `M${x2} ${y2}L${bx + px * hw} ${by + py * hw}L${bx - px * hw} ${by - py * hw}Z`;
    }
    return { d, head };
  }

  function polyPoints(obj) {
    if (obj.points) return obj.points;
    const { x, y, w, h } = obj;
    return [[x + w * 0.25, y], [x + w, y], [x + w * 0.75, y + h], [x, y + h]];
  }

  function freePath(points) {
    if (!points.length) return '';
    if (points.length < 3) return 'M' + points.map(p => p[0] + ' ' + p[1]).join('L');
    let d = `M${points[0][0]} ${points[0][1]}`;
    for (let i = 1; i < points.length - 1; i++) {
      const mx = (points[i][0] + points[i + 1][0]) / 2, my = (points[i][1] + points[i + 1][1]) / 2;
      d += `Q${points[i][0]} ${points[i][1]} ${mx} ${my}`;
    }
    const last = points[points.length - 1];
    d += `L${last[0]} ${last[1]}`;
    return d;
  }

  /* ---------- Équipement ---------- */
  function equipShape(kind) {
    const O = '#f57c00', OD = '#c45f00';
    switch (kind) {
      case 'ball': return [svgEl('ellipse', { rx: 14, ry: 8, fill: '#fff', stroke: '#333', 'stroke-width': 1.5 }), svgEl('path', { d: 'M-6 0h12M-3 -2v4M0 -2.5v5M3 -2v4', stroke: '#333', 'stroke-width': 1.2, fill: 'none' })];
      case 'balls': return [[-9, 6], [9, 6], [0, -6]].map(p => svgEl('ellipse', { cx: p[0], cy: p[1], rx: 10, ry: 6, fill: '#fff', stroke: '#333', 'stroke-width': 1.3 }));
      case 'bag': return [svgEl('rect', { x: -9, y: -20, width: 18, height: 40, rx: 7, fill: '#1565c0', stroke: '#0d47a1', 'stroke-width': 1.5 }), svgEl('rect', { x: -9, y: -6, width: 18, height: 6, fill: '#fff', opacity: .7 })];
      case 'plot': return [svgEl('ellipse', { cy: 3, rx: 13, ry: 6, fill: O, stroke: OD }), svgEl('ellipse', { cy: -3, rx: 6, ry: 3, fill: '#ffa040', stroke: OD }), svgEl('path', { d: 'M-6 -3v6M6 -3v6', stroke: O, 'stroke-width': 3 })];
      case 'pole': return [svgEl('ellipse', { cy: 16, rx: 8, ry: 4, fill: OD }), svgEl('rect', { x: -2, y: -20, width: 4, height: 36, rx: 2, fill: O })];
      case 'cone': return [svgEl('rect', { x: -13, y: 12, width: 26, height: 5, rx: 2, fill: OD }), svgEl('path', { d: 'M0 -17L11 13H-11z', fill: O }), svgEl('path', { d: 'M-5 -2h10', stroke: '#fff', 'stroke-width': 2 })];
      case 'disc': return [svgEl('ellipse', { cy: 3, rx: 11, ry: 4, fill: O, stroke: OD }), svgEl('path', { d: 'M-5 3l3-7h4l3 7z', fill: '#ffa040' })];
      case 'ring': return [svgEl('circle', { r: 13, fill: 'none', stroke: O, 'stroke-width': 5 })];
      case 'sled': return [svgEl('path', { d: 'M-16 -10v-6M16 -10v-6', stroke: '#e53935', 'stroke-width': 3 }), svgEl('rect', { x: -24, y: -10, width: 48, height: 16, rx: 3, fill: '#e53935', stroke: '#b71c1c' }), svgEl('circle', { cx: -16, cy: 10, r: 3.5, fill: '#333' }), svgEl('circle', { cx: 16, cy: 10, r: 3.5, fill: '#333' })];
      case 'shield': return [svgEl('rect', { x: -15, y: -20, width: 30, height: 40, rx: 5, fill: '#e53935', stroke: '#b71c1c' }), svgEl('path', { d: 'M-8 -17v34M0 -17v34M8 -17v34', stroke: '#fff', 'stroke-width': 2 })];
      case 'ladder': { const items = [svgEl('rect', { x: -25, y: -9, width: 50, height: 18, fill: 'none', stroke: '#fff', 'stroke-width': 2 })]; for (let x = -15; x <= 15; x += 10) items.push(svgEl('line', { x1: x, y1: -9, x2: x, y2: 9, stroke: '#fff', 'stroke-width': 2 })); return items; }
    }
    return [svgEl('circle', { r: 10, fill: '#fff' })];
  }

  /* ---------- Rendu d'un objet ---------- */
  function renderObject(obj) {
    const g = svgEl('g', { 'data-id': obj.id });
    if (obj.opacity !== undefined && obj.opacity < 1) g.setAttribute('opacity', obj.opacity);
    const stroke = colorOf(obj.color || 'white');
    const sw = obj.width || 3;

    switch (obj.type) {
      case 'shape': {
        const common = Object.assign({ fill: stroke, 'fill-opacity': obj.fill ? 0.3 : 0, stroke, 'stroke-width': sw }, dashAttr(obj));
        if (obj.shape === 'circle') g.appendChild(svgEl('ellipse', Object.assign({ cx: obj.x + obj.w / 2, cy: obj.y + obj.h / 2, rx: Math.max(1, obj.w / 2), ry: Math.max(1, obj.h / 2) }, common)));
        else if (obj.shape === 'rect') g.appendChild(svgEl('rect', Object.assign({ x: obj.x, y: obj.y, width: Math.max(1, obj.w), height: Math.max(1, obj.h), rx: 2 }, common)));
        else if (obj.shape === 'tri') g.appendChild(svgEl('path', Object.assign({ d: `M${obj.x + obj.w / 2} ${obj.y}L${obj.x + obj.w} ${obj.y + obj.h}H${obj.x}Z` }, common)));
        else g.appendChild(svgEl('polygon', Object.assign({ points: polyPoints(obj).map(p => p.join(',')).join(' ') }, common)));
        // zone de clic transparente (pour les formes non remplies)
        if (!obj.fill) {
          const hit = g.firstChild.cloneNode();
          hit.setAttribute('stroke', 'transparent'); hit.setAttribute('stroke-width', 14); hit.setAttribute('fill', 'none'); hit.removeAttribute('stroke-dasharray');
          g.appendChild(hit);
        }
        break;
      }
      case 'line': {
        const { d, head } = linePath(obj);
        g.appendChild(svgEl('path', { d, stroke: 'transparent', 'stroke-width': 16, fill: 'none' }));
        g.appendChild(svgEl('path', Object.assign({ d, stroke, 'stroke-width': sw, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, dashAttr(obj))));
        if (head) g.appendChild(svgEl('path', { d: head, fill: stroke }));
        break;
      }
      case 'free': {
        const d = freePath(obj.points);
        g.appendChild(svgEl('path', { d, stroke: 'transparent', 'stroke-width': 16, fill: 'none' }));
        g.appendChild(svgEl('path', Object.assign({ d, stroke, 'stroke-width': sw, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, dashAttr(obj))));
        break;
      }
      case 'text': {
        const size = obj.size || 18;
        const t = svgEl('text', { x: obj.x, y: obj.y, 'font-size': size, 'font-weight': 700, fill: stroke, stroke: stroke === '#ffffff' ? 'rgba(0,0,0,.45)' : 'rgba(255,255,255,.7)', 'stroke-width': 3, 'paint-order': 'stroke', 'font-family': 'Arial, Helvetica, sans-serif', 'dominant-baseline': 'middle' });
        const lines = String(obj.text || '').split('\n');
        lines.forEach((ln, i) => t.appendChild(svgEl('tspan', { x: obj.x, dy: i === 0 ? 0 : size * 1.2 }, [ln || ' '])));
        g.appendChild(t);
        break;
      }
      case 'equip': {
        const sc = obj.scale || 1;
        const inner = svgEl('g', { transform: `translate(${obj.x} ${obj.y}) rotate(${obj.rot || 0}) scale(${sc})` }, equipShape(obj.kind));
        const [w, h] = EQUIP_SIZE[obj.kind] || [30, 30];
        inner.insertBefore(svgEl('rect', { x: -w / 2, y: -h / 2, width: w, height: h, fill: 'transparent' }), inner.firstChild);
        g.appendChild(inner);
        break;
      }
      case 'player': {
        const fill = colorOf(obj.color);
        const sc = obj.scale || 1;
        const textFill = (obj.color === 'yellow' || obj.color === 'white') ? '#222' : '#fff';
        const inner = svgEl('g', { transform: `translate(${obj.x} ${obj.y}) scale(${sc})` });
        if (obj.jersey) {
          inner.appendChild(svgEl('path', { d: SHIRT, transform: 'translate(-16 -16) scale(1.15)', fill, stroke: 'rgba(0,0,0,.35)', 'stroke-width': 1 }));
          if (obj.label) inner.appendChild(svgEl('text', { y: 7, 'text-anchor': 'middle', 'font-size': 12, 'font-weight': 700, fill: textFill, 'font-family': 'Arial, sans-serif' }, [String(obj.label)]));
        } else {
          inner.appendChild(svgEl('circle', { r: PLAYER_R, fill, stroke: '#fff', 'stroke-width': 2.5 }));
          if (obj.label) inner.appendChild(svgEl('text', { y: 0, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': 12, 'font-weight': 700, fill: textFill, 'font-family': 'Arial, sans-serif' }, [String(obj.label)]));
        }
        g.appendChild(inner);
        break;
      }
    }
    return g;
  }

  /* ---------- Bornes & déplacements ---------- */
  function bounds(obj) {
    switch (obj.type) {
      case 'shape': {
        if (obj.shape === 'poly' && obj.points) {
          const xs = obj.points.map(p => p[0]), ys = obj.points.map(p => p[1]);
          const x = Math.min(...xs), y = Math.min(...ys);
          return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
        }
        return { x: obj.x, y: obj.y, w: obj.w, h: obj.h };
      }
      case 'line': return { x: Math.min(obj.x1, obj.x2), y: Math.min(obj.y1, obj.y2), w: Math.abs(obj.x2 - obj.x1), h: Math.abs(obj.y2 - obj.y1) };
      case 'free': {
        const xs = obj.points.map(p => p[0]), ys = obj.points.map(p => p[1]);
        const x = Math.min(...xs), y = Math.min(...ys);
        return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
      }
      case 'text': {
        const size = obj.size || 18, lines = String(obj.text || '').split('\n');
        const w = Math.max(...lines.map(l => l.length)) * size * 0.6;
        return { x: obj.x - 2, y: obj.y - size * 0.6, w: w + 4, h: size * 1.2 * lines.length };
      }
      case 'equip': { const [w, h] = EQUIP_SIZE[obj.kind] || [30, 30]; const s = Math.max(w, h) * (obj.scale || 1); return { x: obj.x - s / 2, y: obj.y - s / 2, w: s, h: s }; }
      case 'player': { const s = (obj.jersey ? 40 : PLAYER_R * 2 + 4) * (obj.scale || 1); return { x: obj.x - s / 2, y: obj.y - s / 2, w: s, h: s }; }
    }
    return { x: 0, y: 0, w: 0, h: 0 };
  }

  function move(obj, dx, dy) {
    if (obj.type === 'line') { obj.x1 += dx; obj.y1 += dy; obj.x2 += dx; obj.y2 += dy; }
    else if (obj.type === 'free' || (obj.type === 'shape' && obj.points)) { obj.points = obj.points.map(p => [p[0] + dx, p[1] + dy]); }
    else { obj.x += dx; obj.y += dy; }
  }

  /* ---------- Trajectoires ---------- */
  const SNAP = 30; // distance (px) pour associer un tracé à un objet

  /** Points d'une ligne/tracé libre avec abscisses curvilignes. */
  function pathSamples(line) {
    const pts = line.type === 'free' ? line.points : [[line.x1, line.y1], [line.x2, line.y2]];
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    return { pts, cum, len: cum[cum.length - 1] || 1 };
  }
  function pointAt(samples, t) {
    const d = t * samples.len, { pts, cum } = samples;
    let i = 1; while (i < cum.length - 1 && cum[i] < d) i++;
    const seg = cum[i] - cum[i - 1] || 1, k = Math.max(0, Math.min(1, (d - cum[i - 1]) / seg));
    return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k];
  }

  /** Cherche un tracé (ligne, flèche, tracé libre) qui part de l'objet a et arrive à l'objet b. */
  function findPath(a, b, candidates) {
    if (typeof a.x !== 'number' || typeof b.x !== 'number' || !candidates) return null;
    let best = null, bestScore = Infinity;
    candidates.forEach(l => {
      if (l.type !== 'line' && l.type !== 'free') return;
      const s = pathSamples(l); if (s.pts.length < 2) return;
      const p0 = s.pts[0], p1 = s.pts[s.pts.length - 1];
      const d0 = Math.hypot(p0[0] - a.x, p0[1] - a.y), d1 = Math.hypot(p1[0] - b.x, p1[1] - b.y);
      if (d0 < SNAP && d1 < SNAP && d0 + d1 < bestScore) { bestScore = d0 + d1; best = s; }
    });
    return best;
  }

  /** Interpolation entre deux versions d'un même objet (aperçu animé).
   *  pathsFrom : objets de l'étape de départ, pour suivre une course dessinée. */
  function lerpObject(a, b, t, pathsFrom) {
    const out = JSON.parse(JSON.stringify(b));
    ['x', 'y', 'w', 'h', 'x1', 'y1', 'x2', 'y2', 'rot', 'scale', 'size'].forEach(k => {
      if (typeof a[k] === 'number' && typeof b[k] === 'number') out[k] = a[k] + (b[k] - a[k]) * t;
    });
    if (a.points && b.points && a.points.length === b.points.length) out.points = b.points.map((p, i) => [a.points[i][0] + (p[0] - a.points[i][0]) * t, a.points[i][1] + (p[1] - a.points[i][1]) * t]);
    const path = (a.type === 'player' || a.type === 'equip') && findPath(a, b, pathsFrom);
    if (path) {
      // on suit le tracé, en ajoutant l'écart entre le tracé et sa corde au déplacement rectiligne
      const p = pointAt(path, t), p0 = path.pts[0], p1 = path.pts[path.pts.length - 1];
      out.x += p[0] - (p0[0] + (p1[0] - p0[0]) * t);
      out.y += p[1] - (p0[1] + (p1[1] - p0[1]) * t);
    }
    return out;
  }

  global.RugbyObjects = { renderObject, bounds, move, lerpObject, polyPoints, EQUIP_SIZE, PLAYER_R, colorOf };
})(window);

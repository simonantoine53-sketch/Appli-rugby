/* Export animé : génération des images intermédiaires, encodeur GIF (LZW) et vidéo WebM. */
(function (global) {
  'use strict';

  const { fieldSpec } = global.RugbyField;
  const { lerpObject } = global.RugbyObjects;
  const clone = o => JSON.parse(JSON.stringify(o));
  const ease = t => t < .5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

  /** Liste des images (listes d'objets) pour toute l'animation, à intervalle dt (ms). */
  function buildFrames(drawing, dt) {
    const steps = drawing.steps;
    const hold = drawing.settings.stepDuration || 1200;
    const trans = Math.max(200, hold * 0.7);
    const frames = [];
    const push = objs => frames.push(objs);
    steps.forEach((st, i) => {
      for (let t = 0; t < hold; t += dt) push(st.objects);
      const next = steps[i + 1];
      if (!next) return;
      const a = st.objects, b = next.objects;
      for (let t = dt; t < trans; t += dt) {
        const e = ease(t / trans), list = [];
        a.forEach(o => { if (!b.find(x => x.id === o.id)) list.push(Object.assign(clone(o), { opacity: 1 - e })); });
        b.forEach(o => { const prev = a.find(x => x.id === o.id); list.push(prev ? lerpObject(prev, o, e) : Object.assign(clone(o), { opacity: e })); });
        push(list);
      }
    });
    return frames;
  }

  /** Rasterise une scène SVG dans un canvas (promesse). */
  function rasterize(svgEl, W, H, scale) {
    return new Promise((resolve, reject) => {
      svgEl.setAttribute('width', W); svgEl.setAttribute('height', H);
      const xml = new XMLSerializer().serializeToString(svgEl);
      const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml;charset=utf-8' }));
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = Math.round(W * scale); c.height = Math.round(H * scale);
        const ctx = c.getContext('2d'); ctx.scale(scale, scale); ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(url); resolve(c);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('rasterize')); };
      img.src = url;
    });
  }

  /* ---------- Encodeur GIF ---------- */
  /** Palette adaptative : les 256 couleurs les plus fréquentes de quelques images clés. */
  function buildPalette(canvases) {
    const counts = new Map();
    const picks = [0, Math.floor(canvases.length / 2), canvases.length - 1];
    picks.forEach(i => {
      const c = canvases[i], d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      for (let j = 0; j < d.length; j += 4) { const k = (d[j] << 16) | (d[j + 1] << 8) | d[j + 2]; counts.set(k, (counts.get(k) || 0) + 1); }
    });
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 256).map(e => e[0]);
    while (top.length < 256) top.push(0);
    return top;
  }
  function makeIndexer(palette) {
    const cache = new Map();
    palette.forEach((c, i) => { if (!cache.has(c)) cache.set(c, i); });
    const pr = palette.map(c => c >> 16), pg = palette.map(c => (c >> 8) & 255), pb = palette.map(c => c & 255);
    return (r, g, b) => {
      const k = (r << 16) | (g << 8) | b;
      let idx = cache.get(k);
      if (idx !== undefined) return idx;
      let best = 0, bd = Infinity;
      for (let i = 0; i < 256; i++) { const dr = pr[i] - r, dg = pg[i] - g, db = pb[i] - b, d = dr * dr + dg * dg + db * db; if (d < bd) { bd = d; best = i; } }
      cache.set(k, best); return best;
    };
  }

  class ByteWriter {
    constructor() { this.chunks = []; this.buf = new Uint8Array(1 << 16); this.pos = 0; }
    byte(v) { if (this.pos === this.buf.length) { this.chunks.push(this.buf); this.buf = new Uint8Array(1 << 16); this.pos = 0; } this.buf[this.pos++] = v & 255; }
    bytes(arr) { for (let i = 0; i < arr.length; i++) this.byte(arr[i]); }
    short(v) { this.byte(v & 255); this.byte((v >> 8) & 255); }
    str(s) { for (let i = 0; i < s.length; i++) this.byte(s.charCodeAt(i)); }
    result() { this.chunks.push(this.buf.subarray(0, this.pos)); return new Blob(this.chunks, { type: 'image/gif' }); }
  }

  /** Compression LZW d'une suite d'index (taille de code minimale 8), émise en sous-blocs. */
  function lzwEncode(indices, out) {
    const MIN = 8, CLEAR = 256, EOI = 257;
    let codeSize = MIN + 1, next = 258, dict = new Map();
    let bitBuf = 0, bitCnt = 0;
    const block = new Uint8Array(255); let blockLen = 0;
    const flushBlock = () => { if (blockLen) { out.byte(blockLen); out.bytes(block.subarray(0, blockLen)); blockLen = 0; } };
    const emit = code => {
      bitBuf |= code << bitCnt; bitCnt += codeSize;
      while (bitCnt >= 8) { block[blockLen++] = bitBuf & 255; bitBuf >>>= 8; bitCnt -= 8; if (blockLen === 255) flushBlock(); }
    };
    emit(CLEAR);
    let prefix = indices[0];
    for (let i = 1; i < indices.length; i++) {
      const k = indices[i], key = (prefix << 8) | k;
      const found = dict.get(key);
      if (found !== undefined) { prefix = found; continue; }
      emit(prefix);
      if (next < 4096) { dict.set(key, next++); if (next - 1 === (1 << codeSize) && codeSize < 12) codeSize++; }
      else { emit(CLEAR); dict = new Map(); next = 258; codeSize = MIN + 1; }
      prefix = k;
    }
    emit(prefix); emit(EOI);
    if (bitCnt > 0) { block[blockLen++] = bitBuf & 255; if (blockLen === 255) flushBlock(); }
    flushBlock();
    out.byte(0);
  }

  function encodeGif(canvases, delayMs) {
    const W = canvases[0].width, H = canvases[0].height;
    const out = new ByteWriter();
    out.str('GIF89a');
    out.short(W); out.short(H); out.byte(0xF7); out.byte(0); out.byte(0);
    const palette = buildPalette(canvases), quantize = makeIndexer(palette);
    palette.forEach(c => out.bytes([c >> 16, (c >> 8) & 255, c & 255]));
    // Boucle infinie (extension Netscape)
    out.bytes([0x21, 0xFF, 0x0B]); out.str('NETSCAPE2.0'); out.bytes([3, 1, 0, 0, 0]);
    const delay = Math.max(2, Math.round(delayMs / 10));
    const indices = new Uint8Array(W * H);
    canvases.forEach(c => {
      const data = c.getContext('2d').getImageData(0, 0, W, H).data;
      for (let i = 0, j = 0; i < data.length; i += 4, j++) indices[j] = quantize(data[i], data[i + 1], data[i + 2]);
      out.bytes([0x21, 0xF9, 4, 0x04]); out.short(delay); out.byte(0); out.byte(0);
      out.byte(0x2C); out.short(0); out.short(0); out.short(W); out.short(H); out.byte(0);
      out.byte(8);
      lzwEncode(indices, out);
    });
    out.byte(0x3B);
    return out.result();
  }

  /** Export GIF animé. sceneFn(settings, objects) renvoie un <svg>. */
  async function exportGif(drawing, sceneFn, onProgress) {
    const spec = fieldSpec(drawing.settings);
    const dt = 60, scale = Math.min(1, 800 / spec.W);
    const frames = buildFrames(drawing, dt);
    const canvases = [];
    for (let i = 0; i < frames.length; i++) {
      canvases.push(await rasterize(sceneFn(drawing.settings, frames[i]), spec.W, spec.H, scale));
      if (onProgress) onProgress((i + 1) / frames.length * 0.8);
    }
    const blob = encodeGif(canvases, dt);
    if (onProgress) onProgress(1);
    return blob;
  }

  /** Export vidéo WebM via MediaRecorder (temps réel). */
  function exportWebm(drawing, sceneFn, onProgress) {
    return new Promise(async (resolve, reject) => {
      if (typeof MediaRecorder === 'undefined' || !HTMLCanvasElement.prototype.captureStream) return reject(new Error('Vidéo non prise en charge par ce navigateur.'));
      const spec = fieldSpec(drawing.settings);
      const dt = 50, scale = 2;
      const frames = buildFrames(drawing, dt);
      const canvas = document.createElement('canvas');
      canvas.width = spec.W * scale; canvas.height = spec.H * scale;
      const ctx = canvas.getContext('2d');
      // Pré-rendu de toutes les images pour un enregistrement fluide
      const imgs = [];
      for (let i = 0; i < frames.length; i++) {
        imgs.push(await rasterize(sceneFn(drawing.settings, frames[i]), spec.W, spec.H, scale));
        if (onProgress) onProgress((i + 1) / frames.length * 0.5);
      }
      const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find(m => MediaRecorder.isTypeSupported(m)) || '';
      const stream = canvas.captureStream(1000 / dt);
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 4e6 } : undefined);
      const chunks = [];
      rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
      rec.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' }));
      rec.onerror = e => reject(e.error || new Error('MediaRecorder'));
      ctx.drawImage(imgs[0], 0, 0);
      rec.start(200);
      let i = 0;
      const t0 = performance.now();
      const tick = () => {
        const idx = Math.min(imgs.length - 1, Math.floor((performance.now() - t0) / dt));
        while (i <= idx) { ctx.drawImage(imgs[i], 0, 0); i++; }
        if (onProgress) onProgress(0.5 + idx / imgs.length * 0.5);
        if (idx < imgs.length - 1) requestAnimationFrame(tick);
        else setTimeout(() => rec.stop(), 300);
      };
      requestAnimationFrame(tick);
    });
  }

  global.RugbyExport = { buildFrames, rasterize, encodeGif, exportGif, exportWebm };
})(window);

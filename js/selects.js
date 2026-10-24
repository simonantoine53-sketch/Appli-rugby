/* Listes déroulantes aux couleurs de l'appli, partout sur le site.
   Le <select> natif reste en place (valeur, événements, mise en page) : on remplace seulement le menu
   qui s'ouvre (celui du système) par un menu de l'appli, sur ordinateur comme sur mobile.
   Fonctionne pour toutes les listes, y compris celles créées plus tard par le code. */
(function () {
  'use strict';

  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const CHECK = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const usable = s => s && s.tagName === 'SELECT' && !s.disabled && !s.multiple && !(s.size > 1) && !('native' in s.dataset);
  const isSheet = () => window.matchMedia('(max-width: 600px)').matches;

  let cur = null;   // { sel, pop, back, onDoc }

  /** Libellé affiché en titre du volet mobile : aria-label, title ou texte du <label>. */
  function titleOf(sel) {
    const lab = sel.closest('label');
    const txt = lab ? [...lab.childNodes].filter(n => n.nodeType === 3 || (n.nodeType === 1 && n !== sel && n.tagName !== 'SELECT')).map(n => n.textContent).join(' ').trim() : '';
    return sel.getAttribute('aria-label') || txt || sel.title || '';
  }

  function open(sel) {
    close(false);
    const sheet = isSheet();
    const pop = document.createElement('div');
    pop.className = 'rs-pop' + (sheet ? ' sheet' : '');
    pop.setAttribute('role', 'listbox');
    pop.tabIndex = -1;
    if (sheet) {
      const t = titleOf(sel);
      if (t) pop.appendChild(Object.assign(document.createElement('div'), { className: 'rs-title', textContent: t }));
    }
    const list = document.createElement('div'); list.className = 'rs-list';
    let idx = 0;
    const addOption = o => {
      const i = idx++;
      if (o.hidden) return;
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'rs-opt' + (i === sel.selectedIndex ? ' on' : '');
      b.setAttribute('role', 'option'); b.setAttribute('aria-selected', String(i === sel.selectedIndex));
      b.dataset.i = i; b.disabled = o.disabled;
      b.innerHTML = `<span>${esc(o.dataset.full || o.textContent)}</span>${i === sel.selectedIndex ? CHECK : ''}`;   // nom complet dans la liste, même si l'en-tête montre un diminutif
      b.onclick = e => { e.stopPropagation(); choose(sel, i); };
      list.appendChild(b);
    };
    [...sel.children].forEach(c => {
      if (c.tagName === 'OPTGROUP') { list.appendChild(Object.assign(document.createElement('div'), { className: 'rs-group', textContent: c.label })); [...c.children].forEach(addOption); }
      else if (c.tagName === 'OPTION') addOption(c);
    });
    pop.appendChild(list);
    let back = null;
    if (sheet) { back = document.createElement('div'); back.className = 'rs-back'; back.onclick = () => close(true); document.body.appendChild(back); }
    document.body.appendChild(pop);
    sel.setAttribute('aria-expanded', 'true');
    if (!sheet) place(sel, pop);
    const on = list.querySelector('.rs-opt.on') || list.querySelector('.rs-opt:not(:disabled)');
    if (on) { on.focus({ preventScroll: true }); on.scrollIntoView({ block: 'nearest' }); }
    const onDoc = e => { if (!pop.contains(e.target) && e.target !== sel) close(false); };
    const onScroll = e => { if (!pop.contains(e.target)) close(false); };
    setTimeout(() => { document.addEventListener('pointerdown', onDoc, true); }, 0);
    if (!sheet) { window.addEventListener('scroll', onScroll, true); window.addEventListener('resize', onScroll); }
    pop.addEventListener('keydown', e => keys(e, sel, list));
    cur = { sel, pop, back, onDoc, onScroll };
  }

  /** Sous la liste, ou au-dessus s'il n'y a pas la place ; jamais hors de l'écran. alignRight : aligné sur le bord droit (menus ⋯). */
  function place(sel, pop, alignRight) {
    const r = sel.getBoundingClientRect();
    const w = Math.min(innerWidth - 16, Math.max(r.width, alignRight ? 240 : 200));
    pop.style.width = w + 'px';
    const left = alignRight ? r.right - w : r.left;
    pop.style.left = Math.max(8, Math.min(left, innerWidth - w - 8)) + 'px';
    const below = innerHeight - r.bottom - 12, above = r.top - 12;
    const h = Math.min(pop.scrollHeight, 320);
    if (below < h && above > below) { pop.style.maxHeight = Math.min(320, above) + 'px'; pop.style.top = (r.top - Math.min(h, above) - 6) + 'px'; }
    else { pop.style.maxHeight = Math.min(320, below) + 'px'; pop.style.top = (r.bottom + 6) + 'px'; }
  }

  function choose(sel, i) {
    if (sel.selectedIndex !== i) {
      sel.selectedIndex = i;
      sel.dispatchEvent(new Event('input', { bubbles: true }));
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }
    close(true);
  }

  function close(refocus) {
    if (!cur) return;
    const { sel, pop, back, onDoc, onScroll } = cur;
    cur = null;
    document.removeEventListener('pointerdown', onDoc, true);
    window.removeEventListener('scroll', onScroll, true); window.removeEventListener('resize', onScroll);
    pop.remove(); if (back) back.remove();
    sel.setAttribute('aria-expanded', 'false');
    if (refocus && document.contains(sel)) sel.focus({ preventScroll: true });
  }

  let typed = '', typedAt = 0;
  function keys(e, sel, list) {
    const opts = [...list.querySelectorAll('.rs-opt:not(:disabled)')];
    const i = opts.indexOf(document.activeElement);
    const go = j => { const o = opts[Math.max(0, Math.min(opts.length - 1, j))]; if (o) { o.focus(); o.scrollIntoView({ block: 'nearest' }); } };
    if (e.key === 'ArrowDown') { e.preventDefault(); go(i + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); go(i - 1); }
    else if (e.key === 'Home') { e.preventDefault(); go(0); }
    else if (e.key === 'End') { e.preventDefault(); go(opts.length - 1); }
    else if (e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); e.stopPropagation(); close(true); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (opts[i]) choose(sel, +opts[i].dataset.i); }
    else if (e.key.length === 1) {
      // Saisie au clavier : va à la première option qui commence par les lettres tapées
      const now = Date.now(); typed = now - typedAt > 700 ? e.key.toLowerCase() : typed + e.key.toLowerCase(); typedAt = now;
      const j = opts.findIndex(o => o.textContent.trim().toLowerCase().startsWith(typed));
      if (j >= 0) go(j);
    }
    e.stopPropagation();
  }

  // Ouverture : souris, doigt et clavier, pour toutes les listes de la page
  document.addEventListener('mousedown', e => {
    const sel = e.target.closest && e.target.closest('select');
    if (!usable(sel) || e.button !== 0) return;
    e.preventDefault();
    if (cur && cur.sel === sel) { close(true); return; }
    sel.focus({ preventScroll: true });
    open(sel);
  }, true);
  // Au doigt : on ouvre sur un appui court (pas sur un glissement, pour laisser la page défiler) ;
  // annuler la fin du toucher empêche aussi le sélecteur natif du téléphone de s'ouvrir.
  let touch = null;
  document.addEventListener('touchstart', e => {
    const sel = e.target.closest && e.target.closest('select');
    touch = usable(sel) ? { sel, x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() } : null;
  }, { capture: true, passive: true });
  document.addEventListener('touchend', e => {
    if (!touch) return;
    const { sel, x, y } = touch; touch = null;
    const p = e.changedTouches[0];
    if (Math.hypot(p.clientX - x, p.clientY - y) > 10) return;   // c'était un défilement
    e.preventDefault();
    if (cur && cur.sel === sel) { close(true); return; }
    open(sel);
  }, { capture: true, passive: false });
  document.addEventListener('keydown', e => {
    const sel = e.target;
    if (!usable(sel) || cur) return;
    if ([' ', 'Enter', 'ArrowDown', 'ArrowUp'].includes(e.key) || (e.altKey && e.key === 'ArrowDown')) { e.preventDefault(); e.stopPropagation(); open(sel); }
  }, true);

  /** Menu d'actions (bouton « ⋯ ») : même style que les listes ; items = [[libellé, action, 'danger'?], …]. */
  function openMenu(anchor, items, title) {
    const again = cur && cur.sel === anchor;
    close(false);
    if (again) return;
    const sheet = isSheet();
    const pop = document.createElement('div');
    pop.className = 'rs-pop rs-menu' + (sheet ? ' sheet' : '');
    pop.setAttribute('role', 'menu'); pop.tabIndex = -1;
    if (sheet && title) pop.appendChild(Object.assign(document.createElement('div'), { className: 'rs-title', textContent: title }));
    const list = document.createElement('div'); list.className = 'rs-list';
    items.forEach(([label, fn, cls], i) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'rs-opt' + (cls ? ' ' + cls : ''); b.setAttribute('role', 'menuitem'); b.dataset.i = i;
      b.innerHTML = `<span>${esc(label)}</span>`;
      b.onclick = e => { e.stopPropagation(); close(false); fn(); };
      list.appendChild(b);
    });
    pop.appendChild(list);
    let back = null;
    if (sheet) { back = document.createElement('div'); back.className = 'rs-back'; back.onclick = () => close(true); document.body.appendChild(back); }
    document.body.appendChild(pop);
    anchor.setAttribute('aria-expanded', 'true');
    if (!sheet) place(anchor, pop, true);
    const first = list.querySelector('.rs-opt'); if (first) first.focus({ preventScroll: true });
    const onDoc = e => { if (!pop.contains(e.target) && !anchor.contains(e.target)) close(false); };
    const onScroll = e => { if (!pop.contains(e.target)) close(false); };
    setTimeout(() => { document.addEventListener('pointerdown', onDoc, true); }, 0);
    if (!sheet) { window.addEventListener('scroll', onScroll, true); window.addEventListener('resize', onScroll); }
    pop.addEventListener('keydown', e => {
      const opts = [...list.querySelectorAll('.rs-opt')], i = opts.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); (opts[i + 1] || opts[0]).focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); (opts[i - 1] || opts[opts.length - 1]).focus(); }
      else if (e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); close(true); }
      e.stopPropagation();
    });
    cur = { sel: anchor, pop, back, onDoc, onScroll };
  }

  window.RugbySelect = { open, close, openMenu };
})();

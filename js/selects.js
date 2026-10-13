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
      b.innerHTML = `<span>${esc(o.textContent)}</span>${i === sel.selectedIndex ? CHECK : ''}`;
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

  /** Sous la liste, ou au-dessus s'il n'y a pas la place ; même largeur au minimum. */
  function place(sel, pop) {
    const r = sel.getBoundingClientRect();
    const w = Math.max(r.width, 200);
    pop.style.width = w + 'px';
    pop.style.left = Math.max(8, Math.min(r.left, innerWidth - w - 8)) + 'px';
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
  document.addEventListener('touchstart', e => {
    const sel = e.target.closest && e.target.closest('select');
    if (!usable(sel)) return;
    e.preventDefault();
    if (cur && cur.sel === sel) { close(true); return; }
    open(sel);
  }, { capture: true, passive: false });
  document.addEventListener('keydown', e => {
    const sel = e.target;
    if (!usable(sel) || cur) return;
    if ([' ', 'Enter', 'ArrowDown', 'ArrowUp'].includes(e.key) || (e.altKey && e.key === 'ArrowDown')) { e.preventDefault(); e.stopPropagation(); open(sel); }
  }, true);

  window.RugbySelect = { open, close };
})();

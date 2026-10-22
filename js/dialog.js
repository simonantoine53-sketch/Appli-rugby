/* Fenêtres de dialogue de l'appli : remplacent les fenêtres grises du navigateur (confirm, prompt).
   RugbyDialog.confirm(message, options) → Promise<boolean>
   RugbyDialog.prompt(libellé, valeur, options) → Promise<string | null>
   RugbyDialog.copy(texte, options)       → affiche un texte à copier (bouton « Copier »)
   RugbyDialog.choose(titre, message, [{ value, label, sub }]) → Promise<value | null> (un bouton par choix) */
(function () {
  'use strict';

  let box = null, done = null;
  /** Créée au premier usage, pour rester hors des gestionnaires génériques des autres fenêtres. */
  function build() {
    if (box) return box;
    box = document.createElement('div');
    box.className = 'modal hidden dialog-modal';
    box.innerHTML = `<div class="modal-box dialog-box" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
      <div class="modal-head"><strong id="dialog-title"></strong></div>
      <form class="form dialog-form" novalidate>
        <p class="dialog-msg"></p>
        <label class="dialog-field"><span class="dialog-label"></span><input class="dialog-input" type="text" autocomplete="off"></label>
        <textarea class="dialog-text admin-textarea" readonly rows="4"></textarea>
        <div class="dialog-choices"></div>
        <div class="dialog-actions"><button type="button" class="btn outline dialog-cancel">Annuler</button><button type="submit" class="btn primary dialog-ok">OK</button></div>
      </form></div>`;
    document.body.appendChild(box);
    box.addEventListener('click', e => { if (e.target === box) finish(null); });
    box.querySelector('.dialog-cancel').onclick = () => finish(null);
    box.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); finish(null); } e.stopPropagation(); });
    return box;
  }
  function finish(value) {
    if (!box || !done) return;
    const d = done; done = null;
    box.classList.add('hidden');
    d(value);
  }
  /** mode : 'confirm' | 'prompt' | 'copy' */
  function show(mode, o) {
    build();
    if (done) finish(null);
    const $ = s => box.querySelector(s);
    $('#dialog-title').textContent = o.title || (mode === 'confirm' ? 'Confirmer' : mode === 'copy' ? 'À copier' : '');
    $('.dialog-msg').textContent = o.message || '';
    $('.dialog-msg').classList.toggle('hidden', !o.message);
    const field = $('.dialog-field'), input = $('.dialog-input'), text = $('.dialog-text');
    field.classList.toggle('hidden', mode !== 'prompt');
    text.classList.toggle('hidden', mode !== 'copy');
    $('.dialog-label').textContent = o.label || '';
    input.value = o.value == null ? '' : o.value; input.placeholder = o.placeholder || ''; input.maxLength = o.maxLength || 120;
    text.value = o.text || '';
    const choices = $('.dialog-choices');
    choices.replaceChildren(...(o.choices || []).map(c => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'btn outline two-lines';
      b.textContent = c.label;
      if (c.sub) { const sm = document.createElement('small'); sm.textContent = c.sub; b.appendChild(sm); }
      b.onclick = () => finish(c.value);
      return b;
    }));
    choices.classList.toggle('hidden', mode !== 'choose');
    const ok = $('.dialog-ok'), cancel = $('.dialog-cancel');
    ok.classList.toggle('hidden', mode === 'choose');
    ok.textContent = o.ok || (mode === 'confirm' ? 'Confirmer' : mode === 'copy' ? 'Copier' : 'Valider');
    ok.classList.toggle('danger-solid', !!o.danger);
    cancel.textContent = mode === 'copy' ? 'Fermer' : (o.cancel || 'Annuler');
    $('.dialog-form').onsubmit = e => {
      e.preventDefault();
      if (mode === 'prompt') { const v = input.value.trim(); if (!v && o.required !== false) { input.focus(); return; } finish(v); }
      else if (mode === 'copy') {
        const done2 = () => { ok.textContent = 'Copié ✓'; setTimeout(() => finish(true), 600); };
        if (navigator.clipboard) navigator.clipboard.writeText(text.value).then(done2, () => { text.select(); });
        else { text.select(); document.execCommand && document.execCommand('copy'); done2(); }
      } else finish(true);
    };
    box.classList.remove('hidden');
    requestAnimationFrame(() => { if (mode === 'prompt') { input.focus(); input.select(); } else if (mode === 'copy') { text.focus(); text.select(); } else if (mode === 'choose') { const c = choices.querySelector('button'); if (c) c.focus(); } else ok.focus(); });
    return new Promise(resolve => { done = resolve; });
  }

  window.RugbyDialog = {
    confirm: (message, o) => {
      // Le bouton reprend le verbe de la question (« Supprimer … ? » → « Supprimer »), en rouge s'il est destructif
      const verb = (String(message).match(/^(Supprimer|Retirer|Refuser|Effacer|Quitter|Annuler|Générer|Donner|Arrêter)/) || [])[1];
      const opts = Object.assign({ message, ok: verb, cancel: verb === 'Annuler' ? 'Retour' : undefined, danger: /^(Supprimer|Retirer|Refuser|Effacer|Quitter|Annuler|Arrêter)/.test(message) }, o || {});
      return show('confirm', opts).then(v => v === true);
    },
    prompt: (label, value, o) => show('prompt', Object.assign({ label, value }, o || {})),
    copy: (text, o) => show('copy', Object.assign({ text }, o || {})),
    choose: (title, message, choices) => show('choose', { title, message, choices })
  };

  /** Carte ou ligne qui s'ouvre au clic : aussi au clavier (Tab puis Entrée ou Espace) et annoncée comme un bouton. */
  window.RugbyA11y = {
    clickable(node, label) {
      if (!node || node.dataset.kbd) return node;
      node.dataset.kbd = '1'; node.tabIndex = 0; node.setAttribute('role', 'button');
      if (label) node.setAttribute('aria-label', label);
      node.addEventListener('keydown', e => {
        if (e.target !== node || (e.key !== 'Enter' && e.key !== ' ')) return;
        e.preventDefault(); node.click();
      });
      return node;
    }
  };
})();

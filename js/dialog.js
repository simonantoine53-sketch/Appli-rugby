/* Fenêtres de dialogue de l'appli : remplacent les fenêtres grises du navigateur (confirm, prompt).
   RugbyDialog.confirm(message, options) → Promise<boolean>
   RugbyDialog.prompt(libellé, valeur, options) → Promise<string | null>
   RugbyDialog.copy(texte, options)       → affiche un texte à copier (bouton « Copier ») */
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
    const ok = $('.dialog-ok'), cancel = $('.dialog-cancel');
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
    requestAnimationFrame(() => { if (mode === 'prompt') { input.focus(); input.select(); } else if (mode === 'copy') { text.focus(); text.select(); } else ok.focus(); });
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
    copy: (text, o) => show('copy', Object.assign({ text }, o || {}))
  };
})();

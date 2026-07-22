const FOCUSABLE_SELECTOR = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Piège le focus clavier à l'intérieur de modalEl : déplace le focus dessus,
 * boucle Tab/Shift+Tab entre ses éléments, et appelle onEscape() sur Échap.
 * Retourne une fonction à appeler à la fermeture du modal, qui restaure le
 * focus sur l'élément qui l'avait déclenché.
 * @param {HTMLElement} modalEl
 * @param {() => void} onEscape
 * @param {HTMLElement} [restoreFocusEl] - Élément à refocaliser à la fermeture
 *   (par défaut, l'élément actif au moment de l'appel — mais certains
 *   déclencheurs sont désactivés avant l'ouverture, ce qui leur fait perdre
 *   le focus avant qu'on puisse le capturer : le passer explicitement dans
 *   ce cas).
 * @returns {() => void} releaseFocus
 */
export function trapFocus(modalEl, onEscape, restoreFocusEl = document.activeElement) {
    const previouslyFocused = restoreFocusEl;

    const getFocusable = () => Array.from(modalEl.querySelectorAll(FOCUSABLE_SELECTOR));

    const focusable = getFocusable();
    if (focusable.length) focusable[0].focus();

    const onKeydown = (e) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            onEscape();
            return;
        }
        if (e.key !== 'Tab') return;

        const items = getFocusable();
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];

        if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
        }
    };

    document.addEventListener('keydown', onKeydown);

    return function releaseFocus() {
        document.removeEventListener('keydown', onKeydown);
        if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
            previouslyFocused.focus();
        }
    };
}

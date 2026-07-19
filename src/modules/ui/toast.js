let _toastTimer = null;

/**
 * Affiche une notification non bloquante en bas d'écran.
 * @param {string} message
 * @param {'error'|'success'} [type='error']
 */
export function showToast(message, type = 'error') {
    const toast = document.getElementById('toast-container');
    if (!toast) {
        console.error(message);
        return;
    }

    toast.textContent = message;
    toast.className = `toast-container toast-container--${type} is-visible`;

    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => {
        toast.classList.remove('is-visible');
    }, 4000);
}

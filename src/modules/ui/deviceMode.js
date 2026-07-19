const STORAGE_KEY = 'serenitv-device-mode';
const MODES_VALIDES = ['tv', 'remote', 'pc'];

/**
 * Lit le rôle mémorisé pour cet appareil (localStorage), s'il est valide.
 * @returns {'tv'|'remote'|'pc'|null}
 */
export function getSavedMode() {
    const value = localStorage.getItem(STORAGE_KEY);
    return MODES_VALIDES.includes(value) ? value : null;
}

/**
 * Mémorise le rôle choisi par cet appareil.
 * @param {'tv'|'remote'|'pc'} mode
 */
export function saveMode(mode) {
    localStorage.setItem(STORAGE_KEY, mode);
}

/**
 * Efface le rôle mémorisé (réinitialisation).
 */
export function clearSavedMode() {
    localStorage.removeItem(STORAGE_KEY);
}

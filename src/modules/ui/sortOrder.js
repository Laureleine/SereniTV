const STORAGE_KEY = 'serenitv-sort-order';

/**
 * Tris disponibles, avec leur libellé affiché dans le menu déroulant.
 */
export const SORT_ORDERS = {
    alpha:  'Alphabétique (A-Z)',
    recent: 'Plus récent d\'abord',
    oldest: 'Plus ancien d\'abord',
};

export const DEFAULT_SORT_ORDER = 'alpha';

/**
 * Lit le tri mémorisé, ou l'ordre par défaut s'il est absent/invalide.
 * @returns {'alpha'|'recent'|'oldest'}
 */
export function getSavedSortOrder() {
    const value = localStorage.getItem(STORAGE_KEY);
    return value in SORT_ORDERS ? value : DEFAULT_SORT_ORDER;
}

/**
 * Mémorise le tri choisi.
 * @param {'alpha'|'recent'|'oldest'} order
 */
export function saveSortOrder(order) {
    localStorage.setItem(STORAGE_KEY, order);
}

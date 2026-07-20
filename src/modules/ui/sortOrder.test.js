import { describe, it, expect, beforeEach } from 'vitest';
import { getSavedSortOrder, saveSortOrder, SORT_ORDERS, DEFAULT_SORT_ORDER } from './sortOrder.js';

function createFakeLocalStorage() {
    let store = {};
    return {
        getItem: (key) => (key in store ? store[key] : null),
        setItem: (key, value) => { store[key] = String(value); },
        removeItem: (key) => { delete store[key]; },
    };
}

beforeEach(() => {
    globalThis.localStorage = createFakeLocalStorage();
});

describe('getSavedSortOrder', () => {
    it("retourne l'ordre par défaut quand aucun tri n'est mémorisé", () => {
        expect(getSavedSortOrder()).toBe(DEFAULT_SORT_ORDER);
    });

    it("retourne l'ordre mémorisé s'il est valide", () => {
        localStorage.setItem('serenitv-sort-order', 'recent');
        expect(getSavedSortOrder()).toBe('recent');
    });

    it("retourne l'ordre par défaut si la valeur stockée n'est pas reconnue", () => {
        localStorage.setItem('serenitv-sort-order', 'bogus');
        expect(getSavedSortOrder()).toBe(DEFAULT_SORT_ORDER);
    });
});

describe('saveSortOrder', () => {
    it('enregistre le tri choisi dans localStorage', () => {
        saveSortOrder('oldest');
        expect(localStorage.getItem('serenitv-sort-order')).toBe('oldest');
    });
});

describe('SORT_ORDERS', () => {
    it('contient les 3 tris attendus', () => {
        expect(Object.keys(SORT_ORDERS)).toEqual(['alpha', 'recent', 'oldest']);
    });
});

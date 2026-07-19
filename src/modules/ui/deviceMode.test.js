import { describe, it, expect, beforeEach } from 'vitest';
import { getSavedMode, saveMode, clearSavedMode } from './deviceMode.js';

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

describe('getSavedMode', () => {
    it("retourne null quand aucun mode n'est mémorisé", () => {
        expect(getSavedMode()).toBeNull();
    });

    it("retourne le mode mémorisé s'il est valide", () => {
        localStorage.setItem('serenitv-device-mode', 'tv');
        expect(getSavedMode()).toBe('tv');
    });

    it("retourne null si la valeur stockée n'est pas un mode reconnu", () => {
        localStorage.setItem('serenitv-device-mode', 'bogus');
        expect(getSavedMode()).toBeNull();
    });
});

describe('saveMode', () => {
    it('enregistre le mode dans localStorage', () => {
        saveMode('remote');
        expect(localStorage.getItem('serenitv-device-mode')).toBe('remote');
    });
});

describe('clearSavedMode', () => {
    it('efface le mode mémorisé', () => {
        localStorage.setItem('serenitv-device-mode', 'pc');
        clearSavedMode();
        expect(localStorage.getItem('serenitv-device-mode')).toBeNull();
    });
});

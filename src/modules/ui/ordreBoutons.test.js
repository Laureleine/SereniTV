import { describe, it, expect } from 'vitest';
import { normaliserOrdre, deplacerBouton, ORDRE_PAR_DEFAUT } from './ordreBoutons.js';

describe('normaliserOrdre', () => {
    it('garde un ordre valide', () => {
        expect(normaliserOrdre(['undo', 'yes', 'maybe', 'no'])).toEqual(['undo', 'yes', 'maybe', 'no']);
    });

    it("revient à l'ordre par défaut (ANNULER à droite) si rien n'est enregistré", () => {
        expect(normaliserOrdre(null)).toEqual(['no', 'maybe', 'yes', 'undo']);
    });

    it("revient à l'ordre par défaut si un bouton manque ou est en double", () => {
        expect(normaliserOrdre(['no', 'no', 'yes', 'undo'])).toEqual(ORDRE_PAR_DEFAUT);
        expect(normaliserOrdre(['no', 'yes', 'undo'])).toEqual(ORDRE_PAR_DEFAUT);
    });
});

describe('deplacerBouton', () => {
    it('décale un bouton vers la gauche ou la droite', () => {
        expect(deplacerBouton(['no', 'maybe', 'yes', 'undo'], 'undo', -1)).toEqual(['no', 'maybe', 'undo', 'yes']);
        expect(deplacerBouton(['no', 'maybe', 'yes', 'undo'], 'no', 1)).toEqual(['maybe', 'no', 'yes', 'undo']);
    });

    it('ne bouge pas au-delà des bords', () => {
        expect(deplacerBouton(['no', 'maybe', 'yes', 'undo'], 'no', -1)).toEqual(['no', 'maybe', 'yes', 'undo']);
        expect(deplacerBouton(['no', 'maybe', 'yes', 'undo'], 'undo', 1)).toEqual(['no', 'maybe', 'yes', 'undo']);
    });
});

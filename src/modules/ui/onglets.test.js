import { describe, it, expect } from 'vitest';
import { estDansOnglet, compterParOnglet } from './onglets.js';

const SERIES = [
    { statut_visionnage: null, est_nouveaute: false },
    { statut_visionnage: null, est_nouveaute: false },
    { statut_visionnage: null, est_nouveaute: true },
    { statut_visionnage: 'En cours', est_nouveaute: false },
    { statut_visionnage: 'A voir', est_nouveaute: true },
    { statut_visionnage: 'Sans intérêt', est_nouveaute: false },
];

describe('estDansOnglet', () => {
    it('« Toutes » = non classées hors nouveautés', () => {
        expect(estDansOnglet(SERIES[0], 'all')).toBe(true);
        expect(estDansOnglet(SERIES[2], 'all')).toBe(false);
        expect(estDansOnglet(SERIES[3], 'all')).toBe(false);
    });

    it('une nouveauté classée quitte l\'onglet Nouveautés', () => {
        expect(estDansOnglet(SERIES[4], 'nouveautes')).toBe(false);
        expect(estDansOnglet(SERIES[4], 'a-voir')).toBe(true);
    });
});

describe('compterParOnglet', () => {
    it('compte les séries de chaque onglet', () => {
        expect(compterParOnglet(SERIES)).toEqual({
            'all': 2, 'nouveautes': 1, 'en-cours': 1, 'suivies': 0, 'a-voir': 1,
            'terminees': 0, 'abandonnees': 0, 'peut-etre': 0, 'ignorees': 1,
        });
    });
});

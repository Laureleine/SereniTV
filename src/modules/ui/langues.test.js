import { describe, it, expect } from 'vitest';
import { libelleLangue, libellePays, listerLangues } from './langues.js';

describe('libelleLangue', () => {
    it('traduit le code en français avec une majuscule', () => {
        expect(libelleLangue('ko')).toBe('Coréen');
        expect(libelleLangue('en')).toBe('Anglais');
    });

    it('renvoie une chaîne vide sans code', () => {
        expect(libelleLangue(null)).toBe('');
    });

    it('renvoie le code tel quel si Intl ne le reconnaît pas', () => {
        expect(libelleLangue('!!')).toBe('!!');
    });
});

describe('libellePays', () => {
    it('traduit le code pays en français', () => {
        expect(libellePays('KR')).toBe('Corée du Sud');
    });
});

describe('listerLangues', () => {
    it('compte les langues, les plus fréquentes en premier, sans les séries sans langue', () => {
        const series = [
            { langue_originale: 'en' }, { langue_originale: 'ko' }, { langue_originale: 'en' },
            { langue_originale: null }, { langue_originale: 'fr' },
        ];
        expect(listerLangues(series)).toEqual([
            { code: 'en', libelle: 'Anglais', nb: 2 },
            { code: 'ko', libelle: 'Coréen', nb: 1 },
            { code: 'fr', libelle: 'Français', nb: 1 },
        ]);
    });
});

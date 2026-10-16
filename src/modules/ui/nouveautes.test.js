import { describe, it, expect } from 'vitest';
import { entreesNonVues } from './nouveautes.js';

const CHANGELOG = [
    { version: '1.7.5' },
    { version: '1.7.4' },
    { version: '1.7.3' },
];

describe('entreesNonVues', () => {
    it('retourne les versions publiées depuis la dernière vue', () => {
        expect(entreesNonVues(CHANGELOG, '1.7.3').map(e => e.version)).toEqual(['1.7.5', '1.7.4']);
    });

    it('retourne [] si la dernière version est déjà vue', () => {
        expect(entreesNonVues(CHANGELOG, '1.7.5')).toEqual([]);
    });

    it("retourne [] si rien n'a encore été vu (nouveau compte)", () => {
        expect(entreesNonVues(CHANGELOG, null)).toEqual([]);
    });

    it('retourne [] si la version vue est inconnue (appli en cache plus ancienne)', () => {
        expect(entreesNonVues(CHANGELOG, '1.8.0')).toEqual([]);
    });
});

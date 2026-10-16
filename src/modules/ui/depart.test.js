import { describe, it, expect } from 'vitest';
import { annonceDepart } from './depart.js';

const MAINTENANT = new Date('2026-10-16T12:00:00Z');

describe('annonceDepart', () => {
    it('annonce la date et la plateforme de départ', () => {
        expect(annonceDepart({ depart_le: '2026-12-31T00:00:00Z', depart_service: 'Netflix' }, MAINTENANT))
            .toEqual({ texte: 'Quitte Netflix le 31 décembre', urgent: false });
    });

    it('signale un départ imminent (moins de 14 jours)', () => {
        expect(annonceDepart({ depart_le: '2026-10-20T00:00:00Z', depart_service: 'Netflix' }, MAINTENANT).urgent).toBe(true);
    });

    it('reste générique sans nom de plateforme', () => {
        expect(annonceDepart({ depart_le: '2026-12-31T00:00:00Z' }, MAINTENANT).texte).toBe('Quitte la plateforme le 31 décembre');
    });

    it("n'annonce rien sans date ou si la date est passée", () => {
        expect(annonceDepart({ depart_le: null }, MAINTENANT)).toBeNull();
        expect(annonceDepart({ depart_le: '2026-10-01T00:00:00Z', depart_service: 'Netflix' }, MAINTENANT)).toBeNull();
    });
});

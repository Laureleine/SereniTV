import { describe, it, expect } from 'vitest';
import { getPlayLink } from './playLink.js';

describe('getPlayLink', () => {
    it('génère un deep link Netflix quand un ID est présent dans watch_url', () => {
        const serie = { plateforme: 'Netflix', titre: 'Breaking Bad', watch_url: 'https://www.netflix.com/title/70143836' };
        expect(getPlayLink(serie)).toEqual({
            url: 'netflix://title/70143836',
            name: 'Netflix',
            class: 'netflix',
        });
    });

    it('replie sur une recherche Netflix si aucun ID ne peut être extrait', () => {
        const serie = { plateforme: 'Netflix', titre: 'Breaking Bad', watch_url: '' };
        expect(getPlayLink(serie)).toEqual({
            url: `https://www.netflix.com/search?q=${encodeURIComponent('Breaking Bad')}`,
            name: 'Netflix',
            class: 'netflix',
        });
    });

    it('génère un deep link Prime Video quand un ID est présent', () => {
        const serie = { plateforme: 'Prime Video', titre: 'The Boys', watch_url: 'https://www.primevideo.com/detail/0QZL8I' };
        expect(getPlayLink(serie)).toEqual({
            url: 'primevideo://detail/0QZL8I',
            name: 'Prime Video',
            class: 'primevideo',
        });
    });

    it('reconnaît Amazon comme alias de Prime Video', () => {
        const serie = { plateforme: 'Amazon', titre: 'The Boys', watch_url: '' };
        expect(getPlayLink(serie).name).toBe('Prime Video');
    });

    it('replie sur une recherche Disney+ si aucun ID ne peut être extrait', () => {
        const serie = { plateforme: 'Disney+', titre: 'Loki', watch_url: '' };
        expect(getPlayLink(serie)).toEqual({
            url: `https://www.disneyplus.com/search?q=${encodeURIComponent('Loki')}`,
            name: 'Disney+',
            class: 'disney',
        });
    });

    it('utilise en priorité le lien direct de la plateforme (API Streaming Availability)', () => {
        const serie = {
            plateforme: 'Netflix', titre: 'Breaking Bad',
            watch_url: 'https://www.themoviedb.org/tv/1396/watch?locale=FR',
            lien_plateforme: 'https://www.netflix.com/title/70143836/',
        };
        expect(getPlayLink(serie).url).toBe('netflix://title/70143836');
    });

    it('ouvre le lien direct tel quel pour une plateforme sans traitement dédié', () => {
        const serie = {
            plateforme: 'HBO', titre: 'The Wire',
            lien_plateforme: 'https://play.max.com/show/abc', lien_plateforme_service: 'HBO Max',
        };
        expect(getPlayLink(serie)).toEqual({ url: 'https://play.max.com/show/abc', name: 'HBO Max', class: 'autre' });
    });

    it('ouvre la page TF1+ du programme à partir du titre', () => {
        const serie = { plateforme: 'TF1+', titre: 'Ici tout commence !', watch_url: '' };
        expect(getPlayLink(serie)).toEqual({ url: 'https://www.tf1.fr/recherche/ici-tout-commence', name: 'TF1+', class: 'tf1' });
    });

    it('ouvre la recherche M6+ et Arte', () => {
        expect(getPlayLink({ plateforme: 'M6+', titre: 'Kaamelott' }).url).toBe('https://www.m6.fr/recherche?q=Kaamelott');
        expect(getPlayLink({ plateforme: 'Arte', titre: 'Les Revenants' }).url).toBe(`https://www.arte.tv/fr/search/?q=${encodeURIComponent('Les Revenants')}`);
    });

    it('préfère le lien direct pour une plateforme française', () => {
        const serie = { plateforme: 'Canal+', titre: 'Versailles', lien_plateforme: 'https://www.canalplus.com/series/versailles/h/123' };
        expect(getPlayLink(serie)).toEqual({ url: 'https://www.canalplus.com/series/versailles/h/123', name: 'Canal+', class: 'canal' });
    });

    it('replie sur une recherche Netflix pour une plateforme inconnue ou absente', () => {
        const serie = { plateforme: null, titre: 'Mystère', watch_url: '' };
        expect(getPlayLink(serie)).toEqual({
            url: `https://www.netflix.com/search?q=${encodeURIComponent('Mystère')}`,
            name: 'Netflix',
            class: 'netflix',
        });
    });
});

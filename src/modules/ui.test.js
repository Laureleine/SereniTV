import { describe, it, expect } from 'vitest';
import { getPlayLink } from './ui.js';

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

    it('replie sur une recherche Netflix pour une plateforme inconnue ou absente', () => {
        const serie = { plateforme: null, titre: 'Mystère', watch_url: '' };
        expect(getPlayLink(serie)).toEqual({
            url: `https://www.netflix.com/search?q=${encodeURIComponent('Mystère')}`,
            name: 'Netflix',
            class: 'netflix',
        });
    });
});

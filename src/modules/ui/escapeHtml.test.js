import { describe, it, expect } from 'vitest';
import { escapeHtml } from './escapeHtml.js';

describe('escapeHtml', () => {
    it('échappe les caractères spéciaux HTML', () => {
        expect(escapeHtml('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
    });

    it('échappe les guillemets doubles (contexte attribut)', () => {
        expect(escapeHtml('" onmouseover="alert(1)')).toBe('&quot; onmouseover=&quot;alert(1)');
    });

    it('échappe les guillemets simples et esperluettes', () => {
        expect(escapeHtml(`Tom & Jerry's`)).toBe('Tom &amp; Jerry&#39;s');
    });

    it('laisse un texte normal inchangé', () => {
        expect(escapeHtml('Breaking Bad')).toBe('Breaking Bad');
    });

    it('gère les valeurs null/undefined comme une chaîne vide', () => {
        expect(escapeHtml(null)).toBe('');
        expect(escapeHtml(undefined)).toBe('');
    });
});

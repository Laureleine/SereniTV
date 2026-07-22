const ESCAPE_MAP = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
};

/**
 * Échappe les caractères spéciaux HTML pour une insertion sûre dans un
 * template innerHTML (texte ou attribut). À utiliser pour toute donnée
 * externe (TMDB) interpolée dans du HTML.
 */
export function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ESCAPE_MAP[ch]);
}

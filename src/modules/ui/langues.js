// Libellés en français à partir des codes TMDB (ISO 639-1 pour la langue,
// ISO 3166-1 pour le pays). Pas de drapeaux emoji : Windows ne les affiche pas.
const nomsLangues = new Intl.DisplayNames(['fr'], { type: 'language' });
const nomsPays = new Intl.DisplayNames(['fr'], { type: 'region' });

function nomOuCode(displayNames, code) {
    try {
        return displayNames.of(code) || code;
    } catch {
        return code; // code non reconnu par Intl
    }
}

/** « ko » → « Coréen » (première lettre en majuscule). */
export function libelleLangue(code) {
    if (!code) return '';
    const nom = nomOuCode(nomsLangues, code);
    return nom.charAt(0).toUpperCase() + nom.slice(1);
}

/** « KR » → « Corée du Sud ». */
export function libellePays(code) {
    return code ? nomOuCode(nomsPays, code) : '';
}

/**
 * Langues présentes dans le catalogue, de la plus fréquente à la moins
 * fréquente (puis par ordre alphabétique), pour peupler le filtre.
 * @param {{langue_originale?: string|null}[]} series
 * @returns {{code: string, libelle: string, nb: number}[]}
 */
export function listerLangues(series) {
    const compte = new Map();
    for (const s of series) {
        if (s.langue_originale) compte.set(s.langue_originale, (compte.get(s.langue_originale) || 0) + 1);
    }
    return [...compte.entries()]
        .map(([code, nb]) => ({ code, libelle: libelleLangue(code), nb }))
        .sort((a, b) => b.nb - a.nb || a.libelle.localeCompare(b.libelle, 'fr'));
}

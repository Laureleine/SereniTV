const JOUR_MS = 24 * 60 * 60 * 1000;

/**
 * Annonce du départ prochain d'une série de sa plateforme, ou null si aucune
 * date connue ou si elle est déjà passée.
 * @param {{depart_le?: string|null, depart_service?: string|null}} serie
 * @param {Date} maintenant
 * @returns {{texte: string, urgent: boolean}|null} urgent = moins de 14 jours
 */
export function annonceDepart(serie, maintenant = new Date()) {
    if (!serie.depart_le) return null;
    const date = new Date(serie.depart_le);
    if (Number.isNaN(date.getTime()) || date <= maintenant) return null;

    const quand = date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
    const ou = serie.depart_service ? ` ${serie.depart_service}` : ' la plateforme';
    return {
        texte: `Quitte${ou} le ${quand}`,
        urgent: date - maintenant < 14 * JOUR_MS,
    };
}

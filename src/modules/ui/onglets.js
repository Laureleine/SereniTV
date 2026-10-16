// Onglets de statut du catalogue (data-filter des boutons de navigation) et
// statut de visionnage correspondant. « all » (Toutes) = Inbox : séries non
// classées, hors Nouveautés.
const STATUT_PAR_ONGLET = {
    'en-cours':    'En cours',
    'suivies':     'Suivies',
    'a-voir':      'A voir',
    'terminees':   'Terminée',
    'abandonnees': 'Abandonnée',
    'peut-etre':   'Peut-être',
    'ignorees':    'Sans intérêt',
};

export const ONGLETS = ['all', 'nouveautes', ...Object.keys(STATUT_PAR_ONGLET)];

/** La série apparaît-elle dans cet onglet ? (onglet inconnu : oui) */
export function estDansOnglet(serie, onglet) {
    if (onglet === 'all') return serie.statut_visionnage === null && !serie.est_nouveaute;
    if (onglet === 'nouveautes') return serie.statut_visionnage === null && !!serie.est_nouveaute;
    const statut = STATUT_PAR_ONGLET[onglet];
    return statut ? serie.statut_visionnage === statut : true;
}

/** Nombre de séries par onglet, ex. { all: 1038, nouveautes: 40, … }. */
export function compterParOnglet(series) {
    return Object.fromEntries(ONGLETS.map(onglet => [onglet, series.filter(s => estDansOnglet(s, onglet)).length]));
}

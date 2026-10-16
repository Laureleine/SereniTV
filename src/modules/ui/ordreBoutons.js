// Ordre des boutons de la télécommande (NON / PEUT-ÊTRE / OUI / ANNULER),
// personnalisable dans « Mon compte ». Identifiants = suffixes des id HTML
// (#remote-no, #remote-maybe, #remote-yes, #remote-undo).
export const BOUTONS_TELECOMMANDE = {
    no: 'NON',
    maybe: 'PEUT-ÊTRE',
    yes: 'OUI',
    undo: 'ANNULER',
};

export const ORDRE_PAR_DEFAUT = ['no', 'maybe', 'yes', 'undo'];

/** Ordre enregistré s'il est valide (les 4 boutons, une fois chacun), sinon l'ordre par défaut. */
export function normaliserOrdre(ordre) {
    const attendu = Object.keys(BOUTONS_TELECOMMANDE);
    const valide = Array.isArray(ordre)
        && ordre.length === attendu.length
        && attendu.every(id => ordre.includes(id));
    return valide ? [...ordre] : [...ORDRE_PAR_DEFAUT];
}

/** Nouvel ordre après avoir décalé un bouton d'un cran (-1 = vers la gauche, +1 = vers la droite). */
export function deplacerBouton(ordre, id, sens) {
    const nouvelOrdre = [...ordre];
    const index = nouvelOrdre.indexOf(id);
    const cible = index + sens;
    if (index === -1 || cible < 0 || cible >= nouvelOrdre.length) return nouvelOrdre;
    [nouvelOrdre[index], nouvelOrdre[cible]] = [nouvelOrdre[cible], nouvelOrdre[index]];
    return nouvelOrdre;
}

/** Réordonne les boutons dans le bandeau de la télécommande. */
export function appliquerOrdreBoutons(ordre) {
    const deck = document.getElementById('remote-deck');
    if (!deck) return;
    for (const id of normaliserOrdre(ordre)) {
        const bouton = document.getElementById(`remote-${id}`);
        if (bouton) deck.appendChild(bouton); // appendChild déplace l'élément existant
    }
}

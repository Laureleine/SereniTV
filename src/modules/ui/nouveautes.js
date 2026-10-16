/**
 * Entrées du changelog publiées depuis la dernière version vue par
 * l'utilisateur (le changelog est trié de la plus récente à la plus ancienne).
 * Retourne [] si rien n'a encore été vu (nouveau compte : on ne l'inonde pas
 * de tout l'historique) ou si la version vue est inconnue de ce changelog
 * (ex : appli encore en cache sur cet appareil, plus ancienne que la version vue).
 * @param {{version: string}[]} changelog
 * @param {string|null} derniereVue
 */
export function entreesNonVues(changelog, derniereVue) {
    if (!derniereVue) return [];
    const index = changelog.findIndex(entree => entree.version === derniereVue);
    if (index === -1) return [];
    return changelog.slice(0, index);
}

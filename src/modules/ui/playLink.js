/**
 * Génère le lien de lecture optimal ou le lien de recherche de repli pour la plateforme.
 * @param {object} serie - L'objet série
 * @returns {{url: string, name: string, class: string}} Les infos du lien de lecture
 */
export function getPlayLink(serie) {
    const platform = (serie.plateforme || '').toLowerCase();
    const titre = serie.titre || '';
    // Lien direct de l'API Streaming Availability en priorité (contient
    // l'identifiant de la série), sinon le lien TMDB historique.
    const watchUrl = serie.lien_plateforme || serie.watch_url || '';

    if (platform.includes('netflix')) {
        const match = watchUrl.match(/(?:netflix\.com\/title\/|title\/|netflix:\/\/title\/)([0-9]+)/i);
        if (match && match[1]) {
            return {
                url: `netflix://title/${match[1]}`,
                name: 'Netflix',
                class: 'netflix'
            };
        }
        return {
            url: `https://www.netflix.com/search?q=${encodeURIComponent(titre)}`,
            name: 'Netflix',
            class: 'netflix'
        };
    }

    if (platform.includes('prime video') || platform.includes('amazon')) {
        const match = watchUrl.match(/(?:detail\/|dp\/|gp\/video\/detail\/)([a-zA-Z0-9_]+)/i);
        if (match && match[1]) {
            return {
                url: `primevideo://detail/${match[1]}`,
                name: 'Prime Video',
                class: 'primevideo'
            };
        }
        return {
            url: `https://www.primevideo.com/search/?phrase=${encodeURIComponent(titre)}`,
            name: 'Prime Video',
            class: 'primevideo'
        };
    }

    if (platform.includes('disney')) {
        const match = watchUrl.match(/(?:series\/[^/]+\/|video\/)([a-zA-Z0-9-]+)/i);
        if (match && match[1]) {
            return {
                url: `https://www.disneyplus.com/video/${match[1]}`,
                name: 'Disney+',
                class: 'disney'
            };
        }
        return {
            url: `https://www.disneyplus.com/search?q=${encodeURIComponent(titre)}`,
            name: 'Disney+',
            class: 'disney'
        };
    }

    // Plateformes françaises : lien direct s'il est connu, sinon leur recherche.
    // TF1+ n'a pas de recherche par paramètre : /recherche/<titre-en-slug>
    // redirige vers la page du programme quand le titre correspond.
    const plateformesFr = {
        'tf1+': { name: 'TF1+', class: 'tf1', recherche: t => `https://www.tf1.fr/recherche/${slugifier(t)}` },
        'm6+': { name: 'M6+', class: 'm6', recherche: t => `https://www.m6.fr/recherche?q=${encodeURIComponent(t)}` },
        'arte': { name: 'Arte', class: 'arte', recherche: t => `https://www.arte.tv/fr/search/?q=${encodeURIComponent(t)}` },
        'canal+': { name: 'Canal+', class: 'canal', recherche: () => 'https://www.canalplus.com/' },
    };
    const fr = plateformesFr[platform];
    if (fr) {
        return {
            url: serie.lien_plateforme || fr.recherche(titre),
            name: fr.name,
            class: fr.class
        };
    }

    // Autre plateforme (HBO Max, Apple TV, Paramount+…) : lien direct tel quel
    if (serie.lien_plateforme) {
        return {
            url: serie.lien_plateforme,
            name: serie.lien_plateforme_service || serie.plateforme || 'la plateforme',
            class: 'autre'
        };
    }

    // Repli ultime : recherche Netflix (jamais IMDb)
    return {
        url: `https://www.netflix.com/search?q=${encodeURIComponent(titre)}`,
        name: 'Netflix',
        class: 'netflix'
    };
}

/** « Ici tout commence ! » → « ici-tout-commence » (format des adresses tf1.fr). */
function slugifier(texte) {
    return texte
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

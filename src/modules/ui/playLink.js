/**
 * Génère le lien de lecture optimal ou le lien de recherche de repli pour la plateforme.
 * @param {object} serie - L'objet série
 * @returns {{url: string, name: string, class: string}} Les infos du lien de lecture
 */
export function getPlayLink(serie) {
    const platform = (serie.plateforme || '').toLowerCase();
    const titre = serie.titre || '';
    const watchUrl = serie.watch_url || '';

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

    // Repli ultime : recherche Netflix (jamais IMDb)
    return {
        url: `https://www.netflix.com/search?q=${encodeURIComponent(titre)}`,
        name: 'Netflix',
        class: 'netflix'
    };
}

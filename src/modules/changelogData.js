/**
 * Historique des versions de SéréniTV.
 * La plus récente en tête. APP_VERSION en est toujours dérivée,
 * pour que le badge affiché et cette liste ne puissent jamais diverger.
 *
 * Pour publier une nouvelle version : ajouter une entrée en tête de ce tableau.
 */
export const CHANGELOG = [
    {
        version: '1.3.0',
        date: '2026-07-20',
        changes: [
            "Nouveau menu « Trier par » sur chaque onglet : Alphabétique, Plus récent d'abord, Plus ancien d'abord ou Aléatoire. Le choix est mémorisé.",
            "Une série ajoutée manuellement apparaît toujours en premier, quel que soit le tri choisi, le temps de la traiter.",
        ],
    },
    {
        version: '1.2.0',
        date: '2026-07-19',
        changes: [
            "Nouvelle catégorie « Suivies » : pour les séries dont vous avez vu toutes les saisons disponibles, en attente de la suite. « En cours » redevient réservé à ce que vous regardez activement.",
            "Bascule automatique : une série « Suivies » (ou « Terminée ») repasse toute seule en « En cours » si une nouvelle saison sort ; une série « Suivies » passe en « Terminée » si la production est confirmée définitivement close.",
        ],
    },
    {
        version: '1.1.4',
        date: '2026-07-19',
        changes: [
            "Correction : le bandeau de la télécommande (NON/PEUT-ÊTRE/OUI) pouvait rester cliquable par-dessus une fenêtre de confirmation ouverte (abandon/démarrage d'une série).",
        ],
    },
    {
        version: '1.1.3',
        date: '2026-07-19',
        changes: [
            "Correction de l'app Android (TWA) qui s'ouvrait dans un navigateur au lieu du plein écran natif : ajout du fichier assetlinks.json manquant, requis pour la vérification de confiance entre l'app et le site.",
        ],
    },
    {
        version: '1.1.2',
        date: '2026-07-19',
        changes: [
            "Nettoyage automatique des Service Workers orphelins (résidus d'un ancien outil PWA) qui pouvaient servir du code périmé à certains visiteurs déjà passés sur le site.",
        ],
    },
    {
        version: '1.1.1',
        date: '2026-07-19',
        changes: [
            "Correction du Service Worker : la liste de préchargement référençait des fichiers de développement absents en production, empêchant son installation (donc tout le cache hors-ligne) depuis toujours.",
        ],
    },
    {
        version: '1.1.0',
        date: '2026-07-19',
        changes: [
            "Mise en place du versionnage de l'application, avec notes de version consultables.",
        ],
    },
];

export const APP_VERSION = CHANGELOG[0].version;

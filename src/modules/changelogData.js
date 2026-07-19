/**
 * Historique des versions de SéréniTV.
 * La plus récente en tête. APP_VERSION en est toujours dérivée,
 * pour que le badge affiché et cette liste ne puissent jamais diverger.
 *
 * Pour publier une nouvelle version : ajouter une entrée en tête de ce tableau.
 */
export const CHANGELOG = [
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

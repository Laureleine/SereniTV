/**
 * Historique des versions de SéréniTV.
 * La plus récente en tête. APP_VERSION en est toujours dérivée,
 * pour que le badge affiché et cette liste ne puissent jamais diverger.
 *
 * Pour publier une nouvelle version : ajouter une entrée en tête de ce tableau.
 */
export const CHANGELOG = [
    {
        version: '1.7.0',
        date: '2026-07-22',
        changes: [
            "Nouvel onglet « Nouveautés » : chaque semaine, les séries qui viennent de sortir sont importées automatiquement dans cet onglet dédié.",
            "En parallèle, 100 séries plus anciennes (parmi les plus populaires) sont ajoutées chaque semaine à l'Inbox, pour enrichir progressivement le catalogue.",
        ],
    },
    {
        version: '1.6.10',
        date: '2026-07-22',
        changes: [
            "Mode PC : possibilité de masquer la fenêtre Oui/Non/Peut-être (petite croix en haut à droite) et de la réafficher via un bouton flottant.",
        ],
    },
    {
        version: '1.6.9',
        date: '2026-07-22',
        changes: [
            "Ajout d'un lien IMDB sur chaque série (quand disponible) pour accéder rapidement à sa fiche complète.",
        ],
    },
    {
        version: '1.6.8',
        date: '2026-07-22',
        changes: [
            "Kanban Feedback : les colonnes prennent maintenant toute la largeur de l'écran et le texte des cartes est plus grand, pour une meilleure lisibilité.",
        ],
    },
    {
        version: '1.6.7',
        date: '2026-07-22',
        changes: [
            "Correction : le panneau des saisons d'une série avec beaucoup de saisons (ex : 1 Rue Sesame, 56 saisons) rendait la page très longue à parcourir pour atteindre les séries suivantes. Il défile maintenant sur lui-même, sans pousser le reste de la page.",
        ],
    },
    {
        version: '1.6.6',
        date: '2026-07-22',
        changes: [
            "Fil de discussion sur chaque carte du Kanban Feedback : questions/réponses directement dessus, pour échanger sur un bug ou une idée sans quitter la carte.",
        ],
    },
    {
        version: '1.6.5',
        date: '2026-07-22',
        changes: [
            "Chaque carte du Kanban Feedback affiche désormais son identifiant, et un bouton « Copier » permet de copier son contenu en un clic.",
        ],
    },
    {
        version: '1.6.4',
        date: '2026-07-22',
        changes: [
            "Le Kanban Feedback passe en page pleine largeur (au lieu d'une petite fenêtre), pour un affichage plus lisible.",
        ],
    },
    {
        version: '1.6.3',
        date: '2026-07-22',
        changes: [
            "Notification par email à chaque nouvelle demande d'inscription à la bêta, avec un interrupteur pour l'activer/désactiver dans le panneau admin.",
        ],
    },
    {
        version: '1.6.2',
        date: '2026-07-22',
        changes: [
            "Les demandeurs d'accès à la bêta reçoivent désormais un email (via Mailjet) lorsque leur inscription est validée ou refusée, avec un email aux couleurs de SéréniTV.",
        ],
    },
    {
        version: '1.6.1',
        date: '2026-07-22',
        changes: [
            "Ajout d'une FAQ sur la page d'accueil, expliquant qu'une connexion est nécessaire sur chaque appareil (mémorisée ensuite).",
        ],
    },
    {
        version: '1.6.0',
        date: '2026-07-22',
        changes: [
            "Nouvelle page d'accueil publique : SéréniTV passe en bêta privée sur invitation, avec inscription (email + mot de passe + message de motivation) et validation manuelle des demandes.",
            "Nouvel espace Feedback pour les testeurs approuvés : Kanban (Idées/Prévu/En cours/Fait/Refusé) filtrable par type (Bug/Idée/Autre), avec formulaire de soumission.",
        ],
    },
    {
        version: '1.5.0',
        date: '2026-07-22',
        changes: [
            "Nouveau : classement par thèmes. Chaque série récupère automatiquement ses genres depuis TMDB, et vous pouvez en ajouter ou en retirer à la main sur chaque carte. Une rangée de filtres par thème permet d'afficher uniquement les séries correspondantes.",
        ],
    },
    {
        version: '1.4.2',
        date: '2026-07-22',
        changes: [
            "Nettoyage interne : suppression de code mort et d'une dépendance inutilisée (qui était aussi la source d'une alerte de sécurité sur une bibliothèque tierce, désormais résolue). Couleurs de l'écran de démarrage alignées sur la charte actuelle de l'appli.",
        ],
    },
    {
        version: '1.4.1',
        date: '2026-07-22',
        changes: [
            "Sécurité : fermeture d'une faille permettant d'injecter du code via un titre de série.",
            "Correction : en cas d'échec d'enregistrement d'un statut (coupure réseau), la série ne disparaît plus silencieusement — un message d'erreur s'affiche et rien n'est perdu.",
            "Accessibilité : le panneau des saisons de chaque carte s'ouvre désormais aussi au clavier, les fenêtres de confirmation se ferment avec Échap et remettent le focus à leur place, et le zoom n'est plus bloqué sur mobile.",
        ],
    },
    {
        version: '1.4.0',
        date: '2026-07-22',
        changes: [
            "Écran de connexion : l'application nécessite désormais un vrai compte. Une seule connexion par appareil, ensuite mémorisée automatiquement.",
            "Sécurité : fermeture d'une faille où n'importe qui pouvait extraire du code de l'application un accès direct en lecture/écriture à la base de données, en contournant l'application elle-même.",
        ],
    },
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

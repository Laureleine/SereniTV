# CLAUDE.md

Instructions pour Claude Code sur ce dépôt (SéréniTV — suivi de séries TV, PWA + Supabase).

## Versionnage

À partir de la version 1.1.0, chaque changement notable livré doit :
1. Ajouter une entrée en tête de `CHANGELOG` dans `src/modules/changelogData.js` (nouveau numéro de version, date du jour, description courte des changements) — c'est la seule source affichée dans le badge de version et le panneau de notes de version de l'app.
2. Mettre à jour `"version"` dans `package.json` avec le même numéro.

Pas de reconstitution rétroactive des changements antérieurs à la 1.1.0.

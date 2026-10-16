---
name: bug
description: Use when the user types /bug, says "bug", or pastes a bug/feedback description for SéréniTV and wants it triaged and fixed following the project's standard bug-handling routine (fetch from the Kanban, fix, commit, deploy on the user's go, update the card).
---

# /bug — Traiter un bug du Kanban SéréniTV

## Déclenchement

- **`/bug` ou "bug"** : va chercher toi-même le bug à traiter (étape 1).
- **L'utilisateur colle une description de bug directement** : saute l'étape 1, applique la même routine à partir de l'étape 2 sur ce contenu (il n'a pas forcément de carte Kanban associée — si aucun `id` n'est fourni, tu peux créer la carte toi-même en `statut = 'En cours'` directement).

Projet Supabase : `flvvjlytntnethjyyuix`. Tables : `retours_utilisateurs` (id, type, titre, description, statut) et `retours_commentaires` (retour_id, auteur `'utilisateur'|'assistant'`, message, created_at). Toutes les lectures/écritures se font directement via les outils MCP Supabase (execute_sql / apply_migration) — les policies RLS ne bloquent pas cet accès, il n'y a pas besoin de passer par l'appli cliente.

**Quel serveur MCP Supabase** : utiliser `mcp__supabase-iarwb__*`. Les outils `mcp__claude_ai_Supabase__*` renvoient « You do not have permission » sur ce projet (constaté le 2026-10-16).

## Étapes

0. **Vérifie que Supabase est actif**
   `get_project` sur `flvvjlytntnethjyyuix` : le statut doit être `ACTIVE_HEALTHY`. Le plan gratuit met le projet en pause après ~1 semaine sans activité (statut `INACTIVE`) : les requêtes échouent alors par timeout, ou, pendant le redémarrage (`COMING_UP`), répondent « relation does not exist » alors que les données sont intactes. Dans ce cas, préviens l'utilisateur et relance (`restore_project`), puis attends `ACTIVE_HEALTHY` avant toute requête. Ne rien écrire en base tant que le projet n'est pas actif.

1. **Sélection** (uniquement si déclenché par `/bug`, pas par un copier-coller direct)
   Requête : `type = 'Bug' AND statut = 'Prévu'`, triée par `created_at` croissant (le plus ancien en premier — pas encore de champ de criticité, à revoir si ce champ est ajouté un jour). Prends la première carte.
   S'il n'y a aucun `Bug` en `Prévu`, prends plutôt la carte la plus ancienne avec `type = 'Idée' AND statut = 'Prévu'`.
   Si aucune carte ne correspond (ni Bug ni Idée en Prévu), dis-le à l'utilisateur et arrête-toi là.

2. **Passage en "En cours"**
   Mets à jour `statut = 'En cours'` sur cette carte immédiatement, avant toute analyse.

3. **Vérifie que tu as tout ce qu'il faut**
   - Si oui → étape 4.
   - Si non → insère un commentaire `auteur = 'assistant'` sur la carte avec tes questions, dans un langage clair et non technique (pas de jargon). Préviens l'utilisateur en conversation que des questions attendent sur la carte, puis **arrête-toi** : n'avance pas tant qu'il n'a pas répondu (sa réponse apparaîtra en `auteur = 'utilisateur'` sur la même carte).

4. **Corrige le bug**
   Avant de considérer que c'est fait :
   - `npm test` (vitest) passe ; ajoute un test quand la logique corrigée est testable unitairement (fonctions pures de `src/modules/ui/*.js`, cf. les `*.test.js` existants).
   - `npm run build` passe.
   - Vérification en local : `npm run dev` (Vite, port 5173), puis contrôle visuel dans le navigateur. Voir les pièges « vérification live » de la mémoire REX (serveur mort, Service Worker qui sert du cache).
   - Changelog : nouvelle entrée en tête de `CHANGELOG` dans `src/modules/changelogData.js` (version suivante, date du jour, description en langage clair) **et** même numéro dans `"version"` de `package.json` (cf. CLAUDE.md).

5. **Commit local — ne pousse pas sans accord**
   Commit sur `main`, **sans `git push`**. L'utilisateur décide quand déployer (pousser sur `origin/main` déclenche la mise en ligne Vercel). Dis-lui que la correction est prête et commitée, et demande si tu pousses maintenant.
   Quand il donne son accord : `git push`, puis confirme que le déploiement a pris (comparer le hash du JS/CSS du build local avec celui servi par `https://sereni-tv.vercel.app/`, cf. mémoire REX).

6. **Mets à jour la carte**
   - Tant que ce n'est pas en ligne : la carte reste `En cours`.
   - Une fois en prod : ajoute un commentaire `auteur = 'assistant'` décrivant la correction en langage clair pour l'utilisateur (pas technique), puis passe `statut = 'Fait'`. Si plusieurs corrections ont été poussées d'un coup, mets à jour toutes les cartes concernées.

7. **REX pour toi-même**
   Note dans ta mémoire persistante (fichier projet SéréniTV) tout piège ou subtilité découvert pendant cette correction — pas sur la carte, pas visible pour l'utilisateur. Objectif : ne pas retomber dans le même panneau la prochaine fois.

8. **Proposition d'évolution (facultatif)**
   Si la correction suggère naturellement une amélioration, tu peux créer une nouvelle carte (`type = 'Idée'`, `statut = 'Idées'`) pour la proposer. Pas systématique — vas-y seulement si l'idée est réellement pertinente.

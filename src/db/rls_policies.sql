-- ============================================================================
-- POLITIQUES RLS : SéréniTV — état réel en production
-- ============================================================================
-- Stratégie effective (verrouillée) :
--   • Tables Catalogue (series, saisons, themes, series_themes) :
--     Lecture publique (anon, authenticated). Écriture : AUCUNE policy anon —
--     uniquement via les Edge Functions (service_role, qui contourne RLS).
--
--   • Tables Utilisateur (utilisateur_series, utilisateur_saisons) :
--     Lecture réservée au propriétaire réel (auth.uid() = user_id), via un
--     compte Supabase Auth partagé unique. Écriture : AUCUNE policy
--     anon/authenticated — uniquement via l'Edge Function update-user-status
--     (service_role), qui dérive elle-même le user_id du JWT vérifié (jamais
--     du corps de la requête).
--
--   Les 3 Edge Functions (tmdb-search, sync-serie, update-user-status)
--   vérifient chacune le JWT de la requête auprès de Supabase Auth avant
--   toute action — il n'existe plus de secret partagé côté client (un secret
--   envoyé par le navigateur est par nature toujours extractible du bundle JS,
--   donc jamais réellement secret).
--
--   Ne PAS réintroduire de policy "FOR ALL ... USING (true)" sur les tables
--   utilisateur ou catalogue : c'est exactement la faille qui a été corrigée
--   (n'importe qui avec la clé anon pouvait écrire/supprimer les données de
--   tous les utilisateurs). Toute écriture doit passer par une Edge Function.
-- ============================================================================

-- ── 1. Activer RLS sur toutes les tables (si pas déjà fait) ─────────────────
ALTER TABLE series              ENABLE ROW LEVEL SECURITY;
ALTER TABLE saisons             ENABLE ROW LEVEL SECURITY;
ALTER TABLE themes              ENABLE ROW LEVEL SECURITY;
ALTER TABLE series_themes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE utilisateur_series  ENABLE ROW LEVEL SECURITY;
ALTER TABLE utilisateur_saisons ENABLE ROW LEVEL SECURITY;

-- ── 2. Catalogue : Lecture publique ─────────────────────────────────────────
CREATE POLICY "catalogue_select_public"
    ON series FOR SELECT
    TO anon, authenticated
    USING (true);

CREATE POLICY "saisons_select_public"
    ON saisons FOR SELECT
    TO anon, authenticated
    USING (true);

CREATE POLICY "themes_select_public"
    ON themes FOR SELECT
    TO anon, authenticated
    USING (true);

CREATE POLICY "series_themes_select_pub"
    ON series_themes FOR SELECT
    TO anon, authenticated
    USING (true);

-- ── 3. Catalogue : écriture — PAS de policy anon/authenticated ─────────────
-- Les upserts (sync-serie) passent par l'Edge Function avec service_role,
-- qui contourne RLS. Ne pas ajouter de policy d'écriture ici.

-- ── 4. Suivi utilisateur : Lecture réservée au propriétaire réel ───────────
CREATE POLICY "user_series_select_own"
    ON utilisateur_series FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

CREATE POLICY "user_saisons_select_own"
    ON utilisateur_saisons FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

-- ── 5. Suivi utilisateur : écriture — PAS de policy anon/authenticated ─────
-- Tous les changements de statut passent par l'Edge Function
-- update-user-status avec service_role. Ne pas ajouter de policy d'écriture
-- ici : c'est précisément ce qui permettait à n'importe qui de modifier les
-- données de n'importe quel utilisateur avant la correction de sécurité.

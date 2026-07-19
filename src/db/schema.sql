-- ============================================================================
-- SCHEMA DE BASE DE DONNÉES : GESTIONNAIRE DE SÉRIES TV (Supabase)
-- ============================================================================

-- 1. SUPPRESSION DES TABLES EXISTANTES
DROP TABLE IF EXISTS utilisateur_saisons CASCADE;
DROP TABLE IF EXISTS utilisateur_series CASCADE;
DROP TABLE IF EXISTS series_themes CASCADE;
DROP TABLE IF EXISTS themes CASCADE;
DROP TABLE IF EXISTS saisons CASCADE;
DROP TABLE IF EXISTS series CASCADE;

-- 2. CRÉATION DES TYPES ÉNUMÉRÉS
CREATE TYPE statut_production_enum AS ENUM ('En cours', 'Terminée');
CREATE TYPE statut_visionnage_enum AS ENUM ('A voir', 'Vue', 'En cours', 'Sans intérêt', 'Abandonnée', 'Peut-être', 'Terminée', 'Suivies');
CREATE TYPE statut_saison_enum AS ENUM ('Pas commencée', 'En cours', 'Terminée');

-- 3. CRÉATION DES TABLES PRINCIPALES
CREATE TABLE series (
    id SERIAL PRIMARY KEY,
    tmdb_id INT UNIQUE NOT NULL,
    titre VARCHAR(255) NOT NULL,
    synopsis TEXT,
    affiche_path VARCHAR(255),
    statut_production statut_production_enum NOT NULL DEFAULT 'En cours',
    derniere_maj_tmdb TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE themes (
    id SERIAL PRIMARY KEY,
    nom_theme VARCHAR(100) UNIQUE NOT NULL
);

CREATE TABLE series_themes (
    serie_id INT REFERENCES series(id) ON DELETE CASCADE,
    theme_id INT REFERENCES themes(id) ON DELETE CASCADE,
    PRIMARY KEY (serie_id, theme_id)
);

CREATE TABLE saisons (
    id SERIAL PRIMARY KEY,
    serie_id INT REFERENCES series(id) ON DELETE CASCADE,
    numero_saison INT NOT NULL,
    nombre_episodes INT DEFAULT 0,
    CONSTRAINT unique_saison_par_serie UNIQUE (serie_id, numero_saison)
);

-- 4. CRÉATION DES TABLES UTILISATEUR
CREATE TABLE utilisateur_series (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL, -- Authentification Supabase
    serie_id INT REFERENCES series(id) ON DELETE CASCADE,
    statut_visionnage statut_visionnage_enum NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_user_serie UNIQUE (user_id, serie_id)
);

CREATE TABLE utilisateur_saisons (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL,
    saison_id INT REFERENCES saisons(id) ON DELETE CASCADE,
    statut_saison statut_saison_enum NOT NULL DEFAULT 'Pas commencée',
    dernier_episode_vu INT DEFAULT 0,
    CONSTRAINT unique_user_saison UNIQUE (user_id, saison_id)
);

-- 5. INDEXATION DE PERFORMANCE
CREATE INDEX idx_series_themes_theme_id ON series_themes(theme_id);
CREATE INDEX idx_saisons_serie_id ON saisons(serie_id);
CREATE INDEX idx_user_series_statut ON utilisateur_series(user_id, statut_visionnage);
CREATE INDEX idx_user_saisons_saison ON utilisateur_saisons(user_id, saison_id);

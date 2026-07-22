import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

// 1. Lire et parser le fichier .env
const envPath = path.resolve('.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
    const parts = line.split('=');
    if (parts.length >= 2) {
        const key = parts[0].trim();
        const value = parts.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
        env[key] = value;
    }
});

const SUPABASE_URL = env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = env.VITE_SUPABASE_ANON_KEY;
const TMDB_ACCESS_TOKEN = env.TMDB_ACCESS_TOKEN;
const SERENITV_AUTH_EMAIL = env.SERENITV_AUTH_EMAIL;
const SERENITV_AUTH_PASSWORD = env.SERENITV_AUTH_PASSWORD;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !TMDB_ACCESS_TOKEN) {
    console.error('❌ Variables d\'environnement manquantes dans le fichier .env !');
    process.exit(1);
}
if (!SERENITV_AUTH_EMAIL || !SERENITV_AUTH_PASSWORD) {
    console.error('❌ SERENITV_AUTH_EMAIL / SERENITV_AUTH_PASSWORD manquants dans .env (nécessaires pour appeler les Edge Functions) !');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const EDGE_FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`;

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_HEADERS = {
    'Authorization': `Bearer ${TMDB_ACCESS_TOKEN}`,
    'Content-Type':  'application/json',
};

async function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function callEdgeFunction(name, payload, accessToken) {
    const response = await fetch(`${EDGE_FUNCTIONS_URL}/${name}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `Erreur ${name} (HTTP ${response.status})`);
    return data;
}

async function run() {
    try {
        console.log('🔐 Connexion au compte SéréniTV...');
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
            email: SERENITV_AUTH_EMAIL,
            password: SERENITV_AUTH_PASSWORD,
        });
        if (authError || !authData.session) {
            throw new Error(`Échec de connexion : ${authError?.message || 'session absente'}`);
        }
        const accessToken = authData.session.access_token;
        console.log('✅ Connecté.');

        console.log('🎬 Démarrage du scan TMDB Discover pour Netflix (réseau ID 213)...');
        const showIds = [];

        // 1. Récupérer les séries sur 5 pages
        for (let page = 1; page <= 5; page++) {
            console.log(`📡 Scan de la page ${page}/5...`);
            const url = `${TMDB_BASE_URL}/discover/tv?with_networks=213&sort_by=popularity.desc&language=fr-FR&page=${page}`;
            const res = await fetch(url, { headers: TMDB_HEADERS });
            if (!res.ok) throw new Error(`Discover API error page ${page}: ${res.status}`);

            const data = await res.json();
            (data.results || []).forEach(show => {
                if (show.id) showIds.push(show.id);
            });
        }

        console.log(`✅ Scan terminé. ${showIds.length} séries trouvées.`);
        console.log(`🚀 Synchronisation via sync-serie (une requête par série, débit régulé)...`);

        // 2. Synchroniser chaque série via l'Edge Function sync-serie, qui se charge
        // elle-même de récupérer les détails TMDB et d'upserter series/saisons/thèmes.
        let syncedCount = 0;
        for (let i = 0; i < showIds.length; i++) {
            const id = showIds[i];
            try {
                await callEdgeFunction('sync-serie', { tmdbId: id }, accessToken);
                syncedCount++;
                console.log(`   [${i + 1}/${showIds.length}] ✅ tmdb_id=${id} synchronisé.`);
            } catch (err) {
                console.warn(`   [${i + 1}/${showIds.length}] ⚠️ Échec pour tmdb_id=${id} :`, err.message);
            }
            await wait(150); // anti rate-limit (TMDB + Edge Function)
        }

        console.log(`\n🎉 FIN DU PEUPLEMENT ! ${syncedCount}/${showIds.length} séries synchronisées avec succès.`);
        process.exit(0);

    } catch (err) {
        console.error('❌ Erreur générale :', err);
        process.exit(1);
    }
}

run();

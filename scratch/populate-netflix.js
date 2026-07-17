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
const TMDB_ACCESS_TOKEN = env.VITE_TMDB_ACCESS_TOKEN;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !TMDB_ACCESS_TOKEN) {
    console.error('❌ Variables d\'environnement manquantes dans le fichier .env !');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_HEADERS = {
    'Authorization': `Bearer ${TMDB_ACCESS_TOKEN}`,
    'Content-Type':  'application/json',
};

async function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function mapperStatutTMDB(tmdbStatus) {
    return (tmdbStatus === 'Ended' || tmdbStatus === 'Canceled') ? 'Terminée' : 'En cours';
}

async function run() {
    try {
        console.log('🎬 Démarrage du scan TMDB Discover pour Netflix (reseau ID 213)...');
        const showIds = [];

        // 1. Récupérer les séries sur 5 pages
        for (let page = 1; page <= 5; page++) {
            console.log(`📡 Scan de la page ${page}/5...`);
            const url = `${TMDB_BASE_URL}/discover/tv?with_networks=213&sort_by=popularity.desc&language=fr-FR&page=${page}`;
            const res = await fetch(url, { headers: TMDB_HEADERS });
            if (!res.ok) throw new Error(`Discover API error page ${page}: ${res.status}`);
            
            const data = await res.json();
            const results = data.results || [];
            results.forEach(show => {
                if (show.id) showIds.push(show.id);
            });
        }

        console.log(`✅ Scan terminé. ${showIds.length} séries trouvées.`);
        console.log(`📡 Récupération des détails (watch_url, backdrop_path) avec un débit régulé...`);

        const seriesPayload = [];
        
        // Concurrence régulée : paquets de 10 requêtes simultanées
        const chunkSize = 10;
        for (let i = 0; i < showIds.length; i += chunkSize) {
            const chunk = showIds.slice(i, i + chunkSize);
            console.log(`⏳ Chargement des détails pour les séries ${i + 1} à ${Math.min(i + chunkSize, showIds.length)}...`);
            
            const promises = chunk.map(async (id) => {
                try {
                    const detailUrl = `${TMDB_BASE_URL}/tv/${id}?language=fr-FR&append_to_response=watch/providers`;
                    const res = await fetch(detailUrl, { headers: TMDB_HEADERS });
                    if (!res.ok) {
                        console.warn(`⚠️ Échec de chargement des détails pour tmdb_id=${id}`);
                        return null;
                    }
                    const d = await res.json();
                    
                    // Extraire watch_url
                    const providers = d["watch/providers"]?.results?.FR;
                    const hasNetflix = providers && (providers.flatrate || []).some(
                        p => p.provider_name && p.provider_name.toLowerCase().includes('netflix')
                    );
                    const watchUrl = hasNetflix ? (providers.link || null) : null;

                    return {
                        tmdb_id:           id,
                        titre:             d.name,
                        synopsis:          d.overview || d.original_name || '',
                        affiche_path:      d.poster_path || null,
                        backdrop_path:     d.backdrop_path || null,
                        statut_production: mapperStatutTMDB(d.status),
                        plateforme:        'Netflix',
                        watch_url:         watchUrl,
                    };
                } catch (err) {
                    console.error(`❌ Erreur lors du traitement de la série ${id}:`, err.message);
                    return null;
                }
            });

            const results = await Promise.all(promises);
            results.forEach(item => {
                if (item) seriesPayload.push(item);
            });

            // Petit délai pour ne pas saturer l'API
            await wait(100);
        }

        console.log(`🚀 Injection en masse de ${seriesPayload.length} séries dans Supabase (table series)...`);

        // Upsert par lots de 50 séries pour Supabase
        const dbChunkSize = 50;
        let insertedCount = 0;
        
        for (let i = 0; i < seriesPayload.length; i += dbChunkSize) {
            const batch = seriesPayload.slice(i, i + dbChunkSize);
            const { data, error } = await supabase
                .from('series')
                .upsert(batch, { onConflict: 'tmdb_id' })
                .select('id');

            if (error) {
                console.error(`❌ Erreur d'upsert pour le lot ${i + 1}-${i + dbChunkSize}:`, error);
            } else {
                insertedCount += (data || []).length;
                console.log(`   └─ Lot d'upsert réussi (${(data || []).length} lignes traitées).`);
            }
        }

        console.log(`\n🎉 FIN DU PEUPLEMENT ! ${insertedCount} séries ont été importées ou mises à jour avec succès dans Supabase.`);
        process.exit(0);

    } catch (err) {
        console.error('❌ Erreur générale :', err);
        process.exit(1);
    }
}

run();

import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

// 1. Charger et parser les clés d'accès depuis le fichier .env local
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
const MOCK_USER_ID = '00000000-0000-0000-0000-000000000001'; // Notre ID utilisateur mocké

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !TMDB_ACCESS_TOKEN) {
    console.error('❌ Variables d\'environnement manquantes dans le fichier .env !');
    process.exit(1);
}

// Initialiser le client Supabase
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_HEADERS = {
    'Authorization': `Bearer ${TMDB_ACCESS_TOKEN}`,
    'Content-Type':  'application/json',
};

// Configurer le chemin racine des dossiers locaux
const BASE_PATH = process.argv[2];

if (!BASE_PATH) {
    console.error('❌ Veuillez fournir le chemin absolu du dossier à scanner en paramètre.');
    console.error('Usage: node scratch/sync-local-folders.js "C:\\chemin\\vers\\series"');
    process.exit(1);
}

function cleanFolderTitle(folderName) {
    let title = folderName;
    // Enlever les balises de début/fin "-=-" ou tirets
    title = title.replace(/^[-=\s]+|[-=\s]+$/g, '');
    // Enlever le préfixe "FRED" si présent
    title = title.replace(/^FRED\s*[-=\s]*/i, '');
    // Couper au premier "Saison" ou "Saisons" (insensible à la casse)
    const indexSaison = title.search(/\bsaisons?\b/i);
    if (indexSaison !== -1) {
        title = title.substring(0, indexSaison);
    }
    // Nettoyer les tirets/espaces restants à la fin
    title = title.replace(/[-=\s]+$/g, '').trim();
    return title;
}

async function searchTVShow(title) {
    try {
        const url = `${TMDB_BASE_URL}/search/tv?query=${encodeURIComponent(title)}&language=fr-FR`;
        const res = await fetch(url, { headers: TMDB_HEADERS });
        if (!res.ok) return null;
        const data = await res.json();
        return data.results && data.results[0] ? data.results[0].id : null;
    } catch (e) {
        return null;
    }
}

async function fetchTVShowDetails(id) {
    try {
        const url = `${TMDB_BASE_URL}/tv/${id}?language=fr-FR&append_to_response=watch/providers`;
        const res = await fetch(url, { headers: TMDB_HEADERS });
        if (!res.ok) return null;
        const d = await res.json();
        
        // Récupérer watch_url Netflix
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
            statut_production: (d.status === 'Ended' || d.status === 'Canceled') ? 'Terminée' : 'En cours',
            plateforme:        d.networks?.[0]?.name || null,
            watch_url:         watchUrl,
        };
    } catch (e) {
        return null;
    }
}

async function run() {
    try {
        const absolutePath = path.resolve(BASE_PATH);
        if (!fs.existsSync(absolutePath)) {
            console.error(`❌ Le répertoire spécifié n'existe pas : ${absolutePath}`);
            process.exit(1);
        }

        console.log(`🎬 Démarrage du scan local pour : "${absolutePath}"...\n`);

        const jobs = [];

        // 1. Lister les dossiers racine pour "En cours" (hors dossiers de catégories)
        if (fs.existsSync(absolutePath)) {
            const rootEntries = fs.readdirSync(absolutePath, { withFileTypes: true });
            rootEntries.forEach(entry => {
                if (entry.isDirectory()) {
                    const name = entry.name;
                    // Exclure les dossiers de catégories
                    if (name.toLowerCase() !== 'séries terminées' && 
                        name.toLowerCase() !== 'series terminees' && 
                        name.toLowerCase() !== 'séries bof' && 
                        name.toLowerCase() !== 'series bof') {
                        jobs.push({ folderName: name, status: 'En cours', path: path.join(absolutePath, name) });
                    }
                }
            });
        }

        // 2. Lister le dossier "Séries Terminées" pour "Terminée"
        const termineesPath = path.join(absolutePath, 'Séries Terminées');
        if (fs.existsSync(termineesPath)) {
            const entries = fs.readdirSync(termineesPath, { withFileTypes: true });
            entries.forEach(entry => {
                if (entry.isDirectory()) {
                    jobs.push({ folderName: entry.name, status: 'Terminée', path: path.join(termineesPath, entry.name) });
                }
            });
        } else {
            // Test avec orthographe alternative sans accent
            const termineesPathNoAccent = path.join(absolutePath, 'Series Terminees');
            if (fs.existsSync(termineesPathNoAccent)) {
                const entries = fs.readdirSync(termineesPathNoAccent, { withFileTypes: true });
                entries.forEach(entry => {
                    if (entry.isDirectory()) {
                        jobs.push({ folderName: entry.name, status: 'Terminée', path: path.join(termineesPathNoAccent, entry.name) });
                    }
                });
            }
        }

        // 3. Lister le dossier "Séries Bof" pour "Abandonnée"
        const bofPath = path.join(absolutePath, 'Séries Bof');
        if (fs.existsSync(bofPath)) {
            const entries = fs.readdirSync(bofPath, { withFileTypes: true });
            entries.forEach(entry => {
                if (entry.isDirectory()) {
                    jobs.push({ folderName: entry.name, status: 'Abandonnée', path: path.join(bofPath, entry.name) });
                }
            });
        } else {
            const bofPathNoAccent = path.join(absolutePath, 'Series Bof');
            if (fs.existsSync(bofPathNoAccent)) {
                const entries = fs.readdirSync(bofPathNoAccent, { withFileTypes: true });
                entries.forEach(entry => {
                    if (entry.isDirectory()) {
                        jobs.push({ folderName: entry.name, status: 'Abandonnée', path: path.join(bofPathNoAccent, entry.name) });
                    }
                });
            }
        }

        console.log(`📋 Total de séries à synchroniser détectées : ${jobs.length}`);

        let syncSuccessCount = 0;

        for (let i = 0; i < jobs.length; i++) {
            const job = jobs[i];
            const cleanTitle = cleanFolderTitle(job.folderName);
            console.log(`\n[${i+1}/${jobs.length}] ⚙️ Traitement de : "${job.folderName}"`);
            console.log(`   👉 Titre nettoyé : "${cleanTitle}" | Statut cible : [${job.status}]`);

            console.log(`   🔎 Recherche TMDB...`);
            const tmdbId = await searchTVShow(cleanTitle);
            if (!tmdbId) {
                console.warn(`   ❌ Non trouvée sur TMDB : "${cleanTitle}"`);
                continue;
            }

            const details = await fetchTVShowDetails(tmdbId);
            if (!details) {
                console.warn(`   ❌ Échec de récupération des détails pour tmdb_id=${tmdbId}`);
                continue;
            }

            // 1. Enregistrer les métadonnées de la série
            const { data: serieData, error: serieError } = await supabase
                .from('series')
                .upsert(details, { onConflict: 'tmdb_id' })
                .select('id')
                .single();

            if (serieError || !serieData) {
                console.error(`   ❌ Échec d'enregistrement de la série :`, serieError);
                continue;
            }

            const dbId = serieData.id;

            // 2. Lier le statut utilisateur correspondant (En cours, Terminée, Abandonnée)
            const { error: userError } = await supabase
                .from('utilisateur_series')
                .upsert({
                    user_id: MOCK_USER_ID,
                    serie_id: dbId,
                    statut_visionnage: job.status,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'user_id, serie_id' });

            if (userError) {
                console.error(`   ❌ Échec d'association du statut utilisateur :`, userError);
            } else {
                console.log(`   ✅ Synchronisée : "${details.titre}" → Statut : [${job.status}]`);
                syncSuccessCount++;
            }

            // Délai de précaution anti rate-limit
            await new Promise(resolve => setTimeout(resolve, 150));
        }

        console.log(`\n🎉 FIN DE LA SYNCHRONISATION ! ${syncSuccessCount}/${jobs.length} séries ont été importées ou mises à jour avec succès dans Supabase.`);
        process.exit(0);
    } catch (err) {
        console.error('❌ Erreur générale de synchronisation :', err);
        process.exit(1);
    }
}

run();

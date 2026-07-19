import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-app-secret',
};

const APP_SHARED_SECRET = Deno.env.get('APP_SHARED_SECRET');

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

const STATUTS_VISIONNAGE = ['A voir', 'En cours', 'Suivies', 'Terminée', 'Abandonnée', 'Peut-être', 'Sans intérêt'];
const STATUTS_SAISON = ['Pas commencée', 'En cours', 'Terminée'];

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (APP_SHARED_SECRET && req.headers.get('x-app-secret') !== APP_SHARED_SECRET) {
    return jsonResponse({ error: 'unauthorized' }, 401);
  }

  try {
    const body = await req.json();
    const { action, userId } = body;

    if (!userId || typeof userId !== 'string') {
      return jsonResponse({ error: 'userId manquant' }, 400);
    }

    switch (action) {
      case 'update_saison_statut': {
        const saisonId = parseInt(body.saisonId);
        const statut = body.statut;
        if (!saisonId || !STATUTS_SAISON.includes(statut)) {
          return jsonResponse({ error: 'paramètres invalides' }, 400);
        }
        const { error } = await supabase
          .from('utilisateur_saisons')
          .upsert({ user_id: userId, saison_id: saisonId, statut_saison: statut }, { onConflict: 'user_id, saison_id' });
        if (error) throw error;
        return jsonResponse({ success: true });
      }

      case 'update_statut_global': {
        const serieId = parseInt(body.serieId);
        const statut = body.statut;
        if (!serieId || !STATUTS_VISIONNAGE.includes(statut)) {
          return jsonResponse({ error: 'paramètres invalides' }, 400);
        }
        const { error } = await supabase
          .from('utilisateur_series')
          .upsert(
            { user_id: userId, serie_id: serieId, statut_visionnage: statut, updated_at: new Date().toISOString() },
            { onConflict: 'user_id, serie_id' }
          );
        if (error) throw error;
        return jsonResponse({ success: true });
      }

      case 'apply_saisons_statuts': {
        const serieId = parseInt(body.serieId);
        const numeroSaison = parseInt(body.numeroSaison);
        const statutGlobal = body.statutGlobal;
        const statutSaisonPivot = body.statutSaisonPivot || 'En cours';

        if (!serieId || !numeroSaison || !STATUTS_VISIONNAGE.includes(statutGlobal) || !STATUTS_SAISON.includes(statutSaisonPivot)) {
          return jsonResponse({ error: 'paramètres invalides' }, 400);
        }

        const { data: saisons, error: saisonsError } = await supabase
          .from('saisons')
          .select('id, numero_saison')
          .eq('serie_id', serieId)
          .order('numero_saison');
        if (saisonsError) throw saisonsError;
        if (!saisons || saisons.length === 0) {
          return jsonResponse({ error: 'Aucune saison trouvée' }, 404);
        }

        const saisonsPayload = saisons.map((s: any) => ({
          user_id: userId,
          saison_id: s.id,
          statut_saison:
            s.numero_saison < numeroSaison ? 'Terminée'
              : s.numero_saison === numeroSaison ? statutSaisonPivot
              : 'Pas commencée',
        }));

        const { error: upsertError } = await supabase
          .from('utilisateur_saisons')
          .upsert(saisonsPayload, { onConflict: 'user_id, saison_id' });
        if (upsertError) throw upsertError;

        const { error: serieError } = await supabase
          .from('utilisateur_series')
          .upsert(
            { user_id: userId, serie_id: serieId, statut_visionnage: statutGlobal, updated_at: new Date().toISOString() },
            { onConflict: 'user_id, serie_id' }
          );
        if (serieError) throw serieError;

        return jsonResponse({ success: true });
      }

      default:
        return jsonResponse({ error: 'action inconnue' }, 400);
    }
  } catch (err) {
    return jsonResponse({ error: err.message }, 500);
  }
});

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = ['https://sereni-tv.vercel.app'];

function corsHeadersFor(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') || '';
  const isAllowed = ALLOWED_ORIGINS.includes(origin) || /^http:\/\/localhost:\d+$/.test(origin);
  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const supabase = createClient(
  SUPABASE_URL,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

const STATUTS_VISIONNAGE = ['A voir', 'En cours', 'Suivies', 'Terminée', 'Abandonnée', 'Peut-être', 'Sans intérêt'];
const STATUTS_SAISON = ['Pas commencée', 'En cours', 'Terminée'];

function jsonResponse(corsHeaders: Record<string, string>, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Vérifie le JWT de la requête auprès de Supabase Auth : le userId vient
// désormais TOUJOURS du token vérifié, jamais du corps de la requête
// (sinon n'importe quel appelant authentifié pourrait écrire pour un autre user_id).
async function getAuthenticatedUserId(req: Request): Promise<string | null> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return null;
  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data, error } = await authClient.auth.getUser();
  if (error || !data.user) return null;
  return data.user.id;
}

Deno.serve(async (req: Request) => {
  const corsHeaders = corsHeadersFor(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const userId = await getAuthenticatedUserId(req);
  if (!userId) {
    return jsonResponse(corsHeaders, { error: 'unauthorized' }, 401);
  }

  try {
    const body = await req.json();
    const { action } = body;

    switch (action) {
      case 'update_saison_statut': {
        const saisonId = parseInt(body.saisonId);
        const statut = body.statut;
        if (!saisonId || !STATUTS_SAISON.includes(statut)) {
          return jsonResponse(corsHeaders, { error: 'paramètres invalides' }, 400);
        }
        const { error } = await supabase
          .from('utilisateur_saisons')
          .upsert({ user_id: userId, saison_id: saisonId, statut_saison: statut }, { onConflict: 'user_id, saison_id' });
        if (error) throw error;
        return jsonResponse(corsHeaders, { success: true });
      }

      case 'update_statut_global': {
        const serieId = parseInt(body.serieId);
        const statut = body.statut;
        if (!serieId || !STATUTS_VISIONNAGE.includes(statut)) {
          return jsonResponse(corsHeaders, { error: 'paramètres invalides' }, 400);
        }
        const { error } = await supabase
          .from('utilisateur_series')
          .upsert(
            { user_id: userId, serie_id: serieId, statut_visionnage: statut, updated_at: new Date().toISOString() },
            { onConflict: 'user_id, serie_id' }
          );
        if (error) throw error;
        return jsonResponse(corsHeaders, { success: true });
      }

      case 'apply_saisons_statuts': {
        const serieId = parseInt(body.serieId);
        const numeroSaison = parseInt(body.numeroSaison);
        const statutGlobal = body.statutGlobal;
        const statutSaisonPivot = body.statutSaisonPivot || 'En cours';

        if (!serieId || !numeroSaison || !STATUTS_VISIONNAGE.includes(statutGlobal) || !STATUTS_SAISON.includes(statutSaisonPivot)) {
          return jsonResponse(corsHeaders, { error: 'paramètres invalides' }, 400);
        }

        const { data: saisons, error: saisonsError } = await supabase
          .from('saisons')
          .select('id, numero_saison')
          .eq('serie_id', serieId)
          .order('numero_saison');
        if (saisonsError) throw saisonsError;
        if (!saisons || saisons.length === 0) {
          return jsonResponse(corsHeaders, { error: 'Aucune saison trouvée' }, 404);
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

        return jsonResponse(corsHeaders, { success: true });
      }

      default:
        return jsonResponse(corsHeaders, { error: 'action inconnue' }, 400);
    }
  } catch (err) {
    return jsonResponse(corsHeaders, { error: err.message }, 500);
  }
});

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
const TYPES_VALIDES = ['Bug', 'Idée', 'Autre'];

const supabase = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

function jsonResponse(corsHeaders: Record<string, string>, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function getAuthenticatedUser(req: Request): Promise<{ id: string; email: string } | null> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return null;
  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data, error } = await authClient.auth.getUser();
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? '' };
}

Deno.serve(async (req: Request) => {
  const corsHeaders = corsHeadersFor(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const user = await getAuthenticatedUser(req);
  if (!user) {
    return jsonResponse(corsHeaders, { error: 'unauthorized' }, 401);
  }

  try {
    // Vérifie que le compte est bien approuvé avant d'accepter un retour
    const { data: profil, error: profilError } = await supabase
      .from('profils_utilisateurs')
      .select('statut_acces')
      .eq('id', user.id)
      .single();
    if (profilError) throw profilError;
    if (!profil || profil.statut_acces !== 'valide') {
      return jsonResponse(corsHeaders, { error: 'compte non validé' }, 403);
    }

    const body = await req.json();
    const type = body.type;
    const titre = String(body.titre || '').trim();
    const description = String(body.description || '').trim();

    if (!TYPES_VALIDES.includes(type) || !titre) {
      return jsonResponse(corsHeaders, { error: 'paramètres invalides' }, 400);
    }

    const { data, error } = await supabase
      .from('retours_utilisateurs')
      .insert({ auteur_id: user.id, email: user.email, type, titre, description })
      .select()
      .single();
    if (error) throw error;

    return jsonResponse(corsHeaders, { success: true, retour: data });
  } catch (err) {
    return jsonResponse(corsHeaders, { error: err.message }, 500);
  }
});

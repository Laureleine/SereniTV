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
const OWNER_ID = 'e062f101-98f4-4d4f-818f-134add366f28';

const supabase = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

function jsonResponse(corsHeaders: Record<string, string>, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

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
  if (!userId || userId !== OWNER_ID) {
    return jsonResponse(corsHeaders, { error: 'unauthorized' }, 401);
  }

  try {
    const body = await req.json();
    const { action, targetUserId } = body;
    if (!targetUserId) {
      return jsonResponse(corsHeaders, { error: 'targetUserId manquant' }, 400);
    }

    if (action === 'approve' || action === 'reject') {
      const statut = action === 'approve' ? 'valide' : 'refuse';
      const { error } = await supabase
        .from('profils_utilisateurs')
        .update({
          statut_acces: statut,
          valide_at: action === 'approve' ? new Date().toISOString() : null,
        })
        .eq('id', targetUserId);
      if (error) throw error;
      return jsonResponse(corsHeaders, { success: true });
    }

    return jsonResponse(corsHeaders, { error: 'action inconnue' }, 400);
  } catch (err) {
    return jsonResponse(corsHeaders, { error: err.message }, 500);
  }
});

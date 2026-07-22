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

  if (!(await getAuthenticatedUserId(req))) {
    return jsonResponse(corsHeaders, { error: 'unauthorized' }, 401);
  }

  try {
    const body = await req.json();
    const { action } = body;
    const serieId = parseInt(body.serieId);
    if (!serieId) {
      return jsonResponse(corsHeaders, { error: 'serieId manquant' }, 400);
    }

    switch (action) {
      case 'add_theme': {
        const nomTheme = String(body.nomTheme || '').trim();
        if (!nomTheme) {
          return jsonResponse(corsHeaders, { error: 'nomTheme manquant' }, 400);
        }

        const { data: themeRow, error: themeError } = await supabase
          .from('themes')
          .upsert({ nom_theme: nomTheme }, { onConflict: 'nom_theme' })
          .select('id, nom_theme')
          .single();
        if (themeError) throw themeError;

        const { error: linkError } = await supabase
          .from('series_themes')
          .upsert(
            { serie_id: serieId, theme_id: themeRow.id },
            { onConflict: 'serie_id, theme_id', ignoreDuplicates: true }
          );
        if (linkError) throw linkError;

        return jsonResponse(corsHeaders, { success: true, theme: themeRow });
      }

      case 'remove_theme': {
        const themeId = parseInt(body.themeId);
        if (!themeId) {
          return jsonResponse(corsHeaders, { error: 'themeId manquant' }, 400);
        }

        const { error } = await supabase
          .from('series_themes')
          .delete()
          .eq('serie_id', serieId)
          .eq('theme_id', themeId);
        if (error) throw error;

        return jsonResponse(corsHeaders, { success: true });
      }

      default:
        return jsonResponse(corsHeaders, { error: 'action inconnue' }, 400);
    }
  } catch (err) {
    return jsonResponse(corsHeaders, { error: err.message }, 500);
  }
});

// CORS設定（Edge Function間で共有）

const allowedOrigin = Deno.env.get('NEXT_PUBLIC_APP_URL') || 'https://dayopt.app';

export const corsHeaders = {
  'Access-Control-Allow-Origin': allowedOrigin,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

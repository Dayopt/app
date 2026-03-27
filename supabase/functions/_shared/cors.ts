// CORS設定（Edge Function間で共有）

const allowedOrigin = Deno.env.get('NEXT_PUBLIC_APP_URL') || 'https://app.dayopt.app';

export const corsHeaders = {
  'Access-Control-Allow-Origin': allowedOrigin,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

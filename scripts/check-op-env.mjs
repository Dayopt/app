const requiredEnvNames = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'NEXT_PUBLIC_APP_URL',
];

let hasMissing = false;

for (const name of requiredEnvNames) {
  const exists = Boolean(process.env[name]);
  console.log(`${name}: ${exists ? 'OK' : 'MISSING'}`);
  if (!exists) hasMissing = true;
}

if (hasMissing) {
  process.exitCode = 1;
}

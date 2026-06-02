import { envSchema } from './schema';

type Status = 'OK' | 'EMPTY' | 'MISSING';

function getStatus(envName: string): Status {
  if (!(envName in process.env)) return 'MISSING';
  const value = process.env[envName];
  if (value === undefined || value.trim() === '') return 'EMPTY';
  return 'OK';
}

let hasFailure = false;

for (const entry of envSchema) {
  const status = getStatus(entry.envName);
  if (entry.required || status === 'EMPTY') {
    console.log(`${entry.envName}: ${status}`);
  }
  if (entry.required && status !== 'OK') {
    hasFailure = true;
  }
}

if (hasFailure) {
  process.exitCode = 1;
}

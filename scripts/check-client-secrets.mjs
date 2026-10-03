#!/usr/bin/env node
// Fails if anything resembling a server secret ends up in the browser bundle
// (CONTEXT.md section 11: "No service key in client bundle").
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const dist = process.argv[2] ?? 'apps/web/dist';

const forbidden = [
  { name: 'service_role env name', re: /SUPABASE_SERVICE_ROLE_KEY/ },
  // "role":"service_role" inside a JWT payload, base64url-encoded at each byte offset
  {
    name: 'service_role JWT',
    re: /InJvbGUiOiJzZXJ2aWNlX3JvbGU|yb2xlIjoic2VydmljZV9yb2xl|cm9sZSI6InNlcnZpY2Vfcm9sZ/,
  },
  { name: 'Supabase secret key', re: /sb_secret_[A-Za-z0-9_-]{10,}/ },
  { name: 'Anthropic key', re: /sk-ant-[A-Za-z0-9_-]{10,}/ },
  { name: 'OpenAI key', re: /sk-(proj-)?[A-Za-z0-9]{32,}/ },
  { name: 'Google API key', re: /AIza[0-9A-Za-z_-]{35}/ },
];

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* walk(path);
    else yield path;
  }
}

let failures = 0;
try {
  statSync(dist);
} catch {
  console.error(`check-client-secrets: ${dist} not found; build the web app first.`);
  process.exit(1);
}

for (const file of walk(dist)) {
  if (!/\.(js|mjs|html|css|json|map|txt)$/.test(file)) continue;
  const text = readFileSync(file, 'utf8');
  for (const { name, re } of forbidden) {
    if (re.test(text)) {
      console.error(`✗ ${name} found in ${file}`);
      failures++;
    }
  }
}

if (failures) process.exit(1);
console.log(`✓ no server secrets in ${dist}`);

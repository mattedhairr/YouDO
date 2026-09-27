import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Each suite owns its in-memory database. Run sequentially to bound WASM memory.
for (const file of readdirSync(new URL('.', import.meta.url)).filter(name => /^test-.+-sql\.mjs$/.test(name)).sort()) {
  console.log(`\nSQL suite: ${file}`);
  const result = spawnSync(process.execPath, [fileURLToPath(new URL(file, import.meta.url))], {
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

import { cp, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const source = new URL('../', import.meta.url);
const target = new URL('.supabase-work/supabase/', source);
await mkdir(target, { recursive: true });
for (const path of ['config.toml', 'migrations', 'functions']) {
  await cp(new URL(path, source), new URL(path, target), { recursive: true });
}
console.log(`Staged canonical backend sources at ${fileURLToPath(target)}`);

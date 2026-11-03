// Nightly: the whole nba_picks ledger → gdrive:nba-research-dashboard-backups/<date>/nba_picks.json.gz.
// The Drive copy is the offsite record; Supabase is the working copy on a shared
// 500 MB plan. Same user-OAuth rclone remote as the other labs.
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { writeFileSync, mkdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { sbAll } from './lib/sb.mjs';
import { etDate } from './lib/nba-data.mjs';
import { spawnSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rows = await sbAll('nba_picks?select=*&order=id');
const dir = join(ROOT, 'scripts/out/backup'); mkdirSync(dir, { recursive: true });
const f = join(dir, 'nba_picks.json.gz'); writeFileSync(f, gzipSync(JSON.stringify(rows)));
const r = spawnSync('rclone', ['copyto', f, `gdrive:nba-research-dashboard-backups/${etDate()}/nba_picks.json.gz`], { encoding: 'utf8' });
if (r.status !== 0) { console.error(r.stderr); process.exit(1); }
console.log(`[backup] ${rows.length} nba_picks rows → gdrive:nba-research-dashboard-backups/${etDate()}/`);

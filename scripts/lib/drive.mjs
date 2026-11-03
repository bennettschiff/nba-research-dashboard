// Google Drive via rclone — the lab's durable store for everything bulky.
//
// Supabase holds ONE table (nba_picks, the graded ledger). Everything else —
// season box-score logs, every odds snapshot, every published slate, DARKO
// snapshots, the Mac job's stats.nba.com tables, nightly ledger backups — lives
// under one Drive folder. Same rclone remote and user-OAuth config as the
// MLB/WNBA/NFL/NHL labs (`RCLONE_CONF` secret in CI). Never switch it to a
// Google service account: SA uploads count against the SA's own 15 GB quota.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export const DRIVE_ROOT = process.env.NBA_DRIVE_ROOT || 'gdrive:nba-research-dashboard-archive';

const haveRclone = () => spawnSync('rclone', ['version'], { stdio: 'ignore' }).status === 0;

function rclone(args) {
  const r = spawnSync('rclone', args, { encoding: 'utf8' });
  return { ok: r.status === 0, out: (r.stdout || '') + (r.stderr || '') };
}

/** File names in one Drive folder (not recursive); [] without rclone or the folder. */
export function listFiles(remoteRel) {
  if (!haveRclone()) return [];
  const r = rclone(['lsf', '--files-only', `${DRIVE_ROOT}/${remoteRel}`]);
  return r.ok ? r.out.split('\n').map((s) => s.trim()).filter(Boolean) : [];
}

/** Copy one Drive file down. Missing on Drive → false (not an error: first run). */
export function pullFile(remoteRel, localPath) {
  if (!haveRclone()) return false;
  mkdirSync(dirname(localPath), { recursive: true });
  const r = rclone(['copyto', `${DRIVE_ROOT}/${remoteRel}`, localPath]);
  return r.ok && existsSync(localPath);
}

/** Copy one local file up. Throws on failure: an archive that silently did not land is the one failure that cannot be recovered later. */
export function pushFile(localPath, remoteRel) {
  if (!haveRclone()) { console.warn(`[drive] rclone missing — NOT archived: ${remoteRel}`); return false; }
  const r = rclone(['copyto', localPath, `${DRIVE_ROOT}/${remoteRel}`]);
  if (!r.ok) throw new Error(`[drive] upload failed ${remoteRel}: ${r.out.slice(0, 300)}`);
  return true;
}

export function pushDir(localDir, remoteRel) {
  if (!haveRclone()) { console.warn(`[drive] rclone missing — NOT archived: ${remoteRel}/`); return false; }
  const r = rclone(['copy', localDir, `${DRIVE_ROOT}/${remoteRel}`, '--transfers', '4']);
  if (!r.ok) throw new Error(`[drive] upload failed ${remoteRel}/: ${r.out.slice(0, 300)}`);
  return true;
}

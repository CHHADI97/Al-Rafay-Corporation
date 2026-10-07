/**
 * Set or generate the emergency dashboard password.
 *
 *   npm run password                     → generate a random password and print it
 *   npm run password -- "my long pass"   → set a specific password (12+ characters)
 *   npm run password -- --disable        → remove the password (Google sign-in only)
 *
 * Restart the server afterwards so it picks up the new hash.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { DATA_DIR, SUPABASE_ENABLED } from '../src/config.mjs';
import { makePasswordRecord } from '../src/auth.mjs';

const args = process.argv.slice(2);
const file = path.join(DATA_DIR, 'owner-auth.json');

async function writeRecord(record) {
  if (SUPABASE_ENABLED) {
    console.log('Supabase storage is configured. Change the password inside the dashboard instead:');
    console.log('  Admin → Access → Emergency password');
    process.exit(1);
  }
  await fs.mkdir(DATA_DIR, { recursive: true, mode: 0o700 });
  await fs.writeFile(file, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });
}

if (args[0] === '--disable') {
  await writeRecord(null);
  console.log('Emergency password removed. Google sign-in is now the only way into /admin.');
} else {
  const provided = args.join(' ').trim();
  const password = provided || randomBytes(15).toString('base64url');
  if (password.length < 12) {
    console.error('Choose a password of at least 12 characters.');
    process.exit(1);
  }
  await writeRecord(makePasswordRecord(password));
  console.log('\nEmergency password updated.');
  console.log(`  Password: ${password}`);
  console.log('  Sign in at /admin → Emergency password.');
  console.log('  Restart the server, then disable this fallback in Admin → Access once Google works.\n');
}

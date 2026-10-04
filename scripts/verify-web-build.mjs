import { readFileSync, readdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import assert from 'node:assert/strict';

const root = new URL('../dist/', import.meta.url);
const html = readFileSync(new URL('index.html', root), 'utf8');
const worker = readFileSync(new URL('sw.js', root), 'utf8');
const entry = html.match(/<script[^>]+src="\/([^"\s]+\.js)"/)[1];
const source = readFileSync(new URL(entry, root));
assert.ok(source.length < 720_000, `Initial JS exceeds 720 kB: ${source.length}`);
assert.ok(gzipSync(source).length < 200_000, 'Initial compressed JS exceeds 200 kB');
// A missing lazy chunk in the precache would break an unvisited offline view.
for (const name of readdirSync(new URL('assets/', root))) {
  if (/\.(js|css)$/.test(name)) assert.ok(worker.includes(`assets/${name}`), `Not precached: ${name}`);
}
assert.ok(worker.includes('clientsClaim()'), 'The first page must be controlled after worker activation');
assert.ok(worker.includes('self.skipWaiting()') && !worker.includes('SKIP_WAITING'), 'Manual registration requires an immediately activating worker, not a waiting-message-only worker');
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const version = readFileSync(new URL('../src/lib/version.ts', import.meta.url), 'utf8');
const gradle = readFileSync(new URL('../android/app/build.gradle', import.meta.url), 'utf8');
assert.equal(version.match(/APP_VERSION = '([^']+)'/)[1], pkg.version);
assert.equal(gradle.match(/versionName "([^"]+)"/)[1], pkg.version);
console.log(`Web build verified: initial JS ${source.length} bytes (${gzipSync(source).length} gzip), deferred assets precached, version ${pkg.version}`);

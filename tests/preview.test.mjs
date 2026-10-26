import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { bundlePreviewModules } from '../scripts/preview.mjs';

test('offline preview modules have no imports or duplicate declarations with LF or CRLF sources', async () => {
  const sources = await Promise.all(['lib.mjs', 'catalogue.mjs', 'batch.mjs', 'app.mjs'].map(file => readFile(new URL(`../public/${file}`, import.meta.url), 'utf8')));
  for (const newline of ['\n', '\r\n']) {
    const bundled = bundlePreviewModules(sources.map(source => source.replace(/\r?\n/g, newline)));
    assert.doesNotMatch(bundled, /^import /m);
    const parsed = spawnSync(process.execPath, ['--check', '--input-type=module'], { input: bundled, encoding: 'utf8' });
    assert.equal(parsed.status, 0, parsed.stderr || parsed.error?.message);
  }
});

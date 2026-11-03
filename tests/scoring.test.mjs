import test from 'node:test';
import assert from 'node:assert/strict';
import { BANDS, TRAINING_BANDS, TEMPLATE_CONTEST_BASELINE, bandFor, scoreGuidance } from '../public/lib.mjs';

test('contest suitability combines 0 through +2 while training keeps its own scale', () => {
  assert.equal(bandFor(0), bandFor(2));
  assert.notEqual(bandFor(2), bandFor(3));
  assert.equal(bandFor(0, 'training').label, '一般');
  assert.notEqual(bandFor(0, 'training'), bandFor(2, 'training'));
  assert.notEqual(bandFor(-6, 'training').label, bandFor(-6, 'contest').label);
  assert.ok(scoreGuidance('contest').includes(String(TEMPLATE_CONTEST_BASELINE)));
  assert.doesNotMatch(scoreGuidance('training'), /-6|−6/);
});

test('each purpose assigns exactly one band to every supported integer score', () => {
  for (const [purpose, bands] of [['contest', BANDS], ['training', TRAINING_BANDS]]) {
    for (let score = -10; score <= 10; score++) {
      const matches = bands.filter(b => score >= b.min && score <= b.max);
      assert.equal(matches.length, 1, `${purpose} ${score}`);
      assert.equal(bandFor(score, purpose), matches[0]);
    }
  }
});

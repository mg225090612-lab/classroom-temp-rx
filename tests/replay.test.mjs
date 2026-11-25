// T2 · F-04 기록 재생: HAIP 시험일(287개)을 서비스 코드로 다시 계산해 노트북(Keras) 결과와 비교
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeFeatures, predictChange } from '../js/model.js';

const dir = new URL('..', import.meta.url);
const model = JSON.parse(readFileSync(new URL('model/forecast_model.json', dir)));
const fx = JSON.parse(readFileSync(new URL('tests/fixture_replay.json', dir)));
const [head, ...lines] = readFileSync(new URL('data/demo_replay.csv', dir), 'utf8').trim().split('\n');
const cols = head.split(',');
const rows = lines.map(l => Object.fromEntries(l.split(',').map((v, i) => [cols[i], Number(v)])));
const byRow = new Map(rows.map(r => [r.row, r]));

test('재생 287개: 서비스 예측 = HAIP 노트북 예측, 오차 0.41 < 그대로 0.61', () => {
  let maxDiff = 0, errAI = 0, errBase = 0;
  fx.rows.forEach((t, k) => {
    const win = [];
    for (let r = t - 5; r <= t; r++) { const x = byRow.get(r); win.push({ temp: x.temp_C, humid: x.humid_pct, press: x.press_hPa, motion: x.motion }); }
    const p = predictChange(model, makeFeatures(win));
    maxDiff = Math.max(maxDiff, Math.abs(p - fx.pred_change[k]));
    const actual = byRow.get(t + 6).temp_C - byRow.get(t).temp_C;
    errAI += Math.abs(p - actual); errBase += Math.abs(actual);
  });
  const n = fx.rows.length, mae = errAI / n, base = errBase / n;
  console.log(JSON.stringify({ n, maxDiff, mae: +mae.toFixed(4), base: +base.toFixed(4) }));
  assert.equal(n, 287);
  assert.ok(maxDiff < 1e-4, `노트북과 차이 ${maxDiff}`);
  assert.ok(mae < base, 'AI 오차가 그대로 두기보다 작아야 함');
});

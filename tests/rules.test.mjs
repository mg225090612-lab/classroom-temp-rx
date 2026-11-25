// T1 · F-03 처방 정답표 20개 — 기획서 5번 처방 규칙에서 손으로 정한 정답
import test from 'node:test';
import assert from 'node:assert/strict';
import { prescribe } from '../js/rules.js';

// [번호, 상황, 입력, 정답]
const TABLE = [
  [1, '추운 아침', { indoor: 18.0, outdoor: 3.0 }, { mode: 'heat', set: 20 }],
  [2, '20°C 바로 아래', { indoor: 19.9, outdoor: 5.0 }, { mode: 'heat', set: 20 }],
  [3, '경계 20.0°C', { indoor: 20.0, outdoor: 5.0 }, { mode: 'off', set: null }],
  [4, '19.96은 반올림해 20.0', { indoor: 19.96, outdoor: 5.0 }, { mode: 'off', set: null }],
  [5, '경계 26.0°C', { indoor: 26.0, outdoor: 30.0 }, { mode: 'off', set: null }],
  [6, '조금 더움, 바깥 30', { indoor: 26.5, outdoor: 30.0 }, { mode: 'cool', set: 26 }],
  [7, '바깥 32 → 27', { indoor: 27.0, outdoor: 32.0 }, { mode: 'cool', set: 27 }],
  [8, '바깥 33.4 → 28', { indoor: 27.5, outdoor: 33.4 }, { mode: 'cool', set: 28 }],
  [9, '바깥 37 → 28, 차이 9 주의', { indoor: 28.0, outdoor: 37.0 }, { mode: 'cool', set: 28, caution: true }],
  [10, '바깥 36 → 28, 차이 8은 주의 아님', { indoor: 27.0, outdoor: 36.0 }, { mode: 'cool', set: 28, caution: false }],
  [11, '더운데 바깥이 더 시원', { indoor: 27.0, outdoor: 24.0 }, { mode: 'vent', set: null }],
  [12, '추운데 바깥이 더 따뜻', { indoor: 18.0, outdoor: 22.0 }, { mode: 'vent', set: null }],
  [13, '바깥 기온 없음, 추움', { indoor: 18.0, outdoor: null }, { mode: 'heat', set: 20 }],
  [14, '바깥 기온 없음, 더움', { indoor: 27.0, outdoor: null }, { mode: 'cool', set: 26 }],
  [15, 'AI: 지금 19 → 30분 뒤 20.4', { indoor: 19.0, outdoor: 5.0, forecast: 20.4 }, { mode: 'off', set: null }],
  [16, 'AI: 지금 25 → 30분 뒤 26.6', { indoor: 25.0, outdoor: 31.0, forecast: 26.6 }, { mode: 'cool', set: 26 }],
  [17, 'AI: 지금 21 → 30분 뒤 19.2', { indoor: 21.0, outdoor: 4.0, forecast: 19.2 }, { mode: 'heat', set: 20 }],
  [18, '창문 열림, 추움', { indoor: 18.0, outdoor: 3.0, windowOpen: true }, { mode: 'pause', set: null, after: 'heat' }],
  [19, '창문 열림, 더움', { indoor: 27.0, outdoor: 32.0, windowOpen: true }, { mode: 'pause', set: null, after: 'cool' }],
  [20, '바깥과 같으면 냉난방', { indoor: 19.0, outdoor: 19.0 }, { mode: 'heat', set: 20 }],
];

for (const [n, name, input, want] of TABLE) {
  test(`정답표 ${n}: ${name}`, () => {
    const rx = prescribe(input);
    assert.equal(rx.mode, want.mode);
    assert.equal(rx.set, want.set);
    if ('caution' in want) assert.equal(!!rx.caution, want.caution);
    if (want.after) assert.equal(rx.after.mode, want.after);
    assert.ok(rx.reason && rx.reason.length > 5, '이유가 있어야 함');
  });
}

// F-01 micro:bit 줄 읽기 + 5분 표본 만들기
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLine } from '../js/serial.js';
import { makeSampler } from '../js/samples.js';

test('줄 모양 3가지', () => {
  const st = {};
  assert.deepEqual(parseLine('21,180,64', st), { temp: 21, light: 180, sound: 64 });
  assert.deepEqual(parseLine('21.43,40.2,1012.3,3', st), { temp: 21.43, humid: 40.2, press: 1012.3, motion: 3 });
  assert.equal(parseLine('motion,temp_C,humid_pct,press_hPa', st), null);           // 열 이름 줄
  assert.deepEqual(parseLine('5,22.1,41,1011.9', st), { motion: 5, temp: 22.1, humid: 41, press: 1011.9 });
  assert.equal(parseLine('', st), null);
  // DS 기록기 10열(열 이름 줄 없이)
  assert.deepEqual(parseLine('302.19,2,,19.24,42.8,1012.4,21,16,5,2', {}), { motion: 2, temp: 19.24, humid: 42.8, press: 1012.4 });   // dist 빈 칸
  assert.deepEqual(parseLine('302.19,2,55.1,19.24,42.8,1012.4,21,16,5,2', {}), { motion: 2, temp: 19.24, humid: 42.8, press: 1012.4 });
  const st2 = {};
  parseLine('Time (seconds),motion,dist_cm,temp_C,humid_pct,press_hPa,day,hour,min,sec', st2);
  assert.deepEqual(parseLine('602.18,0,,18.83,43.4,1012.6,21,16,10,2', st2), { motion: 0, temp: 18.83, humid: 43.4, press: 1012.6 });
});
test('10초마다 오는 기록 → 5분에 표본 1개, 움직임은 합', () => {
  const out = []; const s = makeSampler(x => out.push(x));
  for (let i = 0; i <= 30; i++) s.add({ ts: i * 10000, temp: 20 + i * 0.01, humid: 40, press: 1010, motion: 1 });
  assert.equal(out.length, 1);
  assert.equal(out[0].motion, 31);
  assert.equal(out[0].temp, 20.3);
});
test('5분마다 오는 기록(DS 센서) → 하나가 표본 하나, 끊기면 새로', () => {
  const s = makeSampler();
  for (let i = 0; i < 8; i++) s.add({ ts: i * 300000, temp: 20, humid: 40, press: 1010, motion: 2 });
  assert.equal(s.samples.length, 8);
  assert.ok(s.samples.every(x => x.motion === 2));
  s.add({ ts: 7 * 300000 + 20 * 60000, temp: 21, humid: 40, press: 1010, motion: 0 });  // 20분 끊김
  assert.equal(s.samples.length, 1);
});

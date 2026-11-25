// T3 · F-02 /api/weather: 기상청 응답 읽기, 기준 시각, 키가 응답에 안 나가는지
import test from 'node:test';
import assert from 'node:assert/strict';
import handler, { baseTime, parseKma } from '../api/weather.js';

const OK = JSON.stringify({ response: { header: { resultCode: '00', resultMsg: 'NORMAL_SERVICE' }, body: { dataType: 'JSON', items: { item: [
  { baseDate: '20261125', baseTime: '1400', category: 'PTY', nx: 60, ny: 127, obsrValue: '0' },
  { baseDate: '20261125', baseTime: '1400', category: 'REH', nx: 60, ny: 127, obsrValue: '45' },
  { baseDate: '20261125', baseTime: '1400', category: 'T1H', nx: 60, ny: 127, obsrValue: '8.3' } ] } } } });

test('정상 응답에서 기온(T1H)만 꺼냄', () => {
  assert.deepEqual(parseKma(OK), { temp: 8.3, base: '20261125 1400', nx: 60, ny: 127 });
});
test('키 오류(XML)는 오류 문장으로', () => {
  const xml = '<OpenAPI_ServiceResponse><cmmMsgHeader><returnAuthMsg>SERVICE_KEY_IS_NOT_REGISTERED_ERROR</returnAuthMsg></cmmMsgHeader></OpenAPI_ServiceResponse>';
  assert.equal(parseKma(xml).error, 'SERVICE_KEY_IS_NOT_REGISTERED_ERROR');
});
test('T1H가 없으면 오류', () => {
  const j = JSON.parse(OK); j.response.body.items.item = j.response.body.items.item.slice(0, 2);
  assert.ok(parseKma(JSON.stringify(j)).error);
});
test('기준 시각: 40분 전이면 한 시간 전, 자정 넘김', () => {
  assert.deepEqual(baseTime(new Date('2026-11-25T05:30:00Z')), { base_date: '20261125', base_time: '1300' }); // 14:30 KST
  assert.deepEqual(baseTime(new Date('2026-11-25T05:50:00Z')), { base_date: '20261125', base_time: '1400' }); // 14:50 KST
  assert.deepEqual(baseTime(new Date('2026-11-25T15:10:00Z')), { base_date: '20261125', base_time: '2300' }); // 00:10 KST 다음 날
});
test('서버 함수: 기상청을 부르고, 키는 응답에 넣지 않음', async () => {
  process.env.KMA_SERVICE_KEY = 'TEST-SECRET-KEY+abc/123==';
  let called = '';
  globalThis.fetch = async url => { called = String(url); return { text: async () => OK }; };
  const res = { code: 0, body: null, headers: {}, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, setHeader(k, v) { this.headers[k] = v; } };
  await handler({}, res);
  assert.equal(res.code, 200);
  assert.equal(res.body.temp, 8.3);
  assert.ok(called.includes('getUltraSrtNcst') && called.includes('serviceKey='));
  assert.ok(!JSON.stringify(res.body).includes('TEST-SECRET'), '응답에 키가 있으면 안 됨');
});

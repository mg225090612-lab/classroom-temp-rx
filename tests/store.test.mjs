// Supabase 저장: 키 종류에 맞는 헤더, 설정이 없으면 저장하지 않음
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeStore } from '../js/store.js';

function capture() { const calls = []; globalThis.fetch = async (url, opt) => { calls.push({ url, opt }); return { ok: true, json: async () => [] }; }; return calls; }

test('설정이 없으면 저장하지 않고 false', async () => {
  const calls = capture();
  assert.equal(await makeStore({}).insert('votes', { vote: 'ok' }), false);
  assert.equal(calls.length, 0);
});
test('옛 anon 키(eyJ…): apikey + Authorization', async () => {
  const calls = capture();
  await makeStore({ SUPABASE_URL: 'https://x.supabase.co/', SUPABASE_ANON_KEY: 'eyJhbGciOi.test' }).insert('votes', { vote: 'ok' });
  assert.equal(calls[0].url, 'https://x.supabase.co/rest/v1/votes');
  assert.equal(calls[0].opt.headers.apikey, 'eyJhbGciOi.test');
  assert.equal(calls[0].opt.headers.Authorization, 'Bearer eyJhbGciOi.test');
});
test('새 publishable 키: apikey만', async () => {
  const calls = capture();
  await makeStore({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'sb_publishable_abc' }).insert('readings', { temp_c: 20 });
  assert.equal(calls[0].opt.headers.apikey, 'sb_publishable_abc');
  assert.equal('Authorization' in calls[0].opt.headers, false);
});

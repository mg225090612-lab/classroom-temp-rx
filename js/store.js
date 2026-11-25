// Supabase 저장(readings · prescriptions · votes). config.js에 주소와 anon 키가 없으면 저장하지 않고 화면만 동작.
// anon(또는 publishable) 키는 공개용 키이고, 표마다 RLS로 "추가·읽기"만 허용한다(supabase.sql).
// secret·service_role 키는 절대 넣지 않는다.

export function makeStore(cfg) {
  const ok = !!(cfg && cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY);
  const base = ok ? cfg.SUPABASE_URL.replace(/\/$/, '') + '/rest/v1/' : '';
  // 옛 anon 키(eyJ…)는 Authorization에도 넣고, 새 publishable 키(sb_publishable_…)는 apikey에만 넣는다
  const key = ok ? cfg.SUPABASE_ANON_KEY.trim() : '';
  const headers = ok ? {
    apikey: key,
    ...(key.startsWith('eyJ') ? { Authorization: `Bearer ${key}` } : {}),
    'Content-Type': 'application/json',
  } : {};
  return {
    enabled: ok,
    async insert(table, row) {
      if (!ok) return false;
      try {
        const r = await fetch(base + table, { method: 'POST', headers: { ...headers, Prefer: 'return=minimal' }, body: JSON.stringify(row) });
        return r.ok;
      } catch { return false; }
    },
    async since(table, iso) {
      if (!ok) return [];
      try {
        const r = await fetch(`${base}${table}?select=*&created_at=gte.${encodeURIComponent(iso)}&order=created_at.asc`, { headers });
        return r.ok ? await r.json() : [];
      } catch { return []; }
    },
  };
}

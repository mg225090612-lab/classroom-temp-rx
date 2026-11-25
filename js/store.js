// Supabase 저장(readings · prescriptions · votes). config.js에 주소와 anon 키가 없으면 저장하지 않고 화면만 동작.
// anon 키는 공개용 키이고, 표마다 RLS로 "추가·읽기"만 허용한다(supabase.sql).

export function makeStore(cfg) {
  const ok = !!(cfg && cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY);
  const base = ok ? cfg.SUPABASE_URL.replace(/\/$/, '') + '/rest/v1/' : '';
  const headers = ok ? {
    apikey: cfg.SUPABASE_ANON_KEY,
    Authorization: `Bearer ${cfg.SUPABASE_ANON_KEY}`,
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

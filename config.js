// 공개 설정 — Supabase 프로젝트의 Project URL과 anon(public) 키를 넣는다.
// anon 키는 브라우저에 보여도 되는 공개 키이고, 표마다 RLS로 "추가·읽기"만 허용한다.
// 비워 두면 저장 없이 화면만 동작한다. (기상청 서비스 키는 여기에 넣지 않는다 → Vercel 환경 변수)
window.APP_CONFIG = {
  SUPABASE_URL: 'https://lwsfesdtkhjwbjxoucle.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_0uGVlkz38sQfZmnA7hCaLA_BXG3oaeg',
};

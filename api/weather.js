// F-02 바깥 기온 — Vercel 서버 함수 /api/weather
// 기상청 초단기실황(getUltraSrtNcst)의 기온(T1H)만 돌려준다.
// 서비스 키는 Vercel 환경 변수 KMA_SERVICE_KEY에만 두고 브라우저로 보내지 않는다.
// 학교 위치 격자는 KMA_NX, KMA_NY(기상청 격자 좌표). 없으면 서울(60, 127).

const KMA_URL = 'https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtNcst';

// 초단기실황은 매시 정각 값이 40분쯤 나온다 → 45분 전이면 한 시간 전 값을 묻는다(한국 시간 기준)
export function baseTime(now = new Date()) {
  const k = new Date(now.getTime() + 9 * 3600 * 1000);
  if (k.getUTCMinutes() < 45) k.setUTCHours(k.getUTCHours() - 1);
  const p = n => String(n).padStart(2, '0');
  return {
    base_date: `${k.getUTCFullYear()}${p(k.getUTCMonth() + 1)}${p(k.getUTCDate())}`,
    base_time: `${p(k.getUTCHours())}00`,
  };
}

export function parseKma(text) {
  let j;
  try { j = JSON.parse(text); } catch {
    const m = text.match(/<returnAuthMsg>([^<]+)</) || text.match(/<resultMsg>([^<]+)</);
    return { error: m ? m[1] : '기상청 응답을 읽지 못함' };
  }
  const head = j && j.response && j.response.header;
  if (!head || head.resultCode !== '00') return { error: (head && head.resultMsg) || '기상청 오류' };
  const items = (j.response.body && j.response.body.items && j.response.body.items.item) || [];
  const t1h = items.find(i => i.category === 'T1H');
  if (!t1h) return { error: '기온(T1H)이 응답에 없음' };
  return { temp: Number(t1h.obsrValue), base: `${t1h.baseDate} ${t1h.baseTime}`, nx: t1h.nx, ny: t1h.ny };
}

export default async function handler(req, res) {
  const key = process.env.KMA_SERVICE_KEY;
  if (!key) return res.status(500).json({ error: 'KMA_SERVICE_KEY가 설정되지 않음' });
  const { base_date, base_time } = baseTime();
  const q = new URLSearchParams({
    serviceKey: key.includes('%') ? decodeURIComponent(key) : key,   // 인코딩 키를 넣어도 동작
    pageNo: '1', numOfRows: '10', dataType: 'JSON', base_date, base_time,
    nx: process.env.KMA_NX || '60', ny: process.env.KMA_NY || '127',
  });
  try {
    const r = await fetch(`${KMA_URL}?${q}`, { signal: AbortSignal.timeout(4000) });
    const out = parseKma(await r.text());
    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=300');  // 10분 동안 같은 값 → 하루 144번 이하
    return res.status(out.error ? 502 : 200).json(out);
  } catch {
    return res.status(504).json({ error: '기상청 응답이 4초 안에 오지 않음' });
  }
}

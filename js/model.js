// F-04 [AI] 30분 뒤 교실 온도 예측
// HAIP에게 받은 모델 temp_forecast_30min.keras의 가중치를 model/forecast_model.json으로 옮겨
// 브라우저 안에서 계산한다(서버·키 필요 없음). 계산 순서는 Keras 모델과 같다:
// 정규화 → Dense 16(ReLU) → Dense 1 = 30분 뒤 온도 변화(°C)

export async function loadModel(url = 'model/forecast_model.json') {
  const res = await fetch(url);
  if (!res.ok) throw new Error('모델 파일을 불러오지 못함');
  return res.json();
}

// 최근 30분 기록(5분 간격 6개, 오래된 것부터) → 입력 19개
// HAIP 노트북의 make_features와 같은 순서: 지금 온도, 앞 5개 온도 - 지금 온도, 습도 6개, 움직임 6개, 기압 변화
export function makeFeatures(s) {
  const t = s.map(x => x.temp);
  const now = t[5];
  return [
    now,
    ...t.slice(0, 5).map(v => v - now),
    ...s.map(x => x.humid),
    ...s.map(x => x.motion),
    s[5].press - s[0].press,
  ];
}

export function predictChange(m, x) {
  const z = x.map((v, i) => (v - m.norm_mean[i]) / Math.max(Math.sqrt(m.norm_var[i]), 1e-7));
  let out = m.b2;
  for (let j = 0; j < m.b1.length; j++) {
    let h = m.b1[j];
    for (let i = 0; i < z.length; i++) h += z[i] * m.W1[i][j];
    out += Math.max(0, h) * m.W2[j];             // ReLU
  }
  return out;
}

const isNum = v => typeof v === 'number' && Number.isFinite(v);

// 표본 6개가 모두 온도·습도·기압·움직임을 가져야 예측한다. 아니면 null(이유와 함께)
export function forecast(m, samples) {
  if (samples.length < 6) return { ok: false, why: `기록 ${samples.length}/6개 — 30분이 쌓이면 예측` };
  const s = samples.slice(-6);
  const missing = ['humid', 'press', 'motion'].filter(k => s.some(x => !isNum(x[k])));
  if (missing.length || s.some(x => !isNum(x.temp))) {
    return { ok: false, why: '습도·기압·움직임 센서가 필요함(DS 센서 키트)' };
  }
  const change = predictChange(m, makeFeatures(s));
  return { ok: true, now: s[5].temp, change, temp: s[5].temp + change, at: s[5].ts + 30 * 60 * 1000 };
}

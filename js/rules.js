// F-03 설정 온도·운전 모드 처방
// 기준: 학교보건법 시행규칙 [별표 2] 난방 18~20°C · 냉방 26~28°C,
//       실내외 온도차 5°C 정도·최대 8°C(서울아산병원 '냉방병')
// 판단 온도 = 30분 뒤 예상 온도(F-04가 있으면) 또는 지금 온도

export const HEAT_SET = 20;          // 난방 설정(학교 기준 상한)
export const COOL_MIN = 26, COOL_MAX = 28;
export const GAP = 5, GAP_MAX = 8;

export const MODE_LABEL = {
  heat: '난방', cool: '냉방', off: '냉난방기 끄기', vent: '창문 열어 환기', pause: '냉난방기 잠시 끄기',
};

const r1 = v => Math.round(v * 10) / 10;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function decide(t, o, basis) {
  if (t < HEAT_SET) {                                   // 추움
    if (o == null) return { mode: 'heat', set: HEAT_SET, reason: `${basis} ${t}°C → 난방 20°C (바깥 기온 없음)` };
    if (o <= t) return { mode: 'heat', set: HEAT_SET, reason: `${basis} ${t}°C, 바깥 ${o}°C → 학교 기준 상한 20°C로 난방` };
    return { mode: 'vent', set: null, reason: `${basis} ${t}°C인데 바깥(${o}°C)이 더 따뜻함 → 창문 열어 환기` };
  }
  if (t > COOL_MIN) {                                   // 더움
    if (o == null) return { mode: 'cool', set: COOL_MIN, reason: `${basis} ${t}°C → 냉방 26°C (바깥 기온 없음)` };
    if (o >= t) {
      const set = clamp(Math.round(o - GAP), COOL_MIN, COOL_MAX);
      const caution = o - set > GAP_MAX;
      return {
        mode: 'cool', set, caution,
        reason: `${basis} ${t}°C, 바깥 ${o}°C → 바깥보다 5°C 낮게(26~28°C 안)` + (caution ? ' · 온도차 8°C 넘음 주의' : ''),
      };
    }
    return { mode: 'vent', set: null, reason: `${basis} ${t}°C인데 바깥(${o}°C)이 더 시원함 → 창문 열어 환기` };
  }
  return { mode: 'off', set: null, reason: `${basis} ${t}°C → 20~26°C 사이라 냉난방기 끔` };
}

export function prescribe({ indoor, outdoor = null, forecast = null, windowOpen = false }) {
  const useForecast = forecast != null && Number.isFinite(forecast);
  const t = r1(useForecast ? forecast : indoor);
  const basis = useForecast ? '30분 뒤 예상' : '지금';
  const o = outdoor == null || !Number.isFinite(outdoor) ? null : r1(outdoor);
  const base = decide(t, o, basis);
  if (windowOpen) {
    return {
      mode: 'pause', set: null, t, basis, after: base,
      reason: '창문이 열려 있음 → 잠시 끄고, 창문을 닫은 뒤 아래 처방대로 다시 켜기',
    };
  }
  return { ...base, t, basis };
}

// 센서 기록을 5분 간격 표본으로 모은다(AI 입력은 5분 간격 6개 = 30분).
// - 10초마다 오는 기록: 5분 동안 모아 하나로(온도·습도·기압은 마지막 값, 움직임은 합)
// - 5분마다 오는 기록(DS 센서 키트): 하나가 곧 표본
// 표본 사이가 7분 30초보다 벌어지면 흐름이 끊긴 것으로 보고 새로 쌓는다.

export const STEP_MS = 5 * 60 * 1000;
const SPARSE_MS = 4 * 60 * 1000;
const BREAK_MS = 7.5 * 60 * 1000;
const KEEP = 12 * 24;                    // 하루치

export function makeSampler(onSample) {
  let samples = [];
  let pending = null;                    // 지금 모으는 5분
  let lastTs = null;

  function push(s) {
    const prev = samples[samples.length - 1];
    if (prev && s.ts - prev.ts > BREAK_MS) samples = [];      // 끊김 → 새로 시작
    samples.push(s);
    if (samples.length > KEEP) samples.shift();
    onSample && onSample(s, samples);
  }
  function close() {
    if (!pending) return;
    const { ts, temp, humid, press, motion, light, sound } = pending;
    pending = null;
    push({ ts, temp, humid, press, motion, light, sound });
  }

  return {
    get samples() { return samples; },
    // 실시간 기록 하나 {ts, temp, humid?, press?, motion?, light?, sound?}
    add(r) {
      const sparse = lastTs != null && r.ts - lastTs >= SPARSE_MS;
      lastTs = r.ts;
      if (sparse) { close(); push({ ...r }); return; }
      if (!pending) pending = { ...r, start: r.ts, motion: r.motion ?? null };
      else {
        Object.assign(pending, { ts: r.ts, temp: r.temp, humid: r.humid ?? pending.humid, press: r.press ?? pending.press,
          light: r.light ?? pending.light, sound: r.sound ?? pending.sound });
        if (r.motion != null) pending.motion = (pending.motion ?? 0) + r.motion;
      }
      if (r.ts - pending.start >= STEP_MS) close();
    },
    // 기록 재생: 한 줄 = 5분 표본 하나
    addSample(s) { push({ ...s }); },
    reset() { samples = []; pending = null; lastTs = null; },
  };
}

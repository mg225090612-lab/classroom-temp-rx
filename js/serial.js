// F-01 micro:bit 기록 받기 (Web Serial, 크롬)
// 받을 수 있는 줄 모양
//   "21,180,64"              micro:bit V2 내장 센서: 온도,빛,소리 (10초마다)
//   "21.43,40.2,1012.3,3"    DS 센서 키트: temp_C,humid_pct,press_hPa,motion (5분마다)
//   "temp_C,humid_pct,..."   글자로 된 첫 줄 = 열 이름(이 순서로 읽음)
//   DS 기록기와 같은 10열(Time (seconds),motion,dist_cm,temp_C,...)도 그대로 읽음

const NAMES = {
  temp: 'temp', temp_c: 'temp', temperature: 'temp', 온도: 'temp',
  humid: 'humid', humid_pct: 'humid', humidity: 'humid', 습도: 'humid',
  press: 'press', press_hpa: 'press', pressure: 'press', 기압: 'press',
  motion: 'motion', pir: 'motion', 움직임: 'motion',
  light: 'light', 빛: 'light', sound: 'sound', 소리: 'sound',
};
const BY_COUNT = {
  1: ['temp'],
  3: ['temp', 'light', 'sound'],
  4: ['temp', 'humid', 'press', 'motion'],
  // DS 데이터(ds_squad05)와 같은 열 순서 — 열 이름 줄을 놓쳐도 읽음
  9: ['motion', null, 'temp', 'humid', 'press', null, null, null, null],
  10: [null, 'motion', null, 'temp', 'humid', 'press', null, null, null, null],
};

export function parseLine(line, state) {
  const parts = line.trim().split(',').map(p => p.trim());      // 빈 칸도 자리를 지킴(DS의 dist_cm은 자주 비어 있음)
  if (!parts.some(p => p !== '')) return null;
  if (parts.some(p => p !== '' && Number.isNaN(Number(p)))) {    // 열 이름 줄
    state.cols = parts.map(p => NAMES[p.toLowerCase().replace(/\s*\(.*\)$/, '')] || null);
    return null;
  }
  const nums = parts.map(p => (p === '' ? null : Number(p)));
  const cols = state.cols && state.cols.length === nums.length ? state.cols : BY_COUNT[nums.length];
  if (!cols) return null;
  const r = {};
  cols.forEach((c, i) => { if (c && nums[i] != null) r[c] = nums[i]; });
  return typeof r.temp === 'number' ? r : null;
}

export async function connectMicrobit(onReading, onStatus) {
  if (!('serial' in navigator)) throw new Error('이 브라우저는 Web Serial을 지원하지 않음(크롬·엣지에서 열기)');
  const port = await navigator.serial.requestPort();
  await port.open({ baudRate: 115200 });
  onStatus && onStatus('connected');
  const state = {};
  const reader = port.readable.pipeThrough(new TextDecoderStream()).getReader();
  let buf = '';
  (async () => {
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += value;
        let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          const r = parseLine(buf.slice(0, i), state);
          buf = buf.slice(i + 1);
          if (r) onReading({ ...r, ts: Date.now() });
        }
      }
    } catch (e) { /* 선을 뽑음 */ }
    onStatus && onStatus('disconnected');
  })();
  return port;
}

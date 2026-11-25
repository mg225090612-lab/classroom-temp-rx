// 교실 온도 처방전 — 화면 연결
// F-01 센서 기록 · F-02 바깥 기온 · F-03 처방 · F-04 [AI] 30분 뒤 예상 · F-05 투표·AI 기록 · F-06 그래프 · F-07 급하강 알림
import { loadModel, forecast } from './model.js';
import { prescribe, MODE_LABEL } from './rules.js';
import { makeSampler } from './samples.js';
import { connectMicrobit } from './serial.js';
import { makeStore } from './store.js';

const $ = id => document.getElementById(id);
const MIN = 60 * 1000;
const qs = new URLSearchParams(location.search);
const store = makeStore(window.APP_CONFIG || {});
const ls = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 저장 안 되는 브라우저 */ } },
};
const pad = n => String(n).padStart(2, '0');
const dayKey = () => new Date().toLocaleDateString('sv-SE');
const f1 = v => (Math.round(v * 10) / 10).toFixed(1);
const signed = v => (v >= 0 ? '+' : '−') + f1(Math.abs(v));

const S = {
  model: null,
  outdoor: null, outdoorBase: null, outdoorErr: null,
  indoor: null, lastTs: null, source: null,          // 'microbit' | 'manual' | 'demo' | 'history'
  windowOpen: qs.get('window') === 'open',
  offset: Number(ls.get('offset', 0)) || 0,
  fc: { ok: false, why: '기록이 30분 쌓이면 예측합니다' },
  aiLog: [],                                         // {ai, base}: 30분 전 예측과 실제 차이
  demo: null, bulk: false, lastSave: 0,
  counts: ls.get('counts', {}),
};

// ── 5분 표본 → AI 예측(F-04) + 지난 예측 채점(F-05) ──────────────────────
const sampler = makeSampler((s, samples) => {
  for (let j = samples.length - 2; j >= 0 && j >= samples.length - 9; j--) {
    const gap = s.ts - samples[j].ts;
    if (gap >= 28 * MIN && gap <= 32 * MIN) {
      const old = samples[j];
      if (old.fc != null) S.aiLog.push({ ai: Math.abs(old.fc - s.temp), base: Math.abs(old.temp - s.temp) });
      break;
    }
  }
  S.fc = S.model ? forecast(S.model, samples) : { ok: false, why: 'AI 모델 불러오는 중' };
  if (S.fc.ok) s.fc = S.fc.temp;
  if (!S.bulk) render();
});

// ── F-01 센서 기록 ────────────────────────────────────────────────────────
function onReading(r) {
  const temp = r.temp + (S.source === 'microbit' ? S.offset : 0);
  S.indoor = temp; S.lastTs = r.ts;
  sampler.add({ ...r, temp });
  if (store.enabled && r.ts - S.lastSave >= MIN) {                 // 1분에 한 줄만 저장
    S.lastSave = r.ts;
    store.insert('readings', {
      source: S.source, temp_raw: r.temp, temp_c: Math.round(temp * 100) / 100,
      humid_pct: r.humid ?? null, press_hpa: r.press ?? null, motion: r.motion ?? null,
      light: r.light ?? null, sound: r.sound ?? null,
    });
  }
  render();
}

$('btnSerial').onclick = async () => {
  try {
    stopDemo();
    S.source = 'microbit';
    await connectMicrobit(onReading, st => { S.serial = st; render(); });
    toast('micro:bit 연결됨 — 기록을 기다리는 중');
  } catch (e) { toast(e.message || 'micro:bit 연결을 취소함'); }
};
$('offset').value = S.offset;
$('offset').onchange = e => { S.offset = Number(e.target.value) || 0; ls.set('offset', S.offset); };
$('btnManual').onclick = () => {
  const v = parseFloat($('manualTemp').value);
  if (!Number.isFinite(v)) return toast('실내 온도를 숫자로 넣어 주세요');
  stopDemo();
  S.source = 'manual'; S.indoor = v; S.lastTs = Date.now();
  render();
};

// ── 기록 재생(데모): HAIP 시험일 기록을 5분씩 재생 ──────────────────────────
async function startDemo({ at = 0, pause = false, speed = 1.5 } = {}) {
  const text = await (await fetch('data/demo_replay.csv')).text();
  const [head, ...lines] = text.trim().split('\n');
  const cols = head.split(',');
  const rows = lines.map(l => Object.fromEntries(l.split(',').map((v, i) => [cols[i], Number(v)])));
  stopDemo();
  sampler.reset(); S.aiLog = []; S.source = 'demo';
  S.demo = { rows, i: 0, timer: null, speed, t0: Date.now() - rows.length * 5 * MIN, label: '' };
  S.bulk = true;
  while (S.demo.i <= Math.min(at, rows.length - 1)) feedDemo();
  S.bulk = false;
  render();
  if (!pause) playDemo();
}
function feedDemo() {
  const d = S.demo, r = d.rows[d.i];
  const ts = d.t0 + d.i * 5 * MIN;
  S.indoor = r.temp_C; S.lastTs = ts;
  d.label = `${r.day}일 ${pad(r.hour)}:${pad(r.min)}`;
  sampler.addSample({ ts, temp: r.temp_C, humid: r.humid_pct, press: r.press_hPa, motion: r.motion, label: { day: r.day, hour: r.hour, min: r.min } });
  d.i++;
}
function playDemo() {
  const d = S.demo; if (!d || d.timer) return;
  d.timer = setInterval(() => {
    if (d.i >= d.rows.length) { stopDemo(true); toast('기록 재생 끝'); return; }
    feedDemo();
  }, d.speed * 1000);
  render();
}
function stopDemo(keep = false) {
  if (S.demo && S.demo.timer) { clearInterval(S.demo.timer); S.demo.timer = null; }
  if (!keep && S.source === 'demo') S.demo = null;
}
$('btnDemo').onclick = () => {
  if (S.demo && S.demo.timer) { stopDemo(true); render(); }
  else if (S.demo && S.demo.i < S.demo.rows.length) playDemo();
  else startDemo();
};

// ── F-02 바깥 기온 (서버 함수 /api/weather → 기상청) ────────────────────────
async function loadWeather() {
  const t0 = performance.now();
  try {
    const r = await fetch('/api/weather');
    const j = await r.json();
    if (j.error) throw new Error(j.error);
    S.outdoor = j.temp; S.outdoorBase = j.base; S.outdoorErr = null;
    S.outdoorMs = Math.round(performance.now() - t0);
  } catch (e) { S.outdoorErr = e.message && !/JSON/.test(e.message) ? e.message : '바깥 기온을 불러오지 못함'; }
  render();
}
function outdoorNow() {
  if (S.source === 'demo' && qs.has('outdoor')) return { v: Number(qs.get('outdoor')), demo: true };
  if (S.outdoor != null) return { v: S.outdoor, demo: false };
  if (S.source === 'demo') return { v: 7, demo: true };          // 재생할 때만 쓰는 데모 값
  return { v: null, demo: false };
}

// ── F-03 처방 ─────────────────────────────────────────────────────────────
function freshForecast() {
  if (!S.fc.ok) return null;
  if (S.source === 'demo') return S.fc;
  return Date.now() - (S.fc.at - 30 * MIN) <= 10 * MIN ? S.fc : null;   // 10분 넘게 끊기면 안 씀
}
function currentRx() {
  if (S.indoor == null) return null;
  const fc = freshForecast();
  return prescribe({ indoor: S.indoor, outdoor: outdoorNow().v, forecast: fc ? fc.temp : null, windowOpen: S.windowOpen });
}

// ── F-07 급하강 알림: 10분 사이 1°C 넘게 떨어지고 바깥이 더 추우면 ─────────────
function dropNow() {
  const s = sampler.samples;
  if (s.length < 2 || S.windowOpen) return null;
  const last = s[s.length - 1];
  const peak = Math.max(...s.filter(x => last.ts - x.ts <= 10 * MIN).map(x => x.temp));
  const out = outdoorNow().v;
  const drop = peak - last.temp;
  return drop >= 1 && (out == null || out < last.temp) ? drop : null;
}

// ── 창문 · 투표 · 맞춤 기록 ─────────────────────────────────────────────────
function setWindow(open) { S.windowOpen = open; render(); }
$('winClosed').onclick = () => setWindow(false);
$('winOpen').onclick = () => setWindow(true);

function bump(key) {
  const d = dayKey();
  S.counts = { [d]: { done: 0, cold: 0, ok: 0, hot: 0, ...(S.counts[d] || {}) } };
  S.counts[d][key]++;
  ls.set('counts', S.counts);
}
document.querySelectorAll('.vote').forEach(b => b.onclick = async () => {
  bump(b.dataset.v);
  const saved = await store.insert('votes', { vote: b.dataset.v, indoor: S.indoor });
  toast(saved ? '투표 저장함' : '투표함 (이 기기에만 셈)');
  render();
});
$('btnDone').onclick = async () => {
  const rx = currentRx(); if (!rx) return;
  bump('done');
  const fc = freshForecast();
  const saved = await store.insert('prescriptions', {
    indoor: S.indoor, outdoor: outdoorNow().v, forecast: fc ? Math.round(fc.temp * 10) / 10 : null,
    window_open: S.windowOpen, mode: rx.mode, set_temp: rx.set, reason: rx.reason,
  });
  toast(saved ? '처방 기록을 저장함' : '기록함 (이 기기에만 셈)');
  render();
};

// ── 그리기 ───────────────────────────────────────────────────────────────
function timeLabel(ts, sample) {
  if (S.source === 'demo' && sample && sample.label) {
    const m = sample.label.hour * 60 + sample.label.min + Math.round((ts - sample.ts) / MIN);
    return `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;
  }
  const d = new Date(ts); return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function render() {
  // 상태 칩
  const chipS = $('chipSensor');
  const srcText = { microbit: S.serial === 'disconnected' ? 'micro:bit 연결 끊김' : 'micro:bit 연결됨', manual: '직접 입력', demo: '기록 재생(데모)', history: '저장된 기록' }[S.source] || '센서 연결 안 됨';
  chipS.textContent = srcText + (S.indoor != null ? ` · 실내 ${f1(S.indoor)}°C` : '');
  chipS.className = 'chip' + (S.source ? ' ok' : '');
  const o = outdoorNow();
  const chipO = $('chipOutdoor');
  if (o.v != null) {
    chipO.textContent = `바깥 ${f1(o.v)}°C` + (o.demo ? ' (데모 값)' : S.outdoorBase ? ` · 기상청 ${S.outdoorBase.slice(-4, -2)}:00` : '');
    chipO.className = 'chip ok';
  } else { chipO.textContent = S.outdoorErr ? `바깥 기온 없음 — ${S.outdoorErr}` : '바깥 기온 불러오는 중'; chipO.className = 'chip warn'; }

  // 처방 카드
  const rx = currentRx();
  const card = $('rxCard');
  if (!rx) {
    card.dataset.mode = 'wait';
    $('rxMode').textContent = '실내 온도를 기다리는 중'; $('rxSet').textContent = '—';
    $('rxReason').textContent = 'micro:bit를 연결하거나 아래에 실내 온도를 직접 넣으세요.';
    $('rxAfter').hidden = true; $('btnDone').disabled = true; $('rxBasis').hidden = true;
  } else {
    card.dataset.mode = rx.mode;
    $('rxMode').textContent = MODE_LABEL[rx.mode] + (rx.caution ? ' · 주의' : '');
    $('rxSet').textContent = rx.set != null ? `${rx.set}°C` : { off: '끄기', vent: '환기', pause: '잠시 끄기' }[rx.mode];
    $('rxReason').textContent = rx.reason;
    if (rx.after) {
      $('rxAfter').hidden = false;
      $('rxAfter').textContent = `창문을 닫은 뒤 → ${MODE_LABEL[rx.after.mode]}${rx.after.set != null ? ' ' + rx.after.set + '°C' : ''}`;
    } else $('rxAfter').hidden = true;
    $('btnDone').disabled = false;
    const fcB = freshForecast(), oB = outdoorNow();
    $('rxBasis').hidden = false;
    $('rxBasis').innerHTML = [
      ['지금 실내', `${f1(S.indoor)}°C`, ''],
      ['바깥', oB.v != null ? `${f1(oB.v)}°C` : '없음', ''],
      ['30분 뒤 예상(AI)', fcB ? `${f1(fcB.temp)}°C` : '—', 'ai'],
      ['창문', S.windowOpen ? '열림' : '닫힘', ''],
    ].map(([k, v, cls]) => `<div class="${cls}"><span>${k}</span><b>${v}</b></div>`).join('');
  }
  const c = S.counts[dayKey()] || {};
  $('doneCount').textContent = `오늘 맞춤 ${c.done || 0}번`;

  // AI
  const fc = freshForecast();
  const last = sampler.samples[sampler.samples.length - 1];
  if (fc) {
    $('aiTemp').textContent = `${f1(fc.temp)}°C`;
    $('aiSub').textContent = `지금 ${f1(fc.now)}°C → ${signed(fc.change)}°C · ${timeLabel(fc.at, last)}쯤`;
  } else {
    $('aiTemp').textContent = '—';
    $('aiSub').textContent = S.fc.ok ? '센서 기록이 10분 넘게 끊겨 예측을 쉬는 중' : S.fc.why;
  }
  if (S.aiLog.length) {
    const m = k => S.aiLog.reduce((a, x) => a + x[k], 0) / S.aiLog.length;
    $('aiLog').textContent = `지난 예측 ${S.aiLog.length}개 채점 · AI 오차 ${m('ai').toFixed(2)}°C · 그대로 두기 ${m('base').toFixed(2)}°C`;
  } else $('aiLog').textContent = '';

  // 창문 · 알림
  $('winClosed').classList.toggle('on', !S.windowOpen);
  $('winOpen').classList.toggle('on', S.windowOpen);
  const drop = dropNow();
  const al = $('dropAlert');
  if (drop) {
    al.hidden = false;
    al.innerHTML = `10분 사이 ${f1(drop)}°C 떨어짐 — 창문이 열렸나요? <button class="btn" id="btnMarkOpen">창문 열림으로 표시</button>`;
    $('btnMarkOpen').onclick = () => setWindow(true);
  } else al.hidden = true;

  // 투표
  const n = (c.cold || 0) + (c.ok || 0) + (c.hot || 0);
  $('voteSum').textContent = n ? `오늘 춥다 ${c.cold || 0} · 적당 ${c.ok || 0} · 덥다 ${c.hot || 0} (적당 ${Math.round((c.ok || 0) / n * 100)}%)` : '오늘 투표 0표';

  // 데모 정보
  const d = S.demo;
  $('btnDemo').textContent = d && d.timer ? '재생 멈춤' : d && d.i < d.rows.length ? '재생 계속' : '기록 재생(데모)';
  $('demoInfo').textContent = d ? `${d.label} · 1칸 = 5분 · HAIP 시험일 기록` : '';

  drawChart(fc);
}

function drawChart(fc) {
  const cv = $('chart');
  const dpr = window.devicePixelRatio || 1;
  const W = cv.clientWidth || 800, H = 220;
  cv.width = W * dpr; cv.height = H * dpr;
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, H);
  const s = sampler.samples.slice(-12 * 10);                     // 최근 10시간
  const L = 44, R = 16, T = 12, B = 26;
  if (s.length < 2) {
    g.fillStyle = '#868e96'; g.font = '15px sans-serif'; g.fillText('기록이 쌓이면 그래프가 그려집니다', L, H / 2); return;
  }
  const t0 = s[0].ts, t1 = (fc ? fc.at : s[s.length - 1].ts);
  const temps = s.map(x => x.temp).concat(fc ? [fc.temp] : []);
  let lo = Math.floor(Math.min(...temps, 20) - 1), hi = Math.ceil(Math.max(...temps, 26) + 1);
  const X = t => L + (t - t0) / (t1 - t0 || 1) * (W - L - R);
  const Y = v => T + (hi - v) / (hi - lo) * (H - T - B);
  g.fillStyle = '#d3f0da'; g.fillRect(L, Y(26), W - L - R, Y(20) - Y(26));         // 끄는 구간 20~26°C
  g.strokeStyle = '#e9ecef'; g.fillStyle = '#868e96'; g.font = '12px sans-serif'; g.lineWidth = 1;
  for (let v = Math.ceil(lo / 2) * 2; v <= hi; v += 2) {
    g.beginPath(); g.moveTo(L, Y(v)); g.lineTo(W - R, Y(v)); g.stroke(); g.fillText(`${v}°`, 8, Y(v) + 4);
  }
  [0, Math.floor((s.length - 1) / 2), s.length - 1].forEach(i => g.fillText(timeLabel(s[i].ts, s[i]), X(s[i].ts) - 16, H - 8));
  g.strokeStyle = '#1b2228'; g.lineWidth = 2.2; g.beginPath();
  s.forEach((x, i) => (i ? g.lineTo(X(x.ts), Y(x.temp)) : g.moveTo(X(x.ts), Y(x.temp)))); g.stroke();
  if (fc) {
    const lx = s[s.length - 1];
    g.strokeStyle = '#5f3dc4'; g.setLineDash([6, 5]); g.beginPath(); g.moveTo(X(lx.ts), Y(lx.temp)); g.lineTo(X(fc.at), Y(fc.temp)); g.stroke(); g.setLineDash([]);
    g.fillStyle = '#5f3dc4'; g.beginPath(); g.arc(X(fc.at), Y(fc.temp), 5, 0, Math.PI * 2); g.fill();
  }
}

let toastTimer;
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), 2600);
}
window.addEventListener('resize', () => render());

// ── 시작 ─────────────────────────────────────────────────────────────────
(async function start() {
  render();
  try { S.model = await loadModel(); } catch (e) { S.fc = { ok: false, why: e.message }; }
  loadWeather(); setInterval(loadWeather, 10 * MIN);
  if (store.enabled && !qs.has('demo')) {                          // 저장된 최근 45분으로 AI 준비
    const rows = await store.since('readings', new Date(Date.now() - 45 * MIN).toISOString());
    if (rows.length) {
      S.bulk = true;
      rows.forEach(r => sampler.add({ ts: Date.parse(r.created_at), temp: r.temp_c, humid: r.humid_pct, press: r.press_hpa, motion: r.motion }));
      S.bulk = false;
      S.source = S.source || 'history'; S.indoor = rows[rows.length - 1].temp_c; S.lastTs = Date.parse(rows[rows.length - 1].created_at);
    }
  }
  if (qs.has('demo')) await startDemo({ at: Number(qs.get('at')) || 0, pause: qs.has('pause'), speed: Number(qs.get('speed')) || 1.5 });
  render();
})();

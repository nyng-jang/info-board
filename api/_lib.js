// 오늘의 진짜 정보판 — 서버 로직 (Vercel Serverless, Node ESM)
// 데이터: Open-Meteo 대전 현재 기온 (API 키 없는 공개 API → 비밀키 노출 0건)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const TZ = 'Asia/Seoul';
export const SOURCE = {
  name: 'Open-Meteo 대전 현재 기온',
  url: 'https://api.open-meteo.com/v1/forecast?latitude=36.3504&longitude=127.3845&current=temperature_2m&timezone=Asia%2FSeoul',
  unit: '°C',
};
const TIMEOUT_MS = 5000;
const THROTTLE_MS = 10000; // live 모드 연타 방지

/* ---------- 시간 ---------- */
const fmt = new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, dateStyle: 'short', timeStyle: 'medium' });
export const kstStamp = (d) => fmt.format(d); // 2026-10-07 17:42:00
export const kstDay = (d) => kstStamp(d).slice(0, 10);
export const kstIso = (d) => kstStamp(d).replace(' ', 'T') + '+09:00';

/* ---------- 저장소: Upstash Redis(REST) 우선, 없으면 임시 파일(로컬 개발용) ---------- */
const R_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const R_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
export const storageKind = () => (R_URL && R_TOKEN ? 'redis' : 'file-fallback');
const FILE = path.join(os.tmpdir(), 't04-store.json');

async function redis(args) {
  const r = await fetch(R_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${R_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j.result;
}
const readFile = () => {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return {}; }
};

async function loadState(ns) {
  if (storageKind() === 'redis') {
    const flat = (await redis(['HGETALL', `t04:${ns}:days`])) || [];
    const days = {};
    for (let i = 0; i < flat.length; i += 2) days[flat[i]] = JSON.parse(flat[i + 1]);
    const m = await redis(['GET', `t04:${ns}:meta`]);
    return { days, meta: m ? JSON.parse(m) : null };
  }
  const s = readFile()[ns] || {};
  return { days: s.days || {}, meta: s.meta || null };
}
// 일별 키(날짜)로 덮어쓰기 → 같은 날 여러 번 성공해도 1건 (HSET은 원자적)
async function saveDay(ns, day, rec) {
  if (storageKind() === 'redis') return redis(['HSET', `t04:${ns}:days`, day, JSON.stringify(rec)]);
  const all = readFile();
  all[ns] = all[ns] || { days: {}, meta: null };
  all[ns].days[day] = rec;
  fs.writeFileSync(FILE, JSON.stringify(all));
}
async function saveMeta(ns, meta) {
  if (storageKind() === 'redis') return redis(['SET', `t04:${ns}:meta`, JSON.stringify(meta)]);
  const all = readFile();
  all[ns] = all[ns] || { days: {}, meta: null };
  all[ns].meta = meta;
  fs.writeFileSync(FILE, JSON.stringify(all));
}
export async function resetNs(ns) {
  if (storageKind() === 'redis') return redis(['DEL', `t04:${ns}:days`, `t04:${ns}:meta`]);
  const all = readFile();
  delete all[ns];
  fs.writeFileSync(FILE, JSON.stringify(all));
}

/* ---------- 합성 장애 재생(fixture) ---------- */
// 실제 호출과 같은 파싱·분류 경로를 타도록, 외부 응답만 흉내 낸다.
const okBody = (t, time) => ({ current: { time, interval: 900, temperature_2m: t } });
export const FIXTURES = {
  'NORMAL-D1-A': { kind: 'ok', day: '2026-01-01', body: okBody(20.0, '2026-01-01T09:00') },
  'NORMAL-D1-B': { kind: 'ok', day: '2026-01-01', body: okBody(21.5, '2026-01-01T15:00') },
  'TIMEOUT': { kind: 'timeout' },
  'AUTH-401': { kind: 'http', status: 401 },
  'RATE-429': { kind: 'http', status: 429 },
  'OFFLINE': { kind: 'offline' },
  'SCHEMA-BREAK': { kind: 'ok', day: '2026-01-02', body: { current: { time: '2026-01-02T09:00', temp: 'N/A' } } },
  'RECOVER-D2': { kind: 'ok', day: '2026-01-02', body: okBody(23.0, '2026-01-02T09:00') },
};

async function simulate(fx) {
  if (fx.kind === 'timeout') {
    await new Promise((r) => setTimeout(r, 800)); // 느린 응답처럼 보이도록 잠깐 지연
    const e = new Error('aborted'); e.name = 'AbortError'; throw e;
  }
  if (fx.kind === 'offline') throw new TypeError('fetch failed');
  if (fx.kind === 'http') return { status: fx.status, json: async () => ({}) };
  return { status: 200, json: async () => fx.body };
}

async function realFetch() {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    return await fetch(SOURCE.url, { signal: ctl.signal, headers: { Accept: 'application/json' } });
  } finally { clearTimeout(t); }
}

/* ---------- 실패 5종 분류 ---------- */
export const ERRORS = {
  timeout: '외부 서버 응답 시간이 초과되었습니다.',
  auth_401_403: '외부 서버가 접근을 거절했습니다(401/403).',
  rate_429: '호출 한도를 넘었습니다(429). 잠시 후 다시 시도해 주세요.',
  offline: '네트워크에 연결할 수 없습니다.',
  schema_changed: '외부 응답 형식이 달라져 값을 읽을 수 없습니다.',
};
function classifyThrown(e) {
  if (e && e.name === 'AbortError') return 'timeout';
  return 'offline';
}
async function parse(res) {
  if (res.status === 401 || res.status === 403) return { code: 'auth_401_403' };
  if (res.status === 429) return { code: 'rate_429' };
  if (res.status < 200 || res.status >= 300) return { code: 'offline', detail: `HTTP ${res.status}` };
  let j;
  try { j = await res.json(); } catch { return { code: 'schema_changed' }; }
  const c = j && j.current;
  if (!c || typeof c.temperature_2m !== 'number' || !Number.isFinite(c.temperature_2m) || typeof c.time !== 'string')
    return { code: 'schema_changed' };
  return { ok: true, value: c.temperature_2m, time: c.time, raw: JSON.stringify(c) };
}

/* ---------- 수집 ---------- */
export async function collect(ns, fixtureId) {
  const state = await loadState(ns);
  const now = new Date();

  if (ns === 'live' && state.meta?.lastAttemptAt && now - new Date(state.meta.lastAttemptAt) < THROTTLE_MS)
    return { throttled: true };

  let fx = null;
  if (ns === 'synth') {
    fx = FIXTURES[fixtureId];
    if (!fx) throw new Error('unknown fixture');
  }

  let out;
  try {
    const res = fx ? await simulate(fx) : await realFetch();
    out = await parse(res);
  } catch (e) {
    out = { code: classifyThrown(e) };
  }

  const hasGood = Object.keys(state.days).length > 0;
  if (!out.ok) {
    // 실패해도 일별 기록(마지막 정상값)은 건드리지 않는다.
    await saveMeta(ns, {
      status: hasGood ? 'stale' : 'error_no_data',
      errorCode: out.code,
      errorMessage: ERRORS[out.code] || '알 수 없는 오류',
      lastAttemptAt: now.toISOString(),
      lastFixture: fixtureId || null,
    });
    return { ok: false, code: out.code };
  }

  // 합성 모드는 가상 날짜(fixture.day), 실제 모드는 조회 시점의 Asia/Seoul 날짜
  const day = fx ? fx.day : kstDay(now);
  const srcTime = out.time.length === 16 ? out.time + ':00+09:00' : out.time; // Open-Meteo는 timezone=Asia/Seoul 로컬시각
  const rec = {
    day,
    value: out.value,
    unit: SOURCE.unit,
    source: SOURCE.name,
    sourceUrl: SOURCE.url,
    sourceTime: srcTime,
    fetchedAt: kstIso(now),
    tz: TZ,
    raw: out.raw,
    synthetic: !!fx,
  };
  await saveDay(ns, day, rec);
  await saveMeta(ns, {
    status: 'fresh',
    errorCode: 'none',
    errorMessage: '',
    lastAttemptAt: now.toISOString(),
    lastFixture: fixtureId || null,
  });
  return { ok: true, day };
}

/* ---------- 화면용 상태 (어제 대비 계산 포함) ---------- */
export async function board(ns) {
  const { days, meta } = await loadState(ns);
  const asc = Object.keys(days).sort().map((d) => days[d]);
  const rows = asc.map((r, i) => {
    const prev = i > 0 ? asc[i - 1] : null;
    let delta = null;
    if (prev) {
      const d = Math.round((r.value - prev.value) * 100) / 100;
      const pct = prev.value !== 0 ? Math.round((d / Math.abs(prev.value)) * 10000) / 100 : null;
      const gap = Math.round((Date.parse(r.day) - Date.parse(prev.day)) / 86400000);
      delta = { value: d, pct, prevDay: prev.day, gapDays: gap };
    }
    return { ...r, delta };
  });
  const rev = rows.slice().reverse();
  return {
    ns,
    storage: storageKind(),
    serverNow: kstIso(new Date()),
    tz: TZ,
    source: SOURCE,
    latest: rev[0] || null,
    days: rev,
    meta: meta || { status: 'empty', errorCode: 'none', errorMessage: '', lastAttemptAt: null },
    fixtures: ns === 'synth' ? Object.keys(FIXTURES) : undefined,
  };
}

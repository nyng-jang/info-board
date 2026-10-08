// 오늘의 진짜 정보판 — 서버 로직 (Vercel Serverless, Node ESM)
// 실제 데이터: Open-Meteo 대전 현재 기온 (API 키 없는 공개 API → 비밀키 노출 0건)
// 합성 재생: 공식 T04 fixture 9종. live와 replay는 같은 검증·저장 함수(applyReading/applyError)를 쓴다.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import FIXTURE_LIST from './_fixtures.js';

export const TZ = 'Asia/Seoul';
export const LIVE = {
  signal_id: 'daejeon-temperature-2m',
  source_name: 'Open-Meteo 대전 현재 기온',
  source_url:
    'https://api.open-meteo.com/v1/forecast?latitude=36.3504&longitude=127.3845&current=temperature_2m&timezone=Asia%2FSeoul',
  unit: '°C',
};
const LIVE_DEADLINE_MS = 5000;
const THROTTLE_MS = 10000; // live 모드 연타 방지

export const FIXTURES = Object.fromEntries(FIXTURE_LIST.map((f) => [f.fixture_id, f]));
export const FIXTURE_IDS = FIXTURE_LIST.map((f) => f.fixture_id);

export const ERROR_CODES = ['timeout', 'auth', 'rate_limit', 'offline', 'schema_error'];
export const ERROR_MESSAGES = {
  timeout: '외부 서버 응답이 제한시간을 넘겼습니다(timeout).',
  auth: '외부 데이터 원천이 접근을 거절했습니다(401/403).',
  rate_limit: '외부 데이터 원천의 호출 한도를 넘었습니다(429).',
  offline: '네트워크에 연결할 수 없습니다(offline).',
  schema_error: '외부 응답 형식이 달라져 값을 읽을 수 없습니다(schema_error).',
};

/* ---------- 시간 ---------- */
export function kstDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) throw new TypeError('fetched_at must be a valid ISO-8601 date-time');
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}`;
}

/* ---------- 정규화 값 검증 (공식 normalized-reading 스키마와 같은 규칙) ---------- */
const KEYS = [
  'signal_id', 'normalized_value', 'unit', 'source_name', 'source_url',
  'source_time', 'fetched_at', 'record_timezone', 'record_date',
];
export function validateNormalizedReading(r) {
  if (!r || typeof r !== 'object' || Array.isArray(r)) throw new TypeError('reading must be an object');
  const a = Object.keys(r).sort();
  const e = [...KEYS].sort();
  if (a.length !== e.length || a.some((k, i) => k !== e[i])) throw new TypeError('keys mismatch');
  if (typeof r.signal_id !== 'string' || !/^[a-z0-9][a-z0-9._-]*$/.test(r.signal_id) || r.signal_id.length > 100)
    throw new TypeError('signal_id invalid');
  if (typeof r.normalized_value !== 'number' || !Number.isFinite(r.normalized_value))
    throw new TypeError('normalized_value must be a finite number');
  for (const f of ['unit', 'source_name'])
    if (typeof r[f] !== 'string' || r[f].trim() === '') throw new TypeError(`${f} must be non-empty`);
  let u;
  try { u = new URL(r.source_url); } catch { throw new TypeError('source_url invalid'); }
  if (u.protocol !== 'https:') throw new TypeError('source_url must be https');
  if (r.source_time !== null && Number.isNaN(new Date(r.source_time).getTime()))
    throw new TypeError('source_time invalid');
  if (Number.isNaN(new Date(r.fetched_at).getTime())) throw new TypeError('fetched_at invalid');
  if (r.record_timezone !== TZ) throw new TypeError('record_timezone must be Asia/Seoul');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.record_date) || r.record_date !== kstDate(r.fetched_at))
    throw new TypeError('record_date must be the Asia/Seoul date of fetched_at');
  return true;
}

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
// record_date를 키로 덮어쓰기 → 같은 날 여러 번 성공해도 1건 (HSET은 원자적)
async function saveDay(ns, date, row) {
  if (storageKind() === 'redis') return redis(['HSET', `t04:${ns}:days`, date, JSON.stringify(row)]);
  const all = readFile();
  all[ns] = all[ns] || { days: {}, meta: null };
  all[ns].days[date] = row;
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

/* ---------- 공통 상태 전이 (live·replay 공용) ---------- */
const recordIdFor = (ns, r) => `${ns === 'synth' ? 'demo' : 'live'}-${r.signal_id}-${r.record_date}`;
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

async function applyReading(ns, state, reading, raw, run) {
  validateNormalizedReading(reading); // 실패하면 호출자가 schema_error 로 처리
  const existing = state.days[reading.record_date];
  const row = {
    record_id: existing ? existing.record_id : recordIdFor(ns, reading),
    ...reading,
    first_fetched_at: existing ? existing.first_fetched_at : reading.fetched_at,
    raw,
  };
  await saveDay(ns, reading.record_date, row);
  await saveMeta(ns, {
    freshness: 'fresh',
    error_code: 'none',
    last_run: { ...run, outcome: 'success', error_code: 'none', retry_after_seconds: null },
  });
}
async function applyError(ns, code, run) {
  // 일별 기록(마지막 정상값)은 건드리지 않고 상태만 바꾼다.
  await saveMeta(ns, {
    freshness: 'stale',
    error_code: code,
    last_run: { ...run, outcome: 'error', error_code: code },
  });
}
function classifyStatus(status) {
  if (status === 401 || status === 403) return 'auth';
  if (status === 429) return 'rate_limit';
  if (status >= 500) return 'offline';
  if (status < 200 || status >= 300) return 'schema_error';
  return null;
}

/* ---------- 합성 재생 ---------- */
async function replayTransport(fx) {
  const t = fx.transport;
  if (t.mode === 'offline') return { code: 'offline' };
  if (t.mode === 'timeout' || t.delay_ms > t.deadline_ms) {
    await sleep(Math.min(t.deadline_ms, 1500)); // 느린 응답처럼 보이도록 제한시간만큼 대기
    return { code: 'timeout' };
  }
  await sleep(t.delay_ms);
  const code = classifyStatus(t.status);
  return code ? { code } : { payload: fx.payload };
}

/* ---------- 실제 호출 ---------- */
async function liveTransport() {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), LIVE_DEADLINE_MS);
  try {
    const res = await fetch(LIVE.source_url, { signal: ctl.signal, headers: { Accept: 'application/json' } });
    const code = classifyStatus(res.status);
    if (code) return { code };
    let j;
    try { j = await res.json(); } catch { return { code: 'schema_error' }; }
    const c = j && j.current;
    if (!c || typeof c.time !== 'string') return { code: 'schema_error' };
    const now = new Date();
    // Open-Meteo 는 timezone=Asia/Seoul 로컬 시각(오프셋 없음)을 준다 → +09:00 을 붙여 date-time 으로 정규화
    const sourceTime = c.time.length === 16 ? `${c.time}:00+09:00` : c.time;
    return {
      raw: JSON.stringify(c),
      payload: {
        signal_id: LIVE.signal_id,
        normalized_value: c.temperature_2m, // 타입이 바뀌면 검증에서 schema_error
        unit: LIVE.unit,
        source_name: LIVE.source_name,
        source_url: LIVE.source_url,
        source_time: sourceTime,
        fetched_at: now.toISOString(),
        record_timezone: TZ,
        record_date: kstDate(now.toISOString()),
      },
    };
  } catch (e) {
    return { code: e && e.name === 'AbortError' ? 'timeout' : 'offline' };
  } finally {
    clearTimeout(timer);
  }
}

/* ---------- 수집 ---------- */
export async function collect(ns, fixtureId) {
  const state = await loadState(ns);
  const real = new Date().toISOString();

  if (ns === 'live') {
    const last = state.meta?.last_run?.at;
    if (last && Date.now() - new Date(last).getTime() < THROTTLE_MS) return { throttled: true };
  }

  let fx = null;
  if (ns === 'synth') {
    fx = FIXTURES[fixtureId];
    if (!fx) throw new Error('unknown fixture');
  }
  const run = {
    fixture_id: fx ? fx.fixture_id : null,
    at: fx ? fx.virtual_now : real,
    retry_after_seconds:
      fx && fx.transport.headers['retry-after'] ? Number(fx.transport.headers['retry-after']) : null,
  };

  const out = fx ? await replayTransport(fx) : await liveTransport();
  if (out.code) {
    await applyError(ns, out.code, run);
    return { ok: false, code: out.code };
  }
  try {
    await applyReading(ns, state, out.payload, out.raw || JSON.stringify(out.payload), run);
  } catch {
    await applyError(ns, 'schema_error', run);
    return { ok: false, code: 'schema_error' };
  }
  return { ok: true };
}

/* ---------- 화면용 상태 (전일 대비는 저장한 두 값으로 다시 계산) ---------- */
function comparisonFor(rows, cur) {
  const prev = rows.filter((r) => r.record_date < cur.record_date).sort((a, b) => b.record_date.localeCompare(a.record_date))[0];
  if (!prev) return null;
  const gap = Math.round((Date.parse(cur.record_date) - Date.parse(prev.record_date)) / 86400000);
  if (prev.unit !== cur.unit) return { state: 'unit_mismatch', prev_date: prev.record_date, gap_days: gap };
  const signed = Math.round((cur.normalized_value - prev.normalized_value) * 1000) / 1000;
  const pct = prev.normalized_value !== 0 ? Math.round((signed / Math.abs(prev.normalized_value)) * 10000) / 100 : null;
  return {
    state: 'comparable',
    signed,
    magnitude: Math.abs(signed),
    direction: signed > 0 ? 'increase' : signed < 0 ? 'decrease' : 'unchanged',
    pct,
    prev_date: prev.record_date,
    gap_days: gap,
  };
}

export async function board(ns) {
  const { days, meta } = await loadState(ns);
  const asc = Object.keys(days).sort().map((d) => days[d]);
  const rows = asc.map((r) => ({ ...r, comparison: comparisonFor(asc, r) }));
  const rev = rows.slice().reverse();
  return {
    ns,
    storage: storageKind(),
    tz: TZ,
    latest: rev[0] || null,
    rows: rev,
    row_count: rows.length,
    meta: meta
      ? {
          freshness: meta.freshness,
          error_code: meta.error_code,
          error_message: meta.error_code === 'none' ? '' : ERROR_MESSAGES[meta.error_code] || '',
          last_run: meta.last_run,
        }
      : { freshness: null, error_code: null, error_message: '', last_run: null },
    fixtures: ns === 'synth' ? FIXTURE_IDS : undefined,
  };
}

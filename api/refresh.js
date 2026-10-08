import { board, collect, resetNs, FIXTURES } from './_lib.js';

// POST /api/refresh?ns=live            → 실제 API 1회 수집 (Vercel Cron은 GET으로 호출)
// POST /api/refresh?ns=synth&fixture=ID → 합성 장애/복구 재생
// POST /api/refresh?ns=synth&reset=1    → 합성 기록 초기화
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const q = req.query || {};
  const ns = q.ns === 'synth' ? 'synth' : 'live';
  try {
    if (ns === 'synth' && q.reset) {
      await resetNs('synth');
    } else if (ns === 'synth') {
      if (!FIXTURES[q.fixture]) return res.status(400).json({ error: 'unknown_fixture' });
      await collect('synth', q.fixture);
    } else {
      await collect('live');
    }
    res.status(200).json(await board(ns));
  } catch (e) {
    res.status(500).json({ error: 'server_error', message: String(e.message || e) });
  }
}

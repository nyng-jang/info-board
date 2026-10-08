import { board } from './_lib.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const ns = req.query?.ns === 'synth' ? 'synth' : 'live';
  try {
    res.status(200).json(await board(ns));
  } catch (e) {
    res.status(500).json({ error: 'storage_error', message: String(e.message || e) });
  }
}

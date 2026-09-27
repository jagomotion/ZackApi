const express = require('express');
const {
  searchRoute,
  suggestRoute,
  artistRoute,
  upnextRoute,
  ytplaylistRoute,
  lyricsRoute,
} = require('../scrapes/ytmusic/helper');
const {
  getAudioInfo,
  streamAudio,
  getAudioCacheStats,
  clearAudioCache,
} = require('../scrapes/ytmusic/engine');

const router = express.Router();

router.get('/search', async (req, res) => {
  const { q, type } = req.query;
  if (!q) return res.status(400).json({ status: 'error', message: 'q wajib diisi' });
  res.json(await searchRoute(q, type));
});

router.get('/suggest', async (req, res) => {
  const { q } = req.query;
  if (!q) return res.json({ status: 'success', data: [] });
  res.json(await suggestRoute(q));
});

router.get('/artist', async (req, res) => {
  const { id } = req.query;
  if (!id) return res.status(400).json({ status: 'error', message: 'id wajib diisi' });
  res.json(await artistRoute(id));
});

router.get('/upnext', async (req, res) => {
  const { id } = req.query;
  if (!id) return res.json({ status: 'success', data: [] });
  res.json(await upnextRoute(id));
});

router.get('/playlist', async (req, res) => {
  const { id } = req.query;
  if (!id) return res.status(400).json({ status: 'error', message: 'id wajib diisi' });
  res.json(await ytplaylistRoute(id));
});

router.get('/lyrics', async (req, res) => {
  const { id, title, artist } = req.query;
  if (!id) return res.status(400).json({ status: 'error', message: 'id wajib diisi' });
  res.json(await lyricsRoute(id, title, artist));
});

/* === AUDIO INFO === */
router.get('/audio', async (req, res) => {
  const { id } = req.query;
  if (!id) return res.status(400).json({ status: 'error', message: 'id wajib diisi' });
  const info = await getAudioInfo(id);
  if (info.error) return res.status(500).json({ status: 'error', message: info.error });
  res.json({ status: 'success', data: info });
});

/* === AUDIO STREAM PROXY (untuk Railway) === */
router.get('/stream', (req, res) => {
  const { id } = req.query;
  if (!id) return res.status(400).send('id wajib diisi');
  streamAudio(id, req, res);
});

/* === CACHE === */
router.get('/cache', (req, res) => {
  res.json({ status: 'success', data: getAudioCacheStats() });
});

router.post('/cache/clear', (req, res) => {
  const n = clearAudioCache();
  res.json({ status: 'success', message: `${n} entri cache dihapus` });
});

module.exports = router;
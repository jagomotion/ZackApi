const express = require('express');
const { spotifyClient } = require('../scrapes/spotify/engine');
const {
  renderPlayerPage,
  proxyAudioStream,
  getSpotifyDirectLink,
} = require('../scrapes/spotify/streamer');

const router = express.Router();

/* ========== RESPONSE HELPER (ZackApi Branding) ========== */
function ok(data, extra = {}) {
  return {
    status: 'success',
    developer: 'ZackApi',
    powered_by: 'ZackApi Engine',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    ...extra,
    data,
  };
}

function fail(message, code = null) {
  return {
    status: 'error',
    developer: 'ZackApi',
    powered_by: 'ZackApi Engine',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    message,
    ...(code ? { error_code: code } : {}),
  };
}

/* ========== SEARCH ========== */
router.get('/search', async (req, res) => {
  const q = req.query.q || '';
  const limit = parseInt(req.query.limit, 10) || 5;
  if (!q) return res.status(400).json(fail("Parameter 'q' wajib diisi", 'MISSING_QUERY'));

  try {
    const data = await spotifyClient.searchTracks(q, limit);
    res.json(ok(data, { total: data.length, query: q }));
  } catch (err) {
    res.status(500).json(fail(err.message, 'SEARCH_ERROR'));
  }
});

router.get('/search/artist', async (req, res) => {
  const q = req.query.q || '';
  const limit = parseInt(req.query.limit, 10) || 5;
  if (!q) return res.status(400).json(fail("Parameter 'q' wajib diisi", 'MISSING_QUERY'));

  try {
    const data = await spotifyClient.searchArtists(q, limit);
    res.json(ok(data, { total: data.length, query: q }));
  } catch (err) {
    res.status(500).json(fail(err.message, 'SEARCH_ERROR'));
  }
});

router.get('/search/album', async (req, res) => {
  const q = req.query.q || '';
  const limit = parseInt(req.query.limit, 10) || 5;
  if (!q) return res.status(400).json(fail("Parameter 'q' wajib diisi", 'MISSING_QUERY'));

  try {
    const data = await spotifyClient.searchAlbums(q, limit);
    res.json(ok(data, { total: data.length, query: q }));
  } catch (err) {
    res.status(500).json(fail(err.message, 'SEARCH_ERROR'));
  }
});

/* ========== DETAIL ========== */
router.get('/track/:id', async (req, res) => {
  try {
    const data = await spotifyClient.getTrackDetails(req.params.id);
    data.stream_url = `/api/spotify/audio/${data.id}`;
    data.player_url = `/api/spotify/stream/${data.id}`;
    res.json(ok(data));
  } catch (err) {
    res.status(500).json(fail(err.message, 'TRACK_ERROR'));
  }
});

router.get('/lyrics/:id', async (req, res) => {
  try {
    const data = await spotifyClient.getLyrics(req.params.id);
    res.json(ok(data));
  } catch (err) {
    res.status(500).json(fail(err.message, 'LYRICS_ERROR'));
  }
});

router.get('/canvas/:id', async (req, res) => {
  try {
    const canvas_url = await spotifyClient.getCanvasUrl(req.params.id);
    res.json(ok({ track_id: req.params.id, canvas_url }));
  } catch (err) {
    res.status(500).json(fail(err.message, 'CANVAS_ERROR'));
  }
});

router.get('/artist/:id', async (req, res) => {
  try {
    const data = await spotifyClient.getArtistOverview(req.params.id);
    res.json(ok(data));
  } catch (err) {
    res.status(500).json(fail(err.message, 'ARTIST_ERROR'));
  }
});

router.get('/album/:id', async (req, res) => {
  try {
    const data = await spotifyClient.getAlbum(req.params.id);
    data.tracks = data.tracks.map((t) => ({
      ...t,
      stream_url: `/api/spotify/audio/${t.id}`,
      player_url: `/api/spotify/stream/${t.id}`,
    }));
    res.json(ok(data));
  } catch (err) {
    res.status(500).json(fail(err.message, 'ALBUM_ERROR'));
  }
});

router.get('/playlist/:id', async (req, res) => {
  try {
    const data = await spotifyClient.getPlaylist(req.params.id);
    data.tracks = data.tracks.map((t) => ({
      ...t,
      stream_url: `/api/spotify/audio/${t.id}`,
      player_url: `/api/spotify/stream/${t.id}`,
    }));
    res.json(ok(data));
  } catch (err) {
    res.status(500).json(fail(err.message, 'PLAYLIST_ERROR'));
  }
});

router.get('/home', async (req, res) => {
  try {
    const data = await spotifyClient.getHomeFeed();
    res.json(ok(data, { total_sections: data.length }));
  } catch (err) {
    res.status(500).json(fail(err.message, 'HOME_ERROR'));
  }
});

/* ========== QUICK DOWNLOAD (via gamepvz fallback) ========== */
router.get('/download', async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).json(fail("Parameter 'url' wajib diisi", 'MISSING_URL'));

  const result = await getSpotifyDirectLink(url);
  if (result.status === 'error') {
    return res.status(400).json(fail(result.message, 'DOWNLOAD_ERROR'));
  }
  res.json(ok(result.data));
});

/* ========== STREAMING ========== */
router.get('/stream/:id', async (req, res) => {
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  const html = await renderPlayerPage(req.params.id, baseUrl);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

router.get('/audio/:id', (req, res) => {
  proxyAudioStream(req.params.id, req, res);
});

module.exports = router;
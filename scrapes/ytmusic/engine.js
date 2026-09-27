const axios = require('axios');
const youtubedl = require('youtube-dl-exec');
const { spawn } = require('child_process');
const path = require('path');

/* ============================================================
 * YTMUSIC-API
 * ============================================================ */
let _ytmusic = null;
let _initPromise = null;

async function getYTMusic() {
  if (_ytmusic) return _ytmusic;
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    const mod = await import('ytmusic-api');
    const YTMusic = mod.default;
    const yt = new YTMusic();
    await yt.initialize();
    _ytmusic = yt;
    return yt;
  })();

  return _initPromise;
}

/* ============================================================
 * RESPONSE FORMATTER
 * ============================================================ */
function _formatResponse(status, data, message = null, errorCode = null) {
  const res = {
    status,
    developer: 'Lann',
    version: '4.0.0',
    timestamp: new Date().toISOString(),
    data,
  };
  if (message) res.message = message;
  if (errorCode) res.error_code = errorCode;
  return res;
}

async function safe(fn, fallback = null) {
  try {
    const yt = await getYTMusic();
    return await fn(yt);
  } catch (e) {
    return fallback;
  }
}

/* ============================================================
 * SAFE WRAPPERS
 * ============================================================ */
const safeSearch            = (q) => safe((yt) => yt.search(q), []);
const safeSearchSongs       = (q) => safe((yt) => yt.searchSongs(q), []);
const safeSearchVideos      = (q) => safe((yt) => yt.searchVideos(q), []);
const safeSearchArtists     = (q) => safe((yt) => yt.searchArtists(q), []);
const safeSearchPlaylists   = (q) => safe((yt) => yt.searchPlaylists(q), []);
const safeSearchAlbums      = (q) => safe((yt) => yt.searchAlbums(q), []);
const safeGetArtist         = (id) => safe((yt) => yt.getArtist(id), null);
const safeGetAlbum          = (id) => safe((yt) => yt.getAlbum(id), null);
const safeGetPlaylist       = (id) => safe((yt) => yt.getPlaylist(id), null);
const safeGetPlaylistVideos = (id) => safe((yt) => yt.getPlaylistVideos(id), []);
const safeGetUpNexts        = (id) => safe((yt) => yt.getUpNexts(id), []);
const safeGetSong           = (id) => safe((yt) => yt.getSong(id), null);

async function constructRequest(endpoint, params) {
  const yt = await getYTMusic();
  return await yt.constructRequest(endpoint, params);
}

/* ============================================================
 * AUDIO INFO — URL LANGSUNG (untuk Java client & download)
 * ============================================================ */
const _audioCache = new Map();
const AUDIO_TTL = 5 * 60 * 60 * 1000; // 5 jam

async function getAudioInfo(videoId) {
  if (!videoId || videoId.length !== 11) {
    return { error: 'videoId tidak valid' };
  }

  const cached = _audioCache.get(videoId);
  if (cached && Date.now() - cached.cachedAt < cached.ttl) {
    return cached.data;
  }

  let result = null;
  try {
    const url = `https://www.youtube.com/watch?v=${videoId}`;

    // Ambil metadata
    const info = await youtubedl(url, {
      dumpSingleJson: true,
      noWarnings: true,
      format: 'bestaudio[ext=m4a]/bestaudio/best',
    });

    // Ambil URL audio langsung
    const audioUrl = await youtubedl(url, {
      getUrl: true,
      noWarnings: true,
      format: 'bestaudio[ext=m4a]/bestaudio/best',
    });

    result = {
      videoId,
      title: info.title,
      author: info.uploader || info.channel,
      duration: info.duration,
      thumbnails: (info.thumbnails || []).map((t) => ({
        url: t.url,
        width: t.width,
        height: t.height,
      })),
      audio_url: audioUrl.trim(),
      mime: info.ext ? `audio/${info.ext}` : 'audio/mp4',
      bitrate: info.abr || null,
      filesize: info.filesize || info.filesize_approx || null,
      source: 'yt-dlp',
      // URL proxy (untuk Railway / server penuh)
      proxy_url: `/api/music/stream?id=${videoId}`,
    };
  } catch (e) {
    result = { error: `yt-dlp: ${e.message}` };
  }

  if (!result.error) {
    _audioCache.set(videoId, { data: result, cachedAt: Date.now(), ttl: AUDIO_TTL });
  }
  return result;
}

/* ============================================================
 * STREAM PROXY — untuk Railway (server penuh)
 * Di Termux sering SIGKILL — pakai /audio untuk Termux
 * ============================================================ */
function streamAudio(videoId, req, res) {
  if (!videoId || videoId.length !== 11) {
    return res.status(400).send('videoId tidak valid');
  }

  const url = `https://www.youtube.com/watch?v=${videoId}`;

  res.setHeader('Content-Type', 'audio/mp4');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const subprocess = youtubedl.exec(url, {
    output: '-',
    format: 'bestaudio[ext=m4a]/bestaudio/best',
    noWarnings: true,
    quiet: true,
  });

  subprocess.stdout.pipe(res);

  subprocess.stderr.on('data', (d) => {
    console.error('[yt-dlp stderr]', d.toString());
  });

  subprocess.on('error', (err) => {
    console.error('[yt-dlp spawn error]', err.message);
    if (!res.headersSent) res.status(500).send('yt-dlp error: ' + err.message);
  });

  const cleanup = () => {
    if (subprocess && !subprocess.killed) {
      try { subprocess.kill('SIGKILL'); } catch (_) {}
    }
  };

  req.on('close', cleanup);
  req.on('aborted', cleanup);
}

/* ============================================================
 * CACHE UTILITIES
 * ============================================================ */
function getAudioCacheStats() {
  return {
    size: _audioCache.size,
    keys: Array.from(_audioCache.keys()),
  };
}

function clearAudioCache() {
  const n = _audioCache.size;
  _audioCache.clear();
  return n;
}

/* ============================================================
 * EXPORTS
 * ============================================================ */
module.exports = {
  getYTMusic,
  safe,
  safeSearch,
  safeSearchSongs,
  safeSearchVideos,
  safeSearchArtists,
  safeSearchPlaylists,
  safeSearchAlbums,
  safeGetArtist,
  safeGetAlbum,
  safeGetPlaylist,
  safeGetPlaylistVideos,
  safeGetUpNexts,
  safeGetSong,
  constructRequest,
  getAudioInfo,
  streamAudio,
  getAudioCacheStats,
  clearAudioCache,
  _formatResponse,
};
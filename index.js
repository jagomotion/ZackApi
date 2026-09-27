const express = require('express');
const cors = require('cors');
const path = require('path');
const emailRouter = require('./routes/email');
const musicRouter = require('./routes/music');
const spotifyRouter = require('./routes/spotify');
const alightmotionRouter = require('./routes/alightmotion');

const PORT = process.env.PORT || 3000;
const app = express();

const START_TIME = Date.now();
const requestStats = { total: 0, perEndpoint: {} };

app.use((req, res, next) => {
  const start = Date.now();
  requestStats.total++;
  const key = `${req.method} ${req.path}`;
  requestStats.perEndpoint[key] = (requestStats.perEndpoint[key] || 0) + 1;

  res.on('finish', () => {
    const dur = Date.now() - start;
    if (!req.path.startsWith('/css') && !req.path.startsWith('/js')) {
      console.log(`[ZackApi] ${req.method} ${req.path} ${res.statusCode} ${dur}ms`);
    }
  });
  next();
});

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const endpoints = [
  { method: 'GET', path: '/api/health', desc: 'Status dan uptime server', params: '-', example: '', accent: '#34A853' },
  { method: 'GET', path: '/api/stats', desc: 'Statistik penggunaan API', params: '-', example: '', accent: '#34A853' },

  { method: 'GET', path: '/api/domains', desc: 'Daftar domain email aktif', params: 'refresh', example: '', accent: '#4285F4' },
  { method: 'GET', path: '/api/generate', desc: 'Buat alamat email sementara', params: 'username, domain', example: '?username=zack', accent: '#EA4335' },
  { method: 'GET', path: '/api/inbox', desc: 'Ambil pesan masuk', params: 'email', example: '?email=zack@fboxmail.com', accent: '#FBBC05' },
  { method: 'GET', path: '/api/message', desc: 'Baca detail pesan', params: 'email, link', example: '?email=zack@fboxmail.com&link=xxx', accent: '#34A853' },
  { method: 'GET', path: '/api/listen', desc: 'Pantau inbox pesan baru', params: 'email, timeout', example: '?email=zack@fboxmail.com', accent: '#4285F4' },
  { method: 'GET', path: '/api/otp', desc: 'Tunggu kode OTP', params: 'email, timeout', example: '?email=zack@fboxmail.com', accent: '#EA4335' },
  { method: 'GET', path: '/api/link', desc: 'Tunggu tautan verifikasi', params: 'email, timeout', example: '?email=zack@fboxmail.com', accent: '#FBBC05' },

  { method: 'GET', path: '/api/music/search', desc: 'Cari lagu di YouTube Music', params: 'q, type', example: '?q=coldplay&type=song', accent: '#4285F4' },
  { method: 'GET', path: '/api/music/audio', desc: 'URL audio langsung YouTube', params: 'id', example: '?id=dQw4w9WgXcQ', accent: '#EA4335' },
  { method: 'GET', path: '/api/music/stream', desc: 'Proxy stream YouTube', params: 'id', example: '?id=dQw4w9WgXcQ', accent: '#34A853' },
  { method: 'GET', path: '/api/music/suggest', desc: 'Saran pencarian otomatis', params: 'q', example: '?q=coldplay', accent: '#FBBC05' },
  { method: 'GET', path: '/api/music/artist', desc: 'Detail artis dan lagu populer', params: 'id', example: '?id=UCxxxx', accent: '#34A853' },
  { method: 'GET', path: '/api/music/upnext', desc: 'Rekomendasi lagu berikutnya', params: 'id', example: '?id=dQw4w9WgXcQ', accent: '#4285F4' },
  { method: 'GET', path: '/api/music/playlist', desc: 'Isi playlist atau album', params: 'id', example: '?id=PLxxxx', accent: '#EA4335' },
  { method: 'GET', path: '/api/music/lyrics', desc: 'Lirik lagu', params: 'id, title, artist', example: '?id=dQw4w9WgXcQ&title=Never&artist=Rick', accent: '#FBBC05' },

  { method: 'GET', path: '/api/spotify/search', desc: 'Cari lagu di Spotify', params: 'q, limit', example: '?q=shape+of+my+heart', accent: '#1DB954' },
  { method: 'GET', path: '/api/spotify/search/artist', desc: 'Cari artis Spotify', params: 'q, limit', example: '?q=coldplay', accent: '#1DB954' },
  { method: 'GET', path: '/api/spotify/search/album', desc: 'Cari album Spotify', params: 'q, limit', example: '?q=midnights', accent: '#1DB954' },
  { method: 'GET', path: '/api/spotify/track/:id', desc: 'Detail lagu Spotify', params: 'id', example: '/api/spotify/track/4uLU6hMCjMI75M1A2tKUQC', accent: '#1DB954' },
  { method: 'GET', path: '/api/spotify/lyrics/:id', desc: 'Lirik sinkron Spotify', params: 'id', example: '/api/spotify/lyrics/4uLU6hMCjMI75M1A2tKUQC', accent: '#1DB954' },
  { method: 'GET', path: '/api/spotify/canvas/:id', desc: 'Canvas video lagu', params: 'id', example: '/api/spotify/canvas/4uLU6hMCjMI75M1A2tKUQC', accent: '#1DB954' },
  { method: 'GET', path: '/api/spotify/artist/:id', desc: 'Info lengkap artis', params: 'id', example: '/api/spotify/artist/1dfeR4HaWDbWqFHLkxsg1d', accent: '#1DB954' },
  { method: 'GET', path: '/api/spotify/album/:id', desc: 'Detail album', params: 'id', example: '/api/spotify/album/1ATL5GLyefJaxhQzSPVrLX', accent: '#1DB954' },
  { method: 'GET', path: '/api/spotify/playlist/:id', desc: 'Isi playlist Spotify', params: 'id', example: '/api/spotify/playlist/37i9dQZF1DXcBWIGoYBM5M', accent: '#1DB954' },
  { method: 'GET', path: '/api/spotify/home', desc: 'Feed home Spotify', params: '-', example: '', accent: '#1DB954' },
  { method: 'GET', path: '/api/spotify/download', desc: 'Link download langsung', params: 'url', example: '?url=https://open.spotify.com/track/xxx', accent: '#1DB954' },
  { method: 'GET', path: '/api/spotify/stream/:id', desc: 'HTML player audio only', params: 'id', example: '/api/spotify/stream/4uLU6hMCjMI75M1A2tKUQC', accent: '#1DB954' },
  { method: 'GET', path: '/api/spotify/audio/:id', desc: 'Proxy audio streaming', params: 'id', example: '/api/spotify/audio/4uLU6hMCjMI75M1A2tKUQC', accent: '#1DB954' },

  { method: 'GET', path: '/alightmotion/send', desc: 'Kirim link verifikasi ke email', params: 'email, orderid', example: '?email=user@example.com', accent: '#6C5CE7' },
  { method: 'GET', path: '/alightmotion/verify', desc: 'Verifikasi dan aktifkan premium otomatis', params: 'email, link, orderid', example: '?email=user@example.com&link=xxx', accent: '#6C5CE7' },
  { method: 'GET', path: '/alightmotion/refresh', desc: 'Refresh session token', params: 'refresh_token', example: '?refresh_token=xxx', accent: '#6C5CE7' },
  { method: 'GET', path: '/alightmotion/extract', desc: 'Ekstrak oobCode dari link', params: 'link', example: '?link=https://...', accent: '#6C5CE7' },
  { method: 'GET', path: '/alightmotion/order-id', desc: 'Generate order ID Google Play', params: 'renewal', example: '?renewal=0', accent: '#6C5CE7' },
  { method: 'GET', path: '/alightmotion/order-id/validate', desc: 'Validasi format order ID', params: 'id', example: '?id=GPA.3373-8882-5648-30654', accent: '#6C5CE7' },
];

app.get('/', (req, res) => {
  const proto = req.headers['x-forwarded-proto'] || req.protocol;
  const baseUrl = `${proto}://${req.headers.host}`;
  res.render('index', {
    endpoints,
    baseUrl,
    year: new Date().getFullYear(),
    uptime: Math.floor((Date.now() - START_TIME) / 1000),
  });
});

app.get('/player', (req, res) => {
  res.render('player');
});

app.get('/api/health', (req, res) => {
  const mem = process.memoryUsage();
  res.json({
    status: 'success',
    developer: 'ZackApi',
    powered_by: 'ZackApi Engine',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    data: {
      online: true,
      uptime_seconds: Math.floor((Date.now() - START_TIME) / 1000),
      uptime_human: formatUptime(Date.now() - START_TIME),
      memory_mb: Math.round(mem.rss / 1024 / 1024),
      node_version: process.version,
      platform: process.platform,
    },
  });
});

app.get('/api/stats', (req, res) => {
  const sorted = Object.entries(requestStats.perEndpoint)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([endpoint, count]) => ({ endpoint, count }));

  res.json({
    status: 'success',
    developer: 'ZackApi',
    powered_by: 'ZackApi Engine',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    data: {
      total_requests: requestStats.total,
      uptime_seconds: Math.floor((Date.now() - START_TIME) / 1000),
      top_endpoints: sorted,
    },
  });
});

function formatUptime(ms) {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${d}d ${h}h ${m}m ${sec}s`;
}

app.use('/api', emailRouter);
app.use('/api/music', musicRouter);
app.use('/api/spotify', spotifyRouter);
app.use('/api/alightmotion', alightmotionRouter);
app.use('/alightmotion', alightmotionRouter);

app.listen(PORT, () => {
  console.log(`ZackApi berjalan di http://localhost:${PORT}`);
});
const { execFile } = require('child_process');
const { spotifyClient } = require('./engine');

const audioCache = {};

function getDirectFullAudioUrl(query) {
  return new Promise((resolve) => {
    if (audioCache[query]) return resolve(audioCache[query]);

    const args = [
      `ytsearch1:${query} audio`,
      '--format', 'bestaudio[ext=m4a]/bestaudio/best',
      '--get-url',
      '--no-playlist',
      '--quiet',
      '--no-warnings',
      '--extractor-args', 'youtube:player_client=ios,android',
    ];

    execFile('yt-dlp', args, { timeout: 30000 }, (error, stdout) => {
      if (!error && stdout) {
        const url = stdout.trim().split('\n')[0];
        if (url) {
          audioCache[query] = url;
          return resolve(url);
        }
      }
      resolve('');
    });
  });
}

async function resolvePlayableTrack(id) {
  try {
    const t = await spotifyClient.getTrackDetails(id);
    if (t && t.title) {
      return { current: t, queue: [{ id: t.id, title: t.title, artists: t.artists }] };
    }
  } catch (_) {}

  try {
    const alb = await spotifyClient.getAlbum(id);
    if (alb && alb.tracks && alb.tracks.length > 0) {
      return {
        current: alb.tracks[0],
        queue: alb.tracks.map((tr) => ({ id: tr.id, title: tr.title, artists: tr.artists || alb.artists })),
      };
    }
  } catch (_) {}

  try {
    const pl = await spotifyClient.getPlaylist(id);
    if (pl && pl.tracks && pl.tracks.length > 0) {
      return {
        current: pl.tracks[0],
        queue: pl.tracks.map((tr) => ({ id: tr.id, title: tr.title, artists: tr.artists })),
      };
    }
  } catch (_) {}

  try {
    const art = await spotifyClient.getArtistOverview(id);
    if (art && art.top_tracks && art.top_tracks.length > 0) {
      return {
        current: art.top_tracks[0],
        queue: art.top_tracks.map((tr) => ({ id: tr.id, title: tr.title, artists: art.name })),
      };
    }
  } catch (_) {}

  return null;
}

async function renderPlayerPage(id, baseUrl) {
  const resolved = await resolvePlayableTrack(id);
  if (!resolved || !resolved.current) {
    return `<!DOCTYPE html><html><body style="background:#000;color:#666;font-family:sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;"><p>Stream tidak tersedia untuk item ini</p></body></html>`;
  }

  const firstTrack = resolved.current;
  const queue = resolved.queue || [firstTrack];
  const title = firstTrack.title || 'Track';
  const artists = firstTrack.artists || '';
  const pageTitle = artists ? `${title} — ${artists}` : title;

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${pageTitle}</title>
  <style>
    html, body {
      margin: 0; padding: 0; width: 100%; height: 100%;
      background-color: #000000; display: flex;
      justify-content: center; align-items: center; overflow: hidden;
    }
    audio { width: 320px; height: 40px; outline: none; }
  </style>
</head>
<body>
  <audio id="player" controls autoplay src="${baseUrl}/api/spotify/audio/${firstTrack.id}"></audio>
  <script>
    const queue = ${JSON.stringify(queue)};
    let currentIndex = 0;
    const player = document.getElementById('player');
    player.addEventListener('ended', () => {
      currentIndex++;
      if (currentIndex < queue.length) {
        const next = queue[currentIndex];
        document.title = next.artists ? (next.title + ' — ' + next.artists) : next.title;
        player.src = '${baseUrl}/api/spotify/audio/' + next.id;
        player.play();
      }
    });
  </script>
</body>
</html>`;
}

async function proxyAudioStream(id, req, res) {
  try {
    const resolved = await resolvePlayableTrack(id);
    if (!resolved || !resolved.current) {
      return res.status(404).send('Audio stream not found');
    }

    const trackInfo = resolved.current;
    const audioUrl = await getDirectFullAudioUrl(`${trackInfo.artists} - ${trackInfo.title}`);

    if (!audioUrl) {
      return res.status(404).send('Audio stream not found');
    }

    const forwardHeaders = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' };
    if (req.headers.range) forwardHeaders['Range'] = req.headers.range;

    const audioRes = await fetch(audioUrl, { headers: forwardHeaders });

    const responseHeaders = {
      'Content-Type': audioRes.headers.get('content-type') || 'audio/mp4',
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*',
    };
    if (audioRes.headers.has('content-range')) responseHeaders['Content-Range'] = audioRes.headers.get('content-range');
    if (audioRes.headers.has('content-length')) responseHeaders['Content-Length'] = audioRes.headers.get('content-length');

    res.writeHead(audioRes.status, responseHeaders);

    const reader = audioRes.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
    res.end();
  } catch (err) {
    if (!res.headersSent) res.status(500).send('Stream error: ' + err.message);
    else res.end();
  }
}

async function getSpotifyDirectLink(spotifyUrl) {
  try {
    const apiResponse = await fetch('https://gamepvz.com/api/download/get-url', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Origin': 'https://gamepvz.com',
        'Referer': 'https://gamepvz.com/',
      },
      body: JSON.stringify({ url: spotifyUrl }),
    });

    if (!apiResponse.ok) {
      throw new Error(`HTTP Error: ${apiResponse.status}`);
    }

    const data = await apiResponse.json();

    if (data.code !== 200 || !data.originalVideoUrl) {
      throw new Error(data.msg || 'Gagal mendapatkan data. Pastikan link Spotify valid!');
    }

    const title = data.title || 'Unknown Title';
    const artist = data.authorName || 'Unknown Artist';
    const coverUrl = data.coverUrl || '';

    let downloadUrl = 'Tidak tersedia';
    if (data.originalVideoUrl.includes('?url=')) {
      const base64Url = data.originalVideoUrl.split('?url=')[1];
      downloadUrl = Buffer.from(base64Url, 'base64').toString('utf-8');
    } else {
      downloadUrl = `https://gamepvz.com${data.originalVideoUrl}`;
    }

    return {
      status: 'success',
      data: {
        title,
        artist,
        cover_url: coverUrl,
        download_url: downloadUrl,
        source_url: spotifyUrl,
      },
    };
  } catch (error) {
    return { status: 'error', message: error.message };
  }
}

module.exports = {
  getDirectFullAudioUrl,
  resolvePlayableTrack,
  renderPlayerPage,
  proxyAudioStream,
  getSpotifyDirectLink,
};

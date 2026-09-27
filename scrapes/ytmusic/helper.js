// (Salin isi file helper.js yang sudah ada di sini)
const axios = require('axios');
const {
  safeSearch, safeSearchSongs, safeSearchVideos, safeSearchArtists,
  safeSearchPlaylists, safeSearchAlbums, safeGetArtist, safeGetAlbum,
  safeGetPlaylist, safeGetPlaylistVideos, safeGetUpNexts, constructRequest,
  _formatResponse,
} = require('./engine');


async function searchRoute(query, type) {
  if (!query) return _formatResponse('success', []);

  if (type === 'playlist') return _formatResponse('success', await safeSearchPlaylists(query));
  if (type === 'artist')   return _formatResponse('success', await safeSearchArtists(query));
  if (type === 'album')    return _formatResponse('success', await safeSearchAlbums(query));
  if (type === 'song')     return _formatResponse('success', await safeSearchSongs(query));
  if (type === 'video')    return _formatResponse('success', await safeSearchVideos(query));

  if (type === 'all') {
    const r = await safeSearch(query);
    if (Array.isArray(r) && r.length > 0) return _formatResponse('success', r);
    return _formatResponse('success', await safeSearchSongs(query));
  }

  const songs   = await safeSearchSongs(query);
  const videos  = await safeSearchVideos(query);
  const artists = await safeSearchArtists(query);
  const results = [
    ...(Array.isArray(songs) ? songs : []),
    ...(Array.isArray(videos) ? videos : []),
    ...(Array.isArray(artists) ? artists : []),
  ];
  return _formatResponse('success', results);
}

/* ================= SUGGEST ================= */
async function suggestRoute(q) {
  if (!q) return _formatResponse('success', []);
  try {
    const res = await axios.get(
      `http://suggestqueries.google.com/complete/search?client=youtube&ds=yt&client=firefox&q=${encodeURIComponent(q)}`,
      { timeout: 10000 }
    );
    return _formatResponse('success', res.data[1] || []);
  } catch (_) {
    return _formatResponse('success', []);
  }
}

/* ================= ARTIST ================= */
async function artistRoute(id) {
  if (!id) return _formatResponse('error', null, 'ID wajib diisi', 'INVALID_ID');

  let artist = await safeGetArtist(id);

  if (artist) {
    if (artist.featuredOn && artist.featuredOn.length > 0 && artist.featuredOn[0].playlistId === artist.artistId) {
      const liveVids = artist.featuredOn.map((item) => {
        let videoId = item.playlistId;
        if (item.thumbnails && item.thumbnails.length > 0) {
          const match = item.thumbnails[0].url.match(/\/vi\/([a-zA-Z0-9-_]{11})\//);
          if (match) videoId = match[1];
        }
        return { ...item, type: 'VIDEO', videoId };
      });

      if (
        artist.similarArtists &&
        artist.similarArtists.length > 0 &&
        (artist.similarArtists[0].artistId.startsWith('VL') ||
          artist.similarArtists[0].artistId.startsWith('PL') ||
          artist.similarArtists[0].artistId.startsWith('RD'))
      ) {
        artist.featuredOn = artist.similarArtists.map((item) => ({
          type: 'PLAYLIST',
          playlistId: item.artistId,
          name: item.name,
          artist: { name: artist.name, artistId: artist.artistId },
          thumbnails: item.thumbnails,
        }));
        artist.similarArtists = [];
      } else {
        artist.featuredOn = [];
      }
      artist.livePerformances = liveVids;
    }

    if (!artist.topVideos || artist.topVideos.length === 0) {
      const vids = await safeSearchVideos(`${artist.name} official video`);
      if (Array.isArray(vids) && vids.length > 0) artist.topVideos = vids.slice(0, 12);
    }

    return _formatResponse('success', artist);
  }

  let fallbackSongs = [];
  let fallbackVideos = [];
  let artistName = id;
  let thumbnails = [];

  const searchRes = await safeSearch(id);
  if (Array.isArray(searchRes)) {
    const artistMatch = searchRes.find((item) => item.type === 'ARTIST' || item.artistId === id);
    if (artistMatch) {
      artistName = artistMatch.name || id;
      thumbnails = artistMatch.thumbnails || [];
    }
  }

  fallbackSongs = await safeSearchSongs(artistName);
  fallbackVideos = await safeSearchVideos(`${artistName} official video`);

  if (fallbackSongs.length > 0 && (!thumbnails || thumbnails.length === 0)) {
    const first = fallbackSongs[0];
    thumbnails = first.thumbnails || [];
    if (first.artist?.name) artistName = first.artist.name;
  }

  const fallbackArtist = {
    artistId: id,
    name: artistName || 'Artis',
    thumbnails: thumbnails.length > 0 ? thumbnails : [{ url: 'https://picsum.photos/seed/artist/400/400', width: 400, height: 400 }],
    topSongs: fallbackSongs.slice(0, 20),
    topAlbums: [],
    topSingles: [],
    topVideos: fallbackVideos.slice(0, 12),
    similarArtists: [],
  };

  return _formatResponse('success', fallbackArtist);
}

/* ================= UPNEXT ================= */
async function upnextRoute(id) {
  if (!id) return _formatResponse('success', []);

  const upNext = await safeGetUpNexts(id);
  if (Array.isArray(upNext) && upNext.length > 0) return _formatResponse('success', upNext);

  const fallbackSongs = await safeSearchSongs('top hits pop');
  return _formatResponse('success', Array.isArray(fallbackSongs) ? fallbackSongs.slice(0, 10) : []);
}

/* ================= YT PLAYLIST / ALBUM ================= */
async function ytplaylistRoute(rawId) {
  if (!rawId || rawId === 'undefined' || rawId === 'null') {
    return _formatResponse('error', { playlistId: rawId, videos: [] }, 'ID tidak valid', 'INVALID_ID');
  }

  const isAlbum = rawId.startsWith('MPREb_') || rawId.startsWith('OLAK');

  if (isAlbum) {
    const candidates = [rawId, rawId.startsWith('VL') ? rawId.slice(2) : `VL${rawId}`];
    for (const id of candidates) {
      const album = await safeGetAlbum(id);
      if (album && album.songs && album.songs.length > 0) {
        return _formatResponse('success', {
          playlistId: album.albumId || id,
          name: album.name || 'Album',
          artist: album.artist,
          thumbnails: album.thumbnails || [],
          videos: album.songs.map((song) => ({
            videoId: song.videoId,
            name: song.name,
            artist: song.artist || (album.artist ? [album.artist] : []),
            duration: song.duration,
            thumbnails: song.thumbnails || album.thumbnails || [],
          })),
        });
      }
    }
  }

  const playlistCandidates = [];
  if (rawId.startsWith('VL')) playlistCandidates.push(rawId, rawId.slice(2));
  else if (rawId.startsWith('PL') || rawId.startsWith('RD')) playlistCandidates.push(rawId, `VL${rawId}`);
  else playlistCandidates.push(rawId);

  for (const id of playlistCandidates) {
    const playlist = await safeGetPlaylist(id);
    if (playlist) {
      let videos = playlist.videos || [];
      if (!videos || videos.length === 0) videos = await safeGetPlaylistVideos(id);
      if (videos && videos.length > 0) {
        return _formatResponse('success', {
          playlistId: playlist.playlistId || id,
          name: playlist.name || 'Playlist',
          artist: playlist.artist,
          thumbnails: playlist.thumbnails || [],
          videos,
        });
      }
    }

    const videos = await safeGetPlaylistVideos(id);
    if (videos && videos.length > 0) {
      return _formatResponse('success', {
        playlistId: id,
        name: 'Playlist',
        thumbnails: videos[0]?.thumbnails || [],
        videos,
      });
    }
  }

  const query = rawId.replace(/[-_]/g, ' ');
  const fallbackSongs = await safeSearchSongs(query.length > 3 ? query : 'top hits indonesia');
  if (fallbackSongs && fallbackSongs.length > 0) {
    return _formatResponse('success', {
      playlistId: rawId,
      name: query.length > 3 ? query.charAt(0).toUpperCase() + query.slice(1) : 'Koleksi Musik',
      thumbnails: fallbackSongs[0]?.thumbnails || [],
      videos: fallbackSongs.slice(0, 20),
    });
  }

  return _formatResponse('success', { playlistId: rawId, name: 'Playlist', thumbnails: [], videos: [] });
}

/* ================= LYRICS ================= */
async function lyricsRoute(id, title, artist) {
  if (!id || id.length !== 11) return _formatResponse('error', null, 'ID tidak valid', 'INVALID_ID');

  let finalLyrics = null;

  if (title && artist) {
    try {
      const q = new URLSearchParams({ track_name: title, artist_name: artist }).toString();
      const res = await axios.get('https://lrclib.net/api/get?' + q, {
        headers: { 'User-Agent': 'AppleMusicClone/1.0.0' },
        timeout: 15000,
        validateStatus: () => true,
      });
      if (res.status === 200 && res.data) {
        const data = res.data;
        if (data.syncedLyrics) {
          const lines = data.syncedLyrics.split('\n');
          const parsed = lines
            .map((line) => {
              const match = line.match(/\[(\d{2}):(\d{2}(?:\.\d{2,3})?)\](.*)/);
              if (match) {
                const time = parseInt(match[1], 10) * 60 + parseFloat(match[2]);
                return { time, text: match[3].trim() };
              }
              return null;
            })
            .filter(Boolean);
          if (parsed.length > 0) finalLyrics = { type: 'synced', lines: parsed };
        } else if (data.plainLyrics && !finalLyrics) {
          const lines = data.plainLyrics.split('\n').filter((v) => !!v.trim());
          finalLyrics = { type: 'plain', lines: lines.map((text) => ({ text })) };
        }
      }
    } catch (_) {}
  }

  if (!finalLyrics) {
    try {
      const watchPlaylistData = await constructRequest('next', { videoId: id });
      let lyricsId = null;
      const tabs =
        watchPlaylistData?.contents?.singleColumnMusicWatchNextResultsRenderer?.tabbedRenderer
          ?.watchNextTabbedResultsRenderer?.tabs;

      if (tabs) {
        for (const tab of tabs) {
          const tabRenderer = tab.tabRenderer;
          if (
            tabRenderer?.endpoint?.browseEndpoint?.browseEndpointContextSupportedConfigs
              ?.browseEndpointContextMusicConfig?.pageType === 'MUSIC_PAGE_TYPE_TRACK_LYRICS'
          ) {
            lyricsId = tabRenderer.endpoint.browseEndpoint.browseId;
            break;
          }
        }
      }

      if (lyricsId) {
        const lyricsData = await constructRequest('browse', { browseId: lyricsId });
        const runs =
          lyricsData?.contents?.sectionListRenderer?.contents?.[0]?.musicDescriptionShelfRenderer
            ?.description?.runs;
        let lyricsText = null;
        if (runs) lyricsText = runs.map((r) => r.text).join('');

        if (lyricsText && !lyricsText.includes('Lyrics not available')) {
          const lines = lyricsText.replaceAll('\r', '').split('\n').filter((v) => !!v.trim());
          finalLyrics = { type: 'plain', lines: lines.map((text) => ({ text })) };
        }
      }
    } catch (_) {}
  }

  return _formatResponse('success', { lyrics: finalLyrics });
}

module.exports = {
  searchRoute,
  suggestRoute,
  artistRoute,
  upnextRoute,
  ytplaylistRoute,
  lyricsRoute,
};
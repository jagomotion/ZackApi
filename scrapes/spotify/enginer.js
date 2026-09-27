const crypto = require('crypto');

/* ============================================================
 * SPOTIFY CORE ENGINE (REVERSE-ENGINEERED — ZERO DEPENDENCY)
 * ============================================================ */
const SP_DC_DEFAULT = process.env.SP_DC || '';

class SpotifyPureAPI {
  constructor(spDc) {
    this.spDc = spDc || SP_DC_DEFAULT;
    this.accessToken = null;
    this.clientToken = null;
    this.tokenExpiry = 0;
    this.totpSecret = ',7/*F("rLJ2oxaKL^f+E1xvP@N';
    this.totpVersion = '61';
  }

  async _fetchLatestTotpFromWeb() {
    try {
      const res = await fetch('https://open.spotify.com/', {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      });
      if (res.ok) {
        const html = await res.text();
        const jsMatch = html.match(/src="([^"]*\/cdn\/build\/web-player\/web-player\.[a-f0-9]+\.js)"/);
        if (jsMatch) {
          let jsUrl = jsMatch[1];
          if (!jsUrl.startsWith('http')) jsUrl = 'https://open.spotifycdn.com' + jsUrl;
          const jsRes = await fetch(jsUrl);
          if (jsRes.ok) {
            const jsText = await jsRes.text();
            const match = jsText.match(/let\s+[a-zA-Z0-9_$]+\s*=\s*(\[\s*\{secret:.*?\}\s*\])\.map/);
            if (match) {
              const rawArray = match[1];
              const itemMatches = [...rawArray.matchAll(/secret:\s*(['"])(.*?)(?<!\\)\1\s*,\s*version:\s*(\d+)/g)];
              if (itemMatches.length > 0) {
                itemMatches.sort((a, b) => parseInt(b[3]) - parseInt(a[3]));
                this.totpSecret = itemMatches[0][2];
                this.totpVersion = itemMatches[0][3];
                return true;
              }
            }
          }
        }
      }
    } catch (_) {}
    return false;
  }

  _generateTotp(timestampMs = null) {
    if (!timestampMs) timestampMs = Date.now();
    const r = [];
    for (let i = 0; i < this.totpSecret.length; i++) {
      r.push(String(this.totpSecret.charCodeAt(i) ^ ((i % 33) + 9)));
    }
    const rawKey = Buffer.from(r.join(''), 'utf-8');
    const counter = Math.floor(timestampMs / 1000 / 30);
    const counterBuf = Buffer.alloc(8);
    counterBuf.writeBigUInt64BE(BigInt(counter));

    const hmac = crypto.createHmac('sha1', rawKey).update(counterBuf).digest();
    const offset = hmac[hmac.length - 1] & 0x0f;
    const truncated = hmac.readUInt32BE(offset) & 0x7fffffff;
    return String(truncated % 1000000).padStart(6, '0');
  }

  async getClientToken() {
    const payload = {
      client_data: {
        client_version: '1.2.98.59.g81a1284c-development',
        client_id: 'd8a5ed958d274c2e8ee717e6a4b0971d',
        js_sdk_data: {
          device_brand: 'Google',
          device_model: 'desktop',
          os: 'Windows',
          os_version: 'NT 10.0',
        },
      },
    };
    const res = await fetch('https://clienttoken.spotify.com/v1/clienttoken', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Accept': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`Failed to get client-token: ${res.status}`);
    const data = await res.json();
    return data?.granted_token?.token;
  }

  async getAccessToken() {
    for (let attempt = 0; attempt < 2; attempt++) {
      const totp = this._generateTotp();
      const url = `https://open.spotify.com/api/token?reason=init&productType=web-player&totp=${totp}&totpServer=${totp}&totpVer=${this.totpVersion}`;
      const res = await fetch(url, {
        headers: {
          'Cookie': `sp_dc=${this.spDc}`,
          'Referer': 'https://open.spotify.com/',
          'Origin': 'https://open.spotify.com',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          'Accept': 'application/json',
        },
      });
      if (res.ok) {
        const data = await res.json();
        this.accessToken = data.accessToken;
        this.tokenExpiry = (data.accessTokenExpirationTimestampMs || 0) / 1000;
        return this.accessToken;
      }
      if (res.status === 400 && attempt === 0) {
        const updated = await this._fetchLatestTotpFromWeb();
        if (updated) continue;
      }
      const txt = await res.text();
      throw new Error(`Failed to get access-token (${res.status}): ${txt}`);
    }
  }

  async ensureTokens() {
    if (!this.clientToken) this.clientToken = await this.getClientToken();
    if (!this.accessToken || Date.now() / 1000 > this.tokenExpiry - 60) {
      await this.getAccessToken();
    }
  }

  async queryPathfinder(operationName, sha256Hash, variables) {
    await this.ensureTokens();
    const url = 'https://api-partner.spotify.com/pathfinder/v2/query';
    const payload = {
      variables,
      operationName,
      extensions: { persistedQuery: { version: 1, sha256Hash } },
    };
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'client-token': this.clientToken,
        'Content-Type': 'application/json;charset=UTF-8',
        'Origin': 'https://open.spotify.com',
        'Referer': 'https://open.spotify.com/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Pathfinder '${operationName}' failed (${res.status}): ${txt}`);
    }
    return await res.json();
  }

  _extractId(inputStr, expectedType = null) {
    if (!inputStr) throw new Error('ID atau URL Spotify tidak boleh kosong.');
    inputStr = inputStr.trim();

    const urlMatch = inputStr.match(/spotify\.com\/(track|artist|album|playlist)\/([a-zA-Z0-9]+)/);
    if (urlMatch) {
      const [, actualType, entityId] = urlMatch;
      if (expectedType && actualType !== expectedType) {
        throw new Error(`Input URL ${actualType}, endpoint ini butuh ${expectedType}.`);
      }
      return entityId;
    }

    const uriMatch = inputStr.match(/spotify:(track|artist|album|playlist):([a-zA-Z0-9]+)/);
    if (uriMatch) {
      const [, actualType, entityId] = uriMatch;
      if (expectedType && actualType !== expectedType) {
        throw new Error(`Input URI ${actualType}, endpoint ini butuh ${expectedType}.`);
      }
      return entityId;
    }

    const cleanId = inputStr.split('?')[0].split('/').pop().split(':').pop().trim();
    if (!/^[a-zA-Z0-9]+$/.test(cleanId)) {
      throw new Error(`Format ID/URL Spotify tidak valid: '${inputStr}'`);
    }
    return cleanId;
  }

  async searchTracks(query, limit = 10, offset = 0) {
    const variables = {
      searchTerm: query,
      offset,
      limit,
      numberOfTopResults: limit,
      includeAudiobooks: true,
      includeAuthors: false,
      includePreReleases: true,
      includeAlbumPreReleases: false,
      includeEpisodeContentRatingsV2: true,
    };
    const data = await this.queryPathfinder('searchTracks', '59ee4a659c32e9ad894a71308207594a65ba67bb6b632b183abe97303a51fa55', variables);
    const items = data?.data?.searchV2?.tracksV2?.items || [];

    const results = [];
    for (const it of items) {
      const t = it?.item?.data;
      if (!t) continue;
      const uri = t.uri || '';
      const tid = uri.split(':').pop();

      const artistsRaw = t.artists?.items || [];
      const artistsNames = artistsRaw.map((a) => a.profile?.name).filter(Boolean);
      const firstArtistId = artistsRaw[0]?.uri?.split(':').pop() || '';

      const albumData = t.albumOfTrack || {};
      const albumId = albumData.uri ? albumData.uri.split(':').pop() : '';
      const covers = albumData.coverArt?.sources || [];
      const durMs = t.duration?.totalMilliseconds || 0;
      const isExplicit = t.contentRating?.label === 'EXPLICIT';

      results.push({
        id: tid,
        title: t.name || '',
        artists: artistsNames.join(', '),
        artist_id: firstArtistId,
        album: albumData.name || '',
        album_id: albumId,
        duration: `${Math.floor(durMs / 60000)}:${String(Math.floor((durMs % 60000) / 1000)).padStart(2, '0')}`,
        duration_ms: durMs,
        is_explicit: isExplicit,
        cover_url: covers.length > 0 ? covers[covers.length - 1].url : '',
        spotify_url: `https://open.spotify.com/track/${tid}`,
      });
    }
    return results;
  }

  async searchArtists(query, limit = 10, offset = 0) {
    const variables = { searchTerm: query, offset, limit };
    const data = await this.queryPathfinder('searchArtists', '270905851ba5c7faca81cfe053c2dbd8ceb4f156a0e0ef4b385af75ab69ffd13', variables);
    const items = data?.data?.searchV2?.artists?.items || [];

    const results = [];
    for (const it of items) {
      const a = it?.data;
      if (!a) continue;
      const aid = a.uri ? a.uri.split(':').pop() : '';
      const avatars = a.visuals?.avatarImage?.sources || [];
      const avatarUrl = avatars.length > 0 ? avatars[avatars.length - 1].url : '';

      results.push({
        id: aid,
        name: a.profile?.name || '',
        verified: a.profile?.verified || false,
        avatar_url: avatarUrl,
        spotify_url: `https://open.spotify.com/artist/${aid}`,
      });
    }
    return results;
  }

  async searchAlbums(query, limit = 10, offset = 0) {
    const variables = { searchTerm: query, offset, limit };
    const data = await this.queryPathfinder('searchAlbums', '64ae1fe6df380b038c0a65a2606d3361bc270de6870b2fdc99cf0848b1efa6d3', variables);
    const items = data?.data?.searchV2?.albumsV2?.items || [];

    const results = [];
    for (const it of items) {
      const alb = it?.data;
      if (!alb) continue;
      const alid = alb.uri ? alb.uri.split(':').pop() : '';
      const artists = (alb.artists?.items || []).map((ar) => ar.name).filter(Boolean);
      const covers = alb.coverArt?.sources || [];
      const coverUrl = covers.length > 0 ? covers[covers.length - 1].url : '';

      results.push({
        id: alid,
        title: alb.name || '',
        artists: artists.join(', '),
        release_year: alb.date?.year || null,
        cover_url: coverUrl,
        spotify_url: `https://open.spotify.com/album/${alid}`,
      });
    }
    return results;
  }

  async getTrackDetails(trackIdOrUrl) {
    const trackId = this._extractId(trackIdOrUrl, 'track');
    const variables = { uri: `spotify:track:${trackId}` };
    const data = await this.queryPathfinder('getTrack', '1a2f0cce77c90a4a5b1730beecc4da7e34290d684324c16663bf09a268ebce48', variables);
    const t = data?.data?.trackUnion;
    if (!t || t.__typename === 'NotFound') {
      throw new Error(`Lagu dengan ID '${trackId}' tidak ditemukan.`);
    }

    const durMs = t.duration?.totalMilliseconds || 0;
    const albumData = t.albumOfTrack || {};
    const albumId = albumData.uri ? albumData.uri.split(':').pop() : '';
    const covers = albumData.coverArt?.sources || [];

    const firstArt = t.firstArtist?.items || [];
    const otherArt = t.otherArtists?.items || [];
    const allArtists = [...firstArt, ...otherArt];
    const artistsNames = allArtists.map((a) => a.profile?.name).filter(Boolean);
    const artistId = allArtists[0]?.uri?.split(':').pop() || '';

    const playcountRaw = t.playcount;
    const playcountInt = playcountRaw ? parseInt(playcountRaw, 10) : null;
    const isExplicit = t.contentRating?.label === 'EXPLICIT';
    const releaseDate = albumData.date?.isoString || '';

    return {
      id: trackId,
      title: t.name,
      artists: artistsNames.join(', '),
      artist_id: artistId,
      album: albumData.name,
      album_id: albumId,
      release_date: releaseDate ? releaseDate.slice(0, 10) : '',
      duration: `${Math.floor(durMs / 60000)}:${String(Math.floor((durMs % 60000) / 1000)).padStart(2, '0')}`,
      duration_ms: durMs,
      playcount: playcountInt,
      playcount_formatted: playcountInt ? playcountInt.toLocaleString() : '0',
      is_explicit: isExplicit,
      cover_url: covers.length > 0 ? covers[covers.length - 1].url : '',
      spotify_url: `https://open.spotify.com/track/${trackId}`,
    };
  }

  async getCanvasUrl(trackIdOrUrl) {
    try {
      const trackId = this._extractId(trackIdOrUrl, 'track');
      await this.ensureTokens();
      const trackUri = `spotify:track:${trackId}`;

      const uriBuf = Buffer.from(trackUri, 'utf-8');
      const trackMsg = Buffer.concat([Buffer.from([0x0a, uriBuf.length]), uriBuf]);
      const reqMsg = Buffer.concat([Buffer.from([0x0a, trackMsg.length]), trackMsg]);

      const res = await fetch('https://spclient.wg.spotify.com/canvaz-cache/v0/canvases', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'client-token': this.clientToken,
          'App-Platform': 'Android',
          'Content-Type': 'application/x-protobuf',
        },
        body: reqMsg,
      });

      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length > 10) {
          const text = buf.toString('utf-8');
          const match = text.match(/https:\/\/canvaz\.scdn\.co\/[^\s\x00-\x1f\x7f-\xff]+\.cnvs\.mp4/);
          if (match) return match[0];
        }
      }
    } catch (_) {}
    return null;
  }

  async getLyrics(trackIdOrUrl) {
    const trackId = this._extractId(trackIdOrUrl, 'track');
    await this.ensureTokens();

    const url = `https://spclient.wg.spotify.com/color-lyrics/v2/track/${trackId}?format=json&market=from_token`;
    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'client-token': this.clientToken,
        'App-Platform': 'WebPlayer',
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      },
    });

    if (res.status === 404) {
      return { track_id: trackId, has_lyrics: false, message: 'Lirik tidak tersedia untuk lagu ini.' };
    }
    if (!res.ok) throw new Error(`Gagal mengambil lirik (${res.status})`);

    const raw = await res.json();
    const data = raw.lyrics || {};
    const syncType = data.syncType || 'UNSYNCED';
    const isTimeSynced = ['LINE_SYNCED', 'SYLLABLE_SYNCED'].includes(syncType);
    const linesRaw = data.lines || [];

    const lines = [];
    const lrcLines = [];
    const plainLines = [];

    for (const line of linesRaw) {
      const words = (line.words || '').trim();
      plainLines.push(words);

      if (isTimeSynced) {
        const startMs = parseInt(line.startTimeMs || '0', 10);
        const totalSec = startMs / 1000;
        const m = Math.floor(totalSec / 60);
        const s = (totalSec % 60).toFixed(2);
        lrcLines.push(`[${String(m).padStart(2, '0')}:${String(s).padStart(5, '0')}] ${words}`);
        lines.push({
          startTimeMs: startMs,
          time_formatted: `${Math.floor(startMs / 60000)}:${String(Math.floor((startMs % 60000) / 1000)).padStart(2, '0')}`,
          words,
        });
      } else {
        lines.push({ time_formatted: null, words });
      }
    }

    return {
      track_id: trackId,
      has_lyrics: true,
      is_time_synced: isTimeSynced,
      sync_type: syncType,
      language: data.language,
      lrc_format: isTimeSynced ? lrcLines.join('\n') : null,
      plain_text: plainLines.join('\n'),
      lines,
    };
  }

  async getArtistOverview(artistIdOrUrl) {
    const artistId = this._extractId(artistIdOrUrl, 'artist');
    const variables = { uri: `spotify:artist:${artistId}`, locale: '' };
    const data = await this.queryPathfinder('queryArtistOverview', 'ae0e2958a4ab645b35ca19ac04d0495ae12d9c5d7b7286217674801a9aab281a', variables);
    const artistUnion = data?.data?.artistUnion;
    if (!artistUnion || artistUnion.__typename === 'NotFound') {
      throw new Error(`Artis dengan ID '${artistId}' tidak ditemukan.`);
    }

    const profile = artistUnion.profile || {};
    const stats = artistUnion.stats || {};
    const visuals = artistUnion.visuals || {};

    const avatars = visuals.avatarImage?.sources || [];
    const avatarUrl = avatars.length > 0 ? avatars[avatars.length - 1].url : '';
    const headersImg = visuals.headerImage?.sources || [];
    const headerUrl = headersImg.length > 0 ? headersImg[headersImg.length - 1].url : '';

    const ml = stats.monthlyListeners || null;
    const topTracksRaw = artistUnion.discography?.topTracks?.items || [];
    const topTracks = [];
    for (const item of topTracksRaw) {
      const t = item.track;
      if (t) {
        const tid = t.uri ? t.uri.split(':').pop() : '';
        const dur = t.duration?.totalMilliseconds || 0;
        const pc = t.playcount ? parseInt(t.playcount, 10) : null;
        topTracks.push({
          id: tid,
          title: t.name,
          duration: `${Math.floor(dur / 60000)}:${String(Math.floor((dur % 60000) / 1000)).padStart(2, '0')}`,
          streams: pc ? pc.toLocaleString() : '0',
          spotify_url: `https://open.spotify.com/track/${tid}`,
        });
      }
    }

    return {
      id: artistId,
      name: profile.name,
      verified: profile.verified || false,
      monthly_listeners: ml,
      monthly_listeners_formatted: ml ? ml.toLocaleString() : '0',
      world_rank: stats.worldRank || null,
      top_cities: (stats.topCities?.items || []).map((c) => ({
        city: c.city,
        country: c.country,
        listeners: c.numberOfListeners,
        listeners_formatted: c.numberOfListeners ? c.numberOfListeners.toLocaleString() : '0',
      })),
      avatar_url: avatarUrl,
      header_url: headerUrl,
      top_tracks: topTracks,
      spotify_url: `https://open.spotify.com/artist/${artistId}`,
    };
  }

  async getAlbum(albumIdOrUrl) {
    const albumId = this._extractId(albumIdOrUrl, 'album');
    const variables = { uri: `spotify:album:${albumId}`, locale: '', offset: 0, limit: 100 };
    const data = await this.queryPathfinder('getAlbum', 'b9bfabef66ed756e5e13f68a942deb60bd4125ec1f1be8cc42769dc0259b4b10', variables);
    const alb = data?.data?.albumUnion;
    if (!alb || alb.__typename === 'NotFound') {
      throw new Error(`Album dengan ID '${albumId}' tidak ditemukan.`);
    }

    const artistsRaw = alb.artists?.items || [];
    const artistsNames = artistsRaw.map((a) => a.profile?.name).filter(Boolean);
    const artistId = artistsRaw[0]?.uri?.split(':').pop() || '';

    const covers = alb.coverArt?.sources || [];
    const coverUrl = covers.length > 0 ? covers[covers.length - 1].url : '';
    const relDate = alb.date?.isoString || '';

    const tracksRaw = alb.tracksV2?.items || [];
    const tracks = [];
    for (const it of tracksRaw) {
      const tr = it.track;
      if (tr) {
        const tid = tr.uri ? tr.uri.split(':').pop() : '';
        const dur = tr.duration?.totalMilliseconds || 0;
        const trArtists = (tr.artists?.items || []).map((a) => a.profile?.name).filter(Boolean);
        tracks.push({
          track_number: tr.trackNumber,
          id: tid,
          title: tr.name,
          artists: trArtists.join(', '),
          duration: `${Math.floor(dur / 60000)}:${String(Math.floor((dur % 60000) / 1000)).padStart(2, '0')}`,
          is_explicit: tr.contentRating?.label === 'EXPLICIT',
          spotify_url: `https://open.spotify.com/track/${tid}`,
        });
      }
    }

    return {
      id: albumId,
      title: alb.name,
      artists: artistsNames.join(', '),
      artist_id: artistId,
      release_date: relDate ? relDate.slice(0, 10) : '',
      total_tracks: alb.tracksV2?.totalCount || tracks.length,
      cover_url: coverUrl,
      tracks,
      spotify_url: `https://open.spotify.com/album/${albumId}`,
    };
  }

  async getPlaylist(playlistIdOrUrl) {
    const playlistId = this._extractId(playlistIdOrUrl, 'playlist');
    const variables = {
      uri: `spotify:playlist:${playlistId}`,
      offset: 0,
      limit: 25,
      enableWatchFeedEntrypoint: false,
      includeEpisodeContentRatingsV2: false,
    };
    const data = await this.queryPathfinder('fetchPlaylist', '86dde7b9d9356e2369414647cf6950cfed96e778e129cfdfc99aea6c1613b3b0', variables);
    const pl = data?.data?.playlistV2;
    if (!pl || pl.__typename === 'NotFound' || pl.__typename === 'GenericError') {
      throw new Error(`Playlist dengan ID '${playlistId}' tidak ditemukan.`);
    }

    const itemsRaw = pl.content?.items || [];
    const tracks = [];
    for (const it of itemsRaw) {
      const tr = it.itemV2?.data;
      if (tr) {
        const tid = tr.uri ? tr.uri.split(':').pop() : '';
        const dur = tr.duration?.totalMilliseconds || 0;
        const trArtists = (tr.artists?.items || []).map((a) => a.profile?.name).filter(Boolean);
        tracks.push({
          id: tid,
          title: tr.name,
          artists: trArtists.join(', '),
          duration: `${Math.floor(dur / 60000)}:${String(Math.floor((dur % 60000) / 1000)).padStart(2, '0')}`,
          spotify_url: `https://open.spotify.com/track/${tid}`,
        });
      }
    }

    return {
      id: playlistId,
      name: pl.name,
      description: pl.description || '',
      total_tracks: pl.content?.totalCount || tracks.length,
      tracks,
      spotify_url: `https://open.spotify.com/playlist/${playlistId}`,
    };
  }

  async getHomeFeed(sectionLimit = 30, itemsLimit = 20) {
    const variables = {
      homeEndUserIntegration: 'INTEGRATION_WEB_PLAYER',
      facet: '',
      sectionItemsLimit: itemsLimit,
      timeZone: 'Asia/Jakarta',
      sp_t: '',
      includeEpisodeContentRatingsV2: false,
    };
    const data = await this.queryPathfinder('home', '76243c78b0e20ecdbe41b794dec8cbe73f75e585b0a7201b8d2e84578412847a', variables);
    const sectionsRaw = data?.data?.home?.sectionContainer?.sections?.items || [];

    const homeFeed = [];
    for (const sec of sectionsRaw) {
      const secData = sec?.data || {};
      const titleObj = secData?.title || {};
      const secTitle = titleObj.transformedLabel || titleObj.translatedBaseText;
      if (!secTitle) continue;

      const titleLower = secTitle.toLowerCase();
      if (titleLower.includes('episode') || titleLower.includes('show') || titleLower.includes('podcast') || titleLower.includes('audiobook')) continue;

      const itemsRaw = sec?.sectionItems?.items || [];
      const cards = [];
      for (const it of itemsRaw) {
        const c = it?.content?.data;
        if (!c) continue;
        const uri = c.uri || '';
        if (!uri) continue;
        const entityType = uri.includes(':') ? uri.split(':')[1] : 'item';
        if (entityType === 'episode' || entityType === 'show') continue;

        const eid = uri.split(':').pop();
        const name = c.name || c.title?.text || c.profile?.name;
        if (!name) continue;
        const desc = c.description || '';

        const images = c.images?.items || c.coverArt?.sources || c.visuals?.avatarImage?.sources || [];
        let coverUrl = '';
        if (images.length > 0 && images[0]?.sources) {
          coverUrl = images[0].sources[images[0].sources.length - 1]?.url || '';
        } else if (images.length > 0 && images[0]?.url) {
          coverUrl = images[images.length - 1]?.url || '';
        }

        cards.push({
          id: eid,
          type: entityType,
          title: name,
          description: desc,
          cover_url: coverUrl,
          spotify_url: `https://open.spotify.com/${entityType}/${eid}`,
        });
      }

      if (cards.length > 0) {
        homeFeed.push({ section: secTitle, total_items: cards.length, items: cards });
      }
      if (homeFeed.length >= sectionLimit) break;
    }
    return homeFeed;
  }
}

const spotifyClient = new SpotifyPureAPI(process.env.SP_DC || '');

module.exports = { SpotifyPureAPI, spotifyClient };
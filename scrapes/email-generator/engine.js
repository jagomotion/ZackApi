const axios = require('axios');
const cheerio = require('cheerio');

class GeneratorEmail {
  static BASE_URL = 'https://generator.email';
  static DEVELOPER = 'ZackApi';
  static VERSION = '2.2.0';

  static DEFAULT_USER_AGENT =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

  constructor(userAgent = null, requestTimeout = 15000) {
    this.userAgent = userAgent || GeneratorEmail.DEFAULT_USER_AGENT;
    this.requestTimeout = requestTimeout;
    this._apiToken = null;
    this._tokenFetchedAt = null;
    this._cachedDomains = [];
    this._domainsFetchedAt = null;
    this._cacheTtl = 300000;
  }

  _getHeaders(extra = {}) {
    return {
      'User-Agent': this.userAgent,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9,id;q=0.8',
      ...extra,
    };
  }

  _formatResponse(status, data, message = null, errorCode = null) {
    const res = {
      status,
      developer: GeneratorEmail.DEVELOPER,
      version: GeneratorEmail.VERSION,
      timestamp: new Date().toISOString(),
      data,
    };
    if (message) res.message = message;
    if (errorCode) res.error_code = errorCode;
    return res;
  }

  async getApiToken(refresh = false) {
    const now = Date.now();
    if (this._apiToken && !refresh && this._tokenFetchedAt && now - this._tokenFetchedAt < this._cacheTtl) {
      return this._apiToken;
    }

    try {
      const res = await axios.get(`${GeneratorEmail.BASE_URL}/`, {
        headers: this._getHeaders(),
        timeout: this.requestTimeout,
      });

      if (res.status === 200) {
        const $ = cheerio.load(res.data);
        const token = $('meta[name="api-token"]').attr('content');
        if (token) {
          this._apiToken = token.trim();
          this._tokenFetchedAt = now;
          return this._apiToken;
        }
      }
    } catch (e) {
      if (this._apiToken) return this._apiToken;
      throw new Error(`Gagal mengambil api-token: ${e.message}`);
    }

    if (this._apiToken) return this._apiToken;
    throw new Error('Gagal menemukan meta tag api-token');
  }

  async getActiveDomains(refresh = false) {
    const now = Date.now();
    if (this._cachedDomains.length > 0 && !refresh && this._domainsFetchedAt && now - this._domainsFetchedAt < this._cacheTtl) {
      return this._cachedDomains;
    }

    try {
      let token = await this.getApiToken(refresh);
      let headers = this._getHeaders({
        'X-API-Token': token,
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': `${GeneratorEmail.BASE_URL}/`,
      });

      let res = await axios.get(`${GeneratorEmail.BASE_URL}/api/domains.php`, {
        headers,
        timeout: this.requestTimeout,
        validateStatus: () => true,
      });

      if (res.status === 403) {
        token = await this.getApiToken(true);
        headers['X-API-Token'] = token;
        res = await axios.get(`${GeneratorEmail.BASE_URL}/api/domains.php`, {
          headers,
          timeout: this.requestTimeout,
        });
      }

      if (res.status === 200 && Array.isArray(res.data) && res.data.length > 0) {
        const domains = [];
        for (const d of res.data) {
          if (typeof d === 'object' && d !== null) {
            const val = d.ascii || d.display;
            if (val) domains.push(val.trim().toLowerCase());
          }
        }
        if (domains.length > 0) {
          this._cachedDomains = domains;
          this._domainsFetchedAt = now;
          return this._cachedDomains;
        }
      }
    } catch (_) {}

    const fallback = ['fboxmail.com', 'cunan.store', 'sds-awe.top', 'mengundang.live', 'kintil.buzz', 'ketua.id'];
    if (this._cachedDomains.length === 0) {
      this._cachedDomains = fallback;
    }
    return this._cachedDomains;
  }

  async getDomainsResponse(refresh = false) {
    const domains = await this.getActiveDomains(refresh);
    return this._formatResponse('success', {
      total_domains: domains.length,
      domains,
    });
  }

  sanitizeUsername(username) {
    if (!username) return `user_${Math.floor(Date.now() / 1000)}`;
    const cleaned = username.trim().toLowerCase().replace(/[^a-zA-Z0-9_.-]/g, '');
    return cleaned || `user_${Math.floor(Date.now() / 1000)}`;
  }

  async generateEmail(username = null, domain = null) {
    const domains = await this.getActiveDomains();
    let selectedDomain = domain ? domain.trim().toLowerCase().replace(/^@/, '') : null;
    if (!selectedDomain) {
      selectedDomain = domains[Math.floor(Math.random() * domains.length)] || 'fboxmail.com';
    }

    let userPart = username
      ? this.sanitizeUsername(username)
      : `user_${Math.random().toString(36).substring(2, 12)}`;

    return `${userPart}@${selectedDomain}`.toLowerCase();
  }

  async generateEmailResponse(username = null, domain = null) {
    const email = await this.generateEmail(username, domain);
    const [userPart, domainPart] = email.split('@');
    return this._formatResponse('success', {
      email,
      username: userPart,
      domain: domainPart,
      inbox_url: `${GeneratorEmail.BASE_URL}/${email}`,
    });
  }

  async checkInbox(email) {
    email = (email || '').trim().toLowerCase();
    if (!email.includes('@')) {
      return this._formatResponse('error', null, `Format email tidak valid: ${email}`, 'INVALID_EMAIL');
    }

    const [username, domain] = email.split('@');
    const inboxCtxVal = `${domain}/${username}/`;
    const encodedCtx = encodeURIComponent(inboxCtxVal);
    const cookieHeader = `inbox_ctx=${encodedCtx}; surl=${domain}/${username}; embx=${encodeURIComponent(JSON.stringify([email]))}`;

    try {
      const res = await axios.get(`${GeneratorEmail.BASE_URL}/inbox1/`, {
        headers: this._getHeaders({ Cookie: cookieHeader }),
        timeout: this.requestTimeout,
        validateStatus: () => true,
      });

      if (res.status !== 200) {
        return this._formatResponse('error', null, `Server returned HTTP ${res.status}`, 'HTTP_ERROR');
      }

      const $ = cheerio.load(res.data);
      let totalMsgCount = 0;
      $('script').each((_, el) => {
        const text = $(el).text() || '';
        if (text.includes('window.SITE_DATA=')) {
          const m = text.match(/num_mess:\s*(\d+)/);
          if (m) totalMsgCount = parseInt(m[1], 10);
        }
      });

      const messages = [];
      $('#email-table .list-group-item').each((_, el) => {
        const fromText = $(el).find('[class*="from_div"]').text().trim();
        const subjText = $(el).find('[class*="subj_div"]').text().trim();
        const timeText = $(el).find('[class*="time_div"]').text().trim();
        const onclick = $(el).attr('onclick') || '';
        const linkMatch = onclick.match(/loadInboxClientSide\(['"](.*?)['\"]\)/);
        const link = linkMatch ? linkMatch[1] : '';

        messages.push({
          from: fromText,
          subject: subjText,
          date: timeText,
          link,
        });
      });

      const { bodyText, rawHtml } = GeneratorEmail._extractCleanBody($);
      const otp = bodyText ? GeneratorEmail.extractOtp(bodyText, rawHtml) : null;
      const linksInfo = rawHtml ? GeneratorEmail.extractVerificationLinks(rawHtml) : { primary_link: null, all_links: [] };

      const inboxData = {
        email,
        total_messages: Math.max(messages.length, totalMsgCount),
        messages,
        otp,
        verification_link: linksInfo.primary_link,
        body: bodyText || null,
      };

      return this._formatResponse('success', inboxData);
    } catch (e) {
      return this._formatResponse('error', null, `Network error: ${e.message}`, 'NETWORK_ERROR');
    }
  }

  async readMessage(email, linkOrMsgId) {
    email = (email || '').trim().toLowerCase();
    if (!email.includes('@')) {
      return this._formatResponse('error', null, `Format email tidak valid: ${email}`, 'INVALID_EMAIL');
    }

    const [username, domain] = email.split('@');
    let link = (linkOrMsgId || '').replace(/^\//, '');

    const url = link.startsWith(domain)
      ? `${GeneratorEmail.BASE_URL}/${link}`
      : `${GeneratorEmail.BASE_URL}/${domain}/${username}/${link}`;

    const inboxCtxVal = `${domain}/${username}/${linkOrMsgId}`;
    const cookieHeader = `inbox_ctx=${encodeURIComponent(inboxCtxVal)}; surl=${domain}/${username}; embx=${encodeURIComponent(JSON.stringify([email]))}`;

    try {
      const res = await axios.get(url, {
        headers: this._getHeaders({ Cookie: cookieHeader }),
        timeout: this.requestTimeout,
        validateStatus: () => true,
      });

      if (res.status !== 200) {
        return this._formatResponse('error', null, `HTTP status ${res.status}`, 'HTTP_ERROR');
      }

      const $ = cheerio.load(res.data);
      let sender = '';
      let subject = '';
      let dateStr = '';

      const headText = $('#mail-summary-head').text() || '';
      for (const line of headText.split('\n')) {
        const lower = line.toLowerCase();
        if (lower.includes('from:') || lower.includes('dari:')) {
          sender = line.split(':')[1]?.trim() || '';
        } else if (lower.includes('subject:') || lower.includes('subjek:')) {
          subject = line.split(':')[1]?.trim() || '';
        } else if (lower.includes('date:') || lower.includes('tanggal:') || lower.includes('received:')) {
          dateStr = line.split(':')[1]?.trim() || '';
        }
      }

      const { bodyText, rawHtml } = GeneratorEmail._extractCleanBody($);
      const otp = GeneratorEmail.extractOtp(bodyText, rawHtml);
      const linksInfo = GeneratorEmail.extractVerificationLinks(rawHtml);

      const msgData = {
        email,
        from: sender,
        subject,
        date: dateStr,
        otp,
        verification_link: linksInfo.primary_link,
        body: bodyText,
      };

      return this._formatResponse('success', msgData);
    } catch (e) {
      return this._formatResponse('error', null, `Network error: ${e.message}`, 'NETWORK_ERROR');
    }
  }

  async listenInbox(email, timeout = 180, onMessageCallback = null) {
    const deadline = Date.now() + timeout * 1000;
    const seen = new Set();
    let lastInbox = null;

    const initial = await this.checkInbox(email);
    if (initial && initial.status === 'success' && initial.data) {
      lastInbox = initial.data;
      for (const msg of initial.data.messages || []) {
        const key = msg.link || `${msg.from}|${msg.subject}|${msg.date}`;
        seen.add(key);
      }
    }

    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 5000));

      const inboxRes = await this.checkInbox(email);
      if (!inboxRes || inboxRes.status !== 'success' || !inboxRes.data) continue;

      lastInbox = inboxRes.data;
      const msgs = inboxRes.data.messages || [];

      for (const msg of msgs) {
        const key = msg.link || `${msg.from}|${msg.subject}|${msg.date}`;
        if (seen.has(key)) continue;
        seen.add(key);

        let details = {};
        if (msg.link) {
          const readRes = await this.readMessage(email, msg.link);
          if (readRes && readRes.data) details = readRes.data;
        }

        const bodyText = details.body || '';
        const otp = details.otp || GeneratorEmail.extractOtp(bodyText);
        const fullData = {
          email,
          from: msg.from || details.from,
          subject: msg.subject || details.subject,
          date: msg.date || details.date,
          otp,
          verification_link: details.verification_link,
          body: bodyText,
        };
        const formatted = this._formatResponse('success', fullData, 'Pesan baru diterima');
        if (onMessageCallback) onMessageCallback(formatted);
        return formatted;
      }
    }

    return this._formatResponse('timeout', lastInbox, `Timeout ${timeout}s, belum ada pesan baru`);
  }

  async waitForOtp(email, timeout = 180) {
    const res = await this.listenInbox(email, timeout);
    if (res.status === 'success' && res.data) {
      return this._formatResponse('success', {
        email,
        otp: res.data.otp,
        subject: res.data.subject,
        from: res.data.from,
        date: res.data.date,
      });
    }
    return res;
  }

  async waitForVerificationLink(email, timeout = 180) {
    const res = await this.listenInbox(email, timeout);
    if (res.status === 'success' && res.data) {
      return this._formatResponse('success', {
        email,
        verification_link: res.data.verification_link,
        subject: res.data.subject,
        from: res.data.from,
        date: res.data.date,
      });
    }
    return res;
  }

  static _extractCleanBody($) {
    let messBody = $('div.mess_bodiyy, div[class*="mess_bod"], div.user_mess_content, #email_content');
    if (messBody.length > 0) {
      const clone = messBody.first().clone();
      clone.find('script, style, ins, button, iframe, .adsbygoogle').remove();
      const bodyText = clone.text().replace(/\n\s*\n/g, '\n').trim();
      return { bodyText, rawHtml: clone.html() || '' };
    }

    const container = $('#mail-summary-body');
    if (container.length > 0) {
      const clone = container.first().clone();
      clone.find('.mesg-row, .mailsrc-panel, ins, script, style, .adsbygoogle, button, .tooltip-container').remove();
      const bodyText = clone.text().replace(/\n\s*\n/g, '\n').trim();
      return { bodyText, rawHtml: clone.html() || '' };
    }

    return { bodyText: '', rawHtml: '' };
  }

  static extractOtp(text, html = null) {
    if (!text && !html) return null;
    const combined = text || '';

    const mHyphen = combined.match(/\b([0-9]{3}-[0-9]{3})\b/);
    if (mHyphen) return mHyphen[1].replace('-', '');

    const mKeyword = combined.match(
      /(?:kode\s*verifikasi|verification\s*code|security\s*code|confirmation\s*code|kode\s*keamanan|auth\s*code|passcode|kode\s*otp|otp|pin|code|kode)(?:(?:\s+[a-zA-Z]+){0,4})?\s*(?:adalah|is|:|:=|-|\s)\s*([0-9]{4,8})\b/i
    );
    if (mKeyword) {
      const val = mKeyword[1];
      if (!(val.length === 4 && (val.startsWith('19') || val.startsWith('20')) && !/code|kode|otp|pin/i.test(combined))) {
        return val;
      }
    }

    const mAction = combined.match(
      /(?:use\s*code|masukkan\s*kode|gunakan\s*kode|enter\s*(?:verification\s*)?code)\s*(?:adalah|is|:|:=|-|\s)?\s*([0-9]{4,8})\b/i
    );
    if (mAction) return mAction[1];

    const mAlpha = combined.match(
      /(?:otp|code|kode|token|password)(?:(?:\s+[a-zA-Z]+){0,3})?\s*(?:adalah|is|:|:=|-|\s)\s*([A-Z0-9]*[0-9][A-Z0-9]*)\b/i
    );
    if (mAlpha) {
      const val = mAlpha[1].trim();
      if (val.length >= 4 && val.length <= 8 && /[0-9]/.test(val) && /[a-zA-Z]/.test(val)) {
        return val;
      }
    }

    if (html) {
      const $ = cheerio.load(html);
      let foundHtmlOtp = null;
      $('b, strong, h1, h2, h3, td, span').each((_, el) => {
        const t = $(el).text().trim();
        if (/^[0-9]{4,8}$/.test(t) && !/^(19\d\d|20[2-3]\d)$/.test(t)) {
          foundHtmlOtp = t;
          return false;
        }
        if (/^[0-9]{3}-[0-9]{3}$/.test(t)) {
          foundHtmlOtp = t.replace('-', '');
          return false;
        }
      });
      if (foundHtmlOtp) return foundHtmlOtp;
    }

    return null;
  }

  static extractVerificationLinks(htmlContent) {
    if (!htmlContent) return { primary_link: null, all_links: [] };

    const $ = cheerio.load(htmlContent);
    const extractedLinks = [];
    let primaryLink = null;
    let highestScore = -1;

    const actionKeywords = [
      'verify', 'verifikasi', 'confirm', 'konfirmasi', 'activate', 'aktifkan',
      'click here', 'klik di sini', 'log in', 'masuk', 'login', 'reset password',
      'complete registration', 'get started', 'join', 'accept', 'approve'
    ];

    const ignoreKeywords = [
      'unsubscribe', 'berhenti langganan', 'privacy policy', 'kebijakan privasi',
      'terms', 'syarat dan ketentuan', 'facebook', 'twitter', 'instagram', 'linkedin',
      'youtube', 'help center', 'pusat bantuan', 'contact us', 'hubungi kami'
    ];

    $('a[href]').each((_, el) => {
      const href = ($(el).attr('href') || '').trim();
      if (!href.startsWith('http://') && !href.startsWith('https://')) return;

      const text = $(el).text().trim().toLowerCase();
      const hrefLower = href.toLowerCase();

      if (ignoreKeywords.some((junk) => text.includes(junk) || hrefLower.includes(junk))) {
        return;
      }

      let score = 0;
      for (const kw of actionKeywords) {
        if (text.includes(kw)) score += 10;
        if (hrefLower.includes(kw)) score += 5;
      }

      if (/token=|code=|key=|verify|activate|confirmation|auth\/links|auth_action/i.test(hrefLower)) {
        score += 8;
      }

      if (score > highestScore) {
        highestScore = score;
        primaryLink = href;
      }

      extractedLinks.push({ text: $(el).text().trim(), url: href });
    });

    if (!primaryLink && extractedLinks.length > 0) {
      primaryLink = extractedLinks[0].url;
    }

    return {
      primary_link: primaryLink,
      all_links: extractedLinks,
    };
  }
}

module.exports = { GeneratorEmail };
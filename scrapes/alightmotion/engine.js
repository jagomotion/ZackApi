const axios = require('axios');
const crypto = require('crypto');

const cfg = {
  key: 'AIzaSyDtG1AU22ErnQD60AzBAcaknySiz9_CEq0',
  idt: 'https://www.googleapis.com/identitytoolkit/v3/relyingparty',
  stk: 'https://securetoken.googleapis.com/v1/token',
  vfy: 'https://us-central1-alight-creative.cloudfunctions.net/verifyPurchase',
};

const PRODUCT_ID = 'am.full.sub.annual.19q4';

/* ============================================================
 * PLAN DEFINITIONS
 * ============================================================ */
const PLAN_MAP = {
  annual: { days: 365, text: '1 tahun', label: 'Annual Premium' },
  'semi-annual': { days: 180, text: '6 bulan', label: 'Semi-Annual Premium' },
  quarterly: { days: 90, text: '3 bulan', label: 'Quarterly Premium' },
  monthly: { days: 30, text: '1 bulan', label: 'Monthly Premium' },
  weekly: { days: 7, text: '7 hari', label: 'Weekly Premium' },
};

function detectPlan(productId) {
  const id = String(productId || '').toLowerCase();
  if (id.includes('semi-annual') || id.includes('semiannual')) return { plan: 'semi-annual', ...PLAN_MAP['semi-annual'] };
  if (id.includes('quarter')) return { plan: 'quarterly', ...PLAN_MAP.quarterly };
  if (id.includes('monthly') || id.includes('month')) return { plan: 'monthly', ...PLAN_MAP.monthly };
  if (id.includes('weekly') || id.includes('week')) return { plan: 'weekly', ...PLAN_MAP.weekly };
  return { plan: 'annual', ...PLAN_MAP.annual };
}

function buildSubscriptionInfo(productId, orderId, startedAtMs) {
  const planInfo = detectPlan(productId);
  const isRenewal = /\.\.\d+$/.test(orderId);
  const startedAt = new Date(startedAtMs);
  const expiresAt = new Date(startedAtMs + planInfo.days * 24 * 60 * 60 * 1000);
  const daysRemaining = Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)));

  return {
    plan: planInfo.plan,
    plan_label: planInfo.label,
    duration_days: planInfo.days,
    duration_text: planInfo.text,
    is_renewal: isRenewal,
    status: 'active',
    started_at: startedAt.toISOString(),
    expires_at: expiresAt.toISOString(),
    days_remaining: daysRemaining,
  };
}

/* ============================================================
 * HELPERS
 * ============================================================ */
function dip() {
  return [
    crypto.randomInt(1, 255),
    crypto.randomInt(0, 255),
    crypto.randomInt(0, 255),
    crypto.randomInt(1, 255),
  ].join('.');
}

function sp(h) {
  return {
    ...h,
    'x-forwarded-for': dip(),
    'x-real-ip': dip(),
    'client-ip': dip(),
    'x-client-ip': dip(),
    'x-originating-ip': dip(),
    'x-cluster-client-ip': dip(),
  };
}

const h1 = {
  'content-type': 'application/json',
  'x-android-package': 'com.alightcreative.motion',
  'x-android-cert': 'ECA6BF91B8715A6F810ED0BBFC65B6CD578F52A8',
  'user-agent': 'dalvik/2.1.0 (linux; u; android 15; 23127pn0cc build/bp1a.250505.005)',
};

const h2 = {
  'content-type': 'application/json; charset=utf-8',
  'user-agent': 'okhttp/3.12.1',
  'accept-encoding': 'gzip',
};

function bad(e) {
  const d = e.response?.data;
  if (d) return typeof d === 'object' ? JSON.stringify(d) : String(d);
  return e.message;
}

/* ============================================================
 * ORDER ID GENERATOR
 * ============================================================ */
function generateGooglePlayOrderId(renewal = 0) {
  const r4 = () => crypto.randomInt(0, 10000).toString().padStart(4, '0');
  const r5 = () => crypto.randomInt(0, 100000).toString().padStart(5, '0');
  let id = `GPA.${r4()}-${r4()}-${r4()}-${r5()}`;
  if (renewal > 0) id += `..${renewal}`;
  return id;
}

function isValidGooglePlayOrderId(id) {
  if (!id || typeof id !== 'string') return false;
  return /^GPA\.\d{4}-\d{4}-\d{4}-\d{5}(\.\.\d+)?$/.test(id.trim());
}

/* ============================================================
 * STEP 1: KIRIM LINK VERIFIKASI
 * ============================================================ */
async function link(email) {
  const c1 = { identifier: email, continueUri: 'http://localhost' };

  const c2 = {
    requestType: 6,
    email: email,
    androidInstallApp: true,
    canHandleCodeInApp: true,
    continueUrl: 'https://alightcreative.com?ui_sid=0366624874&ui_sd=0',
    iosBundleId: 'com.alightcreative.motion',
    androidPackageName: 'com.alightcreative.motion',
    androidMinimumVersion: '585',
    clientType: 'CLIENT_TYPE_ANDROID',
  };

  try {
    await axios.post(`${cfg.idt}/createAuthUri?key=${cfg.key}`, c1, { headers: sp(h1) });
    const r = await axios.post(`${cfg.idt}/getOobConfirmationCode?key=${cfg.key}`, c2, { headers: sp(h1) });
    return { ok: true, data: r.data };
  } catch (e) {
    return { ok: false, why: bad(e) };
  }
}

/* ============================================================
 * HELPER: EKSTRAK oobCode
 * ============================================================ */
function code(raw) {
  if (!raw) return null;

  let s = String(raw).replace(/&amp;/g, '&');
  try { s = decodeURIComponent(s); } catch (_) {}

  try {
    const u = new URL(s);
    let c = u.searchParams.get('oobCode');
    if (!c) {
      const n = u.searchParams.get('link') || u.searchParams.get('q') || u.searchParams.get('url');
      if (n) {
        try { c = new URL(n).searchParams.get('oobCode'); } catch (_) {}
      }
    }
    if (c) return c.replace(/[^a-zA-Z0-9_-]/g, '');
  } catch (_) {}

  const m = s.match(/oobCode=([a-zA-Z0-9_-]+)/i);
  if (m) return m[1];

  const t = raw.trim();
  if (/^[a-zA-Z0-9_-]{10,}$/.test(t) && !t.includes('://')) return t;

  return null;
}

/* ============================================================
 * STEP 2: VERIFIKASI EMAIL LINK
 * ============================================================ */
async function auth(email, raw) {
  const c = code(raw);
  if (!c) return { ok: false, why: 'Code tidak ditemukan' };

  try {
    const a = await axios.post(
      `${cfg.idt}/emailLinkSignin?key=${cfg.key}`,
      { email: email, oobCode: c, clientType: 'CLIENT_TYPE_ANDROID' },
      { headers: sp(h1) }
    );

    let u = null;
    try {
      const b = await axios.post(
        `${cfg.idt}/getAccountInfo?key=${cfg.key}`,
        { idToken: a.data.idToken },
        { headers: sp(h1) }
      );
      u = b.data?.users?.[0] || null;
    } catch (_) {}

    return {
      ok: true,
      email: email,
      id: a.data.idToken,
      ref: a.data.refreshToken,
      uid: a.data.localId,
      baru: !!a.data.isNewUser,
      user: u,
    };
  } catch (e) {
    return { ok: false, why: bad(e) };
  }
}

/* ============================================================
 * STEP 3: PROMOTE PREMIUM
 * ============================================================ */
async function pro(idToken, customOrderId = null) {
  let orderId;

  if (customOrderId && String(customOrderId).trim().length > 0) {
    orderId = String(customOrderId).trim();
  } else {
    orderId = generateGooglePlayOrderId();
  }

  const body = {
    data: {
      productId: PRODUCT_ID,
      token: 'mmgaobamlahbbeccfplmbkbb.AO-J1OzqG0or_GJJIx-ms8GrTm-jaglCRfhQSRPUZKpl2YspYS-oN7_94uv8RC5vQbvd_Ios2pPDStZ2n7F0hLE3FiOU7HS3R6Fquulv5xLXFECSv4ctElw',
      skuType: 'subs',
      orderId: orderId,
    },
  };

  const headers = {
    ...h2,
    authorization: 'Bearer ' + idToken,
    'firebase-instance-id-token': 'cSDnCyp3T-uwp07z3tL86T:APA91bFkmvvsHw5nnqa1SBFci-99DRsKClLiETdRrVcJjS5yBx1v_FbCb1d8WhBuea_zmwnYBktyTIzcRhN4b6uNOUur9wPc0gKXmJDoZic0LhNq5V2s0xI',
  };

  try {
    const r = await axios.post(cfg.vfy, body, { headers: sp(headers) });
    return { ok: true, order: orderId, data: r.data };
  } catch (e) {
    return { ok: false, why: bad(e) };
  }
}

/* ============================================================
 * STEP 4: REFRESH SESSION
 * ============================================================ */
async function refresh(refreshToken) {
  try {
    const r = await axios.post(`${cfg.stk}?key=${cfg.key}`, {
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });
    return { ok: true, id: r.data.id_token, ref: r.data.refresh_token };
  } catch (e) {
    return { ok: false, why: bad(e) };
  }
}

/* ============================================================
 * HIGH LEVEL: KIRIM LINK VERIFIKASI
 * ============================================================ */
async function sendVerificationLink(email, orderIdPreview = null) {
  if (!email || !email.includes('@')) {
    return { status: 'error', message: 'Email tidak valid' };
  }

  const r = await link(email);
  if (!r.ok) return { status: 'error', message: r.why };

  const preview = orderIdPreview || generateGooglePlayOrderId();

  return {
    status: 'success',
    message: 'Link verifikasi berhasil dikirim ke email',
    data: {
      email,
      check: 'Cek inbox atau folder spam',
      next: 'Ambil link verifikasi, lalu panggil /alightmotion/verify',
      order_id_preview: preview,
    },
  };
}

/* ============================================================
 * HIGH LEVEL: VERIFIKASI + AKTIVASI PREMIUM
 * ============================================================ */
async function verifyAndPromote(email, linkOrCode, customOrderId = null) {
  if (!email || !email.includes('@')) {
    return { status: 'error', message: 'Email tidak valid', step: 'email' };
  }
  if (!linkOrCode) {
    return { status: 'error', message: 'Link verifikasi wajib diisi', step: 'link' };
  }

  const v = await auth(email, linkOrCode);
  if (!v.ok) return { status: 'error', message: v.why, step: 'auth' };

  const startedAtMs = Date.now();
  const q = await pro(v.id, customOrderId);

  if (!q.ok) {
    return {
      status: 'error',
      message: q.why,
      step: 'promote',
      login: { email: v.email, uid: v.uid, is_new_user: v.baru },
    };
  }

  const subscription = buildSubscriptionInfo(PRODUCT_ID, q.order, startedAtMs);

  return {
    status: 'success',
    message: 'Alight Motion Premium berhasil diaktifkan',
    data: {
      email: v.email,
      uid: v.uid,
      is_new_user: v.baru,
      order_id: q.order,
      order_id_source: customOrderId ? 'custom' : 'generated',
      product_id: PRODUCT_ID,
      sku_type: 'subs',
      subscription,
      access_token: v.id,
      refresh_token: v.ref,
      verify_response: q.data,
    },
  };
}

/* ============================================================
 * HIGH LEVEL: REFRESH SESSION
 * ============================================================ */
async function refreshSession(refreshToken) {
  if (!refreshToken) {
    return { status: 'error', message: 'refresh_token wajib diisi' };
  }

  const r = await refresh(refreshToken);
  if (!r.ok) return { status: 'error', message: r.why };

  return {
    status: 'success',
    data: {
      access_token: r.id,
      refresh_token: r.ref,
    },
  };
}

/* ============================================================
 * HIGH LEVEL: EXTRACT oobCode
 * ============================================================ */
function extractOobCode(rawLink) {
  const c = code(rawLink);
  if (!c) return { status: 'error', message: 'oobCode tidak ditemukan' };
  return { status: 'success', data: { oob_code: c } };
}

module.exports = {
  cfg,
  PRODUCT_ID,
  PLAN_MAP,
  detectPlan,
  buildSubscriptionInfo,
  dip,
  sp,
  h1,
  h2,
  bad,
  generateGooglePlayOrderId,
  isValidGooglePlayOrderId,
  link,
  code,
  auth,
  pro,
  refresh,
  sendVerificationLink,
  verifyAndPromote,
  refreshSession,
  extractOobCode,
};
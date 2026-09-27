const express = require('express');
const {
  sendVerificationLink,
  verifyAndPromote,
  refreshSession,
  extractOobCode,
  generateGooglePlayOrderId,
  isValidGooglePlayOrderId,
} = require('../scrapes/alightmotion/engine');

const router = express.Router();

function wrap(result) {
  return {
    developer: 'ZackApi',
    powered_by: 'ZackApi Engine',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    ...result,
  };
}

/* ============================================================
 * STEP 1: KIRIM LINK VERIFIKASI
 * ============================================================ */
router.get('/send', async (req, res) => {
  const email = req.query.email;
  const orderIdParam = req.query.orderid || req.query.order_id;

  if (!email) {
    return res.status(400).json(wrap({
      status: 'error',
      message: 'Parameter email wajib diisi',
      error_code: 'MISSING_EMAIL',
      example: '/alightmotion/send?email=user@example.com',
    }));
  }

  const preview = orderIdParam && String(orderIdParam).trim().length > 0
    ? String(orderIdParam).trim()
    : null;

  const result = await sendVerificationLink(email, preview);
  res.status(result.status === 'success' ? 200 : 400).json(wrap(result));
});

router.post('/send', async (req, res) => {
  const email = req.body?.email || req.query.email;
  const orderIdParam = req.body?.orderid || req.body?.order_id || req.query.orderid || req.query.order_id;

  if (!email) {
    return res.status(400).json(wrap({
      status: 'error',
      message: 'Parameter email wajib diisi',
      error_code: 'MISSING_EMAIL',
    }));
  }

  const preview = orderIdParam && String(orderIdParam).trim().length > 0
    ? String(orderIdParam).trim()
    : null;

  const result = await sendVerificationLink(email, preview);
  res.status(result.status === 'success' ? 200 : 400).json(wrap(result));
});

/* ============================================================
 * STEP 2: VERIFIKASI + AKTIVASI PREMIUM
 * ============================================================ */
router.get('/verify', async (req, res) => {
  const email = req.query.email;
  const link = req.query.link || req.query.code;
  const orderIdParam = req.query.orderid || req.query.order_id;

  if (!email) {
    return res.status(400).json(wrap({
      status: 'error',
      message: 'Parameter email wajib diisi',
      error_code: 'MISSING_EMAIL',
      example: '/alightmotion/verify?email=user@example.com&link=LINK_VERIFIKASI',
    }));
  }

  if (!link) {
    return res.status(400).json(wrap({
      status: 'error',
      message: 'Parameter link wajib diisi',
      error_code: 'MISSING_LINK',
      example: '/alightmotion/verify?email=user@example.com&link=LINK_VERIFIKASI',
    }));
  }

  const customOrderId = orderIdParam && String(orderIdParam).trim().length > 0
    ? String(orderIdParam).trim()
    : null;

  const result = await verifyAndPromote(email, link, customOrderId);
  res.status(result.status === 'success' ? 200 : 400).json(wrap(result));
});

router.post('/verify', async (req, res) => {
  const email = req.body?.email || req.query.email;
  const link = req.body?.link || req.body?.code || req.query.link || req.query.code;
  const orderIdParam = req.body?.orderid || req.body?.order_id || req.query.orderid || req.query.order_id;

  if (!email) {
    return res.status(400).json(wrap({
      status: 'error',
      message: 'Parameter email wajib diisi',
      error_code: 'MISSING_EMAIL',
    }));
  }

  if (!link) {
    return res.status(400).json(wrap({
      status: 'error',
      message: 'Parameter link wajib diisi',
      error_code: 'MISSING_LINK',
    }));
  }

  const customOrderId = orderIdParam && String(orderIdParam).trim().length > 0
    ? String(orderIdParam).trim()
    : null;

  const result = await verifyAndPromote(email, link, customOrderId);
  res.status(result.status === 'success' ? 200 : 400).json(wrap(result));
});

/* ============================================================
 * REFRESH SESSION
 * ============================================================ */
router.get('/refresh', async (req, res) => {
  const refreshToken = req.query.refresh_token;

  if (!refreshToken) {
    return res.status(400).json(wrap({
      status: 'error',
      message: 'Parameter refresh_token wajib diisi',
      error_code: 'MISSING_REFRESH_TOKEN',
    }));
  }

  const result = await refreshSession(refreshToken);
  res.status(result.status === 'success' ? 200 : 400).json(wrap(result));
});

router.post('/refresh', async (req, res) => {
  const refreshToken = req.body?.refresh_token || req.query.refresh_token;

  if (!refreshToken) {
    return res.status(400).json(wrap({
      status: 'error',
      message: 'Parameter refresh_token wajib diisi',
      error_code: 'MISSING_REFRESH_TOKEN',
    }));
  }

  const result = await refreshSession(refreshToken);
  res.status(result.status === 'success' ? 200 : 400).json(wrap(result));
});

/* ============================================================
 * EXTRACT oobCode
 * ============================================================ */
router.get('/extract', (req, res) => {
  const link = req.query.link;

  if (!link) {
    return res.status(400).json(wrap({
      status: 'error',
      message: 'Parameter link wajib diisi',
      error_code: 'MISSING_LINK',
    }));
  }

  const result = extractOobCode(link);
  res.status(result.status === 'success' ? 200 : 400).json(wrap(result));
});

/* ============================================================
 * GENERATE ORDER ID
 * ============================================================ */
router.get('/order-id', (req, res) => {
  const renewal = parseInt(req.query.renewal, 10) || 0;
  const orderId = generateGooglePlayOrderId(renewal);

  res.json(wrap({
    status: 'success',
    data: {
      order_id: orderId,
      format: 'GPA.XXXX-XXXX-XXXX-XXXXX',
      renewal,
      valid: isValidGooglePlayOrderId(orderId),
    },
  }));
});

router.get('/order-id/validate', (req, res) => {
  const orderId = req.query.id;

  if (!orderId) {
    return res.status(400).json(wrap({
      status: 'error',
      message: 'Parameter id wajib diisi',
      error_code: 'MISSING_ID',
    }));
  }

  res.json(wrap({
    status: 'success',
    data: {
      order_id: orderId,
      valid: isValidGooglePlayOrderId(orderId),
      format: 'GPA.XXXX-XXXX-XXXX-XXXXX',
    },
  }));
});

module.exports = router;
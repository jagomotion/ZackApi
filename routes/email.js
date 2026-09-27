const express = require('express');
const { GeneratorEmail } = require('../scrapes/email-generator/engine');

const router = express.Router();
const client = new GeneratorEmail();

router.get('/domains', async (req, res) => {
  const refresh = req.query.refresh === 'true';
  res.json(await client.getDomainsResponse(refresh));
});

router.get('/generate', async (req, res) => {
  const { username, domain } = req.query;
  res.json(await client.generateEmailResponse(username, domain));
});

router.get('/inbox', async (req, res) => {
  const { email } = req.query;
  if (!email) return res.status(400).json({ status: 'error', message: 'Email wajib diisi' });
  res.json(await client.checkInbox(email));
});

router.get('/message', async (req, res) => {
  const { email, link } = req.query;
  if (!email || !link) return res.status(400).json({ status: 'error', message: 'Email dan link wajib diisi' });
  res.json(await client.readMessage(email, link));
});

router.get('/listen', async (req, res) => {
  const { email } = req.query;
  const timeout = parseInt(req.query.timeout, 10) || 180;
  if (!email) return res.status(400).json({ status: 'error', message: 'Email wajib diisi' });
  res.json(await client.listenInbox(email, timeout));
});

router.get('/otp', async (req, res) => {
  const { email } = req.query;
  const timeout = parseInt(req.query.timeout, 10) || 180;
  if (!email) return res.status(400).json({ status: 'error', message: 'Email wajib diisi' });
  res.json(await client.waitForOtp(email, timeout));
});

router.get('/link', async (req, res) => {
  const { email } = req.query;
  const timeout = parseInt(req.query.timeout, 10) || 180;
  if (!email) return res.status(400).json({ status: 'error', message: 'Email wajib diisi' });
  res.json(await client.waitForVerificationLink(email, timeout));
});

module.exports = router;
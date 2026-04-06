// server/routes/email.js — Email queue CRUD + send/test/batch endpoints
// Queue: POST /queue, GET /queue, DELETE /queue/:id, POST /queue/clear-sent
// Send: POST /send, POST /test-smtp, POST /batch-send

const express = require('express');
const nodemailer = require('nodemailer');
const path = require('path');
const pool = require('../db');

const router = express.Router();

const SHOTS_DIR = path.join(__dirname, '..', '..', 'screenshots');

// --- Helpers ---

function toHtml(text) {
  const esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const linked = esc.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" style="color:#1a73e8;">$1</a>');
  return `<div style="font-family:Georgia,serif;font-size:15px;line-height:1.8;color:#111;max-width:580px;margin:0 auto;padding:32px 0;">
    ${linked.split('\n').map(l => l.trim() ? `<p style="margin:0 0 12px">${l}</p>` : '<br/>').join('')}
  </div>`;
}

function createTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_PORT === '465',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// --- Queue CRUD ---

// POST /api/email/queue — add email to queue
router.post('/queue', async (req, res) => {
  try {
    const { to, subject, body, leadId, leadName, attachments } = req.body;
    if (!to || !subject || !body) {
      return res.status(400).json({ error: 'to, subject, body required' });
    }

    const attachmentsJson = JSON.stringify(attachments || []);
    await pool.execute(
      `INSERT INTO email_queue (lead_id, lead_name, recipient, subject, body, attachments)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [leadId || null, leadName || null, to, subject, body, attachmentsJson]
    );

    const [[{ pendingCount }]] = await pool.query(
      "SELECT COUNT(*) AS pendingCount FROM email_queue WHERE status = 'pending'"
    );
    res.json({ ok: true, queueSize: pendingCount });
  } catch (err) {
    console.error('POST /api/email/queue error:', err.message);
    res.status(500).json({ error: 'Failed to add email to queue' });
  }
});

// GET /api/email/queue — list queued emails
router.get('/queue', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM email_queue ORDER BY created_at DESC');
    const queue = rows.map(row => ({
      ...row,
      attachments: typeof row.attachments === 'string' ? JSON.parse(row.attachments) : (row.attachments || [])
    }));
    res.json({ queue });
  } catch (err) {
    console.error('GET /api/email/queue error:', err.message);
    res.status(500).json({ error: 'Failed to fetch email queue' });
  }
});

// DELETE /api/email/queue/:id — remove entry
router.delete('/queue/:id', async (req, res) => {
  try {
    const [result] = await pool.execute('DELETE FROM email_queue WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Queue entry not found' });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/email/queue/:id error:', err.message);
    res.status(500).json({ error: 'Failed to remove queue entry' });
  }
});

// POST /api/email/queue/clear-sent — remove sent entries
router.post('/queue/clear-sent', async (req, res) => {
  try {
    const [result] = await pool.execute("DELETE FROM email_queue WHERE status = 'sent'");
    res.json({ ok: true, removed: result.affectedRows });
  } catch (err) {
    console.error('POST /api/email/queue/clear-sent error:', err.message);
    res.status(500).json({ error: 'Failed to clear sent emails' });
  }
});

// --- Migrated email routes from proxy/index.js ---

// POST /api/email/send — send a single email
router.post('/send', async (req, res) => {
  const { to, subject, body, attachments = [] } = req.body;
  try {
    const transporter = createTransporter();
    await transporter.sendMail({
      from: `"${process.env.FROM_NAME}" <${process.env.SMTP_USER}>`,
      to,
      subject,
      text: body,
      html: toHtml(body),
      attachments: attachments.map((a, i) => ({
        filename: `website-preview-${i + 1}.png`,
        path: path.join(SHOTS_DIR, a),
        cid: `img${i}`
      }))
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/email/test-smtp — test SMTP connection
router.post('/test-smtp', async (req, res) => {
  try {
    const transporter = createTransporter();
    await transporter.verify();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/email/batch-send — send all pending queued emails, update status in DB
router.post('/batch-send', async (req, res) => {
  const { delaySeconds = 120 } = req.body || {};

  try {
    const [pending] = await pool.query(
      "SELECT * FROM email_queue WHERE status = 'pending' ORDER BY created_at ASC"
    );
    if (!pending.length) return res.json({ sent: 0, total: 0 });

    // Stream progress via SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    const send = (msg) => res.write(`data: ${JSON.stringify(msg)}\n\n`);

    const transporter = createTransporter();
    let sent = 0;

    for (let i = 0; i < pending.length; i++) {
      const email = pending[i];
      const attachments = typeof email.attachments === 'string'
        ? JSON.parse(email.attachments)
        : (email.attachments || []);

      send({ progress: `Sending ${i + 1}/${pending.length}: ${email.lead_name || email.recipient}...` });

      try {
        await transporter.sendMail({
          from: `"${process.env.FROM_NAME}" <${process.env.SMTP_USER}>`,
          to: email.recipient,
          subject: email.subject,
          text: email.body,
          html: toHtml(email.body),
          attachments: attachments.map((a, j) => ({
            filename: `website-preview-${j + 1}.png`,
            path: path.join(SHOTS_DIR, a),
            cid: `img${j}`
          }))
        });

        await pool.execute(
          "UPDATE email_queue SET status = 'sent', sent_at = NOW() WHERE id = ?",
          [email.id]
        );
        sent++;
        send({ progress: `✓ Sent to ${email.recipient} (${sent}/${pending.length})` });
      } catch (e) {
        await pool.execute(
          "UPDATE email_queue SET status = 'failed', error_message = ? WHERE id = ?",
          [e.message, email.id]
        );
        send({ progress: `✗ Failed: ${email.recipient} — ${e.message}` });
      }

      // Wait between emails to avoid spam flags
      if (i < pending.length - 1) {
        send({ progress: `⏳ Waiting ${delaySeconds}s before next email...` });
        await sleep(delaySeconds * 1000);
      }
    }

    send({ done: true, sent, total: pending.length });
    res.end();
  } catch (err) {
    console.error('POST /api/email/batch-send error:', err.message);
    res.status(500).json({ error: 'Failed to send batch emails' });
  }
});

module.exports = router;

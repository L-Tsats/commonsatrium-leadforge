const pool = require('./db');
const bcrypt = require('bcrypt');

const DEFAULT_TEMPLATES = {
  cold: {
    name: 'Cold Outreach — First touch',
    subject: 'A website for {{business_name}} — quick idea',
    body: `Hi there,

I came across {{business_name}} while looking for the best {{category}} spots in {{neighborhood}}. Your {{review_count}} reviews and {{rating}}-star rating genuinely stood out — one customer even wrote: "{{top_review_snippet}}".

I noticed you don't have a website. Given the reputation you've built, that feels like a missed opportunity — a lot of new customers search online before they ever visit.

I put together a quick mockup of what a site for {{business_name}} could look like:
→ {{demo_link}}

No commitment, I just wanted to show you what's possible. Happy to chat if you're curious.

Best,
{{your_name}}`
  },
  followup: {
    name: 'Follow-up — With screenshots',
    subject: 'Re: {{business_name}} — did you get a chance to look?',
    body: `Hi,

Following up on my message from last week about a website for {{business_name}}.

I've gone ahead and built out a proper first draft — you can see it here:
→ {{demo_link}}

I've attached a couple of screenshots so you can get a feel for it without even clicking. Happy to tweak colours, copy, photos, anything you'd like.

Would you be up for a quick call this week?

{{your_name}}`
  },
  short: {
    name: 'Short & direct',
    subject: '{{business_name}} — a website idea',
    body: `Hi,

{{business_name}} has {{review_count}} great reviews and no website. I built you a demo:
→ {{demo_link}}

Worth a look?

{{your_name}}`
  },
  local: {
    name: 'Local angle',
    subject: 'The best {{category}} in {{neighborhood}} deserves a proper website',
    body: `Hi,

I'm a web designer based locally and I've been following {{business_name}} for a while — {{review_count}} reviews and {{rating}} stars doesn't happen by accident.

I noticed you don't have a website, which means a lot of people searching online are probably finding your competitors instead of you.

I built a demo in about a day:
→ {{demo_link}}

Let me know what you think — happy to refine it together.

{{your_name}}`
  }
};

async function runMigrations() {
  try {
    // Test database connectivity
    await pool.query('SELECT 1');
  } catch (err) {
    console.error('Database unreachable:', err.message);
    process.exit(1);
  }

  // Create leads table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS leads (
      id VARCHAR(255) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      category VARCHAR(255),
      address TEXT,
      neighborhood VARCHAR(255),
      phone VARCHAR(50),
      website VARCHAR(500),
      rating DECIMAL(2,1),
      review_count INT DEFAULT 0,
      top_reviews JSON,
      review_snippet TEXT,
      google_maps_url VARCHAR(500),
      photo_refs JSON,
      stage VARCHAR(50) DEFAULT 'new',
      email VARCHAR(255),
      email_found BOOLEAN DEFAULT FALSE,
      screenshot_files JSON,
      demo_url VARCHAR(500),
      notes TEXT,
      slug VARCHAR(100),
      social JSON,
      score INT,
      vision_analysis TEXT,
      custom_photos JSON,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create templates table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS templates (
      id INT AUTO_INCREMENT PRIMARY KEY,
      slug VARCHAR(50) UNIQUE NOT NULL,
      name VARCHAR(255) NOT NULL,
      subject VARCHAR(500),
      body TEXT,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  // Create assets table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS assets (
      id VARCHAR(50) PRIMARY KEY,
      type VARCHAR(50) NOT NULL,
      name VARCHAR(255) NOT NULL,
      content TEXT,
      filename VARCHAR(255),
      instructions TEXT,
      url VARCHAR(500),
      notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create users table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(100) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      display_name VARCHAR(255),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create email_queue table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS email_queue (
      id INT AUTO_INCREMENT PRIMARY KEY,
      lead_id VARCHAR(255),
      lead_name VARCHAR(255),
      recipient VARCHAR(255) NOT NULL,
      subject VARCHAR(500),
      body TEXT,
      attachments JSON,
      status ENUM('pending','sent','failed') DEFAULT 'pending',
      error_message TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      sent_at TIMESTAMP NULL
    )
  `);

  // Seed default templates if table is empty
  const [templateRows] = await pool.query('SELECT COUNT(*) as count FROM templates');
  if (templateRows[0].count === 0) {
    for (const [slug, tpl] of Object.entries(DEFAULT_TEMPLATES)) {
      await pool.query(
        'INSERT INTO templates (slug, name, subject, body) VALUES (?, ?, ?, ?)',
        [slug, tpl.name, tpl.subject, tpl.body]
      );
    }
    console.log('Seeded default templates');
  }

  // Seed default admin user if users table is empty
  const [userRows] = await pool.query('SELECT COUNT(*) as count FROM users');
  if (userRows[0].count === 0) {
    const username = process.env.ADMIN_USER || 'admin';
    const password = process.env.ADMIN_PASS || 'admin';
    const hash = await bcrypt.hash(password, 10);
    await pool.query(
      'INSERT INTO users (username, password_hash, display_name) VALUES (?, ?, ?)',
      [username, hash, username]
    );
    console.log('Seeded default admin user');
  }

  // Add domain_results and domain_checked_at columns to leads table
  try {
    await pool.query(`ALTER TABLE leads ADD COLUMN domain_results JSON DEFAULT NULL`);
  } catch (err) {
    if (!err.message.includes('Duplicate column')) throw err;
  }
  try {
    await pool.query(`ALTER TABLE leads ADD COLUMN domain_checked_at TIMESTAMP NULL`);
  } catch (err) {
    if (!err.message.includes('Duplicate column')) throw err;
  }

  console.log('Migrations complete');
}

module.exports = runMigrations;
module.exports.runMigrations = runMigrations;

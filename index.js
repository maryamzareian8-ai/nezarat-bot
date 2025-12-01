// index.js
require('dotenv').config();
const express = require('express');
const { Telegraf } = require('telegraf');
const { Pool } = require('pg');
const crypto = require('crypto');

const app = express();

// --- ENV ---
const BOT_TOKEN = process.env.TELEGRAM_TOKEN;
const ADMIN_ID = process.env.ADMIN_TELEGRAM_ID;
const BASE_URL = process.env.BASE_URL || ''; // e.g. https://nezarat-bot.onrender.com
const DATABASE_URL = process.env.DATABASE_URL;
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default-test-key';

// --- Basic checks ---
if (!BOT_TOKEN) {
  console.error('ERROR: TELEGRAM_TOKEN not set in env');
  process.exit(1);
}
if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL not set in env');
  process.exit(1);
}

// --- DB pool ---
const pool = new Pool({ connectionString: DATABASE_URL });

// --- Simple encrypt/decrypt using AES-256-CBC ---
const ALGO = 'aes-256-cbc';
const KEY = crypto.createHash('sha256').update(String(ENCRYPTION_KEY)).digest(); // 32 bytes

function encrypt(text){
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGO, KEY, iv);
  let encrypted = cipher.update(text, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  return iv.toString('base64') + ':' + encrypted;
}

function decrypt(enc){
  const parts = enc.split(':');
  if(parts.length !== 2) return '';
  const iv = Buffer.from(parts[0], 'base64');
  const data = parts[1];
  const decipher = crypto.createDecipheriv(ALGO, KEY, iv);
  let out = decipher.update(data, 'base64', 'utf8');
  out += decipher.final('utf8');
  return out;
}

// --- Ensure tables (run on startup) ---
async function ensureTables(){
  await pool.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto";`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGINT PRIMARY KEY,
      created_at timestamptz DEFAULT now(),
      cloud_name TEXT,
      cloud_api_key TEXT,
      cloud_api_secret_encrypted TEXT
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS projects (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      owner_id BIGINT REFERENCES users(id),
      name TEXT,
      created_at timestamptz DEFAULT now()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS files (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id uuid REFERENCES projects(id),
      owner_id BIGINT,
      telegram_file_id TEXT,
      thumbnail_url TEXT,
      cloudinary_url TEXT,
      created_at timestamptz DEFAULT now()
    );
  `);
}

// --- Telegram bot setup ---
const bot = new Telegraf(BOT_TOKEN);

// middleware: only admin can use /admin commands; general handlers allowed for all
function onlyAdmin(ctx, next){
  const fromId = ctx.from && ctx.from.id ? String(ctx.from.id) : null;
  if(String(ADMIN_ID) !== String(fromId)){
    return ctx.reply('این ربات تک‌کاربره است. دسترسی ندارید.');
  }
  return next();
}

// simple start
bot.start(async (ctx) => {
  const userId = ctx.from.id;
  // create user row if not exists
  await pool.query(`INSERT INTO users(id) VALUES($1) ON CONFLICT (id) DO NOTHING`, [userId]);
  return ctx.reply('سلام — ربات آماده است. برای ثبت پروژه /newproject را بزن.');
});

// minimal command to show status
bot.command('status', async (ctx) => {
  const me = await bot.telegram.getMe();
  ctx.reply(`Bot: ${me.username}\nUserId: ${ctx.from.id}`);
});

// handler for photos: store telegram file_id in DB
bot.on('photo', async (ctx) => {
  try {
    const userId = ctx.from.id;
    const photos = ctx.message.photo;
    const best = photos[photos.length - 1];
    const fileId = best.file_id;

    // ensure user exists
    await pool.query(`INSERT INTO users(id) VALUES($1) ON CONFLICT (id) DO NOTHING`, [userId]);

    // for demo: create a default project if none exists
    const pr = await pool.query(`SELECT id FROM projects WHERE owner_id=$1 ORDER BY created_at LIMIT 1`, [userId]);
    let projectId;
    if(pr.rowCount === 0){
      const r = await pool.query(`INSERT INTO projects(owner_id, name) VALUES($1,$2) RETURNING id`, [userId, 'پروژه پیش‌فرض']);
      projectId = r.rows[0].id;
    } else projectId = pr.rows[0].id;

    // insert file record
    await pool.query(`INSERT INTO files(project_id, owner_id, telegram_file_id, created_at) VALUES($1,$2,$3,NOW())`,
      [projectId, userId, fileId]);

    await ctx.reply('عکس دریافت شد و ذخیره موقت شد. اگر می‌خواهی این پروژه را ثبت کنی از /newproject استفاده کن.');
  } catch (err) {
    console.error('photo handler error', err);
    ctx.reply('خطا در دریافت عکس. لطفا دوباره امتحان کن.');
  }
});

// webhook setup for Render
app.use(bot.webhookCallback('/webhook'));

app.get('/', (req,res) => res.send('Bot is running'));

const PORT = process.env.PORT || 10000;

(async () => {
  try {
    await ensureTables();
    app.listen(PORT, async () => {
      console.log('Server running on port', PORT);
      // set webhook if BASE_URL present
      if(BASE_URL){
        try {
          await bot.telegram.setWebhook(`${BASE_URL}/webhook`);
          console.log('Webhook set:', `${BASE_URL}/webhook`);
        } catch (e) {
          console.error('Webhook error:', e.message || e);
        }
      } else {
        console.log('BASE_URL not set; skipping webhook set.');
      }
    });
  } catch (e){
    console.error('Startup error', e);
    process.exit(1);
  }
})();

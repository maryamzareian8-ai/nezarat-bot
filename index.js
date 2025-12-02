require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const express = require("express");

const TOKEN = process.env.TELEGRAM_TOKEN;
const BASE_URL = process.env.BASE_URL;

if (!TOKEN) {
  console.error("❌ TELEGRAM_TOKEN is missing!");
  process.exit(1);
}
if (!BASE_URL) {
  console.error("❌ BASE_URL is missing!");
  process.exit(1);
}

const bot = new TelegramBot(TOKEN, { polling: false });

const app = express();
app.use(express.json());

app.post('/webhook', (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// ----------- Bot Commands -----------
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, "ربات معماری فعال شد ✔️");
});

bot.onText(/\/status/, (msg) => {
  bot.sendMessage(msg.chat.id, "ربات آنلاین و سالم است ✔️");
});

// ----------- Start Server -----------
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log("Server running on port", PORT);

  const url = ${BASE_URL}/webhook;

  bot.setWebHook(url);
  console.log("Webhook set to:", url);
});


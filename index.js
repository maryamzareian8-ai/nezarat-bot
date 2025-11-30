const express = require("express");
const { Telegraf } = require("telegraf");

const app = express();

// این دوتا مقدار را بعداً از ENV در Render می‌گیریم
const BOT_TOKEN = process.env.TELEGRAM_TOKEN;
const ADMIN_ID = process.env.ADMIN_TELEGRAM_ID;

// ساخت ربات
const bot = new Telegraf(BOT_TOKEN);

// ربات تک‌کاربره
function onlyAdmin(ctx, next) {
    if (String(ctx.from.id) !== String(ADMIN_ID)) {
        return ctx.reply("این ربات فقط برای استفاده صاحب اصلی است ❌");
    }
    return next();
}

// اولین دستور
bot.start(onlyAdmin, (ctx) => {
    ctx.reply("ربات معماری فعال شد ✔️");
});

// راه‌اندازی Webhook (برای Render)
app.use(bot.webhookCallback("/webhook"));

app.get("/", (req, res) => {
    res.send("Bot is running");
});

const port = process.env.PORT || 3000;

app.listen(port, async () => {
    console.log("Server running on port", port);

    // تنظیم webhook
    const url = process.env.BASE_URL + "/webhook";
    try {
        await bot.telegram.setWebhook(url);
        console.log("Webhook set:", url);
    } catch (err) {
        console.log("Webhook error:", err.message);
    }
});
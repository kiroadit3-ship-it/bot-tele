const { Telegraf } = require("telegraf");
const { config } = require("./config");
const { db, getSetting, upsertUser } = require("./db");
const {
  productListKeyboard,
  productDetailKeyboard,
  paymentKeyboard
} = require("./keyboards");
const { registerAdmin } = require("./admin");
const { createCheckout, getOrder, setPaymentMessageId } = require("./orderService");
const { renderSetting, safeReplyHtml, safeEditHtml } = require("./template");

const bot = new Telegraf(config.botToken);

bot.use(async (ctx, next) => {
  try {
    if (ctx.from && ctx.chat && ctx.chat.type === "private") {
      upsertUser(ctx);
    }
  } catch (err) {
    console.error("Failed to save user:", err.message);
  }

  return next();
});

bot.catch((err, ctx) => {
  console.error("BOT ERROR:", err);
  if (ctx && ctx.reply) ctx.reply("Terjadi error. Silakan coba lagi.").catch(() => {});
});

async function showHome(ctx, edit = false) {
  const productsCount = db.prepare("SELECT COUNT(*) AS c FROM products WHERE is_active = 1").get().c;
  const html = productsCount
    ? renderSetting("start_template", { user: ctx.from })
    : renderSetting("empty_product_template", { user: ctx.from });

  if (edit) return safeEditHtml(ctx, html, productListKeyboard());
  return safeReplyHtml(ctx, html, productListKeyboard());
}

bot.start(async (ctx) => showHome(ctx, false));

bot.command("produk", async (ctx) => showHome(ctx, false));

bot.action("user:home", async (ctx) => {
  await ctx.answerCbQuery();
  await showHome(ctx, true);
});

bot.action(/^user:product:(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const id = Number(ctx.match[1]);

  const product = db.prepare(`
    SELECT p.*,
      (SELECT COUNT(*) FROM stock_items s WHERE s.product_id = p.id AND s.status = 'available') AS stock_count
    FROM products p
    WHERE p.id = ? AND p.is_active = 1
  `).get(id);

  if (!product) return safeEditHtml(ctx, "Produk tidak ditemukan atau nonaktif.", productListKeyboard());

  const html = renderSetting("product_template", { user: ctx.from, product });
  await safeEditHtml(ctx, html, productDetailKeyboard(product));
});

bot.action(/^user:buy:(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const id = Number(ctx.match[1]);

  const product = db.prepare(`
    SELECT p.*,
      (SELECT COUNT(*) FROM stock_items s WHERE s.product_id = p.id AND s.status = 'available') AS stock_count
    FROM products p
    WHERE p.id = ? AND p.is_active = 1
  `).get(id);

  if (!product) return safeEditHtml(ctx, "Produk tidak ditemukan atau nonaktif.", productListKeyboard());
  if (Number(product.price) < 1) return safeEditHtml(ctx, "Harga produk belum valid. Hubungi admin.", productDetailKeyboard(product));
  if (Number(product.stock_count || 0) < 1) return safeEditHtml(ctx, "Stok sedang habis.", productListKeyboard());

  await safeEditHtml(ctx, "Membuat invoice QRIS...", productListKeyboard());

  try {
    const checkout = await createCheckout({ ctx, product });
    if (!checkout.ok) return safeEditHtml(ctx, checkout.message, productListKeyboard());

    const order = checkout.order;

    if (config.sendQrImage && checkout.qrPng) {
      // Telegram tidak bisa mengubah pesan text menjadi photo.
      // Agar chat bersih, pesan menu lama dihapus lalu diganti 1 pesan QR.
      try {
        await ctx.deleteMessage();
      } catch (_) {}

      const caption = renderSetting("payment_template", { user: ctx.from, product, order });
      const sent = await ctx.replyWithPhoto(
        { source: checkout.qrPng },
        {
          caption,
          parse_mode: "HTML",
          ...paymentKeyboard(order)
        }
      );
      setPaymentMessageId(order.id, sent.message_id);
    } else {
      const html = renderSetting("payment_text_template", { user: ctx.from, product, order });
      await safeEditHtml(ctx, html, paymentKeyboard(order));
    }
  } catch (err) {
    console.error(err);
    await safeEditHtml(ctx, `Gagal membuat pembayaran: ${err.message}`, productListKeyboard());
  }
});

bot.action(/^user:check:(ORD_[A-F0-9]+)$/, async (ctx) => {
  await ctx.answerCbQuery("Status dicek otomatis. Setelah sukses, akses akan tampil di sini.");
  const order = getOrder(ctx.match[1]);
  if (!order) return;

  if (order.status === "completed") {
    return ctx.answerCbQuery("Pembayaran sudah sukses.", { show_alert: true });
  }

  return ctx.answerCbQuery("Belum terdeteksi sukses. Coba beberapa saat lagi.", { show_alert: true });
});

registerAdmin(bot);

module.exports = { bot };

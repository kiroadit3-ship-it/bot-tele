const { Markup } = require("telegraf");
const { config } = require("./config");
const {
  db,
  getSetting,
  setSetting,
  formatMoney,
  getBroadcastUsers,
  markUserBlocked
} = require("./db");
const {
  adminHomeKeyboard,
  adminSettingsKeyboard,
  adminTemplatesKeyboard,
  adminProductsKeyboard,
  adminProductKeyboard
} = require("./keyboards");
const { safeReplyHtml, safeEditHtml, escapeHtml } = require("./template");
const {
  textWithCustomEmojiToHtml,
  extractFirstCustomEmoji
} = require("./telegramEntities");

const states = new Map();

function isAdmin(userId) {
  return config.adminIds.includes(Number(userId));
}

function requireAdmin(ctx, next) {
  if (!ctx.from || !isAdmin(ctx.from.id)) return ctx.reply("Perintah ini hanya untuk admin.");
  return next();
}

function setState(userId, state) {
  states.set(Number(userId), state);
}

function getState(userId) {
  return states.get(Number(userId));
}

function clearState(userId) {
  states.delete(Number(userId));
}

function registerAdmin(bot) {
  bot.command("admin", requireAdmin, async (ctx) => {
    clearState(ctx.from.id);
    await safeReplyHtml(ctx, "<b>Panel Admin</b>", adminHomeKeyboard());
  });

  bot.action("admin:home", requireAdmin, async (ctx) => {
    clearState(ctx.from.id);
    await ctx.answerCbQuery();
    await safeEditHtml(ctx, "<b>Panel Admin</b>", adminHomeKeyboard());
  });

  bot.action("admin:settings", requireAdmin, async (ctx) => {
    await ctx.answerCbQuery();
    const html =
`<b>Setting Toko</b>

Nama toko saat ini:
<code>${escapeHtml(getSetting("store_name"))}</code>`;
    await safeEditHtml(ctx, html, adminSettingsKeyboard());
  });

  bot.action("admin:templates", requireAdmin, async (ctx) => {
    await ctx.answerCbQuery();
    const html =
`<b>Template Pesan</b>

Template boleh memakai HTML Telegram dan placeholder:
<code>{NAME}</code>, <code>{USERNAME}</code>, <code>{STORE_NAME}</code>, <code>{PRODUCT_NAME}</code>, <code>{PRICE}</code>, <code>{STOCK}</code>, <code>{ORDER_ID}</code>, <code>{PAYMENT_URL}</code>, <code>{EXPIRED_AT}</code>, <code>{ACCESS}</code>

Premium emoji:
<code>&lt;tg-emoji emoji-id="ID"&gt;🙂&lt;/tg-emoji&gt;</code>`;
    await safeEditHtml(ctx, html, adminTemplatesKeyboard());
  });

  bot.action(/^admin:set:(.+)$/, requireAdmin, async (ctx) => {
    await ctx.answerCbQuery();
    const key = ctx.match[1];
    const allowed = [
      "store_name",
      "start_template",
      "product_template",
      "payment_template",
      "payment_text_template",
      "success_template",
      "empty_product_template"
    ];

    if (!allowed.includes(key)) return ctx.reply("Setting tidak dikenal.");

    setState(ctx.from.id, { type: "set_setting", key });
    const current = escapeHtml(getSetting(key));
    await ctx.reply(
`Kirim isi baru untuk <b>${escapeHtml(key)}</b>.

Isi saat ini:
<pre>${current}</pre>`,
      { parse_mode: "HTML" }
    );
  });

  bot.action("admin:products", requireAdmin, async (ctx) => {
    await ctx.answerCbQuery();
    await safeEditHtml(ctx, "<b>Kelola Produk</b>", adminProductsKeyboard());
  });

  bot.action("admin:add_product", requireAdmin, async (ctx) => {
    await ctx.answerCbQuery();
    setState(ctx.from.id, { type: "add_product_name" });
    await ctx.reply("Kirim nama produk baru.");
  });

  bot.action(/^admin:product:(\d+)$/, requireAdmin, async (ctx) => {
    await ctx.answerCbQuery();
    await showProductAdmin(ctx, Number(ctx.match[1]), true);
  });

  bot.action(/^admin:edit:(name|price|description|button_text|sort_order):(\d+)$/, requireAdmin, async (ctx) => {
    await ctx.answerCbQuery();
    const field = ctx.match[1];
    const productId = Number(ctx.match[2]);
    setState(ctx.from.id, { type: "edit_product", productId, field });

    const labels = {
      name: "nama produk",
      price: "harga angka saja, contoh 25000",
      description: "deskripsi produk",
      button_text: "teks tombol beli",
      sort_order: "urutan angka, contoh 1"
    };

    await ctx.reply(`Kirim ${labels[field]}.`);
  });

  bot.action(/^admin:add_stock:(\d+)$/, requireAdmin, async (ctx) => {
    await ctx.answerCbQuery();
    const productId = Number(ctx.match[1]);
    setState(ctx.from.id, { type: "add_stock", productId });
    await ctx.reply(
`Kirim stok, satu akses per baris.

Contoh:
email1@example.com|password1
email2@example.com|password2

Gunakan hanya akses/produk digital yang legal dan berhak Anda jual.`
    );
  });

  bot.action(/^admin:toggle:(\d+)$/, requireAdmin, async (ctx) => {
    await ctx.answerCbQuery();
    const id = Number(ctx.match[1]);
    db.prepare("UPDATE products SET is_active = CASE WHEN is_active = 1 THEN 0 ELSE 1 END WHERE id = ?").run(id);
    await showProductAdmin(ctx, id, true);
  });

  bot.action(/^admin:delete:(\d+)$/, requireAdmin, async (ctx) => {
    await ctx.answerCbQuery();
    const id = Number(ctx.match[1]);
    const pending = db.prepare("SELECT COUNT(*) AS c FROM orders WHERE product_id = ? AND status = 'pending'").get(id).c;
    if (pending > 0) return ctx.reply("Produk masih punya order pending, tidak bisa dihapus.");
    db.prepare("DELETE FROM products WHERE id = ?").run(id);
    await ctx.reply("Produk berhasil dihapus.");
    await ctx.reply("Kelola Produk", adminProductsKeyboard());
  });

  bot.action("admin:stock", requireAdmin, async (ctx) => {
    await ctx.answerCbQuery();
    const rows = db.prepare(`
      SELECT p.id, p.name,
        SUM(CASE WHEN s.status = 'available' THEN 1 ELSE 0 END) AS available_count,
        SUM(CASE WHEN s.status = 'reserved' THEN 1 ELSE 0 END) AS reserved_count,
        SUM(CASE WHEN s.status = 'used' THEN 1 ELSE 0 END) AS used_count
      FROM products p
      LEFT JOIN stock_items s ON s.product_id = p.id
      GROUP BY p.id
      ORDER BY p.id ASC
    `).all();

    const body = rows.length
      ? rows.map(r =>
`#${r.id} <b>${escapeHtml(r.name)}</b>
Tersedia: <b>${r.available_count || 0}</b>
Reserved: <b>${r.reserved_count || 0}</b>
Terjual: <b>${r.used_count || 0}</b>`).join("\n\n")
      : "Belum ada produk.";

    await safeEditHtml(ctx, `<b>Ringkasan Stok</b>\n\n${body}`, Markup.inlineKeyboard([[Markup.button.callback("⬅️ Admin", "admin:home")]]));
  });

  bot.action("admin:orders", requireAdmin, async (ctx) => {
    await ctx.answerCbQuery();
    const orders = db.prepare("SELECT * FROM orders ORDER BY created_at DESC LIMIT 20").all();

    const body = orders.length
      ? orders.map(o =>
`<code>${escapeHtml(o.id)}</code>
User: <code>${o.user_id}</code>${o.username ? " @" + escapeHtml(o.username) : ""}
Produk: <b>${escapeHtml(o.product_name)}</b>
Total: <b>${formatMoney(o.total_payment || o.amount)}</b>
Status: <b>${escapeHtml(o.status)}</b>
Dibuat: <code>${escapeHtml(o.created_at)}</code>`).join("\n\n")
      : "Belum ada order.";

    await safeEditHtml(ctx, `<b>20 Order Terbaru</b>\n\n${body}`, Markup.inlineKeyboard([[Markup.button.callback("⬅️ Admin", "admin:home")]]));
  });

  bot.action("admin:broadcast", requireAdmin, async (ctx) => {
  await ctx.answerCbQuery();

  const totalUsers = db
    .prepare("SELECT COUNT(*) AS c FROM users WHERE is_blocked = 0")
    .get().c;

  setState(ctx.from.id, { type: "broadcast_input" });

  await safeEditHtml(
    ctx,
    `<b>Broadcast Admin</b>

Target user aktif: <b>${totalUsers}</b>

Kirim pesan broadcast sekarang.
Pesan support HTML Telegram dan emoji premium.

Kirim /cancel untuk batal.`,
    Markup.inlineKeyboard([[Markup.button.callback("⬅️ Admin", "admin:home")]])
  );
});

bot.action("admin:broadcast_cancel", requireAdmin, async (ctx) => {
  clearState(ctx.from.id);
  await ctx.answerCbQuery("Broadcast dibatalkan");
  await safeEditHtml(ctx, "<b>Broadcast dibatalkan.</b>", adminHomeKeyboard());
});

bot.action("admin:broadcast_send", requireAdmin, async (ctx) => {
  const state = getState(ctx.from.id);

  if (!state || state.type !== "broadcast_confirm" || !state.htmlText) {
    await ctx.answerCbQuery("Tidak ada broadcast pending.", {
      show_alert: true
    });
    return;
  }

  clearState(ctx.from.id);
  await ctx.answerCbQuery("Broadcast dikirim...");
  await safeEditHtml(ctx, "<b>Mengirim broadcast...</b>");

  await sendBroadcast(ctx, state.htmlText);
});

  bot.action("admin:help", requireAdmin, async (ctx) => {
    await ctx.answerCbQuery();
    await safeEditHtml(ctx, getSetting("admin_help"), Markup.inlineKeyboard([[Markup.button.callback("⬅️ Admin", "admin:home")]]));
  });

  bot.on("text", async (ctx, next) => {
  if (!ctx.from || !isAdmin(ctx.from.id)) return next();

  const state = getState(ctx.from.id);
  if (!state) return next();

  const rawText = ctx.message.text;

  if (rawText === "/cancel") {
    clearState(ctx.from.id);
    return ctx.reply("Dibatalkan.", adminHomeKeyboard());
  }

  clearState(ctx.from.id);

  try {
    const htmlText = textWithCustomEmojiToHtml(ctx.message);

    await handleStateText(ctx, state, rawText, htmlText, ctx.message);
  } catch (err) {
    console.error(err);
    await ctx.reply(`Gagal: ${err.message}`);
  }
});
}

async function handleStateText(ctx, state, text, htmlText = text, message = null) {
if (state.type === "broadcast_input") {
  setState(ctx.from.id, {
    type: "broadcast_confirm",
    htmlText
  });

  await ctx.reply("Preview broadcast:");

  await ctx.reply(htmlText, {
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...Markup.inlineKeyboard([
      [
        Markup.button.callback("✅ Kirim Broadcast", "admin:broadcast_send"),
        Markup.button.callback("❌ Batal", "admin:broadcast_cancel")
      ]
    ])
  });

  return;
}

  if (state.type === "set_setting") {
  setSetting(state.key, htmlText);
  return ctx.reply(`Setting ${state.key} berhasil disimpan.`, adminHomeKeyboard());
}

  if (state.type === "add_product_name") {
    const result = db.prepare(`
      INSERT INTO products(name, description, price, button_text, is_active, sort_order)
      VALUES (?, '', 0, 'Beli Sekarang', 0, 0)
    `).run(text.trim());

    setState(ctx.from.id, { type: "edit_product", productId: result.lastInsertRowid, field: "price" });
    return ctx.reply("Produk dibuat nonaktif dulu. Kirim harga angka saja, contoh 25000.");
  }

  if (state.type === "edit_product") {
  const { productId, field } = state;
  const allowed = ["name", "price", "description", "button_text", "sort_order"];
  if (!allowed.includes(field)) return ctx.reply("Field tidak valid.");

  let value = field === "description" ? htmlText : text;

  if (field === "button_text") {
    const parsedButton = extractFirstCustomEmoji(message);

    db.prepare(`
      UPDATE products
      SET button_text = ?, button_icon_custom_emoji_id = ?
      WHERE id = ?
    `).run(
      parsedButton.cleanText || "Beli Sekarang",
      parsedButton.customEmojiId,
      productId
    );

    return showProductAdmin(ctx, productId, false);
  }

  if (field === "price" || field === "sort_order") {
    value = Number(String(text).replace(/[^\d]/g, ""));
    if (!Number.isSafeInteger(value)) return ctx.reply("Angka tidak valid.");
  }

  db.prepare(`UPDATE products SET ${field} = ? WHERE id = ?`).run(value, productId);
  return showProductAdmin(ctx, productId, false);
}

  if (state.type === "add_stock") {
    const lines = text.split("\n").map(x => x.trim()).filter(Boolean);
    if (!lines.length) return ctx.reply("Stok kosong.");

    const insert = db.prepare("INSERT INTO stock_items(product_id, content) VALUES (?, ?)");
    const tx = db.transaction(() => {
      for (const line of lines) insert.run(state.productId, line);
    });
    tx();

    return ctx.reply(`${lines.length} stok berhasil ditambahkan.`, adminProductsKeyboard());
  }

  return ctx.reply("State tidak dikenal.");
}

async function showProductAdmin(ctx, id, edit = false) {
  const product = db.prepare(`
    SELECT p.*,
      (SELECT COUNT(*) FROM stock_items s WHERE s.product_id = p.id AND s.status = 'available') AS available_count,
      (SELECT COUNT(*) FROM stock_items s WHERE s.product_id = p.id AND s.status = 'reserved') AS reserved_count,
      (SELECT COUNT(*) FROM stock_items s WHERE s.product_id = p.id AND s.status = 'used') AS used_count
    FROM products p
    WHERE p.id = ?
  `).get(id);

  if (!product) return ctx.reply("Produk tidak ditemukan.", adminProductsKeyboard());

  const html =
`<b>Produk #${product.id}</b>

Nama: <b>${escapeHtml(product.name)}</b>
Harga: <b>${formatMoney(product.price)}</b>
Status: <b>${product.is_active ? "Aktif" : "Nonaktif"}</b>
Tombol: <code>${escapeHtml(product.button_text)}</code>
Icon Emoji ID: <code>${escapeHtml(product.button_icon_custom_emoji_id || "-")}</code>
Urutan: <code>${escapeHtml(product.sort_order)}</code>

Stok tersedia: <b>${product.available_count || 0}</b>
Reserved: <b>${product.reserved_count || 0}</b>
Terjual: <b>${product.used_count || 0}</b>

Deskripsi:
${escapeHtml(product.description || "-")}`;

  if (edit) return safeEditHtml(ctx, html, adminProductKeyboard(product.id));
  return safeReplyHtml(ctx, html, adminProductKeyboard(product.id));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendBroadcast(ctx, html) {
  const users = getBroadcastUsers();

  if (!users.length) {
    return ctx.reply("Belum ada user untuk broadcast.");
  }

  let sent = 0;
  let failed = 0;
  let blocked = 0;

  const progress = await ctx.reply(`Broadcast dimulai ke ${users.length} user...`);

  for (let i = 0; i < users.length; i++) {
    const user = users[i];

    try {
      await ctx.telegram.sendMessage(user.chat_id, html, {
        parse_mode: "HTML",
        disable_web_page_preview: true
      });

      sent++;
    } catch (err) {
      failed++;

      const desc = String(err.description || err.message || "").toLowerCase();

      if (
        desc.includes("bot was blocked") ||
        desc.includes("user is deactivated") ||
        desc.includes("chat not found") ||
        desc.includes("forbidden")
      ) {
        blocked++;
        markUserBlocked(user.chat_id);
      }

      console.error(`Broadcast failed to ${user.chat_id}:`, err.message);
    }

    if ((i + 1) % 20 === 0 || i + 1 === users.length) {
      await ctx.telegram
        .editMessageText(
          ctx.chat.id,
          progress.message_id,
          undefined,
          `Broadcast berjalan...\n\nTarget: ${users.length}\nTerkirim: ${sent}\nGagal: ${failed}\nBlocked: ${blocked}\nProgress: ${i + 1}/${users.length}`
        )
        .catch(() => {});
    }

    await sleep(70);
  }

  await ctx.reply(
    `Broadcast selesai.\n\nTarget: ${users.length}\nTerkirim: ${sent}\nGagal: ${failed}\nBlocked ditandai: ${blocked}`
  );
}

module.exports = { registerAdmin, isAdmin, requireAdmin };

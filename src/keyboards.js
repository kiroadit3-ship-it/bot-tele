const { Markup } = require("telegraf");
const { db } = require("./db");

function productListKeyboard() {
  const products = db.prepare(`
    SELECT p.*,
      (SELECT COUNT(*) FROM stock_items s WHERE s.product_id = p.id AND s.status = 'available') AS stock_count
    FROM products p
    WHERE p.is_active = 1
    ORDER BY p.sort_order ASC, p.id ASC
  `).all();

  if (!products.length) {
    return Markup.inlineKeyboard([
      [Markup.button.callback("🔄 Refresh", "user:home")]
    ]);
  }

  const rows = products.map(p => [
    Markup.button.callback(`${p.name} • ${p.stock_count || 0} stok`, `user:product:${p.id}`)
  ]);

  rows.push([Markup.button.callback("🔄 Refresh", "user:home")]);
  return Markup.inlineKeyboard(rows);
}

function callbackButtonWithIcon(text, callbackData, iconCustomEmojiId) {
  const button = {
    text: text || "Beli Sekarang",
    callback_data: callbackData
  };

  if (iconCustomEmojiId) {
    button.icon_custom_emoji_id = String(iconCustomEmojiId);
  }

  return button;
}

function productDetailKeyboard(product) {
  return Markup.inlineKeyboard([
    [
      callbackButtonWithIcon(
        product.button_text || "Beli Sekarang",
        `user:buy:${product.id}`,
        product.button_icon_custom_emoji_id
      )
    ],
    [Markup.button.callback("⬅️ Kembali", "user:home")]
  ]);
}

function paymentKeyboard(order) {
  return Markup.inlineKeyboard([
    [Markup.button.url("🔗 Buka QRIS Pakasir", order.payment_url)],
    [Markup.button.callback("🔄 Cek Status", `user:check:${order.id}`)],
    [Markup.button.callback("🏠 Menu", "user:home")]
  ]);
}

function adminHomeKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("⚙️ Setting Toko", "admin:settings")],
    [Markup.button.callback("🧩 Template Pesan", "admin:templates")],
    [Markup.button.callback("📦 Kelola Produk", "admin:products")],
    [Markup.button.callback("📥 Ringkasan Stok", "admin:stock")],
    [Markup.button.callback("📑 Order", "admin:orders")],
    [Markup.button.callback("📢 Broadcast", "admin:broadcast")]
  ]);
}

function adminSettingsKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("🏪 Nama Toko", "admin:set:store_name")],
    [Markup.button.callback("❓ Bantuan Admin", "admin:help")],
    [Markup.button.callback("⬅️ Admin", "admin:home")]
  ]);
}

function adminTemplatesKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("✏️ /start", "admin:set:start_template")],
    [Markup.button.callback("✏️ Detail Produk", "admin:set:product_template")],
    [Markup.button.callback("✏️ Payment Caption QR", "admin:set:payment_template")],
    [Markup.button.callback("✏️ Payment Text Tanpa QR", "admin:set:payment_text_template")],
    [Markup.button.callback("✏️ Sukses + Akses", "admin:set:success_template")],
    [Markup.button.callback("✏️ Produk Kosong", "admin:set:empty_product_template")],
    [Markup.button.callback("⬅️ Admin", "admin:home")]
  ]);
}

function adminProductsKeyboard() {
  const products = db.prepare("SELECT * FROM products ORDER BY sort_order ASC, id ASC").all();
  const rows = [[Markup.button.callback("➕ Tambah Produk", "admin:add_product")]];

  for (const p of products) {
    rows.push([
      Markup.button.callback(`${p.is_active ? "✅" : "❌"} #${p.id} ${p.name}`, `admin:product:${p.id}`)
    ]);
  }

  rows.push([Markup.button.callback("⬅️ Admin", "admin:home")]);
  return Markup.inlineKeyboard(rows);
}

function adminProductKeyboard(id) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("✏️ Nama", `admin:edit:name:${id}`),
      Markup.button.callback("💰 Harga", `admin:edit:price:${id}`)
    ],
    [
      Markup.button.callback("📝 Deskripsi", `admin:edit:description:${id}`),
      Markup.button.callback("🔘 Tombol", `admin:edit:button_text:${id}`)
    ],
    [
      Markup.button.callback("🔢 Urutan", `admin:edit:sort_order:${id}`),
      Markup.button.callback("📥 Tambah Stok", `admin:add_stock:${id}`)
    ],
    [
      Markup.button.callback("🔁 Aktif/Nonaktif", `admin:toggle:${id}`),
      Markup.button.callback("🗑 Hapus", `admin:delete:${id}`)
    ],
    [Markup.button.callback("⬅️ Produk", "admin:products")]
  ]);
}

module.exports = {
  productListKeyboard,
  productDetailKeyboard,
  paymentKeyboard,
  adminHomeKeyboard,
  adminSettingsKeyboard,
  adminTemplatesKeyboard,
  adminProductsKeyboard,
  adminProductKeyboard
};

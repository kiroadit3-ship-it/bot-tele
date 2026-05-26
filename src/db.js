const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const { config } = require("./config");

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });

const db = new Database(config.dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  user_id INTEGER PRIMARY KEY,
  chat_id INTEGER NOT NULL,
  username TEXT,
  first_name TEXT,
  last_name TEXT,
  is_blocked INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price INTEGER NOT NULL DEFAULT 0,
  button_text TEXT NOT NULL DEFAULT 'Beli Sekarang',
  button_icon_custom_emoji_id TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS stock_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'available',
  order_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  used_at TEXT,
  FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  chat_id INTEGER NOT NULL,
  username TEXT,
  product_id INTEGER NOT NULL,
  product_name TEXT NOT NULL,
  amount INTEGER NOT NULL,
  total_payment INTEGER,
  status TEXT NOT NULL DEFAULT 'pending',
  payment_method TEXT NOT NULL DEFAULT 'qris',
  payment_number TEXT,
  payment_url TEXT,
  expired_at TEXT,
  stock_item_id INTEGER,
  payment_message_id INTEGER,
  delivered_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(product_id) REFERENCES products(id),
  FOREIGN KEY(stock_item_id) REFERENCES stock_items(id)
);

CREATE INDEX IF NOT EXISTS idx_products_active ON products(is_active);
CREATE INDEX IF NOT EXISTS idx_stock_product_status ON stock_items(product_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_users_blocked ON users(is_blocked);
`);

try {
  db.prepare("ALTER TABLE products ADD COLUMN button_icon_custom_emoji_id TEXT").run();
} catch (err) {
  // Abaikan jika kolom sudah ada
}

const defaults = {
  store_name: "Store Digital",
  start_template:
`<b>Halo {NAME}</b> 👋

Selamat datang di <b>{STORE_NAME}</b>.
Silakan pilih produk yang tersedia di bawah ini.`,

  product_template:
`<b>{PRODUCT_NAME}</b>

{PRODUCT_DESC}

Harga: <b>{PRICE}</b>
Stok: <b>{STOCK}</b>`,

  payment_template:
`<b>Invoice Pembayaran</b>

Invoice: <code>{ORDER_ID}</code>
Produk: <b>{PRODUCT_NAME}</b>
Total: <b>{PRICE}</b>
Expired: <code>{EXPIRED_AT}</code>

Silakan scan QRIS di bawah ini atau klik tombol pembayaran.
Setelah sukses, detail akses akan dikirim otomatis.`,

  payment_text_template:
`<b>Invoice Pembayaran</b>

Invoice: <code>{ORDER_ID}</code>
Produk: <b>{PRODUCT_NAME}</b>
Total: <b>{PRICE}</b>
Expired: <code>{EXPIRED_AT}</code>

Klik tombol di bawah untuk membuka QRIS Pakasir.
Setelah sukses, detail akses akan dikirim otomatis.`,

  success_template:
`✅ <b>Pembayaran Berhasil</b>

Invoice: <code>{ORDER_ID}</code>
Produk: <b>{PRODUCT_NAME}</b>

<b>Detail akses:</b>
<pre>{ACCESS}</pre>

Simpan data ini baik-baik. Terima kasih.`,

  empty_product_template:
`Belum ada produk aktif atau stok sedang kosong.`,

  admin_help:
`<b>Bantuan Admin</b>

1. Setting toko: ubah nama toko dan template pesan.
2. Kelola produk: tambah/edit produk, harga, deskripsi, tombol.
3. Tambah stok: satu akses per baris.
4. Order: lihat 20 order terbaru.

Template mendukung HTML Telegram dan placeholder seperti {NAME}, {PRODUCT_NAME}, {PRICE}, {ACCESS}.`
};

const insert = db.prepare("INSERT OR IGNORE INTO settings(key, value) VALUES (?, ?)");
for (const [k, v] of Object.entries(defaults)) insert.run(k, v);

function getSetting(key, fallback = "") {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
  return row ? row.value : fallback;
}

function setSetting(key, value) {
  db.prepare(`
    INSERT INTO settings(key, value)
    VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, String(value));
}

function formatMoney(amount) {
  return `${config.currencyPrefix}${Number(amount || 0).toLocaleString("id-ID")}`;
}

function nowIso() {
  return new Date().toISOString();
}

function upsertUser(ctx) {
  if (!ctx || !ctx.from || !ctx.chat) return;

  db.prepare(`
    INSERT INTO users(user_id, chat_id, username, first_name, last_name, updated_at, last_seen_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      chat_id = excluded.chat_id,
      username = excluded.username,
      first_name = excluded.first_name,
      last_name = excluded.last_name,
      updated_at = excluded.updated_at,
      last_seen_at = excluded.last_seen_at,
      is_blocked = 0
  `).run(
    ctx.from.id,
    ctx.chat.id,
    ctx.from.username || "",
    ctx.from.first_name || "",
    ctx.from.last_name || "",
    nowIso(),
    nowIso()
  );
}

function markUserBlocked(chatId) {
  db.prepare(`
    UPDATE users
    SET is_blocked = 1, updated_at = ?
    WHERE chat_id = ?
  `).run(nowIso(), chatId);
}

function getBroadcastUsers() {
  return db.prepare(`
    SELECT *
    FROM users
    WHERE is_blocked = 0
    ORDER BY last_seen_at DESC
  `).all();
}

module.exports = {
  db,
  getSetting,
  setSetting,
  formatMoney,
  nowIso,
  upsertUser,
  markUserBlocked,
  getBroadcastUsers
};

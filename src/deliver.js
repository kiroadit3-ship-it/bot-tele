const { db } = require("./db");
const { renderSetting } = require("./template");

async function deliverOrder(bot, order, stock) {
  const product = db.prepare("SELECT * FROM products WHERE id = ?").get(order.product_id);

  const html = renderSetting("success_template", {
    user: {
      id: order.user_id,
      username: order.username
    },
    product,
    order,
    stock,
    access: stock.content
  });

  // Kalau sebelumnya ada pesan QRIS, hapus dulu supaya QR hilang
  if (order.payment_message_id) {
    try {
      await bot.telegram.deleteMessage(order.chat_id, order.payment_message_id);
    } catch (err) {
      console.error("Gagal hapus pesan QRIS:", err.message);
    }
  }

  // Lalu kirim pesan sukses baru
  await bot.telegram.sendMessage(order.chat_id, html, {
    parse_mode: "HTML"
  });
}

module.exports = { deliverOrder };
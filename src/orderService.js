const crypto = require("crypto");
const QRCode = require("qrcode");
const { db, nowIso } = require("./db");
const { createQrisTransaction, buildQrisOnlyUrl } = require("./pakasir");

function createOrderId() {
  return "ORD_" + crypto.randomBytes(6).toString("hex").toUpperCase();
}

function reserveStock(productId, orderId) {
  const tx = db.transaction(() => {
    const stock = db.prepare(`
      SELECT * FROM stock_items
      WHERE product_id = ? AND status = 'available'
      ORDER BY id ASC
      LIMIT 1
    `).get(productId);

    if (!stock) return null;

    const result = db.prepare(`
      UPDATE stock_items
      SET status = 'reserved', order_id = ?
      WHERE id = ? AND status = 'available'
    `).run(orderId, stock.id);

    if (result.changes !== 1) return null;
    return stock;
  });

  return tx();
}

function releaseStock(orderId) {
  db.prepare(`
    UPDATE stock_items
    SET status = 'available', order_id = NULL
    WHERE order_id = ? AND status = 'reserved'
  `).run(orderId);
}

async function createCheckout({ ctx, product }) {
  const orderId = createOrderId();
  const stock = reserveStock(product.id, orderId);
  if (!stock) return { ok: false, message: "Stok produk sedang habis." };

  try {
    const payment = await createQrisTransaction({ orderId, amount: product.price });
    const paymentUrl = buildQrisOnlyUrl({ orderId, amount: product.price });

    db.prepare(`
      INSERT INTO orders (
        id, user_id, chat_id, username, product_id, product_name, amount, total_payment,
        status, payment_method, payment_number, payment_url, expired_at, stock_item_id,
        created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'qris', ?, ?, ?, ?, ?, ?)
    `).run(
      orderId,
      ctx.from.id,
      ctx.chat.id,
      ctx.from.username || "",
      product.id,
      product.name,
      product.price,
      Number(payment.total_payment || product.price),
      payment.payment_number || "",
      paymentUrl,
      payment.expired_at || "-",
      stock.id,
      nowIso(),
      nowIso()
    );

    const order = getOrder(orderId);

    const qrPng = payment.payment_number
      ? await QRCode.toBuffer(payment.payment_number, {
          type: "png",
          errorCorrectionLevel: "M",
          margin: 1,
          width: 512
        })
      : null;

    return { ok: true, order, payment, qrPng };
  } catch (err) {
    releaseStock(orderId);
    throw err;
  }
}

function getOrder(orderId) {
  return db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId);
}

function setPaymentMessageId(orderId, messageId) {
  db.prepare("UPDATE orders SET payment_message_id = ?, updated_at = ? WHERE id = ?")
    .run(messageId, nowIso(), orderId);
}

function completeOrder(orderId) {
  const tx = db.transaction(() => {
    const order = getOrder(orderId);
    if (!order) return { ok: false, reason: "ORDER_NOT_FOUND" };
    if (order.status === "completed") return { ok: true, already: true, order };

    const stock = db.prepare("SELECT * FROM stock_items WHERE id = ?").get(order.stock_item_id);
    if (!stock) return { ok: false, reason: "STOCK_NOT_FOUND" };

    db.prepare(`
      UPDATE orders
      SET status = 'completed', delivered_at = ?, updated_at = ?
      WHERE id = ?
    `).run(nowIso(), nowIso(), orderId);

    db.prepare(`
      UPDATE stock_items
      SET status = 'used', used_at = ?
      WHERE id = ?
    `).run(nowIso(), stock.id);

    return {
      ok: true,
      already: false,
      order: getOrder(orderId),
      stock
    };
  });

  return tx();
}

function cancelOrder(orderId, status = "cancelled") {
  const tx = db.transaction(() => {
    const order = getOrder(orderId);
    if (!order || order.status !== "pending") return;
    db.prepare("UPDATE orders SET status = ?, updated_at = ? WHERE id = ?")
      .run(status, nowIso(), orderId);
    releaseStock(orderId);
  });
  tx();
}

function pendingOrders(limit = 20) {
  return db.prepare(`
    SELECT * FROM orders
    WHERE status = 'pending'
    ORDER BY created_at ASC
    LIMIT ?
  `).all(limit);
}

module.exports = {
  createCheckout,
  getOrder,
  setPaymentMessageId,
  completeOrder,
  cancelOrder,
  pendingOrders
};

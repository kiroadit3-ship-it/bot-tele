const express = require("express");
const { config } = require("./config");
const { db } = require("./db");
const { completeOrder } = require("./orderService");
const { deliverOrder } = require("./deliver");

function createServer(bot) {
  const app = express();

  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true }));

  app.get("/health", (req, res) => {
    res.json({ ok: true, service: "telegram-store-pakasir-html-edit" });
  });

  app.post("/pakasir/webhook", async (req, res) => {
    try {
      const body = req.body || {};
      const orderId = String(body.order_id || "");
      const amount = Number(body.amount || 0);
      const project = String(body.project || "");
      const status = String(body.status || "");
      const paymentMethod = String(body.payment_method || "");

      const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId);
      if (!order) return res.status(404).json({ ok: false, error: "ORDER_NOT_FOUND" });

      if (project !== config.pakasirProject) {
        return res.status(400).json({ ok: false, error: "PROJECT_MISMATCH" });
      }

      if (amount !== Number(order.amount)) {
        return res.status(400).json({ ok: false, error: "AMOUNT_MISMATCH" });
      }

      if (paymentMethod && paymentMethod !== "qris") {
        return res.status(400).json({ ok: false, error: "PAYMENT_METHOD_NOT_QRIS" });
      }

      if (status !== "completed") {
        return res.json({ ok: true, ignored: true, status });
      }

      const result = completeOrder(orderId);
      if (!result.ok) return res.status(400).json({ ok: false, error: result.reason });

      if (!result.already) await deliverOrder(bot, result.order, result.stock);
      return res.json({ ok: true });
    } catch (err) {
      console.error("Webhook error:", err);
      return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
    }
  });

  return app;
}

module.exports = { createServer };

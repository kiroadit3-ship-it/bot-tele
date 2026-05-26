const cron = require("node-cron");
const { config } = require("./config");
const { getTransactionDetail } = require("./pakasir");
const { completeOrder, pendingOrders } = require("./orderService");
const { deliverOrder } = require("./deliver");

function startPolling(bot) {
  if (!config.enableStatusPolling) return;

  cron.schedule(config.statusPollingCron, async () => {
    const orders = pendingOrders(20);

    for (const order of orders) {
      try {
        const detail = await getTransactionDetail({
          orderId: order.id,
          amount: order.amount
        });

        const valid =
          detail &&
          detail.project === config.pakasirProject &&
          detail.order_id === order.id &&
          Number(detail.amount) === Number(order.amount) &&
          detail.payment_method === "qris" &&
          detail.status === "completed";

        if (!valid) continue;

        const result = completeOrder(order.id);
        if (result.ok && !result.already) {
          await deliverOrder(bot, result.order, result.stock);
        }
      } catch (err) {
        console.error(`Polling error ${order.id}:`, err.message);
      }
    }
  });
}

module.exports = { startPolling };

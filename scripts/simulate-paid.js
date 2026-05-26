require("dotenv").config();
const { db } = require("../src/db");
const { simulatePayment } = require("../src/pakasir");

async function main() {
  const orderId = process.argv[2];
  if (!orderId) {
    console.error("Usage: npm run simulate-paid ORD_XXXX");
    process.exit(1);
  }

  const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId);
  if (!order) {
    console.error("Order tidak ditemukan di database.");
    process.exit(1);
  }

  const data = await simulatePayment({ orderId: order.id, amount: order.amount });
  console.log(JSON.stringify(data, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

const axios = require("axios");
const { config } = require("./config");

const BASE = "https://app.pakasir.com";

async function createQrisTransaction({ orderId, amount }) {
  const { data } = await axios.post(
    `${BASE}/api/transactioncreate/qris`,
    {
      project: config.pakasirProject,
      order_id: orderId,
      amount: Number(amount),
      api_key: config.pakasirApiKey
    },
    { headers: { "Content-Type": "application/json" }, timeout: 30000 }
  );

  if (!data || !data.payment) {
    throw new Error(`Response Pakasir tidak valid: ${JSON.stringify(data)}`);
  }

  return data.payment;
}

async function getTransactionDetail({ orderId, amount }) {
  const { data } = await axios.get(`${BASE}/api/transactiondetail`, {
    params: {
      project: config.pakasirProject,
      amount: Number(amount),
      order_id: orderId,
      api_key: config.pakasirApiKey
    },
    timeout: 30000
  });

  return data && data.transaction ? data.transaction : null;
}

async function simulatePayment({ orderId, amount }) {
  const { data } = await axios.post(
    `${BASE}/api/paymentsimulation`,
    {
      project: config.pakasirProject,
      order_id: orderId,
      amount: Number(amount),
      api_key: config.pakasirApiKey
    },
    { headers: { "Content-Type": "application/json" }, timeout: 30000 }
  );

  return data;
}

function buildQrisOnlyUrl({ orderId, amount }) {
  const url = new URL(`${BASE}/pay/${encodeURIComponent(config.pakasirProject)}/${Number(amount)}`);
  url.searchParams.set("order_id", orderId);
  url.searchParams.set("qris_only", "1");
  if (config.publicBaseUrl) url.searchParams.set("redirect", config.publicBaseUrl);
  return url.toString();
}

module.exports = {
  createQrisTransaction,
  getTransactionDetail,
  simulatePayment,
  buildQrisOnlyUrl
};

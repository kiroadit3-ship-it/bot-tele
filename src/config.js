require("dotenv").config();

function required(name) {
  const value = process.env[name];
  if (!value || !String(value).trim()) throw new Error(`Missing env: ${name}`);
  return String(value).trim();
}

function optional(name, fallback = "") {
  const value = process.env[name];
  if (value === undefined || value === null || String(value).trim() === "") return fallback;
  return String(value).trim();
}

function parseAdminIds(raw) {
  return raw.split(",")
    .map(x => Number(String(x).trim()))
    .filter(x => Number.isSafeInteger(x));
}

const config = {
  botToken: required("BOT_TOKEN"),
  adminIds: parseAdminIds(required("ADMIN_IDS")),
  pakasirProject: required("PAKASIR_PROJECT"),
  pakasirApiKey: required("PAKASIR_API_KEY"),
  publicBaseUrl: optional("PUBLIC_BASE_URL", ""),
  port: Number(optional("PORT", "3000")),
  dbPath: optional("DB_PATH", "./data/store.sqlite"),
  enableStatusPolling: optional("ENABLE_STATUS_POLLING", "true") === "true",
  statusPollingCron: optional("STATUS_POLLING_CRON", "*/1 * * * *"),
  orderExpireMinutes: Number(optional("ORDER_EXPIRE_MINUTES", "30")),
  currencyPrefix: optional("CURRENCY_PREFIX", "Rp"),
  sendQrImage: optional("SEND_QR_IMAGE", "true") === "true"
};

if (!config.adminIds.length) throw new Error("ADMIN_IDS kosong atau tidak valid.");

module.exports = { config };

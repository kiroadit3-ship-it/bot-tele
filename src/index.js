const { bot } = require("./bot");
const { createServer } = require("./server");
const { startPolling } = require("./polling");
const { config } = require("./config");

async function main() {
  const app = createServer(bot);

  app.listen(config.port, "0.0.0.0", () => {
  console.log(`HTTP server running on 0.0.0.0:${config.port}`);
  console.log(`Health: ${config.publicBaseUrl || "https://bot-tele-production-2c8d.up.railway.app" + config.port}/health`);
  console.log(`Pakasir webhook: ${(config.publicBaseUrl || "https://bot-tele-production-2c8d.up.railway.app")}/pakasir/webhook`);
});

  startPolling(bot);

  await bot.launch();
  console.log("Telegram bot started with long polling.");

  process.once("SIGINT", () => bot.stop("SIGINT"));
  process.once("SIGTERM", () => bot.stop("SIGTERM"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

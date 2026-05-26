const { bot } = require("./bot");
const { createServer } = require("./server");
const { startPolling } = require("./polling");
const { config } = require("./config");

async function main() {
  const app = createServer(bot);

  app.listen(config.port, () => {
    console.log(`HTTP server running on port ${config.port}`);
    console.log(`Health: ${config.publicBaseUrl || "http://localhost:" + config.port}/health`);
    console.log(`Pakasir webhook: ${(config.publicBaseUrl || "https://domain-railway-anda")}/pakasir/webhook`);
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

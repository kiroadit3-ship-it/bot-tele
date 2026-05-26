const { getSetting, formatMoney } = require("./db");

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function stripHtml(value) {
  return String(value ?? "").replace(/<[^>]*>/g, "");
}

function userName(user = {}) {
  return user.first_name || user.username || "User";
}

function buildVars({ user, product, order, stock, access } = {}) {
  return {
    NAME: escapeHtml(userName(user)),
    FIRST_NAME: escapeHtml(user?.first_name || ""),
    USERNAME: escapeHtml(user?.username ? `@${user.username}` : ""),
    USER_ID: escapeHtml(user?.id || order?.user_id || ""),
    STORE_NAME: escapeHtml(getSetting("store_name")),
    PRODUCT_NAME: escapeHtml(product?.name || order?.product_name || ""),
    PRODUCT_DESC: product?.description || "",
    PRICE: escapeHtml(formatMoney(order?.total_payment || order?.amount || product?.price || 0)),
    STOCK: escapeHtml(product?.stock_count ?? ""),
    ORDER_ID: escapeHtml(order?.id || ""),
    PAYMENT_URL: escapeHtml(order?.payment_url || ""),
    EXPIRED_AT: escapeHtml(order?.expired_at || "-"),
    ACCESS: escapeHtml(access || stock?.content || "")
  };
}

function renderTemplate(template, vars) {
  let out = String(template || "");
  for (const [key, value] of Object.entries(vars || {})) {
    out = out.replaceAll(`{${key}}`, value);
  }
  return out;
}

function renderSetting(key, data = {}) {
  return renderTemplate(getSetting(key), buildVars(data));
}

async function safeReplyHtml(ctx, html, extra = {}) {
  try {
    return await ctx.reply(html, { parse_mode: "HTML", ...extra });
  } catch (err) {
    console.error("HTML reply failed:", err.message);
    return ctx.reply(stripHtml(html), extra);
  }
}

async function safeEditHtml(ctx, html, extra = {}) {
  try {
    return await ctx.editMessageText(html, { parse_mode: "HTML", ...extra });
  } catch (err) {
    console.error("HTML edit failed:", err.message);
    try {
      return await ctx.editMessageText(stripHtml(html), extra);
    } catch (err2) {
      console.error("Plain edit failed:", err2.message);
      return ctx.reply(stripHtml(html), extra);
    }
  }
}

async function safeEditCaptionHtml(botOrCtx, chatId, messageId, html, extra = {}) {
  try {
    const tg = botOrCtx.telegram ? botOrCtx.telegram : botOrCtx;
    return await tg.editMessageCaption(chatId, messageId, undefined, html, {
      parse_mode: "HTML",
      ...extra
    });
  } catch (err) {
    console.error("HTML caption edit failed:", err.message);
    try {
      const tg = botOrCtx.telegram ? botOrCtx.telegram : botOrCtx;
      return await tg.editMessageCaption(chatId, messageId, undefined, stripHtml(html), extra);
    } catch (err2) {
      console.error("Plain caption edit failed:", err2.message);
      return null;
    }
  }
}

module.exports = {
  escapeHtml,
  stripHtml,
  buildVars,
  renderTemplate,
  renderSetting,
  safeReplyHtml,
  safeEditHtml,
  safeEditCaptionHtml
};

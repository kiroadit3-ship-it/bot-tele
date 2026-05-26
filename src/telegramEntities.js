function textWithCustomEmojiToHtml(message) {
  const text = message && typeof message.text === "string" ? message.text : "";
  const entities = Array.isArray(message?.entities) ? message.entities : [];

  const customEmojiEntities = entities
    .filter((e) => e.type === "custom_emoji" && e.custom_emoji_id)
    .sort((a, b) => b.offset - a.offset);

  let result = text;

  for (const entity of customEmojiEntities) {
    const start = entity.offset;
    const end = entity.offset + entity.length;
    const visibleEmoji = result.slice(start, end) || "🙂";

    const replacement = `<tg-emoji emoji-id="${escapeAttribute(
      entity.custom_emoji_id
    )}">${visibleEmoji}</tg-emoji>`;

    result = result.slice(0, start) + replacement + result.slice(end);
  }

  return result;
}

function extractFirstCustomEmoji(message) {
  const text = message && typeof message.text === "string" ? message.text : "";
  const entities = Array.isArray(message?.entities) ? message.entities : [];

  const first = entities.find(
    (e) => e.type === "custom_emoji" && e.custom_emoji_id
  );

  if (!first) {
    return {
      cleanText: text.trim(),
      customEmojiId: null
    };
  }

  const start = first.offset;
  const end = first.offset + first.length;

  const cleanText = (text.slice(0, start) + text.slice(end)).trim();

  return {
    cleanText: cleanText || text.trim(),
    customEmojiId: String(first.custom_emoji_id)
  };
}

function escapeAttribute(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

module.exports = {
  textWithCustomEmojiToHtml,
  extractFirstCustomEmoji
};
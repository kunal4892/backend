// src/utils/chatTyping.ts

/**
 * Split raw AI text into bubbles.
 * Supports "&&&" separators first, then falls back to sentence splitting.
 */
export function splitToBubbles(text: string): string[] {
  if (!text) return [];
  let parts = text.split("&&&").map((b) => b.trim()).filter(Boolean);

  // fallback: split by sentence if no separators
  if (parts.length <= 1) {
    parts = text
      .split(/(?<=[.?!])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  return parts;
}

/**
 * Simulates typing effect by progressively updating the last bot message.
 *
 * @param chatId - the chat thread id
 * @param bubble - the text to "type"
 * @param updateLastBotMessage - store updater fn
 * @param delay - ms delay per character (default 50ms, slower typing)
 * @param chunkSize - how many characters to add at once (default 1)
 */
export async function simulateTyping(
  chatId: string,
  bubble: string,
  updateLastBotMessage: (chatId: string, text: string) => void,
  delay: number = 50,
  chunkSize: number = 1
): Promise<void> {
  return new Promise((resolve) => {
    let shown = "";
    const chars = bubble.split("");
    let idx = 0;

    const interval = setInterval(() => {
      shown += chars.slice(idx, idx + chunkSize).join("");
      idx += chunkSize;

      updateLastBotMessage(chatId, shown);

      if (idx >= chars.length) {
        clearInterval(interval);
        resolve();
      }
    }, delay);
  });
}

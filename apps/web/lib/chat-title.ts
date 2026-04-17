const CHAT_TITLE_PREVIEW_LENGTH = 80;

export function getChatTitlePreview(text: string): string {
  return text.length > CHAT_TITLE_PREVIEW_LENGTH
    ? `${text.slice(0, CHAT_TITLE_PREVIEW_LENGTH)}...`
    : text;
}

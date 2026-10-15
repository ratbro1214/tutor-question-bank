// PDF Symbol fonts can extract as private-use glyphs without a usable Unicode
// mapping. Removing those glyphs cannot recover formula order or subscripts.
export function hasUnreadableQuestionText(text: string) {
  return /[\uE000-\uF8FF\uFFFD\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]|[\u{F0000}-\u{FFFFD}\u{100000}-\u{10FFFD}]/u.test(text);
}

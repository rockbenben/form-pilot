export const SENSITIVE_PATTERNS: RegExp[] = [
  /id.?card/i,
  /身份证/,
  /bank.?card/i,     // covers bankcard, bank-card, bank_card, bankCard
  /银行卡/,
  /captcha/i,
  /verify.?code/i,
  /验证码/,
  /password/i,
  /密码/,
  /\bpin\b/i,
];

export const MAX_FIELD_SIZE = 50 * 1024;    // single field value limit
export const MAX_TOTAL_SIZE = 500 * 1024;   // whole-page snapshot limit

/**
 * Returns true if the label/name/placeholder/aria-label text matches any
 * sensitive pattern. Empty/whitespace input returns false.
 */
export function isSensitiveLabel(text: string): boolean {
  if (!text || !text.trim()) return false;
  return SENSITIVE_PATTERNS.some((re) => re.test(text));
}

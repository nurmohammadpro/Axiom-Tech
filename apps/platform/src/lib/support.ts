/** Public support contact, shown to shop owners. Set SUPPORT_PHONE / SUPPORT_EMAIL. */
export function supportContact(): string | null {
  const phone = process.env.SUPPORT_PHONE?.trim();
  const email = process.env.SUPPORT_EMAIL?.trim();
  const parts = [phone, email].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

/** Prefix a bare amount after "off … above" with ₹. Display only; the saved offer stays as typed. */
export function displayOffer(text: string): string {
  return text.replace(/\b(off\b[^.\n]{0,40}?\babove)\s+(?!₹|Rs\.?\s*)(\d+(?:\.\d+)?)\b/gi, "$1 ₹$2");
}

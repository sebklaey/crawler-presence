/** Length-independent comparison for shared secrets and API keys. */
export function timingSafeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  let diff = left.length ^ right.length;
  for (let i = 0; i < left.length; i += 1) diff |= (left[i] ?? 0) ^ (right[i % right.length] ?? 0);
  return diff === 0;
}

/**
 * Encryption at rest for Crawler Love.
 *
 * Love data uses its OWN key, separate from the room subject secret and from
 * the Sugar ledger key. The stored hash is only an integrity check — a plain
 * hash is never used for similarity, that is what the feature vector is for.
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function env(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : undefined;
}

/** Dedicated Love key. Falls back to a domain-separated derivation. */
function loveKeyMaterial(): string {
  return (
    env("CRAWLER_LOVE_ENCRYPTION_KEY") ??
    env("LOVE_ENCRYPTION_KEY") ??
    `crawler-love|${env("SUBJECT_HASH_SECRET") ?? env("SUPABASE_SERVICE_ROLE_KEY") ?? "dev-fallback"}`
  );
}

let cachedKey: Promise<CryptoKey> | null = null;
let cachedFor: string | null = null;

async function aesKey(): Promise<CryptoKey> {
  const material = loveKeyMaterial();
  if (!cachedKey || cachedFor !== material) {
    cachedFor = material;
    cachedKey = (async () => {
      const digest = await crypto.subtle.digest("SHA-256", encoder.encode(material));
      return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
    })();
  }
  return cachedKey;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

/** AES-256-GCM, random IV per value, base64 "v1.iv.ciphertext". */
export async function encryptValue(plain: unknown): Promise<string> {
  const key = await aesKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = encoder.encode(JSON.stringify(plain ?? null));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data as BufferSource);
  return `v1.${toBase64(iv)}.${toBase64(new Uint8Array(cipher))}`;
}

export async function decryptValue<T = unknown>(stored: string | null | undefined): Promise<T | null> {
  if (!stored || typeof stored !== "string") return null;
  const parts = stored.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return null;
  try {
    const key = await aesKey();
    const iv = fromBase64(parts[1]!);
    const cipher = fromBase64(parts[2]!);
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv as BufferSource },
      key,
      cipher as BufferSource,
    );
    return JSON.parse(decoder.decode(plain)) as T;
  } catch {
    return null;
  }
}

/** Integrity only — never a similarity measure. */
export async function integrityHash(value: unknown): Promise<string> {
  const canonical = JSON.stringify(value, Object.keys(value as object).sort());
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(canonical));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

import { createDecipheriv } from "node:crypto";

/** Decrypts values produced by the platform's encryptSecret (AES-256-GCM, `v1.iv.tag.data`). */
export function decryptSecret(token: string): string {
  const raw = process.env.SECRETS_KEY;
  if (!raw) throw new Error("SECRETS_KEY is required in multi-tenant mode");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("SECRETS_KEY must decode to exactly 32 bytes");
  const [v, iv, tag, data] = token.split(".");
  if (v !== "v1" || !iv || !tag || !data) throw new Error("Malformed secret");
  const d = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(data, "base64url")), d.final()]).toString("utf8");
}

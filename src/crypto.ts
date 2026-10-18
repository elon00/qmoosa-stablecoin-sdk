import crypto from "node:crypto";
import { AdminActionType, SignedAdminIntent } from "./types.js";

export function generateKeyPair(): { publicKey: string; privateKey: string } {
  return crypto.generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" }
  });
}

export function canonicalize(obj: any): any {
  if (obj === null || typeof obj !== "object") {
    return typeof obj === "bigint" ? obj.toString() : obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(canonicalize);
  }
  const sortedKeys = Object.keys(obj).sort();
  const result: Record<string, any> = {};
  for (const key of sortedKeys) {
    result[key] = canonicalize(obj[key]);
  }
  return result;
}

export function computeParamsHash(params: Record<string, any>): string {
  const canonical = JSON.stringify(canonicalize(params));
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

export function computeChallenge(
  action: AdminActionType,
  paramsHash: string,
  nonce: number,
  deadline: number,
  domain: string
): string {
  return `ACTION:${action}|PARAMS:${paramsHash}|NONCE:${nonce}|DEADLINE:${deadline}|DOMAIN:${domain}`;
}

export function signAdminIntent(
  action: AdminActionType,
  params: Record<string, any>,
  nonce: number,
  deadline: number,
  domain: string,
  privateKeyPem: string
): SignedAdminIntent {
  const paramsHash = computeParamsHash(params);
  const challenge = computeChallenge(action, paramsHash, nonce, deadline, domain);
  const signature = crypto.sign(null, Buffer.from(challenge), privateKeyPem).toString("hex");

  return {
    action,
    params,
    nonce,
    deadline,
    domain,
    signature
  };
}

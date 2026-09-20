/* ============================================================
   Madinty Ratan — كلمات السر والتوكنات
   ------------------------------------------------------------
   Cloudflare Workers مافيهاش خدمة تسجيل دخول جاهزة زي Supabase،
   فالحتة دي مكتوبة بـ WebCrypto الموجود أصلًا في الـruntime.

   كلمة السر بتتشفّر على مرحلتين:
     1) في متصفح الأدمن   — PBKDF2 بـ 300 ألف دورة (شوف sb.js)
     2) هنا على السيرفر    — PBKDF2 بـ 5 آلاف دورة بملح عشوائي

   ليه التقسيمة دي؟ لأن Cloudflare بتحدّد وقت المعالجة للطلب الواحد
   (10 ملي ثانية في الباقة المجانية)، والتشفير التقيل كله على
   السيرفر كان هيتخطّاها. المرحلتين مع بعض = 305 ألف دورة، يعني
   حماية أقوى مما كنا هنقدر عليه على السيرفر لوحده، ومن غير تكلفة.

   ⚠️ CLIENT_ITERATIONS هنا لازم يساوي MR_KDF_ITERATIONS في
      assets/js/sb.js — لو اتغيّر واحد من غير التاني، الدخول هيقع.
   ============================================================ */

const enc = new TextEncoder();

export const CLIENT_ITERATIONS = 300000; /* للتوثيق — بتتنفّذ في المتصفح */
export const SERVER_ITERATIONS = 5000;

/* ---------- base64url ---------- */
function toB64u(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromB64u(str) {
  const s = String(str).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(s + "=".repeat((4 - (s.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/* ---------- كلمة السر ---------- */

/**
 * @param {string} clientKey الناتج اللي جه من المتصفح (مش كلمة السر نفسها)
 * @returns {Promise<{hash:string, salt:string}>}
 */
export async function hashSecret(clientKey, saltB64u) {
  const salt = saltB64u ? fromB64u(saltB64u) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", enc.encode(String(clientKey)), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: SERVER_ITERATIONS },
    key,
    256,
  );
  return { hash: toB64u(new Uint8Array(bits)), salt: toB64u(salt) };
}

/** مقارنة بوقت ثابت — عشان ما نسرّبش معلومات من سرعة الرد */
function sameString(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifySecret(clientKey, hashB64u, saltB64u) {
  if (!hashB64u || !saltB64u) return false;
  const { hash } = await hashSecret(clientKey, saltB64u);
  return sameString(hash, hashB64u);
}

/* ---------- التوكن ---------- */

const keyCache = new Map();
async function hmacKey(secret) {
  if (!keyCache.has(secret)) {
    keyCache.set(
      secret,
      await crypto.subtle.importKey(
        "raw",
        enc.encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign", "verify"],
      ),
    );
  }
  return keyCache.get(secret);
}

/** payload = { e: الإيميل، v: نسخة التوكن، t: "a" دخول / "r" تجديد، exp: بالثواني } */
export async function signToken(payload, secret) {
  const body = toB64u(enc.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(body));
  return `${body}.${toB64u(new Uint8Array(sig))}`;
}

/** @returns {Promise<object|null>} الحمولة لو التوقيع سليم ولسه ما انتهاش */
export async function readToken(token, secret) {
  const parts = String(token || "").split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  let ok = false;
  try {
    ok = await crypto.subtle.verify(
      "HMAC",
      await hmacKey(secret),
      fromB64u(parts[1]),
      enc.encode(parts[0]),
    );
  } catch (e) {
    return null;
  }
  if (!ok) return null;
  let p;
  try {
    p = JSON.parse(new TextDecoder().decode(fromB64u(parts[0])));
  } catch (e) {
    return null;
  }
  if (!p || typeof p.exp !== "number" || p.exp * 1000 <= Date.now()) return null;
  return p;
}

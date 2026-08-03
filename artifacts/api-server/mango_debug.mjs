// Debug probe: real Mango login using creds from DB (never printed), tracing
// every step — URLs, buttons, localStorage keys, api2 network calls.
import { createRequire } from "node:module";
const requireDb = createRequire(new URL("../../lib/db/package.json", import.meta.url));
const pg = requireDb("pg");
import { createDecipheriv } from "node:crypto";
import { chromium } from "playwright-core";
import { execSync } from "node:child_process";

function decrypt(stored) {
  const key = Buffer.from(process.env.BOT_TOKEN_ENCRYPTION_KEY, "hex");
  const buf = Buffer.from(stored, "base64");
  const iv = buf.subarray(0, 12), tag = buf.subarray(12, 28), ct = buf.subarray(28);
  const d = createDecipheriv("aes-256-gcm", key, iv);
  d.setAuthTag(tag);
  return d.update(ct) + d.final("utf8");
}

const client = new pg.Client(process.env.DATABASE_URL);
await client.connect();
const { rows } = await client.query("SELECT email, password, auth_token FROM mango_credentials LIMIT 1");
await client.end();
if (!rows.length) { console.log("NO CREDENTIALS IN DB"); process.exit(1); }
const email = decrypt(rows[0].email);
const password = decrypt(rows[0].password);
console.log("creds loaded, login length:", email.length, "pw length:", password.length, "login looks like:", /^\S+@\S+$/.test(email) ? "email" : "plain-login");
console.log("cached auth_token present:", Boolean(rows[0].auth_token));

const exe = execSync("which chromium").toString().trim();
const browser = await chromium.launch({ executablePath: exe, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const apiCalls = [];
page.on("request", r => {
  const u = r.url();
  if (u.includes("mangotele") || u.includes("api2") || (u.includes("mango") && !u.includes("css") && !u.includes("js"))) {
    apiCalls.push(`${r.method()} ${u.slice(0, 120)}`);
  }
});

const dumpState = async (label) => {
  const url = page.url();
  const keys = await page.evaluate(() => {
    const o = [];
    for (let i = 0; i < localStorage.length; i++) o.push(localStorage.key(i));
    return o;
  }).catch(() => ["<unavailable>"]);
  const buttons = await page.$$eval("button", els => els.map(e => (e.textContent || "").trim()).filter(Boolean).slice(0, 12)).catch(() => []);
  const shot = `/tmp/mango_step_${label}.png`;
  await page.screenshot({ path: shot }).catch(() => {});
  console.log(`\n=== ${label} ===\nurl: ${url.slice(0, 100)}\nlocalStorage keys: ${JSON.stringify(keys)}\nbuttons: ${JSON.stringify(buttons)}`);
};

try {
  await page.goto("https://ccc.mango-office.ru/", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector('input[type="password"]', { timeout: 30000 });
  await dumpState("1_login_page");

  await page.fill('input[type="text"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');

  // Poll for up to 90s: url, tokens, or a "Начать" button to click.
  for (let i = 1; i <= 30; i++) {
    await page.waitForTimeout(3000);
    const url = page.url();
    const tokens = await page.evaluate(() => ({
      auth: localStorage.getItem("auth_token"), refresh: localStorage.getItem("refresh_token"),
    })).catch(() => null);
    console.log(`[${i * 3}s] ${url.slice(0, 80)} auth_token: ${tokens?.auth ? "YES" : "no"}`);
    if (tokens?.auth) { console.log("TOKENS FOUND"); break; }
    if (url.startsWith("https://ccc.mango-office.ru")) {
      const clicked = await page.evaluate(() => {
        const btn = [...document.querySelectorAll("button")].find(b => /начать/i.test(b.textContent || ""));
        if (btn) { btn.click(); return true; }
        return false;
      }).catch(() => false);
      if (clicked) console.log("clicked 'Начать'");
    }
    if (i === 10) await dumpState("2_after_30s");
  }
  await dumpState("3_final");
  console.log("\nAPI calls observed:");
  for (const c of [...new Set(apiCalls)]) console.log("  " + c);
} finally {
  await browser.close();
}

// Part C proof: prints the real table-QR standee dialog to PDF, rasterizes the PDF
// and decodes the QR from the rendered pixels. Needs a running stack (backend + web)
// and, installed ad hoc (not project deps): puppeteer-core, a Chromium, jsqr, pngjs,
// plus `pdftoppm` (poppler) on PATH.
//   WEB=http://localhost:1995 OUT=./out CHROME=/path/to/chrome node e2e/qr_standee_render.mjs
// Exit code 0 only when the decoded value is exactly the expected table URL.
import fs from "node:fs";
import { execSync } from "node:child_process";
import puppeteer from "puppeteer-core";
import jsQR from "jsqr";
import { PNG } from "pngjs";

const WEB = process.env.WEB ?? "http://localhost:1995";
const OUT = process.env.OUT ?? "./qr-out";
const EMAIL = process.env.EMAIL ?? "owner@demo.local";
const PASSWORD = process.env.PASSWORD ?? "Password123!";
fs.mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME,
  args: ["--no-sandbox"],
  headless: "shell",
  defaultViewport: { width: 1366, height: 900 },
});
const page = await browser.newPage();
await page.goto(`${WEB}/login`, { waitUntil: "networkidle2" });
await page.type("form input:not([type=password]):not([type=checkbox])", EMAIL);
await page.type("input[type=password]", PASSWORD);
await Promise.all([page.waitForNavigation({ waitUntil: "networkidle2" }).catch(() => {}), page.keyboard.press("Enter")]);
await page.goto(`${WEB}/tables`, { waitUntil: "networkidle2" });
await new Promise((r) => setTimeout(r, 1500));
await page.evaluate(() => {
  [...document.querySelectorAll("button")].find((b) => (b.getAttribute("title") ?? "").includes("View Table QR")).click();
});
await page.waitForSelector("#qr-print-root img", { timeout: 15000 });
await new Promise((r) => setTimeout(r, 1500));

// The URL the dialog shows under the card is the exact value encoded in the QR.
const expected = await page.evaluate(() => document.querySelector("p.font-mono").textContent.trim());
if (!/\/order\/[0-9a-f]{32}/.test(expected)) throw new Error(`unexpected order URL: ${expected}`);

await page.pdf({ path: `${OUT}/standee.pdf`, preferCSSPageSize: true });
execSync(`pdftoppm -r 220 -png ${OUT}/standee.pdf ${OUT}/standee`);
const png = PNG.sync.read(fs.readFileSync(`${OUT}/standee-1.png`));
const found = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
await browser.close();

if (!found) {
  console.error("FAIL: no QR code found in the rendered PDF");
  process.exit(1);
}
if (found.data !== expected) {
  console.error(`FAIL: decoded ${found.data}\n   expected ${expected}`);
  process.exit(1);
}
console.log(`PASS: PDF render decodes to ${found.data}`);

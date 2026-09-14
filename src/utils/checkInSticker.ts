import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';
import sharp from 'sharp';
import { logger } from '../config/logger';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_NAME = 'Fitzenix Check In Template.png';

/** Measured on 1024×1536 template — white QR card ≈ 208–813 × 526–1089. */
const QR_SIZE = 510;
const QR_X = Math.round((208 + 813) / 2 - QR_SIZE / 2); // 256
const QR_Y = Math.round((526 + 1089) / 2 - QR_SIZE / 2); // 553

/** Pre-printed "OWNER" + dots — remove letter pixels only (keep V gradient). */
const ERASE_TOP = 1110;
const ERASE_BOT = 1268;
const ERASE_LEFT = 280;
const ERASE_RIGHT = 744;
const SAMPLE_X = 140;

export interface CheckInQrPayload {
  t: 'fitzenix.checkin';
  g: string;
  v: 1;
}

export function buildCheckInQrPayload(gymId: string): CheckInQrPayload {
  return { t: 'fitzenix.checkin', g: gymId, v: 1 };
}

export function encodeCheckInQr(gymId: string): string {
  return JSON.stringify(buildCheckInQrPayload(gymId));
}

/** Resolve template across tsx (src) and prod (dist) layouts. */
export function resolveCheckInTemplatePath(): string | null {
  const candidates = [
    path.resolve(__dirname, 'assets', TEMPLATE_NAME),
    path.resolve(process.cwd(), 'src/utils/assets', TEMPLATE_NAME),
    path.resolve(process.cwd(), 'dist/utils/assets', TEMPLATE_NAME),
    path.resolve(process.cwd(), 'assets', TEMPLATE_NAME),
    path.resolve(process.cwd(), 'Backend/src/utils/assets', TEMPLATE_NAME),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {
      // ignore
    }
  }
  return null;
}

export const CHECK_IN_TEMPLATE_PATH = resolveCheckInTemplatePath() ?? path.resolve(__dirname, 'assets', TEMPLATE_NAME);

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function truncate(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

/** True for baked-in OWNER (red) / dots (gray-red) ink — not the V background. */
function isPrintedInk(r: number, g: number, b: number): boolean {
  const isOwnerRed = r > 140 && g < 110 && b < 110 && r - Math.max(g, b) > 60;
  const isDot = Math.abs(r - g) < 25 && Math.abs(g - b) < 25 && r >= 70 && r <= 210;
  return isOwnerRed || isDot;
}

/**
 * Remove baked-in OWNER / dots by replacing ink pixels with the same row's
 * background (sampled outside the text column). Preserves the red→black V.
 */
async function erasePrintedLabels(templatePath: string): Promise<Buffer> {
  const { data, info } = await sharp(templatePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  const out = Buffer.from(data);

  for (let y = ERASE_TOP; y < ERASE_BOT && y < height; y++) {
    const sampleOff = (y * width + SAMPLE_X) * channels;
    for (let x = ERASE_LEFT; x < ERASE_RIGHT && x < width; x++) {
      const off = (y * width + x) * channels;
      const r = out[off];
      const g = out[off + 1];
      const b = out[off + 2];
      if (!isPrintedInk(r, g, b)) continue;
      out[off] = out[sampleOff];
      out[off + 1] = out[sampleOff + 1];
      out[off + 2] = out[sampleOff + 2];
      out[off + 3] = out[sampleOff + 3];
    }
  }

  return sharp(out, { raw: { width, height, channels } }).png().toBuffer();
}

async function buildQrLayer(gymId: string): Promise<Buffer> {
  const qrData = encodeCheckInQr(gymId);
  const qrPng = await QRCode.toBuffer(qrData, {
    type: 'png',
    width: QR_SIZE,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: '#000000', light: '#FFFFFF' },
  });
  return sharp(qrPng).resize(QR_SIZE, QR_SIZE, { fit: 'fill' }).png().toBuffer();
}

function footerTextSvg(opts: { ownerName: string; gymName: string; branchLabel?: string }): Buffer {
  const ownerName = truncate(opts.ownerName.toUpperCase(), 28);
  const gymName = truncate(opts.gymName.toUpperCase(), 28);
  const branch = truncate((opts.branchLabel || '').toUpperCase(), 32);

  return Buffer.from(`
<svg width="1024" height="1536" xmlns="http://www.w3.org/2000/svg">
  <text x="512" y="1210" text-anchor="middle"
        font-family="Arial, Helvetica, sans-serif"
        font-size="36" font-weight="800" fill="#FFFFFF">${escapeXml(ownerName)}</text>

  <text x="512" y="1238" text-anchor="middle"
        font-family="Arial, Helvetica, sans-serif"
        font-size="20" font-weight="700" fill="#D90429">OWNER</text>

  <circle cx="484" cy="1266" r="3.5" fill="#71717A"/>
  <circle cx="512" cy="1266" r="3.5" fill="#D90429"/>
  <circle cx="540" cy="1266" r="3.5" fill="#71717A"/>

  <text x="512" y="1322" text-anchor="middle"
        font-family="Arial, Helvetica, sans-serif"
        font-size="28" font-weight="800" fill="#D90429">${escapeXml(gymName)}</text>

  ${
    branch
      ? `<text x="512" y="1354" text-anchor="middle"
        font-family="Arial, Helvetica, sans-serif"
        font-size="16" font-weight="600" fill="#FFFFFF">${escapeXml(branch)}</text>`
      : ''
  }
</svg>`);
}

/**
 * Fallback when the branded template PNG is missing on the host (common on
 * Render when `dist/` is built without copying `src/utils/assets`).
 */
async function renderFallbackSticker(opts: {
  gymId: string;
  ownerName: string;
  gymName: string;
  branchLabel?: string;
}): Promise<Buffer> {
  const W = 1024;
  const H = 1536;
  const qrLayer = await buildQrLayer(opts.gymId);
  const ownerName = truncate(opts.ownerName.toUpperCase(), 28);
  const gymName = truncate(opts.gymName.toUpperCase(), 28);
  const branch = truncate((opts.branchLabel || '').toUpperCase(), 32);

  const chrome = Buffer.from(`
<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#1A1A1A"/>
      <stop offset="55%" stop-color="#0B0B0B"/>
      <stop offset="100%" stop-color="#000000"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <text x="512" y="160" text-anchor="middle"
        font-family="Arial, Helvetica, sans-serif"
        font-size="42" font-weight="800" fill="#D90429">FITZENIX</text>
  <text x="512" y="210" text-anchor="middle"
        font-family="Arial, Helvetica, sans-serif"
        font-size="22" font-weight="600" fill="#A1A1AA">SCAN TO CHECK IN</text>
  <rect x="${QR_X - 24}" y="${QR_Y - 24}" width="${QR_SIZE + 48}" height="${QR_SIZE + 48}"
        rx="24" fill="#FFFFFF"/>
  <text x="512" y="1210" text-anchor="middle"
        font-family="Arial, Helvetica, sans-serif"
        font-size="36" font-weight="800" fill="#FFFFFF">${escapeXml(ownerName)}</text>
  <text x="512" y="1238" text-anchor="middle"
        font-family="Arial, Helvetica, sans-serif"
        font-size="20" font-weight="700" fill="#D90429">OWNER</text>
  <circle cx="484" cy="1266" r="3.5" fill="#71717A"/>
  <circle cx="512" cy="1266" r="3.5" fill="#D90429"/>
  <circle cx="540" cy="1266" r="3.5" fill="#71717A"/>
  <text x="512" y="1322" text-anchor="middle"
        font-family="Arial, Helvetica, sans-serif"
        font-size="28" font-weight="800" fill="#D90429">${escapeXml(gymName)}</text>
  ${
    branch
      ? `<text x="512" y="1354" text-anchor="middle"
        font-family="Arial, Helvetica, sans-serif"
        font-size="16" font-weight="600" fill="#FFFFFF">${escapeXml(branch)}</text>`
      : ''
  }
</svg>`);

  const base = await sharp(chrome).png().toBuffer();
  return sharp(base)
    .composite([{ input: qrLayer, left: QR_X, top: QR_Y }])
    .png()
    .toBuffer();
}

async function renderWithTemplate(
  templatePath: string,
  opts: { gymId: string; ownerName: string; gymName: string; branchLabel?: string },
): Promise<Buffer> {
  const qrLayer = await buildQrLayer(opts.gymId);
  const textSvg = footerTextSvg(opts);
  const cleaned = await erasePrintedLabels(templatePath);

  return sharp(cleaned)
    .composite([
      { input: qrLayer, left: QR_X, top: QR_Y },
      { input: textSvg, left: 0, top: 0 },
    ])
    .png()
    .toBuffer();
}

/**
 * Renders the Fitzenix check-in sticker PNG.
 * Uses the branded template when available; otherwise a safe fallback so live
 * never returns 500 just because assets were not copied into `dist/`.
 */
export async function renderCheckInSticker(opts: {
  gymId: string;
  ownerName: string;
  gymName: string;
  branchLabel?: string;
}): Promise<Buffer> {
  const templatePath = resolveCheckInTemplatePath();

  if (templatePath) {
    try {
      return await renderWithTemplate(templatePath, opts);
    } catch (err) {
      logger.error({ err, templatePath }, 'check-in sticker template render failed — using fallback');
    }
  } else {
    logger.warn(
      { cwd: process.cwd(), moduleDir: __dirname },
      'check-in sticker template PNG missing — using fallback',
    );
  }

  return renderFallbackSticker(opts);
}

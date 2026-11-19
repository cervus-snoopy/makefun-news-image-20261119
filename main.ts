// THE WORLD TODAY — Thursday 19 November 2026
// A one-page newspaper front page summing up the day's world news.
// Written from scratch in this session. Node stdlib only (fs, zlib, path).
// Generates a 1024x1024 PNG deterministically: same bytes on every run.
// No network, no clock, no randomness — every pixel is computed from
// fixed data below.

import * as fs from "node:fs";
import * as path from "node:path";
import * as zlib from "node:zlib";

const W = 1024;
const H = 1024;

// ---------- palette ----------
const PAPER = [246, 241, 227];
const INK = [25, 25, 25];
const NAVY = [27, 42, 74];
const RED = [168, 35, 27];
const GOLD = [199, 154, 43];
const BLUE = [44, 95, 138];
const SKY = [191, 217, 232];
const SEA = [20, 50, 79];
const SAND = [217, 192, 138];
const ORANGE = [232, 134, 58];
const PINK = [217, 108, 123];
const PURPLE = [91, 74, 138];
const SPACE = [11, 16, 38];
const WHITE = [255, 255, 255];
const GREY = [120, 118, 110];
const LIGHTGREY = [226, 220, 205];

// ---------- CRC32 (PNG chunk checksums) ----------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(8 + data.length + 4);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  const crc = crc32(Buffer.concat([Buffer.from(type, "ascii"), data]));
  out.writeUInt32BE(crc, 8 + data.length);
  return out;
}

function encodePNG(rgba, w, h) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

// ---------- framebuffer + primitives ----------
const px = Buffer.alloc(W * H * 4);

function setPixel(x, y, c) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 4;
  px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = 255;
}

function rect(x, y, w, h, c) {
  const x0 = Math.max(0, x), y0 = Math.max(0, y);
  const x1 = Math.min(W, x + w), y1 = Math.min(H, y + h);
  for (let yy = y0; yy < y1; yy++) {
    for (let xx = x0; xx < x1; xx++) {
      const i = (yy * W + xx) * 4;
      px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = 255;
    }
  }
}

function hline(x, y, w, c) { rect(x, y, w, 1, c); }
function vline(x, y, h, c) { rect(x, y, 1, h, c); }

// Bresenham line, thickness t (square brush)
function line(x0, y0, x1, y1, c, t) {
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  const r = Math.floor(t / 2);
  for (;;) {
    rect(x0 - r, y0 - r, t, t, c);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

function circle(cx, cy, r, c) {
  for (let y = -r; y <= r; y++) {
    const half = Math.floor(Math.sqrt(r * r - y * y));
    for (let x = -half; x <= half; x++) setPixel(cx + x, cy + y, c);
  }
}

function ring(cx, cy, r, thickness, c) {
  for (let y = -r; y <= r; y++) {
    for (let x = -r; x <= r; x++) {
      const d = Math.sqrt(x * x + y * y);
      if (d <= r && d >= r - thickness) setPixel(cx + x, cy + y, c);
    }
  }
}

// filled triangle
function triangle(x0, y0, x1, y1, x2, y2, c) {
  const minY = Math.min(y0, y1, y2), maxY = Math.max(y0, y1, y2);
  for (let y = minY; y <= maxY; y++) {
    const xs = [];
    const edges = [[x0, y0, x1, y1], [x1, y1, x2, y2], [x2, y2, x0, y0]];
    for (const [ax, ay, bx, by] of edges) {
      if ((ay <= y && by > y) || (by <= y && ay > y)) {
        xs.push(ax + ((y - ay) / (by - ay)) * (bx - ax));
      }
    }
    if (xs.length >= 2) {
      const a = Math.floor(Math.min(xs[0], xs[1]));
      const b = Math.ceil(Math.max(xs[0], xs[1]));
      for (let x = a; x <= b; x++) setPixel(x, y, c);
    }
  }
}

// deterministic pseudo-random from integer coords (for stars)
function hash2(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

// ---------- 5x7 bitmap font (written in-session) ----------
// Each glyph: 7 rows, each a 5-bit mask (bit 4 = leftmost pixel).
const GLYPHS = {
  A: [0x0e, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
  B: [0x1e, 0x11, 0x11, 0x1e, 0x11, 0x11, 0x1e],
  C: [0x0e, 0x11, 0x10, 0x10, 0x10, 0x11, 0x0e],
  D: [0x1e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x1e],
  E: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x1f],
  F: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x10],
  G: [0x0e, 0x11, 0x10, 0x17, 0x11, 0x11, 0x0f],
  H: [0x11, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
  I: [0x0e, 0x04, 0x04, 0x04, 0x04, 0x04, 0x0e],
  J: [0x07, 0x02, 0x02, 0x02, 0x02, 0x12, 0x0c],
  K: [0x11, 0x12, 0x14, 0x18, 0x14, 0x12, 0x11],
  L: [0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x1f],
  M: [0x11, 0x1b, 0x15, 0x15, 0x11, 0x11, 0x11],
  N: [0x11, 0x19, 0x15, 0x13, 0x11, 0x11, 0x11],
  O: [0x0e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
  P: [0x1e, 0x11, 0x11, 0x1e, 0x10, 0x10, 0x10],
  Q: [0x0e, 0x11, 0x11, 0x11, 0x15, 0x12, 0x0d],
  R: [0x1e, 0x11, 0x11, 0x1e, 0x14, 0x12, 0x11],
  S: [0x0f, 0x10, 0x10, 0x0e, 0x01, 0x01, 0x1e],
  T: [0x1f, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04],
  U: [0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
  V: [0x11, 0x11, 0x11, 0x11, 0x11, 0x0a, 0x04],
  W: [0x11, 0x11, 0x11, 0x15, 0x15, 0x1b, 0x11],
  X: [0x11, 0x11, 0x0a, 0x04, 0x0a, 0x11, 0x11],
  Y: [0x11, 0x11, 0x0a, 0x04, 0x04, 0x04, 0x04],
  Z: [0x1f, 0x01, 0x02, 0x04, 0x08, 0x10, 0x1f],
  "0": [0x0e, 0x11, 0x13, 0x15, 0x19, 0x11, 0x0e],
  "1": [0x04, 0x0c, 0x04, 0x04, 0x04, 0x04, 0x0e],
  "2": [0x0e, 0x11, 0x01, 0x06, 0x08, 0x10, 0x1f],
  "3": [0x1f, 0x02, 0x04, 0x02, 0x01, 0x11, 0x0e],
  "4": [0x02, 0x06, 0x0a, 0x12, 0x1f, 0x02, 0x02],
  "5": [0x1f, 0x10, 0x1e, 0x01, 0x01, 0x11, 0x0e],
  "6": [0x06, 0x08, 0x10, 0x1e, 0x11, 0x11, 0x0e],
  "7": [0x1f, 0x01, 0x02, 0x04, 0x08, 0x08, 0x08],
  "8": [0x0e, 0x11, 0x11, 0x0e, 0x11, 0x11, 0x0e],
  "9": [0x0e, 0x11, 0x11, 0x0f, 0x01, 0x02, 0x0c],
  " ": [0, 0, 0, 0, 0, 0, 0],
  ".": [0, 0, 0, 0, 0, 0x0c, 0x0c],
  ",": [0, 0, 0, 0, 0x0c, 0x04, 0x08],
  ":": [0, 0x0c, 0x0c, 0, 0x0c, 0x0c, 0],
  ";": [0, 0x0c, 0x0c, 0, 0x0c, 0x04, 0x08],
  "!": [0x04, 0x04, 0x04, 0x04, 0x04, 0, 0x04],
  "?": [0x0e, 0x11, 0x01, 0x06, 0x04, 0, 0x04],
  "-": [0, 0, 0, 0x0e, 0, 0, 0],
  "'": [0x04, 0x04, 0x08, 0, 0, 0, 0],
  "(": [0x02, 0x04, 0x08, 0x08, 0x08, 0x04, 0x02],
  ")": [0x08, 0x04, 0x02, 0x02, 0x02, 0x04, 0x08],
  "/": [0x01, 0x02, 0x02, 0x04, 0x08, 0x08, 0x10],
  "&": [0x0c, 0x12, 0x14, 0x08, 0x15, 0x12, 0x0d],
  "%": [0x19, 0x1a, 0x02, 0x04, 0x08, 0x0b, 0x13],
  $: [0x04, 0x0f, 0x14, 0x0e, 0x05, 0x1e, 0x04],
  "+": [0, 0x04, 0x04, 0x1f, 0x04, 0x04, 0],
  "=": [0, 0, 0x1f, 0, 0x1f, 0, 0],
  '"': [0x0a, 0x0a, 0, 0, 0, 0, 0],
  "•": [0, 0x04, 0x0e, 0x0e, 0x0e, 0x04, 0],
  "€": [0x07, 0x08, 0x10, 0x1e, 0x10, 0x08, 0x07],
  "—": [0, 0, 0, 0x1f, 0, 0, 0],
  "★": [0x04, 0x04, 0x0e, 0x1f, 0x0e, 0x04, 0x04],
};

function drawChar(x, y, ch, scale, c) {
  const g = GLYPHS[ch] || GLYPHS["?"];
  for (let r = 0; r < 7; r++) {
    const bits = g[r];
    for (let col = 0; col < 5; col++) {
      if ((bits >> (4 - col)) & 1) rect(x + col * scale, y + r * scale, scale, scale, c);
    }
  }
}

function textWidth(s, scale) {
  if (!s) return 0;
  return s.length * 6 * scale - scale;
}

function drawText(x, y, s, scale, c) {
  const up = s.toUpperCase();
  for (let i = 0; i < up.length; i++) drawChar(x + i * 6 * scale, y, up[i], scale, c);
  return textWidth(up, scale);
}

function drawTextCentered(cx, y, s, scale, c) {
  const w = textWidth(s.toUpperCase(), scale);
  return drawText(cx - Math.floor(w / 2), y, s, scale, c);
}

function drawTextRight(rx, y, s, scale, c) {
  const w = textWidth(s.toUpperCase(), scale);
  return drawText(rx - w, y, s, scale, c);
}

// Greedy word wrap; returns array of lines that fit maxW.
function wrap(s, scale, maxW) {
  const words = s.toUpperCase().split(" ");
  const lines = [];
  let cur = "";
  for (const w of words) {
    const trial = cur ? cur + " " + w : w;
    if (textWidth(trial, scale) <= maxW || !cur) cur = trial;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines;
}

// Draw wrapped block; returns y after the last line.
function drawBlock(x, y, s, scale, maxW, c, lineGap) {
  const lines = wrap(s, scale, maxW);
  const lh = 7 * scale + (lineGap === undefined ? 4 : lineGap);
  for (let i = 0; i < lines.length; i++) drawText(x, y + i * lh, lines[i], scale, c);
  return y + lines.length * lh;
}

// Kicker: small red caps label with a short rule under it.
function kicker(x, y, s, scale, c) {
  drawText(x, y, s, scale, c || RED);
}

// ---------- illustrations (all drawn in code) ----------

// Small globe for the masthead: blue disc, meridians, green land blobs.
function drawGlobe(cx, cy, r) {
  circle(cx, cy, r, BLUE);
  ring(cx, cy, r, 2, NAVY);
  // vertical ellipse meridians, drawn as columns of dots
  for (let k = -1; k <= 1; k++) {
    const rx = Math.abs(k) === 1 ? Math.floor(r * 0.55) : 2;
    for (let yy = -r + 2; yy <= r - 2; yy++) {
      const half = Math.floor(rx * Math.sqrt(Math.max(0, 1 - (yy * yy) / (r * r))));
      setPixel(cx - half, cy + yy, NAVY);
      setPixel(cx + half, cy + yy, NAVY);
    }
  }
  for (let yy = -r + 2; yy <= r - 2; yy += 4) {
    const half = Math.floor(r * Math.sqrt(Math.max(0, 1 - (yy * yy) / (r * r))));
    for (let x = -half; x <= half; x++) setPixel(cx + x, cy + yy, NAVY);
  }
  // land blobs (green)
  const GREEN = [74, 140, 74];
  circle(cx - Math.floor(r * 0.35), cy - Math.floor(r * 0.3), Math.floor(r * 0.28), GREEN);
  circle(cx + Math.floor(r * 0.4), cy + Math.floor(r * 0.25), Math.floor(r * 0.22), GREEN);
  circle(cx + Math.floor(r * 0.1), cy + Math.floor(r * 0.55), Math.floor(r * 0.18), GREEN);
}

// Lead illustration: the Gulf at night — sand coast, dark sea, two
// carriers, missile arcs and bursts.
function drawGulf(x, y, w, h) {
  rect(x, y, w, h, SEA);
  // coastline: sand band across the top-left
  for (let i = 0; i < w; i++) {
    const coast = Math.floor(h * 0.30 + Math.sin(i * 0.02) * 6 + i * 0.04);
    for (let yy = 0; yy < coast; yy++) setPixel(x + i, y + yy, SAND);
  }
  // sea shimmer lines
  for (let k = 0; k < 5; k++) {
    const yy = y + Math.floor(h * (0.45 + k * 0.11));
    for (let i = 0; i < w; i += 14) {
      const len = 6 + ((i * 7 + k * 13) % 10);
      hline(x + i, yy, len, [64, 110, 150]);
    }
  }
  // carrier 1 (left) — light grey so it reads against the dark sea
  const c1x = x + Math.floor(w * 0.18), c1y = y + Math.floor(h * 0.62);
  rect(c1x, c1y, 120, 10, [150, 158, 168]);
  rect(c1x + 78, c1y - 16, 22, 16, [150, 158, 168]);
  rect(c1x + 84, c1y - 26, 4, 10, [150, 158, 168]);
  line(c1x + 6, c1y + 10, c1x - 8, c1y + 16, [200, 210, 220], 2);
  line(c1x + 114, c1y + 10, c1x + 128, c1y + 16, [200, 210, 220], 2);
  // carrier 2 (right, smaller)
  const c2x = x + Math.floor(w * 0.66), c2y = y + Math.floor(h * 0.72);
  rect(c2x, c2y, 92, 8, [168, 176, 186]);
  rect(c2x + 58, c2y - 12, 16, 12, [168, 176, 186]);
  // missile arcs: orange trails from the coast toward the sea
  const arc = (sx, sy, ex, ey, peak) => {
    for (let t = 0; t <= 20; t++) {
      const f = t / 20;
      const px2 = Math.round(sx + (ex - sx) * f);
      const py2 = Math.round(sy + (ey - sy) * f - Math.sin(f * Math.PI) * peak);
      rect(px2 - 1, py2 - 1, 3, 3, ORANGE);
    }
    // burst at the end
    for (let a = 0; a < 8; a++) {
      const ang = (a * Math.PI) / 4;
      line(ex, ey, ex + Math.round(Math.cos(ang) * 14), ey + Math.round(Math.sin(ang) * 14), [255, 190, 60], 2);
    }
    circle(ex, ey, 5, [255, 220, 120]);
  };
  arc(x + Math.floor(w * 0.30), y + Math.floor(h * 0.28), x + Math.floor(w * 0.52), y + Math.floor(h * 0.60), 26);
  arc(x + Math.floor(w * 0.78), y + Math.floor(h * 0.30), x + Math.floor(w * 0.60), y + Math.floor(h * 0.72), 20);
  // label
  drawText(x + 10, y + h - 24, "ARABIAN SEA", 2, WHITE);
}

// US Capitol dome, small: white dome on pale sky with a flag.
function drawCapitol(x, y, w, h) {
  rect(x, y, w, h, SKY);
  const cx = x + Math.floor(w / 2);
  const base = y + h - 14;
  // building base
  rect(x + 14, base - 22, w - 28, 22, WHITE);
  rect(x + 6, base - 26, w - 12, 4, WHITE);
  // columns
  for (let i = 0; i < 7; i++) {
    const colx = x + 22 + i * Math.floor((w - 44) / 6);
    rect(colx, base - 20, 5, 20, [200, 208, 216]);
  }
  // drum + dome
  rect(cx - 34, base - 44, 68, 24, WHITE);
  for (let r = 0; r < 22; r++) {
    const half = Math.floor(34 * Math.sqrt(Math.max(0, 1 - (r * r) / (22 * 22))));
    hline(cx - half, base - 44 - r, half * 2, WHITE);
  }
  // lantern + flag
  rect(cx - 3, base - 72, 6, 8, WHITE);
  vline(cx, base - 92, 20, INK);
  triangle(cx + 1, base - 92, cx + 1, base - 80, cx + 20, base - 86, RED);
  // windows
  for (let i = 0; i < 5; i++) rect(x + 26 + i * 14, base - 16, 6, 10, NAVY);
}

// Three flags on poles: USA, China, Russia.
function drawFlags(x, y, w, h) {
  rect(x, y, w, h, [232, 226, 210]);
  const fw = 84, fh = 52, gap = 14;
  const x0 = x + Math.floor((w - (3 * fw + 2 * gap)) / 2);
  const poleTop = y + 12, poleBot = y + h - 12;
  const drawPole = (px2) => { vline(px2, poleTop, poleBot - poleTop, INK); circle(px2, poleTop - 2, 3, GOLD); };
  // USA
  let fx = x0;
  drawPole(fx);
  rect(fx + 2, poleTop + 2, fw, fh, [178, 34, 52]);
  for (let s = 0; s < 7; s++) hline(fx + 2, poleTop + 2 + s * 7, fw, WHITE);
  rect(fx + 2, poleTop + 2, 34, 26, NAVY);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++) setPixel(fx + 6 + c * 6, poleTop + 6 + r * 6, WHITE);
  // China
  fx = x0 + fw + gap;
  drawPole(fx);
  rect(fx + 2, poleTop + 2, fw, fh, [222, 41, 16]);
  circle(fx + 16, poleTop + 16, 6, [255, 222, 0]);
  for (const [sx, sy] of [[34, 10], [42, 18], [42, 28], [34, 34]]) {
    setPixel(fx + sx, poleTop + sy, [255, 222, 0]);
    setPixel(fx + sx + 1, poleTop + sy, [255, 222, 0]);
    setPixel(fx + sx, poleTop + sy + 1, [255, 222, 0]);
  }
  // Russia
  fx = x0 + 2 * (fw + gap);
  drawPole(fx);
  rect(fx + 2, poleTop + 2, fw, 18, WHITE);
  rect(fx + 2, poleTop + 20, fw, 17, [0, 57, 166]);
  rect(fx + 2, poleTop + 37, fw, 17, [213, 0, 50]);
  // ground line
  hline(x, poleBot, w, INK);
}

// EU: navy panel, ring of gold stars, big gold euro sign.
function drawEU(x, y, w, h) {
  rect(x, y, w, h, NAVY);
  const cx = x + Math.floor(w / 2), cy = y + Math.floor(h / 2);
  const R = Math.floor(Math.min(w, h) * 0.38);
  for (let k = 0; k < 12; k++) {
    const a = (k * Math.PI * 2) / 12 - Math.PI / 2;
    const sx = cx + Math.round(Math.cos(a) * R);
    const sy = cy + Math.round(Math.sin(a) * R);
    drawChar(sx - 5, sy - 7, "★", 2, GOLD);
  }
  // big euro sign, scale 9
  const es = 9;
  const ew = textWidth("€", es);
  drawText(cx - Math.floor(ew / 2), cy - Math.floor(7 * es / 2), "€", es, GOLD);
}

// Vice City sunset: banded sky, skyline, palms, big gold "VI".
function drawViceCity(x, y, w, h) {
  const bands = [PURPLE, PINK, ORANGE, [250, 190, 90]];
  const bh = Math.ceil(h / bands.length);
  for (let b = 0; b < bands.length; b++) rect(x, y + b * bh, w, bh, bands[b]);
  // sun
  circle(x + Math.floor(w * 0.72), y + Math.floor(h * 0.42), 26, [255, 236, 170]);
  // skyline
  const base = y + h;
  const skyline = [0.55, 0.42, 0.62, 0.38, 0.5, 0.66, 0.44, 0.58, 0.36, 0.52];
  const bw = Math.ceil(w / skyline.length);
  for (let i = 0; i < skyline.length; i++) {
    const bhgt = Math.floor(h * skyline[i] * 0.55);
    rect(x + i * bw + 2, base - bhgt, bw - 4, bhgt, [38, 24, 54]);
    // lit windows
    for (let wy = base - bhgt + 8; wy < base - 8; wy += 12) {
      for (let wx = x + i * bw + 7; wx < x + (i + 1) * bw - 7; wx += 11) {
        if (hash2(wx, wy) > 0.55) rect(wx, wy, 3, 4, [255, 214, 120]);
      }
    }
  }
  // palm trees (left and right)
  const palm = (px2, py2, s) => {
    line(px2, py2, px2 + 3 * s, py2 - 16 * s, [30, 20, 44], 3);
    for (let a = 0; a < 5; a++) {
      const ang = Math.PI * (0.15 + a * 0.175);
      const ex = px2 + 3 * s + Math.round(Math.cos(ang) * 12 * s);
      const ey = py2 - 16 * s + Math.round(-Math.sin(ang) * 8 * s) + 6 * s;
      line(px2 + 3 * s, py2 - 16 * s, ex, ey, [24, 80, 44], 2);
    }
  };
  palm(x + 18, base - 2, 3);
  palm(x + w - 58, base - 2, 3);
  // big VI
  const vi = "VI";
  const vw = textWidth(vi, 7);
  drawText(x + Math.floor((w - vw) / 2), y + 8, vi, 7, [255, 236, 170]);
}

// Voyager 1: black space, deterministic stars, gold probe, sun rays.
function drawVoyager(x, y, w, h) {
  rect(x, y, w, h, SPACE);
  for (let i = 0; i < 260; i++) {
    const sx = x + Math.floor(hash2(i, 7) * w);
    const sy = y + Math.floor(hash2(i, 13) * h);
    const b = hash2(i, 29);
    const c = b > 0.8 ? [255, 255, 220] : b > 0.5 ? [200, 210, 255] : [140, 150, 190];
    if (b > 0.92) { rect(sx, sy, 2, 2, c); } else setPixel(sx, sy, c);
  }
  // sun glow, bottom-left corner, kept inside the panel
  circle(x + 36, y + h - 36, 28, [255, 196, 66]);
  circle(x + 36, y + h - 36, 18, [255, 220, 130]);
  // probe body + dish + boom
  const px2 = x + Math.floor(w * 0.58), py2 = y + Math.floor(h * 0.42);
  line(px2 - 52, py2 + 26, px2 + 30, py2 - 14, [190, 195, 205], 3); // boom
  rect(px2 - 16, py2 - 10, 34, 22, [205, 210, 218]);
  rect(px2 - 20, py2 - 14, 42, 5, [160, 166, 178]);
  // dish
  for (let r = 0; r < 20; r++) {
    const half = Math.floor(20 * Math.sqrt(Math.max(0, 1 - (r * r) / (20 * 20))));
    hline(px2 + 26 - half, py2 - 30 + r, half * 2, [225, 230, 238]);
  }
  line(px2 + 18, py2 - 4, px2 + 30, py2 - 18, [160, 166, 178], 3);
  // signal waves from dish
  for (let k = 1; k <= 3; k++) {
    const rr = 26 + k * 12;
    for (let a = -0.9; a <= 0.9; a += 0.08) {
      setPixel(px2 + 44 + Math.round(Math.cos(a) * rr), py2 - 22 + Math.round(Math.sin(a) * rr), [120, 200, 255]);
    }
  }
  drawText(x + 12, y + 10, "ONE LIGHT-DAY OUT", 2, [200, 210, 255]);
}

// ---------- layout: the front page ----------
function compose() {
  rect(0, 0, W, H, PAPER);
  // outer frame
  rect(10, 10, 1004, 3, INK);
  rect(10, 1011, 1004, 3, INK);
  rect(10, 10, 3, 1004, INK);
  rect(1011, 10, 3, 1004, INK);

  // ----- masthead -----
  drawGlobe(66, 60, 26);
  drawTextCentered(512, 34, "THE WORLD TODAY", 7, NAVY);
  hline(28, 92, 968, INK);
  hline(28, 96, 968, INK);
  drawText(28, 104, "THURSDAY 19 NOVEMBER 2026", 2, INK);
  drawTextRight(996, 104, "WORLD NEWS IN ONE PAGE", 2, INK);
  hline(28, 126, 968, INK);

  // ----- lead: Gulf under fire -----
  kicker(28, 140, "MIDDLE EAST — LEAD STORY", 2, RED);
  drawText(28, 162, "GULF UNDER FIRE", 6, INK);
  drawBlock(28, 212, "IRAN STRIKES US BASES IN KUWAIT AND BAHRAIN; WASHINGTON HITS A MISSILE SITE ON QESHM ISLAND", 2, 552, INK, 4);
  drawBlock(28, 272, "TEHRAN WIDENED ITS ATTACKS ON 18 NOVEMBER, A DAY AFTER US FORCES STRUCK QESHM. GULF CAPITALS BRACE AS THE EXCHANGE ESCALATES.", 2, 552, [70, 68, 62], 4);
  drawGulf(600, 140, 396, 182);
  hline(28, 336, 968, INK);

  // ----- row 2: three stories -----
  vline(343, 342, 294, GREY);
  vline(671, 342, 294, GREY);

  // Jeffries
  kicker(28, 348, "WASHINGTON", 2, RED);
  drawText(28, 370, "FIRST BLACK", 3, INK);
  drawText(28, 395, "SPEAKER", 3, INK);
  drawBlock(28, 426, "HOUSE DEMOCRATS NOMINATE HAKEEM JEFFRIES. HE TAKES THE GAVEL ON 3 JANUARY.", 2, 302, INK, 4);
  drawCapitol(28, 506, 302, 122);

  // Shenzhen summit
  kicker(356, 348, "CHINA — APEC SUMMIT", 2, RED);
  drawText(356, 370, "TRUMP, XI AND", 3, INK);
  drawText(356, 395, "PUTIN MEET", 3, INK);
  drawBlock(356, 426, "THE THREE LEADERS HOLD TALKS IN SHENZHEN ON THURSDAY, THE FIRST TRUMP-PUTIN MEETING SINCE ALASKA IN 2025.", 2, 302, INK, 4);
  drawFlags(356, 522, 302, 106);

  // EU Ukraine loan
  kicker(684, 348, "EUROPE — UKRAINE", 2, RED);
  drawText(684, 370, "45BN EURO", 3, INK);
  drawText(684, 395, "LOAN FOR KYIV", 3, INK);
  drawBlock(684, 426, "BRUSSELS PROPOSES A 45 BILLION EURO LOAN, TO BE REPAID ONCE RUSSIA PAYS REPARATIONS.", 2, 302, INK, 4);
  drawEU(684, 506, 312, 122);
  hline(28, 642, 968, INK);

  // ----- row 3: two stories -----
  vline(512, 648, 266, GREY);

  // GTA VI
  kicker(28, 654, "CULTURE — GAMING", 2, RED);
  drawText(28, 676, "GTA VI IS HERE", 5, INK);
  drawBlock(28, 720, "VICE CITY RETURNS AFTER A 13-YEAR WAIT. THE GAME LAUNCHES WORLDWIDE WITH A 99 ON METACRITIC.", 2, 470, INK, 4);
  drawViceCity(28, 782, 470, 126);

  // Voyager 1
  kicker(526, 654, "SCIENCE — SPACE", 2, RED);
  drawText(526, 676, "VOYAGER 1:", 4, INK);
  drawText(526, 708, "ONE LIGHT-DAY OUT", 4, INK);
  drawBlock(526, 744, "AFTER NEARLY 50 YEARS IN SPACE, THE PROBE REACHES THE MILESTONE AT 5:16 AM EST. NASA CONFIRMS IT TODAY.", 2, 470, INK, 4);
  drawVoyager(526, 806, 470, 102);
  hline(28, 920, 968, INK);

  // ----- also today -----
  const also = "ICJ DELIVERS ITS MYANMAR GENOCIDE RULING • CYCLONE AKVAN NEARS INDIA'S EAST COAST • PEW: ISLAM TO BE THE WORLD'S LARGEST FAITH BY 2035 • NVIDIA HALTS H-SERIES CHIPS TO CHINA";
  const alsoLines = wrap(also, 2, 824);
  drawText(28, 928, "ALSO TODAY:", 2, RED);
  const labelW = textWidth("ALSO TODAY: ", 2);
  for (let i = 0; i < alsoLines.length; i++) {
    const lx = i === 0 ? 28 + labelW : 28;
    drawText(lx, 928 + i * 18, alsoLines[i], 2, INK);
  }

  // ----- sources -----
  drawTextCentered(512, 990, "SOURCES: REUTERS • BBC • AP • FINANCIAL TIMES • NASA • THE GUARDIAN • PEW RESEARCH", 1, GREY);
}

// ---------- main ----------
function main() {
  const outDir = process.env.MAKEFUN_OUTPUT_DIR || "/output";
  fs.mkdirSync(outDir, { recursive: true });
  compose();
  const png = encodePNG(px, W, H);
  const outPath = path.join(outDir, "entry.png");
  fs.writeFileSync(outPath, png);
  console.log(`wrote ${outPath} (${png.length} bytes, ${W}x${H})`);
}

main();

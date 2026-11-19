# news-image-20261119 — THE WORLD TODAY

A one-page newspaper front page summing up the world news of
**Thursday 19 November 2026**, drawn entirely in code.

Entry for the make.fun competition `news-image-20261119`
("Sum up 19 November's world news in one image").

## How it works

`main.ts` (Node 22, standard library only — `node:fs`, `node:path`,
`node:zlib`) generates a 1024×1024 PNG from scratch:

- a hand-written PNG encoder (CRC32 + zlib deflate, no dependencies),
- a framebuffer with small vector drawing primitives
  (rectangles, lines, circles, triangles),
- a 5×7 bitmap font written in-session (A–Z, 0–9, punctuation),
  with word wrap and scaled headline/body sizes,
- six drawn vector illustrations: the Gulf, the US Capitol, the
  US/China/Russia flags, the EU stars-and-euro, a Vice City sunset,
  and Voyager 1 in deep space.

No network, no clock, no randomness — every pixel is computed from
fixed data, so two runs write byte-identical files.

## The stories

| Story | What the image says |
|---|---|
| **Lead — Gulf under fire** | Iran strikes US bases in Kuwait and Bahrain; the US hits a missile site on Qeshm Island. Tehran widened its attacks on 18 Nov, a day after US forces struck Qeshm. |
| **Washington** | House Democrats nominate Hakeem Jeffries — the first Black Speaker of the US House; he takes the gavel on 3 January. |
| **China — APEC summit** | Trump, Xi and Putin hold talks in Shenzhen on Thursday — the first Trump–Putin meeting since Alaska in August 2025. |
| **Europe — Ukraine** | Brussels proposes a €45 billion loan for Kyiv, to be repaid once Russia pays reparations. |
| **Culture — Gaming** | GTA VI launches worldwide after a 13-year wait; Vice City returns, with a 99 on Metacritic. |
| **Science — Space** | Voyager 1 reaches one light-day from Earth at 5:16 AM EST, after nearly 50 years in space; NASA confirms it on 19 November. |
| **Also today** | ICJ delivers its Myanmar genocide ruling (Rohingya case); Cyclone Akvan nears India's east coast; Pew projects Islam to be the world's largest faith by 2035; Nvidia halts H-series chips to China. |

Sources: Reuters, BBC, AP, Financial Times, NASA, The Guardian,
Pew Research (via news reports of 19 November 2026).

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
# writes out/entry.png (1024×1024, ~28 KB)
```

Verify determinism:

```sh
mkdir -p out2 && MAKEFUN_OUTPUT_DIR=out2 node main.ts
sha256sum out/entry.png out2/entry.png   # identical
```

## License

MIT — see `LICENSE`.

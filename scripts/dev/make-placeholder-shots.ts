/**
 * 仮の画像素材を作る。**本番の素材ではない。**
 *
 *   npx tsx scripts/dev/make-placeholder-shots.ts
 *
 * 画像の切り替えが効いているかを確認するための置き石。
 * 実際には public/shots/ に**実スクリーンショット**か生成画像を置く。
 * 何を置くかは題材で決める（AIツール紹介なら現物の画面が一番強い）。
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { encodePng, type Image } from "../lib/png.ts";
import { PALETTES } from "../../src/design/tokens.ts";
import { PUBLIC_DIR } from "../lib/paths.ts";

const WIDTH = 1080;
const HEIGHT = 1350;

const hex = (color: string): [number, number, number] => [
  parseInt(color.slice(1, 3), 16),
  parseInt(color.slice(3, 5), 16),
  parseInt(color.slice(5, 7), 16),
];

/** 斜めのグラデーションに細いグリッドを重ねただけの絵 */
const makeShot = (bg: string, accent: string, gridStep: number): Image => {
  const [br, bg2, bb] = hex(bg);
  const [ar, ag, ab] = hex(accent);
  const pixels = new Uint8Array(WIDTH * HEIGHT * 4);

  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const t = (x / WIDTH) * 0.5 + (y / HEIGHT) * 0.5;
      const onGrid = x % gridStep === 0 || y % gridStep === 0;
      const mix = onGrid ? 0.22 : t * 0.14;
      const o = (y * WIDTH + x) * 4;
      pixels[o] = Math.round(br + (ar - br) * mix);
      pixels[o + 1] = Math.round(bg2 + (ag - bg2) * mix);
      pixels[o + 2] = Math.round(bb + (ab - bb) * mix);
      pixels[o + 3] = 255;
    }
  }
  return { width: WIDTH, height: HEIGHT, pixels };
};

const main = (): void => {
  const dir = join(PUBLIC_DIR, "shots");
  mkdirSync(dir, { recursive: true });

  const steps = [90, 60, 135, 45, 110, 72];
  for (const [i, step] of steps.entries()) {
    const palette = PALETTES[i % PALETTES.length];
    if (!palette) {
      continue;
    }
    const name = `placeholder-${i + 1}.png`;
    writeFileSync(join(dir, name), encodePng(makeShot(palette.bgAlt, palette.accent, step)));
    console.log(`[shots] public/shots/${name}`);
  }
  console.log("実素材に差し替えること（public/shots/README.md）");
};

main();

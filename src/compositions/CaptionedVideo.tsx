/**
 * CaptionedVideo — 手持ちの動画にテロップを焼く（モードB）。
 *
 * 入力は動画そのものと `content/telops/<slug>.json`（音声認識の結果を人間が
 * 直したもの）。**尺・画面サイズ・fps は元動画の実測から来る。**
 * このファイルに数値を書かない。
 *
 * モードA（NewsDigest）と共有しているのは SubtitleBox とデザイントークンだけ。
 * 音声は元動画のものをそのまま使う（OffthreadVideo が鳴らす）。
 */
import { AbsoluteFill, OffthreadVideo, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import type { Platform } from "../../config/pipeline.ts";
import { SubtitleBox } from "../components/SubtitleBox.tsx";
import { SAFE_AREA, scaleSafeArea } from "../design/safe-area.ts";
import { PALETTES, scaleSpacing, scaleTypography, TYPOGRAPHY, VIDEO } from "../design/tokens.ts";
import { telopAt } from "../lib/telop.ts";
import type { TelopFile } from "../schema/telop.ts";

export type CaptionedVideoProps = {
  slug: string;
  platform: Platform;
  /** calculateMetadata が public/props/telop-<slug>.json から埋める */
  telop?: TelopFile;
};

/** テロップの見た目は1種で固定する。手持ちの動画に色を当てても喧しいだけ */
const PALETTE = PALETTES[0] as (typeof PALETTES)[number];

export const CaptionedVideo: React.FC<CaptionedVideoProps> = ({ slug, platform, telop }) => {
  if (!telop) {
    throw new Error(
      `props に telop が無い。先に認識を回す: npm run caption:asr -- --video <動画の絶対パス>（slug=${slug}）`,
    );
  }
  const { fps, height } = useVideoConfig();
  const frame = useCurrentFrame();
  const nowMs = (frame / fps) * 1000;

  // 1080x1920 基準の数値を、実際の画面の高さに合わせる
  const scale = height / VIDEO.height;
  const type = scaleTypography(TYPOGRAPHY[telop.locale], scale);
  const spacing = scaleSpacing(scale);
  const safeArea = scaleSafeArea(SAFE_AREA[platform], scale);

  const chunk = telopAt(telop.chunks, nowMs);

  return (
    <AbsoluteFill>
      <OffthreadVideo src={staticFile(`source/${slug}.mp4`)} />
      <AbsoluteFill
        style={{
          justifyContent: "flex-end",
          alignItems: "center",
          paddingLeft: safeArea.left,
          paddingRight: safeArea.right,
          paddingBottom: safeArea.bottom,
        }}
      >
        {chunk ? (
          <SubtitleBox
            text={chunk.text}
            type={type}
            palette={PALETTE}
            spacing={spacing}
            locale={telop.locale}
          />
        ) : null}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

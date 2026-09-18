/**
 * 画像。**2枚以上なら字幕のチャンク境界で切り替わる。**
 *
 * 文字だけのテンプレは100本使い回すと飽きる（毎日のニュースなら特に）。
 * 切り替えの時刻は音声の実測値から来るので、絵が喋りの区切りで変わる。
 *
 * 切り替えは**ハードカット**。クロスフェードを入れると切り替わりが
 * 曖昧になって「動いている」感じが薄れる（フックにフェードを入れないのと同じ理由）。
 */
import { Img, Sequence, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { FONT_FAMILY, SPACING } from "../../design/tokens.ts";
import { toDurationFrames, toFrames } from "../../lib/frames.ts";
import { shotBoundaries, shotSpans } from "../../lib/shots.ts";
import { useShort } from "../short-context.tsx";

/** ゆっくり寄る。止まった絵に見えないように */
const ZOOM = 0.05;

const Shot: React.FC<{ src: string; fit: "cover" | "contain"; durationSec: number }> = ({
  src,
  fit,
  durationSec,
}) => {
  const { fps } = useVideoConfig();
  const frame = useCurrentFrame();
  const progress = Math.min(1, frame / Math.max(1, durationSec * fps));

  return (
    <Img
      src={staticFile(`shots/${src}`)}
      style={{
        width: "100%",
        height: "100%",
        objectFit: fit,
        transform: `scale(${1 + ZOOM * progress})`,
      }}
    />
  );
};

export const ImageVisual: React.FC<{
  shots: string[];
  fit: "cover" | "contain";
  lead?: string;
  /** 1始まり。このセクションの区間から字幕の時刻を引くために使う */
  sectionIndex: number;
}> = ({ shots, fit, lead, sectionIndex }) => {
  const { timeline, palette, type } = useShort();
  const { fps } = useVideoConfig();

  const timing = timeline.sections[sectionIndex - 1];
  if (!timing) {
    throw new Error(`セクション${sectionIndex} の区間が timeline に無い`);
  }

  // このセクションに入っている字幕の開始時刻（セクション先頭からの相対秒）
  const captionStartsSec = timeline.captions
    .map((c) => c.startMs / 1000)
    .filter((sec) => sec >= timing.startSec && sec < timing.startSec + timing.durationSec)
    .map((sec) => sec - timing.startSec);

  const spans = shotSpans(
    shotBoundaries({ captionStartsSec, durationSec: timing.durationSec, shotCount: shots.length }),
    timing.durationSec,
  );

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        gap: SPACING.gutter / 3,
      }}
    >
      <div
        style={{
          position: "relative",
          flex: 1,
          minHeight: 0,
          width: "100%",
          overflow: "hidden",
          borderRadius: SPACING.radius / 2,
          background: palette.bgAlt,
        }}
      >
        {spans.map((span, i) => {
          const src = shots[i];
          if (!src) {
            return null;
          }
          return (
            <Sequence
              key={`${src}-${i}`}
              from={toFrames(span.startSec, fps)}
              durationInFrames={toDurationFrames(span.durationSec, fps)}
              layout="none"
            >
              <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
                <Shot src={src} fit={fit} durationSec={span.durationSec} />
              </div>
            </Sequence>
          );
        })}

        {/* 切り替わりの位置を示す細い目盛り。何枚目かが分かると進行感が出る */}
        {shots.length > 1 ? (
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              display: "flex",
              gap: 4,
              padding: 8,
            }}
          >
            {spans.map((span, i) => (
              <Sequence
                key={`tick-${i}`}
                from={toFrames(span.startSec, fps)}
                durationInFrames={toDurationFrames(span.durationSec, fps)}
                layout="none"
              >
                <div
                  style={{
                    position: "absolute",
                    left: `${(i / shots.length) * 100}%`,
                    width: `${(1 / shots.length) * 100}%`,
                    bottom: 8,
                    height: SPACING.borderWidth / 2,
                    background: palette.accent,
                  }}
                />
              </Sequence>
            ))}
          </div>
        ) : null}
      </div>

      {lead === undefined ? null : (
        <div
          style={{
            fontFamily: FONT_FAMILY,
            fontWeight: 900,
            fontSize: type.leadSize * 0.72,
            lineHeight: 1.25,
            letterSpacing: type.letterSpacing,
            color: palette.fg,
            wordBreak: type.wordBreak,
            lineBreak: type.lineBreak,
            whiteSpace: "pre-line",
          }}
        >
          {lead}
        </div>
      )}
    </div>
  );
};

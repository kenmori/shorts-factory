/**
 * NewsDigest — 3トピックのニュースダイジェスト。縦 1080x1920 / 70秒前後。
 *
 * 構造（plan.md 3.5節をそのまま形にしたもの）:
 *   0秒          フック。全画面テキスト。**フェードインなし・ナレーションなし**
 *   〜           セクション。境界は重ねて切れ目をなくす。進捗を常時表示
 *   最終セクション hook の回収（payoffSection）
 *   アウトロ      hook のデザインに寄せてループさせる
 *
 * 尺・字幕・音声の配置はすべて timeline（= 音声合成の生成物）から来る。
 * このファイルに秒数を書かない。
 */
import { AbsoluteFill, Audio, Sequence, staticFile, useVideoConfig } from "remotion";
import { config } from "../../config/pipeline.ts";
import { Background } from "../components/Background.tsx";
import { Hook } from "../components/Hook.tsx";
import { Outro } from "../components/Outro.tsx";
import { SectionCard } from "../components/SectionCard.tsx";
import { Subtitle } from "../components/Subtitle.tsx";
import { ShortProvider, useShort } from "../components/short-context.tsx";
import { SPACING } from "../design/tokens.ts";
import { toDurationFrames, toFrames } from "../lib/frames.ts";
import type { VideoProps } from "../Root.tsx";

/** 字幕はセクションをまたぐので独立したレイヤーにする */
const SubtitleLayer: React.FC = () => {
  const { safeArea } = useShort();
  return (
    <AbsoluteFill
      style={{
        justifyContent: "flex-end",
        alignItems: "center",
        paddingLeft: safeArea.left,
        paddingRight: safeArea.right,
        // 進捗バーの上に置く
        paddingBottom: safeArea.bottom + SPACING.blockGap,
      }}
    >
      <Subtitle />
    </AbsoluteFill>
  );
};

const AudioTracks: React.FC = () => {
  const { timeline } = useShort();
  const { fps } = useVideoConfig();
  return (
    <>
      {timeline.audio.map((segment) => (
        <Sequence
          key={`${segment.src}-${segment.startSec}`}
          from={toFrames(segment.startSec, fps)}
          durationInFrames={toDurationFrames(segment.durationSec, fps)}
          layout="none"
        >
          <Audio src={staticFile(segment.src)} />
        </Sequence>
      ))}
      <Audio src={staticFile(timeline.bgmSrc)} volume={config.bgmVolume} loop />
    </>
  );
};

const Body: React.FC = () => {
  const { script, timeline } = useShort();
  const { fps } = useVideoConfig();
  const overlapFrames = toFrames(config.sectionOverlapSec, fps);

  return (
    // lang は必須。Chromium の word-break: auto-phrase は言語が分からないと効かず、
    // 日本語が文字単位で折り返されて意味の切れ目で割れなくなる
    <AbsoluteFill lang={script.locale}>
      <Background />

      <Sequence
        from={0}
        durationInFrames={toDurationFrames(timeline.hook.durationSec, fps)}
        layout="none"
      >
        <Hook />
      </Sequence>

      {timeline.sections.map((timing, i) => {
        const section = script.sections[i];
        if (!section) {
          throw new Error(`timeline のセクション数（${timeline.sections.length}）が台本と合わない`);
        }
        // 2本目以降は前のセクションに食い込ませる。離脱は境界で起きる
        const enter = i === 0 ? 0 : overlapFrames;
        return (
          <Sequence
            key={section.heading}
            from={toFrames(timing.startSec, fps) - enter}
            durationInFrames={toDurationFrames(timing.durationSec, fps) + enter}
            layout="none"
          >
            <SectionCard index={i + 1} section={section} enterFrames={enter} />
          </Sequence>
        );
      })}

      <Sequence
        from={toFrames(timeline.outro.startSec, fps) - overlapFrames}
        durationInFrames={toDurationFrames(timeline.outro.durationSec, fps) + overlapFrames}
        layout="none"
      >
        <Outro />
      </Sequence>

      <SubtitleLayer />
      <AudioTracks />
    </AbsoluteFill>
  );
};

export const NewsDigest: React.FC<VideoProps> = ({ script, timeline, platform }) => {
  if (!script || !timeline) {
    throw new Error(
      "props に script / timeline が無い。calculateMetadata が public/props/<id>.json を読めていない",
    );
  }
  if (script.format !== "news-digest") {
    throw new Error(
      `format=${script.format} は NewsDigest では描けない（ToolDemo / CodeDiff は plan.md M5）`,
    );
  }
  return (
    <ShortProvider script={script} timeline={timeline} platform={platform}>
      <Body />
    </ShortProvider>
  );
};

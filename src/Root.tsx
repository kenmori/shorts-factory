/**
 * コンポジションの登録。
 *
 * セーフエリアが媒体ごとに違うので、**同一マスターを媒体別に3回レンダーする。**
 * 台本とタイムラインは `public/props/<id>.json` から calculateMetadata で読む
 * （バンドル側で fs を触らないための形）。
 */
import { Composition, staticFile } from "remotion";
import { config, type Platform } from "../config/pipeline.ts";
import { CaptionedVideo, type CaptionedVideoProps } from "./compositions/CaptionedVideo.tsx";
import { NewsDigest } from "./compositions/NewsDigest.tsx";
import { ensureFonts } from "./design/fonts.ts";
import { VIDEO } from "./design/tokens.ts";
import { scriptSchema, type Script } from "./schema/script.ts";
import { telopFileSchema, type TelopFile } from "./schema/telop.ts";
import { timelineSchema, type Timeline } from "./schema/timeline.ts";
import { DEFAULT_TOPIC_ID } from "./studio.ts";
import { toDurationFrames } from "./lib/frames.ts";

ensureFonts();

export type VideoProps = {
  topicId: string;
  platform: Platform;
  /** calculateMetadata が public/props/<id>.json から埋める */
  script?: Script;
  timeline?: Timeline;
};

const loadProps = async (
  topicId: string,
): Promise<{ script: Script; timeline: Timeline }> => {
  const url = staticFile(`props/${topicId}.json`);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `public/props/${topicId}.json が無い（${res.status}）。` +
        `先に音声合成を回す: npm run today / npm run synthesize -- --topic ${topicId}`,
    );
  }
  const raw = (await res.json()) as { script: unknown; timeline: unknown };
  return {
    script: scriptSchema.parse(raw.script),
    timeline: timelineSchema.parse(raw.timeline),
  };
};

const loadTelop = async (slug: string): Promise<TelopFile> => {
  const url = staticFile(`props/telop-${slug}.json`);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `public/props/telop-${slug}.json が無い（${res.status}）。` +
        "先に認識を回す: npm run caption:asr -- --video <動画の絶対パス>",
    );
  }
  const raw = (await res.json()) as { telop: unknown };
  return telopFileSchema.parse(raw.telop);
};

export const RemotionRoot: React.FC = () => (
  <>
    {config.platforms.map((platform) => (
      <Composition
        key={platform}
        id={`NewsDigest-${platform}`}
        component={NewsDigest}
        width={VIDEO.width}
        height={VIDEO.height}
        fps={config.fps}
        durationInFrames={toDurationFrames(config.durationRangeSec[1], config.fps)}
        defaultProps={{ topicId: DEFAULT_TOPIC_ID, platform } satisfies VideoProps}
        calculateMetadata={async ({ props }) => {
          const { script, timeline } = await loadProps(props.topicId);
          return {
            durationInFrames: toDurationFrames(timeline.totalDurationSec, timeline.fps),
            fps: timeline.fps,
            props: { ...props, script, timeline },
          };
        }}
      />
    ))}

    {/*
      モードB（手持ちの動画にテロップを付ける）。
      画面サイズ・fps・尺は元動画の実測値を telop ファイル経由で受ける。
      ここの width/height/fps は calculateMetadata が上書きするまでの仮値。
    */}
    <Composition
      id="CaptionedVideo"
      component={CaptionedVideo}
      width={VIDEO.width}
      height={VIDEO.height}
      fps={config.fps}
      durationInFrames={config.fps}
      defaultProps={
        { slug: "", platform: config.platforms[0] as Platform } satisfies CaptionedVideoProps
      }
      calculateMetadata={async ({ props }) => {
        const telop = await loadTelop(props.slug);
        return {
          durationInFrames: toDurationFrames(telop.videoDurationSec, telop.fps),
          fps: telop.fps,
          width: telop.width,
          height: telop.height,
          props: { ...props, telop },
        };
      }}
    />
  </>
);

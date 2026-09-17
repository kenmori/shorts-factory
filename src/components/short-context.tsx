/**
 * 台本・タイムライン・媒体ごとの値をまとめて配る。
 * コンポーネントに数値を書かないため（数値は design/tokens.ts と safe-area.ts だけ）。
 */
import { createContext, useContext, type ReactNode } from "react";
import type { Platform } from "../../config/pipeline.ts";
import { SAFE_AREA, type SafeArea } from "../design/safe-area.ts";
import { deriveVariant, type Variant } from "../design/variants.ts";
import { TYPOGRAPHY, type Palette, type Typography } from "../design/tokens.ts";
import type { Script } from "../schema/script.ts";
import type { Timeline } from "../schema/timeline.ts";

export type ShortContextValue = {
  script: Script;
  timeline: Timeline;
  platform: Platform;
  palette: Palette;
  type: Typography;
  safeArea: SafeArea;
  variant: Variant;
};

const ShortContext = createContext<ShortContextValue | null>(null);

export const ShortProvider: React.FC<{
  script: Script;
  timeline: Timeline;
  platform: Platform;
  children: ReactNode;
}> = ({ script, timeline, platform, children }) => {
  const variant = deriveVariant(script.id);
  const value: ShortContextValue = {
    script,
    timeline,
    platform,
    palette: variant.palette,
    type: TYPOGRAPHY[script.locale],
    safeArea: SAFE_AREA[platform],
    variant,
  };
  return <ShortContext.Provider value={value}>{children}</ShortContext.Provider>;
};

export const useShort = (): ShortContextValue => {
  const value = useContext(ShortContext);
  if (!value) {
    throw new Error("ShortProvider の外で useShort を呼んでいる");
  }
  return value;
};

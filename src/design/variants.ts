/**
 * フォーマット疲れ対策（重複より深刻）。
 *
 * ネタが違ってもテンプレが1つなので見た目が毎回同じになる。
 * 変化軸を `id` のハッシュから**決定的に**ローテートする。ランダムは偏る。
 *
 * 「セクション順序」を軸にしない理由: `payoffSection` は最終セクションで
 * hook を回収する契約なので、内容の並びを機械的に入れ替えるとオープンループが
 * 壊れる。代わりに**レイアウト**を軸にして見た目の変化を作る。
 */
import { hash32, pickDeterministic } from "../lib/hash.ts";
import { PALETTES, type Palette } from "./tokens.ts";
import type { HookStyle } from "../schema/script.ts";

export const HOOK_STYLES: readonly HookStyle[] = ["question", "number", "negation"];

/** セクションカードの組み方 */
export type SectionLayout = "stack" | "split" | "band";
export const SECTION_LAYOUTS: readonly SectionLayout[] = ["stack", "split", "band"];

export type Variant = {
  hookStyle: HookStyle;
  palette: Palette;
  layout: SectionLayout;
  /** lint（3本連続の検出）と published.json の記録に使う */
  key: string;
};

export const deriveVariant = (id: string): Variant => {
  const hookStyle = pickDeterministic(HOOK_STYLES, id, "hookStyle");
  const palette = pickDeterministic(PALETTES, id, "palette");
  const layout = pickDeterministic(SECTION_LAYOUTS, id, "layout");
  return {
    hookStyle,
    palette,
    layout,
    key: `${hookStyle}/${palette.id}/${layout}`,
  };
};

/** 台本の hookStyle は省略可。書いてある場合は導出値と一致していること（lint で確認） */
export const deriveHookStyle = (id: string): HookStyle =>
  pickDeterministic(HOOK_STYLES, id, "hookStyle");

/** デバッグ用。id を変えたときに軸がどう動くか見る */
export const variantSeed = (id: string): number => hash32(id);

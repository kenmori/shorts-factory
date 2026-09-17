/** 秒 → フレーム。丸めを1箇所に集める（ズレの原因を散らさない） */
export const toFrames = (sec: number, fps: number): number => Math.round(sec * fps);

/** 少なくとも1フレームは確保する。Sequence の durationInFrames が 0 だと消える */
export const toDurationFrames = (sec: number, fps: number): number =>
  Math.max(1, Math.round(sec * fps));

/** 0→1 の進捗。範囲外はクランプ */
export const progressAt = (frame: number, from: number, to: number): number => {
  if (to <= from) {
    return 1;
  }
  return Math.min(1, Math.max(0, (frame - from) / (to - from)));
};

import { config, type TtsEngineId } from "../../config/pipeline.ts";
import { elevenlabsEngine } from "./elevenlabs.ts";
import { mockEngine } from "./mock.ts";
import type { TtsEngine } from "./types.ts";
import { voicevoxEngine } from "./voicevox.ts";

const ENGINES: Record<TtsEngineId, TtsEngine> = {
  voicevox: voicevoxEngine,
  elevenlabs: elevenlabsEngine,
  mock: mockEngine,
};

export const getEngine = (id: TtsEngineId = config.tts): TtsEngine => {
  const engine = ENGINES[id];
  if (!engine) {
    throw new Error(`知らない TTS エンジン: ${id}`);
  }
  return engine;
};

export type { CacheFn, SynthSegment, TtsEngine, Utterance } from "./types.ts";

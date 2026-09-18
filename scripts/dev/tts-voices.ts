/**
 * VOICEVOX の話者一覧を出す。
 *
 *   npm run tts:voices
 *
 * `config/pipeline.ts` の `voicevox.speakerName` / `styleName` に
 * **ここに出た名前をそのまま書く。** 番号は書かない（ENGINE から引く）。
 *
 * 採用するキャラの利用規約とクレジット表記も確認する（キャラごとに違う）。
 */
import { config } from "../../config/pipeline.ts";
import { log, runMain } from "../lib/log.ts";
import { fetchSpeakers, pickStyleId } from "../tts/voicevox.ts";

const main = async (): Promise<void> => {
  const vv = config.voicevox;
  log.step(`話者一覧（${vv.endpoint}）`);
  const speakers = await fetchSpeakers();

  for (const speaker of speakers) {
    const selected = speaker.name === vv.speakerName ? "  <-- config で選択中" : "";
    console.log(`  ${speaker.name}${selected}`);
    for (const style of speaker.styles) {
      console.log(`      ${style.name}（id=${style.id}）`);
    }
  }

  log.blank();
  // 選択中の話者が実際に解決できるかをここで確かめる
  const id = pickStyleId(speakers, vv.speakerName, vv.styleName);
  log.ok(`config の指定は解決できる: ${vv.speakerName} / ${vv.styleName ?? "ノーマル"}（id=${id}）`);
  log.info(`投稿テキストに入るクレジット: ${vv.credit}`);
  log.warn("クレジットの文言はキャラごとの規約で確認する（config の voicevox.credit）");
};

void runMain(main);

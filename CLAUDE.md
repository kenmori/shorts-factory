# CLAUDE.md

このリポジトリで作業するときの常設ルール。仕様は [plan.md](./plan.md)、運用手順は [README.md](./README.md)。

## 環境

- Node **22 以上**、パッケージマネージャは **npm**（`package-lock.json` を使う）
- TypeScript strict。`npm run typecheck` が通らないものはコミットしない
- 依存を足す前に確認する。**Remotion のバンドルサイズとレンダー時間に直接効く**

## コマンド

| コマンド | 何をするか |
|---|---|
| `npm run today` | 日次。ネタ選択 → プロンプト束 → 検証 → 音声 → 3媒体レンダー → 投稿前ゲート |
| `npm run dev` | Remotion Studio。**テンプレ修正の大半はここで終わる** |
| `npm run still -- --topic <id> --at 1.5` | 静止画1枚。フックの検証はこれで回す |
| `npm run render -- --topic <id> [--section N] [--platform tiktok]` | レンダー（部分レンダー可） |
| `npm run synthesize -- --topic <id> [--offline]` | 音声合成と字幕だけ |
| `npm run tts:probe [-- --text "原稿"]` | TTS の返り値を目で見る。**ENGINE を繋いだら1回やる** |
| `npm run tts:voices` | 話者とスタイルの一覧。config に書くのは**名前**（番号ではない） |
| `npm run script:prepare -- --topic <id>` | 一次ソース取得 → `.work/<id>/` |
| `npm run script:verify -- --topic <id>` | zod + lint + dedupe |
| `npm run publish -- --topic <id>` | 投稿テキスト生成 |
| `npm run publish-check -- --topic <id>` | 投稿前ゲート |
| `npm run snapshot[:check] -- --topic <id>` | 固定フレームのスナップショット |
| `npm run record -- --topic <id>` | **投稿した後**に叩く。dedupe の記録 |
| `npm run typecheck` / `npm run test` | 型 / ユニットテスト |

## 守ること

### 台本

- 台本JSONは必ず `src/schema/script.ts` の zod スキーマを通す。
  **スキーマを勝手に緩めない。** 通らないなら台本を直す
- `durationSec` を手打ちしない。音声長から逆算される（書いても無視される）
- 台本を手で直したら、**その修正方針を `prompts/script.md` に反映する**。
  manual フェーズはプロンプト開発期間

### プロンプトと LLM

- **プロンプトは `prompts/script.md` にのみ置く。TypeScript の文字列に埋めない。**
  manual / api 両経路で同一のファイルを共有することが切替の前提条件
- **LLM を呼ぶコードは `scripts/script-generate.ts` の中だけに置く。**
  他の工程（投稿テキスト生成を含む）から呼ばない
- 投稿テキストは台本から機械的に組む（`scripts/publish.ts`）。生成させない

### テンプレ

- テンプレの数値（色・フォントサイズ・マージン）は `src/design/tokens.ts` と
  `src/design/safe-area.ts` からのみ参照する。**コンポーネント内にハードコードしない**
- **セーフエリアの数値を推測で書かない。** 実機確認した値だけを
  `safe-area.ts` に入れ、`verified: true` にする
- 秒数をテンプレに書かない。尺は `content/timeline/<id>.json`（生成物）から来る
- フォントは `public/fonts/` のローカルファイルを読む。
  **Google Fonts を `@import` しない**（オフラインで落ちる以前に、
  失敗時に代替フォントで無言にレンダーされるのが最悪）
- `src/` を触ったら `npm run snapshot -- --topic <id>` の差分を確認する

### 生成物

commit しない（`.gitignore` 済み）:

```
out/  .cache/  .work/  public/audio/  public/fonts/
content/timeline/  content/captions/  content/publish/
```

git に入れるもの: **台本JSON / テンプレのコード / デザイントークン /
topics.yaml / published.json / metrics.yaml / snapshots/**

mp4 を LFS で持つ誘惑があるが、台本JSONがあれば再生成できるので不要。

### 音声

- キャッシュキーに `|` を含めない。**キーはチャンクの文面だけ。**
  字幕の割れ方を何度調整しても音声が再生成されないことがイテレーション速度の前提
- `--offline` でキャッシュミスしたら**黙って生成せずエラーで落とす**
- `tts: "mock"` は配線確認専用。投稿用の動画には使わない（publish-check が落とす）
- **話者は番号ではなく名前で指定する**（`voicevox.speakerName`）。style id は ENGINE の
  `/speakers` から引く。番号を推測で書くと別のキャラの声で無言に合成される
- 採用キャラのクレジット表記は `voicevox.credit` に置き、`publish.ts` が
  投稿テキストへ機械的に差し込む。**文言はキャラごとの規約で確認する**

## 判断が必要になったら

`plan.md` の「9. 未決事項」に該当するものは勝手に決めず、確認する。

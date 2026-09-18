# CLAUDE.md

このリポジトリで作業するときの常設ルール。仕様は [plan.md](./plan.md)、運用手順は [README.md](./README.md)。

**モードは2つある。どちらも消さない。**

- **モードA（完全自動）**: ネタ → 台本 → 音声合成 → テンプレでレンダー（`npm run today`）
- **モードB（手持ちの動画を編集）**: 動画の絶対パス → 音声認識 → テロップを焼く（`npm run caption`）

共有するのは **`src/components/SubtitleBox.tsx` / `src/design/` / `scripts/lib/render-core.ts`** だけ。
片方の都合でもう片方の工程に分岐を足さない。

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
| `npm run check:frames -- --topic <id> [--all]` | フレームの欠落（文字が1枚だけ消える事故）を機械で見る |
| `npm run open [-- --topic <id>]` | 出力フォルダを開く（省略時は最新） |
| `npm run record -- --topic <id>` | **投稿した後**に叩く。dedupe の記録 |
| `npm run caption -- --video <絶対パス>` | **モードB**。手持ちの動画にテロップを焼く（認識→レンダー→検証） |
| `npm run caption:asr -- --video <絶対パス>` | 認識だけ。`content/telops/<slug>.json` を書く |
| `npm run caption:render -- --video <絶対パス>` | テロップJSON → mp4 |
| `npm run caption:check -- --video <絶対パス>` | 区間と mp4 の検証（モードBの投稿前ゲート） |
| `npm run caption:verify -- --topic <id>` | 自前の動画を答えにして工程の精度を実測 |
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
- **画像は `public/shots/` に置き、`visual: { kind: "image", shots: [...] }` で使う。**
  切り替えの時刻は字幕のチャンク境界から自動で決まる（`src/lib/shots.ts`）。
  秒数をコンポーネントに書かない
- 字幕は画面下の独立したレイヤー。セクションの内容が下まで伸びると重なるので、
  `subtitleBandHeight()` の分を `SafeFrame` の `reserveBottom` で空ける
- **冒頭に無音の静止画期間を作らない。** ナレーションは0秒から流し、フックは
  その上に重ねる（`config.hookOverlaySec`）。lint の `opening-silence` が落とす
- フォントは `public/fonts/` のローカルファイルを読む。
  **Google Fonts を `@import` しない**（オフラインで落ちる以前に、
  失敗時に代替フォントで無言にレンダーされるのが最悪）
- `src/` を触ったら `npm run snapshot -- --topic <id>` の差分を確認する
- **フォントサイズを実測から決める処理を足したら、返り値が必ず有限になることを
  保証する**（`clampFontSize`）。NaN が `fontSize` に入るとそのフレームだけ
  文字が消えて「チカチカする」動画になる。`npm run check:frames` で検出できる

### 生成物

commit しない（`.gitignore` 済み）:

```
out/  .cache/  .work/  public/audio/  public/fonts/  public/source/
content/timeline/  content/captions/  content/publish/
```

git に入れるもの: **台本JSON / テンプレのコード / デザイントークン /
topics.yaml / published.json / metrics.yaml / snapshots/**

`content/telops/` は**生成物ではなく入力**（人間が固有名詞を直す）。git に入れる。
`public/source/` は元動画へのハードリンクなので入れない。

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

### 音ズレ

- 字幕の区間は**音声セグメントの区間そのもの**にする（別々に計算しない）。
  `caption-audio-drift` が外れを落とす
- mp4 は B フレームの並べ替えで最初のフレームの composition offset が出る。
  それを編集リスト（elst）が打ち消して初めて同期する。publish-check が
  実ファイルで確認している（崩れると全編が数フレームずれる）

### テロップ（モードB）

- **音声抽出に `extractAudio()` を使わない。** あれは再圧縮しないので mp4 の AAC が
  WAV 容器に入ったまま出る（`audioFormat=255`）。PCM として読むと 67秒が 14秒に
  見えてテロップの時刻が全部ずれる。`scripts/lib/audio-extract.ts`（同梱 ffmpeg で
  16kHz モノラル PCM に変換 → `assertPcm16` で確認）を通す
- **リサンプルを自分で書かない。** 同梱の ffmpeg がやる。折り返し対策つきの
  実装を持つ理由がない
- テロップの区間を作る処理は `src/lib/telop.ts` に置く。**純関数だけ。**
  whisper の型にも fs にも依存させない（不変条件をテストで押さえるため）
- 守る不変条件は4つ。`checkTelopChunks` が見る:
  **開始 < 終了 / 重ならない / 音声の長さの中 / 文字を落とさない**
- **認識結果の時刻（`startMs` / `endMs`）を人間が動かす運用にしない。**
  直すのは `text` だけ。時刻は音声から出ている唯一の根拠
- 認識済みのテロップがあるときに勝手に再認識しない（`--force` のときだけ）。
  **手で直した固有名詞が消えるのがいちばん困る**
- 元動画は `public/source/<slug>.mp4` に**ハードリンク**する。
  シンボリックリンクは Remotion のレンダー用サーバが 404 で弾く。
  コピーもしない（数GBを毎回写すことになる）
- 画面サイズ・fps・尺は `videoShape()`（mp4 の実測）から取る。**推測で書かない**
- 1080x1920 基準の数値は `scaleTypography` / `scaleSafeArea` で比を掛けて持っていく。
  解像度ごとに別の数値を書かない

### 工程を飛ばす判定

`needsSynthesis` / レンダーの新旧判定は、**その生成物が依存しているものを全部**
入力にする。台本の更新時刻だけを見ると取り残される（実際に2回踏んだ:
エンジンの切替、config の変更）。タイムラインの依存は
**台本・エンジン・`config/pipeline.ts`・`scripts/synthesize.ts`**。

## 判断が必要になったら

`plan.md` の「9. 未決事項」に該当するものは勝手に決めず、確認する。

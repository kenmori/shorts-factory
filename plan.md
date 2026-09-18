# shorts-factory — 実装計画

コードで縦型ショート動画を量産するパイプライン。
TikTok を主戦場に、YouTube Shorts / Instagram Reels へ同一マスターから横展開する。
リポジトリ: `kenmori/shorts-factory`（private / 個人事業）

---

## 0. Claude Code への指示

このドキュメントは仕様書。**上から順に実装しない。** マイルストーン順（M0 → M4）に実装する。

### 完了条件

`npm run today` を叩くと、その日の動画が `out/<id>/` に3媒体分そろっている。
台本が未作成なら停止して次の操作を指示する（勝手にAPIを叩かない）。

### `npm run today` の挙動

```
1. content/topics.yaml から score 最高・未使用のトピックを選ぶ
2. script:prepare を実行し .work/<id>/ にプロンプト束を生成
3. content/scripts/<id>.json が無い:
     scriptSource=manual → ここで停止し「Claude Code で /script <id> を実行」と出力
     scriptSource=api     → script:generate を実行して続行
4. script:verify（zod + lint + dedupe）
5. 音声合成（キャッシュ優先）→ 字幕生成
6. 3媒体レンダー（tiktok / shorts / reels）
7. publish テキスト生成 → publish-check
8. out/<id>/ のパスを出力
```

**冪等かつ再開可能に作る。** 同じコマンドを2回叩けば、3で止まった続きから進む。
途中で失敗しても、キャッシュが効いている工程はやり直さない。

### 実装順で守ること

- **M1 の前に lint（3.5節）を書く。** ルールを後付けするとテンプレが満たせず書き直しになる
- **M2 の最初に捨てスクリプトで TTS の返り値を実際に見る。** 本文のタイミング設計は未検証の推測
- **M4 まで LLM API を呼ぶコードを書かない。** M0〜M3 は台本を手書きする
- セーフエリアとフォントの数値を推測で埋めない。実機確認した値だけを入れる

### 判断が必要になったら

`## 9. 未決事項` に該当するものは勝手に決めず、確認する。

---

## 1. ゴールと非ゴール

### ゴール
- 1本あたりの制作時間を **10〜20分** に落とす
- 70〜90秒の動画を **週3本（月・水・金）** 安定出力
- 同一マスターから **3媒体分（TikTok / Shorts / Reels）** を1コマンドで書き出す
- 台本・テンプレ・デザイントークンをコード資産として蓄積する

### 非ゴール（意図的にやらない）
- 投稿の完全自動化。Content Posting API は審査が必要で、一括自動投稿はスパム判定リスクがある。**レンダーまで自動、投稿は手動**
- 本人の出演、実写撮影
- 汎用の動画編集UIを作ること。テンプレは自分専用でよい
- 初期段階での生成AI動画（Veo / Kling）の多用。B-roll が必要になってから検討

---

## 2. 前提と制約（設計に直接効く事実）

| 項目 | 制約 | 設計への影響 |
|---|---|---|
| 尺 | 70〜90秒に固定 | CRP の「1分以上」要件と、60〜90秒がアルゴリズム評価されやすい傾向の両方を満たす。Reels のおすすめカットオフ3分にも収まる |
| ウォーターマーク | 他媒体のロゴ入り動画は露出が抑えられる | **TikTok / IG アプリ内での保存・編集工程を一切挟まない。** Remotion のロゴなしマスターを各媒体へ直接アップ |
| セーフエリア | 媒体ごとにUIの被る位置が違う | `safeArea` を props 化し、媒体別に3回レンダー |
| BGM | 媒体ごとに楽曲ライセンス契約が異なる | TikTok の楽曲ライブラリは使わない。自前生成 or ロイヤリティフリーで3媒体統一 |
| AIGCラベル | AI生成コンテンツは表示が義務。無表示は違反対象 | 投稿チェックリストの必須項目にする |
| 同一コンテンツの量産 | 大量の複製・人間作と偽る行為は違反 | テンプレ共通化はOK、中身の独自性は担保する |
| アカウント種別 | CRP は個人アカウント前提（ビジネスアカウントは対象外とされる） | 個人（クリエイター）アカウントで運用。商用音源ライブラリは使わないのでデメリットなし |
| Remotion ライセンス | 個人・3名以下の営利組織は商用無償 | ライセンス費 0円。4名以上になったら再検討 |

---

## 3. アーキテクチャ

```
topics.yaml (ネタ)
   │
   ├─ [1] generate-script  LLM → 台本 JSON（スキーマ固定）
   │
   ├─ [2] synthesize       TTS → narration.mp3 + word timings
   │
   ├─ [3] render           Remotion → tiktok.mp4 / shorts.mp4 / reels.mp4
   │
   ├─ [4] captions         LLM → 媒体別キャプション + ハッシュタグ
   │
   └─ [5] 目視チェック → 手動投稿 → metrics.yaml に初動記録
```

### 工程ごとのネットワーク依存と課金

| 工程 | 場所 | ネットワーク | 課金 |
|---|---|---|---|
| 収集 | GitHub Actions（`build` に含まない） | 必要 | 無料 |
| 台本生成 | ローカル | 必要 | **有料（LLM）** |
| 音声合成 | ローカル | 選択（下記） | 選択 |
| 字幕生成 | ローカル | 不要 | 無料 |
| レンダー | ローカル | **不要にできる**（フォント参照に注意） | 無料 |
| 投稿テキスト | ローカル | 必要 | **有料（LLM）** |
| 投稿 | 手動 | — | — |

### キャッシュ（「コマンド一つ」の成否はここで決まる）

キャッシュがないと `npm run build` を叩くたびに課金される。
テンプレ調整フェーズでは1本を何十回もレンダーするため、課金が乗ると
確実にコマンドを使わなくなり手作業に戻る。内容アドレスでキャッシュする。

```
.cache/audio/<sha256(narration_stripped + engine + voice + model)>.mp3
.cache/script/<sha256(source_excerpts + prompt_version)>.json
```

**音声のキャッシュキーに `|` を含めない。** `|` を除去した原稿でハッシュを取る。
そうすれば字幕の割れ方を何度調整しても音声は再生成されない。

```
npm run build -- --topic <id>             # 初回。API課金あり
npm run build -- --topic <id> --offline   # キャッシュのみ。ネット不要・課金ゼロ
npm run render -- --topic <id>            # レンダーのみ
```

`--offline` でキャッシュミスしたら**黙って生成せずエラーで落とす**。
ここで勝手にAPIを叩くとオプションの意味がなくなる。

### フォントはバンドルする

Google Fonts を CSS の `@import` で読むとレンダーがネットワーク依存になる。
オフラインで落ちるだけでなく、**フェイル時に代替フォントで無言でレンダーされる**
のが最悪（字幕の行数が変わって全部作り直しになる）。

フォントファイルをリポジトリに置くか `@remotion/google-fonts` でバンドルする。

### TTS の選択（ElevenLabs / VOICEVOX）

| | ElevenLabs | VOICEVOX |
|---|---|---|
| 課金 | $6〜22/月 | 無料 |
| ネットワーク | 必要 | 不要（`localhost:50021`） |
| 声質（日本語） | **上**（v3） | キャラクター音声 |
| タイミング精度 | 文字レベル（正規化後） | **モーラレベル（構造的）** |
| 規約 | Starter以上で商用可 | 商用可だが**キャラごとに規約が異なる。クレジット表記が必要な場合あり** |
| CI | 可 | 不可（ENGINE が必要） |

**VOICEVOX は日本語では技術的に優れている。** `POST /audio_query?speaker=N&text=...`
が `accent_phrases[].moras[]` を返し、各モーラに `consonant_length` / `vowel_length` が入る。

これは `normalized_alignment` の問題を消す。ElevenLabs は正規化後の文字列に対する
配列なので「3」→「さん」の展開で原文とのインデックス対応が崩れる懸念があるが、
VOICEVOX はモーラ単位で音長が直接返るため**インデックス対応が不要**。
さらにチャンクごとに合成して結合すれば境界が構造的に確定し、
`|` から文字インデックスを逆算する処理そのものが要らなくなる（前回案より単純）。

**推奨構成**: VOICEVOX でローカル完結、LLM だけAPI。
`--offline` 時のネットワーク依存がゼロになり、課金は台本生成のみになる。
ただし使うキャラの規約を**収益化前に確認すること**。

### 台本生成経路の切り替え（manual / api）

**接合点はLLM呼び出しではなくファイル。** Claude Code は Node から呼べる関数ではない
（人間がセッションに入る工程なのでエントリポイントがない）ため、
`generate(sources) => Promise<Script>` の2実装にはならない。

契約は「検証を通った `content/scripts/<id>.json` が存在する」こと。
どう作ったかは問わない。

```
prepare  →  fulfill  →  verify
（共通）     （切替）     （共通）
```

| 工程 | 内容 | 切替 |
|---|---|---|
| prepare | 一次ソースを fetch し、プロンプト束を `.work/<id>/` へ書き出す。LLMを呼ばない | 共通 |
| fulfill | `content/scripts/<id>.json` を作る | **ここだけ** |
| verify | zod + lint + dedupe。落ちたら fulfill に戻る | 共通 |

実作業量は prepare と verify にあり fulfill は薄い。だから切替コストが小さい。

```
npm run script:prepare -- --topic X   # 共通
npm run script:generate -- --topic X  # api のみ。manual では no-op
npm run script:verify -- --topic X    # 共通
```

`build` は最初に `content/scripts/<id>.json` の存在を見る。
なければ manual モードでは**エラーで止まり**、
「`.work/X/prompt.md` を Claude Code に渡して JSON を書かせろ」と出す。
api モードなら自動生成して続行する。

```ts
// config/pipeline.ts
export const config = {
  scriptSource: "manual",   // "manual" | "api"
  tts: "voicevox",          // "voicevox" | "elevenlabs"
};
```

#### プロンプトはTypeScriptの文字列に埋めない（切替可能性の核心）

`prompts/script.md` としてファイルに置く。
manual 経路では人間と Claude Code がそれを読み、api 経路では同じファイルを送信する。
**同一のプロンプトが両方で使われる**ことが切替の前提条件。

テンプレートリテラルに埋めると manual 経路から参照できず二重管理になり、
その時点で切替は不可能になる。

キャッシュキーの `prompt_version` はこのファイルのハッシュにする。

#### Claude Code 側はスラッシュコマンドにする

`.claude/commands/script.md` を置き、`/script X` の一発にする。
中身は「`.work/X/prompt.md` と `sources/` を読んで `content/scripts/X.json` を書き、
`npm run script:verify -- --topic X` が通るまで直す」だけ。
これで manual 経路も実質1コマンドになる。

#### dedupe は manual では embedding を使わない

`angle` の類似度判定に embedding を使うとAPIが必要になり manual で成立しない。
`script:prepare` が**直近20件の `(entity, version, angle)` をプロンプト束に含める**。
Claude Code が自分で重複を判断できるので embedding は不要。

ハード判定（3つ組の完全一致）はコードで行うため両モード共通。

#### 2つの経路は同じ品質を出さない

Claude Code で対話的にやる方が確実に良い台本になる（その場で直せるため）。
後でAPIに切り替えると**品質が落ちる**。

落ち幅を小さくする唯一の方法は、manual フェーズを**プロンプト開発期間として使うこと**。
手で台本を直したら、その修正を必ず `prompts/script.md` に反映する。
「導入で製品名を先に出す」「数値は前後比較で見せる」といった気づきが資産になる。
頭の中に留めると API 切替時に全部失われる。

**manual フェーズは無料期間ではなく学習期間。**

### イテレーションループ（修正の容易さ）

フルレンダーで確認するループは1回数分かかり実用にならない。
**Remotion Studio（`npm run dev`）で詰めてから、確定後に1回レンダーする**二段構え。
Studio はタイムラインのスクラブと props エディタが使えるので修正の大半はここで終わる。

ただし Studio のプレビューは最終レンダーと同一ではない
（フォントの実測幅・音ズレ・コンポジット）。最後に1回はフルレンダーで確認する。

#### 修正コストは種類で10倍違う

| 修正内容 | 音声再生成 | 確認方法 | コスト |
|---|---|---|---|
| テロップの文字・配置 | 不要 | Studio | ほぼゼロ |
| 色・レイアウト・アニメーション | 不要 | Studio | ほぼゼロ |
| 字幕の割れ方（`\|` の位置） | **不要** | Studio | ほぼゼロ |
| セクションの順序入れ替え | 不要 | Studio | ほぼゼロ |
| **ナレーション原稿** | **必要** | 要レンダー | 課金＋待ち |
| 尺の変更 | **必要** | 要レンダー | 課金＋待ち |

境界はナレーション原稿。**作業順序が強制される: 原稿を先に確定し、演出は後。**
逆にやると原稿を直すたびに音声代と待ち時間が積む。

#### コマンド

```
npm run today                                # 日次。これ1つで足りる（0節参照）
npm run dev                                  # Studio。修正の大半はここ
npm run still -- --topic X --at 1.5          # 静止画1枚。数秒
npm run render -- --topic X --section 2      # 該当セクションのみ（フレーム範囲指定）
npm run render -- --topic X                  # 最終確認
npm run publish-check -- --topic X           # 投稿前ゲート
```

`still` は「音を切って2秒で伝わるか」の検証に使う。
**フックの確認に動画は要らない。静止画1枚で足りる。**

#### スナップショットテスト

テンプレは100本以上で使い回すため、
**セクション2を直したらフックが崩れていた**という事故が起きる。
動画を毎回見返すのは非現実的。

`renderStill()` で固定フレーム（0秒 / 各セクション境界 / 最終フレーム）の
PNG を撮って git に入れ、差分が出たら意図したものか確認する。
数枚のPNGなのでリポジトリを圧迫しない。

これがないと「テンプレを触るのが怖い」状態になる。
週3本を半年続けるなら、この恐怖が最大のボトルネックになる。

#### 投稿後は修正できない

削除して再投稿しかなく、再投稿すると初動データが失われる。
初速で伸びなかった動画が後から伸びるのは稀（二次情報）という前提に立つと、
**再投稿は事実上その1本を捨てること**。

したがって修正の容易さより**投稿前ゲートの厳格さ**が重要。
チェックリストは人間の記憶に置かず `publish-check` で機械的に落とす。

### 台本 JSON スキーマ（このプロジェクトの中核）

テンプレ側は props を受けるだけにする。ここを固定すると LLM 側もテンプレ側も安定する。

```ts
type Script = {
  id: string;              // "2026-09-18-claude-code-hooks"
  locale: "ja" | "en";     // フォント・改行・字幕チャンク分割が分岐する
  format: "news-digest" | "tool-demo" | "code-diff" | "data-viz";

  // --- 重複判定キー（文字列一致ではなくこの3つ組で判定）---
  entity: string;          // "Next.js" / "Claude Code"
  version: string | null;  // "16.2" / null
  angle: string;           // "キャッシュ" / "hooks"

  // --- 鮮度 ---
  shelfLife: "hot" | "evergreen";
  sourceDate: string;      // 情報の日付（ISO）。表示するのはこちら
  publishedAt: string;     // 動画の投稿日（ISO）。表示しない

  // --- リテンション ---
  hook: string;            // 24文字以内。音声なしで意味が通ること
  hookStyle: "question" | "number" | "negation";  // idハッシュで決定的にローテート
  payoffSection: number;   // hook を回収するセクション番号（最終であること）

  sections: Section[];     // 3〜5本
  outro: string;
  bgm: string;             // assets/bgm/*.mp3
  totalDurationSec: number; // 65〜75 を assert（完了率優先）

  // --- 事実の固定（LLMに生成させない）---
  sources: { url: string; fetchedAt: string; excerpt: string }[];
  facts: Record<string, string>;
};

type Section = {
  heading: string;
  // TTS 原稿。"|" がチャンク境界（字幕の割れ方）。TTS へは除去して渡す
  narration: string;       // "Remotion は React で動画を書ける|ライブラリです"
  telop: Telop[];          // 音声非同期のデザイン要素（見出し・数値・コールアウト）
  visual:
    | { kind: "text" }
    | { kind: "chart"; data: unknown }
    | { kind: "code"; before: string; after: string; lang: string }
    | { kind: "screencast"; clip: string; zoom?: Rect };
  durationSec: number;     // 音声長から逆算。手打ちしない
};

type Telop = { text: string; atSec: number; durationSec: number };
```

### 字幕とテロップは別物（重要）

混ぜると実装が破綻する。

| | 字幕 | テロップ |
|---|---|---|
| 正体 | ナレーション原稿そのもの | デザイン要素 |
| タイミング | 音声に同期（文字単位） | セクション/秒単位で十分 |
| 由来 | **生成物**（TTSのタイムスタンプから導出） | **入力**（台本に手で書く） |
| git管理 | しない（再生成可能） | する（台本の一部） |

### 字幕タイミングの取得方法

ElevenLabs の `/v1/text-to-speech/{voice_id}/with-timestamps` を使う。
base64音声と一緒に `normalized_alignment.characters` /
`character_start_times_seconds` / `character_end_times_seconds` が返る。

**原稿が既知なので誤認識がゼロ。** これが採用理由。

日本語は分かち書きされないため文字レベルの結果しか得られない。
そこで `narration` の `|` を境界として使い、文字インデックスから
各チャンクの start/end を復元する。形態素解析も ASR も不要で、
「Claude Code」のような固有名詞の割れ方を台本側で完全に制御できる。

出力は `@remotion/captions` の `Caption` 型に合わせる:

```ts
type Caption = { text: string; startMs: number; endMs: number; timestampMs: number };
```

この型で揃えておけば `createTikTokStyleCaptions()` によるページ分割が
そのまま使え、将来 Whisper ルートに乗り換えても描画側は変更不要。

**Whisper ルートを第一候補にしない理由**: `@remotion/install-whisper-cpp` の
`toCaptions()` は公式ルートで日本語モデルもあるが、音声を書き起こす方式のため
「Claude Code」「Remotion」「Next.js」等の固有名詞・英語混在の技術用語で
誤認識が発生する。AI系の題材では毎回手修正が入り、自動化の意味が薄れる。

### 重複判定

URL単位の dedupe では不十分。同一リリースが複数メディアで別URLになり、
続報も別URLになる。判定は `(entity, version, angle)` の3つ組で行う。

| ケース | 判定 |
|---|---|
| `Next.js 16.1` → `16.2` | 別ネタ（連続性が出て良い） |
| 同じ `16.2` の「キャッシュ」と「ルーティング」 | 別ネタ（angle が違う） |
| 同じ `16.2` の「キャッシュ」を二度 | **重複。reject** |

`entity` / `version` は `facts` から機械抽出できるのでハード判定。
`angle` は曖昧なので embedding 類似度で警告のみ（reject しない）。
`content/published.json` に過去分の3つ組と embedding を保持して照合する。

### フォーマット疲れ対策（重複より深刻）

ネタが違ってもテンプレが1つなので見た目が毎回同じになる。
規約面でも「大量の同一コンテンツの複製」は違反対象とされている
（テンプレ共通化自体は問題ないが、視聴者側の飽きは確実に来る）。

変化軸を `id` のハッシュから**決定的に**ローテートする。ランダムは偏る。

- `hookStyle`: question / number / negation
- 配色: トークンのパレットを3種
- セクション順序

同じ組み合わせが3本連続しないことを lint で確認する。

### 日付の扱い

`sourceDate`（情報の日付）と `publishedAt`（投稿日）は別物。
**表示するのは `sourceDate`**。信頼性に効くのはこちら。
日付は `facts` に機械抽出で入れ、LLMには生成させない（必ずずれる）。

**常に表示してはいけない。** 日付を焼き込むと賞味期限が可視化される。

| shelfLife | 焼き込み | 理由 |
|---|---|---|
| `hot` | 日付を大きく出す | 鮮度が価値そのもの |
| `evergreen` | 日付は出さず、バージョンのみ（「Next.js 16 時点」） | 3ヶ月後に古く見えるとロングテールが死ぬ |

ロングテール再生は evergreen から来るので、ここは無視できない。

### 投稿テキストの出力（媒体ごとに別物）

TikTok に description は存在しない（キャプションのみ）。
YouTube Shorts だけが title と description を別に持ち、**ここが検索流入の入口**。
ソースURLもここに置く。

```ts
type Publish = {
  tiktok: { caption: string; hashtags: string[] };
  shorts: { title: string; description: string; hashtags: string[] };
  reels:  { caption: string; hashtags: string[] };
};
```

日付は焼き込みとテキストの**両方**に入れる。
テキスト側は `facts.sourceDate` から機械的に差し込むのでLLMの生成対象外。

---

## 3.5 リテンション設計

**全体の成否に一番効く部分。** 以下はすべて構造として実装し、
「気をつける」で運用しない。守られないため。

### 原則

- **フックは音声なしで成立させる。** 初回視聴の多くは無音か音が出遅れる。
  `hook` をナレーションに乗せると読まれない。フレーム0から全画面の大テキスト
- **フェードインを入れない。** 0.5秒のフェードは2秒の窓の25%を捨てている
- **オープンループ**: `hook` の答えを `payoffSection`（最終セクション）で回収する
- **セクション境界で切らない。** 離脱は境界で起きる。次の見出しを前セクションの
  終わりに重ねて切れ目をなくす
- **進捗を見せる。** 「3つのうち2つ目」が見えると終わりが近いと分かり離脱が減る
- **ループさせる。** 最終フレームを `hook` のデザインに寄せて先頭に繋ぐ。
  再視聴が起きると視聴完了率が100%を超える
- **尺は65〜75秒。** 完了率だけ見れば短い方が有利。CRPの1分制約で下限は動かせない
  （70〜90秒は総視聴時間を優先した場合の数字。完了率とは相反する）

### lint（CIで落とす）

- [ ] `hook` が24文字以内
- [ ] `hook` にナレーション依存の指示語がない
- [ ] `payoffSection` が最終セクションを指し、その `narration` が `hook` の語を含む
- [ ] 視覚変化の間隔が2秒以下
- [ ] `totalDurationSec` が 65〜75
- [ ] `(entity, version, angle)` が `published.json` と衝突しない
- [ ] 変化軸の組み合わせが3本連続していない

> **この節は全て設計仮説であり、出典はない。** `metrics.yaml` に視聴完了率と
> 離脱ポイントを記録し、自分のデータで上書きする前提で運用する。
> 離脱が毎回セクション2で起きるなら、テンプレの構造が間違っているという意味。

---

## 4. ディレクトリ構成

```
.
├── plan.md
├── CLAUDE.md                  # Claude Code 常設ルール（後述）
├── .claude/
│   └── commands/
│       └── script.md          # /script X で manual 経路を1コマンド化
├── prompts/
│   └── script.md              # ★ 両経路で共有。TSに埋めない。最重要資産のひとつ
├── config/
│   └── pipeline.ts            # scriptSource: manual|api / tts: voicevox|elevenlabs
├── .work/                     # プロンプト束（生成物）。gitignore
├── .env.example
├── .gitignore
├── content/
│   ├── topics.yaml            # ネタのバックログ。優先度と状態を持つ
│   ├── scripts/               # 台本 JSON。★ git 管理する（最重要資産）
│   ├── published.json         # 過去分の (entity, version, angle) + embedding。★ git 管理
│   ├── publish/               # 媒体別の投稿テキスト（生成物）。gitignore
│   ├── captions/              # 字幕 JSON（生成物）。gitignore
│   └── metrics.yaml           # 再生数・視聴完了率・離脱ポイント。★ git 管理
├── src/
│   ├── Root.tsx
│   ├── compositions/
│   │   ├── NewsDigest.tsx
│   │   ├── ToolDemo.tsx
│   │   └── CodeDiff.tsx
│   ├── components/            # Hook / SectionCard / Subtitle / Progress
│   ├── design/
│   │   ├── tokens.ts          # 色・タイポ・スペーシング
│   │   └── safe-area.ts       # 媒体別セーフマージン定義
│   └── schema/script.ts       # zod スキーマ（生成物のバリデーション）
├── scripts/
│   ├── generate-script.ts
│   ├── synthesize.ts
│   ├── render.ts
│   └── captions.ts
├── assets/
│   ├── bgm/                   # 小さいものだけ git 管理
│   └── screencasts/           # gitignore（大きい）
└── out/                       # gitignore
```

### .gitignore の方針
```
out/
.env
.cache/                 # 内容アドレスキャッシュ。大きいので入れない
.work/                  # プロンプト束。再生成可能
assets/screencasts/
content/audio/          # 生成した mp3 は再生成可能
content/captions/       # 字幕JSONも再生成可能
node_modules/
```

**git に入れるもの**: 台本JSON、テンプレのコード、デザイントークン、topics.yaml、metrics.yaml
**git に入れないもの**: レンダー済み動画、生成音声、スクリーンキャスト素材、APIキー

mp4 を LFS で持つ誘惑があるが、台本JSONがあれば再生成できるので不要。

---

## 5. マイルストーン

### M0 — 足場（0.5日）
- [ ] `kenmori/shorts-factory` を private で作成（個人事業として運用）
- [ ] `npx create-video@latest` で Remotion 初期化、TypeScript strict
- [ ] `config/pipeline.ts` を作る（`scriptSource: "manual"`, `tts: "voicevox"`）
- [ ] `prompts/script.md` を空で作る（M3で育てる）
- [ ] `.env.example` 作成（api モードに切り替えるまで中身は不要）
- [ ] `src/schema/script.ts` に zod スキーマを書く
- [ ] `content/scripts/` に**手書きの台本JSONを1本**置く（LLMはまだ使わない）

### M1 — テンプレを1つ完成させる（2〜3日）★最重要
- [ ] `NewsDigest.tsx` を実装。3トピック・70秒・縦1080x1920
- [ ] `design/tokens.ts` で色とタイポを定義。**locale ごとに値を持たせる**
      （日本語フォントの縦位置・ウェイト、`word-break` と禁則処理は欧文と別物）
- [ ] `safe-area.ts` に3媒体のセーフマージンを定義
- [ ] `<Hook>`: フレーム0から全画面テキスト。**フェードインなし**
- [ ] `<Progress>`: 「3つのうち2つ目」の進捗表示
- [ ] 最終フレームを `hook` のデザインに寄せてループ成立させる
- [ ] `shelfLife` による日付表示の分岐
- [ ] 手書き台本JSONからローカルレンダーが通る
- [ ] `npm run dev`（Studio）で props を差し替えながら確認できる状態にする
- [ ] `npm run still -- --at 1.5` を実装。フック検証はこれで回す
- [ ] `renderStill()` の固定フレームスナップショットを git に入れる
- [ ] **実機（iPhone）でテロップの可読性を確認**。ここで必ず作り直しが入る
- [ ] **音を切って最初の2秒だけ見て、内容が伝わるか確認**

> ここを飛ばして自動化に進むと「質が低いまま自動化されたパイプライン」ができて捨てることになる。

### M2 — 音声と字幕同期（2〜3日）
- [x] **まず捨てスクリプトで50文字の日本語を両エンジンに投げ、返り値を目で見る。**
      ここで想定と違ったら設計をやり直す（ElevenLabs の正規化挙動は未検証）
      → `npm run tts:probe`（`scripts/dev/tts-probe.ts`）。捨てずに残してある。
      読み・モーラ音長と WAV 実測のズレ・1チャンクの尺・文字/秒を出す。
      **ENGINE を繋いだ最初の1回はこれを通す。** VOICEVOX 専用（ElevenLabs 経路は未検証）
- [ ] TTS エンジンを決める。日本語ローカル完結なら VOICEVOX、声質優先なら ElevenLabs
- [ ] `synthesize.ts`: エンジンをインタフェースで抽象化（後で差し替えられるように）
      - VOICEVOX: `/audio_query` → モーラ音長 → チャンク単位で合成・結合
      - ElevenLabs: `/with-timestamps` → `normalized_alignment` → インデックス対応
- [ ] `.cache/audio/` の内容アドレスキャッシュを実装。キーに `|` を含めない
- [ ] `Caption[]` を `content/captions/<id>.json` へ出力
- [ ] `<Subtitle>` コンポーネント: `useCurrentFrame()` で現在チャンクを判定して描画
- [ ] `createTikTokStyleCaptions()` でページ分割し、画面からあふれないことを確認
- [ ] `<Telop>` コンポーネント: `atSec` ベースの別系統として実装（字幕と結合しない）
- [ ] 音声長から `durationSec` を逆算してテンプレに流す
- [ ] BGM をミックス。ナレーションとの音量バランスを固定値で決める
- [ ] フォントをバンドルし、**ネットワークを切ってレンダーが通ることを確認**

**検証**: 台本の `|` を動かしたとき、字幕の割れ方だけが変わり音声は再生成されないこと。
ここが独立していないと字幕調整のたびに課金とレンダー待ちが発生する。

### M3 — 手回しで5本出す（1週間）
- [ ] 台本を**手書きで**5本、内容を差し替えてレンダー
- [ ] **手で直した箇所を毎回 `prompts/script.md` に反映する** ← M4の成否がここで決まる
- [ ] 3媒体分の書き出しを `render.ts` で1コマンド化
- [ ] `--section N` の部分レンダーを実装（`durationSec` からフレーム範囲を計算）
- [ ] `publish-check.ts`: 投稿前チェックリストを機械化して落とす
- [ ] 実際に投稿してみる（AIGCラベル必須）
- [ ] `metrics.yaml` に投稿後2時間の初動＋視聴完了率＋離脱ポイントを記録
- [ ] 詰まった工程を洗い出す ← **これが M4 の設計入力**

### M4 — 生成の半自動化（3〜5日）
- [ ] `script:prepare`: ソース fetch ＋ プロンプト束を `.work/<id>/` へ。
      直近20件の `(entity, version, angle)` も同梱する
- [ ] `script:verify`: zod + lint + dedupe のハード判定
- [ ] `.claude/commands/script.md` を書き、`/script X` で manual 経路を1コマンド化
- [ ] `build` が台本JSONの不在を検知して manual モードでは止まる
- [ ] `publish.ts`: 台本1本から `Publish` 型（tiktok / shorts / reels）を出力。
      日付・URLは `facts` から機械差し込み
- [ ] `lint-script.ts`: 3.5節の lint を実装。CIで落とす
- [ ] `npm run build -- --topic <id>` で音声→3本のmp4→投稿テキストまで通す

### M4.5 — api 経路の追加（切替可能になってから、必要なら）
- [ ] `script:generate`: `prompts/script.md` を送信して JSON を書く。no-op から差し替え
- [ ] `config.scriptSource` を `"api"` にして同じ `verify` が通ることを確認
- [ ] 出力品質を manual 時代の台本と比較。落ちていればプロンプトに戻る

### M5 — 2本目のフォーマット（M4後）
- [ ] `ToolDemo.tsx`: Playwright でAIツールを操作 → 収録 → ズーム/コールアウトを後付け
- [ ] Playwright 収録スクリプトを `scripts/capture/` に分離

---

## 6. 運用ルール（**暫定仮説。要検証**）

> 以下のうち尺・頻度・アルゴリズム挙動に関する項目は、出典がSNS運用代行会社の
> ブログや匿名投稿で、一次ソースを確認できていない。M3の実測で上書きする。
> 出典が公式で確認できているのは AIGCラベル義務と CRP の参加条件のみ。

- **投稿頻度**: 立ち上げ2週間は毎日 → その後は月・水・金の週3固定。曜日を固定する（二次情報）
- **尺**: 65〜75秒。これを外れる台本は生成時に reject
- **配分**: hot 1本 + evergreen 2本。evergreen を常に5〜10本プールしておく
- **初動確認**: 投稿後2時間の指標だけ記録し、それ以上は張り付かない（二次情報／一部は匿名投稿）
- **記録項目**: 再生数だけでなく**視聴完了率と離脱ポイント**を `metrics.yaml` に残す。
  離脱が毎回同じセクションで起きるならテンプレの構造が間違っている
- **アカウント種別**: CRP が個人アカウント限定かは**出典が運用ブログ1本のみで矛盾もある**。
  アカウント作成前にアプリ内の申請画面か公式ヘルプで自分で確認する
- **投稿前チェックリスト**（毎回）
  - [ ] AIGCラベルを付けた
  - [ ] ウォーターマークなしのマスターを使っている
  - [ ] 実機でテロップがUIに被っていない
  - [ ] 尺が60秒を超えている（CRP対象）
  - [ ] 投稿テキストが媒体別になっている（Shortsはtitleとdescription両方）
  - [ ] 日付の表示が `shelfLife` と整合している

---

## 7. CLAUDE.md に書くこと

別ファイルとして作る。Claude Code が毎回読む前提の常設ルール。

- パッケージマネージャ、Node バージョン、`npm run` の一覧
- 台本JSONは必ず zod スキーマを通すこと。スキーマを勝手に緩めないこと
- 新しい依存を入れる前に確認すること（Remotion のバンドルサイズとレンダー時間に効く）
- `out/` `content/audio/` は生成物なので commit しないこと
- テンプレの数値（色・フォントサイズ・マージン）は `design/tokens.ts` からのみ参照し、コンポーネント内にハードコードしないこと
- **プロンプトは `prompts/script.md` にのみ置き、TypeScript の文字列に埋めないこと**（manual / api 両経路で共有するため）
- 台本を手で直したら、その修正方針を `prompts/script.md` に反映すること
- LLM を呼ぶコードは `script:generate` の中だけに置くこと。他の工程から呼ばないこと
- **セーフエリアの数値を推測で書かないこと**。実機確認した値のみを `safe-area.ts` に入れる

---

## 8. コスト見込み（月額）

| 項目 | 費用 |
|---|---|
| Remotion | ¥0（3名以下は商用無償） |
| TTS | ¥0（VOICEVOX）/ $6〜22（ElevenLabs Starter以上） |
| LLM API | 月数十円〜数百円（M4以降のみ。下記注意） |
| レンダリング | ¥0（ローカル） |
| 収集（RSS / GitHub atom / arXiv / HN Algolia） | ¥0 |
| BGM | ¥0 |

**LLM の実消費量は小さい。** 1本あたり入力が数千トークン、出力が1〜2千トークン。
週3本で月15万トークン前後。ただし注意点が3つある。

- **ChatGPT Pro / Plus に API は含まれない。** OpenAI はChatGPTとAPIを別の課金
  システムとして運用しており、変換や引き継ぎの仕組みはない。`platform.openai.com`
  で別途キーを発行し支払い方法を登録する
- **プリペイドの最低購入額があるため、実使用額より下限の方が支払いを決める**
- 単価は2026年に複数回値下げされている。**見積もり前に料金ページで実額を確認する**

**M0〜M3 は台本を手書きする設計なので LLM API は不要。** M4 まで登録しなくてよい。

Claude Code を Pro / Max で使っているなら、台本生成をAPI呼び出しにせず
**Claude Code のタスクとして対話的に回す**選択肢がある。API課金がゼロになり、
おかしい台本をその場で直せるので質も上がる。失うのは CI 化のみで、
投稿がもともと手動なので実害は小さい（M4 の「人間のレビューポイント1箇所」と重なる）。
ただしサブスクリプションは対話利用のためのものなので、
**スクリプトから自動で叩く用途に配線しないこと。**

**VOICEVOX + Claude Code 構成なら実質¥0。** ElevenLabs 構成で月 $6〜22 程度。
キャッシュが効くので、試行回数は課金に影響しない。
本当のコストは初期構築の20〜40時間。

---

## 9. 未決事項

- [ ] チャンネルのテーマを「一般向けAIツール紹介」に寄せるか「AI×フロントエンド」のニッチに寄せるか。前者は再生報酬、後者は案件導線。**M3の実測後に決める**
- [ ] BGM の調達方法（Suno / ロイヤリティフリー音源）
- [ ] VOICEVOX を使う場合、採用キャラの利用規約とクレジット表記（収益化前に確認）
      → 採用キャラは **青山龍星**。`config/pipeline.ts` の `voicevox.credit` に
      `VOICEVOX:青山龍星` を仮置きし、`publish.ts` が3媒体の投稿テキストへ
      機械的に差し込むようにした。**文言そのものは未確認。** 規約を読んで直す
- [ ] Remotion Lambda に移すかどうか（ローカルレンダーが遅くなってから判断）

---

## 10. 実装メモ（仕様との差分）

M0〜M4 を実装した時点での、この仕様書と実装のズレ。**仕様側が古い箇所は
こちらが正**。理由も残す（数値や構造の根拠が消えると直せなくなる）。

### 10.1 ディレクトリ: `assets/` → `public/`

Remotion の `staticFile()` は public ディレクトリからしか解決しないので、
BGM と生成音声は `public/bgm/` `public/audio/` に置いた。
4節の構成のうち `assets/bgm/` は `public/bgm/`、`assets/screencasts/` は
そのまま（M5 で使う）。`public/fonts/` は `npm run fonts:sync`（postinstall）が作る。

### 10.2 音声のキャッシュ粒度はチャンク単位

3節は「キャッシュキーは原稿全体（`|` 除去）」、一方で「チャンクごとに合成して
結合すれば境界が構造的に確定する」とある。この2つは両立しない
（チャンク分割が変わると音声そのものが変わる）。

実装は**チャンク単位のキャッシュ**にした。

- キーは**チャンクの文面のみ**（`|` を含まない）ので「キーに `|` を入れない」は満たす
- `|` を動かしたとき、文面が変わった2チャンクだけ再合成される。
  他のチャンクはキャッシュに当たる（VOICEVOX ならローカル・無料なので実害ゼロ）
- 境界が構造的に確定するので文字インデックスの逆算が要らない

ElevenLabs 経路はリクエスト数が課金なので**発話（セクション）単位**で1回叩き、
文字アライメントから境界を復元する。境界だけ動かした場合は、
文字ごとの時刻がキャッシュに残っていないため**推測せずエラーで止める**。

### 10.3 音声は結合しない

`narration.mp3` に結合せず、セグメントのまま `<Audio>` を並べて Remotion に
ミックスさせる。ffmpeg での結合工程が消え、内容アドレスキャッシュのファイルを
そのまま使える。mp3 のバイト結合のような危ない処理も不要。

### 10.4 変化軸の「セクション順序」は採らない

3節は変化軸として「セクション順序」を挙げているが、`payoffSection` は
**最終セクションで hook を回収する**契約なので、順序を機械的に入れ替えると
オープンループが壊れる。代わりに**レイアウト**（`stack` / `split` / `band`）を
軸にした。軸は3つ（hookStyle / 配色 / レイアウト）で 27通り。

### 10.5 字幕のページ分割には `pageBreakAfter` が必須

`createTikTokStyleCaptions()` のページ分割は**半角スペースで始まるトークン**を
境界にする実装（`node_modules/@remotion/captions`）。分かち書きしない日本語では
全チャンクが1ページに合体し、画面が字幕で埋まる。

`Caption.pageBreakAfter = true` を各チャンクに立てて `|` をページ境界として渡す。
Whisper ルート（単語単位）に乗り換えても、チャンク末尾にだけ立てれば同じ描画で動く。

### 10.6 `tts: "mock"` を足した

音声エンジンが無い環境（CI・初回セットアップ）でパイプラインの配線とレンダーを
検証するための無音エンジン。尺は文字数からの概算。
**publish-check が mock 由来のタイムラインを落とす**ので投稿には使えない。

### 10.7 lint は2段構え

3.5節の lint のうち「視覚変化の間隔」「実測の尺」は音声長が確定しないと判定できない。

- `lintScript(script)`: 台本だけで判定できるもの → `script:verify`
- `lintTimeline(script, timeline)`: 実測が要るもの → `publish-check`

「視覚変化」のイベントは**セクション開始・テロップ・字幕チャンクの切り替わり**。
結果として「1チャンクが2秒を超えたら落ちる」という運用になり、
`|` の割り方に直接効く。

### 10.8 `hookStyle` は省略可

id のハッシュから決定的に決まるので、台本では省略してよい（省略が推奨）。
書いた場合は導出値と一致していることを lint で確認する。

### 10.9 投稿テキストは LLM を使わない

3節は「[4] captions LLM → 媒体別キャプション」だが、5節 M4 の `publish.ts` は
`facts` からの機械差し込みで、7節は「LLM を呼ぶコードは `script:generate` の中だけ」。
後者2つを採って**完全に機械生成**にした（`config/publish.ts` にタグと定型文）。
日付は `shelfLife` に合わせて出し方を変える（hot は日付、evergreen はバージョン）。

### 10.10 セーフエリアは未実測のまま

「実機確認した値だけを入れる」を守るため、`safe-area.ts` の数値は
**プレースホルダのまま `verified: false`** にしてある。
publish-check が毎回「未実測の媒体」を出す。実機で確認したら差し替える。

### 10.11 尺の内訳

実装した構造での 70秒の内訳:

```
フック           2.0秒（config.hookDurationSec / ナレーションなし）
セクション×4     音声長 + 0.3秒（config.sectionTailSec）
アウトロ         音声長 + 0.3秒
```

セクション境界は 0.6秒（`config.sectionOverlapSec`）重ねる。

`content/scripts/2026-09-18-remotion-shorts-pipeline.json`（手書きサンプル）の実測:

| | mock（概算） | VOICEVOX / 青山龍星 |
|---|---|---|
| 正味の発話速度 | 7.4文字/秒 | **7.1文字/秒**（前後無音 0.2秒/チャンクを除く） |
| チャンク込みの実効速度 | 7.4文字/秒 | **6.0文字/秒** |
| 1チャンクの上限 | 13文字 | **12文字**（セクション末尾は10文字） |
| ナレーション全体 | 434文字 | **390文字 / 52チャンク** |
| 尺 | 67.4秒 | 68.6秒 |

**mock で合わせた尺はそのまま使えない。** mock はチャンクごとの無音を
0.12秒としているが、VOICEVOX は `prePhonemeLength + postPhonemeLength = 0.2秒`
なので、チャンクを増やすほど差が開く（44チャンクで約3.5秒）。

さらに**文字数から尺を推定すると1割ずれる。** 漢字の多さでモーラ数が変わるため、
文字数は尺の代理指標にならない（実際に 365文字の版を 70.9秒と推定して
実測 64.5秒だった）。`tts:probe` の目安も、投げたテキストの漢字密度に引きずられる。

そこで `synthesize` は、尺が範囲外のとき**そのとき合成した音声の実測値から
「約N文字 足す/削る」を出す**。推定を挟まないので外れない。
レンダーは尺が決まってから1回だけ回す。

### 10.13 冒頭に静止画を置かない（3.5節からの変更）

3.5節は「フックはナレーションに乗せない」「フレーム0から全画面の大テキスト」と
書いてある。素直に実装すると**先頭に2秒の無音の静止画**ができる。

これを実機で見た結果、**「読み込み中の画面」に見える**ことが分かった
（作った本人が読み込みだと誤認した）。動画は最初の2秒で決まるので、
「まだ始まっていない」と見える2秒は狙いの正反対になる。

変更:

- ナレーションは**0秒から**始める（フックが尺を消費しない）
- フックはセクション1の**上に重ねる**（`config.hookOverlaySec` = 1.2秒）。
  背景を塗って1枚のカードとして読ませ、1.2秒で切る
- 字幕レイヤーはさらに上なので、重なっている間も何を言っているかは見える
- 「フックの文をナレーションに乗せない」は維持（読むのは無音でも成立させる）

守るために lint を足した（`opening-silence`）。最初の字幕が
`config.maxOpeningSilenceSec`（0.5秒）より後に始まる動画は **publish-check で落ちる。**
気をつけるでは運用しない。

### 10.12 その他

- ブラウザは環境の Chromium を探して使う（`scripts/lib/browser.ts`）。
  通常の Chrome バイナリは旧 headless モードを持たないので `chromeMode` を合わせる
- `npm run record -- --topic <id>` を足した。投稿後に `published.json` へ記録する。
  これが無いと dedupe と変化軸のローテートが動かない（仕様に工程が無かった）
- 日本語のフックは `lang` 属性が無いと `word-break: auto-phrase` が効かず、
  文字単位で折り返される。`lang={script.locale}` を必ず付ける
- hook のフォントサイズは `@remotion/layout-utils` の `fitText` で実測して決める。
  24文字の hook を固定サイズで出すと4行になり、2秒で読み切れない

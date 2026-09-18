# shorts-factory

AI関連情報の縦型ショート動画を、コードから生成するパイプライン。
TikTok を主戦場に、YouTube Shorts / Instagram Reels へ同一マスターから横展開する。

実装仕様は [plan.md](./plan.md)。常設ルールは [CLAUDE.md](./CLAUDE.md)。
**このファイルは日々の運用手順**。

---

## 2つのモード

| | モードA: 完全自動 | モードB: 手持ちの動画を編集 |
|---|---|---|
| 入力 | ネタ（`content/topics.yaml`）と台本JSON | 動画ファイルの**絶対パス** |
| 音声 | VOICEVOX で合成 | 元動画の音声をそのまま使う |
| 字幕/テロップ | 台本の `\|` から**生成**（時刻は音声長） | 音声認識（whisper.cpp）から生成 → 手で直す |
| 絵 | テンプレ（画像・グラフ・コード） | 元動画そのまま |
| 出力 | `out/<id>/` に3媒体 | `out/telop-<slug>/<slug>.mp4` |
| コマンド | `npm run today` | `npm run caption -- --video <絶対パス>` |

共有しているのは**テロップの見た目（`src/components/SubtitleBox.tsx`）と
デザイントークンとレンダー**だけ。工程は別物なので、片方を直してももう片方は壊れない。

モードBの手順は「[手持ちの動画にテロップを付ける](#手持ちの動画にテロップを付ける)」。

---

## セットアップ（初回のみ）

```bash
npm install                   # postinstall でフォントを public/fonts/ に配置する
cp .env.example .env          # api モードに切り替えるまで中身は不要
```

VOICEVOX を使う場合は ENGINE を起動しておく（`localhost:50021`）。
アプリ（GUI）を開いている間は中の ENGINE が待ち受ける。繋がっているかの確認:

```bash
curl http://127.0.0.1:50021/version     # バージョンが返れば OK
npm run tts:probe                       # 返り値を目で見る（下記）
```

話者は **名前で指定する**（`config/pipeline.ts` の `voicevox.speakerName`。既定は `青山龍星`）。
番号は書かない — ENGINE の `/speakers` から引く。使える名前とスタイルの一覧:

```bash
npm run tts:voices
```

**ENGINE を初めて繋いだら `npm run tts:probe` を1回やる。**
読み（「Remotion」「4.0」がどう読まれるか）・モーラ音長と実測のズレ・
1チャンクの尺を出す。台本を書く前に「何文字で何秒か」を掴んでおくと、
尺が範囲外で lint に落ちる往復が減る。話者を変えたときもここで確認する。

`config/pipeline.ts` を確認:

```ts
scriptSource: "manual"   // Claude Code で台本を書く（MVP）
tts: "voicevox"          // ローカル完結・課金ゼロ
```

音声エンジンを立てずに配線だけ確認したいときは `--tts mock`（無音・尺は概算）。
**投稿用には使えない。** publish-check が落とす。

```bash
npm run today -- --tts mock    # 音声エンジン無しで最後まで通す（配線の確認）
```

`npm run dev`（Studio）は `public/props/<id>.json` を読む。これは音声合成の生成物
なので、**クローン直後は一度 `npm run today` か `npm run synthesize` を回してから**
Studio を開く（無ければ「先に音声合成を回す」というエラーが出る）。
Studio の props エディタで `topicId` を書き換えれば別の台本に切り替わる。

---

## 日次の流れ

### 1. 動画を作る

```bash
npm run today
```

台本がまだ無いので、`.work/<id>/` にプロンプト束を書き出して停止する。
表示された id を使って、Claude Code で:

```
/script <id>
```

台本 `content/scripts/<id>.json` ができたら、もう一度:

```bash
npm run today
```

冪等なので、止まった続きから進む（出力が入力より新しい工程は飛ばす。
やり直したいときは `--force`）。完了すると `out/<id>/` に3本そろう。

```
out/<id>/
├── tiktok.mp4
├── shorts.mp4
├── reels.mp4
└── publish.json      # 媒体別の投稿テキスト
```

### 2. 確認する

```bash
npm run publish-check -- --topic <id>
```

機械で見られるものは全部ここで落ちる。通ってから目で見る。

**次に自分の目で見るのは3点だけ。**

| 何を | どうやって | 落ちたら |
|---|---|---|
| 最初の2秒 | `npm run still -- --topic <id> --at 1.5` を**音を想像せずに**見る。意味が通るか | `hook` を書き直す。台本JSONだけの修正なので安い |
| テロップの被り | `tiktok.mp4` を**実機（iPhone）**で再生。UIに文字が隠れていないか | `src/design/safe-area.ts` を実機の値で直す |
| 音ズレ | 通しで1回見る。字幕と音声がずれていないか | `scripts/synthesize.ts` の問題。plan.md の M2 に戻る |

音ズレは**機械側でも2段で見ている**ので、目で見るのは最終確認だけ。

- `caption-audio-drift`: 字幕が音声の区間から外れていないか（タイムライン）
- 「映像と音声が同期している」: mp4 の実ファイルで、Bフレームの並べ替え分が
  編集リストで打ち消されているか。ここが崩れると全編が数フレームずれる

```bash
npm run open            # 出力フォルダを開く（--topic 省略で最新のもの）
npm run check:frames -- --topic <id>   # フレームの欠落を機械で見る（下記）
```

Studio のプレビューと最終レンダーは一致しないので、**実機確認は mp4 で行う**。

> `safe-area.ts` の数値は**まだ未実測**（`verified: false`）。
> 初回の実機確認で実測値に差し替える。publish-check が毎回そのことを出す。

### 画像素材

`public/shots/` に置いた画像を `visual: { kind: "image", shots: [...] }` で使う。
**字幕の区切りに合わせて自動で切り替わる**ので、秒数の指定は要らない。

```bash
npx tsx scripts/dev/make-placeholder-shots.ts   # 仮素材を作り直す
```

いま入っているのは仮の絵（`placeholder-*.png`）。**実素材に差し替える。**
何を置くかは `public/shots/README.md`。

### 3. 直す

修正コストが種類で大きく違う。

| 直したいもの | コマンド | コスト |
|---|---|---|
| テロップ / 色 / 配置 / レイアウト | `npm run dev` で確認 → `npm run render` | ほぼゼロ |
| 字幕の割れ方（`\|` の位置） | 同上 | ほぼゼロ（音声は再生成されない） |
| **ナレーション原稿** | 台本JSON編集 → `npm run today` | 音声再生成＋待ち |

**原稿を先に確定し、演出は後。** 逆にやると音声の再生成が積む。

1セクションだけ直したなら全部レンダーしない:

```bash
npm run render -- --topic <id> --section 2
```

テンプレ側（`src/`）を触ったら、スナップショットの差分を必ず確認する。

```bash
npm run snapshot -- --topic <id>   # 撮り直して git diff で見る
```

意図しない箇所が変わっていたらそれが事故。

スナップショットは「その台本 × そのタイムライン」の絵なので、
**ナレーションを直して尺が変われば当然ズレる。** 撮り直して差分を見るのは
`src/` を触ったときの回帰確認のため。

---

## 手持ちの動画にテロップを付ける

自分で撮った / 編集した動画に、音声認識でテロップを焼く（モードB）。

```bash
npm run caption -- --video /Users/you/Movies/clip.mp4
```

認識 → レンダー → 検証を通しで回す。**動画は絶対パスで渡す。**

### 初回だけ時間がかかる

whisper.cpp を github から取ってビルドし、モデルを Hugging Face から落とす
（`.cache/whisper.cpp` と `.cache/whisper-models`。large-v3-turbo は約1.6GB）。
**ここだけネットワークが必要。** 2回目以降はローカルで完結する。

ビルドには cmake と C++ コンパイラが必要（mac は `xcode-select --install`）。
clone が失敗する場合は `config/pipeline.ts` の `caption.whisperCppVersion` を
実在するタグに直す。

### 固有名詞は必ず直す

認識は固有名詞を外す（「Remotion」→「リモーション」「リモート**ション**」など）。
出力された `content/telops/<slug>.json` を開いて `text` を直す。

```json
{ "text": "リモートションで", "startMs": 3200, "endMs": 4400 }
```

**`startMs` / `endMs` は触らない。** そこは音声から出ている時刻で、
動かすと音とテロップがずれる。文字数が変わる程度なら時刻はそのままでよい。

直したら:

```bash
npm run caption -- --video /Users/you/Movies/clip.mp4   # 認識は飛ばして焼き直す
```

認識をやり直したいときだけ `--force`（**手で直した内容は消える**）。

### テロップの位置

`--platform tiktok|shorts|reels` で媒体UIを避ける余白が変わる（既定は tiktok）。
テロップの位置以外には効かない。

### 合っているかを機械で見る

```bash
npm run caption:check -- --video /Users/you/Movies/clip.mp4
```

見るのは区間の健全性（重なり・はみ出し・0秒・尺の上限下限）と、
書き出した mp4 の尺と音ズレ。**読みの正しさは機械では見られない**ので目で見る。

工程そのものが正しいかは、**答えが分かっている素材**で測る:

```bash
npm run caption:verify -- --topic <モードAで作った動画のid>
```

自前で作った動画（字幕の時刻が既知）にモードBの工程を丸ごと通し、
文字ごとの時刻を突き合わせて一致率とズレを出す。
一致率が低ければモデルを大きくする（`config/pipeline.ts` の `caption.model`）。

### 工程を分けて叩く

| コマンド | 何をするか |
|---|---|
| `npm run caption:asr -- --video <パス> [--force]` | 音声抽出 → 認識 → テロップJSON |
| `npm run caption:render -- --video <パス> [--platform …]` | テロップJSON → mp4 |
| `npm run caption:check -- --video <パス>` | 区間と mp4 の検証 |
| `npm run caption:verify -- --topic <id>` | 自前の動画で工程の精度を実測 |

---

## 投稿

### 投稿前に必ず

- [ ] `publish-check` が通っている
- [ ] 実機でテロップが UI に被っていない
- [ ] **尺が60秒を超えている**（Creator Rewards の対象条件。publish-check が判定する）
- [ ] 日付の表示が `shelfLife` と合っている（hot は日付あり / evergreen は日付なし）
- [ ] `out/<id>/` の mp4 を使う。**TikTok / Instagram のアプリ内で保存・編集していない**

最後の項目が一番重要。他媒体のロゴ（ウォーターマーク）が入った動画は
転載と判定されて露出が抑えられる。このリポジトリが出す mp4 はロゴなしなので、
**アプリ内で一度も保存し直さないこと**が条件。

### TikTok

1. `tiktok.mp4` をアップロード
2. `publish.json` の `tiktok.caption` を貼る
3. **AIGC ラベルを付ける。** 投稿前に「その他のオプション」から追加する
4. BGM は動画に埋め込み済み。**TikTok の楽曲ライブラリは使わない**（他媒体でライセンスが通らない）
5. 投稿

AIGC ラベルは必須。AI生成コンテンツ自体は禁止されていないが、
ラベルがないと違反対象になる。

### YouTube Shorts

1. `shorts.mp4` をアップロード
2. `publish.json` の `shorts.title` をタイトルに
3. `shorts.description` を説明欄に（**ソースURLもここ**）
4. AI生成コンテンツの申告を行う

Shorts だけが title と description を別に持つ。**ここが検索流入の入口**なので、
title を雑に扱わない。

### Instagram Reels

1. `reels.mp4` をアップロード
2. `publish.json` の `reels.caption` を貼る
3. AI生成コンテンツの申告を行う

### 投稿順とタイミング

同時でも構わない（どれもオリジナル投稿なので）。
ずらす実益は、初動データを媒体別に切り分けやすいことだけ。

---

## 投稿後

### すぐに

```bash
npm run record -- --topic <id>
```

`content/published.json` に `(entity, version, angle)` と変化軸を記録する。
**これを忘れると重複判定とフォーマットのローテートが効かなくなる。**
（レンダーしただけで記録すると dedupe が嘘になるので、投稿してから叩く）

### 2時間後

`content/metrics.yaml` に記録する。

```yaml
metrics:
  - id: <id>
    postedAt: 2026-09-18T19:00+09:00
    tiktok:
      views2h: 0
      completionRate: 0.0     # 視聴完了率
      dropOffSec: 0.0         # 離脱が集中した秒数
```

**再生数だけ記録しても意味がない。** 見るべきは完了率と離脱点。

初動が動かなかったら、その日はそれで終わり。張り付かない。

### 離脱点の読み方

| 離脱が集中する位置 | 意味 | 直す場所 |
|---|---|---|
| 0〜3秒 | フックが機能していない | `hook` / `hookStyle` |
| セクション境界 | つなぎで切られている | `config.sectionOverlapSec` とテンプレの境界処理 |
| 中盤で一様に減る | 尺が長い / 情報密度が低い | `totalDurationSec` を下げる |

**plan.md の運用ルール（頻度・尺・アルゴリズム挙動）は二次情報で、出典が弱い。**
`metrics.yaml` が溜まったら、そちらを正にして plan.md を書き換える。

### 投稿後の修正はできない

削除して再投稿しかなく、再投稿すると初動データが失われる。
だから投稿前ゲートを緩めない。

---

## 投稿頻度

立ち上げ2週間は毎日。その後は **月・水・金の週3固定**。

配分は **hot 1本 + evergreen 2本**。
evergreen（賞味期限の長い解説）を常に5〜10本 `content/topics.yaml` にプールしておく。
速報だけで回すと、ネタが出ない週に破綻する。

---

## トラブルシューティング

**`npm run today` が毎回課金される**
キャッシュキーがずれている。`.cache/audio/` のキーに `|` が混入していないか確認。
キーはチャンクの文面（`|` 除去後）だけで作ること。

**オフラインでレンダーが落ちる / フォントが違う**
`npm run fonts:sync` を実行して `public/fonts/` にファイルがあるか確認する。
読み込みに失敗したら**エラーで落ちる**ように書いてある（代替フォントで無言に
レンダーされるのが一番危険なので、そこは落とす）。

**`--offline` でキャッシュミス**
仕様どおり。黙って生成せずエラーで止まる。ネットに繋いで一度実行する。

**台本が重複している**
`(entity, version, angle)` の3つ組で判定している。
`content/published.json` を確認。同じバージョンの同じ観点は reject される。
バージョンが違えば別ネタとして通る。

**「変化軸の組み合わせが3本連続」で落ちる**
`hookStyle` / 配色 / レイアウトは id（slug）のハッシュから決まる。
slug を変えるとローテートがずれる。

**レンダーが遅くなってきた**
`--section N` で部分レンダーする。それでも厳しければ Remotion Lambda を検討
（plan.md の未決事項）。1本あたりの実測は 70秒 / 1080x1920 で**約2分**（ローカル）。

**再生すると文字がチカチカする / 一瞬消える**
まず動画側かプレイヤー側かを切り分ける。

```bash
npm run check:frames -- --topic <id>          # フック区間を1フレームずつ見る
npm run check:frames -- --topic <id> --all    # 全編を0.5秒ごと（遅い）
```

「明るいピクセルの割合」が落ちるフレームを探す。**欠落なしと出たなら動画は正常**で、
QuickTime などがデコード中に再描画しているだけ（実機やアプリでは出ない）。
欠落が出たら、その秒数を `npm run still -- --at <秒>` で撮って原因を見る。
過去の原因はフォント計測（`fitText`）が NaN を返してそのフレームだけ
`fontSize` が壊れるケース。`clampFontSize` で塞いである。

**（モードB）`npm run caption` が whisper.cpp の用意で落ちる**
初回だけ github からソースを取ってビルドする。
cmake と C++ コンパイラが必要（mac: `xcode-select --install`）。
タグが無い場合は `config/pipeline.ts` の `caption.whisperCppVersion` を
実在するタグに直し、`.cache/whisper.cpp` を消してやり直す。

**（モードB）モデルのダウンロードが終わらない / 容量が足りない**
`caption.model` を `small` にすると 500MB 程度で済む（精度は落ちる）。
落とし先は `.cache/whisper-models/`。

**（モードB）テロップが出ない / 動画が見つからないと出る**
元動画は `public/source/<slug>.mp4` に**ハードリンク**して置いている。
**シンボリックリンクにすると Remotion のレンダー用サーバが 404 で弾く。**
外付けディスクの動画などハードリンクが張れない場合はコピーに落ちる（時間がかかる）。

**（モードB）認識結果が空**
音声が入っていない動画か、言語の指定が違う。
抽出した音声（`.work/<slug>/asr-16k.wav`）を再生して確認する。
`config/pipeline.ts` の `caption.language` も見る。

**（モードB）テロップが音より早い / 遅い**
`content/telops/<slug>.json` の時刻を手で動かして直さない。まず測る:

```bash
npm run caption:verify -- --topic <モードAで作ったid>
```

「時刻差の中央値」が系統的なズレ。大きければ音声抽出かトークンの時刻の
取り方が壊れている（`extractAudio()` を使っていないか確認する）。

**ブラウザの起動に失敗する**
`scripts/lib/browser.ts` が環境の Chromium を探す。通常の Chrome バイナリは
旧 headless モードを持たないので `chromeMode` を合わせている。
自前のパスを使うなら `REMOTION_BROWSER_EXECUTABLE` を設定する。

---

## 未確認事項

以下は自分で確認すること。plan.md にも記載。

- **Creator Rewards が個人アカウント限定かどうか。** 出典が弱く矛盾もある。
  アプリ内の申請画面か公式ヘルプで確認する
- **モードBの認識精度と時刻の精度。** 開発環境から github / Hugging Face に
  出られず whisper.cpp をビルドできなかったため、`npm run caption:verify` を
  一度も回せていない。自分の機械で回して一致率とズレを確認する
  （`config/pipeline.ts` の `caption.whisperCppVersion` が実在するタグかも未確認）
- **VOICEVOX の採用キャラ（現在 `青山龍星`）の利用規約とクレジット表記。**
  キャラごとに異なる。`config/pipeline.ts` の `voicevox.credit` は
  `VOICEVOX:青山龍星` を**仮に**置いてあるだけで、文言は未確認。
  規約を読んで直す（投稿テキストの3媒体すべてに自動で入る）
- **セーフエリアの実測値。** `src/design/safe-area.ts` は全媒体 `verified: false`
- **BGM。** `public/bgm/placeholder-pad.wav` は生成した仮の音。差し替える

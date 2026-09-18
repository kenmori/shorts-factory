# shorts-factory

AI関連情報の縦型ショート動画を、コードから生成するパイプライン。
TikTok を主戦場に、YouTube Shorts / Instagram Reels へ同一マスターから横展開する。

実装仕様は [plan.md](./plan.md)。常設ルールは [CLAUDE.md](./CLAUDE.md)。
**このファイルは日々の運用手順**。

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

```bash
npm run open      # 出力フォルダを開く（--topic 省略で最新のもの）
```

Studio のプレビューと最終レンダーは一致しないので、**実機確認は mp4 で行う**。

> `safe-area.ts` の数値は**まだ未実測**（`verified: false`）。
> 初回の実機確認で実測値に差し替える。publish-check が毎回そのことを出す。

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

**ブラウザの起動に失敗する**
`scripts/lib/browser.ts` が環境の Chromium を探す。通常の Chrome バイナリは
旧 headless モードを持たないので `chromeMode` を合わせている。
自前のパスを使うなら `REMOTION_BROWSER_EXECUTABLE` を設定する。

---

## 未確認事項

以下は自分で確認すること。plan.md にも記載。

- **Creator Rewards が個人アカウント限定かどうか。** 出典が弱く矛盾もある。
  アプリ内の申請画面か公式ヘルプで確認する
- **VOICEVOX の採用キャラ（現在 `青山龍星`）の利用規約とクレジット表記。**
  キャラごとに異なる。`config/pipeline.ts` の `voicevox.credit` は
  `VOICEVOX:青山龍星` を**仮に**置いてあるだけで、文言は未確認。
  規約を読んで直す（投稿テキストの3媒体すべてに自動で入る）
- **セーフエリアの実測値。** `src/design/safe-area.ts` は全媒体 `verified: false`
- **BGM。** `public/bgm/placeholder-pad.wav` は生成した仮の音。差し替える

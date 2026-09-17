---
description: 台本 JSON を書く（manual 経路）。/script <id>
---

引数の動画 id: `$ARGUMENTS`

1. `.work/$ARGUMENTS/prompt.md` を読む。プロンプト束（指示・ネタ・一次ソース・直近20件）が入っている
   - 無い場合は `npm run script:prepare -- --topic $ARGUMENTS` を先に実行する
2. `.work/$ARGUMENTS/sources/` の本文を読む。**数値・日付・製品名はここからだけ取る**
3. `content/scripts/$ARGUMENTS.json` を書く
4. `npm run script:verify -- --topic $ARGUMENTS` が通るまで直す

台本の書き方は `prompts/script.md`（prompt.md の先頭に入っている）に従う。
スキーマは `src/schema/script.ts`。**スキーマを緩めて通すのは禁止。**

直したところで気づいたこと（言い回し・数値の見せ方・フックの型）は、
そのまま `prompts/script.md` に反映する。ここが api 経路に切り替えたときの資産になる。

通ったら次を伝える:

```
npm run today
```

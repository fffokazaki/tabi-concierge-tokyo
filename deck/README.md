# deck — 提出資料（PPTX）のビルダー

東京都知事杯オープンデータ・ハッカソン 2026 の提出資料 14 枚を、`pptxgenjs` で**コードから生成**する。
原稿（何を書くか）は [../docs/submission-deck.md](../docs/submission-deck.md)、組版（どう見せるか）がこの `build.js`。

**PowerPoint で直接開いて直さないこと。** `build.js` を実行すると同じ名前の PPTX を上書きするため、
手で加えた修正は次のビルドで消える。直すのは常に `build.js` 側。

## なぜリポジトリ直下なのか

`docs/` 配下は全文書に frontmatter と SemVer を要求する規約があり（[../CLAUDE.md](../CLAUDE.md)）、
`scripts/` は `tsconfig.scripts.json` と `vitest.scripts.config.ts` の対象に入っている。
このディレクトリは**自分の `package.json` を持つ独立した npm プロジェクト**なので、
どちらにも入れず直下に置いて、本体のツールチェーンから切り離してある。
ルートは npm workspaces を使っていないため、ここの依存が本体の `npm install` に混ざることはない。

## セットアップとビルド

```bash
cd deck && npm ci && npm run build
```

`tabi-concierge-tokyo-submission.pptx`（14 枚）が同じディレクトリに出る。
成果物（`*.pptx` / `*.pdf` / `slide-*.jpg`）は `.gitignore` 済み。コミットするのは入力だけ。

## 提出用の派生物を作る

提出フォームには PDF と画像も要る。この Mac で実測済みの手順:

```bash
soffice --headless --convert-to pdf tabi-concierge-tokyo-submission.pptx
pdftoppm -jpeg -r 150 tabi-concierge-tokyo-submission.pdf slide
```

`soffice` / `pdftoppm` は `/opt/homebrew/bin` にある。JPEG は目視 QA 用。
**提出フォームの画面キャプチャ 1600×900px は別物**で、これとは取り違えないこと（[../docs/01-context/CONSTRAINTS.md](../docs/01-context/CONSTRAINTS.md)）。

## 画像

`img/` の 3 枚はアプリの実画面キャプチャ。差し替えるときはファイル名を変えず同じ場所へ置く
（`build.js` が `img/deck-*.png` を相対パスで参照している）。

## npm audit の警告について

`npm audit` は `image-size`（`pptxgenjs` の間接依存）に high 2 件を報告する。
いずれも**壊れた画像ファイルを読ませると無限ループに陥る** DoS で、ここで読ませるのは
`img/` に置いた自分の PNG 3 枚だけなので、この使い方では踏まない。

`npm audit fix --force` は `pptxgenjs` の破壊的アップグレードを伴い、**レイアウトが変わりうる**。
提出前に走らせないこと。

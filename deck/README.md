# deck — 提出資料（PPTX）のビルダー

東京都知事杯オープンデータ・ハッカソン 2026 の提出資料 14 枚を、`pptxgenjs` で**コードから生成**する。
原稿（何を書くか）は [../docs/submission-deck.md](../docs/submission-deck.md)、組版（どう見せるか）がこの `build.js`。

**PowerPoint で直接開いて直さないこと。** `build.js` を実行すると同じ名前の PPTX を上書きするため、
手で加えた修正は次のビルドで消える。直すのは常に `build.js` 側。

## なぜリポジトリ直下なのか

`docs/` 配下は原則すべての文書に frontmatter と SemVer を要求する規約があり（[../CLAUDE.md](../CLAUDE.md)）、
`scripts/` は `tsconfig.scripts.json` と `vitest.scripts.config.ts` の対象に入っている。
このディレクトリは**自分の `package.json` を持つ独立した npm プロジェクト**なので、
どちらにも入れず直下に置いて、本体のツールチェーンから切り離してある。
ルートは npm workspaces を使っていないため、ここの依存が本体の `npm install` に混ざることはない。

**その代わり `build.js` は typecheck / test / CI のいずれの対象でもない。**
CI（`.github/workflows/ci.yml`）が落ちてもここの破損は検出されないので、直したら必ず
`npm run build` を通し、**14 枚出ることと、直したスライドの見た目**を自分で確かめる（下の「目視QA」）。

## セットアップとビルド

```bash
cd deck && npm ci && npm run build
```

`tabi-concierge-tokyo-submission.pptx`（14 枚）が `deck/` に出る。
`build.js` は画像パスも出力先も `__dirname` 基準なので、リポジトリ直下から `node deck/build.js` と
叩いても同じ結果になる（cwd には依存しない）。成果物（`*.pptx` / `*.pdf` / `slide-*.jpg`）は
`.gitignore` 済みで、コミットするのは入力だけ。

## 提出用の派生物と目視QA

提出フォームには PDF も要る。**`soffice` と `pdftoppm` は出力先が cwd なので `deck/` 内で叩くこと**
（`build.js` と違いこの2つは `__dirname` を見ない）。

```bash
cd deck
/opt/homebrew/bin/soffice --headless --convert-to pdf tabi-concierge-tokyo-submission.pptx
/opt/homebrew/bin/pdftoppm -jpeg -r 110 tabi-concierge-tokyo-submission.pdf slide
```

JPEG は目視QA用。**文字あふれ・表の列落ちはこれを見ないと分からない**（テストが無いため）。
`-f 12 -l 13` のようにページを絞ると速い。

⚠️ **この目視QAは代替フォントでの描画である。** `build.js` が指定する `Yu Mincho`（見出し）と
`Yu Gothic`（本文）は**この Mac に入っていない**（2026-08-22 実測: `fc-list` に 0 件。Hiragino は
36 件ある）。したがって soffice は別のフォントのメトリクスで組んでおり、**Yu Gothic を持つ環境で
開いたときのあふれ・重なりを保証しない**。枠がぎりぎりの箇所は、目視QAではなく
「枠の幅 ÷ フォントサイズ = 1行に入る全角字数」の算術で確かめるほうが確実。最終確認は
PowerPoint で開くこと。

**提出フォームの画面キャプチャ 1600×900px はこれとは別物**で、取り違えないこと
（[../docs/01-context/CONSTRAINTS.md](../docs/01-context/CONSTRAINTS.md)）。

## 画像

`img/` の 3 枚はアプリの実画面キャプチャ。差し替えるときはファイル名を変えず同じ場所へ置く
（`build.js` が `img/deck-*.png` の3つを名前で参照している）。

## npm audit の警告について

**2026-08-22 時点で** `npm audit` は `image-size`（`pptxgenjs` の間接依存）に high 2 件を報告する。
件数と内容は上流の更新で変わるため、この行を信じる前に再確認すること。

内容はいずれも**壊れた画像ファイルを読ませると無限ループに陥る** DoS だった。ここで読ませるのは
`img/` に置いた自分の PNG 3 枚だけで、外部URLもデータURIも利用者入力のパスも通らないので、
この使い方では踏まない。

`npm audit fix --force` は `pptxgenjs` の破壊的アップグレードを伴い、**レイアウトが変わりうる**。
提出前に走らせないこと。

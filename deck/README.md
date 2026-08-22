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

## 提出フォームに添付する 1600×900px（別成果物）

資料に埋め込む端末フレーム画像（480×874）とは**別物**。取り違えないこと。撮り方は Playwright で
ビューポートを **1600×900** にして本番URLを操作し、ビューポートごと撮る。`.app-shell` は
1600×900 でも **480×874 固定**（内部がスクロールする端末モック）なので、フレーム全体と
タブバーが1枚に収まる。`/gaps` はデスクトップ幅のページなのでそのまま画面いっぱいに写る。

**この3点は `deck/submit/` に追跡している**（他の成果物と違って `.gitignore` していない）。理由は
**撮り直すと同じものにならない**こと —— `/gaps` の件数は稼働中のカウンターで、使われるたびに増える
（撮影中も 46 → 48 と動いた）。提出したものそのものを残すために、生成物ではなく提出物として固定する。

2026-08-22 に用意した3点（本番 `tokyo-odh-091`・興味チップのみ・自由文は空）:

| # | 画面 | 見せているもの |
| --- | --- | --- |
| 1 | プラン | 3停留地すべてに出典チップ + CC BY 4.0、カテゴリイラスト |
| 2 | あなたへ（ラーメン） | `insufficient_granularity` と理由、記録される旨の注記 |
| 3 | `/gaps` | 未回答の件数と理由別・エリア別の内訳（**稼働中のカウンターなので増える**） |

**規定は変更不可**（[../docs/01-context/CONSTRAINTS.md](../docs/01-context/CONSTRAINTS.md) §7）
（[../docs/01-context/CONSTRAINTS.md](../docs/01-context/CONSTRAINTS.md)）。

## 申請用の操作デモ動画

Jotform 3-8 に記載する動画は [`../public/demo/operation-demo.mp4`](../public/demo/operation-demo.mp4) の1本。
First Stage資料の #3・#4 は、この完成版に含まれる2つのシーンを2分資料へ配置する指示であり、
申請動画が2本あるという意味ではない。形式とハッシュは隣接する
[`public/demo/README.md`](../public/demo/README.md) を正とする。

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

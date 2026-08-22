// 旅コンシェルジュTOKYO — 提出資料（16:9・14枚）
// 文言の SSOT: docs/submission-deck.md v1.8.0 / docs/02-design/DATABASE.md §2
//
// 縦のリズム: kicker 0.24 / title 0.55–1.55 / 本文 1.95–6.85 / 下マージン 0.65
const pptxgen = require("pptxgenjs");
const { join } = require("node:path");

// 画像の読み込みと PPTX の書き出しは、このファイルの場所を基準にする。
// cwd 基準にすると `node deck/build.js` のように deck/ の外から叩いたとき、
// 画像が見つからず落ちる（実測: ENOENT で exit 1）。
const here = (f) => join(__dirname, f);

const P = {
  espresso: "2A1E14",
  card: "3A2B1E",
  cardLine: "4A3826",
  ink: "241A12",
  cream: "F7F2EC",
  brand: "8C5A14",
  gold: "D9A94E",
  tint: "F4ECE1",
  line: "E3D8C9",
  muted: "6E6259",
  dim: "BCAE9D",
  live: "2F6B3D",
  spec: "B07A1E",
  concept: "8E857B",
  white: "FFFFFF",
  alert: "A33B2A",
};
const HEAD = "Yu Mincho";
const BODY = "Yu Gothic";

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE";
pres.author = "チームshiwata";
pres.title = "旅コンシェルジュTOKYO";

const LAYER = {
  live: { label: "稼働中", color: P.live, w: 0.94 },
  spec: { label: "設計済み・未実装", color: P.spec, w: 1.5 },
  concept: { label: "デザイン構想", color: P.concept, w: 1.3 },
};

/** 3層バッジ。このデッキ唯一の視覚モチーフで、全スライドで同じ形を繰り返す。 */
function pill(slide, x, y, kind) {
  const l = LAYER[kind];
  slide.addShape(pres.ShapeType.roundRect, {
    x, y, w: l.w, h: 0.28,
    fill: { color: l.color }, rectRadius: 0.14, line: { color: l.color, width: 0 },
  });
  slide.addText(l.label, {
    x, y, w: l.w, h: 0.28,
    fontFace: BODY, fontSize: 10, bold: true, color: P.white,
    align: "center", valign: "middle", margin: 0,
  });
}

const darkSlide = () => {
  const s = pres.addSlide();
  s.background = { color: P.espresso };
  return s;
};
const lightSlide = () => {
  const s = pres.addSlide();
  s.background = { color: P.white };
  return s;
};

function title(slide, text, opts = {}) {
  slide.addText(text, {
    x: 0.75, y: 0.55, w: opts.w ?? 11.8, h: 1.0,
    fontFace: HEAD, fontSize: opts.size ?? 34, bold: true,
    color: opts.color ?? P.ink, align: "left", valign: "middle", margin: 0,
  });
}

function kicker(slide, text, dark) {
  slide.addText(text, {
    x: 0.75, y: 0.24, w: 11.8, h: 0.3,
    fontFace: BODY, fontSize: 12, bold: true, color: dark ? P.gold : P.brand,
    charSpacing: 1.5, align: "left", valign: "middle", margin: 0,
  });
}

function card(slide, o) {
  slide.addShape(pres.ShapeType.roundRect, {
    x: o.x, y: o.y, w: o.w, h: o.h,
    fill: { color: o.fill ?? P.tint }, rectRadius: 0.1,
    line: { color: o.stroke ?? P.line, width: 1 },
    shadow: { type: "outer", angle: 90, offset: 2, blur: 8, color: "000000", opacity: 0.07 },
  });
}

/** 下段の締めの一文。全スライドで同じ位置・同じ高さに置く。 */
function closer(slide, text, o = {}) {
  card(slide, { x: 0.75, y: o.y ?? 5.8, w: 11.8, h: o.h ?? 1.05, fill: o.fill ?? P.tint, stroke: o.fill ?? P.line });
  slide.addText(text, {
    x: 1.1, y: (o.y ?? 5.8) + 0.15, w: 11.1, h: (o.h ?? 1.05) - 0.3,
    fontFace: o.face ?? HEAD, fontSize: o.size ?? 17, bold: o.bold !== false,
    color: o.color ?? P.brand, lineSpacing: o.size ? o.size + 8 : 25, margin: 0, valign: "middle",
  });
}

// ─────────────────────────────────────────── 1. 表紙
{
  const s = darkSlide();
  s.addText("東京都知事杯オープンデータ・ハッカソン 2026", {
    x: 0.9, y: 1.15, w: 7.2, h: 0.32, fontFace: BODY, fontSize: 12, bold: true,
    color: P.gold, charSpacing: 1.5, margin: 0, valign: "middle",
  });
  s.addText("9,600のオープンデータを、\n旅の相棒に。", {
    x: 0.9, y: 1.75, w: 7.2, h: 2.1, fontFace: HEAD, fontSize: 40, bold: true,
    color: P.cream, lineSpacing: 52, margin: 0, valign: "top",
  });
  s.addText("旅コンシェルジュTOKYO", {
    x: 0.9, y: 4.05, w: 7.2, h: 0.5, fontFace: BODY, fontSize: 21, bold: true,
    color: P.white, margin: 0, valign: "middle",
  });
  s.addText("会話から東京都オープンデータカタログへ到達する、訪日観光客向けAI旅行ガイド。\n根拠がなければ答えない、を設計の中心に置いています。", {
    x: 0.9, y: 4.65, w: 7.2, h: 0.9, fontFace: BODY, fontSize: 13,
    color: "C9BBAA", lineSpacing: 22, margin: 0, valign: "top",
  });
  s.addText("チームshiwata", {
    x: 0.9, y: 5.85, w: 7.2, h: 0.35, fontFace: BODY, fontSize: 13, bold: true,
    color: P.gold, margin: 0, valign: "middle",
  });
  s.addImage({ path: here("img/deck-plan.png"), x: 9.25, y: 0.85, w: 3.18, h: 5.79 });
  s.addNotes("表紙。数字は9,600・200PV/日・30分→3分の3つに絞る。");
}

// ─────────────────────────────────────────── 2. 課題A
{
  const s = lightSlide();
  kicker(s, "課題 ①  データ側");
  title(s, "公開されている。しかし、届いていない。");

  const stats = [
    { n: "約9,600", u: "データセット", d: "東京都オープンデータカタログに\n公開されている数", c: P.brand },
    { n: "約200", u: "PV / 日", d: "そのカタログが実際に\n閲覧されている数", c: P.alert },
  ];
  stats.forEach((st, i) => {
    const x = 0.75 + i * 4.05;
    card(s, { x, y: 1.95, w: 3.75, h: 3.0 });
    s.addText(st.n, {
      x: x + 0.32, y: 2.28, w: 3.11, h: 1.0, fontFace: HEAD, fontSize: 44, bold: true,
      color: st.c, margin: 0, valign: "middle",
    });
    s.addText(st.u, {
      x: x + 0.32, y: 3.38, w: 3.11, h: 0.34, fontFace: BODY, fontSize: 14, bold: true,
      color: P.ink, margin: 0, valign: "middle",
    });
    s.addText(st.d, {
      x: x + 0.32, y: 3.8, w: 3.11, h: 0.85, fontFace: BODY, fontSize: 11.5,
      color: P.muted, lineSpacing: 17, margin: 0, valign: "top",
    });
  });

  card(s, { x: 8.85, y: 1.95, w: 3.7, h: 3.0, fill: P.espresso, stroke: P.espresso });
  s.addText("原因は「1データ＝1アプリ」", {
    x: 9.17, y: 2.25, w: 3.06, h: 0.8, fontFace: HEAD, fontSize: 16, bold: true,
    color: P.gold, lineSpacing: 24, margin: 0, valign: "middle",
  });
  s.addText("データセットごとに専用アプリを作る型では、アプリが作られたデータしか誰にも届きません。9,600件を1件ずつアプリ化することはできません。", {
    x: 9.17, y: 3.15, w: 3.06, h: 1.6, fontFace: BODY, fontSize: 12,
    color: P.cream, lineSpacing: 19, margin: 0, valign: "top",
  });

  closer(s, "到達手段そのものを変えないかぎり、公開数を増やしても閲覧数は動きません。", { y: 5.25, h: 1.05, size: 20 });
  s.addText("数値は 2026-08-15 時点の企画時調査に基づきます。カタログの公開件数は増え続けるため、Final Stage までに再確認します。", {
    x: 0.75, y: 6.48, w: 11.8, h: 0.38, fontFace: BODY, fontSize: 10.5,
    color: P.muted, margin: 0, valign: "middle",
  });
  s.addNotes("課題A。9,600 と 200PV/日 の落差を先に置き、原因を「1データ＝1アプリ」に特定する。");
}

// ─────────────────────────────────────────── 3. 課題B
{
  const s = lightSlide();
  kicker(s, "課題 ①  利用者側");
  title(s, "旅行者は、壁の前で立ち止まる。");

  const steps = [
    { n: "1", t: "文化・マナーで迷う", d: "参拝の作法、銭湯の入り方、公共交通での振る舞い。訪日観光客が旅先で実際に困る場面です。" },
    { n: "2", t: "答えは公共データの中にある", d: "施設情報も、文化財の由来も、東京都オープンデータカタログにすでに公開されています。" },
    { n: "3", t: "しかし到達する手段がない", d: "カタログを開き、データセットを探し、CSV を読む。旅先の数分でできることではありません。" },
  ];
  steps.forEach((st, i) => {
    const x = 0.75 + i * 4.05;
    card(s, { x, y: 1.95, w: 3.75, h: 3.2, fill: P.white, stroke: P.line });
    s.addShape(pres.ShapeType.ellipse, {
      x: x + 0.32, y: 2.28, w: 0.62, h: 0.62, fill: { color: P.brand }, line: { color: P.brand, width: 0 },
    });
    s.addText(st.n, {
      x: x + 0.32, y: 2.28, w: 0.62, h: 0.62, fontFace: HEAD, fontSize: 21, bold: true,
      color: P.white, align: "center", valign: "middle", margin: 0,
    });
    s.addText(st.t, {
      x: x + 0.32, y: 3.12, w: 3.11, h: 0.7, fontFace: HEAD, fontSize: 17, bold: true,
      color: P.ink, lineSpacing: 24, margin: 0, valign: "top",
    });
    s.addText(st.d, {
      x: x + 0.32, y: 3.9, w: 3.11, h: 1.05, fontFace: BODY, fontSize: 11.5,
      color: P.muted, lineSpacing: 17, margin: 0, valign: "top",
    });
  });

  closer(s, "公開されていても、届かなければ、開かれていない。", { y: 5.5, h: 1.2, size: 22 });
  s.addNotes("課題B。統計を主張せず、到達経路が無いという構造だけを述べる。");
}

// ─────────────────────────────────────────── 4. 解決策 + 3層凡例
{
  const s = darkSlide();
  kicker(s, "解決策 ①", true);
  title(s, "会話から、9,600件への入口をつくる。", { color: P.cream });
  s.addText("そのうえで「根拠がなければ答えない」を設計の中心に置きます。回答は必ず出典のあるデータセットに紐づき、紐づけられないときは答えを作りません。", {
    x: 0.75, y: 1.62, w: 11.8, h: 0.6, fontFace: BODY, fontSize: 13.5,
    color: "C9BBAA", lineSpacing: 21, margin: 0, valign: "top",
  });
  s.addText("この資料の読み方 — 実装の3層", {
    x: 0.75, y: 2.48, w: 11.8, h: 0.35, fontFace: BODY, fontSize: 12.5, bold: true,
    color: P.gold, margin: 0, valign: "middle",
  });

  const layers = [
    {
      k: "live", d: "本番URLで今動く",
      items: "旅のプロフィール入力／プラン生成\nあなたへ／出典チップ／gaps 記録\nD1（10データセット・1,645スポット）\n/mcp でのコア3操作公開\nText-to-SQL による D1 実照会",
    },
    {
      k: "spec", d: "仕様は確定、コードはこれから",
      items: "データ公開リクエストの都への提出\nコンシェルジュの別リポジトリ切り出しと\nMIT ライセンスでの OSS 公開",
    },
    {
      k: "concept", d: "画面デザインのみ存在",
      items: "スキャン（かざして調べる）\n周辺（近くを探す）",
    },
  ];
  layers.forEach((l, i) => {
    const x = 0.75 + i * 4.05;
    card(s, { x, y: 2.95, w: 3.75, h: 3.05, fill: P.card, stroke: P.cardLine });
    pill(s, x + 0.32, 3.2, l.k);
    s.addText(l.d, {
      x: x + 0.32, y: 3.6, w: 3.11, h: 0.32, fontFace: BODY, fontSize: 11.5, bold: true,
      color: P.cream, margin: 0, valign: "middle",
    });
    s.addText(l.items, {
      x: x + 0.32, y: 4.0, w: 3.11, h: 1.8, fontFace: BODY, fontSize: 11,
      color: P.dim, lineSpacing: 18, margin: 0, valign: "top",
    });
  });

  s.addText("以降のスライドでは、この3つのバッジで実装の状態を示します。", {
    x: 0.75, y: 6.25, w: 11.8, h: 0.35, fontFace: BODY, fontSize: 11.5,
    color: "9E9184", margin: 0, valign: "middle",
  });
  s.addNotes("3層凡例。以降の全スライドでバッジを繰り返す。");
}

// ─────────────────────────────────────────── 5. プロダクト全体像
{
  const s = lightSlide();
  kicker(s, "プロダクト ②");
  title(s, "5画面のうち、3画面が実データで動く。");

  const screens = [
    { t: "旅のプロフィール", d: "同行者・日数・興味・ペース・予算を入力", k: "live" },
    { t: "プラン", d: "出典つきの旅程を生成。マナーの解説を添える", k: "live" },
    { t: "あなたへ", d: "興味から出典つきでレコメンド", k: "live" },
    { t: "スキャン", d: "かざして調べる", k: "concept" },
    { t: "周辺", d: "近くを探す", k: "concept" },
  ];
  screens.forEach((sc, i) => {
    const x = 0.75 + i * 2.42;
    const on = sc.k === "live";
    card(s, {
      x, y: 1.95, w: 2.2, h: 3.35,
      fill: on ? P.white : "F6F4F1", stroke: on ? P.line : "E8E4DF",
    });
    s.addText(sc.t, {
      x: x + 0.22, y: 2.2, w: 1.76, h: 0.62, fontFace: HEAD, fontSize: 15.5, bold: true,
      color: on ? P.ink : P.concept, lineSpacing: 21, margin: 0, valign: "top",
    });
    s.addText(sc.d, {
      x: x + 0.22, y: 2.9, w: 1.76, h: 1.5, fontFace: BODY, fontSize: 11,
      color: on ? P.muted : P.concept, lineSpacing: 16, margin: 0, valign: "top",
    });
    pill(s, x + 0.22, 4.72, sc.k);
  });

  closer(s, "動く3画面はすべて本番URLの実データに接続しています。残る2画面は画面デザインのみで、実装していないことを資料上で区別します。", {
    y: 5.6, h: 1.15, face: BODY, size: 13.5, bold: false, color: P.ink,
  });
  s.addNotes("5画面の内訳。実装済みと構想を最初に区別して示す。");
}

// ─────────────────────────────────────────── 6・7. 動く画面
const TAB_CAPTION = "画面下部のタブ「スキャン」「周辺」はデザイン構想です（スライド4の凡例）。キャプチャは本番URLを実際に操作して取得しました（2026-08-22）。";

function screenSlide(o) {
  const s = lightSlide();
  kicker(s, o.kicker);
  title(s, o.title, { w: 7.6 });

  const imgX = o.imageRight ? 9.05 : 0.75;
  const txtX = o.imageRight ? 0.75 : 4.35;
  s.addImage({ path: o.image, x: imgX, y: 1.62, w: 2.86, h: 5.21 });

  pill(s, txtX, 1.72, "live");
  o.points.forEach((p, i) => {
    const y = 2.3 + i * 1.36;
    card(s, { x: txtX, y, w: 7.9, h: 1.16, fill: P.white, stroke: P.line });
    s.addText(p.t, {
      x: txtX + 0.32, y: y + 0.16, w: 7.3, h: 0.38, fontFace: HEAD, fontSize: 16, bold: true,
      color: P.ink, margin: 0, valign: "middle",
    });
    s.addText(p.d, {
      x: txtX + 0.32, y: y + 0.57, w: 7.3, h: 0.45, fontFace: BODY, fontSize: 11.5,
      color: P.muted, lineSpacing: 16, margin: 0, valign: "top",
    });
  });

  s.addText(o.caption, {
    x: txtX, y: 6.42, w: 7.9, h: 0.45, fontFace: BODY, fontSize: 10.5,
    color: P.muted, lineSpacing: 15, margin: 0, valign: "top",
  });
  s.addNotes(o.notes);
}

screenSlide({
  kicker: "動く画面 ①  ②",
  title: "すべての提案に、出典が付く。",
  image: here("img/deck-plan.png"),
  imageRight: true,
  points: [
    { t: "旅のプロフィールから旅程を組み立てる", d: "同行者・日数・興味・ペース・予算を受け取り、オープンデータから停留地を選びます。" },
    { t: "停留地ごとにデータセットの出典を表示", d: "データセット名・提供元・取得日と、東京都オープンデータカタログへのリンクが付きます。" },
    { t: "CC BY 4.0 の表示義務を自動で満たす", d: "回答が必ずデータセットに紐づくため、ライセンス表示が構造的に落ちません。" },
  ],
  caption: TAB_CAPTION,
  notes: "プラン画面。3停留地すべてに出典チップが付いていることを指す。",
});

screenSlide({
  kicker: "動く画面 ②  ②",
  title: "興味から、出典つきで薦める。",
  image: here("img/deck-foryou.png"),
  imageRight: false,
  points: [
    { t: "興味チップを選ぶとレコメンドが変わる", d: "「文化」を選ぶと、その興味に答えられるデータセットから候補を選びます。" },
    { t: "1件ずつに出典とライセンスが付く", d: "プラン画面と同じ出典チップが、レコメンドカードにも必ず付きます。" },
    { t: "マナーの参考情報は出典と区別して表示", d: "JNTO の参考情報は「参考」として、オープンデータの出典とは見た目もラベルも分けています。" },
  ],
  caption: TAB_CAPTION,
  notes: "あなたへ画面。出典（オープンデータ）と参考（JNTO）を混ぜていないことが要点。",
});

// ─────────────────────────────────────────── 8. 【山】答えられないときは、答えません
{
  const s = darkSlide();
  kicker(s, "プロダクト ②  この資料の山", true);
  title(s, "答えられないときは、答えません", { color: P.cream, w: 8.0 });

  s.addImage({ path: here("img/deck-ramen.png"), x: 9.05, y: 1.62, w: 2.86, h: 5.21 });

  pill(s, 0.75, 1.72, "live");
  s.addText("このケースでは 粒度不足 と判定し、理由とともに返します", {
    x: 0.75, y: 2.25, w: 7.9, h: 0.5, fontFace: HEAD, fontSize: 20, bold: true,
    color: P.gold, margin: 0, valign: "middle",
  });

  card(s, { x: 0.75, y: 2.98, w: 7.9, h: 1.66, fill: P.card, stroke: P.cardLine });
  s.addText("実測", {
    x: 1.07, y: 3.18, w: 7.26, h: 0.3, fontFace: BODY, fontSize: 11, bold: true,
    color: P.gold, charSpacing: 1.5, margin: 0, valign: "middle",
  });
  s.addText("東京都内の飲食店バリアフリー情報 210件中、ラーメン店は3件（板橋区・武蔵野市・青梅市）。代表エリアには0件", {
    x: 1.07, y: 3.54, w: 7.26, h: 0.9, fontFace: BODY, fontSize: 14,
    color: P.cream, lineSpacing: 23, margin: 0, valign: "top",
  });

  card(s, { x: 0.75, y: 4.84, w: 7.9, h: 1.5, fill: P.card, stroke: P.cardLine });
  s.addText("答えを作らないことが、答えです", {
    x: 1.07, y: 5.02, w: 7.26, h: 0.4, fontFace: HEAD, fontSize: 16, bold: true,
    color: P.cream, margin: 0, valign: "middle",
  });
  s.addText("ジャンル列を持たないデータに「ラーメン」を尋ねられたとき、それらしい店を返すことはできます。返しません。判定の理由を分類つきで返し、答えられなかった問いとして記録します。", {
    x: 1.07, y: 5.44, w: 7.26, h: 0.8, fontFace: BODY, fontSize: 11.5,
    color: P.dim, lineSpacing: 17, margin: 0, valign: "top",
  });

  s.addText(TAB_CAPTION, {
    x: 0.75, y: 6.5, w: 7.9, h: 0.45, fontFace: BODY, fontSize: 10,
    color: "9E9184", lineSpacing: 14, margin: 0, valign: "top",
  });
  s.addNotes("山。文言は submission-deck.md §3 で固定。一般化した断定を足さないこと。");
}

// ─────────────────────────────────────────── 9. 仕組み
{
  const s = lightSlide();
  kicker(s, "仕組み ②");
  title(s, "出典強制を、アーキテクチャで担保する。");

  const boxes = [
    { t: "React アプリ", d: "旅コンシェルジュTOKYO\n（最初のクライアント）", k: "live" },
    { t: "コア3操作", d: "search_datasets\naggregate_dataset\nget_provenance", k: "live" },
    { t: "Cloudflare D1", d: "10データセット\n1,645スポット", k: "live" },
  ];
  boxes.forEach((b, i) => {
    const x = 0.75 + i * 4.28;
    card(s, { x, y: 1.95, w: 3.6, h: 2.2, fill: P.white, stroke: P.line });
    s.addText(b.t, {
      x: x + 0.3, y: 2.18, w: 3.0, h: 0.4, fontFace: HEAD, fontSize: 17, bold: true,
      color: P.ink, margin: 0, valign: "middle",
    });
    s.addText(b.d, {
      x: x + 0.3, y: 2.66, w: 3.0, h: 0.9, fontFace: BODY, fontSize: 11.5,
      color: P.muted, lineSpacing: 18, margin: 0, valign: "top",
    });
    pill(s, x + 0.3, 3.62, b.k);
    if (i < 2) {
      s.addText("→", {
        x: x + 3.62, y: 2.8, w: 0.64, h: 0.5, fontFace: BODY, fontSize: 22, bold: true,
        color: P.brand, align: "center", valign: "middle", margin: 0,
      });
    }
  });

  card(s, { x: 0.75, y: 4.45, w: 5.94, h: 2.1, fill: P.tint, stroke: P.line });
  s.addText("同じ3操作を /mcp でも公開", {
    x: 1.07, y: 4.68, w: 5.3, h: 0.4, fontFace: HEAD, fontSize: 16, bold: true,
    color: P.ink, margin: 0, valign: "middle",
  });
  s.addText("AI クライアントや翌年の参加者が、旅行アプリを経由せずに同じコア3操作を呼べます。本番で稼働しています。", {
    x: 1.07, y: 5.14, w: 5.3, h: 0.85, fontFace: BODY, fontSize: 11.5,
    color: P.muted, lineSpacing: 17, margin: 0, valign: "top",
  });
  pill(s, 1.07, 6.06, "live");

  card(s, { x: 6.94, y: 4.45, w: 5.61, h: 2.1, fill: P.espresso, stroke: P.espresso });
  s.addText("出典が取れない回答は生成しない", {
    x: 7.26, y: 4.68, w: 4.97, h: 0.4, fontFace: HEAD, fontSize: 16, bold: true,
    color: P.gold, margin: 0, valign: "middle",
  });
  s.addText("回答は必ずデータセットに紐づきます。紐づけられない問いは未回答として理由つきで返すため、CC BY 4.0 の表示義務が運用ではなく構造で満たされます。", {
    x: 7.26, y: 5.14, w: 4.97, h: 1.2, fontFace: BODY, fontSize: 11.5,
    color: P.cream, lineSpacing: 18, margin: 0, valign: "top",
  });
  s.addNotes("アーキテクチャ。出典強制が運用ルールではなく構造であることが要点。");
}

// ─────────────────────────────────────────── 10. データが育つループ
{
  const s = lightSlide();
  kicker(s, "仕組み ②  自己改善");
  title(s, "答えられなかった問いが、次のデータになる。");

  const steps = [
    { n: "1", t: "未回答が出る", d: "出典を付けられない問いは、答えを作らずに未回答として返します。", k: "live" },
    { n: "2", t: "gaps に記録する", d: "問い・エリア・理由分類を本番 D1 に記録します。実際に行が増えています。", k: "live" },
    { n: "3", t: "分類して束ねる", d: "データ未公開・粒度不足・対象エリア外などに分けて集計します。", k: "live" },
    { n: "4", t: "都へ公開リクエスト", d: "何が足りないかを、東京都へのデータ公開リクエストに変えていきます。", k: "spec" },
  ];
  steps.forEach((st, i) => {
    const x = 0.75 + i * 3.02;
    const on = st.k === "live";
    card(s, { x, y: 1.95, w: 2.78, h: 3.55, fill: on ? P.white : "FBF8F3", stroke: P.line });
    s.addShape(pres.ShapeType.ellipse, {
      x: x + 0.26, y: 2.24, w: 0.58, h: 0.58,
      fill: { color: on ? P.brand : P.spec }, line: { color: on ? P.brand : P.spec, width: 0 },
    });
    s.addText(st.n, {
      x: x + 0.26, y: 2.24, w: 0.58, h: 0.58, fontFace: HEAD, fontSize: 19, bold: true,
      color: P.white, align: "center", valign: "middle", margin: 0,
    });
    s.addText(st.t, {
      x: x + 0.26, y: 3.02, w: 2.26, h: 0.65, fontFace: HEAD, fontSize: 15.5, bold: true,
      color: P.ink, lineSpacing: 21, margin: 0, valign: "top",
    });
    s.addText(st.d, {
      x: x + 0.26, y: 3.74, w: 2.26, h: 1.3, fontFace: BODY, fontSize: 11,
      color: P.muted, lineSpacing: 16, margin: 0, valign: "top",
    });
    pill(s, x + 0.26, 5.08, st.k);
    if (i < 3) {
      s.addText("→", {
        x: x + 2.8, y: 3.5, w: 0.22, h: 0.5, fontFace: BODY, fontSize: 18, bold: true,
        color: P.brand, align: "center", valign: "middle", margin: 0,
      });
    }
  });

  closer(s, "答えられないことを記録に残すと、それは失敗ではなく、次に何を公開してほしいかの一次情報になります。", { y: 5.8, h: 1.05, size: 17 });
  s.addNotes("gaps ループ。記録までは稼働中、都への提出プロセスは未実装であることを区別する。");
}

// ─────────────────────────────────────────── 11. 基盤の開放
{
  const s = lightSlide();
  kicker(s, "プロダクト ②  基盤の開放");
  title(s, "旅行アプリは、最初のクライアントにすぎない。");

  card(s, { x: 0.75, y: 1.95, w: 5.8, h: 2.35, fill: P.white, stroke: P.line });
  s.addText("MCP サーバーとして公開", {
    x: 1.07, y: 2.18, w: 5.16, h: 0.4, fontFace: HEAD, fontSize: 17, bold: true,
    color: P.ink, margin: 0, valign: "middle",
  });
  s.addText("オープンデータ・コンシェルジュのコア3操作を /mcp で公開しています。AI クライアントや翌年の参加者が、この旅行アプリを経由せずに同じ操作を呼べます。", {
    x: 1.07, y: 2.64, w: 5.16, h: 1.0, fontFace: BODY, fontSize: 11.5,
    color: P.muted, lineSpacing: 17, margin: 0, valign: "top",
  });
  pill(s, 1.07, 3.78, "live");

  card(s, { x: 6.75, y: 1.95, w: 5.8, h: 2.35, fill: "FBF8F3", stroke: P.line });
  s.addText("別リポジトリへ切り出して OSS 公開", {
    x: 7.07, y: 2.18, w: 5.16, h: 0.4, fontFace: HEAD, fontSize: 17, bold: true,
    color: P.ink, margin: 0, valign: "middle",
  });
  s.addText("コンシェルジュ（バックエンド）を独立したリポジトリへ切り出し、MIT ライセンスで公開する予定です。旅行アプリのフロントエンドは対象に含めません。", {
    x: 7.07, y: 2.64, w: 5.16, h: 1.0, fontFace: BODY, fontSize: 11.5,
    color: P.muted, lineSpacing: 17, margin: 0, valign: "top",
  });
  pill(s, 7.07, 3.78, "spec");

  s.addText("ライセンスは2つ。混ぜないこと。", {
    x: 0.75, y: 4.55, w: 11.8, h: 0.4, fontFace: BODY, fontSize: 12.5, bold: true,
    color: P.brand, margin: 0, valign: "middle",
  });
  const lic = [
    { t: "コード側 ｜ MIT ライセンス（公開予定）", d: "オープンデータ・コンシェルジュの実装。自由に利用・改変・再配布できる形で公開します。" },
    { t: "データ側 ｜ CC BY 4.0（出典表示義務あり）", d: "扱う東京都オープンデータのライセンス。利用時は出典表示が必要で、これはコード側の条件とは別物です。" },
  ];
  lic.forEach((l, i) => {
    const x = 0.75 + i * 6.0;
    card(s, { x, y: 5.05, w: 5.8, h: 1.65, fill: P.espresso, stroke: P.espresso });
    s.addText(l.t, {
      x: x + 0.32, y: 5.25, w: 5.16, h: 0.38, fontFace: HEAD, fontSize: 14.5, bold: true,
      color: P.gold, margin: 0, valign: "middle",
    });
    s.addText(l.d, {
      x: x + 0.32, y: 5.68, w: 5.16, h: 0.85, fontFace: BODY, fontSize: 11,
      color: P.cream, lineSpacing: 16, margin: 0, valign: "top",
    });
  });
  s.addNotes("基盤開放。MIT（コード・公開予定）と CC BY 4.0（データ）を別物として並記する。");
}

// ─────────────────────────────────────────── 12. 利用オープンデータ10件
{
  const s = lightSlide();
  kicker(s, "利用オープンデータ ③");
  title(s, "利用オープンデータ 10件");
  s.addText("全件 CC BY 4.0 ／ 2026-08-16 取得 ／ カタログAPI（package_show）で実体を検証済み", {
    x: 0.75, y: 1.4, w: 11.8, h: 0.32, fontFace: BODY, fontSize: 11.5,
    color: P.muted, margin: 0, valign: "middle",
  });

  const rows = [
    ["1", "名所・史跡", "台東区", "45", "t131067d0000000251", "中核。寺社と史跡。作法案内の出典"],
    ["2", "文化観光施設", "台東区", "30", "t131067d0000000236", "中核。上野の館と浅草文化観光センター"],
    ["3", "文化財一覧", "台東区", "190", "t131067d0000000393", "指定文化財の詳細。No.1 の説明を深める"],
    ["4", "トイレ情報", "台東区", "69", "t131067d0000000249", "旅程の実行可能性。自治体標準データ準拠"],
    ["5", "めぐりん停留所（東西めぐりん）", "台東区", "72", "t131067d0000000247", "エリア間の移動手段"],
    ["6", "銭湯", "台東区", "23", "t131067d0000000256", "営業時間・料金を持つ文化体験"],
    ["7", "宿泊施設（旅館台帳）", "台東区", "883", "t131067d2025000004", "旅の拠点"],
    ["8", "東京都内の飲食店のバリアフリー情報", "東京都産業労働局", "210", "t000012d0000000063", "飲食の唯一の店舗単位データ。欠損の実例"],
    ["9", "R6国・地域別外国人旅行者行動特性調査", "東京都産業労働局", "22", "t000012d0000000081", "訪日客の行動特性。唯一の統計表"],
    ["10", "都市公園・都立公園一覧（渋谷区）", "渋谷区", "123", "t131130d2025000003", "第2エリア（渋谷）の面"],
  ];
  const head = ["No.", "登録タイトル", "提供元", "件数", "データセットID", "役割"];
  // 合計は 11.8（表の幅）と一致させる。データセットID は 18 桁固定なので専用幅を取る。
  const colW = [0.5, 3.6, 1.5, 0.65, 1.6, 3.95];
  const ID_COL = 4;
  const tblRows = [
    head.map((h) => ({
      text: h,
      options: {
        fill: { color: P.espresso }, color: P.gold, bold: true, fontSize: 11, fontFace: BODY,
        align: "left", valign: "middle", margin: [4, 8, 4, 8],
      },
    })),
    ...rows.map((r, i) =>
      r.map((c, j) => ({
        text: c,
        options: {
          fill: { color: i % 2 === 0 ? P.white : "FAF7F2" },
          color: j === 1 ? P.ink : P.muted,
          bold: j === 1,
          fontSize: j === ID_COL ? 9 : 10.5, fontFace: BODY,
          align: j === 0 || j === 3 ? "center" : "left",
          valign: "middle", margin: [4, 8, 4, 8],
        },
      })),
    ),
  ];
  s.addTable(tblRows, {
    x: 0.75, y: 1.85, w: 11.8, colW, rowH: 0.38,
    border: { type: "solid", color: P.line, pt: 1 },
    autoPage: false,
  });
  s.addText(
    [
      // ライセンス（全件 CC BY 4.0）は上の小見出しに出ているので、ここでは繰り返さない。
      "カタログURL: https://catalog.data.metro.tokyo.lg.jp/dataset/ に上表のデータセットIDをそのまま繋いだもの。出典を表示したうえで二次利用しています。",
      "件数: 原データの行数。No.9 は統計表のため D1 のスポット表へは取り込まず、出典情報のみ登録している（スポット合計 1,645 件）。",
    ].join("\n"),
    {
      x: 0.75, y: 6.2, w: 11.8, h: 0.42, fontFace: BODY, fontSize: 9,
      color: P.muted, lineSpacing: 11, margin: 0, valign: "top",
    },
  );
  s.addNotes("利用オープンデータ10件。提出フォームにはデータURL＋タイトルで登録する。");
}

// ─────────────────────────────────────────── 13. インパクト／KPI
{
  const s = lightSlide();
  kicker(s, "インパクト ①");
  title(s, "何が変わるか。");

  const kpis = [
    {
      n: "約30分 → 約3分", size: 24, c: P.brand, t: "情報探索時間",
      d: "30分＝開発メンバーが初めてカタログを人手で探した体験に基づく目安。3分＝アプリの操作一巡（条件入力〜出典付きルート表示）の目安。",
      tag: "体験・操作一巡に基づく目安",
    },
    {
      n: "100%", size: 44, c: P.live, t: "出典付与率",
      d: "設計上の必達要件。根拠のあるデータセットに紐づけられない回答は生成しません。",
      tag: "設計上の必達要件",
    },
    {
      n: "3エリア", size: 36, c: P.ink, t: "観光の分散と都政への還元",
      d: "上野・浅草・渋谷を対象に、定番以外の停留地を出典つきで提案し、答えられなかった問いを都へ還元します。",
      tag: "上野・浅草・渋谷",
    },
  ];
  kpis.forEach((k, i) => {
    const x = 0.75 + i * 4.05;
    card(s, { x, y: 1.95, w: 3.75, h: 3.6, fill: P.white, stroke: P.line });
    s.addText(k.n, {
      x: x + 0.32, y: 2.2, w: 3.11, h: 0.95, fontFace: HEAD, fontSize: k.size, bold: true,
      color: k.c, margin: 0, valign: "middle",
    });
    s.addText(k.t, {
      x: x + 0.32, y: 3.24, w: 3.11, h: 0.38, fontFace: BODY, fontSize: 13, bold: true,
      color: P.ink, margin: 0, valign: "middle",
    });
    s.addText(k.d, {
      x: x + 0.32, y: 3.7, w: 3.11, h: 1.25, fontFace: BODY, fontSize: 11,
      color: P.muted, lineSpacing: 16, margin: 0, valign: "top",
    });
    s.addShape(pres.ShapeType.roundRect, {
      x: x + 0.32, y: 5.05, w: 3.11, h: 0.32,
      fill: { color: P.tint }, rectRadius: 0.16, line: { color: P.line, width: 1 },
    });
    s.addText(k.tag, {
      x: x + 0.32, y: 5.05, w: 3.11, h: 0.32, fontFace: BODY, fontSize: 9.5, bold: true,
      color: P.muted, align: "center", valign: "middle", margin: 0,
    });
  });

  closer(s, "「約30分 → 約3分」は統制された比較計測ではありません。30分は開発メンバーの初回探索体験、3分は操作一巡の目安で、通しの計測は行っていないため「実測」とは書いていません。", {
    y: 5.85, h: 1.0, fill: P.espresso, face: BODY, size: 12.5, bold: false, color: P.cream,
  });
  s.addNotes("KPI。30分→3分は体験・操作一巡に基づく目安であることをスライド上で明示する。「実測」とは書かない（Issue #130 / submission-deck.md v1.6.0 §1）。");
}

// ─────────────────────────────────────────── 14. チーム紹介
{
  const s = darkSlide();
  kicker(s, "チーム紹介 ④", true);
  title(s, "チームshiwata", { color: P.cream });

  const team = [
    { n: "shiwata", i: "S", r: "発起人／プレゼンター" },
    { n: "sho gamoh", i: "G", r: "本サービスの発案者／\nフロントエンド担当" },
    { n: "フトシ", i: "F", r: "オープンデータ・コンシェルジュ発案者／\nバックエンド・クラウド・AI駆動開発支援" },
  ];
  team.forEach((m, idx) => {
    const x = 0.75 + idx * 4.05;
    card(s, { x, y: 2.0, w: 3.75, h: 3.0, fill: P.card, stroke: P.cardLine });
    s.addShape(pres.ShapeType.ellipse, {
      x: x + 0.32, y: 2.32, w: 0.74, h: 0.74, fill: { color: P.gold }, line: { color: P.gold, width: 0 },
    });
    s.addText(m.i, {
      x: x + 0.32, y: 2.32, w: 0.74, h: 0.74, fontFace: HEAD, fontSize: 24, bold: true,
      color: P.espresso, align: "center", valign: "middle", margin: 0,
    });
    s.addText(m.n, {
      x: x + 0.32, y: 3.28, w: 3.11, h: 0.45, fontFace: HEAD, fontSize: 19, bold: true,
      color: P.cream, margin: 0, valign: "middle",
    });
    s.addText(m.r, {
      x: x + 0.32, y: 3.82, w: 3.11, h: 0.95, fontFace: BODY, fontSize: 11.5,
      color: P.dim, lineSpacing: 18, margin: 0, valign: "top",
    });
  });

  s.addText("9,600のオープンデータを、旅の相棒に。", {
    x: 0.75, y: 5.55, w: 11.8, h: 0.6, fontFace: HEAD, fontSize: 24, bold: true,
    color: P.gold, margin: 0, valign: "middle",
  });
  s.addText("https://tabi-concierge-tokyo.tokyo-odh-091.workers.dev", {
    x: 0.75, y: 6.22, w: 11.8, h: 0.35, fontFace: BODY, fontSize: 12,
    color: "9E9184", margin: 0, valign: "middle",
  });
  s.addNotes("チーム紹介。役割分担のみを載せる。");
}

pres.writeFile({ fileName: here("tabi-concierge-tokyo-submission.pptx") }).then((f) => console.log("wrote", f));

import { describe, expect, it } from "vitest";
import { parseCsv, parseCsvRecords } from "./csv.ts";

describe("parseCsv", () => {
  it("素朴な行を分割する", () => {
    expect(parseCsv("a,b,c\n1,2,3")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("引用符の中のカンマを区切りとして扱わない", () => {
    // 文化財一覧の備考欄は引用符付きでカンマを含む
    expect(parseCsv('name,note\n"寛永寺","上野桜木1丁目, 台東区"')).toEqual([
      ["name", "note"],
      ["寛永寺", "上野桜木1丁目, 台東区"],
    ]);
  });

  it("引用符の中の改行を行区切りとして扱わない", () => {
    expect(parseCsv('a,b\n"1\n2",3')).toEqual([
      ["a", "b"],
      ["1\n2", "3"],
    ]);
  });

  it('"" を引用符1つとして扱う', () => {
    expect(parseCsv('a\n"say ""hi"""')).toEqual([["a"], ['say "hi"']]);
  });

  it("CRLF を LF として扱う", () => {
    expect(parseCsv("a,b\r\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("空行を落とす（末尾改行で空レコードを作らない）", () => {
    expect(parseCsv("a,b\n1,2\n")).toHaveLength(2);
    expect(parseCsv("a,b\n\n1,2\n\n")).toHaveLength(2);
  });
});

describe("parseCsvRecords", () => {
  it("ヘッダをキーにしたレコードを返す", () => {
    expect(parseCsvRecords("名称,所在地\n寛永寺,上野桜木1丁目14番")).toEqual([
      { 名称: "寛永寺", 所在地: "上野桜木1丁目14番" },
    ]);
  });

  it("値の前後空白を落とす", () => {
    expect(parseCsvRecords("a,b\n 1 , 2 ")).toEqual([{ a: "1", b: "2" }]);
  });

  it("列が足りない行は空文字で埋める（undefined を混ぜない）", () => {
    expect(parseCsvRecords("a,b,c\n1,2")).toEqual([{ a: "1", b: "2", c: "" }]);
  });

  it("空入力では空配列を返す", () => {
    expect(parseCsvRecords("")).toEqual([]);
  });
});

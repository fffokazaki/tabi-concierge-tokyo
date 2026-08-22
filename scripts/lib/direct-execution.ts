/**
 * 「このモジュールが CLI として直接実行されたか」の判定。
 *
 * `import.meta.filename === process.argv[1]` の素朴な比較だと、symlink やパス別名で
 * 両者が食い違ったときに **main が走らないまま正常終了する**（silent success）。
 * ゲート系のスクリプトなら「検査が黙って無効化される」で済むが、値を出力する
 * スクリプトでは「空の出力＋終了コード 0」になり、**結果が 0 件だったのと区別が付かない**。
 *
 * macOS の `/tmp` → `/private/tmp` や git worktree の配置で実際に起こりうるため、
 * 実在パスは realpath まで正規化してから比較する。
 *
 * `scripts/ace/` の 3 ファイルが同じ関数を各自持っている（コピー元）。
 * 1 か所へ寄せるのは [Issue #196](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/196)。
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

export function isDirectExecution(moduleUrl: string, argvPath: string | undefined): boolean {
  if (!argvPath) return false;
  const modulePath = fileURLToPath(moduleUrl);
  // 未作成パス（テストの合成パス）は realpath が投げるので resolve へフォールバックする。
  try {
    return fs.realpathSync.native(modulePath) === fs.realpathSync.native(path.resolve(argvPath));
  } catch {
    return path.resolve(modulePath) === path.resolve(argvPath);
  }
}

import { useId, useState, type ReactNode, type SyntheticEvent } from "react";
import {
  callOperation,
  peekAnswerStatus,
  type ConsoleOperation,
  type ConsoleResult,
} from "./apiRequest";

/** submit イベントの型。React 19 の型定義では `FormEvent` が deprecated のためこちらを使う */
type SubmitEvent = SyntheticEvent<HTMLFormElement>;

/**
 * 開発用 API コンソール。コア3操作をフォームから叩き、生の応答を確認する。
 *
 * 入力を**検証も補正もしない**のは意図。`limit: 0` や空の `datasetIds` を
 * そのまま送れることが、400 の経路や判定順序を確かめる道具としての価値になる。
 * 唯一の変換は `limit`（数値らしければ数値化）と `datasetIds`（カンマ区切り→配列）で、
 * どちらも「JSON でどう送るか」の表現上の都合による。
 */
export function ApiConsole() {
  // 検索候補から集計・出典へ datasetId を引き継ぐため、2フォームの入力は親が持つ
  const [aggregateDatasetId, setAggregateDatasetId] = useState("");
  const [provenanceDatasetIds, setProvenanceDatasetIds] = useState("");

  const adoptDatasetId = (datasetId: string) => {
    setAggregateDatasetId(datasetId);
    // 出典は複数データセットを横断できるため、置き換えではなく末尾へ追加する（重複は足さない）
    setProvenanceDatasetIds((current) => {
      const ids = splitIds(current);
      return ids.includes(datasetId) ? current : [...ids, datasetId].join(", ");
    });
  };

  return (
    <section className="card api-console">
      <h2>API コンソール</h2>
      <p className="muted">
        コア3操作のスタブ（<code>worker/core/</code>）を生のまま叩けます。入力は検証せずそのまま送るので、
        範囲外の <code>limit</code> や空の <code>datasetIds</code> で 400 の経路も確かめられます。開発ビルド限定。
      </p>

      <SearchForm onAdoptDatasetId={adoptDatasetId} />
      <AggregateForm datasetId={aggregateDatasetId} onDatasetIdChange={setAggregateDatasetId} />
      <ProvenanceForm datasetIds={provenanceDatasetIds} onDatasetIdsChange={setProvenanceDatasetIds} />
    </section>
  );
}

const splitIds = (raw: string): string[] =>
  raw
    .split(/[,\s]+/)
    .map((id) => id.trim())
    .filter((id) => id !== "");

/** 数値らしい入力だけ数値にする。"abc" はそのまま送り、型違反の 400 を試せるようにする */
const numberIfNumeric = (raw: string): number | string => {
  const trimmed = raw.trim();
  return trimmed !== "" && Number.isFinite(Number(trimmed)) ? Number(trimmed) : trimmed;
};

function SearchForm({ onAdoptDatasetId }: { onAdoptDatasetId: (datasetId: string) => void }) {
  const [query, setQuery] = useState("上野の寺社をめぐりたい");
  const [area, setArea] = useState("");
  const [category, setCategory] = useState("");
  const [limit, setLimit] = useState("");
  const { result, running, submit } = useOperation("search_datasets");

  const onSubmit = (event: SubmitEvent) => {
    event.preventDefault();
    void submit({
      query,
      ...(area.trim() !== "" ? { area } : {}),
      ...(category.trim() !== "" ? { category } : {}),
      ...(limit.trim() !== "" ? { limit: numberIfNumeric(limit) } : {}),
    });
  };

  const candidates = extractCandidates(result);

  return (
    <OperationBlock
      title="search_datasets — POST /api/search-datasets"
      onSubmit={onSubmit}
      running={running}
      result={result}
      extra={
        candidates.length > 0 && (
          <div className="console-candidates">
            <p className="muted">候補の datasetId を集計・出典フォームへ:</p>
            <div className="choice-group__options">
              {candidates.map((candidate) => (
                <button
                  key={candidate.datasetId}
                  type="button"
                  className="chip"
                  onClick={() => onAdoptDatasetId(candidate.datasetId)}
                >
                  {candidate.title}
                </button>
              ))}
            </div>
          </div>
        )
      }
    >
      <Field label="query（必須）" value={query} onChange={setQuery} />
      <Field label="area" value={area} onChange={setArea} placeholder="上野 / 浅草 / 渋谷（他も送れる）" />
      <Field label="category" value={category} onChange={setCategory} placeholder="神社・公園など" />
      <Field label="limit" value={limit} onChange={setLimit} placeholder="既定 4・上限 10（範囲外も送れる）" />
    </OperationBlock>
  );
}

function AggregateForm({
  datasetId,
  onDatasetIdChange,
}: {
  datasetId: string;
  onDatasetIdChange: (value: string) => void;
}) {
  const [intent, setIntent] = useState("上野エリアの寺社を1件");
  const { result, running, submit } = useOperation("aggregate_dataset");

  const onSubmit = (event: SubmitEvent) => {
    event.preventDefault();
    void submit({ datasetId, intent });
  };

  return (
    <OperationBlock
      title="aggregate_dataset — POST /api/aggregate-dataset"
      onSubmit={onSubmit}
      running={running}
      result={result}
    >
      <Field label="datasetId（必須）" value={datasetId} onChange={onDatasetIdChange} placeholder="t131067d0000000251" />
      <Field label="intent（必須）" value={intent} onChange={setIntent} />
    </OperationBlock>
  );
}

function ProvenanceForm({
  datasetIds,
  onDatasetIdsChange,
}: {
  datasetIds: string;
  onDatasetIdsChange: (value: string) => void;
}) {
  const [query, setQuery] = useState("上野の寺社（検索条件）");
  const { result, running, submit } = useOperation("get_provenance");

  const onSubmit = (event: SubmitEvent) => {
    event.preventDefault();
    void submit({ datasetIds: splitIds(datasetIds), query });
  };

  return (
    <OperationBlock
      title="get_provenance — POST /api/provenance"
      onSubmit={onSubmit}
      running={running}
      result={result}
    >
      <Field
        label="datasetIds（カンマ区切り・必須）"
        value={datasetIds}
        onChange={onDatasetIdsChange}
        placeholder="t131067d0000000251, t131067d0000000236"
      />
      <Field label="query（必須）" value={query} onChange={setQuery} />
    </OperationBlock>
  );
}

/** 1操作分の実行状態。多重送信だけ防ぎ、結果は常に最後の1件を表示する */
function useOperation(operation: ConsoleOperation) {
  const [result, setResult] = useState<ConsoleResult | null>(null);
  const [running, setRunning] = useState(false);

  const submit = async (body: unknown) => {
    if (running) return;
    setRunning(true);
    try {
      setResult(await callOperation(operation, body));
    } finally {
      setRunning(false);
    }
  };

  return { result, running, submit };
}

function OperationBlock({
  title,
  onSubmit,
  running,
  result,
  extra,
  children,
}: {
  title: string;
  onSubmit: (event: SubmitEvent) => void;
  running: boolean;
  result: ConsoleResult | null;
  extra?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="console-block">
      <h3 className="console-block__title">{title}</h3>
      <form onSubmit={onSubmit} className="console-form">
        {children}
        <button type="submit" className="chip chip--active" disabled={running}>
          {running ? "送信中…" : "送信"}
        </button>
      </form>
      {extra}
      <ResultView result={result} />
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  // ラベルと入力の対応にだけ使う
  const id = useId();
  return (
    <label className="console-field" htmlFor={id}>
      <span className="console-field__label">{label}</span>
      <input
        id={id}
        className="notes-input"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function ResultView({ result }: { result: ConsoleResult | null }) {
  if (result === null) return null;

  switch (result.kind) {
    case "ok": {
      // answered / unanswered はどちらも正常応答（API.md §4）。バッジで区別だけする
      const answer = peekAnswerStatus(result.body);
      const badge =
        answer === "answered" ? "回答あり" : answer === "unanswered" ? "回答なし（正常）" : "200（status 不明）";
      return (
        <ResultShell
          headline={`HTTP ${result.status} ・ ${result.elapsedMs}ms ・ ${badge}`}
          tone={answer === "unknown" ? "warn" : "ok"}
          body={pretty(result.body)}
        />
      );
    }
    case "http":
      return (
        <ResultShell
          headline={`HTTP ${result.status} ・ ${result.elapsedMs}ms ・ エラー応答`}
          tone="error"
          body={result.body !== undefined ? pretty(result.body) : (result.rawText ?? "")}
        />
      );
    case "parse":
      // サーバーは応答している。「接続できません」に寄せない（原因と逆方向へ誘導するため）
      return (
        <ResultShell
          headline={`HTTP ${result.status} ・ ${result.elapsedMs}ms ・ 応答を読めません（${result.detail}）`}
          tone="error"
          body={result.rawText}
        />
      );
    case "network":
      return (
        <ResultShell
          headline={`サーバーに接続できません（${result.detail}）・ ${result.elapsedMs}ms`}
          tone="error"
        />
      );
    case "input":
      return (
        <ResultShell
          headline={`リクエストボディを JSON にできません（${result.detail}）— 送信していません`}
          tone="error"
        />
      );
  }
}

function ResultShell({ headline, tone, body }: { headline: string; tone: "ok" | "warn" | "error"; body?: string }) {
  return (
    <div className={`console-result console-result--${tone}`} role={tone === "error" ? "alert" : "status"}>
      <p className="console-result__headline">{headline}</p>
      {body !== undefined && <pre className="console-result__body">{body || "（本文は空でした）"}</pre>}
    </div>
  );
}

const pretty = (value: unknown): string => JSON.stringify(value, null, 2);

/** 検索の `answered` 応答から候補を取り出す。形が仕様外なら空（表示は生 JSON 側に任せる） */
function extractCandidates(result: ConsoleResult | null): { datasetId: string; title: string }[] {
  if (result?.kind !== "ok" || peekAnswerStatus(result.body) !== "answered") return [];
  const candidates = (result.body as { candidates?: unknown }).candidates;
  if (!Array.isArray(candidates)) return [];
  return candidates.filter(
    (candidate): candidate is { datasetId: string; title: string } =>
      typeof candidate === "object" &&
      candidate !== null &&
      typeof (candidate as { datasetId?: unknown }).datasetId === "string" &&
      typeof (candidate as { title?: unknown }).title === "string",
  );
}

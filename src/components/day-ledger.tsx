import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { getRates, listDay, removeBank, removeExpense, removePurchase, removeSale } from "@/lib/ledger.functions";
import {
  addAmounts,
  categoryLabel,
  centreFromLines,
  errorText,
  formatClock,
  formatInr,
  leftAfter,
  longDate,
  paymentLabel,
  toCents,
  type BankLine,
  type LedgerLine,
} from "@/lib/ledger";
import { cn } from "@/lib/cn";

export function DayLedger({
  date,
  mode,
  today,
  canRemove,
  showProfit = false,
  compact = false,
}: {
  date: string;
  mode: "sale" | "purchase" | "expense" | "bank";
  today: string;
  canRemove: boolean;
  showProfit?: boolean;
  compact?: boolean;
}) {
  const query = useQuery({
    queryKey: ["day", date],
    queryFn: () => listDay({ data: { date } }),
  });
  const rates = useQuery({
    queryKey: ["rates"],
    queryFn: () => getRates(),
    enabled: showProfit,
  });

  const lines = query.data?.lines ?? [];
  const bankLines = query.data?.bank ?? [];
  const sales = lines.filter((line) => line.kind === "sale");
  const purchases = lines.filter((line) => line.kind === "purchase");
  const expenses = lines.filter((line) => line.kind === "expense");
  const salesTotal = addAmounts(sales.map((line) => line.amount));
  const gamingSales = addAmounts(sales.filter((line) => line.category === "gaming").map((line) => line.amount));
  const purchaseTotal = addAmounts(purchases.map((line) => line.amount));
  const expenseTotal = addAmounts(expenses.map((line) => line.amount));
  const visible = lines.filter((line) => line.kind === mode);
  const cash = addAmounts(visible.filter((line) => line.payment === "cash").map((line) => line.amount));
  const gpay = addAmounts(visible.filter((line) => line.payment === "gpay").map((line) => line.amount));
  const given = addAmounts(bankLines.filter((line) => line.direction === "given").map((line) => line.amount));
  const returned = addAmounts(
    bankLines.filter((line) => line.direction === "returned").map((line) => line.amount),
  );
  const interest = addAmounts(
    bankLines.filter((line) => line.direction === "returned").map((line) => line.interest),
  );
  const net = leftAfter(salesTotal, purchaseTotal, expenseTotal);
  const ours = rates.data ? centreFromLines(lines, rates.data) : null;
  const heading = mode === "sale" ? "Sales" : mode === "purchase" ? "Purchases" : mode === "expense" ? "Expenses" : "Bank pay";
  const empty =
    mode === "sale"
      ? "No sales on this day. Type the bill amount and save."
      : mode === "purchase"
        ? "No purchases on this day. Enter the whole bill above."
        : "No expenses on this day. Enter the amount above.";

  return (
    <section>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-2xl leading-tight tracking-tight">{heading}</h2>
        <p className="text-sm text-muted">{date === today ? "Today" : longDate(date)}</p>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <figure className="rounded-xl border border-line bg-card px-3 py-2">
          <figcaption className="text-sm text-muted">Sales</figcaption>
          <p className="font-semibold tabular-nums">{query.isPending ? "…" : formatInr(salesTotal)}</p>
        </figure>
        <figure className="rounded-xl border border-line bg-card px-3 py-2">
          <figcaption className="text-sm text-muted">Purchases</figcaption>
          <p className="font-semibold tabular-nums">{query.isPending ? "…" : formatInr(purchaseTotal)}</p>
        </figure>
        <figure className="rounded-xl border border-line bg-card px-3 py-2">
          <figcaption className="text-sm text-muted">Expenses</figcaption>
          <p className="font-semibold tabular-nums">{query.isPending ? "…" : formatInr(expenseTotal)}</p>
        </figure>
        <figure className="rounded-xl border border-line bg-card px-3 py-2">
          <figcaption className="text-sm text-muted">Left</figcaption>
          <p className={cn("font-semibold tabular-nums", !query.isPending && toCents(net) < 0 && "text-danger")}>
            {query.isPending ? "…" : formatInr(net)}
          </p>
        </figure>
      </div>
      {showProfit ? (
        <p className={cn("mt-2 text-sm font-medium", ours != null && toCents(ours) < 0 && "text-danger")}>
          For us {query.isPending || !ours ? "…" : formatInr(ours)}
        </p>
      ) : null}
      <p className="mt-2 text-sm text-pretty text-muted">
        {mode === "bank"
          ? `Given ${query.isPending ? "…" : formatInr(given)} · Back ${query.isPending ? "…" : formatInr(returned)}${toCents(interest) > 0 ? ` · Interest ${formatInr(interest)}` : ""}`
          : `${mode === "sale" ? "Received" : "Paid"} · Cash ${query.isPending ? "…" : formatInr(cash)} · GPay ${query.isPending ? "…" : formatInr(gpay)}`}
        {toCents(gamingSales) > 0 ? ` · Gaming ${formatInr(gamingSales)}` : ""}
      </p>
      {mode !== "bank" && (toCents(given) > 0 || toCents(returned) > 0) ? (
        <p className="mt-1 text-sm text-pretty text-muted">
          Bank pay · Given {formatInr(given)} · Back {formatInr(returned)}
          {toCents(interest) > 0 ? ` · Interest ${formatInr(interest)}` : ""}
        </p>
      ) : null}

      <div className="mt-4">
        {query.isPending ? (
          <div className="space-y-2" aria-hidden="true">
            <div className="h-16 animate-pulse rounded-lg bg-wash motion-reduce:animate-none" />
            <div className="h-16 animate-pulse rounded-lg bg-wash motion-reduce:animate-none" />
            <div className="h-16 animate-pulse rounded-lg bg-wash motion-reduce:animate-none" />
          </div>
        ) : query.isError ? (
          <div className="rounded-xl border border-line bg-card p-4">
            <p className="text-sm text-danger" role="alert">
              {errorText(query.error, "Could not load this day.")}
            </p>
            <button
              type="button"
              onClick={() => void query.refetch()}
              className="mt-3 h-11 rounded-sm bg-wash px-4 text-sm font-medium"
            >
              Try again
            </button>
          </div>
        ) : mode === "bank" ? (
          <BankList lines={bankLines} canRemove={canRemove} preview={compact ? 4 : 6} />
        ) : (
          <LineList lines={visible} canRemove={canRemove} empty={empty} preview={compact ? 4 : 6} />
        )}
      </div>
      <p className="sr-only" role="status">
        {query.isPending ? "Loading the book" : `${mode === "bank" ? bankLines.length : visible.length} entries`}
      </p>
    </section>
  );
}

function BankList({ lines, canRemove, preview }: { lines: BankLine[]; canRemove: boolean; preview?: number }) {
  const queryClient = useQueryClient();
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(false);
  const shown = preview && !expanded ? lines.slice(0, preview) : lines;
  const remove = useMutation({
    mutationFn: (id: number) => removeBank({ data: { id } }),
    onSuccess: async () => {
      setConfirmId(null);
      setError("");
      await queryClient.invalidateQueries({ queryKey: ["day"] });
      await queryClient.invalidateQueries({ queryKey: ["books"] });
    },
    onError: (cause) => setError(errorText(cause, "Could not remove that row.")),
  });

  if (lines.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-line bg-card px-4 py-8 text-center">
        <p className="text-sm text-pretty text-muted">No bank pay on this day.</p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-card">
      {shown.map((line) => {
        const confirming = confirmId === line.id;
        return (
          <li key={line.id} className="px-4 py-2">
            {confirming ? (
              <div>
                <p className="text-sm">
                  Remove this {formatInr(line.amount)}{" "}
                  {line.direction === "given" ? "collection" : "return"}?
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmId(null)}
                    className="h-11 flex-1 rounded-sm bg-wash text-sm font-medium"
                  >
                    Keep
                  </button>
                  <button
                    type="button"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate(line.id)}
                    className="h-11 flex-1 rounded-sm bg-ink text-sm font-medium text-paper disabled:opacity-50"
                  >
                    {remove.isPending ? "Removing…" : "Remove"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{line.direction === "given" ? "Given to agent" : "Received back"}</p>
                  <p className="text-sm text-pretty text-muted">
                    {line.direction === "given"
                      ? `Back around ${line.due}`
                      : `Interest ${formatInr(line.interest)}`}
                    {formatClock(line.enteredAt) ? ` · ${formatClock(line.enteredAt)}` : ""}
                  </p>
                </div>
                <p className="text-base font-semibold tabular-nums">{formatInr(line.amount)}</p>
                {canRemove ? (
                  <button
                    type="button"
                    onClick={() => {
                      setError("");
                      setConfirmId(line.id);
                    }}
                    className="h-11 shrink-0 rounded-sm px-3 text-sm font-medium text-muted"
                  >
                    Remove
                  </button>
                ) : null}
              </div>
            )}
          </li>
        );
      })}
      {preview && lines.length > preview ? (
        <li>
          <button type="button" onClick={() => setExpanded((value) => !value)} className="h-11 w-full text-sm font-medium text-muted">
            {expanded ? "Show latest" : `Show all ${lines.length}`}
          </button>
        </li>
      ) : null}
      {error ? (
        <li className="px-4 py-3 text-sm text-danger" role="alert">
          {error}
        </li>
      ) : null}
    </ul>
  );
}

function SummaryRow({
  label,
  value,
  emphasize = false,
  negative = false,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
  negative?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <p className="text-sm text-muted">{label}</p>
      <p
        className={cn(
          "text-right text-base font-semibold tabular-nums",
          negative ? "text-danger" : "text-ink",
          emphasize && "text-lg",
        )}
      >
        {value}
      </p>
    </div>
  );
}

export function LineList({
  lines,
  empty,
  canRemove,
  preview,
}: {
  lines: LedgerLine[];
  empty: string;
  canRemove: boolean;
  preview?: number;
}) {
  const queryClient = useQueryClient();
  const [confirmKey, setConfirmKey] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(false);
  const shown = preview && !expanded ? lines.slice(0, preview) : lines;

  const remove = useMutation({
    mutationFn: async (line: LedgerLine) => {
      if (line.kind === "sale") return removeSale({ data: { id: line.id } });
      if (line.kind === "purchase") return removePurchase({ data: { id: line.id } });
      return removeExpense({ data: { id: line.id } });
    },
    onSuccess: async () => {
      setConfirmKey(null);
      setError("");
      await queryClient.invalidateQueries({ queryKey: ["day"] });
      await queryClient.invalidateQueries({ queryKey: ["books"] });
    },
    onError: (cause) => {
      setError(errorText(cause, "Could not remove that row."));
    },
  });

  if (lines.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-line bg-card px-4 py-8 text-center">
        <p className="text-sm text-pretty text-muted">{empty}</p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-card">
      {shown.map((line) => {
        const key = `${line.kind}:${line.id}`;
        const confirming = confirmKey === key;
        return (
          <li key={key} className="px-4 py-2">
            {confirming ? (
              <div>
                <p className="text-sm">
                  Remove this {formatInr(line.amount)} {categoryLabel(line.category).toLowerCase()}{" "}
                  {line.kind}?
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmKey(null)}
                    className="h-11 flex-1 rounded-sm bg-wash text-sm font-medium"
                  >
                    Keep
                  </button>
                  <button
                    type="button"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate(line)}
                    className="h-11 flex-1 rounded-sm bg-ink text-sm font-medium text-paper disabled:opacity-50"
                  >
                    {remove.isPending ? "Removing…" : "Remove"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {categoryLabel(line.category)}
                    <span className="sr-only"> {line.kind}</span>
                  </p>
                  <p className="text-sm text-pretty text-muted">
                    {paymentLabel(line.payment)}
                    {line.remark ? ` · ${line.remark}` : ""}
                    {formatClock(line.enteredAt) ? ` · ${formatClock(line.enteredAt)}` : ""}
                  </p>
                </div>
                <p className="text-base font-semibold tabular-nums">{formatInr(line.amount)}</p>
                {canRemove ? (
                  <button
                    type="button"
                    onClick={() => {
                      setError("");
                      setConfirmKey(key);
                    }}
                    className="h-11 shrink-0 rounded-sm px-3 text-sm font-medium text-muted"
                  >
                    Remove
                  </button>
                ) : null}
              </div>
            )}
          </li>
        );
      })}
      {preview && lines.length > preview ? (
        <li>
          <button type="button" onClick={() => setExpanded((value) => !value)} className="h-11 w-full text-sm font-medium text-muted">
            {expanded ? "Show latest" : `Show all ${lines.length}`}
          </button>
        </li>
      ) : null}
      {error ? (
        <li className="px-4 py-3 text-sm text-danger" role="alert">
          {error}
        </li>
      ) : null}
    </ul>
  );
}

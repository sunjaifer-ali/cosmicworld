import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  editPurchase,
  editSale,
  getRates,
  listDay,
  addDrawerMove,
  removeBank,
  removeDrawerMove,
  removeExpense,
  removeGpayIn,
  removePurchase,
  removeSale,
  saveDrawer,
} from "@/lib/ledger.functions";
import {
  PURCHASE_CATEGORIES,
  SALE_CATEGORIES,
  addAmounts,
  canonicalAmount,
  canonicalCount,
  categoryLabel,
  centsToAmount,
  centreFromLines,
  errorText,
  formatClock,
  formatInr,
  leftAfter,
  longDate,
  paymentLabel,
  sanitizeAmountInput,
  sanitizeSupplier,
  toCents,
  type BankLine,
  type LedgerLine,
  type Payment,
} from "@/lib/ledger";
import { cn } from "@/lib/cn";

export function DayLedger({
  date,
  mode,
  today,
  canRemove,
  canEdit = false,
  showProfit = false,
  compact = false,
}: {
  date: string;
  mode: "sale" | "purchase" | "expense" | "bank";
  today: string;
  canRemove: boolean;
  canEdit?: boolean;
  showProfit?: boolean;
  compact?: boolean;
}) {
  const queryClient = useQueryClient();
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
  const returned = addAmounts(bankLines.filter((line) => line.direction === "returned").map((line) => line.amount));
  const net = leftAfter(salesTotal, purchaseTotal, expenseTotal);
  const ours = rates.data ? centreFromLines(lines, rates.data) : null;
  const heading = mode === "sale" ? "Sales" : mode === "purchase" ? "Purchases" : mode === "expense" ? "Expenses" : "Bank";
  const removeGpay = useMutation({
    mutationFn: (id: number) => removeGpayIn({ data: { id } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["day"] });
      await queryClient.invalidateQueries({ queryKey: ["books"] });
    },
  });
  const empty =
    mode === "sale"
      ? "No sales yet. Type the amount and press Save."
      : mode === "purchase"
        ? "No purchases yet. Type the amount and press Save."
        : "No expenses on this day.";

  return (
    <section>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-2xl leading-tight tracking-tight">{heading}</h2>
        <p className="text-sm text-muted">{date === today ? "Today" : longDate(date)}</p>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Mini label="Sales" value={query.isPending ? "…" : formatInr(salesTotal)} hot={mode === "sale"} />
        <Mini label="Purchases" value={query.isPending ? "…" : formatInr(purchaseTotal)} hot={mode === "purchase"} />
        <Mini label="Expenses" value={query.isPending ? "…" : formatInr(expenseTotal)} hot={mode === "expense"} />
        <Mini label="Left" value={query.isPending ? "…" : formatInr(net)} negative={!query.isPending && toCents(net) < 0} />
      </div>
      {showProfit && ours ? (
        <p className={cn("mt-3 text-sm font-medium", toCents(ours) < 0 && "text-danger")}>For us {formatInr(ours)}</p>
      ) : null}
      {mode !== "bank" ? (
        <p className="mt-2 text-sm text-muted">
          Cash {query.isPending ? "…" : formatInr(cash)} · GPay {query.isPending ? "…" : formatInr(gpay)}
          {mode === "sale" && toCents(gamingSales) > 0 ? ` · Gaming ${formatInr(gamingSales)}` : ""}
        </p>
      ) : null}
      {mode === "sale" && (toCents(given) > 0 || toCents(returned) > 0) ? (
        <p className="mt-1 text-sm text-muted">
          Bank pay is out of the drawer. Given {formatInr(given)}
          {toCents(returned) > 0 ? ` · Back ${formatInr(returned)}` : ""}
        </p>
      ) : null}

      <div className="mt-4">
        {query.isPending ? (
          <div className="space-y-2" aria-hidden="true">
            <div className="h-16 animate-pulse rounded-lg bg-wash motion-reduce:animate-none" />
            <div className="h-16 animate-pulse rounded-lg bg-wash motion-reduce:animate-none" />
          </div>
        ) : query.isError ? (
          <div className="rounded-xl border border-line bg-card p-4">
            <p className="text-sm text-danger" role="alert">
              {errorText(query.error, "Could not load this day.")}
            </p>
            <button type="button" onClick={() => void query.refetch()} className="mt-3 h-11 rounded-sm bg-wash px-4 text-sm font-medium">
              Try again
            </button>
          </div>
        ) : mode === "bank" ? (
          <BankList lines={bankLines} canRemove={canRemove} preview={compact ? 4 : 6} />
        ) : (
          <LineList lines={visible} canRemove={canRemove} canEdit={canEdit} empty={empty} preview={compact ? 4 : 6} />
        )}
      </div>
      {mode === "sale" ? (
        <DrawerTake
          date={date}
          moves={(query.data?.moves ?? []).map((move) => ({
            id: move.id,
            direction: move.direction === "put" ? "put" : "taken",
            amount: move.amount,
            note: move.note,
          }))}
        />
      ) : null}
      {mode === "sale" ? (
        <DrawerCount date={date} counted={query.data?.counted ?? null} expected={query.data?.expected ?? null} />
      ) : null}
      {mode === "bank" && (query.data?.gpay?.length ?? 0) > 0 ? (
        <ul className="mt-3 divide-y divide-line overflow-hidden rounded-xl border border-line bg-card">
          {query.data?.gpay?.map((row) => (
            <li key={row.id} className="flex items-center justify-between gap-3 px-4 py-2">
              <p className="text-sm">GPay to bank</p>
              <p className="font-semibold tabular-nums">{formatInr(row.amount)}</p>
              {canRemove ? (
                <button type="button" onClick={() => removeGpay.mutate(row.id)} className="h-11 px-3 text-sm text-muted">
                  Remove
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
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
        <p className="text-sm text-muted">No bank pay on this day.</p>
      </div>
    );
  }
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-card">
      {shown.map((line) => (
        <li key={line.id} className="px-4 py-2">
          {confirmId === line.id ? (
            <div className="flex gap-2">
              <button type="button" onClick={() => setConfirmId(null)} className="h-11 flex-1 rounded-xl bg-wash text-sm font-medium">
                Keep
              </button>
              <button
                type="button"
                disabled={remove.isPending}
                onClick={() => remove.mutate(line.id)}
                className="h-11 flex-1 rounded-xl bg-ink text-sm font-medium text-paper disabled:opacity-50"
              >
                Remove
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{line.direction === "given" ? "Given" : "Back"}</p>
                <p className="text-sm text-muted">
                  {line.direction === "returned" && toCents(line.interest) > 0 ? `Interest ${formatInr(line.interest)}` : ""}
                  {line.due ? `Due ${line.due}` : ""}
                </p>
              </div>
              <p className="font-semibold tabular-nums">{formatInr(line.amount)}</p>
              {canRemove ? (
                <button type="button" onClick={() => setConfirmId(line.id)} className="h-11 px-3 text-sm text-muted">
                  Remove
                </button>
              ) : null}
            </div>
          )}
        </li>
      ))}
      {preview && lines.length > preview ? (
        <li>
          <button type="button" onClick={() => setExpanded((value) => !value)} className="h-11 w-full text-sm font-medium text-muted">
            {expanded ? "Show latest" : `Show all ${lines.length}`}
          </button>
        </li>
      ) : null}
      {error ? <li className="px-4 py-3 text-sm text-danger">{error}</li> : null}
    </ul>
  );
}

export function LineList({
  lines,
  empty,
  canRemove,
  canEdit = false,
  preview,
}: {
  lines: LedgerLine[];
  empty: string;
  canRemove: boolean;
  canEdit?: boolean;
  preview?: number;
}) {
  const queryClient = useQueryClient();
  const [confirmKey, setConfirmKey] = useState<string | null>(null);
  const [editKey, setEditKey] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [payment, setPayment] = useState<Payment>("cash");
  const [category, setCategory] = useState("");
  const [supplier, setSupplier] = useState("");
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
    onError: (cause) => setError(errorText(cause, "Could not remove that row.")),
  });
  const edit = useMutation({
    mutationFn: async (line: LedgerLine) => {
      const next = canonicalAmount(amount);
      if (!next) throw new Error("Enter the amount");
      if (line.kind === "purchase") {
        const picked = PURCHASE_CATEGORIES.find((item) => item.id === category);
        if (!picked) throw new Error("Choose what was bought");
        return editPurchase({
          data: {
            id: line.id,
            category: picked.id,
            amount: next,
            payment,
            supplier: supplier.trim() || undefined,
          },
        });
      }
      const picked = SALE_CATEGORIES.find((item) => item.id === category);
      if (!picked) throw new Error("Choose what sold");
      return editSale({
        data: { id: line.id, category: picked.id, amount: next, payment },
      });
    },
    onSuccess: async () => {
      setEditKey(null);
      setError("");
      await queryClient.invalidateQueries({ queryKey: ["day"] });
      await queryClient.invalidateQueries({ queryKey: ["books"] });
    },
    onError: (cause) => setError(errorText(cause, "Could not change that row.")),
  });

  if (lines.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-line bg-card px-4 py-8 text-center">
        <p className="text-sm text-muted">{empty}</p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-card">
      {shown.map((line) => {
        const key = `${line.kind}:${line.id}`;
        const choices = line.kind === "purchase" ? PURCHASE_CATEGORIES : SALE_CATEGORIES;
        return (
          <li key={key} className="px-4 py-2">
            {confirmKey === key ? (
              <div>
                <p className="text-sm">
                  Remove this {formatInr(line.amount)} {categoryLabel(line.category).toLowerCase()}?
                </p>
                <div className="mt-3 flex gap-2">
                  <button type="button" onClick={() => setConfirmKey(null)} className="h-11 flex-1 rounded-xl bg-wash text-sm font-medium">
                    Keep
                  </button>
                  <button
                    type="button"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate(line)}
                    className="h-11 flex-1 rounded-xl bg-ink text-sm font-medium text-paper disabled:opacity-50"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ) : editKey === key ? (
              <div>
                <input
                  inputMode="decimal"
                  value={amount}
                  aria-label="Amount"
                  onChange={(event) => setAmount(sanitizeAmountInput(event.target.value))}
                  className="h-12 w-full rounded-xl border border-line bg-wash px-3 text-xl tabular-nums outline-none"
                />
                <div className="mt-2 flex flex-wrap gap-2">
                  {choices.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setCategory(item.id)}
                      className={cn("h-10 rounded-full px-3 text-sm font-medium", category === item.id ? "bg-sign" : "bg-wash")}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setPayment("cash")} className={cn("h-11 rounded-xl text-sm font-medium", payment === "cash" ? "bg-sign" : "bg-wash")}>
                    Cash
                  </button>
                  <button type="button" onClick={() => setPayment("gpay")} className={cn("h-11 rounded-xl text-sm font-medium", payment === "gpay" ? "bg-sign" : "bg-wash")}>
                    GPay
                  </button>
                </div>
                {line.kind === "purchase" ? (
                  <input
                    value={supplier}
                    maxLength={40}
                    placeholder="Shop name"
                    onChange={(event) => setSupplier(sanitizeSupplier(event.target.value))}
                    className="mt-2 h-11 w-full rounded-xl border border-line bg-wash px-3 text-base outline-none"
                  />
                ) : null}
                <div className="mt-2 flex gap-2">
                  <button type="button" onClick={() => setEditKey(null)} className="h-11 flex-1 rounded-xl bg-wash text-sm font-medium">
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={edit.isPending}
                    onClick={() => edit.mutate(line)}
                    className="h-11 flex-1 rounded-xl bg-ink text-sm font-medium text-paper disabled:opacity-50"
                  >
                    {edit.isPending ? "Saving…" : "Save"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{categoryLabel(line.category)}</p>
                  <p className="text-sm text-muted">
                    {paymentLabel(line.payment)}
                    {line.remark ? ` · ${line.remark}` : ""}
                    {formatClock(line.enteredAt) ? ` · ${formatClock(line.enteredAt)}` : ""}
                  </p>
                </div>
                <p className="text-base font-semibold tabular-nums">{formatInr(line.amount)}</p>
                {canEdit && (line.kind === "sale" || line.kind === "purchase") ? (
                  <button
                    type="button"
                    onClick={() => {
                      setError("");
                      setConfirmKey(null);
                      setEditKey(key);
                      setAmount(line.amount.replace(/\.00$/, ""));
                      setPayment(line.payment);
                      setCategory(line.category);
                      setSupplier(line.remark ?? "");
                    }}
                    className="h-11 shrink-0 rounded-xl bg-wash px-3 text-sm font-medium"
                  >
                    Change
                  </button>
                ) : null}
                {canRemove ? (
                  <button
                    type="button"
                    onClick={() => {
                      setError("");
                      setEditKey(null);
                      setConfirmKey(key);
                    }}
                    className="h-11 shrink-0 px-3 text-sm font-medium text-muted"
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
          <button type="button" onClick={() => setExpanded((open) => !open)} className="h-11 w-full text-sm font-medium text-muted">
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

function DrawerTake({
  date,
  moves,
}: {
  date: string;
  moves: { id: number; direction: "taken" | "put"; amount: string; note: string | null }[];
}) {
  const queryClient = useQueryClient();
  const [direction, setDirection] = useState<"taken" | "put">("taken");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const save = useMutation({
    mutationFn: () => {
      const next = canonicalAmount(amount);
      if (!next) throw new Error("Enter the amount");
      return addDrawerMove({ data: { date, direction, amount: next, note: note.trim() || undefined } });
    },
    onSuccess: async () => {
      setAmount("");
      setNote("");
      setError("");
      await queryClient.invalidateQueries({ queryKey: ["day"] });
      await queryClient.invalidateQueries({ queryKey: ["books"] });
    },
    onError: (cause) => setError(errorText(cause, "Could not save that.")),
  });
  const remove = useMutation({
    mutationFn: (id: number) => removeDrawerMove({ data: { id } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["day"] });
      await queryClient.invalidateQueries({ queryKey: ["books"] });
    },
  });
  return (
    <form
      className="mt-4 rounded-xl border border-line bg-card p-4"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <p className="text-sm font-medium">Cash from the drawer</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button type="button" onClick={() => setDirection("taken")} className={cn("h-11 rounded-xl text-sm font-medium", direction === "taken" ? "bg-sign" : "bg-wash")}>
          Took cash
        </button>
        <button type="button" onClick={() => setDirection("put")} className={cn("h-11 rounded-xl text-sm font-medium", direction === "put" ? "bg-sign" : "bg-wash")}>
          Put cash in
        </button>
      </div>
      <input
        inputMode="decimal"
        value={amount}
        placeholder="Amount"
        onChange={(event) => setAmount(sanitizeAmountInput(event.target.value))}
        className="mt-2 h-14 w-full rounded-xl border border-line bg-wash px-3 text-2xl tabular-nums outline-none"
      />
      <input
        value={note}
        maxLength={40}
        placeholder="Why, if you want"
        onChange={(event) => setNote(sanitizeSupplier(event.target.value))}
        className="mt-2 h-11 w-full rounded-xl border border-line bg-wash px-3 text-base outline-none"
      />
      {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
      <button type="submit" disabled={save.isPending} className="mt-3 h-12 w-full rounded-xl bg-ink text-base font-semibold text-paper disabled:opacity-50">
        {save.isPending ? "Saving…" : "Save"}
      </button>
      {moves.length > 0 ? (
        <ul className="mt-3 divide-y divide-line">
          {moves.map((move) => (
            <li key={move.id} className="flex items-center justify-between gap-3 py-2">
              <p className="text-sm">
                {move.direction === "taken" ? "Took" : "Put in"} {formatInr(move.amount)}
                {move.note ? ` · ${move.note}` : ""}
              </p>
              <button type="button" onClick={() => remove.mutate(move.id)} className="h-11 px-2 text-sm text-muted">
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </form>
  );
}

function DrawerCount({ date, counted, expected }: { date: string; counted: string | null; expected: string | null }) {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const save = useMutation({
    mutationFn: () => {
      const next = canonicalCount(amount);
      if (!next) throw new Error("Type the cash you counted");
      return saveDrawer({ data: { date, amount: next } });
    },
    onSuccess: async () => {
      setAmount("");
      setError("");
      await queryClient.invalidateQueries({ queryKey: ["day"] });
      await queryClient.invalidateQueries({ queryKey: ["books"] });
    },
    onError: (cause) => setError(errorText(cause, "Could not save the count.")),
  });
  const gap = counted == null || expected == null ? null : toCents(counted) - toCents(expected);
  return (
    <form
      className="mt-4 rounded-xl border border-line bg-card p-4"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <p className="text-sm font-medium">Count the cash</p>
      <p className={cn("mt-1 text-sm", gap != null && gap < 0 && "text-danger")}>
        {expected == null
          ? counted == null
            ? "First count. This is the cash you have now."
            : `Saved ${formatInr(counted)}. Next counts compare with this.`
          : gap == null
            ? `Should be ${formatInr(expected)}`
            : gap === 0
              ? "Matches."
              : gap < 0
                ? `Short ${formatInr(centsToAmount(-gap))}`
                : `Extra ${formatInr(centsToAmount(gap))}`}
      </p>
      <input
        inputMode="decimal"
        value={amount}
        placeholder="Cash in hand"
        onChange={(event) => setAmount(sanitizeAmountInput(event.target.value))}
        className="mt-3 h-14 w-full rounded-xl border border-line bg-wash px-3 text-2xl tabular-nums outline-none"
      />
      {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
      <button type="submit" disabled={save.isPending} className="mt-3 h-12 w-full rounded-xl bg-ink text-base font-semibold text-paper disabled:opacity-50">
        {save.isPending ? "Saving…" : "Save count"}
      </button>
    </form>
  );
}

function Mini({ label, value, hot = false, negative = false }: { label: string; value: string; hot?: boolean; negative?: boolean }) {
  return (
    <article className={cn("rounded-xl border border-line bg-card px-3 py-3", hot && "border-t-4 border-t-sign")}>
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className={cn("mt-1 font-display text-xl leading-none tabular-nums", negative && "text-danger")}>{value}</p>
    </article>
  );
}

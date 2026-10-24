import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { eachDayOfInterval, endOfMonth, format, getDay, parseISO, startOfMonth } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { LineList } from "@/components/day-ledger";
import { getBooks, listReport, saveRates } from "@/lib/ledger.functions";
import {
  axisLabel,
  basisToPercent,
  cashAfterBank,
  centreBreakdown,
  errorText,
  formatInr,
  formatRate,
  isCurrentPeriod,
  leftAfter,
  paymentLabel,
  percentToBasis,
  periodRange,
  pointLabel,
  resolveRates,
  sanitizePercentInput,
  shiftAnchor,
  toCents,
  type BooksPayload,
  type Grain,
  type MarginRates,
} from "@/lib/ledger";
import { downloadExcel, downloadPdf } from "@/lib/report-file";
import { cn } from "@/lib/cn";

const GRAINS: { id: Grain; label: string }[] = [
  { id: "day", label: "Day" },
  { id: "month", label: "Month" },
  { id: "year", label: "Year" },
];

export function BooksView({
  anchor,
  grain,
  today,
  onAnchor,
  onGrain,
  onEnterDay,
}: {
  anchor: string;
  grain: Grain;
  today: string;
  onAnchor: (anchor: string) => void;
  onGrain: (grain: Grain) => void;
  onEnterDay: (date: string) => void;
}) {
  const range = periodRange(anchor, grain);
  const nextAnchor = shiftAnchor(anchor, grain, 1);
  const nextDisabled = periodRange(nextAnchor, grain).from > today;
  const current = isCurrentPeriod(anchor, grain, today);
  const query = useQuery({
    queryKey: ["books", grain, range.from, range.to],
    queryFn: () => getBooks({ data: { from: range.from, to: range.to, grain } }),
  });
  const books = query.data;
  const quiet =
    !books ||
    (toCents(books.salesTotal) === 0 &&
      toCents(books.purchaseTotal) === 0 &&
      toCents(books.expenseTotal) === 0 &&
      toCents(books.bankGiven) === 0 &&
      toCents(books.bankReturned) === 0 &&
      toCents(books.gamingTotal) === 0);
  const productRows = books
    ? books.categories.filter((row) => toCents(row.sales) > 0 || toCents(row.purchases) > 0)
    : [];
  const expenseRows = books ? books.expenses.filter((row) => toCents(row.total) > 0) : [];
  const maxSales = books ? Math.max(...books.categories.map((row) => toCents(row.sales)), 0) : 0;
  const maxPurchases = books ? Math.max(...books.categories.map((row) => toCents(row.purchases)), 0) : 0;
  const maxExpenses = books ? Math.max(...books.expenses.map((row) => toCents(row.total)), 0) : 0;
  const [reportError, setReportError] = useState("");
  const [reportBusy, setReportBusy] = useState<"excel" | "pdf" | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [showAllPoints, setShowAllPoints] = useState(false);

  async function makeReport(kind: "excel" | "pdf") {
    if (!books || reportBusy) return;
    setReportBusy(kind);
    setReportError("");
    try {
      const report = await listReport({ data: { from: range.from, to: range.to } });
      if (kind === "excel") await downloadExcel(books, report.rows, range.label);
      else downloadPdf(books, report.rows, range.label);
    } catch (cause) {
      setReportError(errorText(cause, "Could not make that report."));
    } finally {
      setReportBusy(null);
    }
  }

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-muted">Books</p>
          <h2 className="font-display text-3xl leading-none tracking-tight">{range.label}</h2>
        </div>
        <div className="no-print flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!books || reportBusy !== null}
            onClick={() => void makeReport("excel")}
            className="h-11 rounded-sm bg-ink px-3 text-sm font-medium text-paper disabled:opacity-50"
          >
            {reportBusy === "excel" ? "Making Excel…" : "Excel"}
          </button>
          <button
            type="button"
            disabled={!books || reportBusy !== null}
            onClick={() => void makeReport("pdf")}
            className="h-11 rounded-sm bg-ink px-3 text-sm font-medium text-paper disabled:opacity-50"
          >
            {reportBusy === "pdf" ? "Making PDF…" : "PDF"}
          </button>
          <button type="button" onClick={() => window.print()} className="h-11 rounded-sm bg-wash px-3 text-sm font-medium">
            Print
          </button>
        </div>
      </div>
      {reportError ? (
        <p className="no-print mt-3 text-sm text-danger" role="alert">
          {reportError}
        </p>
      ) : null}

      <div className="no-print mt-4 flex flex-wrap items-center gap-2">
        <div className="grid grid-cols-3 gap-1 rounded-md bg-wash p-1" role="group" aria-label="Period">
          {GRAINS.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={grain === item.id}
              onClick={() => onGrain(item.id)}
              className={cn(
                "h-11 rounded-sm px-3 text-sm font-medium transition-colors duration-150",
                grain === item.id ? "bg-ink text-paper" : "text-muted",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            aria-label="Previous period"
            onClick={() => onAnchor(shiftAnchor(anchor, grain, -1))}
            className="grid size-11 place-items-center rounded-sm bg-wash"
          >
            <ChevronLeft className="size-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Next period"
            disabled={nextDisabled}
            onClick={() => onAnchor(nextAnchor)}
            className="grid size-11 place-items-center rounded-sm bg-wash disabled:opacity-40"
          >
            <ChevronRight className="size-5" aria-hidden="true" />
          </button>
          {!current ? (
            <button type="button" onClick={() => onAnchor(today)} className="h-11 rounded-sm bg-wash px-3 text-sm font-medium">
              Today
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setCalendarOpen((open) => !open)}
            className="h-11 rounded-sm bg-wash px-3 text-sm font-medium"
          >
            {calendarOpen ? "Hide" : "Calendar"}
          </button>
        </div>
      </div>

      {calendarOpen ? (
        <BookCalendar anchor={anchor} grain={grain} today={today} onAnchor={onAnchor} onGrain={onGrain} />
      ) : null}

      {query.isPending ? (
        <div className="mt-4 space-y-3" aria-hidden="true">
          <div className="h-24 animate-pulse rounded-xl bg-wash motion-reduce:animate-none" />
          <div className="h-40 animate-pulse rounded-xl bg-wash motion-reduce:animate-none" />
        </div>
      ) : query.isError ? (
        <div className="mt-4 rounded-xl border border-line bg-card p-4">
          <p className="text-sm text-danger" role="alert">
            {errorText(query.error, "Could not load the books.")}
          </p>
          <button type="button" onClick={() => void query.refetch()} className="mt-3 h-11 rounded-sm bg-wash px-4 text-sm font-medium">
            Try again
          </button>
        </div>
      ) : books ? (
        <div className="mt-4 space-y-4">
          <CentreCard books={books} />

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Sales" value={formatInr(books.salesTotal)} />
            <Stat label="Purchases" value={formatInr(books.purchaseTotal)} />
            <Stat label="Expenses" value={formatInr(books.expenseTotal)} />
            <Stat
              label="Left"
              value={formatInr(leftAfter(books.salesTotal, books.purchaseTotal, books.expenseTotal))}
              negative={toCents(leftAfter(books.salesTotal, books.purchaseTotal, books.expenseTotal)) < 0}
            />
          </div>
          <p className="text-sm text-muted">Left is the money movement, not the profit.</p>

          <div className="grid gap-3 sm:grid-cols-2">
            {books.payments.map((row) => {
              const moved = toCents(books.bankGiven) > 0 || toCents(books.bankReturned) > 0 || toCents(row.gaming) > 0;
              const till = cashAfterBank(row.sales, row.purchases, row.expenses, row.payment === "cash" ? books.bankGiven : "0", row.payment === "cash" ? books.bankReturned : "0", row.gaming);
              return (
                <article key={row.payment} className="rounded-xl border border-line bg-card p-4">
                  <h3 className="text-sm font-medium">{paymentLabel(row.payment)}</h3>
                  <div className="mt-3 space-y-2 text-sm">
                    {toCents(row.sales) > 0 ? <MoneyLine label="In" value={formatInr(row.sales)} /> : null}
                    {toCents(row.gaming) > 0 ? <MoneyLine label="Gaming" value={formatInr(row.gaming)} /> : null}
                    {toCents(row.purchases) > 0 ? <MoneyLine label="Purchases" value={formatInr(row.purchases)} /> : null}
                    {toCents(row.expenses) > 0 ? <MoneyLine label="Expenses" value={formatInr(row.expenses)} /> : null}
                    <div className="flex items-center justify-between gap-3 border-t border-line pt-2">
                      <p>{row.payment === "cash" && moved ? "In the till" : "Left"}</p>
                      <p className={cn("font-semibold tabular-nums", toCents(till) < 0 && "text-danger")}>{formatInr(till)}</p>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          {toCents(books.bankGiven) > 0 || toCents(books.bankReturned) > 0 || toCents(books.bankHeld) !== 0 || toCents(books.bankDue) > 0 ? (
            <BankCard given={books.bankGiven} returned={books.bankReturned} interest={books.bankInterest} held={books.bankHeld} due={books.bankDue} />
          ) : null}

          {quiet ? (
            <div className="rounded-xl border border-dashed border-line bg-card px-4 py-8 text-center">
              <p className="text-sm text-pretty text-muted">Nothing entered for {range.label}.</p>
              {grain === "day" ? (
                <button type="button" onClick={() => onEnterDay(anchor)} className="no-print mt-3 h-11 rounded-sm bg-ink px-4 text-sm font-medium text-paper">
                  Enter on this day
                </button>
              ) : null}
            </div>
          ) : (
            <>
              {productRows.length > 0 ? (
                <section className="rounded-xl border border-line bg-card p-4">
                  <h3 className="font-display text-xl leading-tight">By category</h3>
                  <div className="mt-4 space-y-4">
                    {productRows.map((row) => (
                      <div key={row.id} className="space-y-3">
                        <p className="text-sm font-medium">{row.label}</p>
                        {toCents(row.sales) > 0 ? <Meter label="Sales" value={row.sales} max={maxSales} /> : null}
                        {toCents(row.purchases) > 0 ? <Meter label="Purchases" value={row.purchases} max={maxPurchases} soft /> : null}
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              {expenseRows.length > 0 ? (
                <section className="rounded-xl border border-line bg-card p-4">
                  <h3 className="font-display text-xl leading-tight">Expenses</h3>
                  <div className="mt-4 space-y-4">
                    {expenseRows.map((row) => (
                      <Meter key={row.id} label={row.label} value={row.total} max={maxExpenses} soft />
                    ))}
                  </div>
                </section>
              ) : null}

              <section className="rounded-xl border border-line bg-card p-4">
                <h3 className="font-display text-xl leading-tight">{grain === "year" ? "Each month" : grain === "month" ? "Each day" : "This day"}</h3>
                <div className="mt-4 h-48">
                  <PeriodChart points={books.series} grain={grain} />
                </div>
                {grain !== "day" ? (
                  <PeriodList
                    points={books.series.filter(
                      (point) => toCents(point.sales) > 0 || toCents(point.purchases) > 0 || toCents(point.expenses) > 0,
                    )}
                    grain={grain}
                    expanded={showAllPoints}
                    onToggle={() => setShowAllPoints((open) => !open)}
                    onOpen={(bucket) => {
                      if (grain === "year") {
                        onGrain("month");
                        onAnchor(`${bucket}-01`);
                      } else {
                        onGrain("day");
                        onAnchor(bucket);
                      }
                    }}
                  />
                ) : (
                  <div className="mt-4">
                    <LineList lines={books.lines} canRemove={false} empty="No rows on this day." preview={6} />
                    <button type="button" onClick={() => onEnterDay(anchor)} className="no-print mt-3 h-11 rounded-sm bg-ink px-4 text-sm font-medium text-paper">
                      Enter on this day
                    </button>
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}

function PeriodList({
  points,
  grain,
  expanded,
  onToggle,
  onOpen,
}: {
  points: BooksPayload["series"];
  grain: Grain;
  expanded: boolean;
  onToggle: () => void;
  onOpen: (bucket: string) => void;
}) {
  const shown = expanded ? points : points.slice(0, 6);
  if (points.length === 0) return null;
  return (
    <ul className="mt-4 divide-y divide-line">
      {shown.map((point) => (
        <li key={point.bucket} className="flex items-center justify-between gap-3 py-2">
          <div className="min-w-0">
            <p className="font-medium">{pointLabel(point.bucket, grain)}</p>
            <p className="text-sm text-muted">
              {formatInr(point.sales)} sales
              {toCents(point.purchases) > 0 ? ` · ${formatInr(point.purchases)} purchases` : ""}
              {toCents(point.expenses) > 0 ? ` · ${formatInr(point.expenses)} expenses` : ""}
            </p>
          </div>
          <button type="button" onClick={() => onOpen(point.bucket)} className="no-print h-11 shrink-0 rounded-sm bg-wash px-3 text-sm font-medium">
            Open
          </button>
        </li>
      ))}
      {points.length > 6 ? (
        <li>
          <button type="button" onClick={onToggle} className="h-11 w-full text-sm font-medium text-muted">
            {expanded ? "Show latest" : `Show all ${points.length}`}
          </button>
        </li>
      ) : null}
    </ul>
  );
}

function CentreCard({ books }: { books: BooksPayload }) {
  const shown = resolveRates(books.rates);
  const centre = centreBreakdown(books, books.rates);
  return (
    <section className="rounded-xl border border-line bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-display text-xl leading-tight">Centre</h3>
      </div>
      <p className="mt-1 text-sm text-pretty text-muted">
        Cosmetics {formatRate(shown.cosmetics)} · Fancy {formatRate(shown.fancy)} · Accessories{" "}
        {formatRate(shown.accessories)} · Mixed {formatRate(shown.mixed)} · Gaming {formatRate(shown.gaming)}. Expenses
        come off. Purchases stay as stock.
      </p>
      <RateEditor rates={books.rates} />
      <div className="mt-4 space-y-2 text-sm">
        {centre.rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-3">
            <p>
              {row.label} · {row.rate}
            </p>
            <p className="tabular-nums">{formatInr(row.ours)}</p>
          </div>
        ))}
        <MoneyLine label="Before expenses" value={formatInr(centre.margin)} />
        <MoneyLine label="Expenses" value={formatInr(books.expenseTotal)} />
        <div className="flex items-center justify-between gap-3 border-t border-line pt-2">
          <p className="font-medium">For us</p>
          <p className={cn("font-semibold tabular-nums", toCents(centre.result) < 0 && "text-danger")}>{formatInr(centre.result)}</p>
        </div>
      </div>
    </section>
  );
}

const RATE_FIELDS = [
  { id: "cosmetics", label: "Cosmetics" },
  { id: "fancy", label: "Fancy" },
  { id: "accessories", label: "Accessories" },
  { id: "gaming", label: "Gaming" },
] as const;

function RateEditor({ rates }: { rates: MarginRates }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState(() => draftFrom(rates));

  useEffect(() => {
    setDraft(draftFrom(rates));
  }, [rates.cosmetics, rates.fancy, rates.accessories, rates.mixed, rates.gaming, rates.mixedAverage]);

  const save = useMutation({
    mutationFn: () => saveRates({ data: draft }),
    onSuccess: async () => {
      setError("");
      setOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["books"] });
      await queryClient.invalidateQueries({ queryKey: ["rates"] });
    },
    onError: (cause) => setError(errorText(cause, "Could not save the percentages.")),
  });

  const fancy = percentToBasis(draft.fancy);
  const cosmetics = percentToBasis(draft.cosmetics);
  const average = fancy != null && cosmetics != null ? formatRate(Math.round((fancy + cosmetics) / 2)) : "—";

  return (
    <div className="no-print mt-4">
      <button type="button" onClick={() => setOpen((value) => !value)} className="h-11 rounded-sm bg-wash px-3 text-sm font-medium">
        {open ? "Close" : "Change percentages"}
      </button>
      {open ? (
        <div className="mt-3 space-y-3">
          {RATE_FIELDS.map((field) => (
            <label key={field.id} className="block">
              <span className="mb-2 block text-sm font-medium">{field.label}</span>
              <span className="flex h-12 items-center rounded-sm border border-line bg-paper px-3">
                <input
                  inputMode="decimal"
                  value={draft[field.id]}
                  onChange={(event) => {
                    setError("");
                    const next = sanitizePercentInput(event.target.value);
                    setDraft((current) => ({ ...current, [field.id]: next }));
                  }}
                  className="h-full w-full bg-transparent text-base tabular-nums outline-none"
                />
                <span className="text-muted">%</span>
              </span>
            </label>
          ))}
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              checked={draft.mixedAverage}
              onChange={(event) => setDraft((current) => ({ ...current, mixedAverage: event.target.checked }))}
              className="mt-1 size-4"
            />
            <span>Mixed bills use the average of fancy and cosmetics{draft.mixedAverage ? `, ${average}` : ""}.</span>
          </label>
          {draft.mixedAverage ? null : (
            <label className="block">
              <span className="mb-2 block text-sm font-medium">Mixed</span>
              <span className="flex h-12 items-center rounded-sm border border-line bg-paper px-3">
                <input
                  inputMode="decimal"
                  value={draft.mixed}
                  onChange={(event) => {
                    setError("");
                    setDraft((current) => ({ ...current, mixed: sanitizePercentInput(event.target.value) }));
                  }}
                  className="h-full w-full bg-transparent text-base tabular-nums outline-none"
                />
                <span className="text-muted">%</span>
              </span>
            </label>
          )}
          {error ? (
            <p className="text-sm text-danger" role="alert">
              {error}
            </p>
          ) : null}
          <button
            type="button"
            disabled={save.isPending}
            onClick={() => save.mutate()}
            className="h-12 w-full rounded-sm bg-ink text-base font-semibold text-paper disabled:opacity-50"
          >
            {save.isPending ? "Saving…" : "Save percentages"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function draftFrom(rates: MarginRates) {
  return {
    cosmetics: basisToPercent(rates.cosmetics),
    fancy: basisToPercent(rates.fancy),
    accessories: basisToPercent(rates.accessories),
    mixed: basisToPercent(rates.mixedAverage ? Math.round((rates.fancy + rates.cosmetics) / 2) : rates.mixed),
    gaming: basisToPercent(rates.gaming),
    mixedAverage: rates.mixedAverage,
  };
}

function BankCard({
  given,
  returned,
  interest,
  held,
  due,
}: {
  given: string;
  returned: string;
  interest: string;
  held: string;
  due: string;
}) {
  return (
    <section className="rounded-xl border border-line bg-card p-4">
      <h3 className="font-display text-xl leading-tight">Bank pay</h3>
      <p className="mt-1 text-sm text-pretty text-muted">
        Cash given to the collection agent stays as savings. About six months later the bank returns it with a small interest. It is not counted in For us.
      </p>
      <div className="mt-4 space-y-2 text-sm">
        <MoneyLine label="Given this period" value={formatInr(given)} />
        <MoneyLine label="Received back" value={formatInr(returned)} />
        <MoneyLine label="Interest in that" value={formatInr(interest)} />
        <MoneyLine label="Due back this period" value={formatInr(due)} />
        <div className="flex items-center justify-between gap-3 border-t border-line pt-2">
          <p>Still with the bank</p>
          <p className={cn("font-semibold tabular-nums", toCents(held) < 0 && "text-danger")}>{formatInr(held)}</p>
        </div>
      </div>
    </section>
  );
}

function Stat({ label, value, negative = false }: { label: string; value: string; negative?: boolean }) {
  return (
    <article className="rounded-xl border border-line bg-card p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className={cn("mt-1 font-display text-2xl tabular-nums", negative && "text-danger")}>{value}</p>
    </article>
  );
}

function MoneyLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <p>{label}</p>
      <p className="tabular-nums">{value}</p>
    </div>
  );
}

function Meter({ label, value, max, soft = false }: { label: string; value: string; max: number; soft?: boolean }) {
  const width = max > 0 ? Math.max(4, Math.round((toCents(value) / max) * 100)) : 0;
  return (
    <div>
      <div className="flex items-center justify-between gap-3 text-sm">
        <p>{label}</p>
        <p className="tabular-nums">{formatInr(value)}</p>
      </div>
      <div className="mt-2 h-2 rounded-full bg-wash">
        <div className={cn("h-2 rounded-full", soft ? "bg-faint" : "bg-ink")} style={{ width: `${Math.min(width, 100)}%` }} />
      </div>
    </div>
  );
}

function PeriodChart({ points, grain }: { points: BooksPayload["series"]; grain: Grain }) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const data = points.map((point) => ({
    label: axisLabel(point.bucket, grain),
    full: pointLabel(point.bucket, grain),
    sales: toCents(point.sales) / 100,
    purchases: toCents(point.purchases) / 100,
    expenses: toCents(point.expenses) / 100,
  }));
  if (!ready) return <div className="h-full rounded-lg bg-wash" />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} barGap={2}>
        <CartesianGrid vertical={false} stroke="var(--color-line)" />
        <XAxis dataKey="label" tick={{ fill: "var(--color-muted)", fontSize: 12 }} axisLine={false} tickLine={false} />
        <Tooltip
          cursor={{ fill: "var(--color-wash)" }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const full = payload[0]?.payload as { full?: string } | undefined;
            return (
              <div className="rounded-sm border border-line bg-card px-3 py-2 text-sm">
                <p className="font-medium">{full?.full}</p>
                {payload.map((item) => (
                  <p key={String(item.dataKey)} className="tabular-nums text-muted">
                    {item.dataKey === "sales" ? "Sales" : item.dataKey === "expenses" ? "Expenses" : "Purchases"} {formatInr(Number(item.value ?? 0))}
                  </p>
                ))}
              </div>
            );
          }}
        />
        <Bar dataKey="sales" fill="var(--color-ink)" radius={[2, 2, 0, 0]} maxBarSize={16} />
        <Bar dataKey="purchases" fill="var(--color-faint)" radius={[2, 2, 0, 0]} maxBarSize={16} />
        <Bar dataKey="expenses" fill="var(--color-muted)" radius={[2, 2, 0, 0]} maxBarSize={16} />
      </BarChart>
    </ResponsiveContainer>
  );
}

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

function BookCalendar({
  anchor,
  grain,
  today,
  onAnchor,
  onGrain,
}: {
  anchor: string;
  grain: Grain;
  today: string;
  onAnchor: (anchor: string) => void;
  onGrain: (grain: Grain) => void;
}) {
  const year = Number(anchor.slice(0, 4));
  const monthKey = anchor.slice(0, 7);
  const monthDate = startOfMonth(parseISO(`${monthKey}-01`));
  const days = eachDayOfInterval({ start: monthDate, end: endOfMonth(monthDate) });
  const lead = (getDay(monthDate) + 6) % 7;
  const nextYearBlocked = `${year + 1}-01-01` > today;

  function moveYear(direction: -1 | 1) {
    const nextYear = year + direction;
    if (direction === 1 && `${nextYear}-01-01` > today) return;
    if (grain === "year") {
      onAnchor(nextYear === Number(today.slice(0, 4)) ? today : `${nextYear}-01-01`);
      return;
    }
    const month = anchor.slice(5, 7);
    const wanted = Number(anchor.slice(8));
    const last = endOfMonth(parseISO(`${nextYear}-${month}-01`)).getDate();
    let next = `${nextYear}-${month}-${String(Math.min(wanted, last)).padStart(2, "0")}`;
    if (next > today) next = today;
    onAnchor(next);
  }

  return (
    <div className="no-print mt-4 rounded-xl border border-line bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <button type="button" aria-label="Previous year" onClick={() => moveYear(-1)} className="grid size-11 place-items-center rounded-sm bg-wash">
          <ChevronLeft className="size-5" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => {
            onGrain("year");
            onAnchor(year === Number(today.slice(0, 4)) ? today : `${year}-01-01`);
          }}
          className={cn("h-11 rounded-sm px-4 text-sm font-medium", grain === "year" ? "bg-ink text-paper" : "bg-wash")}
        >
          {year}
        </button>
        <button
          type="button"
          aria-label="Next year"
          disabled={nextYearBlocked}
          onClick={() => moveYear(1)}
          className="grid size-11 place-items-center rounded-sm bg-wash disabled:opacity-40"
        >
          <ChevronRight className="size-5" aria-hidden="true" />
        </button>
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2" role="group" aria-label="Months">
        {Array.from({ length: 12 }, (_, index) => {
          const month = index + 1;
          const key = `${year}-${String(month).padStart(2, "0")}`;
          const selected = grain !== "year" && monthKey === key;
          const disabled = `${key}-01` > today;
          return (
            <button
              key={key}
              type="button"
              disabled={disabled}
              onClick={() => {
                if (disabled) return;
                onGrain("month");
                onAnchor(today.slice(0, 7) === key ? today : `${key}-01`);
              }}
              className={cn(
                "h-11 rounded-sm text-sm font-medium transition-colors duration-150 disabled:opacity-40",
                selected ? "bg-ink text-paper" : "bg-wash",
              )}
            >
              {format(new Date(year, index, 1), "MMM")}
            </button>
          );
        })}
      </div>
      {grain === "year" ? (
        <p className="mt-3 text-sm text-pretty text-muted">Tap a month to open it. The year button keeps the whole year.</p>
      ) : (
        <>
          <p className="mt-4 text-sm font-medium">{format(monthDate, "MMMM yyyy")}</p>
          <div className="mt-2 grid grid-cols-7 gap-1 text-center text-xs font-medium text-muted" aria-hidden="true">
            {WEEKDAYS.map((day) => (
              <span key={day} className="py-1">
                {day}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1" role="group" aria-label="Days">
            {Array.from({ length: lead }, (_, index) => (
              <span key={`pad-${index}`} />
            ))}
            {days.map((day) => {
              const iso = format(day, "yyyy-MM-dd");
              const selected = grain === "day" && iso === anchor;
              const disabled = iso > today;
              return (
                <button
                  key={iso}
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    onGrain("day");
                    onAnchor(iso);
                  }}
                  className={cn(
                    "h-10 rounded-sm text-sm tabular-nums transition-colors duration-150 disabled:opacity-40",
                    selected ? "bg-ink text-paper" : iso === today ? "bg-wash font-semibold" : "bg-paper",
                  )}
                >
                  {format(day, "d")}
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-sm text-pretty text-muted">
            {grain === "day" ? "This day. Tap another day, or a month for the whole month." : "This month. Tap a day to open that day."}
          </p>
        </>
      )}
    </div>
  );
}

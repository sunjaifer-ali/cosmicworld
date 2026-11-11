import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { eachDayOfInterval, endOfMonth, format, getDay, parseISO, startOfMonth } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { LineList } from "@/components/day-ledger";
import { getBooks, listReport, listShopDays, saveRates } from "@/lib/ledger.functions";
import {
  axisLabel,
  basisToPercent,
  centsToAmount,
  centreBreakdown,
  errorText,
  formatInr,
  formatRate,
  isCurrentPeriod,
  ownerRead,
  percentToBasis,
  periodRange,
  pointLabel,
  sanitizePercentInput,
  shiftAnchor,
  shopStatus,
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
  const previousAnchor = shiftAnchor(anchor, grain, -1);
  const previousRange = periodRange(previousAnchor, grain);
  const previous = useQuery({
    queryKey: ["books", grain, previousRange.from, previousRange.to],
    queryFn: () => getBooks({ data: { from: previousRange.from, to: previousRange.to, grain } }),
    enabled: Boolean(books) && !quiet,
  });
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
          {quiet && grain === "day" && (books.shop === "holiday" || books.shop === "leave") ? (
            <div className="rounded-xl border border-dashed border-line bg-card px-4 py-8 text-center">
              <p className="font-medium">{books.shop === "holiday" ? "Sunday holiday" : "Staff leave"}</p>
              <p className="mt-1 text-sm text-muted">No sales expected.</p>
            </div>
          ) : (
            <>
          <BookBoard books={books} previous={previous.data ?? null} today={today} grain={grain} />
          {quiet ? (
            <div className="rounded-xl border border-dashed border-line bg-card px-4 py-8 text-center">
              <p className="text-sm text-muted">Nothing entered for {range.label}.</p>
              {grain === "day" ? (
                <button type="button" onClick={() => onEnterDay(anchor)} className="no-print mt-3 h-11 rounded-sm bg-ink px-4 text-sm font-medium text-paper">
                  Enter on this day
                </button>
              ) : null}
            </div>
          ) : (
            <section className="rounded-xl border border-line bg-card p-4">
              <h3 className="font-display text-xl leading-tight">{grain === "year" ? "Each month" : grain === "month" ? "Each day" : "This day"}</h3>
              <div className="mt-4 h-48">
                <PeriodChart points={books.series} grain={grain} />
              </div>
              {grain !== "day" ? (
                <PeriodList
                  points={books.series.filter((point) => (grain === "year" ? point.bucket <= today.slice(0, 7) : point.bucket <= today))}
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
                  <LineList lines={books.lines} date={anchor} canRemove canEdit empty="No rows on this day." preview={6} />
                  <button type="button" onClick={() => onEnterDay(anchor)} className="no-print mt-3 h-11 rounded-sm bg-ink px-4 text-sm font-medium text-paper">
                    Enter on this day
                  </button>
                </div>
              )}
            </section>
          )}
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
  const ordered = [...points].sort((a, b) => (a.bucket < b.bucket ? 1 : a.bucket > b.bucket ? -1 : 0));
  const preview = grain === "year" ? 4 : 7;
  const shown = expanded ? ordered : ordered.slice(0, preview);
  const maxPoint = Math.max(...points.map((point) => toCents(point.sales)), 0);
  if (points.length === 0) return null;
  return (
    <ul className="mt-4 divide-y divide-line">
      {shown.map((point) => (
        <li key={point.bucket} className="flex items-center justify-between gap-3 py-2">
          <div className="min-w-0">
            <p className="font-medium">{pointLabel(point.bucket, grain)}</p>
            <p className="text-sm font-semibold tabular-nums">{formatInr(point.sales)}</p>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-wash">
              <div className="h-1.5 rounded-full bg-ink" style={{ width: `${barWidth(point.sales, maxPoint)}` }} />
            </div>
          </div>
          <button type="button" onClick={() => onOpen(point.bucket)} className="no-print h-11 shrink-0 rounded-sm bg-wash px-3 text-sm font-medium">
            Open
          </button>
        </li>
      ))}
      {points.length > preview ? (
        <li>
          <button type="button" onClick={onToggle} className="h-11 w-full text-sm font-medium text-muted">
            {expanded ? "Hide old dates" : "Show old dates"}
          </button>
        </li>
      ) : null}
    </ul>
  );
}

function BookBoard({
  books,
  previous,
  today,
  grain,
}: {
  books: BooksPayload;
  previous: BooksPayload | null;
  today: string;
  grain: Grain;
}) {
  const read = ownerRead({ books, previous, today, grain });
  const centre = centreBreakdown(books, books.rates);
  const saleOrder = ["cosmetics", "fancy", "gaming", "accessories", "mixed"];
  const buyOrder = ["cosmetics", "fancy", "accessories", "general"];
  const salesRows = saleOrder
    .map((id) => books.categories.find((row) => row.id === id))
    .filter((row): row is BooksPayload["categories"][number] => Boolean(row && toCents(row.sales) > 0));
  const buyRows = buyOrder
    .map((id) => books.categories.find((row) => row.id === id))
    .filter((row): row is BooksPayload["categories"][number] => Boolean(row && toCents(row.purchases) > 0));
  const expenses = books.expenses.filter((row) => toCents(row.total) > 0);
  const bankOn =
    toCents(books.bankGiven) > 0 ||
    toCents(books.bankReturned) > 0 ||
    toCents(books.bankHeld) !== 0 ||
    toCents(books.bankDue) > 0;
  const gpayWaiting = toCents(books.gpayStill);

  return (
    <>
      <article className="rounded-xl border border-line border-t-4 border-t-sign bg-card px-4 py-4">
        <p className="text-xs font-medium text-muted">Profit</p>
        <p className={cn("mt-1 font-display text-4xl leading-none tabular-nums", toCents(read.result) < 0 && "text-danger")}>
          {formatInr(read.result)}
        </p>
        {read.compare ? <p className="mt-2 text-sm font-medium">{read.compare}</p> : null}
      </article>

      <Sheet
        title="Sales"
        rows={salesRows.map((row) => ({ label: row.label.replace(" sales", ""), value: row.sales }))}
        total={books.salesTotal}
      />
      <Sheet title="Purchase" rows={buyRows.map((row) => ({ label: row.label.replace(" purchases", ""), value: row.purchases }))} total={books.purchaseTotal} />
      <Sheet title="Expense" rows={expenses.map((row) => ({ label: row.label, value: row.total }))} total={books.expenseTotal} />

      <section className="rounded-xl border border-line bg-card">
        <h3 className="border-b border-line px-4 py-3 font-display text-lg">How the profit is made</h3>
        <ul>
          {centre.rows.map((row) => (
            <li key={row.label} className="flex items-baseline justify-between gap-3 px-4 py-2 text-sm">
              <span>
                {row.label.replace(" sales", "")}
                <span className="text-muted"> {row.rate}</span>
              </span>
              <span className="font-semibold tabular-nums">{formatInr(row.ours)}</span>
            </li>
          ))}
          {toCents(books.expenseTotal) > 0 ? (
            <li className="flex items-baseline justify-between gap-3 px-4 py-2 text-sm">
              <span>Expenses</span>
              <span className="font-semibold tabular-nums">−{formatInr(books.expenseTotal)}</span>
            </li>
          ) : null}
        </ul>
        <p className="flex items-baseline justify-between border-t border-line px-4 py-3 font-medium">
          <span>Profit</span>
          <span className={cn("tabular-nums", toCents(centre.result) < 0 && "text-danger")}>{formatInr(centre.result)}</span>
        </p>
        <div className="px-4 pb-3">
          <RateEditor rates={books.rates} />
        </div>
      </section>

      <Sheet
        title="Cash and GPay"
        rows={[
          { label: "Cash sales", value: moneyOf(books, "cash", "sales") },
          { label: "GPay sales", value: moneyOf(books, "gpay", "sales") },
          { label: "Put cash", value: books.cashIn, hint: "from your pocket, not a sale" },
          { label: "Take cash", value: books.cashOut, hint: "taken home" },
          ...(gpayWaiting > 0 ? [{ label: "GPay not in the bank yet", value: books.gpayStill }] : []),
        ]}
      />

      {bankOn ? (
        <Sheet
          title="Bank savings"
          rows={[
            { label: "Given to the agent", value: books.bankGiven },
            { label: "Came back", value: books.bankReturned },
            { label: "Interest, already inside came back", value: books.bankInterest },
            { label: "Due back", value: books.bankDue },
          ]}
          totalLabel="Still with the bank"
          total={books.bankHeld}
        />
      ) : null}
    </>
  );
}

function Sheet({
  title,
  rows,
  total,
  totalLabel = "Total",
}: {
  title: string;
  rows: { label: string; value: string; hint?: string }[];
  total?: string;
  totalLabel?: string;
}) {
  const shown = rows.filter((row) => toCents(row.value) !== 0);
  if (shown.length === 0 && (!total || toCents(total) === 0)) return null;
  return (
    <section className="rounded-xl border border-line bg-card">
      <h3 className="border-b border-line px-4 py-3 font-display text-lg">{title}</h3>
      <ul>
        {shown.map((row) => (
          <li key={row.label} className="flex items-baseline justify-between gap-3 px-4 py-2">
            <span className="text-sm">
              {row.label}
              {row.hint ? <span className="text-muted"> · {row.hint}</span> : null}
            </span>
            <span className="font-semibold tabular-nums">{formatInr(row.value)}</span>
          </li>
        ))}
      </ul>
      {total ? (
        <p className="flex items-baseline justify-between gap-3 border-t border-line px-4 py-3 font-medium">
          <span>{totalLabel}</span>
          <span className={cn("tabular-nums", toCents(total) < 0 && "text-danger")}>{formatInr(total)}</span>
        </p>
      ) : null}
    </section>
  );
}

function barWidth(value: string, max: number) {
  const cents = toCents(value);
  if (max <= 0 || cents <= 0) return "0%";
  return `${Math.min(100, Math.max(8, Math.round((cents / max) * 100)))}%`;
}

function moneyOf(books: BooksPayload, payment: "cash" | "gpay", field: "sales" | "purchases" | "expenses") {
  return books.payments.find((row) => row.payment === payment)?.[field] ?? "0.00";
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
  const marks = useQuery({
    queryKey: ["shop-days", format(monthDate, "yyyy-MM-dd"), format(endOfMonth(monthDate), "yyyy-MM-dd")],
    queryFn: () =>
      listShopDays({
        data: { from: format(monthDate, "yyyy-MM-dd"), to: format(endOfMonth(monthDate), "yyyy-MM-dd") },
      }),
    enabled: grain !== "year",
  });
  const markOf = new Map((marks.data?.days ?? []).map((row) => [row.date, row.kind]));

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
              const marked = markOf.get(iso);
              const status = shopStatus(iso, marked === "leave" || marked === "worked" ? marked : null);
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
                    !selected && status === "holiday" && "text-muted",
                    !selected && status === "leave" && "bg-sign",
                  )}
                >
                  {format(day, "d")}
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-sm text-pretty text-muted">
            Sundays are holidays. A highlighted day is staff leave.
          </p>
        </>
      )}
    </div>
  );
}

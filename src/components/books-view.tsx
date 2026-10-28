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
  ownerRead,
  percentToBasis,
  periodRange,
  pointLabel,
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
  const previousAnchor = shiftAnchor(anchor, grain, -1);
  const previousRange = periodRange(previousAnchor, grain);
  const previous = useQuery({
    queryKey: ["books", grain, previousRange.from, previousRange.to],
    queryFn: () => getBooks({ data: { from: previousRange.from, to: previousRange.to, grain } }),
    enabled: Boolean(books) && !quiet,
  });
  const productRows = books
    ? books.categories.filter((row) => toCents(row.sales) > 0 || toCents(row.purchases) > 0)
    : [];
  const expenseRows = books ? books.expenses.filter((row) => toCents(row.total) > 0) : [];
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
          {!quiet ? <OwnerBrief books={books} previous={previous.data ?? null} today={today} grain={grain} /> : null}
          <PeriodStatement books={books} />
          <ForUs books={books} />
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
              {productRows.length > 0 || expenseRows.length > 0 ? (
                <section className="grid gap-3 lg:grid-cols-2">
                  {productRows.length > 0 ? (
                    <article className="rounded-xl border border-line bg-card p-4">
                      <h3 className="font-display text-xl leading-tight">By category</h3>
                      <table className="mt-3 w-full text-sm">
                        <thead>
                          <tr className="border-b border-line text-left text-muted">
                            <th className="py-2 font-medium">Category</th>
                            <th className="py-2 text-right font-medium">Sales</th>
                            <th className="py-2 text-right font-medium">Purchases</th>
                          </tr>
                        </thead>
                        <tbody>
                          {productRows.map((row) => (
                            <tr key={row.id} className="border-b border-line last:border-0">
                              <td className="py-2">{row.label}</td>
                              <td className="py-2 text-right tabular-nums">{toCents(row.sales) > 0 ? formatInr(row.sales) : "—"}</td>
                              <td className="py-2 text-right tabular-nums">{toCents(row.purchases) > 0 ? formatInr(row.purchases) : "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </article>
                  ) : null}
                  {expenseRows.length > 0 ? (
                    <article className="rounded-xl border border-line bg-card p-4">
                      <h3 className="font-display text-xl leading-tight">Expenses</h3>
                      <table className="mt-3 w-full text-sm">
                        <tbody>
                          {expenseRows.map((row) => (
                            <tr key={row.id} className="border-b border-line last:border-0">
                              <td className="py-2">{row.label}</td>
                              <td className="py-2 text-right font-semibold tabular-nums">{formatInr(row.total)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </article>
                  ) : null}
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

function OwnerBrief({
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
  const short = toCents(read.result) < 0;
  return (
    <section className="rounded-xl border border-line bg-card p-4">
      <p className="text-sm font-medium text-muted">For the owner</p>
      <p className={cn("mt-1 font-display text-3xl leading-none tabular-nums", short && "text-danger")}>
        For us {formatInr(read.result)}
      </p>
      {read.compare ? <p className="mt-2 text-sm font-medium">{read.compare}</p> : null}
      {read.notes.length > 0 ? (
        <ul className="mt-3 space-y-2 text-sm text-pretty">
          {read.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function moneyOf(books: BooksPayload, payment: "cash" | "gpay", field: "sales" | "purchases" | "expenses") {
  return books.payments.find((row) => row.payment === payment)?.[field] ?? "0.00";
}

function PeriodStatement({ books }: { books: BooksPayload }) {
  const left = leftAfter(books.salesTotal, books.purchaseTotal, books.expenseTotal);
  const cashLeft = leftAfter(moneyOf(books, "cash", "sales"), moneyOf(books, "cash", "purchases"), moneyOf(books, "cash", "expenses"));
  const till = cashAfterBank(moneyOf(books, "cash", "sales"), moneyOf(books, "cash", "purchases"), moneyOf(books, "cash", "expenses"), books.bankGiven, books.bankReturned, "0");
  const bankMoved = toCents(books.bankGiven) > 0 || toCents(books.bankReturned) > 0;
  const rows = [
    ["Sales", "sales"],
    ["Purchases", "purchases"],
    ["Expenses", "expenses"],
  ] as const;

  return (
    <section className="overflow-hidden rounded-xl border border-line bg-card">
      <h3 className="px-4 pt-4 font-display text-xl leading-tight">This period</h3>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[22rem] text-sm">
          <thead>
            <tr className="border-y border-line text-muted">
              <th className="px-4 py-2 text-left font-medium"> </th>
              <th className="px-3 py-2 text-right font-medium">Cash</th>
              <th className="px-3 py-2 text-right font-medium">GPay</th>
              <th className="px-4 py-2 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, field]) => (
              <tr key={field} className="border-b border-line">
                <td className="px-4 py-2">{label}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatInr(moneyOf(books, "cash", field))}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatInr(moneyOf(books, "gpay", field))}</td>
                <td className="px-4 py-2 text-right font-medium tabular-nums">
                  {formatInr(field === "sales" ? books.salesTotal : field === "purchases" ? books.purchaseTotal : books.expenseTotal)}
                </td>
              </tr>
            ))}
            <tr>
              <td className="px-4 py-3 font-medium">Left</td>
              <td className={cn("px-3 py-3 text-right font-semibold tabular-nums", toCents(cashLeft) < 0 && "text-danger")}>{formatInr(cashLeft)}</td>
              <td className={cn("px-3 py-3 text-right font-semibold tabular-nums", toCents(leftAfter(moneyOf(books, "gpay", "sales"), moneyOf(books, "gpay", "purchases"), moneyOf(books, "gpay", "expenses"))) < 0 && "text-danger")}>
                {formatInr(leftAfter(moneyOf(books, "gpay", "sales"), moneyOf(books, "gpay", "purchases"), moneyOf(books, "gpay", "expenses")))}
              </td>
              <td className={cn("px-4 py-3 text-right font-semibold tabular-nums", toCents(left) < 0 && "text-danger")}>{formatInr(left)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="px-4 pb-4 text-sm text-pretty text-muted">
        Left is sales minus purchases and expenses. Purchases are stock, not a loss. This is not the profit.
      </p>
      <div className="border-t border-line px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <p className="font-medium">Cash in the till</p>
          <p className={cn("font-semibold tabular-nums", toCents(till) < 0 && "text-danger")}>{formatInr(till)}</p>
        </div>
        <p className="mt-1 text-sm text-pretty text-muted">
          {bankMoved
            ? `Bank pay is taken out of the drawer. Given ${formatInr(books.bankGiven)}, back ${formatInr(books.bankReturned)}. GPay is not in the till.`
            : "Cash left after purchases and expenses. GPay is not in the till."}
        </p>
      </div>
    </section>
  );
}

function ForUs({ books }: { books: BooksPayload }) {
  const centre = centreBreakdown(books, books.rates);
  return (
    <section className="rounded-xl border border-line bg-card p-4">
      <h3 className="font-display text-xl leading-tight">For us</h3>
      <p className="mt-1 text-sm text-pretty text-muted">
        Our share of sales, then expenses come off. Purchases and bank savings are not taken off here.
      </p>
      {centre.rows.length > 0 ? (
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-muted">
              <th className="py-2 font-medium">From</th>
              <th className="py-2 text-right font-medium">Sales</th>
              <th className="py-2 text-right font-medium">Share</th>
              <th className="py-2 text-right font-medium">Ours</th>
            </tr>
          </thead>
          <tbody>
            {centre.rows.map((row) => (
              <tr key={row.label} className="border-b border-line">
                <td className="py-2">{row.label}</td>
                <td className="py-2 text-right tabular-nums">{formatInr(row.sales)}</td>
                <td className="py-2 text-right tabular-nums">{row.rate}</td>
                <td className="py-2 text-right tabular-nums">{formatInr(row.ours)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="mt-3 text-sm text-muted">No sales in this period.</p>
      )}
      <div className="mt-3 space-y-2 text-sm">
        <MoneyLine label="Share of sales" value={formatInr(centre.margin)} />
        <MoneyLine label="Expenses" value={toCents(books.expenseTotal) > 0 ? `−${formatInr(books.expenseTotal)}` : formatInr(books.expenseTotal)} />
        <div className="flex items-center justify-between gap-3 border-t border-line pt-2">
          <p className="font-medium">For us</p>
          <p className={cn("text-lg font-semibold tabular-nums", toCents(centre.result) < 0 && "text-danger")}>{formatInr(centre.result)}</p>
        </div>
      </div>
      <RateEditor rates={books.rates} />
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
      <h3 className="font-display text-xl leading-tight">Bank savings</h3>
      <p className="mt-1 text-sm text-pretty text-muted">Cash with the collection agent. It comes back in about six months, with interest. Not part of For us.</p>
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

function MoneyLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <p>{label}</p>
      <p className="tabular-nums">{value}</p>
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

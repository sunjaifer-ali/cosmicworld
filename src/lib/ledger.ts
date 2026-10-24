import {
  addDays,
  addMonths,
  addYears,
  endOfMonth,
  endOfYear,
  format,
  parseISO,
  startOfMonth,
  startOfYear,
} from "date-fns";
import { z } from "zod";

export const SALE_CATEGORIES = [
  { id: "cosmetics", label: "Cosmetics" },
  { id: "fancy", label: "Fancy" },
  { id: "accessories", label: "Accessories" },
  { id: "mixed", label: "Mixed" },
  { id: "gaming", label: "Gaming" },
] as const;

export const PURCHASE_CATEGORIES = [
  { id: "cosmetics", label: "Cosmetics" },
  { id: "fancy", label: "Fancy" },
  { id: "accessories", label: "Accessories" },
  { id: "general", label: "General" },
] as const;

export const CATEGORY_ROWS = [
  { id: "cosmetics", label: "Cosmetics" },
  { id: "fancy", label: "Fancy" },
  { id: "accessories", label: "Accessories" },
  { id: "mixed", label: "Mixed sales" },
  { id: "gaming", label: "Gaming" },
  { id: "general", label: "General purchases" },
] as const;

export const EXPENSE_CATEGORIES = [
  { id: "rent", label: "Rent" },
  { id: "salary", label: "Salary" },
  { id: "electricity", label: "Current" },
  { id: "transport", label: "Transport" },
  { id: "other", label: "Other" },
] as const;

export const PAYMENTS = [
  { id: "cash", label: "Cash" },
  { id: "gpay", label: "GPay" },
] as const;

/** Starting keep-rates, in basis points of the selling price. 15% is 1500. */
export const DEFAULT_RATES = {
  cosmetics: 1500,
  fancy: 7000,
  accessories: 7000,
  mixed: 4250,
  gaming: 10000,
  mixedAverage: true,
} as const;

export type MarginRates = {
  cosmetics: number;
  fancy: number;
  accessories: number;
  mixed: number;
  gaming: number;
  mixedAverage: boolean;
};

export function resolveRates(rates: MarginRates): MarginRates {
  if (!rates.mixedAverage) return rates;
  return { ...rates, mixed: Math.round((rates.fancy + rates.cosmetics) / 2) };
}

export function basisToPercent(basis: number): string {
  const percent = basis / 100;
  return Number.isInteger(percent) ? String(percent) : percent.toFixed(1);
}

export function formatRate(basis: number): string {
  return `${basisToPercent(basis)}%`;
}

export function percentToBasis(raw: string): number | null {
  const cleaned = raw.trim();
  if (!/^\d{1,3}(\.\d)?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value < 0 || value > 100) return null;
  return Math.round(value * 100);
}

export function sanitizePercentInput(raw: string): string {
  const cleaned = raw.replace(/[^\d.]/g, "");
  const dot = cleaned.indexOf(".");
  const next = dot === -1 ? cleaned : `${cleaned.slice(0, dot)}.${cleaned.slice(dot + 1).replace(/\./g, "").slice(0, 1)}`;
  if (next === "" || next === ".") return next;
  if (next === "0.0") return next;
  const value = Number(next);
  if (!Number.isFinite(value)) return "";
  if (value > 100) return "100";
  return next.replace(/^0+(?=\d)/, "");
}

export const BANK_DIRECTIONS = [
  { id: "given", label: "Given to agent" },
  { id: "returned", label: "Received back" },
] as const;

export const saleCategorySchema = z.enum(["cosmetics", "fancy", "accessories", "mixed", "gaming"]);
export const purchaseCategorySchema = z.enum(["cosmetics", "fancy", "accessories", "general"]);
export const paymentSchema = z.enum(["cash", "gpay"]);
export const bankDirectionSchema = z.enum(["given", "returned"]);
export const expenseCategorySchema = z.enum(["rent", "salary", "electricity", "transport", "other"]);
export const grainSchema = z.enum(["day", "month", "year"]);
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a valid date");

export const amountSchema = z
  .string()
  .trim()
  .regex(/^\d{1,7}(\.\d{1,2})?$/, "Enter the amount, like 250 or 250.50")
  .refine((value) => toCents(value) > 0, "Amount must be more than zero");

export const saleInput = z.object({
  date: dateSchema,
  category: saleCategorySchema,
  amount: amountSchema,
  payment: paymentSchema,
});

export const purchaseInput = z.object({
  date: dateSchema,
  category: purchaseCategorySchema,
  amount: amountSchema,
  payment: paymentSchema,
});

export const gamingInput = z.object({
  date: dateSchema,
  amount: amountSchema,
  payment: paymentSchema,
});

export const expenseInput = z
  .object({
    date: dateSchema,
    category: expenseCategorySchema,
    amount: amountSchema,
    payment: paymentSchema,
    remark: z.string().trim().max(80, "Remark can be at most 80 characters").optional(),
  })
  .superRefine((value, ctx) => {
    if (value.category === "other" && !value.remark?.trim()) {
      ctx.addIssue({ code: "custom", message: "Add a short remark for Other", path: ["remark"] });
    }
  });

export const removeInput = z.object({
  id: z.number().int().positive(),
});

export const interestSchema = z
  .string()
  .trim()
  .regex(/^\d{0,7}(\.\d{1,2})?$/, "Enter the interest, like 50 or 0");

export const bankInput = z
  .object({
    date: dateSchema,
    direction: bankDirectionSchema,
    amount: amountSchema,
    interest: interestSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.direction !== "returned") return;
    const interest = canonicalInterest(value.interest ?? "0");
    const amount = canonicalAmount(value.amount);
    if (!interest || !amount) return;
    if (toCents(interest) > toCents(amount)) {
      ctx.addIssue({
        code: "custom",
        message: "Interest cannot be more than the money received",
        path: ["interest"],
      });
    }
  });

export const booksInput = z.object({
  from: dateSchema,
  to: dateSchema,
  grain: grainSchema,
});

export const reportInput = z.object({
  from: dateSchema,
  to: dateSchema,
});

export type Payment = z.infer<typeof paymentSchema>;
export type BankDirection = z.infer<typeof bankDirectionSchema>;
export type SaleCategory = z.infer<typeof saleCategorySchema>;
export type PurchaseCategory = z.infer<typeof purchaseCategorySchema>;
export type ExpenseCategory = z.infer<typeof expenseCategorySchema>;
export type Grain = z.infer<typeof grainSchema>;

export type LedgerLine = {
  id: number;
  kind: "sale" | "purchase" | "expense" | "gaming";
  category: string;
  amount: string;
  payment: Payment;
  remark: string | null;
  enteredAt: string;
};

export type SeriesPoint = {
  bucket: string;
  sales: string;
  purchases: string;
  expenses: string;
};

export type BooksPayload = {
  from: string;
  to: string;
  grain: Grain;
  salesTotal: string;
  purchaseTotal: string;
  expenseTotal: string;
  saleCount: number;
  purchaseCount: number;
  expenseCount: number;
  payments: {
    payment: Payment;
    sales: string;
    purchases: string;
    expenses: string;
    saleCount: number;
    purchaseCount: number;
    expenseCount: number;
    gaming: string;
    gamingCount: number;
  }[];
  categories: {
    id: string;
    label: string;
    sales: string;
    purchases: string;
  }[];
  expenses: {
    id: string;
    label: string;
    total: string;
  }[];
  series: SeriesPoint[];
  lines: LedgerLine[];
  bankGiven: string;
  bankReturned: string;
  bankInterest: string;
  bankHeld: string;
  bankDue: string;
  gamingTotal: string;
  gamingCount: number;
  rates: MarginRates;
};

export type BankLine = {
  id: number;
  direction: BankDirection;
  amount: string;
  interest: string;
  due: string | null;
  enteredAt: string;
};

export type ReportRow = {
  date: string;
  kind: "sale" | "purchase" | "expense" | "bank" | "gaming";
  detail: string;
  payment: string;
  amount: string;
  note: string;
};

export function todayISO(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function sanitizeRemark(raw: string): string {
  return raw.replace(/[\u0000-\u001F]/g, "").slice(0, 80);
}

export function sanitizeAmountInput(raw: string): string {
  const cleaned = raw.replace(/[₹,\s]/g, "");
  const dot = cleaned.indexOf(".");
  const wholeDigits = (dot === -1 ? cleaned : cleaned.slice(0, dot)).replace(/\D/g, "").slice(0, 7);
  if (dot === -1) return wholeDigits;
  const fracDigits = cleaned.slice(dot + 1).replace(/\D/g, "").slice(0, 2);
  return `${wholeDigits}.${fracDigits}`;
}

export function toCents(value: string | number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

export function centsToAmount(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, "0");
  return `${sign}${whole}.${frac}`;
}

export function canonicalAmount(raw: string): string | null {
  const cleaned = sanitizeAmountInput(raw).replace(/\.$/, "");
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(cleaned)) return null;
  const cents = toCents(cleaned);
  if (cents <= 0) return null;
  return centsToAmount(cents);
}

export function canonicalInterest(raw: string): string | null {
  const cleaned = sanitizeAmountInput(raw).replace(/\.$/, "");
  if (!cleaned) return "0.00";
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(cleaned)) return null;
  return centsToAmount(toCents(cleaned));
}

export function bankDueDate(iso: string): string {
  return format(addMonths(parseISO(iso), 6), "d MMMM yyyy");
}

export function marginRateLabel(id: string, rates: MarginRates): string {
  const basis = rates[id as keyof MarginRates];
  return typeof basis === "number" ? formatRate(basis) : "";
}

export function marginCents(category: string, amount: string, rates: MarginRates): number {
  const basis = rates[category as keyof MarginRates];
  const points = typeof basis === "number" ? basis : 0;
  return Math.round((toCents(amount) * points) / 10000);
}

export function centreFromLines(
  lines: { kind: string; category: string; amount: string }[],
  rates: MarginRates,
): string {
  const resolved = resolveRates(rates);
  let cents = 0;
  for (const line of lines) {
    if (line.kind === "sale") cents += marginCents(line.category, line.amount, resolved);
    else if (line.kind === "gaming") cents += marginCents("gaming", line.amount, resolved);
    else if (line.kind === "expense") cents -= toCents(line.amount);
  }
  return centsToAmount(cents);
}

export function centreBreakdown(
  input: {
    categories: { id: string; label: string; sales: string }[];
    gamingTotal: string;
    expenseTotal: string;
  },
  rates: MarginRates,
): { rows: { label: string; sales: string; rate: string; ours: string }[]; margin: string; result: string } {
  const resolved = resolveRates(rates);
  const order = ["cosmetics", "fancy", "accessories", "mixed", "gaming"] as const;
  let margin = 0;
  const rows: { label: string; sales: string; rate: string; ours: string }[] = [];
  for (const id of order) {
    const found = input.categories.find((row) => row.id === id);
    const sales = found?.sales ?? "0.00";
    if (toCents(sales) <= 0) continue;
    const ours = marginCents(id, sales, resolved);
    margin += ours;
    rows.push({
      label: found?.label ?? id,
      sales,
      rate: marginRateLabel(id, resolved),
      ours: centsToAmount(ours),
    });
  }
  const gamingAlready = toCents(input.categories.find((row) => row.id === "gaming")?.sales ?? "0");
  if (toCents(input.gamingTotal) > 0 && gamingAlready === 0) {
    const ours = marginCents("gaming", input.gamingTotal, resolved);
    margin += ours;
    rows.push({ label: "Gaming", sales: input.gamingTotal, rate: marginRateLabel("gaming", resolved), ours: centsToAmount(ours) });
  }
  return {
    rows,
    margin: centsToAmount(margin),
    result: centsToAmount(margin - toCents(input.expenseTotal)),
  };
}

export function cashAfterBank(
  sales: string,
  purchases: string,
  expenses: string,
  given: string,
  returned: string,
  gaming = "0",
): string {
  return centsToAmount(
    toCents(sales) -
      toCents(purchases) -
      toCents(expenses) -
      toCents(given) +
      toCents(returned) +
      toCents(gaming),
  );
}

export function addAmounts(values: Array<string | number>): string {
  return centsToAmount(values.reduce<number>((sum, value) => sum + toCents(value), 0));
}

export function subtractAmounts(left: string, right: string): string {
  return centsToAmount(toCents(left) - toCents(right));
}

export function leftAfter(sales: string, purchases: string, expenses: string): string {
  return centsToAmount(toCents(sales) - toCents(purchases) - toCents(expenses));
}

export function formatInr(value: string | number): string {
  const cents = toCents(value);
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  const grouped = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(whole);
  const body = frac === 0 ? grouped : `${grouped}.${String(frac).padStart(2, "0")}`;
  return `${negative ? "−" : ""}₹${body}`;
}

export function categoryLabel(id: string): string {
  if (id === "gaming") return "Gaming";
  if (id === "mixed") return "Mixed";
  if (id === "general") return "General";
  const named = [...SALE_CATEGORIES, ...PURCHASE_CATEGORIES, ...EXPENSE_CATEGORIES].find(
    (item) => item.id === id,
  );
  return named?.label ?? id;
}

export function paymentLabel(id: string): string {
  return id === "gpay" ? "GPay" : "Cash";
}

export function formatClock(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit" }).format(date);
}

export function longDate(iso: string): string {
  return format(parseISO(iso), "EEEE, d MMMM yyyy");
}

export function periodRange(anchor: string, grain: Grain): { from: string; to: string; label: string } {
  const date = parseISO(anchor);
  if (grain === "day") return { from: anchor, to: anchor, label: format(date, "d MMMM yyyy") };
  if (grain === "month") {
    return {
      from: format(startOfMonth(date), "yyyy-MM-dd"),
      to: format(endOfMonth(date), "yyyy-MM-dd"),
      label: format(date, "MMMM yyyy"),
    };
  }
  return {
    from: format(startOfYear(date), "yyyy-MM-dd"),
    to: format(endOfYear(date), "yyyy-MM-dd"),
    label: format(date, "yyyy"),
  };
}

export function shiftAnchor(anchor: string, grain: Grain, direction: -1 | 1): string {
  const date = parseISO(anchor);
  const next =
    grain === "day"
      ? addDays(date, direction)
      : grain === "month"
        ? addMonths(date, direction)
        : addYears(date, direction);
  return format(next, "yyyy-MM-dd");
}

export function isCurrentPeriod(anchor: string, grain: Grain, today: string): boolean {
  if (grain === "day") return anchor === today;
  if (grain === "month") return anchor.slice(0, 7) === today.slice(0, 7);
  return anchor.slice(0, 4) === today.slice(0, 4);
}

export function axisLabel(bucket: string, grain: Grain): string {
  if (grain === "year") return format(parseISO(`${bucket}-01`), "MMM");
  if (grain === "month") return format(parseISO(bucket), "d");
  return format(parseISO(bucket), "d MMM");
}

export function pointLabel(bucket: string, grain: Grain): string {
  if (grain === "year") return format(parseISO(`${bucket}-01`), "MMMM yyyy");
  return format(parseISO(bucket), "EEE, d MMM");
}

export function buildSeries(
  grain: Grain,
  from: string,
  to: string,
  rows: { kind: string; bucket: string; total: string }[],
): SeriesPoint[] {
  const buckets: string[] = [];
  if (grain === "year") {
    const start = startOfYear(parseISO(from));
    for (let index = 0; index < 12; index += 1) {
      buckets.push(format(addMonths(start, index), "yyyy-MM"));
    }
  } else if (grain === "month") {
    let cursor = parseISO(from);
    const end = parseISO(to);
    while (cursor.getTime() <= end.getTime()) {
      buckets.push(format(cursor, "yyyy-MM-dd"));
      cursor = addDays(cursor, 1);
    }
  } else {
    buckets.push(from);
  }

  const sales = new Map<string, string>();
  const purchases = new Map<string, string>();
  const expenses = new Map<string, string>();
  for (const row of rows) {
    const target = row.kind === "purchase" ? purchases : row.kind === "expense" ? expenses : sales;
    target.set(row.bucket, addAmounts([target.get(row.bucket) ?? "0", row.total]));
  }

  return buckets.map((bucket) => ({
    bucket,
    sales: sales.get(bucket) ?? "0.00",
    purchases: purchases.get(bucket) ?? "0.00",
    expenses: expenses.get(bucket) ?? "0.00",
  }));
}

export function errorText(error: unknown, fallback: string): string {
  if (!(error instanceof Error) || !error.message) return fallback;
  const message = error.message;
  if (message.startsWith("[") || message.startsWith("{") || /fetch|network|load failed/i.test(message)) {
    return fallback;
  }
  return message;
}

import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { accountFromContext, requireCounter } from "@/lib/counter";
import { counterMiddleware } from "@/lib/counter-middleware";
import {
  addAmounts,
  bankDueDate,
  bankInput,
  booksInput,
  buildSeries,
  canonicalAmount,
  canonicalInterest,
  CATEGORY_ROWS,
  dateSchema,
  DEFAULT_RATES,
  EXPENSE_CATEGORIES,
  expenseInput,
  gamingInput,
  PAYMENTS,
  percentToBasis,
  purchaseInput,
  removeInput,
  reportInput,
  saleInput,
  toCents,
  type BankLine,
  type BooksPayload,
  type LedgerLine,
  type MarginRates,
  type Payment,
  type ReportRow,
} from "@/lib/ledger";
import { z } from "zod";

function asBool(value: unknown, fallback: boolean): boolean {
  if (value === true || value === "t" || value === "true") return true;
  if (value === false || value === "f" || value === "false") return false;
  return fallback;
}

async function loadRates(): Promise<MarginRates> {
  const sql = await getSql();
  const rows = await sql<{ category: string; basis: unknown }>`select category, basis from shop_rates`;
  const settings = await sql<{ mixed_average: unknown }>`select mixed_average from shop_settings where id = 1`;
  const found = new Map(rows.map((row) => [row.category, asCount(row.basis)]));
  const pick = (key: "cosmetics" | "fancy" | "accessories" | "mixed" | "gaming") =>
    found.has(key) ? (found.get(key) ?? DEFAULT_RATES[key]) : DEFAULT_RATES[key];
  return {
    cosmetics: pick("cosmetics"),
    fancy: pick("fancy"),
    accessories: pick("accessories"),
    mixed: pick("mixed"),
    gaming: pick("gaming"),
    mixedAverage: asBool(settings[0]?.mixed_average, true),
  };
}

const rateFields = z.object({
  cosmetics: z.string(),
  fancy: z.string(),
  accessories: z.string(),
  mixed: z.string(),
  gaming: z.string(),
  mixedAverage: z.boolean(),
});

export const getRates = createServerFn({ method: "GET" })
  .middleware([counterMiddleware])
  .handler(async ({ context }) => {
    requireCounter(accountFromContext(context), true);
    return loadRates();
  });

export const saveRates = createServerFn({ method: "POST" })
  .middleware([counterMiddleware])
  .validator(rateFields)
  .handler(async ({ data, context }) => {
    requireCounter(accountFromContext(context), true);
    const cosmetics = percentToBasis(data.cosmetics);
    const fancy = percentToBasis(data.fancy);
    const accessories = percentToBasis(data.accessories);
    const mixed = percentToBasis(data.mixed);
    const gaming = percentToBasis(data.gaming);
    if (cosmetics == null || fancy == null || accessories == null || mixed == null || gaming == null) {
      throw new Error("Enter each percentage from 0 to 100. One decimal is enough.");
    }
    const sql = await getSql();
    const rows: { category: string; basis: number }[] = [
      { category: "cosmetics", basis: cosmetics },
      { category: "fancy", basis: fancy },
      { category: "accessories", basis: accessories },
      { category: "mixed", basis: mixed },
      { category: "gaming", basis: gaming },
    ];
    for (const row of rows) {
      await sql`
        insert into shop_rates (category, basis)
        values (${row.category}, ${row.basis})
        on conflict (category) do update set basis = excluded.basis
      `;
    }
    await sql`
      insert into shop_settings (id, mixed_average)
      values (1, ${data.mixedAverage})
      on conflict (id) do update set mixed_average = excluded.mixed_average
    `;
    return loadRates();
  });

const dayInput = z.object({ date: dateSchema });

function assertRealDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error("Choose a valid date");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 2020 || year > 2100) throw new Error("That year is outside the book");
  const stamp = new Date(Date.UTC(year, month - 1, day));
  if (
    stamp.getUTCFullYear() !== year ||
    stamp.getUTCMonth() !== month - 1 ||
    stamp.getUTCDate() !== day
  ) {
    throw new Error("Choose a valid date");
  }
}

function assertRange(from: string, to: string) {
  assertRealDate(from);
  assertRealDate(to);
  if (from > to) throw new Error("The start date is after the end date");
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  const days = Math.round((end - start) / 86_400_000);
  if (days > 370) throw new Error("Choose a shorter period");
}

function asId(value: unknown): number {
  const id = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new Error("Could not save that entry");
  return id;
}

function asText(value: unknown): string {
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number" && Number.isFinite(value)) return value.toFixed(2);
  return "0.00";
}

function asCount(value: unknown): number {
  const count = typeof value === "number" ? value : Number(value);
  return Number.isFinite(count) ? count : 0;
}

function asPayment(value: unknown): Payment {
  return value === "gpay" ? "gpay" : "cash";
}

function asRemark(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 80) : null;
}

type LineRow = {
  id: unknown;
  kind: string;
  category: string;
  amount: unknown;
  payment: string;
  remark: string | null;
  entered_at: string;
};

function lineKind(kind: string): LedgerLine["kind"] {
  if (kind === "purchase") return "purchase";
  if (kind === "expense") return "expense";
  if (kind === "gaming") return "gaming";
  return "sale";
}

async function readLines(date: string): Promise<LedgerLine[]> {
  const sql = await getSql();
  const rows = await sql<LineRow>`
    select id, kind, category, amount, payment, remark, entered_at
    from (
      select id,
             'sale'::text as kind,
             category,
             amount::text as amount,
             payment,
             null::text as remark,
             to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as entered_at
      from sales
      where sale_date = ${date}::date
      union all
      select id,
             'purchase'::text,
             category,
             amount::text,
             payment,
             null::text,
             to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
      from purchases
      where purchase_date = ${date}::date
      union all
      select id,
             'expense'::text,
             category,
             amount::text,
             payment,
             remark,
             to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
      from expenses
      where expense_date = ${date}::date
      union all
      select id,
             'gaming'::text,
             'gaming'::text,
             amount::text,
             payment,
             null::text,
             to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
      from gaming
      where play_date = ${date}::date
    ) lines
    order by entered_at desc, id desc
  `;
  return rows.map((row) => ({
    id: asId(row.id),
    kind: lineKind(row.kind),
    category: row.category,
    amount: asText(row.amount),
    payment: asPayment(row.payment),
    remark: asRemark(row.remark),
    enteredAt: row.entered_at,
  }));
}

type BankRow = {
  id: unknown;
  direction: string;
  amount: unknown;
  interest: unknown;
  entry_date: string;
  entered_at: string;
};

async function readBank(date: string): Promise<BankLine[]> {
  const sql = await getSql();
  const rows = await sql<BankRow>`
    select id,
           direction,
           amount::text as amount,
           interest::text as interest,
           to_char(entry_date, 'YYYY-MM-DD') as entry_date,
           to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as entered_at
    from bank_savings
    where entry_date = ${date}::date
    order by entered_at desc, id desc
  `;
  return rows.map((row) => {
    const direction = row.direction === "returned" ? "returned" : "given";
    return {
      id: asId(row.id),
      direction,
      amount: asText(row.amount),
      interest: asText(row.interest),
      due: direction === "given" ? bankDueDate(row.entry_date) : null,
      enteredAt: row.entered_at,
    };
  });
}

export const listDay = createServerFn({ method: "GET" })
  .validator(dayInput)
  .middleware([counterMiddleware])
  .handler(async ({ data, context }) => {
    requireCounter(accountFromContext(context));
    assertRealDate(data.date);
    const lines = await readLines(data.date);
    const bank = await readBank(data.date);
    return { lines, bank };
  });

export const addSale = createServerFn({ method: "POST" })
  .validator(saleInput)
  .middleware([counterMiddleware])
  .handler(async ({ data, context }) => {
    requireCounter(accountFromContext(context));
    assertRealDate(data.date);
    const amount = canonicalAmount(data.amount);
    if (!amount) throw new Error("Enter the amount, like 250 or 250.50");
    const sql = await getSql();
    const rows = await sql<{ id: unknown }>`
      insert into sales (sale_date, category, amount, payment)
      values (${data.date}::date, ${data.category}, ${amount}::numeric, ${data.payment})
      returning id
    `;
    return { id: asId(rows[0]?.id) };
  });

export const addPurchase = createServerFn({ method: "POST" })
  .validator(purchaseInput)
  .middleware([counterMiddleware])
  .handler(async ({ data, context }) => {
    requireCounter(accountFromContext(context));
    assertRealDate(data.date);
    const amount = canonicalAmount(data.amount);
    if (!amount) throw new Error("Enter the amount, like 250 or 250.50");
    const sql = await getSql();
    const rows = await sql<{ id: unknown }>`
      insert into purchases (purchase_date, category, amount, payment)
      values (${data.date}::date, ${data.category}, ${amount}::numeric, ${data.payment})
      returning id
    `;
    return { id: asId(rows[0]?.id) };
  });

export const addExpense = createServerFn({ method: "POST" })
  .validator(expenseInput)
  .middleware([counterMiddleware])
  .handler(async ({ data, context }) => {
    requireCounter(accountFromContext(context));
    assertRealDate(data.date);
    const amount = canonicalAmount(data.amount);
    if (!amount) throw new Error("Enter the amount, like 250 or 250.50");
    const remark = data.category === "other" ? data.remark?.trim() || null : null;
    if (data.category === "other" && !remark) throw new Error("Add a short remark for Other");
    const sql = await getSql();
    const rows = await sql<{ id: unknown }>`
      insert into expenses (expense_date, category, amount, payment, remark)
      values (${data.date}::date, ${data.category}, ${amount}::numeric, ${data.payment}, ${remark})
      returning id
    `;
    return { id: asId(rows[0]?.id) };
  });

export const addBank = createServerFn({ method: "POST" })
  .validator(bankInput)
  .middleware([counterMiddleware])
  .handler(async ({ data, context }) => {
    requireCounter(accountFromContext(context));
    assertRealDate(data.date);
    const amount = canonicalAmount(data.amount);
    if (!amount) throw new Error("Enter the amount, like 250 or 250.50");
    const interest =
      data.direction === "returned" ? canonicalInterest(data.interest ?? "0") : "0.00";
    if (!interest) throw new Error("Enter the interest, like 50 or 0");
    if (data.direction === "returned" && toCents(interest) > toCents(amount)) {
      throw new Error("Interest cannot be more than the money received");
    }
    const sql = await getSql();
    const rows = await sql<{ id: unknown }>`
      insert into bank_savings (entry_date, direction, amount, interest)
      values (${data.date}::date, ${data.direction}, ${amount}::numeric, ${interest}::numeric)
      returning id
    `;
    return { id: asId(rows[0]?.id) };
  });

export const addGaming = createServerFn({ method: "POST" })
  .validator(gamingInput)
  .middleware([counterMiddleware])
  .handler(async ({ data, context }) => {
    requireCounter(accountFromContext(context));
    assertRealDate(data.date);
    const amount = canonicalAmount(data.amount);
    if (!amount) throw new Error("Enter the amount, like 250 or 250.50");
    const sql = await getSql();
    const rows = await sql<{ id: unknown }>`
      insert into gaming (play_date, amount, payment)
      values (${data.date}::date, ${amount}::numeric, ${data.payment})
      returning id
    `;
    return { id: asId(rows[0]?.id) };
  });

export const removeSale = createServerFn({ method: "POST" })
  .validator(removeInput)
  .middleware([counterMiddleware])
  .handler(async ({ data, context }) => {
    requireCounter(accountFromContext(context), true);
    const sql = await getSql();
    const rows = await sql<{ id: unknown }>`delete from sales where id = ${data.id} returning id`;
    if (!rows[0]) throw new Error("That sale is already gone");
    return { id: asId(rows[0].id) };
  });

export const removePurchase = createServerFn({ method: "POST" })
  .validator(removeInput)
  .middleware([counterMiddleware])
  .handler(async ({ data, context }) => {
    requireCounter(accountFromContext(context), true);
    const sql = await getSql();
    const rows = await sql<{ id: unknown }>`
      delete from purchases where id = ${data.id} returning id
    `;
    if (!rows[0]) throw new Error("That purchase is already gone");
    return { id: asId(rows[0].id) };
  });

export const removeExpense = createServerFn({ method: "POST" })
  .validator(removeInput)
  .middleware([counterMiddleware])
  .handler(async ({ data, context }) => {
    requireCounter(accountFromContext(context), true);
    const sql = await getSql();
    const rows = await sql<{ id: unknown }>`delete from expenses where id = ${data.id} returning id`;
    if (!rows[0]) throw new Error("That expense is already gone");
    return { id: asId(rows[0].id) };
  });

export const removeBank = createServerFn({ method: "POST" })
  .validator(removeInput)
  .middleware([counterMiddleware])
  .handler(async ({ data, context }) => {
    requireCounter(accountFromContext(context), true);
    const sql = await getSql();
    const rows = await sql<{ id: unknown }>`delete from bank_savings where id = ${data.id} returning id`;
    if (!rows[0]) throw new Error("That bank pay row is already gone");
    return { id: asId(rows[0].id) };
  });

export const removeGaming = createServerFn({ method: "POST" })
  .validator(removeInput)
  .middleware([counterMiddleware])
  .handler(async ({ data, context }) => {
    requireCounter(accountFromContext(context), true);
    const sql = await getSql();
    const rows = await sql<{ id: unknown }>`delete from gaming where id = ${data.id} returning id`;
    if (!rows[0]) throw new Error("That gaming row is already gone");
    return { id: asId(rows[0].id) };
  });

export const listReport = createServerFn({ method: "GET" })
  .validator(reportInput)
  .middleware([counterMiddleware])
  .handler(async ({ data, context }) => {
    requireCounter(accountFromContext(context), true);
    assertRange(data.from, data.to);
    const sql = await getSql();
    const rows = await sql<{
      entry_date: string;
      kind: string;
      detail: string;
      payment: string;
      amount: unknown;
      note: string | null;
    }>`
      select entry_date, kind, detail, payment, amount, note
      from (
        select sale_date as entry_date,
               id,
               'sale'::text as kind,
               category as detail,
               payment,
               amount::text as amount,
               ''::text as note
        from sales
        where sale_date between ${data.from}::date and ${data.to}::date
        union all
        select purchase_date,
               id,
               'purchase'::text,
               category,
               payment,
               amount::text,
               ''::text
        from purchases
        where purchase_date between ${data.from}::date and ${data.to}::date
        union all
        select expense_date,
               id,
               'expense'::text,
               category,
               payment,
               amount::text,
               coalesce(remark, '')
        from expenses
        where expense_date between ${data.from}::date and ${data.to}::date
        union all
        select entry_date,
               id,
               'bank'::text,
               direction,
               ''::text,
               amount::text,
               interest::text
        from bank_savings
        where entry_date between ${data.from}::date and ${data.to}::date
        union all
        select play_date,
               id,
               'gaming'::text,
               'gaming'::text,
               payment,
               amount::text,
               ''::text
        from gaming
        where play_date between ${data.from}::date and ${data.to}::date
      ) entries
      order by entry_date, kind, id
    `;
    const report: ReportRow[] = rows.map((row) => ({
      date: row.entry_date,
      kind: row.kind === "purchase" || row.kind === "expense" || row.kind === "bank" || row.kind === "gaming" ? row.kind : "sale",
      detail: row.detail,
      payment: row.payment,
      amount: asText(row.amount),
      note: row.note?.trim() ?? "",
    }));
    return { rows: report };
  });

type SliceRow = {
  kind: string;
  slice: string;
  key: string;
  total: unknown;
  n: unknown;
};

type SeriesRow = {
  kind: string;
  bucket: string;
  total: unknown;
};

export const getBooks = createServerFn({ method: "GET" })
  .validator(booksInput)
  .middleware([counterMiddleware])
  .handler(async ({ data, context }): Promise<BooksPayload> => {
    requireCounter(accountFromContext(context), true);
    assertRange(data.from, data.to);
    const sql = await getSql();
    const slices = await sql<SliceRow>`
      select kind, slice, key, total, n
      from (
        select 'sale'::text as kind,
               'payment'::text as slice,
               payment as key,
               coalesce(sum(amount), 0)::text as total,
               count(*)::int as n
        from sales
        where sale_date between ${data.from}::date and ${data.to}::date
        group by payment
        union all
        select 'purchase'::text,
               'payment'::text,
               payment,
               coalesce(sum(amount), 0)::text,
               count(*)::int
        from purchases
        where purchase_date between ${data.from}::date and ${data.to}::date
        group by payment
        union all
        select 'sale'::text,
               'category'::text,
               category,
               coalesce(sum(amount), 0)::text,
               count(*)::int
        from sales
        where sale_date between ${data.from}::date and ${data.to}::date
        group by category
        union all
        select 'purchase'::text,
               'category'::text,
               category,
               coalesce(sum(amount), 0)::text,
               count(*)::int
        from purchases
        where purchase_date between ${data.from}::date and ${data.to}::date
        group by category
        union all
        select 'expense'::text,
               'payment'::text,
               payment,
               coalesce(sum(amount), 0)::text,
               count(*)::int
        from expenses
        where expense_date between ${data.from}::date and ${data.to}::date
        group by payment
        union all
        select 'expense'::text,
               'category'::text,
               category,
               coalesce(sum(amount), 0)::text,
               count(*)::int
        from expenses
        where expense_date between ${data.from}::date and ${data.to}::date
        group by category
      ) slices
    `;

    const seriesRows =
      data.grain === "year"
        ? await sql<SeriesRow>`
            select kind, bucket, total
            from (
              select 'sale'::text as kind,
                     to_char(sale_date, 'YYYY-MM') as bucket,
                     coalesce(sum(amount), 0)::text as total
              from sales
              where sale_date between ${data.from}::date and ${data.to}::date
              group by to_char(sale_date, 'YYYY-MM')
              union all
              select 'purchase'::text,
                     to_char(purchase_date, 'YYYY-MM'),
                     coalesce(sum(amount), 0)::text
              from purchases
              where purchase_date between ${data.from}::date and ${data.to}::date
              group by to_char(purchase_date, 'YYYY-MM')
              union all
              select 'expense'::text,
                     to_char(expense_date, 'YYYY-MM'),
                     coalesce(sum(amount), 0)::text
              from expenses
              where expense_date between ${data.from}::date and ${data.to}::date
              group by to_char(expense_date, 'YYYY-MM')
            ) series
          `
        : await sql<SeriesRow>`
            select kind, bucket, total
            from (
              select 'sale'::text as kind,
                     to_char(sale_date, 'YYYY-MM-DD') as bucket,
                     coalesce(sum(amount), 0)::text as total
              from sales
              where sale_date between ${data.from}::date and ${data.to}::date
              group by sale_date
              union all
              select 'purchase'::text,
                     to_char(purchase_date, 'YYYY-MM-DD'),
                     coalesce(sum(amount), 0)::text
              from purchases
              where purchase_date between ${data.from}::date and ${data.to}::date
              group by purchase_date
              union all
              select 'expense'::text,
                     to_char(expense_date, 'YYYY-MM-DD'),
                     coalesce(sum(amount), 0)::text
              from expenses
              where expense_date between ${data.from}::date and ${data.to}::date
              group by expense_date
            ) series
          `;

    const lines = data.from === data.to ? await readLines(data.from) : [];

    const periodBank = await sql<{ given: unknown; returned: unknown; interest: unknown }>`
      select
        coalesce(sum(amount) filter (where direction = 'given'), 0)::text as given,
        coalesce(sum(amount) filter (where direction = 'returned'), 0)::text as returned,
        coalesce(sum(interest) filter (where direction = 'returned'), 0)::text as interest
      from bank_savings
      where entry_date between ${data.from}::date and ${data.to}::date
    `;
    const heldBank = await sql<{ held: unknown }>`
      select (
        coalesce(sum(amount) filter (where direction = 'given'), 0)
        - coalesce(sum(amount - interest) filter (where direction = 'returned'), 0)
      )::text as held
      from bank_savings
    `;
    const dueBank = await sql<{ due: unknown }>`
      select coalesce(sum(amount), 0)::text as due
      from bank_savings
      where direction = 'given'
        and (entry_date + interval '6 months')::date between ${data.from}::date and ${data.to}::date
    `;
    const gamingRows = await sql<{ payment: string; total: unknown; n: unknown }>`
      select payment,
             coalesce(sum(amount), 0)::text as total,
             count(*)::int as n
      from gaming
      where play_date between ${data.from}::date and ${data.to}::date
      group by payment
    `;

    const paySales = new Map<string, { total: string; count: number }>();
    const payPurchases = new Map<string, { total: string; count: number }>();
    const payExpenses = new Map<string, { total: string; count: number }>();
    const payGaming = new Map<string, { total: string; count: number }>();
    const catSales = new Map<string, string>();
    const catPurchases = new Map<string, string>();
    const catExpenses = new Map<string, string>();

    for (const row of slices) {
      const total = asText(row.total);
      const count = asCount(row.n);
      if (row.slice === "payment") {
        const target =
          row.kind === "purchase" ? payPurchases : row.kind === "expense" ? payExpenses : paySales;
        target.set(row.key, { total, count });
      } else if (row.kind === "purchase") {
        catPurchases.set(row.key, total);
      } else if (row.kind === "expense") {
        catExpenses.set(row.key, total);
      } else {
        catSales.set(row.key, total);
      }
    }

    for (const row of gamingRows) {
      payGaming.set(row.payment, { total: asText(row.total), count: asCount(row.n) });
    }

    const payments = PAYMENTS.map((payment) => ({
      payment: payment.id,
      sales: paySales.get(payment.id)?.total ?? "0.00",
      purchases: payPurchases.get(payment.id)?.total ?? "0.00",
      expenses: payExpenses.get(payment.id)?.total ?? "0.00",
      saleCount: paySales.get(payment.id)?.count ?? 0,
      purchaseCount: payPurchases.get(payment.id)?.count ?? 0,
      expenseCount: payExpenses.get(payment.id)?.count ?? 0,
      gaming: payGaming.get(payment.id)?.total ?? "0.00",
      gamingCount: payGaming.get(payment.id)?.count ?? 0,
    }));

    return {
      from: data.from,
      to: data.to,
      grain: data.grain,
      salesTotal: addAmounts(payments.map((row) => row.sales)),
      purchaseTotal: addAmounts(payments.map((row) => row.purchases)),
      expenseTotal: addAmounts(payments.map((row) => row.expenses)),
      saleCount: payments.reduce((sum, row) => sum + row.saleCount, 0),
      purchaseCount: payments.reduce((sum, row) => sum + row.purchaseCount, 0),
      expenseCount: payments.reduce((sum, row) => sum + row.expenseCount, 0),
      payments,
      categories: CATEGORY_ROWS.map((row) => ({
        id: row.id,
        label: row.label,
        sales: catSales.get(row.id) ?? "0.00",
        purchases: catPurchases.get(row.id) ?? "0.00",
      })),
      expenses: EXPENSE_CATEGORIES.map((row) => ({
        id: row.id,
        label: row.label,
        total: catExpenses.get(row.id) ?? "0.00",
      })),
      series: buildSeries(
        data.grain,
        data.from,
        data.to,
        seriesRows.map((row) => ({ kind: row.kind, bucket: row.bucket, total: asText(row.total) })),
      ),
      lines,
      bankGiven: asText(periodBank[0]?.given),
      bankReturned: asText(periodBank[0]?.returned),
      bankInterest: asText(periodBank[0]?.interest),
      bankHeld: asText(heldBank[0]?.held),
      bankDue: asText(dueBank[0]?.due),
      gamingTotal: addAmounts(payments.map((row) => row.gaming)),
      gamingCount: payments.reduce((sum, row) => sum + row.gamingCount, 0),
      rates: await loadRates(),
    };
  });

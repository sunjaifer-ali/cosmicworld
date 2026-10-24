import { createServerFn } from "@tanstack/react-start";
import { accountFromContext, requireCounter } from "@/lib/counter";
import { counterMiddleware } from "@/lib/counter-middleware";
import { getSql, type Sql } from "@/lib/db";
import { backupFileSchema, type BackupFile } from "@/lib/backup";

function asCount(value: unknown): number {
  const count = typeof value === "number" ? value : Number(value);
  return Number.isFinite(count) ? count : 0;
}

function asText(value: unknown): string {
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number" && Number.isFinite(value)) return value.toFixed(2);
  return "0.00";
}

function asBool(value: unknown): boolean {
  return value === true || value === "t" || value === "true";
}

export const exportBackup = createServerFn({ method: "GET" })
  .middleware([counterMiddleware])
  .handler(async ({ context }): Promise<BackupFile> => {
    requireCounter(accountFromContext(context), true);
    const sql = await getSql();
    const sales = await sql<{
      id: unknown;
      sale_date: string;
      category: string;
      amount: unknown;
      payment: string;
      created_at: string;
    }>`
      select id,
             to_char(sale_date, 'YYYY-MM-DD') as sale_date,
             category,
             amount::text as amount,
             payment,
             to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as created_at
      from sales
      order by id
    `;
    const purchases = await sql<{
      id: unknown;
      purchase_date: string;
      category: string;
      amount: unknown;
      payment: string;
      created_at: string;
    }>`
      select id,
             to_char(purchase_date, 'YYYY-MM-DD') as purchase_date,
             category,
             amount::text as amount,
             payment,
             to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as created_at
      from purchases
      order by id
    `;
    const expenses = await sql<{
      id: unknown;
      expense_date: string;
      category: string;
      amount: unknown;
      payment: string;
      remark: string | null;
      created_at: string;
    }>`
      select id,
             to_char(expense_date, 'YYYY-MM-DD') as expense_date,
             category,
             amount::text as amount,
             payment,
             remark,
             to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as created_at
      from expenses
      order by id
    `;
    const bank = await sql<{
      id: unknown;
      entry_date: string;
      direction: string;
      amount: unknown;
      interest: unknown;
      created_at: string;
    }>`
      select id,
             to_char(entry_date, 'YYYY-MM-DD') as entry_date,
             direction,
             amount::text as amount,
             interest::text as interest,
             to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as created_at
      from bank_savings
      order by id
    `;
    const gaming = await sql<{
      id: unknown;
      play_date: string;
      amount: unknown;
      payment: string;
      created_at: string;
    }>`
      select id,
             to_char(play_date, 'YYYY-MM-DD') as play_date,
             amount::text as amount,
             payment,
             to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as created_at
      from gaming
      order by id
    `;
    const rates = await sql<{ category: string; basis: unknown }>`select category, basis from shop_rates`;
    const settings = await sql<{ mixed_average: unknown }>`select mixed_average from shop_settings where id = 1`;
    const found = new Map(rates.map((row) => [row.category, asCount(row.basis)]));
    const basisOf = (key: string, fallback: number) => {
      const value = found.get(key);
      return typeof value === "number" && Number.isFinite(value) ? value : fallback;
    };
    const file: BackupFile = {
      kind: "cosmic-world-backup",
      version: 1,
      exportedAt: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
      sales: sales.map((row) => ({
        id: asCount(row.id),
        date: row.sale_date,
        category: row.category as BackupFile["sales"][number]["category"],
        amount: asText(row.amount),
        payment: row.payment === "gpay" ? "gpay" : "cash",
        createdAt: row.created_at,
      })),
      purchases: purchases.map((row) => ({
        id: asCount(row.id),
        date: row.purchase_date,
        category: row.category as BackupFile["purchases"][number]["category"],
        amount: asText(row.amount),
        payment: row.payment === "gpay" ? "gpay" : "cash",
        createdAt: row.created_at,
      })),
      expenses: expenses.map((row) => ({
        id: asCount(row.id),
        date: row.expense_date,
        category: row.category as BackupFile["expenses"][number]["category"],
        amount: asText(row.amount),
        payment: row.payment === "gpay" ? "gpay" : "cash",
        remark: row.remark?.trim() || null,
        createdAt: row.created_at,
      })),
      bank: bank.map((row) => ({
        id: asCount(row.id),
        date: row.entry_date,
        direction: row.direction === "returned" ? "returned" : "given",
        amount: asText(row.amount),
        interest: asText(row.interest),
        createdAt: row.created_at,
      })),
      gaming: gaming.map((row) => ({
        id: asCount(row.id),
        date: row.play_date,
        amount: asText(row.amount),
        payment: row.payment === "gpay" ? "gpay" : "cash",
        createdAt: row.created_at,
      })),
      rates: {
        cosmetics: basisOf("cosmetics", 1500),
        fancy: basisOf("fancy", 7000),
        accessories: basisOf("accessories", 7000),
        mixed: basisOf("mixed", 4250),
        gaming: basisOf("gaming", 10000),
        mixedAverage: settings[0] ? asBool(settings[0].mixed_average) : true,
      },
    };
    return backupFileSchema.parse(file);
  });

async function resetSerial(sql: Sql, table: string) {
  await sql.query(
    `select setval(pg_get_serial_sequence('${table}', 'id'), coalesce((select max(id) from ${table}), 1), (select exists(select 1 from ${table})))`,
  );
}

export const restoreBackup = createServerFn({ method: "POST" })
  .middleware([counterMiddleware])
  .validator(backupFileSchema)
  .handler(async ({ data, context }) => {
    requireCounter(accountFromContext(context), true);
    const sql = await getSql();
    await sql.transaction(async (tx) => {
      await tx.query("delete from sales");
      await tx.query("delete from purchases");
      await tx.query("delete from expenses");
      await tx.query("delete from bank_savings");
      await tx.query("delete from gaming");
      for (const row of data.sales) {
        await tx.query(
          "insert into sales (id, sale_date, category, amount, payment, created_at) values ($1, $2::date, $3, $4::numeric, $5, $6::timestamptz)",
          [row.id, row.date, row.category, row.amount, row.payment, row.createdAt],
        );
      }
      for (const row of data.purchases) {
        await tx.query(
          "insert into purchases (id, purchase_date, category, amount, payment, created_at) values ($1, $2::date, $3, $4::numeric, $5, $6::timestamptz)",
          [row.id, row.date, row.category, row.amount, row.payment, row.createdAt],
        );
      }
      for (const row of data.expenses) {
        await tx.query(
          "insert into expenses (id, expense_date, category, amount, payment, remark, created_at) values ($1, $2::date, $3, $4::numeric, $5, $6, $7::timestamptz)",
          [row.id, row.date, row.category, row.amount, row.payment, row.remark, row.createdAt],
        );
      }
      for (const row of data.bank) {
        await tx.query(
          "insert into bank_savings (id, entry_date, direction, amount, interest, created_at) values ($1, $2::date, $3, $4::numeric, $5::numeric, $6::timestamptz)",
          [row.id, row.date, row.direction, row.amount, row.interest, row.createdAt],
        );
      }
      for (const row of data.gaming) {
        await tx.query(
          "insert into gaming (id, play_date, amount, payment, created_at) values ($1, $2::date, $3::numeric, $4, $5::timestamptz)",
          [row.id, row.date, row.amount, row.payment, row.createdAt],
        );
      }
      const rateRows = [
        ["cosmetics", data.rates.cosmetics],
        ["fancy", data.rates.fancy],
        ["accessories", data.rates.accessories],
        ["mixed", data.rates.mixed],
        ["gaming", data.rates.gaming],
      ] as const;
      for (const [category, basis] of rateRows) {
        await tx.query(
          "insert into shop_rates (category, basis) values ($1, $2) on conflict (category) do update set basis = excluded.basis",
          [category, basis],
        );
      }
      await tx.query(
        "insert into shop_settings (id, mixed_average) values (1, $1) on conflict (id) do update set mixed_average = excluded.mixed_average",
        [data.rates.mixedAverage],
      );
      await resetSerial(tx, "sales");
      await resetSerial(tx, "purchases");
      await resetSerial(tx, "expenses");
      await resetSerial(tx, "bank_savings");
      await resetSerial(tx, "gaming");
    });
    return {
      sales: data.sales.length,
      purchases: data.purchases.length,
      expenses: data.expenses.length,
      bank: data.bank.length,
    };
  });

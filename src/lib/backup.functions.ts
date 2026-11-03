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

async function readShopBackup(sql: Sql): Promise<BackupFile> {
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
      supplier: string | null;
      created_at: string;
    }>`
      select id,
             to_char(purchase_date, 'YYYY-MM-DD') as purchase_date,
             category,
             amount::text as amount,
             payment,
             supplier,
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
    const drawer = await sql<{ count_date: string; amount: unknown }>`
      select to_char(count_date, 'YYYY-MM-DD') as count_date, amount::text as amount
      from drawer_counts
      order by count_date
    `;
    const gpay = await sql<{ id: unknown; entry_date: string; amount: unknown; created_at: string }>`
      select id,
             to_char(entry_date, 'YYYY-MM-DD') as entry_date,
             amount::text as amount,
             to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as created_at
      from gpay_received
      order by id
    `;
    const moves = await sql<{
      id: unknown;
      entry_date: string;
      direction: string;
      amount: unknown;
      note: string | null;
      created_at: string;
    }>`
      select id,
             to_char(entry_date, 'YYYY-MM-DD') as entry_date,
             direction,
             amount::text as amount,
             note,
             to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as created_at
      from drawer_moves
      order by id
    `;
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
        supplier: row.supplier?.trim() || null,
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
      drawer: drawer.map((row) => ({ date: row.count_date, amount: asText(row.amount) })),
      gpay: gpay.map((row) => ({
        id: asCount(row.id),
        date: row.entry_date,
        amount: asText(row.amount),
        createdAt: row.created_at,
      })),
      moves: moves.map((row) => ({
        id: asCount(row.id),
        date: row.entry_date,
        direction: row.direction === "put" ? ("put" as const) : ("taken" as const),
        amount: asText(row.amount),
        note: row.note?.trim() || null,
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
}

export const exportBackup = createServerFn({ method: "GET" })
  .middleware([counterMiddleware])
  .handler(async ({ context }): Promise<BackupFile> => {
    requireCounter(accountFromContext(context), true);
    return readShopBackup(await getSql());
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
    return applyBooks(await getSql(), data);
  });

async function applyBooks(sql: Sql, data: BackupFile) {
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
          "insert into purchases (id, purchase_date, category, amount, payment, supplier, created_at) values ($1, $2::date, $3, $4::numeric, $5, $6, $7::timestamptz)",
          [row.id, row.date, row.category, row.amount, row.payment, row.supplier ?? null, row.createdAt],
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
      if (data.drawer) {
        await tx.query("delete from drawer_counts");
        for (const row of data.drawer) {
          await tx.query("insert into drawer_counts (count_date, amount) values ($1::date, $2::numeric)", [
            row.date,
            row.amount,
          ]);
        }
      }
      if (data.gpay) {
        await tx.query("delete from gpay_received");
        for (const row of data.gpay) {
          await tx.query(
            "insert into gpay_received (id, entry_date, amount, created_at) values ($1, $2::date, $3::numeric, $4::timestamptz)",
            [row.id, row.date, row.amount, row.createdAt],
          );
        }
        await resetSerial(tx, "gpay_received");
      }
      await tx.query("delete from drawer_moves");
      for (const row of data.moves ?? []) {
        await tx.query(
          "insert into drawer_moves (id, entry_date, direction, amount, note, created_at) values ($1, $2::date, $3, $4::numeric, $5, $6::timestamptz)",
          [row.id, row.date, row.direction, row.amount, row.note ?? null, row.createdAt],
        );
      }
      await resetSerial(tx, "drawer_moves");
    });
    await rememberDailyBackup();
    return {
      sales: data.sales.length,
      purchases: data.purchases.length,
      expenses: data.expenses.length,
      bank: data.bank.length,
    };
}

function shopDay(shift = 0): string {
  const now = new Date(Date.now() + shift * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export async function rememberDailyBackup(): Promise<void> {
  const sql = await getSql();
  const file = await readShopBackup(sql);
  const day = shopDay();
  await sql`
    insert into shop_backups (backup_date, payload)
    values (${day}::date, ${JSON.stringify(file)}::jsonb)
    on conflict (backup_date) do update
      set payload = excluded.payload, created_at = now()
  `;
  await sql`delete from shop_backups where backup_date < ${shopDay(-2)}::date`;
}

export const syncAutoBackup = createServerFn({ method: "POST" })
  .middleware([counterMiddleware])
  .handler(async ({ context }) => {
    requireCounter(accountFromContext(context));
    await rememberDailyBackup();
    return { ok: true };
  });

export const listAutoBackups = createServerFn({ method: "GET" })
  .middleware([counterMiddleware])
  .handler(async ({ context }) => {
    requireCounter(accountFromContext(context), true);
    await rememberDailyBackup();
    const sql = await getSql();
    const rows = await sql<{
      backup_date: string;
      sales: number;
      purchases: number;
      expenses: number;
      saved_at: string;
    }>`
      select to_char(backup_date, 'YYYY-MM-DD') as backup_date,
             coalesce(jsonb_array_length(payload->'sales'), 0)::int as sales,
             coalesce(jsonb_array_length(payload->'purchases'), 0)::int as purchases,
             coalesce(jsonb_array_length(payload->'expenses'), 0)::int as expenses,
             to_char(created_at at time zone 'Asia/Kolkata', 'HH24:MI') as saved_at
      from shop_backups
      where backup_date >= ${shopDay(-2)}::date
      order by backup_date desc
    `;
    return {
      days: rows.map((row) => ({
        date: row.backup_date,
        sales: asCount(row.sales),
        purchases: asCount(row.purchases),
        expenses: asCount(row.expenses),
        savedAt: row.saved_at,
      })),
    };
  });

export const restoreAutoBackup = createServerFn({ method: "POST" })
  .middleware([counterMiddleware])
  .validator((input: unknown) => {
    if (!input || typeof input !== "object" || !("date" in input) || typeof input.date !== "string") {
      throw new Error("Choose a backup day");
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new Error("Choose a backup day");
    return { date: input.date };
  })
  .handler(async ({ data, context }) => {
    requireCounter(accountFromContext(context), true);
    const sql = await getSql();
    const rows = await sql<{ payload: unknown }>`
      select payload
      from shop_backups
      where backup_date = ${data.date}::date
        and backup_date >= ${shopDay(-2)}::date
    `;
    const raw = rows[0]?.payload;
    if (raw == null) throw new Error("That day's copy is not there");
    const payload = typeof raw === "string" ? JSON.parse(raw) : raw;
    const file = backupFileSchema.parse(payload);
    return applyBooks(sql, file);
  });


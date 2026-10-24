import { z } from "zod";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const money = z.string().regex(/^\d{1,7}(\.\d{1,2})?$/);
const stamp = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/);
const id = z.number().int().positive();

const saleRow = z.object({
  id,
  date: day,
  category: z.enum(["cosmetics", "fancy", "accessories", "mixed", "gaming"]),
  amount: money,
  payment: z.enum(["cash", "gpay"]),
  createdAt: stamp,
});

const purchaseRow = z.object({
  id,
  date: day,
  category: z.enum(["cosmetics", "fancy", "accessories", "general"]),
  amount: money,
  payment: z.enum(["cash", "gpay"]),
  createdAt: stamp,
});

const expenseRow = z.object({
  id,
  date: day,
  category: z.enum(["rent", "salary", "electricity", "transport", "other"]),
  amount: money,
  payment: z.enum(["cash", "gpay"]),
  remark: z.string().trim().min(1).max(80).nullable(),
  createdAt: stamp,
});

const bankRow = z
  .object({
    id,
    date: day,
    direction: z.enum(["given", "returned"]),
    amount: money,
    interest: money,
    createdAt: stamp,
  })
  .refine((row) => row.direction === "returned" || row.interest === "0" || row.interest === "0.00", {
    message: "A collection cannot include interest",
  });

const gamingRow = z.object({
  id,
  date: day,
  amount: money,
  payment: z.enum(["cash", "gpay"]),
  createdAt: stamp,
});

const basis = z.number().int().min(0).max(10000);

function uniqueIds(value: { id: number }[], ctx: z.RefinementCtx, label: string) {
  const seen = new Set<number>();
  for (const row of value) {
    if (seen.has(row.id)) {
      ctx.addIssue({ code: "custom", message: `The backup repeats a ${label} row` });
      return;
    }
    seen.add(row.id);
  }
}

export const backupFileSchema = z
  .object({
    kind: z.literal("cosmic-world-backup"),
    version: z.literal(1),
    exportedAt: stamp,
    sales: z.array(saleRow).max(20000),
    purchases: z.array(purchaseRow).max(20000),
    expenses: z.array(expenseRow).max(20000),
    bank: z.array(bankRow).max(20000),
    gaming: z.array(gamingRow).max(20000),
    rates: z.object({
      cosmetics: basis,
      fancy: basis,
      accessories: basis,
      mixed: basis,
      gaming: basis,
      mixedAverage: z.boolean(),
    }),
  })
  .superRefine((file, ctx) => {
    uniqueIds(file.sales, ctx, "sale");
    uniqueIds(file.purchases, ctx, "purchase");
    uniqueIds(file.expenses, ctx, "expense");
    uniqueIds(file.bank, ctx, "bank");
    uniqueIds(file.gaming, ctx, "gaming");
  });

export type BackupFile = z.infer<typeof backupFileSchema>;

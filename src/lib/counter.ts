import { z } from "zod";

export const COUNTER_TOKEN_KEY = "cosmic-counter.token";

export const counterRoleSchema = z.enum(["admin", "staff"]);

export const usernameSchema = z
  .string()
  .trim()
  .min(3, "Username needs at least 3 characters")
  .max(20, "Username can be at most 20 characters")
  .regex(
    /^[A-Za-z][A-Za-z0-9._-]*$/,
    "Start with a letter. Then letters, numbers, dots or dashes.",
  );

export const passwordSchema = z
  .string()
  .min(6, "Password needs at least 6 characters")
  .max(72, "Password is too long");

export type CounterRole = z.infer<typeof counterRoleSchema>;

export type CounterAccount = {
  id: string;
  username: string;
  role: CounterRole;
};

export type CounterPublic = {
  username: string;
  role: CounterRole;
};

export type CounterState = {
  needsAdmin: boolean;
  account: CounterPublic | null;
};

export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

export function toPublic(account: CounterAccount): CounterPublic {
  return { username: account.username, role: account.role };
}

export function accountFromContext(context: { account?: CounterAccount | null }): CounterAccount | null {
  return context.account ?? null;
}

export function requireCounter(account: CounterAccount | null, admin = false): CounterAccount {
  if (!account) throw new Error("Sign in to continue");
  if (admin && account.role !== "admin") throw new Error("Only the admin can do that");
  return account;
}

export function readCounterToken(): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return window.localStorage.getItem(COUNTER_TOKEN_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

export function writeCounterToken(token: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (token) window.localStorage.setItem(COUNTER_TOKEN_KEY, token);
    else window.localStorage.removeItem(COUNTER_TOKEN_KEY);
  } catch {
    /* private mode */
  }
}

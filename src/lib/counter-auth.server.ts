import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { getSql } from "@/lib/db";
import {
  normalizeUsername,
  passwordSchema,
  usernameSchema,
  type CounterAccount,
  type CounterRole,
} from "@/lib/counter";

const scryptAsync = promisify(scrypt);
const COOKIE = "cosmic_counter";
const KEYLEN = 64;
const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const DUMMY_HASH = `${"0".repeat(32)}:${"0".repeat(KEYLEN * 2)}`;

type AccountRow = {
  id: string;
  username: string;
  password_hash: string;
  role: string;
};

function asRole(value: string): CounterRole | null {
  return value === "admin" || value === "staff" ? value : null;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const key = (await scryptAsync(password.normalize("NFKC"), salt, KEYLEN)) as Buffer;
  return `${salt}:${key.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hex] = stored.split(":");
  if (!salt || !hex) return false;
  const actual = (await scryptAsync(password.normalize("NFKC"), salt, KEYLEN)) as Buffer;
  const expected = Buffer.from(hex, "hex");
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(actual, expected);
}

function cleanToken(value: string | undefined | null): string | null {
  if (!value) return null;
  const token = value.trim();
  if (token.length < 20 || token.length > 200) return null;
  return token;
}

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function duplicate(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  if ("code" in error && (error as { code?: unknown }).code === "23505") return true;
  const message = error instanceof Error ? error.message : "";
  return /duplicate key|unique constraint/i.test(message);
}

async function lookupToken(token: string): Promise<CounterAccount | null> {
  const sql = await getSql();
  const rows = await sql<AccountRow>`
    select a.id, a.username, a.password_hash, a.role
    from shop_sessions s
    join shop_accounts a on a.id = s.account_id
    where s.token_hash = ${tokenHash(token)}
      and s.expires_at > now()
    limit 1
  `;
  const row = rows[0];
  const role = row ? asRole(row.role) : null;
  if (!row || !role) return null;
  return { id: row.id, username: row.username, role };
}

export async function accountFromRequest(clientToken?: string): Promise<CounterAccount | null> {
  const { getCookie } = await import("@tanstack/react-start/server");
  const fromClient = cleanToken(clientToken);
  if (fromClient) {
    const account = await lookupToken(fromClient);
    if (account) return account;
  }
  const fromCookie = cleanToken(getCookie(COOKIE));
  if (fromCookie && fromCookie !== fromClient) return lookupToken(fromCookie);
  return null;
}

export async function adminExists(): Promise<boolean> {
  const sql = await getSql();
  const rows = await sql<{ n: number }>`
    select count(*)::int as n from shop_accounts where role = 'admin'
  `;
  return (rows[0]?.n ?? 0) > 0;
}

async function writeSession(accountId: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_MS).toISOString();
  const sql = await getSql();
  await sql`
    insert into shop_sessions (token_hash, account_id, expires_at)
    values (${tokenHash(token)}, ${accountId}, ${expires}::timestamptz)
  `;
  const { setCookie } = await import("@tanstack/react-start/server");
  setCookie(COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MS / 1000,
  });
  return token;
}

export async function clearCounterCookie(): Promise<void> {
  const { setCookie } = await import("@tanstack/react-start/server");
  setCookie(COOKIE, "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export async function endSessions(accountId: string | null): Promise<void> {
  if (accountId) {
    const sql = await getSql();
    await sql`delete from shop_sessions where account_id = ${accountId}`;
  }
  await clearCounterCookie();
}

function checkedUsername(raw: string): string {
  const parsed = usernameSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Check the username");
  }
  return normalizeUsername(parsed.data);
}

function checkedPassword(raw: string): string {
  const parsed = passwordSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Check the password");
  }
  return parsed.data;
}

async function insertAccount(username: string, password: string, role: CounterRole): Promise<CounterAccount> {
  const sql = await getSql();
  const id = randomUUID();
  const passwordHash = await hashPassword(password);
  try {
    await sql`
      insert into shop_accounts (id, username, password_hash, role)
      values (${id}, ${username}, ${passwordHash}, ${role})
    `;
  } catch (error) {
    if (duplicate(error)) {
      throw new Error(
        role === "admin"
          ? "The admin account is already set. Sign in instead."
          : "That username is already in use.",
      );
    }
    throw error;
  }
  return { id, username, role };
}

export async function createAdminAccount(rawUsername: string, rawPassword: string): Promise<{
  token: string;
  account: CounterAccount;
}> {
  if (await adminExists()) {
    throw new Error("The admin account is already set. Sign in instead.");
  }
  const username = checkedUsername(rawUsername);
  const password = checkedPassword(rawPassword);
  const account = await insertAccount(username, password, "admin");
  const token = await writeSession(account.id);
  return { token, account };
}

export async function signInAccount(
  rawUsername: string,
  rawPassword: string,
  role: CounterRole,
): Promise<{ token: string; account: CounterAccount }> {
  const username = checkedUsername(rawUsername);
  const password = checkedPassword(rawPassword);
  const sql = await getSql();
  const rows = await sql<AccountRow>`
    select id, username, password_hash, role
    from shop_accounts
    where username = ${username}
    limit 1
  `;
  const row = rows[0];
  const passwordOk = await verifyPassword(password, row?.password_hash ?? DUMMY_HASH);
  if (!row || !passwordOk) throw new Error("Username or password is wrong");
  const actual = asRole(row.role);
  if (!actual) throw new Error("Username or password is wrong");
  if (actual !== role) {
    throw new Error(
      actual === "admin"
        ? "That username is the admin. Choose Admin."
        : "That username is a staff login. Choose Staff.",
    );
  }
  const token = await writeSession(row.id);
  return { token, account: { id: row.id, username: row.username, role: actual } };
}

export async function createStaffAccount(
  admin: CounterAccount,
  rawUsername: string,
  rawPassword: string,
): Promise<{ username: string }> {
  if (admin.role !== "admin") throw new Error("Only the admin can do that");
  const username = checkedUsername(rawUsername);
  const password = checkedPassword(rawPassword);
  if (username === admin.username) throw new Error("That username is already the admin.");
  const account = await insertAccount(username, password, "staff");
  return { username: account.username };
}

export async function listDoorNames(): Promise<{ admin: string | null; staff: string[] }> {
  const sql = await getSql();
  const rows = await sql<{ username: string; role: string }>`
    select username, role
    from shop_accounts
    where role in ('admin', 'staff')
    order by username asc
  `;
  return {
    admin: rows.find((row) => row.role === "admin")?.username ?? null,
    staff: rows.filter((row) => row.role === "staff").map((row) => row.username),
  };
}

export async function listStaffUsernames(): Promise<{ username: string }[]> {
  const sql = await getSql();
  return sql<{ username: string }>`
    select username from shop_accounts where role = 'staff' order by username asc
  `;
}

export async function removeStaffAccount(usernameRaw: string): Promise<{ username: string }> {
  const username = checkedUsername(usernameRaw);
  const sql = await getSql();
  const rows = await sql<{ username: string }>`
    delete from shop_accounts
    where username = ${username} and role = 'staff'
    returning username
  `;
  if (!rows[0]) throw new Error("That staff login is already gone");
  return { username: rows[0].username };
}

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  accountFromContext,
  counterRoleSchema,
  passwordSchema,
  requireCounter,
  toPublic,
  usernameSchema,
  type CounterState,
} from "@/lib/counter";
import { counterMiddleware } from "@/lib/counter-middleware";

const credentials = z.object({
  username: usernameSchema,
  password: passwordSchema,
});

export const getCounterState = createServerFn({ method: "GET" })
  .middleware([counterMiddleware])
  .handler(async ({ context }): Promise<CounterState> => {
    const { adminExists } = await import("@/lib/counter-auth.server");
    const account = accountFromContext(context);
    return {
      needsAdmin: !(await adminExists()),
      account: account ? toPublic(account) : null,
    };
  });

export const createAdmin = createServerFn({ method: "POST" })
  .middleware([counterMiddleware])
  .validator(credentials)
  .handler(async ({ data }) => {
    const { createAdminAccount } = await import("@/lib/counter-auth.server");
    const result = await createAdminAccount(data.username, data.password);
    return { token: result.token, account: toPublic(result.account) };
  });

export const listDoorNames = createServerFn({ method: "GET" }).handler(async () => {
  const { listDoorNames: loadNames } = await import("@/lib/counter-auth.server");
  return loadNames();
});

export const signInCounter = createServerFn({ method: "POST" })
  .middleware([counterMiddleware])
  .validator(credentials.extend({ role: counterRoleSchema }))
  .handler(async ({ data }) => {
    const { signInAccount } = await import("@/lib/counter-auth.server");
    const result = await signInAccount(data.username, data.password, data.role);
    return { token: result.token, account: toPublic(result.account) };
  });

export const signOutCounter = createServerFn({ method: "POST" })
  .middleware([counterMiddleware])
  .handler(async ({ context }) => {
    const { endSessions } = await import("@/lib/counter-auth.server");
    const account = accountFromContext(context);
    await endSessions(account?.id ?? null);
    return { ok: true as const };
  });

export const listStaff = createServerFn({ method: "GET" })
  .middleware([counterMiddleware])
  .handler(async ({ context }) => {
    const { listStaffUsernames } = await import("@/lib/counter-auth.server");
    requireCounter(accountFromContext(context), true);
    const staff = await listStaffUsernames();
    return { staff };
  });

export const createStaff = createServerFn({ method: "POST" })
  .middleware([counterMiddleware])
  .validator(credentials)
  .handler(async ({ data, context }) => {
    const { createStaffAccount } = await import("@/lib/counter-auth.server");
    const admin = requireCounter(accountFromContext(context), true);
    return createStaffAccount(admin, data.username, data.password);
  });

export const removeStaff = createServerFn({ method: "POST" })
  .middleware([counterMiddleware])
  .validator(z.object({ username: usernameSchema }))
  .handler(async ({ data, context }) => {
    const { removeStaffAccount } = await import("@/lib/counter-auth.server");
    requireCounter(accountFromContext(context), true);
    return removeStaffAccount(data.username);
  });

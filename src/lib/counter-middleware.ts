import { createMiddleware } from "@tanstack/react-start";
import { readCounterToken, type CounterAccount } from "@/lib/counter";

export const counterMiddleware = createMiddleware({ type: "function" })
  .client(async ({ next }) => {
    return next({ sendContext: { counterToken: readCounterToken() } });
  })
  .server(async ({ next, context }) => {
    const { assertSameSiteRequest } = await import("@/lib/auth/isolation.server");
    const { accountFromRequest } = await import("@/lib/counter-auth.server");
    assertSameSiteRequest();
    const sent = (context as { counterToken?: string }).counterToken;
    const account: CounterAccount | null = await accountFromRequest(sent);
    return next({ context: { account } });
  });

import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "./context";

// Requires an active session. Caches the session in context so downstream
// middlewares/handlers don't need to fetch it again.
export const requireSession: MiddlewareHandler<AppEnv> = async (c, next) => {
    const session = await c.get("auth").api.getSession({ headers: c.req.raw.headers });
    if (!session) return c.json({ error: "Unauthorized" }, 401);
    c.set("session", session);
    await next();
};

// Add your own middlewares here following the same pattern as requireSession
// (e.g. requiring an active organization/team once you enable those features).

import { Hono } from "hono";
import { cors } from "hono/cors";
import { createAuth } from "./auth";
import type { CloudflareBindings } from "./env";

type Variables = {
    auth: ReturnType<typeof createAuth>;
};

const app = new Hono<{ Bindings: CloudflareBindings; Variables: Variables }>();

// CORS configuration for auth routes
const isTrustedOrigin = (origin: string, isProduction: boolean): boolean => {
    if (!isProduction) {
        if (/^http:\/\/localhost:\d+$/.test(origin)) return true;
        if (/^http:\/\/192\.168\.\d{1,3}\.\d{1,3}:\d+$/.test(origin)) return true;
    }
    return false;
};

app.use(
    "/api/*",
    cors({
        origin: (requestOrigin: string, c) => {
            const self = new URL(c.req.url).origin;
            if (requestOrigin === self) return requestOrigin;
            if (isTrustedOrigin(requestOrigin, c.env.ENVIRONMENT === "production")) return requestOrigin;
            return "";
        },
        allowHeaders: ["Content-Type", "Authorization"],
        allowMethods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
        exposeHeaders: ["Content-Length"],
        maxAge: 600,
        credentials: true,
    })
);

// Middleware to initialize auth instance for each request
app.use("*", async (c, next) => {
    const auth = createAuth(c.env, (c.req.raw as any).cf || {}, new URL(c.req.url).origin);
    c.set("auth", auth);
    await next();
});

// Handle all auth routes
app.all("/api/auth/*", async c => {
    const auth = c.get("auth");
    return auth.handler(c.req.raw);
});

// Mount your feature routers here, e.g.:
// app.route("/api", notesRoutes);

// Simple health check
app.get("/health", c => {
    return c.json({ status: "ok", timestamp: new Date().toISOString() });
});

export default app;

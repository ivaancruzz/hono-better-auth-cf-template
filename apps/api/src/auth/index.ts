import type { D1Database, IncomingRequestCfProperties } from "@cloudflare/workers-types";
import { betterAuth } from "better-auth";
import { withCloudflare } from "better-auth-cloudflare";
import { anonymous, emailOTP, organization } from "better-auth/plugins";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { drizzle } from "drizzle-orm/d1";
import { Resend } from "resend";
import { schema } from "../db";
import type { CloudflareBindings } from "../env";

// Single auth configuration that handles both CLI and runtime scenarios
function createAuth(env?: CloudflareBindings, cf?: IncomingRequestCfProperties, baseURL?: string) {
    // Use actual DB for runtime, empty object for CLI
    const db = env ? drizzle(env.DATABASE, { schema, logger: true }) : ({} as any);

    return betterAuth({
        baseURL,
        ...withCloudflare(
            {
                autoDetectIpAddress: true,
                geolocationTracking: true,
                cf: cf || {},
                d1: env
                    ? {
                          db,
                          options: {
                              usePlural: true,
                              debugLogs: true,
                          },
                      }
                    : undefined,
                kv: env?.KV,
            },
            {
                emailAndPassword: {
                    // Dev/staging only: shortcut for testing without depending on Resend/OTP.
                    enabled: env?.ENVIRONMENT !== "production",
                },
                plugins: [
                    anonymous(),
                    // Multi-tenant organizations. Remove this plugin entirely
                    // if your project doesn't need organizations.
                    organization(),
                    emailOTP({
                        async sendVerificationOTP({ email, otp }) {
                            if (!env) return; // CLI schema generation, no bindings available
                            const resend = new Resend(env.RESEND_API_KEY);
                            await resend.emails.send({
                                from: "App <onboarding@resend.dev>",
                                to: [email],
                                subject: `${otp} is your login code`,
                                html: `<p>Your login code is <strong>${otp}</strong>. It expires in 5 minutes.</p>`,
                            });
                        },
                    }),
                ],
                rateLimit: {
                    storage: "secondary-storage",
                    enabled: true,
                    window: 60,
                    max: 100,
                },
                advanced: {
                    ipAddress: {
                        // wrangler dev (miniflare) doesn't send a cf-connecting-ip header, so
                        // the rate limiter can't resolve an IP and warns on every request. In
                        // production it's present (autoDetectIpAddress adds it above).
                        disableIpTracking: env?.ENVIRONMENT !== "production",
                    },
                    database: {
                        // `export const auth = createAuth()` below runs with no `env` on every
                        // cold start (it exists for the CLI schema generator), wired to a fake
                        // empty D1Database. Better Auth's schema-diff check runs against that
                        // fake DB too and logs a "Drizzle schema mismatch" error claiming every
                        // table is missing — harmless noise, since the real per-request instance
                        // (created with the actual `env`/DB further down) never hits this. Only
                        // validate schema when we have a real DB to validate against.
                        validateSchema: !!env,
                    },
                },
                trustedOrigins: [
                    ...(env?.ENVIRONMENT !== "production" ? ["http://localhost:*", "http://192.168.*.*:*"] : []),
                ],
            }
        ),
        // better-auth-cloudflare's createKVStorage only implements get/set/delete,
        // but better-auth 1.7+ requires increment/getAndDelete for secondary-storage
        // rate limiting. Override with a full implementation here.
        ...(env?.KV
            ? {
                  secondaryStorage: {
                      get: (key: string) => env.KV.get(key),
                      set: async (key: string, value: string, ttl?: number) => {
                          await env.KV.put(key, value, ttl ? { expirationTtl: Math.max(ttl, 60) } : undefined);
                      },
                      delete: (key: string) => env.KV.delete(key),
                      getAndDelete: async (key: string) => {
                          const value = await env.KV.get(key);
                          await env.KV.delete(key);
                          return value;
                      },
                      // KV has no atomic counter, so this is best-effort (read-then-write).
                      increment: async (key: string, ttl: number) => {
                          const current = await env.KV.get(key);
                          const next = (current ? Number.parseInt(current, 10) : 0) + 1;
                          await env.KV.put(key, String(next), { expirationTtl: Math.max(ttl, 60) });
                          return next;
                      },
                  },
              }
            : {}),
        // Only add database adapter for CLI schema generation
        ...(env
            ? {}
            : {
                  database: drizzleAdapter({} as D1Database, {
                      provider: "sqlite",
                      usePlural: true,
                      debugLogs: true,
                  }),
              }),
    });
}

// Export for CLI schema generation
export const auth = createAuth();

// Export for runtime usage
export { createAuth };

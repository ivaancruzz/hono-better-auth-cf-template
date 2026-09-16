import type { D1Database, ImagesBinding, KVNamespace, R2Bucket } from "@cloudflare/workers-types";

export interface CloudflareBindings {
    DATABASE: D1Database;
    KV: KVNamespace<string>;
    R2_BUCKET: R2Bucket;
    IMAGES: ImagesBinding;
    BETTER_AUTH_SECRET: string;
    BETTER_AUTH_URL: string;
    ENVIRONMENT: "development" | "production";
    RESEND_API_KEY: string;
}

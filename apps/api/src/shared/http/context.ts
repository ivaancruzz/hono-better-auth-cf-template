import type { createAuth } from "../../auth";
import type { CloudflareBindings } from "../../env";

export type Session = NonNullable<Awaited<ReturnType<ReturnType<typeof createAuth>["api"]["getSession"]>>>;

export type AppEnv = {
    Bindings: CloudflareBindings;
    Variables: {
        auth: ReturnType<typeof createAuth>;
        session: Session;
    };
};

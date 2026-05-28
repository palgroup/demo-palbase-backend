import { defineEndpoint, z } from "@palbase/backend";

// Auth-required endpoint — proves the full demo backend surface in one call:
//   • auth: ctx.user is populated from the Bearer JWT (Kong iJWT chain →
//     backend-runtime auth middleware). Anonymous → 401 before we get here.
//   • db:   ctx.db talks to the project's own Postgres (schema env_<envId>)
//     over the pod's pgx pool. We probe it with a read so the demo confirms
//     the db module is wired, not just auth.
export default defineEndpoint({
  method: "GET",
  auth: { required: true },
  output: z.object({
    userId: z.string(),
    email: z.string().nullable(),
    dbReachable: z.boolean(),
    callTime: z.string(),
  }),
  handler: async (ctx) => {
    // db module probe: a typed read against the project DB. findMany matches
    // the runtime signature (insert/findById/findMany are the safe trio);
    // we don't assert rows, only that the call round-trips without throwing.
    let dbReachable = false;
    try {
      await ctx.db.findMany("todos", { ownerId: ctx.user?.id });
      dbReachable = true;
    } catch {
      dbReachable = false;
    }

    return {
      userId: ctx.user?.id ?? "anonymous",
      email: ctx.user?.email ?? null,
      dbReachable,
      callTime: new Date().toISOString(),
    };
  },
});

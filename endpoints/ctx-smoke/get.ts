import { defineEndpoint, z } from "@palbase/backend";

// UAT-1 ctx surface probe — exercises every module ctx exposes in one
// call. Each probe wraps its error so a single broken module doesn't
// mask the others. Output reports per-module status separately.

export default defineEndpoint({
  method: "GET",
  auth: false,
  output: z.object({
    flags_ok: z.boolean(),
    analytics_ok: z.boolean(),
    docs_ok: z.boolean(),
    notify_ok: z.boolean(),
    db_ok: z.boolean(),
    storage_ok: z.boolean(),
    errors: z.record(z.string()),
  }),
  handler: async (ctx) => {
    const errors: Record<string, string> = {};

    let flags_ok = false;
    try { await ctx.flags.getAll(); flags_ok = true; }
    catch (e) { errors.flags = (e as Error).message; }

    let analytics_ok = false;
    try {
      await ctx.analytics.capture({ event: "ctx_smoke", distinctId: "uat", properties: { ts: Date.now() } });
      analytics_ok = true;
    } catch (e) { errors.analytics = (e as Error).message; }

    let docs_ok = false;
    try {
      const snap = await ctx.docs.collection("uat_smoke").limit(1).get();
      docs_ok = !snap.error;
      if (snap.error) errors.docs = snap.error.message;
    } catch (e) { errors.docs = (e as Error).message; }

    // ctx.notify.templates is channel-split: .email and .sms each
    // expose .list() returning a PalbaseResponse envelope.
    let notify_ok = false;
    try {
      const res = await ctx.notify.templates.email.list();
      notify_ok = !res.error;
      if (res.error) errors.notify = res.error.message;
    } catch (e) { errors.notify = (e as Error).message; }

    // ctx.db is deploy-only — palbase serve throws a clear hint here.
    let db_ok = false;
    try {
      await ctx.db.findMany("uat_smoke", {});
      db_ok = true;
    } catch (e) { errors.db = (e as Error).message; }

    let storage_ok = false;
    try {
      const has = ctx.storage && typeof ctx.storage.bucket === "function";
      storage_ok = has;
      if (!has) errors.storage = "ctx.storage.bucket is not a function";
    } catch (e) { errors.storage = (e as Error).message; }

    return { flags_ok, analytics_ok, docs_ok, notify_ok, db_ok, storage_ok, errors };
  },
});

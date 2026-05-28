import { defineEndpoint, z } from "@palbase/backend";

export default defineEndpoint({
  method: "GET",
  auth: false,
  output: z.object({
    capture_ok: z.boolean(),
    error: z.string().nullable(),
  }),
  handler: async (ctx) => {
    try {
      await ctx.analytics.capture({
        event: "p5_ctx_smoke",
        distinctId: "u_ctx_smoke",
        properties: { source: "p5_smoke", ts: Date.now() },
      });
      return { capture_ok: true, error: null };
    } catch (e) {
      return { capture_ok: false, error: (e as Error).message };
    }
  },
});

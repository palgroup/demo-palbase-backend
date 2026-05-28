import { defineEndpoint, z } from "@palbase/backend";

export default defineEndpoint({
  method: "GET",
  auth: false,
  output: z.object({
    enabled: z.boolean(),
    all_count: z.number(),
    error: z.string().nullable(),
  }),
  handler: async (ctx) => {
    try {
      const isOn = await ctx.flags.isEnabled("ctx_smoke");
      const all = await ctx.flags.getAll();
      return { enabled: Boolean(isOn), all_count: Object.keys(all ?? {}).length, error: null };
    } catch (e) {
      return { enabled: false, all_count: 0, error: (e as Error).message };
    }
  },
});

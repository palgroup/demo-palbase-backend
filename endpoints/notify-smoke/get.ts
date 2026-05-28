import { defineEndpoint, z } from "@palbase/backend";

export default defineEndpoint({
  method: "GET",
  auth: false,
  output: z.object({
    templates_ok: z.boolean(),
    templates_count: z.number(),
    send_status: z.string(),
    error: z.string().nullable(),
  }),
  handler: async (ctx) => {
    let templatesOk = false;
    let templatesCount = 0;
    let sendStatus = "not_attempted";
    let err: string | null = null;
    try {
      const tres = await ctx.notifications.templates.email.list();
      templatesOk = tres.data !== undefined;
      templatesCount = tres.data?.length ?? 0;
    } catch (e) {
      err = `templates.list: ${(e as Error).message}`;
    }
    try {
      const sres = await ctx.notifications.email.send({
        to: "smoke@example.invalid",
        subject: "smoke ctx test",
        htmlBody: "<p>smoke</p>",
      });
      sendStatus = sres.error ? `error:${sres.error.code}` : "accepted";
    } catch (e) {
      sendStatus = `throw:${(e as Error).message}`;
    }
    return { templates_ok: templatesOk, templates_count: templatesCount, send_status: sendStatus, error: err };
  },
});

import { defineEndpoint, z } from "@palbase/backend";

interface TodoDoc {
  ownerId: string;
  title: string;
  done: boolean;
  createdAt: string;
}

export default defineEndpoint({
  method: "POST",
  auth: { required: true },
  input: z.object({
    title: z.string().min(1).max(200),
  }),
  output: z.object({
    id: z.string(),
    title: z.string(),
    done: z.boolean(),
    createdAt: z.string(),
  }),
  handler: async (ctx) => {
    if (!ctx.user) throw new Error("unauthorized");
    const createdAt = new Date().toISOString();
    const result = await ctx.docs.collection<TodoDoc>("todos").add({
      ownerId: ctx.user.id,
      title: ctx.input.title,
      done: false,
      createdAt,
    });
    if (result.error || !result.data) {
      throw new Error(`docs.add failed: ${result.error?.message ?? "unknown"}`);
    }
    const id = result.data.path.split("/").pop() ?? "";
    return { id, title: ctx.input.title, done: false, createdAt };
  },
});

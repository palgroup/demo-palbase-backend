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
    id: z.string().min(1),
  }),
  output: z.object({
    id: z.string(),
    done: z.boolean(),
  }),
  handler: async (ctx) => {
    if (!ctx.user) throw new Error("unauthorized");
    const docRef = ctx.docs.collection<TodoDoc>("todos").doc(ctx.input.id);

    const snap = await docRef.get();
    if (snap.error || !snap.data?.exists) {
      throw new Error("todo_not_found");
    }
    const data = snap.data.data();
    if (!data || data.ownerId !== ctx.user.id) {
      throw new Error("forbidden");
    }

    const next = !data.done;
    const upd = await docRef.update({ done: next });
    if (upd.error) {
      throw new Error(upd.error.message ?? "failed to update todo");
    }
    return { id: ctx.input.id, done: next };
  },
});

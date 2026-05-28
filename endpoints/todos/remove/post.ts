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
    deleted: z.boolean(),
  }),
  handler: async (ctx) => {
    if (!ctx.user) throw new Error("unauthorized");
    const docRef = ctx.docs.collection<TodoDoc>("todos").doc(ctx.input.id);

    const snap = await docRef.get();
    if (snap.error || !snap.data?.exists) {
      return { id: ctx.input.id, deleted: false };
    }
    const data = snap.data.data();
    if (!data || data.ownerId !== ctx.user.id) {
      throw new Error("forbidden");
    }

    const del = await docRef.delete();
    if (del.error) {
      throw new Error(del.error.message ?? "failed to delete todo");
    }
    return { id: ctx.input.id, deleted: true };
  },
});

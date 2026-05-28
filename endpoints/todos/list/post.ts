import { defineEndpoint, z } from "@palbase/backend";

// Stored shape of a todo document in the `todos` collection. Passing it as
// the collection generic makes `doc.data()` return TodoDoc — no cast needed.
interface TodoDoc {
  ownerId: string;
  title: string;
  done: boolean;
  createdAt: string;
}

const Todo = z.object({
  id: z.string(),
  title: z.string(),
  done: z.boolean(),
  createdAt: z.string(),
});

export default defineEndpoint({
  method: "POST",
  auth: { required: true },
  input: z.object({}),
  output: z.object({
    todos: z.array(Todo),
  }),
  handler: async (ctx) => {
    if (!ctx.user) throw new Error("unauthorized");
    const snap = await ctx.docs
      .collection<TodoDoc>("todos")
      .where("ownerId", "==", ctx.user.id)
      .orderBy("createdAt", "desc")
      .get();

    if (snap.error || !snap.data) {
      throw new Error(snap.error?.message ?? "failed to load todos");
    }

    const todos = snap.data.docs.flatMap((d) => {
      const data = d.data();
      if (!data) return [];
      return [{ id: d.id, title: data.title, done: data.done, createdAt: data.createdAt }];
    });
    return { todos };
  },
});

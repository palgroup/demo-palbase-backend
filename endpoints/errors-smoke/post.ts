import { defineEndpoint, z } from "@palbase/backend";

// SDK-2 UAT: declared errors via defineEndpoint({ errors: { ... } }).
//
// The handler picks which error to throw based on the input `kind`:
//   - "notFound"  → throws ctx.errors.todoNotFound()           (no data)
//   - "locked"    → throws ctx.errors.todoLocked({ retryAfter: 30 })  (with data)
//   - "ok"        → returns { ok: true } success path
//
// iOS catches the typed cases via the generated TodosErrorsSmoke.Error
// enum that lowers from the wire envelope (error+code+data). Anything
// undeclared continues to surface as BackendError.server.

export default defineEndpoint({
  method: "POST",
  auth: false,
  input: z.object({
    kind: z.enum(["ok", "notFound", "locked"]),
  }),
  output: z.object({
    ok: z.boolean(),
  }),
  errors: {
    todoNotFound: {
      status: 404,
      code: "todo_not_found",
      description: "Todo with the requested id does not exist",
    },
    todoLocked: {
      status: 409,
      code: "todo_locked",
      description: "Todo is locked; client should retry after the given delay",
      data: z.object({
        retryAfter: z.number(),
      }),
    },
  },
  handler: async (ctx) => {
    switch (ctx.input.kind) {
      case "notFound":
        throw ctx.errors.todoNotFound();
      case "locked":
        throw ctx.errors.todoLocked({ retryAfter: 30 });
      case "ok":
        return { ok: true };
    }
  },
});

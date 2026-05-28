# @palbase/backend — Backend SDK

TypeScript SDK for writing **Palbase backend endpoints**. Tek dosya = bir HTTP endpoint, file-based routing. Customer'ın yazdığı tek şey `defineEndpoint`'le handler — runtime ctx, auth, schema validation, OpenAPI generation, codegen — hepsi otomatik.

```ts
import { defineEndpoint, z } from "@palbase/backend";

export default defineEndpoint({
  method: "POST",
  auth: { required: true },
  input: z.object({ title: z.string().min(1) }),
  output: z.object({ id: z.string(), title: z.string(), createdAt: z.string() }),
  handler: async (ctx) => {
    const created = await ctx.docs.collection("todos").add({
      ownerId: ctx.user.id,
      title: ctx.input.title,
      createdAt: new Date().toISOString(),
    });
    return created;
  },
});
```

iOS / web tarafında bu otomatik olarak `pb.postTodosCreate(.init(title: "..."))` çağrısı haline gelir (typed). Generated codegen Bundle resource ile config taşır — bkz. [iOS SDK README](../../palbackend-ios-src/README.md).

> Bu doküman **AI'la kullanılacak şekilde** yazıldı. Adımlar net, komutlar verbatim — Claude/Cursor/Copilot'a doğrudan ver, kuruluma o devam etsin.

---

## Sistem mimarisi

```
backend/
└── endpoints/
    ├── me/
    │   └── get.ts                       → GET  /me
    ├── todos/
    │   ├── create/post.ts               → POST /todos/create
    │   ├── list/post.ts                 → POST /todos/list
    │   └── [id]/
    │       └── get.ts                   → GET  /todos/:id
    └── webhooks/
        └── stripe/post.ts               → POST /webhooks/stripe

config/                                  → config-as-code (auth/storage/flags/notif/docs)
package.json                             → { "@palbase/backend": "latest" }
tsconfig.json
palbase.toml                             → runtime config (CLI inject eder)
```

Her `.ts` dosyası:
1. **Yerelde** `palbase serve` ile `http://localhost:4003/...` route'u olur
2. **Push'ta** `palbase push` ile dev/prod cluster'a deploy, `https://<endpointRef>.dev.palbase.studio/...` route'u olur
3. **Otomatik OpenAPI spec** üretilir → iOS/web codegen typed call'ları üretir

Runtime (`backend-runtime`) Go binary'siyle koşar, customer kodu Node.js child process'inde isolate'tir.

---

## CLI kurulum

```bash
brew install palgroup/tap/palbase
palbase --version            # 0.3.15+
palbase login                # browser OAuth (DPoP-bound)
```

### Yeni proje başlat

```bash
mkdir my-backend && cd my-backend
palbase pull                 # picker: proje seç, kod+env+config gelir
```

Eğer mevcut Palbase projen yoksa `palbase project create <name>` ile aç, sonra `pull`.

### Mevcut projeyi devam ettir

```bash
cd /path/to/backend
palbase pull                 # linkliyse o; değilse picker
```

---

## defineEndpoint contract

### Minimum endpoint

```ts
// endpoints/hello/get.ts → GET /hello
import { defineEndpoint, z } from "@palbase/backend";

export default defineEndpoint({
  method: "GET",
  auth: false,
  output: z.object({ message: z.string() }),
  handler: async () => ({ message: "hello, world" }),
});
```

### Full surface

```ts
defineEndpoint({
  // HTTP
  method: "POST",                        // GET | POST | PUT | PATCH | DELETE
  
  // Auth (default: required: true)
  auth: false,                            // anonymous OK
  auth: { required: true },               // authed only — ctx.user guaranteed non-null
  auth: { required: true, scopes: ["x"] },// scoped JWT
  
  // Validation (zod) — input optional, output recommended
  input: z.object({ id: z.string() }),
  output: z.object({ ok: z.boolean() }),
  
  // Typed errors (opt-in) — iOS codegen emits typed enum
  errors: {
    notFound: { status: 404, code: "todo_not_found" },
    locked: { status: 409, code: "todo_locked",
              data: z.object({ retryAfter: z.number() }) },
  },
  
  // Rate limit (per-IP, per-user)
  rateLimit: { perMinute: 60, perDay: 1000 },
  
  // Schema (typed ctx.db) — separate per-endpoint or shared file
  schema: defineSchema({ tables: { ... } }),
  
  // Middleware chain
  middleware: [requestLogger, auditTrail],
  
  // Handler — gets full ctx
  handler: async (ctx) => {
    // ctx.input — validated zod input
    // ctx.user — User | null (non-null when auth.required)
    // ctx.params — URL params (e.g. /:id)
    // ctx.query — URL query
    // ctx.headers — request headers
    // ctx.method, ctx.endpointPath
    // ctx.requestId, ctx.projectId, ctx.environmentId
    return { ok: true };
  },
});
```

### File-based routing

```
endpoints/hello/get.ts                   → GET  /hello
endpoints/todos/list/post.ts             → POST /todos/list
endpoints/todos/[id]/get.ts              → GET  /todos/:id        (ctx.params.id)
endpoints/users/[uid]/posts/[pid]/put.ts → PUT  /users/:uid/posts/:pid
```

Dosya adı `{method}.ts` — `get.ts`, `post.ts`, `put.ts`, `patch.ts`, `delete.ts`. Klasör isimleri path segmentleri; `[name]` URL param'i.

---

## ctx surfaces

Customer handler'ı `ctx`'ten gelir. Hepsi runtime'da otomatik wired, npm dep ekleme YOK.

### ctx.docs — document store (Firestore-benzeri)

```ts
const snap = await ctx.docs.collection("todos")
  .where("ownerId", "==", ctx.user.id)
  .orderBy("createdAt", "desc")
  .limit(20)
  .get();

for (const doc of snap.data.docs) {
  console.log(doc.id, doc.data());
}

// Single doc
const todo = await ctx.docs.collection("todos").doc(id).get();
if (!todo.exists) throw ctx.errors.todoNotFound();

// CRUD
const created = await ctx.docs.collection("todos").add({ title: "Buy milk" });
await ctx.docs.collection("todos").doc(id).update({ done: true });
await ctx.docs.collection("todos").doc(id).delete();
```

### ctx.db — typed Postgres (per-project)

```ts
// String API
const rows = await ctx.db.findMany("users", { where: { active: true }, limit: 10 });
const user = await ctx.db.findById("users", "usr_123");
const created = await ctx.db.insert("users", { name: "Ada" });
await ctx.db.update("users", "usr_123", { name: "Lovelace" });
await ctx.db.delete("users", "usr_123");
await ctx.db.query("SELECT * FROM users WHERE active = $1", [true]);

// Typed via schema
import { defineSchema, table, text, boolean } from "@palbase/backend";
const schema = defineSchema({
  tables: {
    users: table("users", { id: uuid().primary(), name: text(), active: boolean() }),
  },
});

defineEndpoint({
  schema,
  handler: async (ctx) => {
    // ctx.db.tables.users.insert/findById/findMany/update/delete fully typed
    const user = await ctx.db.tables.users.insert({ name: "Ada", active: true });
  },
});

// Transactions
await ctx.db.transaction(async (tx) => {
  await tx.tables.users.insert({ name: "x" });
  await tx.tables.audit.insert({ action: "user_create" });
  // commit on return, rollback on throw
});
```

> `ctx.db` `palbase serve` lokal modda çalışmaz (pod-internal API). Hatayı net basar: `palbase push` çağır, deploy edilen pod'da test et.

### ctx.storage — file storage (S3-compatible)

```ts
const bucket = ctx.storage.bucket("avatars");
await bucket.upload("user-123/avatar.jpg", fileData, { contentType: "image/jpeg" });
const url = await bucket.getPublicUrl("user-123/avatar.jpg");
const signed = await bucket.createSignedUrl("user-123/avatar.jpg", 3600);
await bucket.remove("user-123/avatar.jpg");
```

### ctx.auth — auth admin

```ts
const user = await ctx.auth.getUser("usr_123");
await ctx.auth.updateUser("usr_123", { email: "new@a.com" });
```

### ctx.notify — push / email / sms / in-app

```ts
// Template kullanımı
await ctx.notify.send({
  to: { user_id: ctx.user.id },
  template: "welcome",
  variables: { firstName: "Ada" },
});

// Direct push
await ctx.notify.push.send({
  device_tokens: ["..."],
  title: "Yeni mesaj",
  body: "...",
});

// Email templates
const tpls = await ctx.notify.templates.email.list();
```

### ctx.flags — feature flags / A/B test

```ts
if (await ctx.flags.isEnabled("new_checkout", ctx.user)) {
  // …
}
const variant = await ctx.flags.getVariant("hero_cta", ctx.user);
```

### ctx.analytics — event tracking

```ts
await ctx.analytics.capture({
  event: "todo_completed",
  distinctId: ctx.user.id,
  properties: { todoId: id, elapsedMs: 42 },
});
```

### ctx.realtime — pub/sub

```ts
await ctx.realtime.channel("room:abc").send({
  type: "message",
  payload: { from: ctx.user.id, text: "hello" },
});
```

### ctx.cache — Redis (per-project key namespace)

```ts
await ctx.cache.set("key", { foo: "bar" }, 60);   // 60s TTL
const cached = await ctx.cache.get("key");

// Stampede-safe single-flight
const value = await ctx.cache.getOrSet("expensive:key", 300, async () => {
  return await expensiveCompute();
});
```

### ctx.queue — background jobs

```ts
await ctx.queue.push("send-welcome-email", { userId: ctx.user.id });
```

Worker (`defineWorker`) ayrı bir dosyada — bkz. `defineWorker` docs.

### ctx.links — deep links

```ts
const link = await ctx.links.create({
  path: "/invite/abc",
  metadata: { inviter: ctx.user.id },
});
```

### ctx.cms — content management

```ts
const post = await ctx.cms.findOne("blog_posts", { slug: "hello-world" });
```

### ctx.env — environment variables

```ts
const apiKey = ctx.env.STRIPE_SECRET_KEY;
```

> `process.env`'e erişim YOK. `ctx.env` yalnızca branch-scoped env var'larını içerir. `palbase secret set KEY=value` ile yönetilir.

---

## Typed errors (opt-in)

Önemli iş use case'leri için error declare et — iOS/web codegen typed enum üretir:

```ts
defineEndpoint({
  method: "POST",
  errors: {
    todoNotFound: { status: 404, code: "todo_not_found" },
    todoLocked:   { status: 409, code: "todo_locked",
                    data: z.object({ retryAfter: z.number() }) },
  },
  handler: async (ctx) => {
    const todo = await ctx.docs.collection("todos").doc(id).get();
    if (!todo.exists) throw ctx.errors.todoNotFound();
    if (todo.data.locked) throw ctx.errors.todoLocked({ retryAfter: 30 });
    return { ok: true };
  },
});
```

Wire envelope:
```json
{ "error": "todo_locked", "error_description": "...", "status": 409, "data": { "retryAfter": 30 }, "request_id": "req_..." }
```

iOS tarafında customer:
```swift
catch PostTodos.Error.todoLocked(let data) {
    sleep(data.retryAfter); retry()
}
```

Declare etmediğin throw'lar: ya `throw new HttpError(404, "code", "msg")` ya da bare Error → iOS'ta `BackendError.server(code, status, message, requestId)` olarak gelir.

---

## CLI komutları (backend developer için)

### Lokal dev
```bash
palbase serve                  # localhost:4003 hot reload
palbase serve --port 4000
palbase serve --branch <name>  # belirli branch'i target et
```

### Deploy
```bash
palbase push                   # mevcut linkli proje + active branch
palbase push -m "fix: x"       # commit message
palbase push --no-types        # post-deploy types regen atla
palbase push --branch <name>   # belirli branch
```

`palbase push` adımları:
1. cwd'i bundle (`tar.gz`) — sadece `endpoints/, config/, package.json, *.lock, tsconfig.json, palbase.toml`
2. Studio'ya upload, deploy
3. Pod re-deploy (KNative-benzeri rolling)
4. OpenAPI spec regen + iOS/web types regen (opt-out: `--no-types`)
5. config-as-code TOML push (auth/storage/flags/notifications/documents)

### Branch lifecycle
```bash
palbase branch list
palbase branch create <name>             # Y/N prompt + sync wait (Pro+ feature)
palbase branch create <name> --async --yes --no-deploy
palbase branch create <name> --fork-from main      # mevcut branch'tan fork
palbase branch switch <name>             # lokal switch — bir sonraki push/serve oraya
palbase branch hibernate <name>          # ucuzlatır
palbase branch wake <name>
palbase branch delete <name> --yes
palbase merge <src> --into <target> --yes  # schema diff + bundle promote
palbase merge list
```

### Config-as-code
```bash
config/auth.toml                # providers, MFA, recovery
config/storage.toml             # buckets, policies
config/notifications.toml       # email/sms/push providers, templates
config/flags.toml               # feature flags, A/B tests
config/documents.toml           # ctx.docs collection rules
```

`palbase push` bunları otomatik apply eder. Pull tersi: server'dan günceli çeker.

### Secret / env var
```bash
palbase secret list
palbase secret set DB_PASSWORD=xyz --secret    # encrypted
palbase secret set FEATURE_X=on                # plain
palbase secret remove DB_PASSWORD
```

Branch-scoped. `ctx.env.DB_PASSWORD` ile handler'da erişilir.

### API key
```bash
palbase apikey list <ref>
palbase apikey reveal <ref>                    # default anon + service-role plaintexts
palbase apikey create <ref> --name ci --scope s    # s=service-role, c=anon
palbase apikey revoke <ref> <key-id>
```

### Mobil codegen (iOS)
```bash
palbase mobile setup ios --ref <ref>           # tek seferlik Xcode wire
palbase mobile codegen ios                     # manuel (build phase otomatik çağırır)
palbase mobile checkout <branch>               # branch değiştir + codegen
```

iOS tarafında bu komutlar `PalbaseGenerated.swift` (typed methods) + `PalbaseGenerated.json` (Bundle resource — runtime config) üretir. App'te tek satır: `pb.configure()`.

---

## Local dev (`palbase serve`)

```bash
cd /path/to/backend
npm install                    # ilk seferde
palbase serve                  # localhost:4003
```

İçinde:
- Node.js child process (production runtime'la aynı kod path)
- Hot reload: `endpoints/` değişikliği → child process restart
- LIVE data: ctx.docs / ctx.storage / ctx.notify / ctx.flags / ctx.analytics dev cluster'a HTTP yapar
- **ctx.db serve'de YOK** — pod-internal API; `palbase push` ile deploy edip test et

iOS app aynı anda Xcode'da build edersen codegen otomatik `localhost:4003`'ü tespit eder, `PalbaseGenerated.json`'a `url: "http://localhost:4003"` yazar. Simulator local backend'e gider.

---

## Wire format

Tüm response'lar JSON. Hata envelope'u standart Palbase format:
```json
{
  "error": "todo_not_found",
  "error_description": "Todo with the requested id does not exist",
  "status": 404,
  "request_id": "req_abc...",
  "data": { ... }          // declared errors için opsiyonel payload
}
```

Auth header: `Authorization: Bearer <jwt>` (`pb.auth.signIn` sonrası SDK otomatik).
API key header: `apikey: pb_<ref>_<scope><random>`.

---

## Versionlama

Customer template `package.json`'da:
```json
"dependencies": {
  "@palbase/backend": "latest"
}
```

Mevcut CLI / runtime versiyonları:
| `palbase` CLI | `@palbase/backend` | backend-runtime | iOS `Palbe` |
|---|---|---|---|
| `v0.3.15+` | `^0.11.0` | `sha-fd09258+` | `v0.2.8+` |
| `v0.3.12+` | `^0.11.0` | `sha-e57d86a+` (typed errors) | `v0.2.7+` |

`palbase push` her zaman `@palbase/backend@latest` ile uyumlu olacak şekilde pod build eder.

---

## Sorun giderme

| Hata | Çözüm |
|---|---|
| `Cannot find module '@palbase/backend'` | `npm install` çağır, IDE Restart |
| `palbase push` "tenant_not_found" | Project ref yanlış veya branch active değil. `palbase project list` + `palbase status` ile doğrula |
| `palbase serve` ctx.notify undefined | Eski runtime versiyonu — `palbase push` ile pod'u güncelle |
| `palbase secret list` empty error | Studio not provisioned — `palbase push` ile config TOML push et |
| `palbase login` "invalid_grant" refresh | `palbase logout && palbase login` |

---

## Repository

| | |
|---|---|
| **Backend SDK source** | https://github.com/palgroup/palbase-ts/tree/main/backend |
| **Backend runtime** | https://github.com/palgroup/backend-runtime |
| **CLI** | https://github.com/palgroup/palbase-cli |
| **iOS SDK** | https://github.com/palgroup/palbackend-ios |
| **Spec** | https://github.com/palgroup/palbase/tree/main/modules/backend/docs |

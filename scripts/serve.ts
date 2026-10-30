import { createServer } from "node:http"
import { NodeHttpServer, NodeRuntime } from "@effect/platform-node"
import { Config, Effect, Layer } from "effect"
import { HttpRouter, HttpStaticServer } from "effect/http"

/** Serves `dist/` over HTTP. Configure with the PORT and HOST environment variables. */
const ServerLive = Layer.unwrap(
  Effect.gen(function*() {
    const port = yield* Config.Int("PORT").pipe(Config.withDefault(8080))
    const host = yield* Config.String("HOST").pipe(Config.withDefault("0.0.0.0"))
    const root = new URL("../dist", import.meta.url).pathname
    yield* Effect.log(`Serving ${root} on http://${host}:${port}`)
    return HttpRouter.serve(
      HttpStaticServer.layer({
        root,
        index: "index.html",
        cacheControl: "public, max-age=300",
        mimeTypes: { ics: "text/calendar; charset=utf-8" }
      })
    ).pipe(Layer.provide(NodeHttpServer.layer(createServer, { port, host })))
  })
)

NodeRuntime.runMain(Layer.launch(ServerLive))

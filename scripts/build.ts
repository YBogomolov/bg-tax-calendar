import { NodeRuntime, NodeServices } from "@effect/platform-node"
import * as esbuild from "esbuild"
import { Effect, FileSystem, Path, Schema } from "effect"
import { buildData } from "../src/build-data.ts"

class BundleError extends Schema.TaggedError<BundleError>()("BundleError", {
  message: Schema.String
}) {}

const STATIC_FILES = ["index.html", "styles.css", "favicon.svg"]

const program = Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const root = path.resolve(import.meta.dirname, "..")
  const outDir = path.join(root, "dist")

  yield* fs.remove(outDir, { recursive: true, force: true })
  yield* fs.makeDirectory(outDir, { recursive: true })

  yield* buildData(root, outDir)

  const result = yield* Effect.tryPromise({
    try: () =>
      esbuild.build({
        entryPoints: [path.join(root, "web/main.ts")],
        outfile: path.join(outDir, "app.js"),
        bundle: true,
        minify: true,
        format: "esm",
        target: "es2022",
        metafile: true,
        legalComments: "none"
      }),
    catch: (e) => new BundleError({ message: String(e) })
  })
  const size = result.metafile.outputs[path.join("dist", "app.js")]?.bytes ?? 0
  yield* Effect.log(`Bundled app.js (${(size / 1024).toFixed(1)} KiB)`)

  for (const file of STATIC_FILES) {
    yield* fs.copyFile(path.join(root, "web", file), path.join(outDir, file))
  }
  yield* Effect.log(`Site written to ${outDir}`)
})

program.pipe(Effect.provide(NodeServices.layer), NodeRuntime.runMain)

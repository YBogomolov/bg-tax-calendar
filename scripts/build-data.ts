import { NodeRuntime, NodeServices } from "@effect/platform-node"
import { Effect, Path } from "effect"
import { buildData } from "../src/build-data.ts"

/** Parses the NRA documents into `dist/data` without bundling the site. */
const program = Effect.gen(function* () {
  const path = yield* Path.Path
  const root = path.resolve(import.meta.dirname, "..")
  yield* buildData(root, path.join(root, "dist"))
})

program.pipe(Effect.provide(NodeServices.layer), NodeRuntime.runMain)

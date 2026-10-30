import { appendFileSync } from "node:fs"
import { NodeRuntime, NodeServices } from "@effect/platform-node"
import { Effect, Path } from "effect"
import { refetch } from "../src/refetch.ts"

/**
 * Downloads the current NRA calendars into `data/sources`. In GitHub Actions,
 * writes `changed=true|false` to `$GITHUB_OUTPUT` and a report to the job summary.
 */
const program = Effect.gen(function* () {
  const path = yield* Path.Path
  const root = path.resolve(import.meta.dirname, "..")
  const today = new Date().toISOString().slice(0, 10)
  const { changed, unchanged } = yield* refetch(root, today)

  const report = [
    "## NRA calendars",
    "",
    ...changed.map((t) => `- **Updated:** ${t}`),
    ...unchanged.map((t) => `- Unchanged: ${t}`),
  ].join("\n")
  yield* Effect.log(changed.length > 0 ? `Updated: ${changed.join(", ")}` : "No changes")

  const output = process.env["GITHUB_OUTPUT"]
  if (output) appendFileSync(output, `changed=${changed.length > 0}\n`)
  const summary = process.env["GITHUB_STEP_SUMMARY"]
  if (summary) appendFileSync(summary, report + "\n")
})

program.pipe(Effect.provide(NodeServices.layer), NodeRuntime.runMain)

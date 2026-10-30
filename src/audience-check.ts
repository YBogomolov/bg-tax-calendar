import { Effect } from "effect"
import type { BuildWarning, Deadline, Tag } from "./domain.ts"
import { narrowAll } from "./profile.ts"

/** Expected obligations per profile. A miss means that the NRA changed its wording. */
const EXPECTED: ReadonlyArray<{
  readonly tag: Tag
  readonly label: string
  readonly test: RegExp
  readonly min: number
}> = [
  {
    tag: "freelancer",
    label: "monthly social contributions",
    test: /авансово дължимите месечни осигурителни вноски/,
    min: 12,
  },
  {
    tag: "freelancer",
    label: "monthly declaration form 1",
    test: /декларация образец №1 от самоосигуряващите се лица/,
    min: 12,
  },
  { tag: "freelancer", label: "annual tax return", test: /годишна данъчна декларация по чл\. 50/, min: 1 },
  { tag: "freelancer", label: "quarterly advance tax", test: /доходи от стопанска дейност по чл\. 29/, min: 3 },
  {
    tag: "trader",
    label: "annual tax return of sole traders",
    test: /годишна данъчна декларация по чл\. 50.*търговци/,
    min: 1,
  },
  { tag: "vat", label: "monthly VAT return", test: /справка-декларация по ЗДДС/, min: 12 },
  { tag: "property", label: "property tax", test: /недвижимите имоти/, min: 2 },
]

export const audienceCheck = Effect.fnUntraced(function* (
  year: number,
  deadlines: ReadonlyArray<Deadline>,
  warn: (message: string) => Effect.Effect<void, BuildWarning>
) {
  for (const tag of ["freelancer", "trader", "vat", "property"] as const) {
    const list = narrowAll(deadlines, [tag])
    yield* Effect.log(
      `${year} profile ${tag}: ${list.length} deadlines, ${list.reduce((n, d) => n + d.items.length, 0)} items`
    )
  }
  for (const e of EXPECTED) {
    const found = narrowAll(deadlines, [e.tag])
      .flatMap((d) => d.items)
      .filter((i) => e.test.test(i.text)).length
    if (found < e.min) {
      yield* warn(
        `${year} profile ${e.tag}: expected at least ${e.min} × ${e.label}, found ${found}. Check src/audience.ts.`
      )
    }
  }
})

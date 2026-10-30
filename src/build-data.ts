import { createHash } from "node:crypto"
import { Config, Effect, FileSystem, Path, Schema } from "effect"
import { audienceCheck } from "./audience-check.ts"
import { tagItem } from "./audience.ts"
import {
  Buffers,
  BuildWarning,
  CalendarIndex,
  CalendarYear,
  type Deadline,
  ParseError,
  type SourceDoc,
  SourceKind,
} from "./domain.ts"
import { readParagraphs } from "./docx.ts"
import {
  type HolidayOverrides,
  makeWorkingDayCheck,
  minusDays,
  nextWorkingDay,
  previousWorkingDay,
  publicHolidays,
} from "./holidays.ts"
import { toIcs } from "./ics.ts"
import { parseSocial, parseTax, type RawDeadline } from "./parse.ts"
import { FEEDS, mergeSocial, narrowAll } from "./profile.ts"

const SourceEntry = Schema.Struct({
  title: Schema.String,
  page: Schema.String,
  file: Schema.String,
  retrieved: Schema.String,
  checked: Schema.String,
})
const SourcesFile = Schema.Record(Schema.String, Schema.Record(SourceKind, SourceEntry))
const HolidaysFile = Schema.Record(
  Schema.String,
  Schema.Struct({ extraDaysOff: Schema.Array(Schema.String), workingDays: Schema.Array(Schema.String) })
)
const SettingsFile = Schema.Struct({ buffers: Buffers })

const readJson = Effect.fnUntraced(function* <S extends Schema.Top & { readonly DecodingServices: never }>(
  file: string,
  schema: S
) {
  const fs = yield* FileSystem.FileSystem
  const text = yield* fs.readFileString(file)
  return yield* Schema.decodeUnknownEffect(Schema.fromJsonString(schema))(text)
})

const slug = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9а-я]+/g, "-")
    .replace(/^-|-$/g, "")

const finalise = Effect.fnUntraced(function* (
  raw: ReadonlyArray<RawDeadline>,
  isWorkingDay: (d: Date) => boolean,
  buffers: Buffers,
  warn: (message: string) => Effect.Effect<void, BuildWarning>
) {
  const seen = new Map<string, number>()
  const out: Array<Deadline> = []
  for (const r of raw) {
    const computed = nextWorkingDay(r.date, isWorkingDay)
    if (r.statedDue !== undefined && r.statedDue !== computed) {
      yield* warn(
        `${r.source} ${r.date} (${r.category}): document says ${r.statedDue}, holiday rules give ${computed}. Using the document. Update data/holidays.json if needed.`
      )
    }
    const base = `${r.source}-${r.date}-${slug(r.category)}`
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)
    const due = r.statedDue ?? computed
    out.push({
      id: n === 1 ? base : `${base}-${n}`,
      source: r.source,
      date: r.date,
      due,
      startSafe: previousWorkingDay(minusDays(due, buffers.safeDays), isWorkingDay),
      startTight: previousWorkingDay(minusDays(due, buffers.tightDays), isWorkingDay),
      category: r.category,
      group: r.group,
      items: r.items.map((text) => ({ text, tags: tagItem(r.source, r.category, text) })),
      notes: r.notes,
    })
  }
  return out.sort(
    (a, b) => a.due.localeCompare(b.due) || a.source.localeCompare(b.source) || a.category.localeCompare(b.category)
  )
})

/**
 * Reads every year in `data/sources`, parses the official NRA documents and
 * writes `data/<year>.json`, `data/index.json` and `calendar.ics` to `outDir`.
 */
export const buildData = Effect.fn("buildData")(function* (root: string, outDir: string) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const sources = yield* readJson(path.join(root, "data/sources/sources.json"), SourcesFile)
  const overridesFile = yield* readJson(path.join(root, "data/holidays.json"), HolidaysFile)
  const { buffers } = yield* readJson(path.join(root, "data/settings.json"), SettingsFile)
  const overrides: Record<number, HolidayOverrides> = {}
  for (const [y, o] of Object.entries(overridesFile)) if (/^\d{4}$/.test(y)) overrides[Number(y)] = o
  const isWorkingDay = makeWorkingDayCheck(overrides)
  const generatedAt = new Date().toISOString()
  // With STRICT=true (CI), a data warning stops the build, so the site keeps the last good data.
  const strict = yield* Config.Boolean("STRICT").pipe(Config.withDefault(false))
  const warn = (message: string) => (strict ? Effect.fail(new BuildWarning({ message })) : Effect.logWarning(message))

  yield* fs.makeDirectory(path.join(outDir, "data"), { recursive: true })
  const years: Array<number> = []
  const all: Array<Deadline> = []

  for (const [yearKey, kinds] of Object.entries(sources).sort()) {
    const year = Number(yearKey)
    const docs: Array<SourceDoc> = []
    const raw: Array<RawDeadline> = []
    for (const kind of SourceKind.literals) {
      const entry = kinds[kind]
      if (entry === undefined) continue
      const file = path.join(root, "data/sources", yearKey, entry.file)
      const bytes = yield* fs.readFile(file)
      const paragraphs = yield* readParagraphs(kind, bytes)
      const parsed = yield* kind === "tax" ? parseTax(year, paragraphs) : parseSocial(year, paragraphs)
      raw.push(...parsed)
      docs.push({
        kind,
        title: entry.title,
        page: entry.page,
        retrieved: entry.retrieved,
        checked: entry.checked,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      })
      yield* Effect.log(`${year} ${kind}: ${parsed.length} deadlines from ${entry.file}`)
    }
    if (raw.length === 0) return yield* new ParseError({ source: yearKey, message: "No source documents" })
    const deadlines = yield* finalise(raw, isWorkingDay, buffers, warn)
    yield* audienceCheck(year, deadlines, warn)
    const holidays = [...publicHolidays(year, overrides[year])].filter((d) => d.startsWith(yearKey)).sort()
    const calendar = yield* Schema.decodeUnknownEffect(CalendarYear)({
      year,
      buffers,
      generatedAt,
      sources: docs,
      holidays,
      deadlines,
    })
    yield* fs.writeFileString(path.join(outDir, "data", `${year}.json`), JSON.stringify(calendar))
    years.push(year)
    all.push(...deadlines)
  }

  const index: CalendarIndex = { years, feeds: FEEDS.map(({ file, title }) => ({ file, title })) }
  yield* fs.writeFileString(path.join(outDir, "data", "index.json"), JSON.stringify(index))
  for (const feed of FEEDS) {
    const list = feed.tags === undefined ? all : mergeSocial(narrowAll(all, feed.tags))
    const ics = toIcs(list, {
      name: feed.title,
      stamp: generatedAt,
      sourceUrl: "https://nra.bg/wps/portal/nra/calendar/calendar",
      startEvents: feed.tags !== undefined,
      buffers,
    })
    yield* fs.writeFileString(path.join(outDir, feed.file), ics)
  }
  yield* Effect.log(`Wrote ${all.length} deadlines for ${years.join(", ")}`)
  return { years, count: all.length }
})

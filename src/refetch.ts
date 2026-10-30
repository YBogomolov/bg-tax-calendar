import { createHash } from "node:crypto"
import { Effect, FileSystem, Path, Schedule, Schema } from "effect"
import { ParseError, SourceKind } from "./domain.ts"
import { readParagraphs } from "./docx.ts"
import { parseSocial, parseTax } from "./parse.ts"

/** The NRA page that links the yearly tax and social-insurance calendars. */
export const INDEX_URL = "https://nra.bg/wps/portal/nra/calendar/calendar"

/** Identifies the project honestly. The NRA site serves documents to this agent. */
const USER_AGENT = "bg-tax-calendar (+https://github.com/YBogomolov/bg-tax-calendar)"

export class FetchError extends Schema.TaggedError<FetchError>()("FetchError", {
  url: Schema.String,
  message: Schema.String
}) {}

const TITLES: Record<SourceKind, RegExp> = {
  tax: /^Данъчен календар (\d{4}) г\.?$/,
  social: /^Осигурителен календар (\d{4}) г\.?$/
}

export interface CalendarLink {
  readonly kind: SourceKind
  readonly year: number
  readonly title: string
  readonly page: string
}

const decodeHtml = (s: string) => s.replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim()

/** Finds the links to the yearly calendar pages on the index page. */
export const findCalendarLinks = (html: string, base: string): ReadonlyArray<CalendarLink> => {
  const links: Array<CalendarLink> = []
  for (const m of html.matchAll(/<a\s[^>]*href=["']([^"']+)["'][^>]*>([^<]+)<\/a>/g)) {
    const title = decodeHtml(m[2]!)
    for (const kind of SourceKind.literals) {
      const year = title.match(TITLES[kind])?.[1]
      if (year === undefined) continue
      const page = new URL(decodeHtml(m[1]!), base).href
      if (!links.some((l) => l.page === page)) links.push({ kind, year: Number(year), title, page })
    }
  }
  return links
}

/** Finds the first `.docx` link on a calendar page. */
export const findDocxLink = (html: string, base: string): string | undefined => {
  const m = html.match(/href=["']([^"']+\.docx[^"']*)["']/i)
  return m === null ? undefined : new URL(decodeHtml(m[1]!), base).href
}

const get = (url: string) =>
  Effect.tryPromise({
    try: async () => {
      const res = await fetch(url, { headers: { "User-Agent": USER_AGENT }, redirect: "follow" })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return { type: res.headers.get("content-type") ?? "", body: new Uint8Array(await res.arrayBuffer()) }
    },
    catch: (e) => new FetchError({ url, message: String(e) })
  }).pipe(Effect.retry({ schedule: Schedule.exponential("2 seconds"), times: 3 }))

const getText = (url: string) => get(url).pipe(Effect.map((r) => new TextDecoder().decode(r.body)))

const getDocx = Effect.fnUntraced(function*(url: string) {
  const { type, body } = yield* get(url)
  // A DOCX file is a ZIP archive. Anything else is an error page or a bot challenge.
  if (body[0] !== 0x50 || body[1] !== 0x4b) {
    return yield* new FetchError({ url, message: `Expected a DOCX file, got ${type || "unknown content"}` })
  }
  return body
})

const SourceEntry = Schema.Struct({
  title: Schema.String,
  page: Schema.String,
  file: Schema.String,
  retrieved: Schema.String,
  checked: Schema.String
})
const SourcesFile = Schema.Record(Schema.String, Schema.Record(SourceKind, SourceEntry))
const HolidaysFile = Schema.Record(
  Schema.String,
  Schema.Struct({ extraDaysOff: Schema.Array(Schema.String), workingDays: Schema.Array(Schema.String) })
)

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex")

export interface RefetchResult {
  readonly changed: ReadonlyArray<string>
  readonly unchanged: ReadonlyArray<string>
}

/**
 * Downloads the calendars that the NRA index page lists. A document is written to
 * `data/sources/<year>/` only if it is new or its content changed, and only after
 * the parser accepts it. The check date of every document is updated.
 */
export const refetch = Effect.fn("refetch")(function*(root: string, today: string) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const sourcesPath = path.join(root, "data/sources/sources.json")
  const holidaysPath = path.join(root, "data/holidays.json")
  const sources = { ...(yield* Schema.decodeUnknownEffect(Schema.fromJsonString(SourcesFile))(yield* fs.readFileString(sourcesPath))) }
  const holidays = { ...(yield* Schema.decodeUnknownEffect(Schema.fromJsonString(HolidaysFile))(yield* fs.readFileString(holidaysPath))) }

  const links = findCalendarLinks(yield* getText(INDEX_URL), INDEX_URL)
  if (links.length === 0) {
    return yield* new ParseError({ source: INDEX_URL, message: "No calendar links found. The NRA page layout changed." })
  }
  yield* Effect.log(`Found ${links.map((l) => l.title).join(", ")}`)

  const changed: Array<string> = []
  const unchanged: Array<string> = []
  for (const link of links) {
    const docxUrl = findDocxLink(yield* getText(link.page), link.page)
    if (docxUrl === undefined) {
      return yield* new ParseError({ source: link.page, message: `No .docx link on the page for "${link.title}"` })
    }
    const bytes = yield* getDocx(docxUrl)
    const yearKey = String(link.year)
    const file = `${link.kind}.docx`
    const target = path.join(root, "data/sources", yearKey, file)
    const existing = (yield* fs.exists(target)) ? yield* fs.readFile(target) : undefined
    const entry = sources[yearKey]?.[link.kind]
    if (existing !== undefined && entry !== undefined && sha256(existing) === sha256(bytes)) {
      sources[yearKey] = { ...sources[yearKey], [link.kind]: { ...entry, checked: today } } as (typeof sources)[string]
      unchanged.push(link.title)
      continue
    }

    // Reject a document that the parser cannot read, so the site keeps the last good data.
    const paragraphs = yield* readParagraphs(link.kind, bytes)
    const parsed = yield* (link.kind === "tax" ? parseTax(link.year, paragraphs) : parseSocial(link.year, paragraphs))
    yield* Effect.log(`${link.title}: ${existing === undefined ? "new" : "changed"}, ${parsed.length} deadlines`)

    yield* fs.makeDirectory(path.dirname(target), { recursive: true })
    yield* fs.writeFile(target, bytes)
    sources[yearKey] = { ...sources[yearKey], [link.kind]: { title: link.title, page: link.page, file, retrieved: today, checked: today } } as (typeof sources)[string]
    holidays[yearKey] ??= { extraDaysOff: [], workingDays: [] }
    changed.push(link.title)
  }

  // Always record the check date: the site shows it, and the commit keeps the scheduled workflow active.
  const sorted = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)))
  yield* fs.writeFileString(sourcesPath, JSON.stringify(sorted(sources), null, 2) + "\n")
  if (changed.length > 0) yield* fs.writeFileString(holidaysPath, JSON.stringify(sorted(holidays), null, 2) + "\n")
  return { changed, unchanged } satisfies RefetchResult
})

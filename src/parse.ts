import { Effect } from "effect"
import { ParseError, type SourceKind } from "./domain.ts"
import type { Paragraph } from "./docx.ts"

/** A deadline as found in a source document, before the expiry date is computed. */
export interface RawDeadline {
  readonly source: SourceKind
  readonly date: string
  /** Expiry date when the document states it explicitly ("срокът изтича на ..."). */
  readonly statedDue: string | undefined
  readonly category: string
  readonly group: string
  readonly items: Array<string>
  readonly notes: Array<string>
}

const MONTHS = [
  "януари",
  "февруари",
  "март",
  "април",
  "май",
  "юни",
  "юли",
  "август",
  "септември",
  "октомври",
  "ноември",
  "декември"
] as const
const MONTH_RE = MONTHS.join("|")

const monthIndex = (name: string): number => MONTHS.indexOf(name.toLowerCase() as (typeof MONTHS)[number]) + 1

const iso = (year: number, month: number, day: number): string =>
  `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`

/** Removes list markers such as "1.", "•" or "-" at the start of an item. */
const stripMarker = (s: string): string => s.replace(/^(?:\d{1,2}(?:[.)]\s*|\s+(?=[А-ЯA-Z]))|[•·▪\-–]\s*)/, "")

class Collector {
  private readonly byKey = new Map<string, RawDeadline>()
  add(d: Omit<RawDeadline, "items" | "notes">): RawDeadline {
    const key = `${d.date}|${d.group}`
    const existing = this.byKey.get(key)
    if (existing !== undefined) return existing
    const created: RawDeadline = { ...d, items: [], notes: [] }
    this.byKey.set(key, created)
    return created
  }
  result(): ReadonlyArray<RawDeadline> {
    return [...this.byKey.values()].filter((d) => d.items.length > 0)
  }
}

// ---------------------------------------------------------------------------
// Tax calendar: "МЕСЕЦ" → "До 14-ти януари:" → law code → items
// ---------------------------------------------------------------------------

const TAX_DATE = new RegExp(`^До (\\d{1,2})(?:-[а-я]{1,3})?\\s+(${MONTH_RE})\\s*:?$`, "i")
const TAX_LAW = /^(З[А-Я]{2,6}|ДОПК|Наредба .{0,60})$/
const TAX_END = /^(?:II|ІІ)\.\s/

const taxCategory = (law: string): string => {
  const ordinance = law.match(/^Наредба\s*№?\s*(Н-\d+)/)
  return ordinance?.[1] ?? law
}

export const parseTax = Effect.fnUntraced(function*(year: number, paragraphs: ReadonlyArray<Paragraph>) {
  const out = new Collector()
  let date: string | undefined
  let current: RawDeadline | undefined
  for (const { text } of paragraphs) {
    if (TAX_END.test(text)) break
    const dateMatch = text.match(TAX_DATE)
    if (dateMatch !== null) {
      date = iso(year, monthIndex(dateMatch[2]!), Number(dateMatch[1]))
      current = undefined
      continue
    }
    if (MONTHS.includes(text.toLowerCase() as (typeof MONTHS)[number])) {
      date = undefined
      current = undefined
      continue
    }
    if (date === undefined) continue
    if (TAX_LAW.test(text)) {
      current = out.add({ source: "tax", date, statedDue: undefined, category: taxCategory(text), group: text })
      continue
    }
    if (current === undefined) {
      return yield* new ParseError({ source: "tax", message: `Text without a law heading on ${date}: ${text.slice(0, 80)}` })
    }
    if (/^Забележка/i.test(text)) current.notes.push(text)
    else current.items.push(stripMarker(text))
  }
  const result = out.result()
  if (result.length === 0) return yield* new ParseError({ source: "tax", message: "No deadlines found" })
  return result
})

// ---------------------------------------------------------------------------
// Social-insurance calendar: "Януари 2026 г." → bold group heading → bold "до 25 януари (...)" → items
// ---------------------------------------------------------------------------

const SOCIAL_MONTH = new RegExp(`^(${MONTH_RE}) (\\d{4}) г\\.$`, "i")
const STATED = `\\(срокът изтича на (\\d{1,2}) (${MONTH_RE}) (\\d{4}) г\\.[^)]*\\)`
const SOCIAL_DATE = new RegExp(`^до (\\d{1,2}) (${MONTH_RE})\\.?\\s*(?:${STATED})?\\s*$`, "i")
const SOCIAL_INLINE = new RegExp(`^До (\\d{1,2}) (${MONTH_RE}) (\\d{4}) г\\.\\s*(?:${STATED})?\\s*(.+)$`, "i")
/** Start of the general notes at the end of each month. They carry no fixed date. */
const SOCIAL_NOTES = /^(?:_{5,}|\*|До \d{1,2}-о число)/

const PENSION_GROUP = "Промяна на пенсионното осигуряване"

const socialCategory = (group: string): string => {
  if (group === PENSION_GROUP) return "Пенсионни фондове"
  if (/здравно осигуряване/i.test(group)) return "ЗО"
  if (/държавно обществено осигуряване/i.test(group)) return "ДОО и ДЗПО"
  if (/самоосигуряващите се лица/i.test(group)) return "НООСЛ"
  const ordinance = group.match(/^Наредба\s*№?\s*(Н-\d+)/)
  return ordinance?.[1] ?? group.slice(0, 24)
}

export const parseSocial = Effect.fnUntraced(function*(year: number, paragraphs: ReadonlyArray<Paragraph>) {
  const out = new Collector()
  let started = false
  let inNotes = false
  let group: string | undefined
  let current: RawDeadline | undefined
  const stated = (d?: string, m?: string, y?: string) =>
    d !== undefined && m !== undefined && y !== undefined ? iso(Number(y), monthIndex(m), Number(d)) : undefined

  for (const { text, bold } of paragraphs) {
    const monthMatch = bold ? text.match(SOCIAL_MONTH) : null
    if (monthMatch !== null) {
      if (Number(monthMatch[2]) !== year) {
        return yield* new ParseError({ source: "social", message: `Unexpected year in heading: ${text}` })
      }
      started = true
      inNotes = false
      group = undefined
      current = undefined
      continue
    }
    if (!started) continue

    const inline = bold ? null : text.match(SOCIAL_INLINE)
    if (inline !== null) {
      const [, d, m, y, sd, sm, sy, body] = inline
      const deadline = out.add({
        source: "social",
        date: iso(Number(y), monthIndex(m!), Number(d)),
        statedDue: stated(sd, sm, sy),
        category: socialCategory(PENSION_GROUP),
        group: PENSION_GROUP
      })
      deadline.items.push(body!.charAt(0).toUpperCase() + body!.slice(1))
      continue
    }
    if (SOCIAL_NOTES.test(text)) {
      inNotes = true
      current = undefined
      continue
    }
    if (inNotes) continue

    const dateMatch = bold ? text.match(SOCIAL_DATE) : null
    if (dateMatch !== null) {
      if (group === undefined) {
        return yield* new ParseError({ source: "social", message: `Date without a group heading: ${text}` })
      }
      const [, d, m, sd, sm, sy] = dateMatch
      current = out.add({
        source: "social",
        date: iso(year, monthIndex(m!), Number(d)),
        statedDue: stated(sd, sm, sy),
        category: socialCategory(group),
        group
      })
      continue
    }
    if (bold) {
      group = text.replace(/:$/, "")
      current = undefined
      continue
    }
    if (current === undefined) {
      return yield* new ParseError({ source: "social", message: `Text without a date in group "${group}": ${text.slice(0, 80)}` })
    }
    current.items.push(stripMarker(text).replace(/^за /, "За "))
  }
  const result = out.result()
  if (result.length === 0) return yield* new ParseError({ source: "social", message: "No deadlines found" })
  return result
})

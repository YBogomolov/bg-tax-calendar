import type { Buffers, Deadline } from "./domain.ts"

const escape = (s: string): string => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n")

/** Folds content lines to 75 octets, as RFC 5545 requires. */
const fold = (line: string): string => {
  const bytes = new TextEncoder().encode(line)
  if (bytes.length <= 75) return line
  const parts: Array<string> = []
  let current = ""
  let size = 0
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length
    if (size + n > (parts.length === 0 ? 75 : 74)) {
      parts.push(current)
      current = ""
      size = 0
    }
    current += ch
    size += n
  }
  parts.push(current)
  return parts.join("\r\n ")
}

/** Shortens text at a word boundary. */
const truncate = (s: string, max: number): string =>
  s.length <= max ? s : `${s.slice(0, s.lastIndexOf(" ", max)).replace(/[,;:]$/, "")}…`

const compact = (iso: string): string => iso.replace(/-/g, "")

const nextDay = (iso: string): string => {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

export interface IcsOptions {
  readonly name: string
  readonly stamp: string
  readonly sourceUrl: string
  /** Adds an event on the safe and the tight start day of each deadline. */
  readonly startEvents: boolean
  readonly buffers: Buffers
}

const allDay = (lines: Array<string>, e: { uid: string; stamp: string; date: string; summary: string; description: string; categories: string; url: string }) => {
  lines.push(
    "BEGIN:VEVENT",
    `UID:${e.uid}@bg-tax-calendar`,
    `DTSTAMP:${e.stamp}`,
    `DTSTART;VALUE=DATE:${compact(e.date)}`,
    `DTEND;VALUE=DATE:${compact(nextDay(e.date))}`,
    `SUMMARY:${escape(e.summary)}`,
    `DESCRIPTION:${escape(e.description)}`,
    `CATEGORIES:${e.categories}`,
    `URL:${e.url}`,
    "TRANSP:TRANSPARENT",
    "END:VEVENT"
  )
}

/** Builds an iCalendar feed with one all-day event per deadline, on the expiry date. */
export const toIcs = (deadlines: ReadonlyArray<Deadline>, options: IcsOptions): string => {
  const stamp = options.stamp.replace(/[-:]/g, "").replace(/\.\d+/, "")
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//bg-tax-calendar//NRA//BG",
    "CALSCALE:GREGORIAN",
    `X-WR-CALNAME:${escape(options.name)}`,
    "X-WR-TIMEZONE:Europe/Sofia"
  ]
  for (const d of deadlines) {
    const moved = d.due !== d.date ? `Срок по календара: ${d.date}. Изтича на ${d.due} (неприсъствен ден).\n` : ""
    const start = `Започнете до ${d.startSafe} (${options.buffers.safeDays} дни преди срока), най-късно ${d.startTight} (${options.buffers.tightDays} дни).\n`
    const body = moved + start + "\n" + d.group + "\n\n" + d.items.map((i) => `• ${i.text}`).join("\n") +
      (d.notes.length > 0 ? "\n\n" + d.notes.join("\n") : "")
    const title = truncate(`${d.category}: ${d.items[0]?.text ?? d.group}`, 90)
    const categories = `${escape(d.source === "tax" ? "Данъци" : "Осигуровки")},${escape(d.category)}`
    allDay(lines, { uid: d.id, stamp, date: d.due, summary: `Срок · ${title}`, description: body, categories, url: options.sourceUrl })
    if (options.startEvents) {
      allDay(lines, {
        uid: `${d.id}-safe`,
        stamp,
        date: d.startSafe,
        summary: `Начало (${options.buffers.safeDays} дни) · ${title}`,
        description: `Срок: ${d.due}.\n${body}`,
        categories,
        url: options.sourceUrl
      })
      allDay(lines, {
        uid: `${d.id}-tight`,
        stamp,
        date: d.startTight,
        summary: `Последен момент (${options.buffers.tightDays} дни) · ${title}`,
        description: `Срок: ${d.due}.\n${body}`,
        categories,
        url: options.sourceUrl
      })
    }
  }
  lines.push("END:VCALENDAR")
  return lines.map(fold).join("\r\n") + "\r\n"
}

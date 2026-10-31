import type { Buffers, Deadline } from "./domain.ts"
import type { Lang } from "./i18n.ts"
import { actionLabel, categoryName } from "./labels.ts"

interface IcsText {
  readonly due: string
  readonly safe: (days: number) => string
  readonly tight: (days: number) => string
  readonly moved: (date: string, due: string) => string
  readonly start: (safe: string, safeDays: number, tight: string, tightDays: number) => string
  readonly dueLine: (due: string) => string
  readonly tax: string
  readonly social: string
  /** Heading above the Bulgarian original. Empty in Bulgarian. */
  readonly official: string
}

const TEXT: Record<Lang, IcsText> = {
  bg: {
    due: "Срок",
    safe: (n) => `Начало (${n} дни)`,
    tight: (n) => `Последен момент (${n} дни)`,
    moved: (date, due) => `Срок по календара: ${date}. Изтича на ${due} (неприсъствен ден).`,
    start: (s, sd, t, td) => `Започнете до ${s} (${sd} дни преди срока), най-късно ${t} (${td} дни).`,
    dueLine: (due) => `Срок: ${due}.`,
    tax: "Данъци",
    social: "Осигуровки",
    official: "",
  },
  ru: {
    due: "Срок",
    safe: (n) => `Начать (за ${n} дн.)`,
    tight: (n) => `Последний момент (за ${n} дн.)`,
    moved: (date, due) => `Срок по календарю: ${date}. Истекает ${due} (нерабочий день).`,
    start: (s, sd, t, td) => `Начните до ${s} (за ${sd} дн. до срока), не позднее ${t} (за ${td} дн.).`,
    dueLine: (due) => `Срок: ${due}.`,
    tax: "Налоги",
    social: "Взносы",
    official: "Официальный текст НАП (на болгарском):",
  },
  uk: {
    due: "Термін",
    safe: (n) => `Почати (за ${n} дн.)`,
    tight: (n) => `Останній момент (за ${n} дн.)`,
    moved: (date, due) => `Термін за календарем: ${date}. Спливає ${due} (неробочий день).`,
    start: (s, sd, t, td) => `Почніть до ${s} (за ${sd} дн. до терміну), не пізніше ${t} (за ${td} дн.).`,
    dueLine: (due) => `Термін: ${due}.`,
    tax: "Податки",
    social: "Внески",
    official: "Офіційний текст НАП (болгарською):",
  },
  en: {
    due: "Due",
    safe: (n) => `Start (${n} days)`,
    tight: (n) => `Last call (${n} days)`,
    moved: (date, due) => `Calendar date: ${date}. Moves to ${due} (non-working day).`,
    start: (s, sd, t, td) => `Start by ${s} (${sd} days before the deadline), at the latest ${t} (${td} days).`,
    dueLine: (due) => `Due: ${due}.`,
    tax: "Taxes",
    social: "Contributions",
    official: "Official NRA text (in Bulgarian):",
  },
}

const escape = (s: string): string =>
  s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n")

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
  readonly lang: Lang
}

const allDay = (
  lines: Array<string>,
  e: { uid: string; stamp: string; date: string; summary: string; description: string; categories: string; url: string }
) => {
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
    "X-WR-TIMEZONE:Europe/Sofia",
  ]
  const t = TEXT[options.lang]
  const { safeDays, tightDays } = options.buffers
  for (const d of deadlines) {
    const moved = d.due !== d.date ? `${t.moved(d.date, d.due)}\n` : ""
    const start = `${t.start(d.startSafe, safeDays, d.startTight, tightDays)}\n`
    const original =
      d.group +
      "\n\n" +
      d.items.map((i) => `• ${i.text}`).join("\n") +
      (d.notes.length > 0 ? "\n\n" + d.notes.join("\n") : "")
    // Bulgarian shows the NRA text as is. Other languages add the translated summaries before the original.
    const labels = d.items.flatMap((i) => actionLabel(i.text, options.lang) ?? [])
    const body =
      options.lang === "bg"
        ? `${moved}${start}\n${original}`
        : `${moved}${start}` +
          (labels.length > 0 ? `\n${labels.map((l) => `• ${l}`).join("\n")}\n` : "") +
          `\n${t.official}\n${original}`
    const title =
      options.lang === "bg"
        ? truncate(`${d.category}: ${d.items[0]?.text ?? d.group}`, 90)
        : truncate(
            `${d.source === "social" ? t.social : (categoryName(d.category, options.lang) ?? d.category)}: ${labels.join(" · ") || d.items[0]?.text || d.group}`,
            90
          )
    const categories = `${escape(d.source === "tax" ? t.tax : t.social)},${escape(d.category)}`
    allDay(lines, {
      uid: d.id,
      stamp,
      date: d.due,
      summary: `${t.due} · ${title}`,
      description: body,
      categories,
      url: options.sourceUrl,
    })
    if (options.startEvents) {
      allDay(lines, {
        uid: `${d.id}-safe`,
        stamp,
        date: d.startSafe,
        summary: `${t.safe(safeDays)} · ${title}`,
        description: `${t.dueLine(d.due)}\n${body}`,
        categories,
        url: options.sourceUrl,
      })
      allDay(lines, {
        uid: `${d.id}-tight`,
        stamp,
        date: d.startTight,
        summary: `${t.tight(tightDays)} · ${title}`,
        description: `${t.dueLine(d.due)}\n${body}`,
        categories,
        url: options.sourceUrl,
      })
    }
  }
  lines.push("END:VCALENDAR")
  return lines.map(fold).join("\r\n") + "\r\n"
}

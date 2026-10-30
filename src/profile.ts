import type { Deadline, Tag } from "./domain.ts"

export type Activity = "freelancer" | "trader"

export interface Profile {
  readonly activity: Activity
  readonly vat: boolean
  readonly property: boolean
}

export const defaultProfile: Profile = { activity: "freelancer", vat: false, property: false }

export const profileTags = (p: Profile): ReadonlyArray<Tag> => [
  p.activity,
  ...(p.vat ? ["vat" as const] : []),
  ...(p.property ? ["property" as const] : [])
]

/** Keeps only the items with one of `tags`. Returns undefined when no item is left. */
export const narrow = (d: Deadline, tags: ReadonlyArray<Tag>): Deadline | undefined => {
  const items = d.items.filter((i) => i.tags.some((t) => tags.includes(t)))
  return items.length === 0 ? undefined : { ...d, items }
}

export const narrowAll = (list: ReadonlyArray<Deadline>, tags: ReadonlyArray<Tag>): Array<Deadline> =>
  list.flatMap((d) => narrow(d, tags) ?? [])

/** Joins the social-insurance deadlines of one day into one card. */
export const mergeSocial = (list: ReadonlyArray<Deadline>): Array<Deadline> => {
  const out: Array<Deadline> = []
  const slot = new Map<string, number>()
  for (const d of list) {
    if (d.source !== "social") {
      out.push(d)
      continue
    }
    const i = slot.get(d.due)
    if (i === undefined) {
      slot.set(d.due, out.length)
      out.push({ ...d, category: "Осигуровки", group: "Осигурителен календар" })
    } else {
      const prev = out[i]!
      out[i] = { ...prev, items: [...prev.items, ...d.items], notes: [...prev.notes, ...d.notes] }
    }
  }
  return out
}

/** Calendar feeds written by the build. `tags` undefined means every deadline. */
export const FEEDS: ReadonlyArray<{ readonly file: string; readonly title: string; readonly tags?: ReadonlyArray<Tag> }> = [
  { file: "freelancer.ics", title: "Самоосигуряващи се: свободна професия", tags: ["freelancer"] },
  { file: "sole-trader.ics", title: "Самоосигуряващи се: едноличен търговец (ЕТ)", tags: ["trader"] },
  { file: "vat.ics", title: "Регистрирани по ДДС", tags: ["vat"] },
  { file: "property.ics", title: "Данък върху недвижими имоти", tags: ["property"] },
  { file: "calendar.ics", title: "Всички срокове на НАП" }
]

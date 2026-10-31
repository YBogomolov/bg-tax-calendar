import type { Deadline, Tag } from "./domain.ts"
import type { Translated } from "./i18n.ts"
import { SOCIAL_CATEGORY } from "./labels.ts"

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
  ...(p.property ? ["property" as const] : []),
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
      out.push({ ...d, category: SOCIAL_CATEGORY, group: "Осигурителен календар" })
    } else {
      const prev = out[i]!
      out[i] = { ...prev, items: [...prev.items, ...d.items], notes: [...prev.notes, ...d.notes] }
    }
  }
  return out
}

/** Calendar feeds written by the build, one file per language. `tags` undefined means every deadline. */
export const FEEDS: ReadonlyArray<{
  readonly id: string
  readonly title: Translated
  readonly tags?: ReadonlyArray<Tag>
}> = [
  {
    id: "freelancer",
    title: {
      bg: "Самоосигуряващи се: свободна професия",
      ru: "Самозанятые: свободная профессия",
      uk: "Самозайняті: вільна професія",
      en: "Self-employed: freelancer",
    },
    tags: ["freelancer"],
  },
  {
    id: "sole-trader",
    title: {
      bg: "Самоосигуряващи се: едноличен търговец (ЕТ)",
      ru: "Самозанятые: единоличный торговец (ЕТ)",
      uk: "Самозайняті: одноосібний торговець (ЕТ)",
      en: "Self-employed: sole trader (ET)",
    },
    tags: ["trader"],
  },
  {
    id: "vat",
    title: {
      bg: "Регистрирани по ДДС",
      ru: "Зарегистрированные по НДС",
      uk: "Зареєстровані платники ПДВ",
      en: "VAT-registered",
    },
    tags: ["vat"],
  },
  {
    id: "property",
    title: {
      bg: "Данък върху недвижими имоти",
      ru: "Налог на недвижимость",
      uk: "Податок на нерухомість",
      en: "Property tax",
    },
    tags: ["property"],
  },
  {
    id: "calendar",
    title: { bg: "Всички срокове на НАП", ru: "Все сроки НАП", uk: "Усі терміни НАП", en: "All NRA deadlines" },
  },
]

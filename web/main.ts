import { Data, Effect } from "effect"
import type { CalendarIndex, CalendarYear, Deadline, Feed, SourceKind } from "../src/domain.ts"
import { type Activity, defaultProfile, mergeSocial, narrowAll, type Profile, profileTags } from "../src/profile.ts"
import { actionLabel, CATEGORY_NAMES, CATEGORY_TITLES } from "./labels.ts"

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

class LoadError extends Data.TaggedError("LoadError")<{
  readonly url: string
  readonly message: string
}> {}

/**
 * Fetches a JSON file written by the build. The build validates the data with
 * Schema, so the browser does not ship the Schema module.
 */
const fetchJson = <A>(url: string) =>
  Effect.tryPromise({
    try: async () => {
      const res = await fetch(url, { cache: "no-cache" })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return (await res.json()) as A
    },
    catch: (e) => new LoadError({ url, message: String(e) }),
  })

const SOURCE_NAMES: Record<SourceKind, string> = { tax: "Данъчен календар", social: "Осигурителен календар" }

// ---------------------------------------------------------------------------
// Dates (ISO strings, computed in UTC so that the host time zone has no effect)
// ---------------------------------------------------------------------------

const DAY = 86_400_000
const parseIso = (iso: string) => new Date(`${iso}T00:00:00Z`)
const toIso = (d: Date) => d.toISOString().slice(0, 10)
const addDays = (iso: string, n: number) => toIso(new Date(parseIso(iso).getTime() + n * DAY))
const diffDays = (a: string, b: string) => Math.round((parseIso(b).getTime() - parseIso(a).getTime()) / DAY)

/** Today in Sofia, whatever the time zone of the device. */
const todayInSofia = (): string => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Sofia",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date())
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ""
  return `${get("year")}-${get("month")}-${get("day")}`
}

const fmtLong = new Intl.DateTimeFormat("bg-BG", { weekday: "short", day: "numeric", month: "long", timeZone: "UTC" })
const fmtShort = new Intl.DateTimeFormat("bg-BG", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })
const fmtMonth = new Intl.DateTimeFormat("bg-BG", { month: "long", timeZone: "UTC" })
const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"]
const fmtDate = new Intl.DateTimeFormat("bg-BG", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** Bulgarian counted forms: 1 срок, 2 срока; 1 ден, 2 дни. */
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

const relative = (today: string, iso: string): string => {
  const n = diffDays(today, iso)
  if (n === 0) return "днес"
  if (n === 1) return "утре"
  if (n === -1) return "вчера"
  return n > 0 ? `след ${plural(n, "ден", "дни")}` : `преди ${plural(-n, "ден", "дни")}`
}

const weeks = (days: number) => (days % 7 === 0 ? plural(days / 7, "седмица", "седмици") : plural(days, "ден", "дни"))

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

type View = "self" | "all"
type SourceFilter = "all" | SourceKind

interface Prefs {
  view: View
  profile: Profile
  source: SourceFilter
  hidden: Set<string>
}

interface State extends Prefs {
  years: ReadonlyArray<number>
  feeds: ReadonlyArray<Feed>
  data: CalendarYear
  today: string
  selected: string | null
  horizon: number
}

const STORAGE_KEY = "bg-tax-calendar:prefs"
const loadPrefs = (): Prefs => {
  const fallback: Prefs = { view: "self", profile: defaultProfile, source: "all", hidden: new Set() }
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Record<string, unknown>
    const p = (raw["profile"] ?? {}) as Record<string, unknown>
    return {
      view: raw["view"] === "all" ? "all" : "self",
      profile: {
        activity: p["activity"] === "trader" ? "trader" : "freelancer",
        vat: p["vat"] === true,
        property: p["property"] === true,
      },
      source: raw["source"] === "tax" || raw["source"] === "social" ? raw["source"] : "all",
      hidden: new Set(
        Array.isArray(raw["hidden"]) ? raw["hidden"].filter((x): x is string => typeof x === "string") : []
      ),
    }
  } catch {
    return fallback
  }
}
const savePrefs = (s: State) => {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ view: s.view, profile: s.profile, source: s.source, hidden: [...s.hidden] })
    )
  } catch {
    // Storage can be unavailable (private mode); preferences then reset on reload.
  }
}

const visible = (s: State): ReadonlyArray<Deadline> =>
  s.view === "self"
    ? mergeSocial(narrowAll(s.data.deadlines, profileTags(s.profile)))
    : s.data.deadlines.filter((d) => (s.source === "all" || d.source === s.source) && !s.hidden.has(d.category))

type Status = "upcoming" | "safe" | "tight" | "due" | "past"
const statusOf = (d: Deadline, today: string): Status => {
  if (today > d.due) return "past"
  if (today === d.due) return "due"
  if (today >= d.startTight) return "tight"
  if (today >= d.startSafe) return "safe"
  return "upcoming"
}
const STATUS_LABEL: Record<Status, string> = {
  upcoming: "",
  safe: "Започнете сега",
  tight: "Спешно: започнете днес",
  due: "Срокът е днес",
  past: "Изтекъл",
}

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------

type Child = Node | string | null | undefined | false
const h = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | boolean | undefined> = {},
  ...children: Array<Child | ReadonlyArray<Child>>
): HTMLElementTagNameMap[K] => {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue
    el.setAttribute(k, v === true ? "" : v)
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue
    el.append(c)
  }
  return el
}
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

/** Wires a segmented control: `data-value` buttons inside the element with `id`. */
const segmented = (id: string, value: string, onChange: (v: string) => void) => {
  for (const btn of $(id).querySelectorAll<HTMLButtonElement>("button")) {
    btn.setAttribute("aria-checked", String(btn.dataset["value"] === value))
    btn.onclick = () => onChange(btn.dataset["value"]!)
  }
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

const renderFilters = (s: State, rerender: () => void) => {
  const update = (f: () => void) => {
    f()
    s.selected = null
    savePrefs(s)
    rerender()
  }
  segmented("view", s.view, (v) => update(() => (s.view = v as View)))
  segmented("activity", s.profile.activity, (v) =>
    update(() => (s.profile = { ...s.profile, activity: v as Activity }))
  )
  segmented("source", s.source, (v) => update(() => (s.source = v as SourceFilter)))
  $("self-filters").hidden = s.view !== "self"
  $("all-filters").hidden = s.view !== "all"

  const vat = $<HTMLInputElement>("opt-vat")
  vat.checked = s.profile.vat
  vat.onchange = () => update(() => (s.profile = { ...s.profile, vat: vat.checked }))
  const property = $<HTMLInputElement>("opt-property")
  property.checked = s.profile.property
  property.onchange = () => update(() => (s.profile = { ...s.profile, property: property.checked }))

  if (s.view !== "all") return
  const counts = new Map<string, { source: SourceKind; n: number }>()
  for (const d of s.data.deadlines) {
    if (s.source !== "all" && d.source !== s.source) continue
    const c = counts.get(d.category) ?? { source: d.source, n: 0 }
    c.n++
    counts.set(d.category, c)
  }
  const chips = [...counts.entries()]
    .sort((a, b) => b[1].source.localeCompare(a[1].source) || b[1].n - a[1].n)
    .map(([cat, { source, n }]) => {
      const chip = h(
        "button",
        {
          type: "button",
          class: "chip",
          "aria-pressed": String(!s.hidden.has(cat)),
          title: CATEGORY_TITLES[cat] ?? CATEGORY_NAMES[cat] ?? cat,
        },
        h("i", { class: `dot ${source}` }),
        `${cat} `,
        h("span", { class: "muted" }, String(n))
      )
      chip.onclick = () =>
        update(() => {
          if (s.hidden.has(cat)) s.hidden.delete(cat)
          else s.hidden.add(cat)
        })
      return chip
    })
  $("chips").replaceChildren(...chips)
}

const renderHeader = (s: State) => {
  $("year-label").textContent = String(s.data.year)
  const { safeDays, tightDays } = s.data.buffers
  if (s.view === "self") {
    const parts = [s.profile.activity === "freelancer" ? "свободна професия" : "едноличен търговец (ЕТ)"]
    if (s.profile.vat) parts.push("регистрация по ДДС")
    if (s.profile.property) parts.push("собственик на имот")
    $("subtitle").textContent =
      `Самоосигуряващо се лице: ${parts.join(", ")}. Започнете ${weeks(safeDays)} преди всеки срок, най-късно ${weeks(tightDays)} преди него.`
  } else {
    $("subtitle").textContent = "Всички срокове от официалните календари на Националната агенция за приходите (НАП)"
  }

  const recommended = new Set(
    s.view === "self"
      ? [
          s.profile.activity === "freelancer" ? "freelancer.ics" : "sole-trader.ics",
          ...(s.profile.vat ? ["vat.ics"] : []),
          ...(s.profile.property ? ["property.ics"] : []),
        ]
      : ["calendar.ics"]
  )
  const base = new URL(".", location.href)
  $("feeds").replaceChildren(
    h(
      "p",
      { class: "muted" },
      "Абонирайте се в Apple Calendar или Google Calendar. Календарите за самоосигуряващи се съдържат и дните за начало."
    ),
    ...s.feeds.map((f) => {
      const url = new URL(f.file, base)
      return h(
        "div",
        { class: recommended.has(f.file) ? "feed recommended" : "feed" },
        h("span", {}, f.title),
        h("a", { href: `webcal://${url.host}${url.pathname}` }, "Абониране"),
        h("a", { href: f.file, download: true }, "Изтегляне")
      )
    })
  )
}

const renderLegend = (s: State) => {
  const { safeDays, tightDays } = s.data.buffers
  $("legend").replaceChildren(
    h("span", {}, h("i", { class: "dot tax" }), "Данъчен срок"),
    h("span", {}, h("i", { class: "dot social" }), "Осигурителен срок"),
    ...(s.view === "self"
      ? [
          h("span", {}, h("i", { class: "mark safe" }), `Начало (${weeks(safeDays)} преди срока)`),
          h("span", {}, h("i", { class: "mark tight" }), `Най-късно начало (${weeks(tightDays)} преди срока)`),
        ]
      : []),
    h("span", {}, h("i", { class: "sw holiday" }), "Официален празник"),
    h("span", {}, h("i", { class: "sw today" }), "Днес")
  )
}

interface DayInfo {
  due: Array<Deadline>
  safe: Array<Deadline>
  tight: Array<Deadline>
}

/** Deadlines by due day and, in the self-employed view, by start days. */
const dayIndex = (s: State, list: ReadonlyArray<Deadline>): Map<string, DayInfo> => {
  const map = new Map<string, DayInfo>()
  const get = (iso: string) => {
    let info = map.get(iso)
    if (info === undefined) {
      info = { due: [], safe: [], tight: [] }
      map.set(iso, info)
    }
    return info
  }
  for (const d of list) {
    get(d.due).due.push(d)
    if (s.view === "self") {
      get(d.startSafe).safe.push(d)
      get(d.startTight).tight.push(d)
    }
  }
  return map
}

const renderMonths = (s: State, rerender: () => void) => {
  const year = s.data.year
  const holidays = new Set(s.data.holidays)
  const list = visible(s)
  const days = dayIndex(s, list)
  const countByMonth = new Map<number, number>()
  for (const d of list) {
    const m = Number(d.due.slice(5, 7))
    countByMonth.set(m, (countByMonth.get(m) ?? 0) + 1)
  }

  const months = Array.from({ length: 12 }, (_, i) => {
    const first = `${year}-${String(i + 1).padStart(2, "0")}-01`
    const offset = (parseIso(first).getUTCDay() + 6) % 7
    const length = diffDays(first, toIso(new Date(Date.UTC(year, i + 1, 1))))
    const cells: Array<HTMLElement> = WEEKDAYS.map((w) => h("span", { class: "wd" }, w))
    for (let k = 0; k < offset; k++) cells.push(h("span"))
    for (let day = 1; day <= length; day++) {
      const iso = addDays(first, day - 1)
      const weekday = (offset + day - 1) % 7
      const info = days.get(iso) ?? { due: [], safe: [], tight: [] }
      const has = info.due.length + info.safe.length + info.tight.length > 0
      const classes = ["day"]
      if (weekday >= 5) classes.push("weekend")
      if (holidays.has(iso)) classes.push("holiday")
      if (iso < s.today) classes.push("past")
      if (iso === s.today) classes.push("today")
      if (has) classes.push("has")
      if (info.due.length > 0) classes.push("due")
      if (iso === s.selected) classes.push("selected")
      const label = [
        fmtLong.format(parseIso(iso)),
        holidays.has(iso) && "официален празник",
        info.due.length > 0 && plural(info.due.length, "срок", "срока"),
        info.safe.length > 0 && `начало: ${info.safe.length}`,
        info.tight.length > 0 && `най-късно начало: ${info.tight.length}`,
      ]
        .filter(Boolean)
        .join(", ")
      const sources = new Set(info.due.map((d) => d.source))
      const cell = h(
        "button",
        {
          type: "button",
          class: classes.join(" "),
          "aria-label": label,
          title: label,
          tabindex: has ? undefined : "-1",
        },
        String(day),
        h(
          "span",
          { class: "dots" },
          sources.has("tax") && h("i", { class: "dot tax" }),
          sources.has("social") && h("i", { class: "dot social" }),
          info.safe.length > 0 && h("i", { class: "mark safe" }),
          info.tight.length > 0 && h("i", { class: "mark tight" })
        )
      )
      if (has) {
        cell.onclick = () => {
          s.selected = s.selected === iso ? null : iso
          rerender()
        }
      }
      cells.push(cell)
    }
    const current = s.today.slice(0, 7) === first.slice(0, 7)
    const count = countByMonth.get(i + 1) ?? 0
    return h(
      "article",
      { class: current ? "month current" : "month" },
      h(
        "h3",
        {},
        capitalise(fmtMonth.format(parseIso(first))),
        h("small", {}, count > 0 ? plural(count, "срок", "срока") : "")
      ),
      h("div", { class: "grid" }, cells)
    )
  })
  $("months").replaceChildren(...months)
}

const card = (s: State, d: Deadline) => {
  const name = CATEGORY_NAMES[d.category]
  const status = statusOf(d, s.today)
  const labels = d.items.map((i) => actionLabel(i.text))
  const preview = labels.filter((l) => l !== undefined).join(" · ") || d.items[0]?.text || d.group
  const { safeDays, tightDays } = s.data.buffers
  return h(
    "details",
    { class: `card ${d.source} status-${status}` },
    h(
      "summary",
      {},
      h(
        "div",
        { class: "card-top" },
        h("span", { class: "badge", title: SOURCE_NAMES[d.source] }, d.category),
        name !== undefined && h("span", { class: "card-name", title: CATEGORY_TITLES[d.category] }, name),
        status !== "upcoming" && status !== "past" && h("span", { class: `pill ${status}` }, STATUS_LABEL[status])
      ),
      h("p", { class: "preview" }, preview),
      h(
        "p",
        { class: "timeline" },
        h(
          "span",
          { title: `${weeks(safeDays)} преди срока` },
          h("i", { class: "mark safe" }),
          `Начало ${fmtShort.format(parseIso(d.startSafe))}`
        ),
        h(
          "span",
          { title: `${weeks(tightDays)} преди срока` },
          h("i", { class: "mark tight" }),
          `Най-късно ${fmtShort.format(parseIso(d.startTight))}`
        ),
        h("span", {}, `Срок ${fmtShort.format(parseIso(d.due))}`)
      )
    ),
    d.group !== d.category && h("p", { class: "group" }, d.group),
    h(
      "ul",
      {},
      d.items.map((i, n) =>
        h(
          "li",
          {},
          labels[n] !== undefined && h("strong", {}, labels[n]),
          h("span", { class: labels[n] !== undefined ? "bg-text" : "" }, i.text)
        )
      )
    ),
    d.notes.map((n) => h("p", { class: "note" }, n)),
    d.date !== d.due &&
      h(
        "p",
        { class: "note moved" },
        `Датата по календара е ${fmtShort.format(parseIso(d.date))} — неприсъствен ден, затова срокът изтича в първия следващ работен ден.`
      )
  )
}

const section = (title: string, hint: string | undefined, nodes: ReadonlyArray<Node>) =>
  h(
    "section",
    { class: "date-group" },
    h("div", { class: "date-head" }, h("strong", {}, title), hint !== undefined && h("span", { class: "rel" }, hint)),
    nodes
  )

const groupBy = (list: ReadonlyArray<Deadline>, key: (d: Deadline) => string) => {
  const map = new Map<string, Array<Deadline>>()
  for (const d of list) {
    const k = key(d)
    const arr = map.get(k) ?? []
    arr.push(d)
    map.set(k, arr)
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b))
}

const renderPanel = (s: State, rerender: () => void) => {
  const body = $("panel-body")
  const back = $("panel-back")
  const list = visible(s)
  const { safeDays, tightDays } = s.data.buffers

  if (s.selected !== null) {
    const day = s.selected
    $("panel-title").textContent = fmtLong.format(parseIso(day))
    back.hidden = false
    back.onclick = () => {
      s.selected = null
      rerender()
    }
    const info = dayIndex(s, list).get(day) ?? { due: [], safe: [], tight: [] }
    const nodes: Array<Node> = [h("p", { class: "rel" }, relative(s.today, day))]
    if (info.due.length > 0)
      nodes.push(
        section(
          "Срокове на този ден",
          undefined,
          info.due.map((d) => card(s, d))
        )
      )
    if (info.safe.length > 0)
      nodes.push(
        section(
          `Начало (${weeks(safeDays)} преди срока)`,
          undefined,
          info.safe.map((d) => card(s, d))
        )
      )
    if (info.tight.length > 0)
      nodes.push(
        section(
          `Най-късно начало (${weeks(tightDays)} преди срока)`,
          undefined,
          info.tight.map((d) => card(s, d))
        )
      )
    if (nodes.length === 1) nodes.push(h("p", { class: "empty" }, "Няма нищо за този ден."))
    body.replaceChildren(...nodes)
    return
  }

  $("panel-title").textContent = "Предстоящи"
  back.hidden = true
  const nodes: Array<Node> = []

  // Deadlines whose safe start day has come: work on them now, most urgent first.
  const active = list
    .filter((d) => d.startSafe <= s.today && d.due >= s.today)
    .sort((a, b) => a.due.localeCompare(b.due))
  if (active.length > 0)
    nodes.push(
      section(
        "За работа сега",
        `${active.length} активни`,
        active.map((d) => card(s, d))
      )
    )

  // Later deadlines, grouped by the day to start.
  const later = groupBy(
    list.filter((d) => d.startSafe > s.today),
    (d) => d.startSafe
  )
  const limit = addDays(s.today, s.horizon)
  const shown = later.filter(([iso], i) => iso <= limit || i < 4)
  for (const [iso, items] of shown) {
    nodes.push(
      section(
        `Начало ${fmtLong.format(parseIso(iso))}`,
        relative(s.today, iso),
        items.map((d) => card(s, d))
      )
    )
  }
  if (shown.length < later.length) {
    const more = h("button", { type: "button", class: "btn more" }, "Покажи още")
    more.onclick = () => {
      s.horizon += 60
      rerender()
    }
    nodes.push(more)
  }

  if (nodes.length === 0) {
    const yearOver = s.today > `${s.data.year}-12-31`
    nodes.push(
      h(
        "p",
        { class: "empty" },
        yearOver
          ? `Няма повече срокове в календара за ${s.data.year} г. НАП обикновено публикува следващия календар през януари. Сайтът го изтегля автоматично в началото на всеки месец.`
          : "Няма предстоящи срокове за избраните филтри."
      )
    )
  }
  body.replaceChildren(...nodes)
}

const renderFoot = (s: State) => {
  const generated = new Date(s.data.generatedAt).toLocaleString("bg-BG", { timeZone: "Europe/Sofia" })
  $("foot").replaceChildren(
    h(
      "p",
      {},
      "Източник: ",
      ...s.data.sources.flatMap((src, i) => [
        i > 0 ? ", " : "",
        h("a", { href: src.page, rel: "noopener", target: "_blank" }, src.title),
        ` (изтеглен на ${fmtDate.format(parseIso(src.retrieved))}, проверен на ${fmtDate.format(parseIso(src.checked))})`,
      ]),
      `. Генериран на ${generated}.`
    ),
    h(
      "p",
      {},
      "Срок, който изтича в неприсъствен ден, се премества в първия следващ работен ден. Денят за начало се премества в предходния работен ден. ",
      "Изгледът за самоосигуряващи се показва задълженията на самоосигуряващото се лице за собствените му доходи. Задълженията като работодател или платец на доходи не са включени. ",
      "Винаги проверявайте документите на НАП, преди да подадете декларация. Тази страница не е правна консултация."
    )
  )
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

const showError = (message: string) => {
  $("panel-body").replaceChildren(h("p", { class: "empty" }, `Календарът не може да се зареди: ${message}`))
}

const pickYear = (years: ReadonlyArray<number>, today: string): number | undefined => {
  const current = Number(today.slice(0, 4))
  if (years.includes(current)) return current
  const past = years.filter((y) => y < current)
  return past.length > 0 ? Math.max(...past) : years[0]
}

const main = Effect.gen(function* () {
  const today = todayInSofia()
  const index = yield* fetchJson<CalendarIndex>("data/index.json")
  const year = pickYear(index.years, today)
  if (year === undefined) return yield* new LoadError({ url: "data/index.json", message: "Няма налични години" })
  const data = yield* fetchJson<CalendarYear>(`data/${year}.json`)
  const state: State = {
    ...loadPrefs(),
    years: index.years,
    feeds: index.feeds,
    data,
    today,
    selected: null,
    horizon: 30,
  }

  const rerender = () => {
    renderHeader(state)
    renderFilters(state, rerender)
    renderLegend(state)
    renderMonths(state, rerender)
    renderPanel(state, rerender)
    renderFoot(state)
  }

  const select = $<HTMLSelectElement>("year-select")
  if (index.years.length > 1) {
    select.hidden = false
    select.replaceChildren(
      ...index.years.map((y) => h("option", { value: String(y), selected: y === year }, String(y)))
    )
    select.onchange = () => {
      Effect.runFork(
        fetchJson<CalendarYear>(`data/${select.value}.json`).pipe(
          Effect.tap((next) =>
            Effect.sync(() => {
              state.data = next
              state.selected = null
              rerender()
            })
          ),
          Effect.catch((e) => Effect.sync(() => showError(e.message)))
        )
      )
    }
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && state.selected !== null) {
      state.selected = null
      rerender()
    }
  })

  rerender()
})

Effect.runFork(main.pipe(Effect.catch((e) => Effect.sync(() => showError(e.message)))))

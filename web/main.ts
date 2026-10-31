import { Data, Effect } from "effect"
import type { CalendarIndex, CalendarYear, Deadline, Feed, SourceKind } from "../src/domain.ts"
import { DEFAULT_LANG, isLang, LANG_INFO, LANGS, type Lang, plural } from "../src/i18n.ts"
import { actionLabel, CATEGORY_TITLES, categoryBadge, categoryName } from "../src/labels.ts"
import { type Activity, defaultProfile, mergeSocial, narrowAll, type Profile, profileTags } from "../src/profile.ts"
import { type HtmlKey, type Messages, MESSAGES } from "./messages.ts"

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

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** Date formats and counted forms for one interface language. */
const localise = (lang: Lang) => {
  const locale = LANG_INFO[lang].locale
  const m = MESSAGES[lang]
  const long = new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "long", timeZone: "UTC" })
  const short = new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })
  const month = new Intl.DateTimeFormat(locale, { month: "long", timeZone: "UTC" })
  const date = new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
  const rel = new Intl.RelativeTimeFormat(locale, { numeric: "auto" })
  return {
    lang,
    locale,
    m,
    long: (iso: string) => long.format(parseIso(iso)),
    short: (iso: string) => short.format(parseIso(iso)),
    month: (iso: string) => capitalise(month.format(parseIso(iso))),
    date: (iso: string) => date.format(parseIso(iso)),
    relative: (today: string, iso: string) => rel.format(diffDays(today, iso), "day"),
    deadlines: (n: number) => plural(lang, n, m.deadlines),
    /** "2 weeks", or days when the buffer is not whole weeks. */
    weeks: (days: number) =>
      days % 7 === 0 ? plural(lang, days / 7, m.weeksBefore) : plural(lang, days, m.daysBefore),
  }
}
type Localised = ReturnType<typeof localise>

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

type View = "self" | "all"
type SourceFilter = "all" | SourceKind

interface Prefs {
  lang: Lang
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
  t: Localised
}

const STORAGE_KEY = "bg-tax-calendar:prefs"

/** Language from `?lang=`, then the browser languages, then Bulgarian. */
const detectLang = (): Lang => {
  const param = new URLSearchParams(location.search).get("lang")
  if (isLang(param)) return param
  for (const tag of navigator.languages ?? []) {
    const primary = tag.toLowerCase().split("-")[0]
    if (isLang(primary)) return primary
  }
  return DEFAULT_LANG
}

const loadPrefs = (): Prefs => {
  const fallback: Prefs = {
    lang: detectLang(),
    view: "self",
    profile: defaultProfile,
    source: "all",
    hidden: new Set(),
  }
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Record<string, unknown>
    const p = (raw["profile"] ?? {}) as Record<string, unknown>
    const param = new URLSearchParams(location.search).get("lang")
    return {
      lang: isLang(param) ? param : isLang(raw["lang"]) ? raw["lang"] : fallback.lang,
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
      JSON.stringify({ lang: s.lang, view: s.view, profile: s.profile, source: s.source, hidden: [...s.hidden] })
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

/** Applies the static texts of `index.html` in the selected language. */
const applyHtml = (lang: Lang, m: Messages) => {
  document.documentElement.lang = lang
  document.title = m.html.title
  document.querySelector('meta[name="description"]')?.setAttribute("content", m.html.description)
  const text = (key: string | undefined) => (key !== undefined && key in m.html ? m.html[key as HtmlKey] : undefined)
  for (const el of document.querySelectorAll<HTMLElement>("[data-i18n]")) {
    const v = text(el.dataset["i18n"])
    if (v !== undefined) el.textContent = v
  }
  for (const el of document.querySelectorAll<HTMLElement>("[data-i18n-title]")) {
    const v = text(el.dataset["i18nTitle"])
    if (v !== undefined) el.title = v
  }
  for (const el of document.querySelectorAll<HTMLElement>("[data-i18n-aria-label]")) {
    const v = text(el.dataset["i18nAriaLabel"])
    if (v !== undefined) el.setAttribute("aria-label", v)
  }
}

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
          title: [categoryName(cat, s.lang), CATEGORY_TITLES[cat]].filter(Boolean).join(" — ") || cat,
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
  const { m, weeks } = s.t
  $("year-label").textContent = String(s.data.year)
  const { safeDays, tightDays } = s.data.buffers
  if (s.view === "self") {
    const parts = [s.profile.activity === "freelancer" ? m.profile.freelancer : m.profile.trader]
    if (s.profile.vat) parts.push(m.profile.vat)
    if (s.profile.property) parts.push(m.profile.property)
    $("subtitle").textContent = m.subtitleSelf(parts.join(", "), weeks(safeDays), weeks(tightDays))
  } else {
    $("subtitle").textContent = m.subtitleAll
  }

  const recommended = new Set(
    s.view === "self"
      ? [
          s.profile.activity === "freelancer" ? "freelancer" : "sole-trader",
          ...(s.profile.vat ? ["vat"] : []),
          ...(s.profile.property ? ["property"] : []),
        ]
      : ["calendar"]
  )
  const base = new URL(".", location.href)
  $("feeds").replaceChildren(
    h("p", { class: "muted" }, m.feedsHint),
    ...s.feeds
      .filter((f) => f.lang === s.lang)
      .map((f) => {
        const url = new URL(f.file, base)
        return h(
          "div",
          { class: recommended.has(f.id) ? "feed recommended" : "feed" },
          h("span", {}, f.title),
          h("a", { href: `webcal://${url.host}${url.pathname}` }, m.subscribe),
          h("a", { href: f.file, download: true }, m.download)
        )
      })
  )
}

const renderLegend = (s: State) => {
  const { m, weeks } = s.t
  const { safeDays, tightDays } = s.data.buffers
  $("legend").replaceChildren(
    h("span", {}, h("i", { class: "dot tax" }), m.legend.tax),
    h("span", {}, h("i", { class: "dot social" }), m.legend.social),
    ...(s.view === "self"
      ? [
          h("span", {}, h("i", { class: "mark safe" }), m.legend.start(weeks(safeDays))),
          h("span", {}, h("i", { class: "mark tight" }), m.legend.latestStart(weeks(tightDays))),
        ]
      : []),
    h("span", {}, h("i", { class: "sw holiday" }), m.legend.holiday),
    h("span", {}, h("i", { class: "sw today" }), m.legend.today)
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
  const { m } = s.t
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
    const cells: Array<HTMLElement> = m.weekdays.map((w) => h("span", { class: "wd" }, w))
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
        s.t.long(iso),
        holidays.has(iso) && m.day.holiday,
        info.due.length > 0 && s.t.deadlines(info.due.length),
        info.safe.length > 0 && m.day.start(info.safe.length),
        info.tight.length > 0 && m.day.latestStart(info.tight.length),
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
      h("h3", {}, s.t.month(first), h("small", {}, count > 0 ? s.t.deadlines(count) : "")),
      h("div", { class: "grid" }, cells)
    )
  })
  $("months").replaceChildren(...months)
}

const card = (s: State, d: Deadline) => {
  const { m, short, weeks } = s.t
  const name = categoryName(d.category, s.lang)
  const status = statusOf(d, s.today)
  const labels = d.items.map((i) => actionLabel(i.text, s.lang))
  const summary = labels.filter((l) => l !== undefined).join(" · ")
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
        h(
          "span",
          {
            class: "badge",
            title: m.sourceNames[d.source],
            lang: d.category === categoryBadge(d.category, s.lang) ? "bg" : undefined,
          },
          categoryBadge(d.category, s.lang)
        ),
        name !== undefined && h("span", { class: "card-name", title: CATEGORY_TITLES[d.category] }, name),
        status !== "upcoming" && status !== "past" && h("span", { class: `pill ${status}` }, m.status[status])
      ),
      summary !== ""
        ? h("p", { class: "preview" }, summary)
        : h("p", { class: "preview", lang: "bg" }, d.items[0]?.text ?? d.group),
      h(
        "p",
        { class: "timeline" },
        h(
          "span",
          { title: m.card.before(weeks(safeDays)) },
          h("i", { class: "mark safe" }),
          `${m.card.start} ${short(d.startSafe)}`
        ),
        h(
          "span",
          { title: m.card.before(weeks(tightDays)) },
          h("i", { class: "mark tight" }),
          `${m.card.latest} ${short(d.startTight)}`
        ),
        h("span", {}, `${m.card.due} ${short(d.due)}`)
      )
    ),
    m.card.official !== "" && h("p", { class: "official" }, m.card.official),
    d.group !== d.category && h("p", { class: "group", lang: "bg" }, d.group),
    h(
      "ul",
      {},
      d.items.map((i, n) =>
        h(
          "li",
          {},
          labels[n] !== undefined && h("strong", {}, labels[n]),
          h("span", { class: labels[n] !== undefined ? "bg-text" : "", lang: "bg" }, i.text)
        )
      )
    ),
    d.notes.map((n) => h("p", { class: "note", lang: "bg" }, n)),
    d.date !== d.due && h("p", { class: "note moved" }, m.card.moved(short(d.date)))
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
  const { m, long, relative, weeks } = s.t
  const body = $("panel-body")
  const back = $("panel-back")
  const list = visible(s)
  const { safeDays, tightDays } = s.data.buffers

  if (s.selected !== null) {
    const day = s.selected
    $("panel-title").textContent = long(day)
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
          m.panel.onDay,
          undefined,
          info.due.map((d) => card(s, d))
        )
      )
    if (info.safe.length > 0)
      nodes.push(
        section(
          m.legend.start(weeks(safeDays)),
          undefined,
          info.safe.map((d) => card(s, d))
        )
      )
    if (info.tight.length > 0)
      nodes.push(
        section(
          m.legend.latestStart(weeks(tightDays)),
          undefined,
          info.tight.map((d) => card(s, d))
        )
      )
    if (nodes.length === 1) nodes.push(h("p", { class: "empty" }, m.panel.nothing))
    body.replaceChildren(...nodes)
    return
  }

  $("panel-title").textContent = m.html.upcoming
  back.hidden = true
  const nodes: Array<Node> = []

  // Deadlines whose safe start day has come: work on them now, most urgent first.
  const active = list
    .filter((d) => d.startSafe <= s.today && d.due >= s.today)
    .sort((a, b) => a.due.localeCompare(b.due))
  if (active.length > 0)
    nodes.push(
      section(
        m.panel.workNow,
        m.panel.active(active.length),
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
        m.panel.startOn(long(iso)),
        relative(s.today, iso),
        items.map((d) => card(s, d))
      )
    )
  }
  if (shown.length < later.length) {
    const more = h("button", { type: "button", class: "btn more" }, m.panel.more)
    more.onclick = () => {
      s.horizon += 60
      rerender()
    }
    nodes.push(more)
  }

  if (nodes.length === 0) {
    const yearOver = s.today > `${s.data.year}-12-31`
    nodes.push(h("p", { class: "empty" }, yearOver ? m.panel.yearOver(s.data.year) : m.panel.none))
  }
  body.replaceChildren(...nodes)
}

const renderFoot = (s: State) => {
  const { m, date } = s.t
  const generated = new Date(s.data.generatedAt).toLocaleString(s.t.locale, { timeZone: "Europe/Sofia" })
  $("foot").replaceChildren(
    h(
      "p",
      {},
      m.foot.source,
      ...s.data.sources.flatMap((src, i) => [
        i > 0 ? ", " : "",
        h("a", { href: src.page, rel: "noopener", target: "_blank", lang: "bg" }, src.title),
        m.foot.dates(date(src.retrieved), date(src.checked)),
      ]),
      m.foot.generated(generated)
    ),
    h("p", {}, m.foot.rules)
  )
}

/** Fills the language menu. Each option shows the language name in that language. */
const renderLangSelect = (s: State, onChange: (lang: Lang) => void) => {
  const select = $<HTMLSelectElement>("lang-select")
  select.replaceChildren(
    ...LANGS.map((l) => h("option", { value: l, lang: l, selected: l === s.lang }, LANG_INFO[l].name))
  )
  select.onchange = () => {
    if (isLang(select.value)) onChange(select.value)
  }
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

const showError = (m: Messages, message: string) => {
  $("panel-body").replaceChildren(h("p", { class: "empty" }, m.loadError(message)))
}

const pickYear = (years: ReadonlyArray<number>, today: string): number | undefined => {
  const current = Number(today.slice(0, 4))
  if (years.includes(current)) return current
  const past = years.filter((y) => y < current)
  return past.length > 0 ? Math.max(...past) : years[0]
}

const prefs = loadPrefs()
applyHtml(prefs.lang, MESSAGES[prefs.lang])

const main = Effect.gen(function* () {
  const today = todayInSofia()
  const index = yield* fetchJson<CalendarIndex>("data/index.json")
  const year = pickYear(index.years, today)
  if (year === undefined) return yield* new LoadError({ url: "data/index.json", message: MESSAGES[prefs.lang].noYears })
  const data = yield* fetchJson<CalendarYear>(`data/${year}.json`)
  const state: State = {
    ...prefs,
    t: localise(prefs.lang),
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

  renderLangSelect(state, (lang) => {
    state.lang = lang
    state.t = localise(lang)
    savePrefs(state)
    const url = new URL(location.href)
    if (url.searchParams.has("lang")) {
      url.searchParams.set("lang", lang)
      history.replaceState(null, "", url)
    }
    applyHtml(lang, state.t.m)
    rerender()
  })

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
          Effect.catch((e) => Effect.sync(() => showError(state.t.m, e.message)))
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

Effect.runFork(main.pipe(Effect.catch((e) => Effect.sync(() => showError(MESSAGES[prefs.lang], e.message)))))

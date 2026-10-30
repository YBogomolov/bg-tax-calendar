import { readFileSync } from "node:fs"
import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { paragraphsFromXml, readParagraphs } from "../src/docx.ts"
import { tagItem } from "../src/audience.ts"
import type { Deadline } from "../src/domain.ts"
import { makeWorkingDayCheck, minusDays, nextWorkingDay, orthodoxEaster, previousWorkingDay, publicHolidays, toIso } from "../src/holidays.ts"
import { toIcs } from "../src/ics.ts"
import { parseSocial, parseTax } from "../src/parse.ts"

const source = (name: string) => readFileSync(new URL(`../data/sources/2026/${name}`, import.meta.url))

describe("holidays", () => {
  it("computes Orthodox Easter", () => {
    expect(toIso(orthodoxEaster(2024))).toBe("2024-05-05")
    expect(toIso(orthodoxEaster(2025))).toBe("2025-04-20")
    expect(toIso(orthodoxEaster(2026))).toBe("2026-04-12")
    expect(toIso(orthodoxEaster(2027))).toBe("2027-05-02")
  })

  it("moves weekend holidays to the next working day", () => {
    const h = publicHolidays(2026)
    expect(h.has("2026-05-25")).toBe(true) // 24 May is a Sunday
    expect(h.has("2026-09-07")).toBe(true) // 6 September is a Sunday
    expect(h.has("2026-12-28")).toBe(true) // 26 December is a Saturday
    expect(h.has("2026-04-14")).toBe(false) // Easter days do not move
  })

  it("shifts deadlines past non-working days", () => {
    const isWorkingDay = makeWorkingDayCheck()
    expect(nextWorkingDay("2026-12-25", isWorkingDay)).toBe("2026-12-29")
    expect(nextWorkingDay("2026-04-10", isWorkingDay)).toBe("2026-04-14")
    expect(nextWorkingDay("2026-04-30", isWorkingDay)).toBe("2026-04-30")
  })

  it("applies overrides from data/holidays.json", () => {
    const isWorkingDay = makeWorkingDayCheck({ 2026: { extraDaysOff: ["2026-12-31"], workingDays: ["2026-12-19"] } })
    expect(nextWorkingDay("2026-12-31", isWorkingDay)).toBe("2027-01-04")
    expect(nextWorkingDay("2026-12-19", isWorkingDay)).toBe("2026-12-19")
  })
})

describe("docx", () => {
  it("joins runs and detects bold paragraphs", () => {
    const xml = `<w:body>
      <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>До 14-ти</w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve"> януари:</w:t></w:r></w:p>
      <w:p><w:r><w:t>Подаване &amp; внасяне</w:t></w:r></w:p>
      <w:p><w:r><w:t>   </w:t></w:r></w:p>
    </w:body>`
    expect(paragraphsFromXml(xml)).toEqual([
      { text: "До 14-ти януари:", bold: true },
      { text: "Подаване & внасяне", bold: false }
    ])
  })
})

describe("parsers on the official 2026 documents", () => {
  it.effect("parses the tax calendar", () =>
    Effect.gen(function*() {
      const result = yield* parseTax(2026, yield* readParagraphs("tax", source("tax.docx")))
      expect(result.length).toBeGreaterThan(100)
      const months = new Set(result.map((d) => d.date.slice(5, 7)))
      expect(months.size).toBe(12)
      const annualReturn = result.find((d) => d.date === "2026-04-30" && d.category === "ЗДДФЛ")
      expect(annualReturn?.items.some((i) => /годишна данъчна декларация/i.test(i))).toBe(true)
      const vat = result.filter((d) => d.category === "ЗДДС" && d.date.endsWith("-14"))
      expect(vat).toHaveLength(12)
      for (const d of result) {
        expect(d.items.length).toBeGreaterThan(0)
        for (const i of d.items) expect(i).not.toMatch(/^(\d{1,2}[.)]?\s|[•·])/)
      }
    }))

  it.effect("parses the social-insurance calendar with stated expiry dates", () =>
    Effect.gen(function*() {
      const result = yield* parseSocial(2026, yield* readParagraphs("social", source("social.docx")))
      expect(result.length).toBeGreaterThan(60)
      const jan = result.find((d) => d.date === "2026-01-25" && d.category === "ДОО и ДЗПО")
      expect(jan?.statedDue).toBe("2026-01-26")
      expect(jan?.items.length).toBeGreaterThan(10)
      const dec = result.find((d) => d.date === "2026-12-25" && d.category === "Н-13")
      expect(dec?.statedDue).toBe("2026-12-29")
      const pension = result.filter((d) => d.category === "Пенсионни фондове")
      expect(pension).toHaveLength(12)
    }))

  it.effect("agrees with every expiry date stated by the NRA", () =>
    Effect.gen(function*() {
      const result = yield* parseSocial(2026, yield* readParagraphs("social", source("social.docx")))
      const isWorkingDay = makeWorkingDayCheck()
      const stated = result.filter((d) => d.statedDue !== undefined)
      expect(stated.length).toBeGreaterThan(10)
      for (const d of stated) expect(nextWorkingDay(d.date, isWorkingDay)).toBe(d.statedDue)
    }))
})

describe("self-employed profiles", () => {
  it("separates freelancers from sole traders", () => {
    expect(tagItem("tax", "ЗДДФЛ", "Подаване на годишна данъчна декларация по чл. 50 от ЗДДФЛ за доходи, подлежащи на облагане с данък върху общата годишна данъчна основа, придобити от физическите лица през предходната година"))
      .toEqual(["freelancer"])
    expect(tagItem("tax", "ЗДДФЛ", "Подаване на годишна данъчна декларация по чл. 50 от ЗДДФЛ за доходите, подлежащи на облагане с данък върху годишната данъчна основа по чл. 28 от ЗДДФЛ и внасяне на дължимия по декларацията данък от лица, които извършват стопанска дейност като търговци по смисъла на Търговския закон"))
      .toEqual(["trader"])
    expect(tagItem("social", "Н-13", "Подаване на Декларация образец №6, за дължимите осигурителни вноски за предходната календарна година, от самоосигуряващите се лица с изключение на лицата, извършващи стопанска дейност като търговци по смисъла на Търговския закон"))
      .toEqual(["freelancer"])
    expect(tagItem("social", "ДОО и ДЗПО", "За самоосигуряващите се лица на авансово дължимите месечни осигурителни вноски за месец януари 2026 г."))
      .toEqual(["freelancer", "trader"])
  })

  it("leaves out employer, payer and spouse obligations", () => {
    expect(tagItem("tax", "ЗДДФЛ", "Внасяне от работодателя на авансовия данък, удържан през месец март за доходи от трудови правоотношения.")).toEqual([])
    expect(tagItem("tax", "ЗДДФЛ", "Деклариране и внасяне на авансовия данък по чл. 43, ал. 4, чл. 44, ал. 4 и чл. 44а от ЗДДФЛ, удържан от предприятията и самоосигуряващите се лица за доходи")).toEqual([])
    expect(tagItem("social", "ДОО и ДЗПО", "За съпрузите на лицата, регистрирани като упражняващи свободна професия и/или занаятчийска дейност")).toEqual([])
  })

  it("tags VAT and property obligations", () => {
    expect(tagItem("tax", "ЗДДС", "Подаване на справка-декларация по ЗДДС, ведно с отчетни регистри и внасяне на дължимия ДДС")).toEqual(["vat"])
    expect(tagItem("tax", "ЗМДТ", "Плащане на втора вноска на данъка върху недвижимите имоти за текущата година.")).toEqual(["property"])
  })

  it.effect("finds every core obligation of a freelancer in 2026", () =>
    Effect.gen(function*() {
      const raw = yield* parseSocial(2026, yield* readParagraphs("social", source("social.docx")))
      const tax = yield* parseTax(2026, yield* readParagraphs("tax", source("tax.docx")))
      const items = [...raw, ...tax].flatMap((d) => d.items.filter((t) => tagItem(d.source, d.category, t).includes("freelancer")).map((t) => ({ date: d.date, t })))
      expect(items.filter((i) => /авансово дължимите месечни осигурителни вноски/.test(i.t))).toHaveLength(12)
      expect(items.filter((i) => /декларация образец №1 от самоосигуряващите се лица с данните/.test(i.t))).toHaveLength(12)
      expect(items.filter((i) => /доходи от стопанска дейност по чл\. 29/.test(i.t)).map((i) => i.date)).toEqual(["2026-04-30", "2026-07-31", "2026-10-31"])
      expect(items.some((i) => i.date === "2026-04-30" && /^Подаване на годишна данъчна декларация/.test(i.t))).toBe(true)
    }))
})

describe("buffers", () => {
  const isWorkingDay = makeWorkingDayCheck()
  const start = (due: string, days: number) => previousWorkingDay(minusDays(due, days), isWorkingDay)

  it("counts back from the due date and moves to the previous working day", () => {
    expect(start("2026-11-25", 14)).toBe("2026-11-11")
    expect(start("2026-11-25", 7)).toBe("2026-11-18")
    // 25 May 2026 is a holiday: 14 days before 8 June is Monday 25 May, so start on Friday 22 May.
    expect(start("2026-06-08", 14)).toBe("2026-05-22")
    // 14 days before 26 January is 12 January, a Monday.
    expect(start("2026-01-26", 14)).toBe("2026-01-12")
    // Christmas: 7 days before 31 December is Thursday 24 December, a holiday.
    expect(start("2026-12-31", 7)).toBe("2026-12-23")
  })
})

describe("ics", () => {
  const deadline: Deadline = {
    id: "tax-2026-01-14-ддс",
    source: "tax",
    date: "2026-01-14",
    due: "2026-01-14",
    startSafe: "2025-12-31",
    startTight: "2026-01-07",
    category: "ЗДДС",
    group: "ЗДДС",
    items: [{ text: "Подаване на справка-декларация по ЗДДС, ведно с отчетни регистри и внасяне на дължимия ДДС", tags: ["vat"] }],
    notes: []
  }
  const options = { name: "Test", stamp: "2026-10-30T10:00:00.000Z", sourceUrl: "https://nra.bg/", buffers: { safeDays: 14, tightDays: 7 } }

  it("writes folded all-day events", () => {
    const ics = toIcs([deadline], { ...options, startEvents: false })
    expect(ics).toContain("DTSTART;VALUE=DATE:20260114\r\n")
    expect(ics).toContain("DTEND;VALUE=DATE:20260115\r\n")
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1)
    for (const line of ics.split("\r\n")) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75)
  })

  it("adds start events for the safe and the tight buffer", () => {
    const ics = toIcs([deadline], { ...options, startEvents: true })
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(3)
    expect(ics).toContain("DTSTART;VALUE=DATE:20251231\r\n")
    expect(ics).toContain("DTSTART;VALUE=DATE:20260107\r\n")
  })
})

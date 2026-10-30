import { Effect } from "effect"
import { strFromU8, unzipSync } from "fflate"
import { ParseError } from "./domain.ts"

export interface Paragraph {
  readonly text: string
  /** True when every run that carries text is bold. */
  readonly bold: boolean
}

const decodeEntities = (s: string): string =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&")

const runText = (run: string): string => {
  let out = ""
  for (const m of run.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\/>|<w:br\/>/g)) {
    out += m[1] !== undefined ? decodeEntities(m[1]) : " "
  }
  return out
}

const isBold = (run: string): boolean => {
  const m = run.match(/<w:b(?:\s+w:val="([^"]*)")?\s*\/>/)
  return m !== null && (m[1] === undefined || m[1] === "1" || m[1] === "true")
}

/** Normalise whitespace: non-breaking spaces, tabs and repeated spaces become one space. */
export const clean = (s: string): string => s.replace(/[ \t\s]+/g, " ").trim()

/** Extracts body paragraphs from `word/document.xml`. Empty paragraphs are dropped. */
export const paragraphsFromXml = (xml: string): ReadonlyArray<Paragraph> => {
  const out: Array<Paragraph> = []
  for (const [p] of xml.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)) {
    const runs = [...p.matchAll(/<w:r[ >][\s\S]*?<\/w:r>/g)].map(([r]) => r)
    const text = clean(runs.map(runText).join(""))
    if (text === "") continue
    const textRuns = runs.filter((r) => runText(r).trim() !== "")
    out.push({ text, bold: textRuns.length > 0 && textRuns.every(isBold) })
  }
  return out
}

export const readParagraphs = (source: string, bytes: Uint8Array) =>
  Effect.try({
    try: () => {
      const files = unzipSync(bytes, { filter: (f) => f.name === "word/document.xml" })
      const doc = files["word/document.xml"]
      if (doc === undefined) throw new Error("word/document.xml is missing")
      return paragraphsFromXml(strFromU8(doc))
    },
    catch: (e) => new ParseError({ source, message: `Cannot read DOCX: ${String(e)}` })
  })

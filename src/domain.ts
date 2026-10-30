import { Schema } from "effect"

/** ISO calendar date, for example `2026-04-30`. */
export const IsoDate = Schema.String.pipe(Schema.check(Schema.isPattern(/^\d{4}-\d{2}-\d{2}$/)))

export const SourceKind = Schema.Literals(["tax", "social"])
export type SourceKind = typeof SourceKind.Type

export const Tag = Schema.Literals(["freelancer", "trader", "vat", "property"])
export type Tag = typeof Tag.Type

export const Item = Schema.Struct({
  text: Schema.String,
  /** Self-employed profiles that the item concerns. Empty when it concerns other taxpayers only. */
  tags: Schema.Array(Tag)
})
export type Item = typeof Item.Type

export const Deadline = Schema.Struct({
  id: Schema.String,
  source: SourceKind,
  /** Date as written in the NRA calendar. */
  date: IsoDate,
  /** Date when the deadline actually expires (moved past weekends and public holidays). */
  due: IsoDate,
  /** Recommended day to start: the safe buffer before `due`, moved back to a working day. */
  startSafe: IsoDate,
  /** Latest comfortable day to start: the tight buffer before `due`, moved back to a working day. */
  startTight: IsoDate,
  /** Short label: law abbreviation for tax entries, topic for social entries. */
  category: Schema.String,
  /** Heading of the block in the source document. */
  group: Schema.String,
  items: Schema.Array(Item),
  notes: Schema.Array(Schema.String)
})
export type Deadline = typeof Deadline.Type

export const SourceDoc = Schema.Struct({
  kind: SourceKind,
  title: Schema.String,
  page: Schema.String,
  /** Day when the document content last changed in this repository. */
  retrieved: IsoDate,
  /** Day when the refetch last compared the document with the NRA website. */
  checked: IsoDate,
  sha256: Schema.String
})
export type SourceDoc = typeof SourceDoc.Type

export const Buffers = Schema.Struct({
  safeDays: Schema.Number,
  tightDays: Schema.Number
})
export type Buffers = typeof Buffers.Type

export const Feed = Schema.Struct({
  file: Schema.String,
  title: Schema.String
})
export type Feed = typeof Feed.Type

export const CalendarYear = Schema.Struct({
  year: Schema.Number,
  buffers: Buffers,
  generatedAt: Schema.String,
  sources: Schema.Array(SourceDoc),
  /** Non-working days in the year (weekends excluded), used to shade the overview. */
  holidays: Schema.Array(IsoDate),
  deadlines: Schema.Array(Deadline)
})
export type CalendarYear = typeof CalendarYear.Type

export const CalendarIndex = Schema.Struct({
  years: Schema.Array(Schema.Number),
  feeds: Schema.Array(Feed)
})
export type CalendarIndex = typeof CalendarIndex.Type

export class BuildWarning extends Schema.TaggedError<BuildWarning>()("BuildWarning", {
  message: Schema.String
}) {}

export class ParseError extends Schema.TaggedError<ParseError>()("ParseError", {
  source: Schema.String,
  message: Schema.String
}) {}

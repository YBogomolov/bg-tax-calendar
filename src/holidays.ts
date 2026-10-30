/**
 * Bulgarian public holidays (Labour Code, art. 154) and deadline shifting.
 *
 * A deadline that ends on a non-working day expires on the next working day
 * (Tax and Social Insurance Procedure Code, art. 3; Civil Procedure Code, art. 60).
 */

export interface HolidayOverrides {
  /** Extra days off declared by the Council of Ministers. */
  readonly extraDaysOff: ReadonlyArray<string>
  /** Saturdays or Sundays declared as working days. */
  readonly workingDays: ReadonlyArray<string>
}

export const noOverrides: HolidayOverrides = { extraDaysOff: [], workingDays: [] }

/** Date-only helpers in UTC, so that the host time zone has no effect. */
export const toIso = (d: Date): string => d.toISOString().slice(0, 10)
export const fromIso = (iso: string): Date => new Date(`${iso}T00:00:00Z`)
export const ymd = (y: number, m: number, d: number): Date => new Date(Date.UTC(y, m - 1, d))
export const addDays = (d: Date, n: number): Date => new Date(d.getTime() + n * 86_400_000)
const isWeekend = (d: Date): boolean => d.getUTCDay() === 0 || d.getUTCDay() === 6

/** Orthodox Easter Sunday (Meeus algorithm, Julian calendar converted to Gregorian). */
export const orthodoxEaster = (year: number): Date => {
  const a = year % 4
  const b = year % 7
  const c = year % 19
  const d = (19 * c + 15) % 30
  const e = (2 * a + 4 * b - d + 34) % 7
  const month = Math.floor((d + e + 114) / 31)
  const day = ((d + e + 114) % 31) + 1
  const julianToGregorian = Math.floor(year / 100) - Math.floor(year / 400) - 2
  return addDays(ymd(year, month, day), julianToGregorian)
}

const FIXED: ReadonlyArray<readonly [number, number]> = [
  [1, 1], // New Year
  [3, 3], // Liberation Day
  [5, 1], // Labour Day
  [5, 6], // St George's Day
  [5, 24], // Culture and Literacy Day
  [9, 6], // Unification Day
  [9, 22], // Independence Day
  [12, 24], // Christmas Eve
  [12, 25], // Christmas
  [12, 26], // Christmas
]

/**
 * All non-working weekdays and weekend holidays of a year, as ISO dates.
 * Fixed holidays on a Saturday or Sunday move to the next working day.
 * Easter days do not move.
 */
export const publicHolidays = (year: number, overrides: HolidayOverrides = noOverrides): ReadonlySet<string> => {
  const days = new Set<string>()
  const easter = orthodoxEaster(year)
  for (const offset of [-2, -1, 0, 1]) days.add(toIso(addDays(easter, offset)))
  const fixed = FIXED.map(([m, d]) => ymd(year, m, d))
  for (const d of fixed) days.add(toIso(d))
  for (const d of fixed) {
    if (!isWeekend(d)) continue
    let next = addDays(d, 1)
    while (isWeekend(next) || days.has(toIso(next))) next = addDays(next, 1)
    days.add(toIso(next))
  }
  for (const d of overrides.extraDaysOff) days.add(d)
  for (const d of overrides.workingDays) days.delete(d)
  return days
}

export const makeWorkingDayCheck = (overrides: Record<number, HolidayOverrides> = {}) => {
  const cache = new Map<number, ReadonlySet<string>>()
  const holidays = (year: number) => {
    let set = cache.get(year)
    if (set === undefined) {
      set = publicHolidays(year, overrides[year] ?? noOverrides)
      cache.set(year, set)
    }
    return set
  }
  return (d: Date): boolean => {
    const iso = toIso(d)
    if ((overrides[d.getUTCFullYear()]?.workingDays ?? []).includes(iso)) return true
    return !isWeekend(d) && !holidays(d.getUTCFullYear()).has(iso)
  }
}

/** Moves an ISO date forward to the first working day. */
export const nextWorkingDay = (iso: string, isWorkingDay: (d: Date) => boolean): string => {
  let d = fromIso(iso)
  while (!isWorkingDay(d)) d = addDays(d, 1)
  return toIso(d)
}

/** Moves an ISO date back to the last working day on or before it. */
export const previousWorkingDay = (iso: string, isWorkingDay: (d: Date) => boolean): string => {
  let d = fromIso(iso)
  while (!isWorkingDay(d)) d = addDays(d, -1)
  return toIso(d)
}

/** Subtracts calendar days from an ISO date. */
export const minusDays = (iso: string, days: number): string => toIso(addDays(fromIso(iso), -days))

import type { SourceKind, Tag } from "./domain.ts"

/**
 * Tags an obligation with the self-employed profiles that it concerns.
 *
 * - `freelancer`: self-insured persons under art. 29 of the Personal Income Tax Act
 *   (свободна професия, занаятчии и др.), who file the annual return by 30 April.
 * - `trader`: sole traders (ЕТ), who file by 30 June.
 * - `vat`: VAT-registered persons (monthly VAT return and VIES declaration).
 * - `property`: owners of real estate (local property tax and waste fee).
 *
 * Obligations of a self-employed person acting as a payer of income to others
 * (tax withheld at source, payer reports) and of spouses are not tagged.
 */

/** Text that concerns sole traders only. */
const TRADER = /като търговци по смисъла на Търговския закон/
/** Text that excludes sole traders explicitly. */
const EXCEPT_TRADER = /с изключение на (?:лицата, )?(?:извършващи|които извършват) стопанска дейност като търговци/

/** Obligations of payers of income, spouses and other niche cases. */
const EXCLUDED = [
  /съпруг/i,
  /код за вид осигурен 22/,
  /удържан от предприятията и самоосигуряващите се лица/,
  /платци на доходи/,
  /земеделски стопани\.?$/,
  /^Подаване на декларация (?:за избор )?по чл\. 29а/
]

const SELF_EMPLOYED_TAX = [
  /годишна данъчна декларация по чл\. 50/,
  /доходи от стопанска дейност по чл\. 29/,
  /данъка върху разходите/
]

const VAT = /^Подаване на (?:справка-декларация по ЗДДС|VIES-декларация)/
const PROPERTY = /недвижимите имоти|сметосъбиране/

/** Annual return on the general tax base only: sole traders use the base under art. 28 instead. */
const GENERAL_BASE_ONLY = (text: string) => /общата годишна данъчна основа/.test(text) && !/чл\. 28/.test(text)

const byActivity = (text: string): Array<Tag> => {
  if (EXCEPT_TRADER.test(text) || GENERAL_BASE_ONLY(text)) return ["freelancer"]
  if (TRADER.test(text)) return ["trader"]
  return ["freelancer", "trader"]
}

export const tagItem = (source: SourceKind, category: string, text: string): Array<Tag> => {
  if (EXCLUDED.some((re) => re.test(text))) return []
  if (source === "social") {
    if (category === "Пенсионни фондове") return []
    return /самоосигуряващ/i.test(text) ? byActivity(text) : []
  }
  if (category === "ЗДДФЛ" && SELF_EMPLOYED_TAX.some((re) => re.test(text))) return byActivity(text)
  if (category === "ЗДДС" && VAT.test(text)) return ["vat"]
  if (category === "ЗМДТ" && PROPERTY.test(text)) return ["property"]
  return []
}

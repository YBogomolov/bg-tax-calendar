/** Short English summaries for common obligations. The Bulgarian text stays the authority. */
const ACTIONS: ReadonlyArray<readonly [RegExp, string]> = [
  [/авансово дължимите месечни осигурителни вноски/, "Pay the monthly social security contributions"],
  [/авансово дължимите здравноосигурителни вноски/, "Pay the monthly health insurance contribution"],
  [/декларация образец №1 от самоосигуряващите се лица/, "File declaration form 1"],
  [/окончателната осигурителна вноска.*нова декларация/, "If you filed a corrected tax return: pay the corrected contributions"],
  [/Декларация образец №6.*нова данъчна декларация/, "If you filed a corrected tax return: file declaration form 6 again"],
  [/здравно осигуряване при определяне на окончателната/, "Pay the final annual health insurance contribution"],
  [/окончателната осигурителна вноска/, "Pay the final annual social security contributions"],
  [/Декларация образец №6/, "File declaration form 6 for the previous year"],
  [/промен[яи]т вида на осигуряването/, "Optional: change the type of insurance for this year"],
  [/отстъпка от 5 на сто върху дължимите по декларацията/, "Optional: file the annual tax return online and pay for a 5% discount"],
  [/нова годишна данъчна декларация/, "Optional: file a corrected annual tax return"],
  [/годишна данъчна декларация по чл\. 50/, "File the annual tax return and pay the tax"],
  [/авансово данък от физически лица, придобили доходи от стопанска дейност/, "Declare and pay the quarterly advance tax"],
  [/данъка върху разходите/, "Pay the tax on expenses"],
  [/справка-декларация по ЗДДС/, "File the VAT return and pay the VAT"],
  [/VIES-декларация/, "File the VIES declaration"],
  [/недвижимите имоти за цялата текуща година с отстъпка/, "Pay the full-year property tax with a 5% discount"],
  [/първа вноска.*недвижимите имоти/, "Pay the first instalment of property tax"],
  [/втора вноска.*недвижимите имоти/, "Pay the second instalment of property tax"],
  [/сметосъбиране/, "Optional: claim the waste-fee exemption for unused property"]
]

export const actionLabel = (text: string): string | undefined => ACTIONS.find(([re]) => re.test(text))?.[1]

export const CATEGORY_NAMES: Record<string, string> = {
  "ЗДДС": "VAT Act",
  "ЗДДФЛ": "Personal Income Tax Act",
  "ЗКПО": "Corporate Income Tax Act",
  "ЗМДТ": "Local Taxes and Fees Act",
  "ДОПК": "Tax and Social Insurance Procedure Code (SAF-T)",
  "ЗСВТС": "Intrastat (intra-EU trade statistics)",
  "ЗДЗП": "Insurance Premium Tax Act",
  "Н-18": "Ordinance N-18 (fiscal devices)",
  "ДОО и ДЗПО": "Social security and supplementary pension contributions",
  "ЗО": "Health insurance contributions",
  "Н-13": "Ordinance N-13 (declarations 1, 3, 6 and 7)",
  "НООСЛ": "Self-insured persons, workers abroad, seafarers",
  "Пенсионни фондове": "Pension fund changes",
  "Осигуровки": "Social and health insurance"
}

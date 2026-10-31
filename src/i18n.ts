/** Interface languages. Official NRA texts always stay in Bulgarian. */
export const LANGS = ["bg", "ru", "uk", "en"] as const
export type Lang = (typeof LANGS)[number]

export const DEFAULT_LANG: Lang = "bg"

export const LANG_INFO: Record<Lang, { readonly name: string; readonly locale: string }> = {
  bg: { name: "Български", locale: "bg-BG" },
  ru: { name: "Русский", locale: "ru-RU" },
  uk: { name: "Українська", locale: "uk-UA" },
  en: { name: "English", locale: "en-GB" },
}

export const isLang = (x: unknown): x is Lang => typeof x === "string" && (LANGS as ReadonlyArray<string>).includes(x)

/** One text per language. */
export type Translated = Readonly<Record<Lang, string>>

/** Counted forms, selected with `Intl.PluralRules`. Bulgarian and English use only `one` and `other`. */
export type PluralForms = Readonly<Partial<Record<Intl.LDMLPluralRule, string>> & { other: string }>

const rules = new Map<Lang, Intl.PluralRules>()

export const plural = (lang: Lang, n: number, forms: PluralForms): string => {
  let r = rules.get(lang)
  if (r === undefined) {
    r = new Intl.PluralRules(LANG_INFO[lang].locale)
    rules.set(lang, r)
  }
  return `${n} ${forms[r.select(n)] ?? forms.other}`
}

/** Calendar feed file for a language. Bulgarian keeps the original names, so old subscriptions continue to work. */
export const feedFile = (id: string, lang: Lang): string => (lang === "bg" ? `${id}.ics` : `${id}.${lang}.ics`)

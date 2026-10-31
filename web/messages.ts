import type { Lang, PluralForms } from "../src/i18n.ts"

/** Texts in `index.html`, applied through `data-i18n`, `data-i18n-title` and `data-i18n-aria-label`. */
export type HtmlKey =
  | "title"
  | "description"
  | "heading"
  | "subtitle"
  | "language"
  | "year"
  | "feeds"
  | "filters"
  | "view"
  | "viewSelf"
  | "viewAll"
  | "activity"
  | "freelancer"
  | "freelancerHint"
  | "trader"
  | "traderHint"
  | "vat"
  | "property"
  | "calendar"
  | "sourceAll"
  | "sourceTax"
  | "sourceSocial"
  | "categories"
  | "overview"
  | "upcoming"
  | "back"
  | "loading"
  | "github"

export interface Messages {
  readonly html: Readonly<Record<HtmlKey, string>>
  readonly weekdays: ReadonlyArray<string>
  /** Weeks in "N weeks before" context (accusative in Russian). */
  readonly weeksBefore: PluralForms
  readonly daysBefore: PluralForms
  readonly deadlines: PluralForms
  readonly sourceNames: { readonly tax: string; readonly social: string }
  readonly status: { readonly safe: string; readonly tight: string; readonly due: string; readonly past: string }
  readonly profile: {
    readonly freelancer: string
    readonly trader: string
    readonly vat: string
    readonly property: string
  }
  readonly subtitleSelf: (parts: string, safe: string, tight: string) => string
  readonly subtitleAll: string
  readonly feedsHint: string
  readonly subscribe: string
  readonly download: string
  readonly legend: {
    readonly tax: string
    readonly social: string
    readonly start: (w: string) => string
    readonly latestStart: (w: string) => string
    readonly holiday: string
    readonly today: string
  }
  readonly day: {
    readonly holiday: string
    readonly start: (n: number) => string
    readonly latestStart: (n: number) => string
  }
  readonly card: {
    readonly before: (w: string) => string
    readonly start: string
    readonly latest: string
    readonly due: string
    readonly moved: (date: string) => string
    /** Caption above the Bulgarian original. Empty in Bulgarian. */
    readonly official: string
  }
  readonly panel: {
    readonly onDay: string
    readonly nothing: string
    readonly workNow: string
    readonly active: (n: number) => string
    readonly startOn: (date: string) => string
    readonly more: string
    readonly yearOver: (year: number) => string
    readonly none: string
  }
  readonly foot: {
    readonly source: string
    readonly dates: (retrieved: string, checked: string) => string
    readonly generated: (when: string) => string
    readonly rules: string
  }
  readonly loadError: (message: string) => string
  readonly noYears: string
}

export const MESSAGES: Record<Lang, Messages> = {
  bg: {
    html: {
      title: "Данъчен календар",
      description: "Данъчни и осигурителни срокове за самоосигуряващи се лица по официалните календари на НАП.",
      heading: "Данъчен календар",
      subtitle: "Срокове от официалните календари на Националната агенция за приходите (НАП)",
      language: "Език",
      year: "Година",
      feeds: "Абонамент за календар",
      filters: "Филтри",
      view: "Изглед",
      viewSelf: "Самоосигуряващи се",
      viewAll: "Всички срокове",
      activity: "Вид дейност",
      freelancer: "Свободна професия",
      freelancerHint: "Свободна професия, занаятчия и др. (чл. 29 ЗДДФЛ)",
      trader: "Едноличен търговец (ЕТ)",
      traderHint: "Едноличен търговец",
      vat: "Регистрация по ДДС",
      property: "Данък върху недвижими имоти",
      calendar: "Календар",
      sourceAll: "Всички",
      sourceTax: "Данъци",
      sourceSocial: "Осигуровки",
      categories: "Категории",
      overview: "Преглед на годината",
      upcoming: "Предстоящи",
      back: "← Предстоящи",
      loading: "Зареждане…",
      github: "Изходен код в GitHub",
    },
    weekdays: ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"],
    weeksBefore: { one: "седмица", other: "седмици" },
    daysBefore: { one: "ден", other: "дни" },
    deadlines: { one: "срок", other: "срока" },
    sourceNames: { tax: "Данъчен календар", social: "Осигурителен календар" },
    status: { safe: "Започнете сега", tight: "Спешно: започнете днес", due: "Срокът е днес", past: "Изтекъл" },
    profile: {
      freelancer: "свободна професия",
      trader: "едноличен търговец (ЕТ)",
      vat: "регистрация по ДДС",
      property: "собственик на имот",
    },
    subtitleSelf: (parts, safe, tight) =>
      `Самоосигуряващо се лице: ${parts}. Започнете ${safe} преди всеки срок, най-късно ${tight} преди него.`,
    subtitleAll: "Всички срокове от официалните календари на Националната агенция за приходите (НАП)",
    feedsHint:
      "Абонирайте се в Apple Calendar или Google Calendar. Календарите за самоосигуряващи се съдържат и дните за начало.",
    subscribe: "Абониране",
    download: "Изтегляне",
    legend: {
      tax: "Данъчен срок",
      social: "Осигурителен срок",
      start: (w) => `Начало (${w} преди срока)`,
      latestStart: (w) => `Най-късно начало (${w} преди срока)`,
      holiday: "Официален празник",
      today: "Днес",
    },
    day: {
      holiday: "официален празник",
      start: (n) => `начало: ${n}`,
      latestStart: (n) => `най-късно начало: ${n}`,
    },
    card: {
      before: (w) => `${w} преди срока`,
      start: "Начало",
      latest: "Най-късно",
      due: "Срок",
      moved: (date) =>
        `Датата по календара е ${date} — неприсъствен ден, затова срокът изтича в първия следващ работен ден.`,
      official: "",
    },
    panel: {
      onDay: "Срокове на този ден",
      nothing: "Няма нищо за този ден.",
      workNow: "За работа сега",
      active: (n) => `${n} активни`,
      startOn: (date) => `Начало ${date}`,
      more: "Покажи още",
      yearOver: (year) =>
        `Няма повече срокове в календара за ${year} г. НАП обикновено публикува следващия календар през януари. Сайтът го изтегля автоматично в началото на всеки месец.`,
      none: "Няма предстоящи срокове за избраните филтри.",
    },
    foot: {
      source: "Източник: ",
      dates: (r, c) => ` (изтеглен на ${r}, проверен на ${c})`,
      generated: (when) => `. Генериран на ${when}.`,
      rules:
        "Срок, който изтича в неприсъствен ден, се премества в първия следващ работен ден. Денят за начало се премества в предходния работен ден. " +
        "Изгледът за самоосигуряващи се показва задълженията на самоосигуряващото се лице за собствените му доходи. Задълженията като работодател или платец на доходи не са включени. " +
        "Винаги проверявайте документите на НАП, преди да подадете декларация. Тази страница не е правна консултация.",
    },
    loadError: (m) => `Календарът не може да се зареди: ${m}`,
    noYears: "Няма налични години",
  },

  ru: {
    html: {
      title: "Налоговый календарь Болгарии",
      description:
        "Налоговые сроки и сроки по социальному страхованию для самозанятых в Болгарии по официальным календарям НАП.",
      heading: "Налоговый календарь Болгарии",
      subtitle: "Сроки из официальных календарей Национального агентства по доходам (НАП)",
      language: "Язык",
      year: "Год",
      feeds: "Подписка на календарь",
      filters: "Фильтры",
      view: "Режим",
      viewSelf: "Самозанятые",
      viewAll: "Все сроки",
      activity: "Вид деятельности",
      freelancer: "Свободная профессия",
      freelancerHint: "Свободная профессия, ремесленник и др. (чл. 29 ЗДДФЛ)",
      trader: "Единоличный торговец (ЕТ)",
      traderHint: "Единоличный торговец (едноличен търговец)",
      vat: "Регистрация по НДС",
      property: "Налог на недвижимость",
      calendar: "Календарь",
      sourceAll: "Все",
      sourceTax: "Налоги",
      sourceSocial: "Взносы",
      categories: "Категории",
      overview: "Обзор года",
      upcoming: "Предстоящие",
      back: "← Предстоящие",
      loading: "Загрузка…",
      github: "Исходный код на GitHub",
    },
    weekdays: ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"],
    weeksBefore: { one: "неделю", few: "недели", many: "недель", other: "недели" },
    daysBefore: { one: "день", few: "дня", many: "дней", other: "дня" },
    deadlines: { one: "срок", few: "срока", many: "сроков", other: "срока" },
    sourceNames: { tax: "Налоговый календарь", social: "Календарь социального страхования" },
    status: { safe: "Начните сейчас", tight: "Срочно: начните сегодня", due: "Срок сегодня", past: "Истёк" },
    profile: {
      freelancer: "свободная профессия",
      trader: "единоличный торговец (ЕТ)",
      vat: "регистрация по НДС",
      property: "владелец недвижимости",
    },
    subtitleSelf: (parts, safe, tight) =>
      `Самозанятое лицо (самоосигуряващо се лице): ${parts}. Начните за ${safe} до каждого срока, не позднее чем за ${tight}.`,
    subtitleAll: "Все сроки из официальных календарей Национального агентства по доходам (НАП)",
    feedsHint:
      "Подпишитесь в Apple Calendar или Google Calendar. Календари для самозанятых содержат и дни начала. Официальные тексты НАП — на болгарском.",
    subscribe: "Подписаться",
    download: "Скачать",
    legend: {
      tax: "Налоговый срок",
      social: "Срок по соцстрахованию",
      start: (w) => `Начало (за ${w} до срока)`,
      latestStart: (w) => `Крайнее начало (за ${w} до срока)`,
      holiday: "Официальный праздник",
      today: "Сегодня",
    },
    day: {
      holiday: "официальный праздник",
      start: (n) => `начало: ${n}`,
      latestStart: (n) => `крайнее начало: ${n}`,
    },
    card: {
      before: (w) => `за ${w} до срока`,
      start: "Начало",
      latest: "Не позднее",
      due: "Срок",
      moved: (date) =>
        `Дата по календарю — ${date}, нерабочий день, поэтому срок истекает в первый следующий рабочий день.`,
      official: "Официальный текст НАП (на болгарском)",
    },
    panel: {
      onDay: "Сроки в этот день",
      nothing: "На этот день ничего нет.",
      workNow: "Пора заняться",
      active: (n) => `активных: ${n}`,
      startOn: (date) => `Начало ${date}`,
      more: "Показать ещё",
      yearOver: (year) =>
        `В календаре на ${year} год больше нет сроков. НАП обычно публикует следующий календарь в январе. Сайт загружает его автоматически в начале каждого месяца.`,
      none: "Нет предстоящих сроков для выбранных фильтров.",
    },
    foot: {
      source: "Источник: ",
      dates: (r, c) => ` (загружен ${r}, проверен ${c})`,
      generated: (when) => `. Сгенерировано ${when}.`,
      rules:
        "Срок, выпадающий на нерабочий день, переносится на первый следующий рабочий день. День начала переносится на предыдущий рабочий день. " +
        "Режим для самозанятых показывает обязанности самозанятого лица по его собственным доходам. Обязанности работодателя или плательщика доходов не включены. " +
        "Перевод приведён для удобства, обязательную силу имеет официальный текст НАП на болгарском языке. " +
        "Всегда проверяйте документы НАП перед подачей декларации. Эта страница не является юридической консультацией.",
    },
    loadError: (m) => `Не удалось загрузить календарь: ${m}`,
    noYears: "Нет доступных лет",
  },

  uk: {
    html: {
      title: "Податковий календар Болгарії",
      description:
        "Податкові терміни і терміни соціального страхування для самозайнятих у Болгарії за офіційними календарями НАП.",
      heading: "Податковий календар Болгарії",
      subtitle: "Терміни з офіційних календарів Національного агентства з доходів (НАП)",
      language: "Мова",
      year: "Рік",
      feeds: "Підписка на календар",
      filters: "Фільтри",
      view: "Режим",
      viewSelf: "Самозайняті",
      viewAll: "Усі терміни",
      activity: "Вид діяльності",
      freelancer: "Вільна професія",
      freelancerHint: "Вільна професія, ремісник тощо (чл. 29 ЗДДФЛ)",
      trader: "Одноосібний торговець (ЕТ)",
      traderHint: "Одноосібний торговець (едноличен търговец)",
      vat: "Реєстрація платником ПДВ",
      property: "Податок на нерухомість",
      calendar: "Календар",
      sourceAll: "Усі",
      sourceTax: "Податки",
      sourceSocial: "Внески",
      categories: "Категорії",
      overview: "Огляд року",
      upcoming: "Найближчі",
      back: "← Найближчі",
      loading: "Завантаження…",
      github: "Вихідний код на GitHub",
    },
    weekdays: ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"],
    weeksBefore: { one: "тиждень", few: "тижні", many: "тижнів", other: "тижня" },
    daysBefore: { one: "день", few: "дні", many: "днів", other: "дня" },
    deadlines: { one: "термін", few: "терміни", many: "термінів", other: "терміну" },
    sourceNames: { tax: "Податковий календар", social: "Календар соціального страхування" },
    status: { safe: "Почніть зараз", tight: "Терміново: почніть сьогодні", due: "Термін сьогодні", past: "Минув" },
    profile: {
      freelancer: "вільна професія",
      trader: "одноосібний торговець (ЕТ)",
      vat: "реєстрація платником ПДВ",
      property: "власник нерухомості",
    },
    subtitleSelf: (parts, safe, tight) =>
      `Самозайнята особа (самоосигуряващо се лице): ${parts}. Почніть за ${safe} до кожного терміну, не пізніше ніж за ${tight}.`,
    subtitleAll: "Усі терміни з офіційних календарів Національного агентства з доходів (НАП)",
    feedsHint:
      "Підпишіться в Apple Calendar або Google Calendar. Календарі для самозайнятих містять і дні початку. Офіційні тексти НАП — болгарською.",
    subscribe: "Підписатися",
    download: "Завантажити",
    legend: {
      tax: "Податковий термін",
      social: "Термін соціального страхування",
      start: (w) => `Початок (за ${w} до терміну)`,
      latestStart: (w) => `Найпізніший початок (за ${w} до терміну)`,
      holiday: "Офіційне свято",
      today: "Сьогодні",
    },
    day: {
      holiday: "офіційне свято",
      start: (n) => `початок: ${n}`,
      latestStart: (n) => `найпізніший початок: ${n}`,
    },
    card: {
      before: (w) => `за ${w} до терміну`,
      start: "Початок",
      latest: "Не пізніше",
      due: "Термін",
      moved: (date) =>
        `Дата за календарем — ${date}, неробочий день, тому термін спливає першого наступного робочого дня.`,
      official: "Офіційний текст НАП (болгарською)",
    },
    panel: {
      onDay: "Терміни цього дня",
      nothing: "На цей день нічого немає.",
      workNow: "Час братися до роботи",
      active: (n) => `активних: ${n}`,
      startOn: (date) => `Початок ${date}`,
      more: "Показати ще",
      yearOver: (year) =>
        `У календарі на ${year} рік більше немає термінів. НАП зазвичай публікує наступний календар у січні. Сайт завантажує його автоматично на початку кожного місяця.`,
      none: "Немає найближчих термінів для вибраних фільтрів.",
    },
    foot: {
      source: "Джерело: ",
      dates: (r, c) => ` (завантажено ${r}, перевірено ${c})`,
      generated: (when) => `. Згенеровано ${when}.`,
      rules:
        "Термін, що припадає на неробочий день, переноситься на перший наступний робочий день. День початку переноситься на попередній робочий день. " +
        "Режим для самозайнятих показує обов'язки самозайнятої особи щодо її власних доходів. Обов'язки роботодавця або платника доходів не включено. " +
        "Переклад наведено для зручності, чинним є офіційний текст НАП болгарською мовою. " +
        "Завжди перевіряйте документи НАП перед поданням декларації. Ця сторінка не є юридичною консультацією.",
    },
    loadError: (m) => `Не вдалося завантажити календар: ${m}`,
    noYears: "Немає доступних років",
  },

  en: {
    html: {
      title: "Bulgarian Tax Calendar",
      description:
        "Tax and social insurance deadlines for self-employed people in Bulgaria, from the official NRA calendars.",
      heading: "Bulgarian Tax Calendar",
      subtitle: "Deadlines from the official calendars of the National Revenue Agency (NRA)",
      language: "Language",
      year: "Year",
      feeds: "Subscribe to calendar",
      filters: "Filters",
      view: "View",
      viewSelf: "Self-employed",
      viewAll: "All deadlines",
      activity: "Type of activity",
      freelancer: "Freelancer",
      freelancerHint: "Liberal profession, craftsperson and similar (art. 29 ЗДДФЛ)",
      trader: "Sole trader (ET)",
      traderHint: "Sole trader (едноличен търговец)",
      vat: "VAT registration",
      property: "Property tax",
      calendar: "Calendar",
      sourceAll: "All",
      sourceTax: "Taxes",
      sourceSocial: "Social insurance",
      categories: "Categories",
      overview: "Year overview",
      upcoming: "Upcoming",
      back: "← Upcoming",
      loading: "Loading…",
      github: "Source code on GitHub",
    },
    weekdays: ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"],
    weeksBefore: { one: "week", other: "weeks" },
    daysBefore: { one: "day", other: "days" },
    deadlines: { one: "deadline", other: "deadlines" },
    sourceNames: { tax: "Tax calendar", social: "Social insurance calendar" },
    status: { safe: "Start now", tight: "Urgent: start today", due: "Due today", past: "Expired" },
    profile: {
      freelancer: "freelancer",
      trader: "sole trader (ET)",
      vat: "VAT-registered",
      property: "property owner",
    },
    subtitleSelf: (parts, safe, tight) =>
      `Self-employed person (самоосигуряващо се лице): ${parts}. Start ${safe} before each deadline, at the latest ${tight} before it.`,
    subtitleAll: "All deadlines from the official calendars of the National Revenue Agency (NRA)",
    feedsHint:
      "Subscribe in Apple Calendar or Google Calendar. The self-employed calendars also contain the start days. Official NRA texts are in Bulgarian.",
    subscribe: "Subscribe",
    download: "Download",
    legend: {
      tax: "Tax deadline",
      social: "Social insurance deadline",
      start: (w) => `Start (${w} before the deadline)`,
      latestStart: (w) => `Latest start (${w} before the deadline)`,
      holiday: "Public holiday",
      today: "Today",
    },
    day: {
      holiday: "public holiday",
      start: (n) => `start: ${n}`,
      latestStart: (n) => `latest start: ${n}`,
    },
    card: {
      before: (w) => `${w} before the deadline`,
      start: "Start",
      latest: "Latest",
      due: "Due",
      moved: (date) =>
        `The calendar date is ${date}, a non-working day, so the deadline moves to the next working day.`,
      official: "Official NRA text (in Bulgarian)",
    },
    panel: {
      onDay: "Deadlines on this day",
      nothing: "Nothing on this day.",
      workNow: "Work on now",
      active: (n) => `${n} active`,
      startOn: (date) => `Start ${date}`,
      more: "Show more",
      yearOver: (year) =>
        `No more deadlines in the ${year} calendar. The NRA usually publishes the next calendar in January. The site downloads it automatically at the start of each month.`,
      none: "No upcoming deadlines for the selected filters.",
    },
    foot: {
      source: "Source: ",
      dates: (r, c) => ` (downloaded ${r}, checked ${c})`,
      generated: (when) => `. Generated ${when}.`,
      rules:
        "A deadline on a non-working day moves to the next working day. A start day moves to the previous working day. " +
        "The self-employed view shows the obligations of a self-employed person for their own income. It does not include obligations as an employer or as a payer of income. " +
        "The translation is for convenience only. The official Bulgarian NRA text prevails. " +
        "Always check the NRA documents before you file a declaration. This page is not legal advice.",
    },
    loadError: (m) => `Cannot load the calendar: ${m}`,
    noYears: "No years available",
  },
}

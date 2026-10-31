# BG Tax Calendar

A static website that shows the Bulgarian tax and social-insurance deadlines for self-employed persons (самоосигуряващи се лица). The left side shows a year overview. The side panel shows the upcoming work. The site also publishes calendar feeds for Apple Calendar, Google Calendar and other calendar apps.

## Languages

The site is available in Bulgarian, Russian, Ukrainian and English. Bulgarian is the default language. The page selects the language in this order:

1. The `lang` parameter in the address, for example `?lang=en`.
2. The language that the visitor selected before. The browser keeps this selection.
3. The first browser language that the site supports.

The site translates the interface, the short summaries of the obligations and the category names. The official NRA texts stay in Bulgarian. In the other languages, each card shows the translated summary and the Bulgarian original below it.

| File              | Contents                                        |
| ----------------- | ----------------------------------------------- |
| `src/i18n.ts`     | Languages, counted forms and feed file names    |
| `src/labels.ts`   | Summaries of the obligations and category names |
| `web/messages.ts` | Interface texts                                 |
| `src/ics.ts`      | Texts of the calendar events                    |

If you add a text, add it to all four languages. If a language is missing, `pnpm typecheck` fails.

## Self-employed view

The site opens in the self-employed view ("Самоосигуряващи се"). This view shows only the obligations of a self-insured person for their own income. Select the profile at the top of the page:

| Setting                                    | Effect                                                                                                                                                              |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Свободна професия (freelancer)             | Свободна професия, занаятчия and other persons under art. 29 of the Personal Income Tax Act. The annual tax return and the final contributions are due by 30 April. |
| Едноличен търговец (ЕТ, sole trader)       | The annual tax return and the final contributions are due by 30 June.                                                                                               |
| Регистрация по ДДС (VAT-registered)        | Adds the monthly VAT return and the VIES declaration.                                                                                                               |
| Данък върху недвижими имоти (property tax) | Adds the property tax instalments and the waste-fee exemption.                                                                                                      |

The view leaves out the obligations of a self-employed person as an employer or as a payer of income to other persons. The "Всички срокове" (all deadlines) view shows every deadline from the NRA documents.

`src/audience.ts` contains the rules that select the obligations. The rules use the text of the NRA documents. At each build, `src/audience-check.ts` counts the core obligations, for example 12 monthly contributions. If a count is too low, the build shows a warning.

## Start days

Each date in the NRA calendars is a deadline. The site also shows when to start the work:

| Marker         | Meaning                        | Default                     |
| -------------- | ------------------------------ | --------------------------- |
| Green triangle | Start: the safe buffer         | 14 days before the deadline |
| Amber triangle | Latest start: the tight buffer | 7 days before the deadline  |

If a start day is a weekend or a public holiday, it moves back to the previous working day.

The side panel shows two groups:

- "За работа сега" (work on now): deadlines with a start day that has come. Each card shows "Започнете сега" (safe window), "Спешно: започнете днес" (tight window) or "Срокът е днес" (due today).
- Later deadlines, grouped by the start day.

To change the buffers, edit `data/settings.json` and rebuild:

```json
{
  "buffers": {
    "safeDays": 14,
    "tightDays": 7
  }
}
```

The site uses TypeScript and [Effect](https://effect.website). The browser bundle is approximately 37 KiB (gzip).

## Source of truth

The National Revenue Agency (НАП, NRA) publishes two calendars every year as `.docx` files:

| Calendar                                          | NRA page                                                                       |
| ------------------------------------------------- | ------------------------------------------------------------------------------ |
| Tax calendar (Данъчен календар)                   | <https://nra.bg/wps/portal/nra/calendar/calendar> → "Данъчен календар 2026 г." |
| Social-insurance calendar (Осигурителен календар) | Same page → "Осигурителен календар 2026 г."                                    |

The project keeps the original files in `data/sources/<year>/`. The build parses these files directly. Nobody types deadlines by hand. A monthly workflow downloads the files again (see [Monthly refetch](#monthly-refetch)).

The two documents are different:

- The tax calendar gives the dates as written in the law. It does not move dates that fall on a weekend or a public holiday.
- The social-insurance calendar gives the moved dates explicitly ("срокът изтича на ...").

The build calculates the moved date for each deadline: the next working day after a weekend or public holiday. The holiday rules come from art. 154 of the Labour Code. The build compares its result with every moved date that the NRA states. If a date does not agree, the build shows a warning. For 2026, all dates agree.

## Requirements

- Node.js 22 or later
- pnpm 11

## Build and run

1. Install the dependencies:

   ```sh
   pnpm install
   ```

2. Build the site into `dist/`:

   ```sh
   pnpm build
   ```

3. Start the server:

   ```sh
   pnpm serve
   ```

4. Open <http://localhost:8080/>.

To use a different port or address, set `PORT` and `HOST`, for example `PORT=9000 pnpm serve`.

`dist/` contains only static files. You can also serve it with Caddy, nginx or any other static server.

## Subscribe in a calendar app

Open "Абонамент за календар" (calendar feeds) on the page. Click "Абониране" (subscribe) for the feeds that match your profile. The page marks these feeds with a tick.

| Feed              | Contents                                   |
| ----------------- | ------------------------------------------ |
| `freelancer.ics`  | Freelancer obligations, with start events  |
| `sole-trader.ics` | Sole-trader obligations, with start events |
| `vat.ics`         | VAT obligations, with start events         |
| `property.ics`    | Property tax, with start events            |
| `calendar.ics`    | All NRA deadlines, without start events    |

These files are in Bulgarian. Each feed also has a Russian, a Ukrainian and an English version, for example `freelancer.ru.ics`, `freelancer.uk.ics` and `freelancer.en.ics`. The event titles of these versions contain the translated summaries. The event descriptions also contain the official Bulgarian text. The page shows the feeds in the selected language.

Each deadline is an all-day event on its moved date. The profile feeds also contain one event on the safe start day and one event on the tight start day.

## GitHub Pages

The workflow `.github/workflows/deploy.yml` builds the site and publishes it on GitHub Pages:

- A push to `master` starts a build and a deployment.
- A pull request starts a build only.
- The build runs the type check, the tests and a strict build. In a strict build (`STRICT=true`), a data warning stops the build. The site then keeps the last good data.

The site is at <https://ybogomolov.me/bg-tax-calendar/>. All paths in the site are relative, so the same `dist/` also works on the Mac mini.

To enable GitHub Pages once, set **Settings → Pages → Source** to **GitHub Actions**.

## Monthly refetch

The workflow `.github/workflows/refetch.yml` runs at 05:17 UTC on the first day of each month. You can also start it from the **Actions** tab ("Run workflow"). The workflow does these steps:

1. It opens <https://nra.bg/wps/portal/nra/calendar/calendar> and finds the links to the yearly tax and social-insurance calendars.
2. It downloads each `.docx` file.
3. If a file is new or changed, the parser reads it. If the parser rejects the file, the workflow stops and the old file stays.
4. It writes new files to `data/sources/<year>/` and updates `data/sources/sources.json`. For a new year, it also adds the year to `data/holidays.json`.
5. It runs the tests and a strict build.
6. It commits the result to `master` and deploys the site.

Each run records the date of the check (`checked`) in `sources.json`, also when no document changed. The site footer shows this date. The commit also keeps the schedule active: GitHub disables scheduled workflows in a public repository after 60 days without activity.

If the workflow fails, GitHub sends an email to the repository owner. Read the job log:

- `FetchError`: the NRA website did not return a document. Start the workflow again later.
- `ParseError`: the NRA changed the layout of a page or a document. Adapt `src/refetch.ts` or `src/parse.ts`.
- `BuildWarning`: the NRA changed the wording, or a date does not agree with the holiday rules. Adapt `src/audience.ts` or `data/holidays.json`.

The refetch identifies itself with the User-Agent `bg-tax-calendar (+https://github.com/YBogomolov/bg-tax-calendar)`. To run it on your computer, use `pnpm refetch`.

## Add a new year manually

The monthly refetch adds a new year when the NRA lists it. To add a year before the next run, use one of these procedures:

- Start the refetch workflow from the **Actions** tab.
- Run `pnpm refetch` on your computer, then commit the changes in `data/`.

If the refetch cannot read the NRA website, add the files by hand:

1. Open <https://nra.bg/wps/portal/nra/calendar/calendar>.
2. Download the tax calendar and the social-insurance calendar (`.docx`).
3. Save them as `data/sources/<year>/tax.docx` and `data/sources/<year>/social.docx`.
4. Add an entry for the year to `data/sources/sources.json`.
5. Add an entry for the year to `data/holidays.json`.
6. Run the tests and the build:

   ```sh
   pnpm test
   pnpm build
   ```

7. Read the build log. If the build shows a warning about a date, read the next section.

If the build stops with a `ParseError`, the NRA changed the document layout. The error message shows the text that the parser did not recognise. Adapt `src/parse.ts`.

## Extra days off

The Council of Ministers can declare extra days off or working Saturdays. The build cannot calculate these days. Add them to `data/holidays.json`:

```json
{
  "2026": {
    "extraDaysOff": ["2026-12-31"],
    "workingDays": ["2026-12-19"]
  }
}
```

## Project layout

| Path                    | Contents                                                             |
| ----------------------- | -------------------------------------------------------------------- |
| `data/sources/`         | Original NRA documents and their metadata                            |
| `data/holidays.json`    | Extra days off and working days                                      |
| `data/settings.json`    | Safe and tight buffers                                               |
| `src/docx.ts`           | Reads paragraphs from a `.docx` file                                 |
| `src/parse.ts`          | Parsers for the tax calendar and the social-insurance calendar       |
| `src/holidays.ts`       | Bulgarian public holidays, moved deadlines and start days            |
| `src/audience.ts`       | Rules that select the obligations of each self-employed profile      |
| `src/audience-check.ts` | Build-time check of the core obligations of each profile             |
| `src/profile.ts`        | Profiles and calendar feeds                                          |
| `src/i18n.ts`           | Languages and counted forms                                          |
| `src/labels.ts`         | Translated summaries and category names                              |
| `src/ics.ts`            | iCalendar export                                                     |
| `src/refetch.ts`        | Downloads the calendars from the NRA website                         |
| `src/build-data.ts`     | Effect program that writes `dist/data/*.json` and the calendar feeds |
| `web/`                  | Page, styles, interface texts and browser code                       |
| `scripts/build.ts`      | Full build: data, bundle and static files                            |
| `scripts/serve.ts`      | Static server for `dist/`                                            |
| `scripts/refetch.ts`    | Runs the refetch and writes the GitHub Actions output                |
| `.github/workflows/`    | Build, deployment and monthly refetch                                |
| `test/`                 | Tests that use the real 2026 documents                               |

## Commands

| Command          | Action                                                   |
| ---------------- | -------------------------------------------------------- |
| `pnpm build`     | Builds the full site into `dist/`                        |
| `pnpm data`      | Builds only the data files                               |
| `pnpm refetch`   | Downloads the current NRA calendars into `data/sources/` |
| `pnpm serve`     | Serves `dist/`                                           |
| `pnpm test`      | Runs the tests                                           |
| `pnpm typecheck` | Runs the TypeScript compiler                             |

## Disclaimer

This site is not legal or tax advice. Before you file, always check the NRA documents.

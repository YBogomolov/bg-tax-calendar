# BG Tax Calendar

A static website that shows the Bulgarian tax and social-insurance deadlines for self-employed persons (самоосигуряващи се лица). The left side shows a year overview. The side panel shows the upcoming work. The site also publishes calendar feeds for Apple Calendar, Google Calendar and other calendar apps.

## Self-employed view

The site opens in the self-employed view. This view shows only the obligations of a self-insured person for their own income. Select the profile at the top of the page:

| Setting | Effect |
| --- | --- |
| Freelancer | Свободна професия, занаятчия and other persons under art. 29 of the Personal Income Tax Act. The annual tax return and the final contributions are due by 30 April. |
| Sole trader (ЕТ) | The annual tax return and the final contributions are due by 30 June. |
| VAT-registered | Adds the monthly VAT return and the VIES declaration. |
| Property tax | Adds the property tax instalments and the waste-fee exemption. |

The view leaves out the obligations of a self-employed person as an employer or as a payer of income to other persons. The "All deadlines" view shows every deadline from the NRA documents.

`src/audience.ts` contains the rules that select the obligations. The rules use the text of the NRA documents. At each build, `src/audience-check.ts` counts the core obligations, for example 12 monthly contributions. If a count is too low, the build shows a warning.

## Start days

Each date in the NRA calendars is a deadline. The site also shows when to start the work:

| Marker | Meaning | Default |
| --- | --- | --- |
| Green triangle | Start: the safe buffer | 14 days before the deadline |
| Amber triangle | Latest start: the tight buffer | 7 days before the deadline |

If a start day is a weekend or a public holiday, it moves back to the previous working day.

The side panel shows two groups:

- "Work on now": deadlines with a start day that has come. Each card shows "Start now" (safe window), "Tight: start today" (tight window) or "Due today".
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

| Calendar | NRA page |
| --- | --- |
| Tax calendar (Данъчен календар) | <https://nra.bg/wps/portal/nra/calendar/calendar> → "Данъчен календар 2026 г." |
| Social-insurance calendar (Осигурителен календар) | Same page → "Осигурителен календар 2026 г." |

The project keeps the original files in `data/sources/<year>/`. The build parses these files directly. Nobody types deadlines by hand.

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

## Run on the Mac mini at login

1. Build the site with `pnpm build`.
2. Install the launchd agent:

   ```sh
   PORT=8080 ./deploy/install-launchd.sh
   ```

3. Open `http://<mac-mini-name>.local:8080/` from a device on the home network.

The agent restarts the server if it stops. The server writes its log to `serve.log`.

To remove the agent, run these commands:

```sh
launchctl bootout gui/$(id -u)/com.bg-tax-calendar
rm ~/Library/LaunchAgents/com.bg-tax-calendar.plist
```

The server reads `dist/` from disk for each request. After a rebuild, you do not have to restart it.

## Subscribe in a calendar app

Open "Calendar feeds" on the page. Click "Subscribe" for the feeds that match your profile. The page marks these feeds with a tick.

| Feed | Contents |
| --- | --- |
| `freelancer.ics` | Freelancer obligations, with start events |
| `sole-trader.ics` | Sole-trader obligations, with start events |
| `vat.ics` | VAT obligations, with start events |
| `property.ics` | Property tax, with start events |
| `calendar.ics` | All NRA deadlines, without start events |

Each deadline is an all-day event on its moved date. The profile feeds also contain one event on the safe start day and one event on the tight start day.

## Add a new year or update a calendar

The NRA usually publishes the calendar for the next year in January. The NRA website blocks automated downloads, so download the files in a browser.

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

| Path | Contents |
| --- | --- |
| `data/sources/` | Original NRA documents and their metadata |
| `data/holidays.json` | Extra days off and working days |
| `data/settings.json` | Safe and tight buffers |
| `src/docx.ts` | Reads paragraphs from a `.docx` file |
| `src/parse.ts` | Parsers for the tax calendar and the social-insurance calendar |
| `src/holidays.ts` | Bulgarian public holidays, moved deadlines and start days |
| `src/audience.ts` | Rules that select the obligations of each self-employed profile |
| `src/audience-check.ts` | Build-time check of the core obligations of each profile |
| `src/profile.ts` | Profiles and calendar feeds |
| `src/ics.ts` | iCalendar export |
| `src/build-data.ts` | Effect program that writes `dist/data/*.json` and `dist/calendar.ics` |
| `web/` | Page, styles and browser code |
| `scripts/build.ts` | Full build: data, bundle and static files |
| `scripts/serve.ts` | Static server for `dist/` |
| `test/` | Tests that use the real 2026 documents |

## Commands

| Command | Action |
| --- | --- |
| `pnpm build` | Builds the full site into `dist/` |
| `pnpm data` | Builds only the data files |
| `pnpm serve` | Serves `dist/` |
| `pnpm test` | Runs the tests |
| `pnpm typecheck` | Runs the TypeScript compiler |

## Disclaimer

This site is not legal or tax advice. Before you file, always check the NRA documents.

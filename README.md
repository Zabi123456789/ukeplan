# Ukeplan

En kalender der en AI-modell planlegger uka di rundt faste bønnetider, skole, familie og venner, og alenetid. Når du legger inn noe nytt, justeres bare det som må flyttes.

Appen bygges i fire steg:

| Steg | Innhold | Status |
| --- | --- | --- |
| 1 | Datamodell og kalender med manuelle blokker | ✅ Ferdig |
| 2 | Bønnetider (shia/Ja'fari, tre blokker per dag, innstillbar beregning) | ✅ Ferdig |
| 3 | AI-planlegging av uka med Claude, med validering før lagring | Neste |
| 4 | Omplanlegging med minimale endringer og visning av hva som ble endret | – |

## Kom i gang

Krever Node 22 eller nyere.

```bash
npm install            # kjører også `prisma generate`
cp .env.example .env   # fyll inn ANTHROPIC_API_KEY fra steg 3
npx prisma migrate dev # oppretter SQLite-databasen i prisma/dev.db
npm run dev            # http://localhost:3000
```

Etter en ny migrering må `npm run dev` startes på nytt, ellers bruker serveren den gamle Prisma-klienten.

Andre kommandoer:

```bash
npm test        # Vitest
npm run lint
npm run build
```

## Bruk

- **Ny blokk:** dra over et tidsrom i kalenderen. På mobil holder du inne før du drar.
- **Rediger:** klikk på en blokk for å endre tittel, kategori, sted (hjemme/ute), tid og notater.
- **Flytt eller endre lengde:** dra blokken, eller dra i nederste kant.
- **Lås:** en låst blokk (🔒, stripete) kan ikke dras. Planleggeren flytter den aldri. Du må låse den opp før du flytter eller sletter den.
- **Overlapp:** manuelle blokker kan overlappe, men appen viser en advarsel.
- **Uke og dag:** bytt visning med knappene øverst til høyre.

### Bønnetider

Bønnene vises som faste blokker som ikke kan dras eller slettes. Standard er shia-praksis med tre blokker om dagen: **Fajr**, **Dhuhr + Asr** og **Maghrib + Isha**.

- **Én dag:** klikk på en bønn for å se dagens tider (også soloppgang, solnedgang og midnatt) og sette en manuell tid. Den gjelder bare den datoen, og «Bruk beregnet» fjerner den.
- **Innstillinger** (`/innstillinger`):
  - beregningsmetode og vinkler
  - Asr
  - regel for lyse netter
  - sammenslåing og varighet
  - justering i minutter per bønn
  - sted

  Forhåndsvisningen viser de neste sju dagene, i tillegg til vinter, vår og midtsommer, før du lagrer.

**Beregning** (`src/lib/prayer.ts`, med biblioteket [adhan](https://github.com/batoulapps/adhan-js)):

| | Standard (Ja'fari, Leva-instituttet) |
| --- | --- |
| Fajr | Solen 16° under horisonten |
| Maghrib | Solen 4° under horisonten, når rødfargen i øst er borte. Det er ca. 15–30 min etter solnedgang |
| Isha | 14°. Aldri før Maghrib |
| Midnatt | Midt mellom solnedgang og neste dags Fajr |
| Lyse netter | «Midt på natten»: om sommeren når solen ikke 16° under horisonten i Oslo. Da settes Fajr og Isha til midten av natten |

Tidene er testet mot [Aladhan](https://aladhan.com) (Ja'fari-metoden) for januar, mars, juni og oktober, og stemmer innen 3 minutter. Asr er sjekket mot en uavhengig solberegning, fordi Aladhans Asr avvek 4–8 minutter fra den. Testene kjøres også med andre tidssoner på maskinen, så resultatet ikke avhenger av hvor serveren står.

Hvis moskeen eller senteret ditt har en egen tabell, bruker du «Justering i minutter» for å treffe den. Dager som avviker, overstyrer du manuelt.

## Arkitektur

- **Next.js 16 (App Router), React 19, TypeScript og Tailwind 4**
- **Prisma 7 + SQLite** via `@prisma/adapter-better-sqlite3`. Klienten genereres til `src/generated/prisma`. For å bytte til PostgreSQL endrer du `provider` i `prisma/schema.prisma`, bruker `@prisma/adapter-pg` i `src/lib/db.ts` og setter `DATABASE_URL`.
- **FullCalendar 6** (`timeGrid` + `interaction`) for uke- og dagsvisning med dra og slipp
- **zod** validerer all input til API-et

Tider lagres i UTC og vises i nettleserens tidssone (Europe/Oslo).

```
prisma/schema.prisma           Event, Setting (JSON per nøkkel) og PrayerOverride
src/lib/events.ts              Kategorier, zod-skjemaer, overlappsjekk (delt klient/server)
src/lib/event-store.ts         Databasespørringer; slår sammen lagrede blokker og bønneblokker
src/lib/prayer.ts              Beregning av bønnetider og bønneblokker (ren, uten database)
src/lib/prayer-store.ts        Innstillinger og manuelle tider i databasen
src/app/api/events/...         GET/POST /api/events, PATCH/DELETE /api/events/:id
src/components/Calendar.tsx    Kalenderen
src/components/EventDialog.tsx Skjema for å opprette og redigere blokker
src/components/PrayerDialog.tsx        Dagens bønnetider og manuelle tider
src/components/PrayerSettingsForm.tsx  Innstillingssiden med forhåndsvisning
```

### API

| Metode | Rute | Beskrivelse |
| --- | --- | --- |
| GET | `/api/events?start=ISO&end=ISO` | Blokker og bønner i tidsrommet. Bønner har `source: "PRAYER"` |
| POST | `/api/events` | Ny blokk. Svarer med `{ event, conflicts }` |
| PATCH | `/api/events/:id` | Endre blokk. Gir `409` hvis du flytter en låst blokk |
| DELETE | `/api/events/:id` | Slett blokk. Gir `409` hvis den er låst eller er en bønn |
| GET | `/api/prayers/:date` | Beregnede og manuelle tider for en dato |
| PUT | `/api/prayers/:date` | `{ prayer, time: "HH:mm" \| null }` setter eller fjerner en manuell tid |
| GET/PUT | `/api/settings/prayer` | Innstillinger for bønnetider |

## Hvordan AI ble brukt

Appen bygges med Claude Code. Jeg beskrev ideen og kravene på norsk, og Claude laget først en arkitekturplan. Den justerte vi sammen før noe kode ble skrevet, blant annet for shia-bønnetider og fleksibel våkentid. Hvert steg testes med Vitest og sjekkes i nettleseren før vi går videre.

# Ukeplan

En kalender der en AI-modell planlegger uka di rundt faste bønnetider, skole, familie og venner, og alenetid. Når du legger inn noe nytt, justeres bare det som må flyttes.

Appen bygges i fire steg:

| Steg | Innhold | Status |
| --- | --- | --- |
| 1 | Datamodell og kalender med manuelle blokker | ✅ Ferdig |
| 2 | Bønnetider (shia/Ja'fari, tre blokker per dag, innstillbar beregning) | Neste |
| 3 | AI-planlegging av uka med Claude, med validering før lagring | – |
| 4 | Omplanlegging med minimale endringer og visning av hva som ble endret | – |

## Kom i gang

Krever Node 22 eller nyere.

```bash
npm install            # kjører også `prisma generate`
cp .env.example .env   # fyll inn ANTHROPIC_API_KEY fra steg 3
npx prisma migrate dev # oppretter SQLite-databasen i prisma/dev.db
npm run dev            # http://localhost:3000
```

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

## Arkitektur

- **Next.js 16 (App Router), React 19, TypeScript og Tailwind 4**
- **Prisma 7 + SQLite** via `@prisma/adapter-better-sqlite3`. Klienten genereres til `src/generated/prisma`. For å bytte til PostgreSQL endrer du `provider` i `prisma/schema.prisma`, bruker `@prisma/adapter-pg` i `src/lib/db.ts` og setter `DATABASE_URL`.
- **FullCalendar 6** (`timeGrid` + `interaction`) for uke- og dagsvisning med dra og slipp
- **zod** validerer all input til API-et

Tider lagres i UTC og vises i nettleserens tidssone (Europe/Oslo).

```
prisma/schema.prisma           Event-modellen (kategori, låst, kilde, sted)
src/lib/events.ts              Kategorier, zod-skjemaer, overlappsjekk (delt klient/server)
src/lib/event-store.ts         Databasespørringer og hjelpefunksjoner for API-et
src/app/api/events/...         GET/POST /api/events, PATCH/DELETE /api/events/:id
src/components/Calendar.tsx    Kalenderen
src/components/EventDialog.tsx Skjema for å opprette og redigere blokker
```

### API

| Metode | Rute | Beskrivelse |
| --- | --- | --- |
| GET | `/api/events?start=ISO&end=ISO` | Blokker i tidsrommet |
| POST | `/api/events` | Ny blokk. Svarer med `{ event, conflicts }` |
| PATCH | `/api/events/:id` | Endre blokk. Gir `409` hvis du flytter en låst blokk |
| DELETE | `/api/events/:id` | Slett blokk. Gir `409` hvis den er låst |

## Hvordan AI ble brukt

Appen bygges med Claude Code. Jeg beskrev ideen og kravene på norsk, og Claude laget først en arkitekturplan. Den justerte vi sammen før noe kode ble skrevet, blant annet for shia-bønnetider og fleksibel våkentid. Hvert steg testes med Vitest og sjekkes i nettleseren før vi går videre.

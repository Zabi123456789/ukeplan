# Ukeplan

Ukeplan er en kalender som planlegger uka for deg. Du setter opp regler for hva du vil få til (studietid, religion, trening, familie og venner, alenetid), og appen fyller uka med konkrete tidsblokker rundt faste bønnetider og det du har lagt inn selv.

Det er en ren frontend-app (React + Vite + TypeScript). All data lagres i nettleserens localStorage. Appen har ingen innlogging, ingen backend og ingen AI-tjeneste, så den er gratis å bruke og virker med en gang.

**Demo:** https://zabi123456789.github.io/ukeplan/ · **Kode:** https://github.com/Zabi123456789/ukeplan

## Funksjoner

- **Måned, uke og dag:** dra i en ledig del for å lage en blokk, eller bruk «+ Ny blokk». Dra for å flytte eller endre lengde, og klikk for å redigere eller slette. I månedsvisningen skjules bønnene for å gi plass, og du kan klikke på en dato for å åpne dagen. På mobil starter kalenderen i dagsvisning.
- **Oversikt over uka:** timer per kategori mot målene dine, f.eks. «Skole 28 t / 28 t».
- **Gjenta hver uke:** nye blokker kan legges inn flere uker fram, f.eks. en fast jobbvakt på mandager.
- **Låste blokker** (🔒) blir aldri flyttet av planleggeren, og må låses opp før du flytter eller sletter dem selv.
- **Bønnetider for Oslo** (shia/Ja'fari) beregnes automatisk for hver dato. Standard er tre faste blokker: Fajr, Dhuhr + Asr og Maghrib + Isha. Du kan endre en enkelt dag manuelt, og metode, vinkler og regel for lyse netter stilles inn under Bønnetider.
- **Regler, harde og myke:** tid per dag, tid per uke, ferdig innen et klokkeslett (f.eks. hjemme innen 19), våkentid og sperret tid. Tidsregler per dag kan hoppe over jobbdager (dager med minst 4 t jobb). Det er automatisk på for skole, så du ikke studerer de dagene du jobber. Tidsregler kan deles i et bestemt antall økter, f.eks. «4 t skole i to økter» eller «8 t trening fordelt på 4 økter». Forslag ligger klare.
- **Planlegg uka:** fyller uka ut fra reglene og viser hva som ikke fikk plass.
- **Opptrapping (valgfri):** tidsmålene kan starte lavere og øke hver uke, f.eks. 50 % i uke 1 og 10 prosentpoeng mer hver uke. Den er av som standard.
- **Omplanlegging:** legger du inn eller flytter noe, flyttes bare de planlagte blokkene som kolliderer. Du ser hva som ble endret, og kan angre.
- **Advarsel** når en blokk du legger inn overlapper en bønn eller en annen blokk.

## Kom i gang

```bash
npm install
npm run dev      # utviklingsserver
npm test         # Vitest-tester
npm run build    # statisk bygg i dist/
npm run preview  # se på bygget lokalt
```

## Slik fungerer planleggeren

`scheduleWeek` i `src/lib/scheduler.ts` er en ren funksjon. Tidspunktet «nå» sendes inn, så testene får faste datoer.

1. **Ledig tid per dag:** våkentid (standard 07–23 på hverdager og 09–00 i helgen) minus bønner, låste blokker, blokker du har lagt inn selv, sperret tid og det som allerede har vært.
2. **Behov:**
   - Tid per dag gjelder for hver dag, minus det som allerede ligger der.
   - Tid per uke fordeles jevnt på dagene som er igjen. Bønnene teller ikke med i religionstiden, den kommer i tillegg.
3. **Økter:** sier regelen hvor mange økter tiden skal deles i, blir øktene så lange. Ellers gjelder maks 90 min studietid, 45 min religion, 60 min trening, 90 min familie og venner og 60 min alenetid. Det er minst 15 min pause mellom øktene, og økter i samme kategori samme dag legges helst med flere timer mellom, så tiden spres utover dagen. Økter under 30 min lages ikke.
4. **Rekkefølge:** harde regler først, så økter med fast lengde (f.eks. trening på 2 t), så kategoriene i rekkefølgen religion, skole, trening, familie og venner, alenetid.
5. **Tidspunkt:** hver økt får det ledige tidspunktet som passer best:
   - studietid tidlig på dagen
   - religion rett etter en bønn
   - trening på ettermiddagen
   - familie rundt middagstid
   - alenetid om kvelden
6. **Frister:** «ferdig innen» med en kategori er en grense for den kategorien. «Hjemme innen 19» gjelder det som skjer ute (trening og jobb), og andre blokker etter kl. 19 legges hjemme.
7. **Ukesmål** som ikke får plass en dag (eller bare får plass etter en myk frist), flyttes til neste dag.
8. **Validering:** planen sjekkes i `src/lib/plan-validate.ts` før den lagres. Ingen blokker skal overlappe, ligge utenfor uka eller ligge i fortiden. Harde regler som ikke kunne oppfylles, vises som feil, og myke regler som ikke ble helt oppfylt, vises som advarsler.

Når du planlegger på nytt, byttes bare de ulåste planlagte blokkene fra nå og ut uka. Alt annet blir stående.

### Opptrapping

`src/lib/progression.ts` skalerer tid per dag og tid per uke til ukas prosent, rundet til nærmeste kvarter, før planleggeren kjører. Med standardinnstillingene blir «5 t skole per dag» 2,5 t i uke 1, 3 t i uke 2 og så videre, til 5 t fra uke 6. Våkentid, frister og sperret tid skaleres ikke. Startprosent, økning per uke og første uke stilles inn under Regler.

### Omplanlegging når du legger inn noe

`adjustAround` i `src/lib/replan.ts` kjører når du lagrer eller flytter en blokk:

1. Finn ulåste planlagte blokker som kolliderer med den nye blokken. Låste blokker, bønner og blokker du har lagt inn selv røres ikke.
2. For hver av dem: sjekk hvor mye tid kategorien fortsatt trenger. Hvis det du la inn dekker behovet, for eksempel en forelesning over en planlagt studieøkt, fjernes blokken.
3. Ellers legges blokken så nær det opprinnelige tidspunktet som mulig samme dag, med pause til andre planlagte blokker. Mål per uke kan flyttes til en senere dag. Får blokken ikke plass, fjernes den.
4. Endringene vises som en liste («Studietid flyttet fra man. 08:00–09:30 til man. 07:30–09:00»), og «Angre» setter alt tilbake slik det var.

### Bønnetider

Bønnetidene beregnes med [adhan](https://github.com/batoulapps/adhan-js) i `src/lib/prayer.ts`.

| | Standard (Ja'fari, Leva-instituttet) |
| --- | --- |
| Fajr | Solen 16° under horisonten |
| Maghrib | Solen 4° under horisonten, når rødfargen i øst er borte |
| Isha | 14°. Aldri før Maghrib |
| Midnatt | Midt mellom solnedgang og neste dags Fajr |
| Lyse netter | «Midt på natten». Om sommeren når solen ikke 16° under horisonten i Oslo |

Tidene er testet mot [Aladhan](https://aladhan.com) for januar, mars, juni og oktober (innen 3 minutter). Asr er sjekket mot en uavhengig solberegning. Testene kjøres også med andre tidssoner på maskinen. Hvis moskeen eller senteret ditt har en egen tabell, bruker du «Justering i minutter» eller endrer enkeltdager manuelt.

## Publisering

Push til `main`, så tester, bygger og publiserer workflowen i `.github/workflows/deploy.yml` appen. Under *Settings → Pages* i repoet setter du *Source* til **GitHub Actions**.

Siden er offentlig, men dataene er det ikke. Hver person som åpner lenken får sin egen kalender i sin egen nettleser, og ingen data sendes noe sted.

## Filstruktur

```
src/
├── App.tsx                  faner (#kalender, #regler, #bonnetider)
├── lib/
│   ├── scheduler.ts         planleggeren (ren funksjon)
│   ├── planner.ts           kjører planleggeren og bytter ut gamle planlagte blokker
│   ├── replan.ts            flytter planlagte blokker som kolliderer med noe nytt
│   ├── progression.ts       opptrapping av tidsmål uke for uke
│   ├── plan-validate.ts     validering av en plan før lagring
│   ├── free-time.ts         ledig tid: våkentid minus opptatt tid
│   ├── prayer.ts            bønnetider og bønneblokker
│   ├── rules.ts             regeltyper og norske beskrivelser
│   ├── calendar.ts          datamodell og operasjoner (opprette, låse, slette …)
│   ├── store.ts             lagring i localStorage
│   ├── events.ts, week.ts   kategorier, tidssone og datoer
│   └── *.test.ts            Vitest-tester
└── components/              Calendar, ChangeLog, EventDialog, PlanPanel, PrayerDialog,
                             PrayerSettingsForm, ProgressionCard, RulesManager, RuleEditor,
                             WeekSummary
```

## Hvordan AI ble brukt

Appen er laget med Claude Code. Jeg beskrev ideen og kravene på norsk, og Claude laget først en arkitekturplan som vi justerte sammen. Blant annet endret vi bønnetidene til shia-praksis med tre bønner om dagen og gjorde våkentiden forskjellig for hverdager og helg.

Første versjon brukte Claude API til planleggingen, med Next.js og en SQLite-database. Det krevde API-nøkkel og betaling. Derfor bygde vi appen om til en ren nettleser-app med en egen planleggingsalgoritme, slik som Eksamensklar. Etterpå kom omplanlegging når noe nytt legges inn, trening og jobb som egne kategorier, økter som spres utover dagen, og månedsvisning. Målet med kalenderen er å bygge disiplin, og da viste det seg at faste timer delt i overkommelige økter fungerer bedre enn å trappe opp antall timer. Opptrappingen ligger derfor igjen som et valg. Hvert steg ble testet med Vitest og sjekket i nettleseren på PC- og mobilbredde før vi gikk videre.

# G-Manager — WorkingHours & UTC Vremenska Logika (Reservation modul)

**Kontekst:** Baza i svi `Instant` timestamp-ovi su striktno UTC. Radno vreme ima smisla samo u lokalnoj vremenskoj zoni biznisa. Zona je **fiksna aplikaciona konstanta** (ne po korisniku): `businessZoneId = ZoneId.of("Europe/Belgrade")`, definisana u `application.yml` (`gmanager.business-zone`), ne hardkodovana u kodu.

**Ključni princip celog dokumenta:** Ne poredimo "vreme-od-vremena" (`LocalTime` vs `LocalTime`) direktno, jer to ne rešava prelazak preko ponoći niti DST. Umesto toga, **svaki radni smenski period pretvaramo u konkretan par `[openInstant, closeInstant)` u UTC-u za tačno određeni kalendarski dan**, i onda radimo čisto `Instant` poređenje. Ovo je jedina robustna strategija.

---

## 1. Struktura radnog vremena i osnovni algoritam provere

### 1.1 Model (već definisan, podsetnik)
`WorkingHours { dayOfWeek: DayOfWeek, openTime: LocalTime, closeTime: LocalTime, active: boolean }` — jedan zapis po danu u nedelji, u **lokalnom vremenu biznisa**.

### 1.2 Algoritam: "koji smeni pripada dati `Instant`"

Ulaz: `startTime: Instant`, `endTime: Instant` (kandidat rezervacije, oba UTC).

**Korak 1 — Konverzija u lokalni kontekst:**
```
zdt        = startTime.atZone(businessZoneId)
localDate  = zdt.toLocalDate()
localDay   = zdt.getDayOfWeek()
localTime  = zdt.toLocalTime()
```

**Korak 2 — Konstrukcija kandidata za "aktivnu smenu":**
Zbog problema prelaska preko ponoći (Deo 2), termin **može** pripadati smeni koja je *počela prethodnog dana*. Zato se uvek proveravaju **dva kandidata**, nikad samo jedan:

- **Kandidat A ("današnja smena"):** `WorkingHours` zapis za `localDay`, pod pretpostavkom da smena počinje na `localDate`.
- **Kandidat B ("jučerašnja prelivena smena"):** `WorkingHours` zapis za `localDay.minus(1)`, pod pretpostavkom da je počela na `localDate.minusDays(1)` i (ako prelazi ponoć) preliva se u `localDate`.

Za svaki kandidat računamo **konkretne UTC granice** te specifične instance smene:

```
// Kandidat A
A.openInstant  = ZonedDateTime.of(localDate, A.openTime, businessZoneId).toInstant()
A.closeInstant = (A.closeTime > A.openTime)
                   ? ZonedDateTime.of(localDate, A.closeTime, businessZoneId).toInstant()
                   : ZonedDateTime.of(localDate.plusDays(1), A.closeTime, businessZoneId).toInstant()
                   // (drugi slučaj = A sama prelazi ponoć)

// Kandidat B
B.openInstant  = ZonedDateTime.of(localDate.minusDays(1), B.openTime, businessZoneId).toInstant()
B.closeInstant = (B.closeTime > B.openTime)
                   ? ZonedDateTime.of(localDate.minusDays(1), B.closeTime, businessZoneId).toInstant()
                   : ZonedDateTime.of(localDate, B.closeTime, businessZoneId).toInstant()
                   // relevantno samo ako B prelazi ponoć
```

**Korak 3 — Pronalazak aktivne smene:**
```
if (A.active && startTime >= A.openInstant && startTime < A.closeInstant):
    activeShift = A
else if (B.active && B prelazi ponoć && startTime >= B.openInstant && startTime < B.closeInstant):
    activeShift = B
else:
    REJECT → 400/409 "Termin je van radnog vremena"
```

**Korak 4 — Provera da CEO termin (ne samo početak) staje u istu smenu:**
```
if (endTime > activeShift.closeInstant):
    REJECT → 400/409 "Trajanje usluge prelazi kraj radnog vremena"
```

> Ovo je krucijalno: nije dovoljno da `startTime` bude validan — `SERVICE` sa `durationMinutes` može gurnuti `endTime` preko granice zatvaranja, čak i ako je kraćeg trajanja i počinje u dozvoljenom prozoru.

**Zašto je ovo robustno na DST:** `ZonedDateTime.of(LocalDate, LocalTime, ZoneId).toInstant()` sam razrešava DST pravila te zone (pomeranje unapred kod "gap" datuma u martu, dvosmislenost kod "overlap" datuma u oktobru prati JDK default — ranija instanca offset-a). Pošto **uvek** računamo apsolutne `Instant` granice iznova za svaki datum, nikad ne "nosimo" stari offset kroz DST prelaz — svaka nova provera je sveža konverzija.

---

## 2. Problem prelaska preko ponoći (petak 20:00 → subota 02:00)

**Konkretan primer iz pitanja:** `WorkingHours(FRIDAY, openTime=20:00, closeTime=02:00)`. Termin kandidat: subota, 01:00 lokalno.

Primenom algoritma iz Dela 1:

- `localDate` = subota (npr. 2026-07-18), `localDay` = SATURDAY, `localTime` = 01:00.
- **Kandidat A** = `WorkingHours` za SATURDAY (ako biznis subotom uopšte ne radi ili radi drugačije — recimo da SATURDAY zapis ne postoji ili je `active=false`) → A se odbacuje.
- **Kandidat B** = `WorkingHours` za `SATURDAY.minus(1) = FRIDAY` → `openTime=20:00, closeTime=02:00`. Pošto `closeTime (02:00) < openTime (20:00)` → **FRIDAY smena prelazi ponoć**.
  - `B.openInstant`  = petak (2026-07-17) 20:00 lokalno → UTC
  - `B.closeInstant` = subota (2026-07-18) 02:00 lokalno → UTC (napomena: `localDate`, ne `localDate.minusDays(1)`, jer se zatvaranje dešava sledećeg kalendarskog dana u odnosu na otvaranje)
- Provera: `startTime (subota 01:00) >= B.openInstant (petak 20:00)` ✅ i `startTime < B.closeInstant (subota 02:00)` ✅ → **`activeShift = B`**, termin je validan i pripisuje se "petkovoj" smeni, iako kalendarski upada u subotu.

**Generalno pravilo:** Zapis `WorkingHours` čiji je `closeTime < openTime` (numerički, kao `LocalTime`) se **uvek** tretira kao smena koja prelazi u naredni kalendarski dan. Ovo se detektuje jednom, na nivou učitavanja/keširanja `WorkingHours` konfiguracije (npr. flag `spansMidnight = closeTime.isBefore(openTime)`), da se izračun ne ponavlja iznova pri svakoj proveri.

**Ivični slučaj koji mora biti pokriven testom:** Termin koji počinje **tačno u ponoć** (`00:00:00`) — mora nedvosmisleno pripasti prelivenoj smeni prethodnog dana (kandidat B), a ne biti odbačen zbog "nema smene koja počinje u ponoć".

---

## 3. Validacija preklapanja (Overlapping) — SQL/JPQL formula

### 3.1 Logička formula

Standardna formula za preklapanje dva **poluotvorena** intervala `[start1, end1)` i `[start2, end2)`:

```
preklapaju_se  ⟺  start1 < end2   AND   end1 > start2
```

(Negacija — **ne** preklapaju se — je `end1 <= start2 OR start1 >= end2`, tj. jedan potpuno pre ili posle drugog. Formula preklapanja je direktna negacija toga.)

### 3.2 JPQL upit

```java
@Query("""
    SELECT r FROM Reservation r
    WHERE r.employeeId = :employeeId
      AND r.status NOT IN (:excludedStatuses)
      AND r.startTime < :candidateEndTime
      AND r.endTime   > :candidateStartTime
""")
List<Reservation> findConflicting(
    @Param("employeeId") UUID employeeId,
    @Param("candidateStartTime") Instant candidateStartTime,
    @Param("candidateEndTime") Instant candidateEndTime,
    @Param("excludedStatuses") List<ReservationStatus> excludedStatuses  // [CANCELLED, REJECTED]
);
```

Poziv: `findConflicting(employeeId, newStart, newEnd, List.of(CANCELLED, REJECTED))` — ako lista nije prazna → 409 Conflict.

**Za `UPDATE`/reschedule scenario** (menjanje termina istog zapisa), dodati `AND r.id != :currentReservationId` da zapis ne konfliktuje sam sa sobom.

### 3.3 Preporučeni indeks

```sql
CREATE INDEX idx_reservation_employee_time
ON reservation (employee_id, status, start_time, end_time);
```
Redosled kolona (`employee_id` prvo, zatim `status`, pa vremenski opseg) odgovara `WHERE` klauzuli upita i omogućava efikasan range-scan bez pune tabele.

### 3.4 Race condition upozorenje (TOCTOU)

Provera preklapanja i naknadni `INSERT` **nisu atomarni** kao dva odvojena koraka — dva konkurentna zahteva za istog zaposlenog mogu oba proći proveru pre nego što ijedan izvrši insert (classic check-then-act race).

**Preporučeno rešenje (bira se jedno, treba eksplicitna odluka tima):**
1. **Pesimističko zaključavanje na nivou zaposlenog:** pre provere preklapanja, `SELECT ... FOR UPDATE` nad pomoćnim "employee lock" redom (npr. jedan red po `employeeId` u tabeli `employee_booking_lock`), unutar iste `@Transactional` metode — serijalizuje sve pokušaje rezervacije za tog zaposlenog.
2. **Povišen nivo izolacije transakcije** (`SERIALIZABLE`) samo za ovu specifičnu operaciju — jednostavnije za implementaciju, ali potencijalno češći deadlock/retry pod opterećenjem.
3. **Kombinacija sa Idempotency-Key mehanizmom** (već definisan) ublažava simptom kod retry-ja klijenta, ali **ne rešava** suštinski race između dva **različita** konkurentna zahteva (dva različita korisnika koji slučajno gađaju isti slot) — Idempotency-Key rešava samo duplirani isti zahtev.

Preporuka: opcija 1 (pesimistički lock po zaposlenom) je najpredvidljivija za MVP obim saobraćaja.

---

## 4. Menadžment izuzetaka (praznici, kolektivni odmor)

### 4.1 Potreban je novi entitet: `WorkingHoursException`

**Modul:** `reservation` (isti modul kao `WorkingHours`, ne novi modul).

| Atribut | Java tip | Opis / Biznis pravilo |
|---|---|---|
| `date` | `LocalDate` | Konkretan kalendarski datum izuzetka, u **lokalnoj zoni biznisa**. Unique constraint (jedan izuzetak po datumu). |
| `description` | `String` | Npr. `"Božić"`, `"Kolektivni godišnji odmor"` — čisto informativno/audit. |
| `fullDayClosed` | `boolean` | `true` → ceo dan je neradni, bez obzira na standardni `WorkingHours` zapis za taj dan u nedelji. |
| `overrideOpenTime` | `LocalTime` (nullable) | Ako `fullDayClosed == false` i ovo polje je popunjeno → biznis radi **skraćeno** tog datuma (npr. praznik radi od 10:00 umesto uobičajenih 08:00). |
| `overrideCloseTime` | `LocalTime` (nullable) | Isto, uz `overrideOpenTime`. Servisna validacija: ako je jedno od ova dva polja popunjeno, mora i drugo (par ide zajedno) i `fullDayClosed` mora biti `false`. |

### 4.2 Integracija u algoritam iz Dela 1

Pre koraka 2 (konstrukcija kandidata A/B), dodaje se **predfilter na nivou datuma**:

```
Korak 1.5 — Provera izuzetaka:
  exceptionForToday      = WorkingHoursException.findByDate(localDate)
  exceptionForYesterday  = WorkingHoursException.findByDate(localDate.minusDays(1))

  ako exceptionForToday postoji i fullDayClosed == true:
      → Kandidat A se automatski isključuje (bez obzira na standardni WorkingHours zapis)

  ako exceptionForYesterday postoji i fullDayClosed == true:
      → Kandidat B se automatski isključuje (jer smena koja bi se prelivala u danas
        potiče sa jučerašnjeg, praznikom blokiranog dana)

  ako exceptionForToday postoji sa overrideOpenTime/overrideCloseTime (skraćeno radno vreme):
      → Kandidat A koristi override vrednosti UMESTO standardnog WorkingHours zapisa
        za izračun A.openInstant / A.closeInstant

  (analogno za exceptionForYesterday i Kandidat B, ako je relevantno za prelivenu smenu)
```

Nakon ovog predfiltera, ostatak algoritma (Koraci 2–4 iz Dela 1) ostaje identičan — izuzeci samo **modifikuju ili eliminišu** kandidate A/B pre njihove standardne provere, ne uvode novu granu logike.

### 4.3 Zašto poseban entitet, a ne polje na `WorkingHours`

`WorkingHours` je **rekurentna, nedeljna** konfiguracija (7 zapisa, po danu u nedelji, važe zauvek). `WorkingHoursException` je **jednokratna, kalendarski-specifična** izmena. Mešanje ta dva koncepta u istu tabelu bi zahtevalo nullable `specificDate` kolonu na `WorkingHours` i komplikovalo upit — čistije je držati ih odvojeno i kombinovati ih u servisnom sloju kao što je opisano u 4.2.

### 4.4 Napomena o performansama

Pošto se `WorkingHoursException` proverava na **svaki** pokušaj kreiranja rezervacije, a broj izuzetaka je mali (par desetina godišnje), preporuka je **keširati** ceo skup budućih izuzetaka u aplikativnoj memoriji (npr. Caffeine cache sa TTL od 1h ili invalidacija pri CRUD operaciji nad `WorkingHoursException`), umesto da se za svaku rezervaciju gađa baza dva puta (za `localDate` i `localDate.minusDays(1)`).

---

## Rekapitulacija — kompletan redosled provere pri kreiranju rezervacije

```
1. Učitati CatalogItem (serviceId) → mora biti active && type == SERVICE
2. endTime = startTime + CatalogItem.durationMinutes   (izračunato, ne primljeno od klijenta)
3. Proveriti da je startTime u budućnosti (Instant.now() < startTime)
4. [Deo 4] Proveriti WorkingHoursException za localDate i localDate.minusDays(1)
5. [Deo 1+2] Pronaći aktivnu smenu (Kandidat A ili B) i proveriti da [startTime, endTime)
   staje unutar [activeShift.openInstant, activeShift.closeInstant)
6. [Deo 3] Proveriti preklapanje sa postojećim rezervacijama istog employeeId
   (uz pesimistički lock radi sprečavanja race condition-a)
7. Kreirati Reservation zapis sa status = PENDING
```

Ovih 7 koraka se direktno prevodi u 7 metoda/provera unutar `ReservationService.createReservation()`, svaka testabilna nezavisno.

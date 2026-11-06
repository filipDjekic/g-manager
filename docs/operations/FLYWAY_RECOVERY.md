# Flyway validacija i oporavak gaming migracija

## Potvrđen uzrok

Na lokalnom MySQL 8.4.11 serveru `g-manager-fresh-mysql-1`, u šemi `gmanager`, istorija je sadržala 48 uspešnih migracija. Backend log sa Flyway 12.4.0 navodi konkretno:

```text
Migration checksum mismatch for migration version 48
Applied to database : -366965518
Resolved locally    : -777206549
```

Izvedene Spring greške za `entityManagerFactory`, `userRepository`, security konfiguraciju i Tomcat posledica su neuspešne Flyway inicijalizacije. U pregledanoj bazi nema neuspešnog zapisa migracije niti nedostajuće primenjene verzije. `V49` u trenutku dijagnostike nije bio primenjen.

Provereni su svi primenjeni checksum-i i Git istorija SQL fajlova:

| Verzija | Nalaz | Postupak |
| --- | --- | --- |
| V9 | Menjana u `f6b5d0c` posle prvog uvođenja: uklonjene NOT NULL izmene refresh tokena. Trenutni checksum odgovara bazi. | Bez prepisivanja istorije. |
| V13 | Menjana u `e601aaf`: dodata kolona `correlation_id`. Trenutni checksum odgovara bazi. | Bez prepisivanja istorije. |
| V40, V41 | `b044262` razdvojio compound ALTER izraze; `dcb49ea` vratio originalne fajlove. Trenutni checksum-i odgovaraju bazi. | Originali ostaju neizmenjeni; H2 prilagođavanje ostaje isključivo u testovima. |
| V48 | Fajl nije bio u Git istoriji, ali je već bio uspešno primenjen. Naknadno je promenjen uslov isteka paketa, obračun `balance_after` i redosled jedinstvenih ograničenja. | Vraćen originalni SQL, potvrđen checksum-om `-366965518`. |
| V49 | Nova cena gaming minuta; nije primenjena u pregledanoj bazi. | Zadržan postojeći distribuirani fajl. |
| V50 | Nova dopuna istorijski neprevedenog vremena. | Samo nova verzija, bez ponovnog dodavanja tabela ili kolona. |

V1–V47 ne zahtevaju korekciju: svi odgovaraju istoriji konkretne baze. Vraćanje V9/V13 na njihov najstariji Git sadržaj napravilo bi nove checksum konflikte.

## Izvršena zaštita podataka

Pre migracije zaustavljen je backend u restart petlji. Baza nije resetovana. Napravljen je `mysqldump` sa `--single-transaction`, rutinama, triggerima i događajima; lozinka nije prosleđivana kroz javne argumente niti zapisivana u izveštaj. Dump je sačuvan van Git repozitorijuma, pod korisnikovim `.codex/backups` direktorijumom. Tačna putanja, veličina i SHA-256 nalaze se u lokalnom `artifacts/flyway-backup-manifest.json`.

Backup je vraćen u zaseban MySQL kontejner bez otvorenih portova i bez mreže. Svih osam poslovnih tabela odgovara kontrolnim SHA-256 vrednostima iz originalne baze. Podaci originalne baze nisu korišćeni u testovima koji brišu ili kreiraju šeme.

Backup: `%USERPROFILE%\.codex\backups\g-manager-flyway-20261106T175707Z-b97e25\gmanager-before-flyway-fix.sql` (2.300.226 bajtova). SHA-256: `f86aaed6472dd476ecc9321df371f06818cf625e745b34af6b80167c2d80d040`. Dump sadrži privatne podatke i ostaje van repozitorijuma.

Početno stanje: 4 korisnika, 2 naloga vremena, ukupno 3557 sekundi, 1 finansijska operacija ukupne vrednosti 500.00 RSD i 1 završena sesija. Evidencija vremena odgovara saldima. U toj bazi nema dodatnih istorijskih minuta koje treba preneti preko V50.

## Ponašanje novih migracija

`V48` se više ne menja. `V49` dodaje samo novu konfiguraciju i snimak cene u postojeće finansijske tabele, uz nepodešenu početnu cenu.

`V50` upoređuje preostale istorijske paket-minute sa količinom koju je originalni V48 već preneo. Dodeljuje isključivo pozitivnu razliku. Ne poredi ih sa trenutnim saldom, jer je korisnik deo tog vremena mogao potrošiti ili dodatno kupiti. Svaka dopuna ima jedinstveni `legacy-packages-no-expiry:<customerId>` izvor. Evidencija i saldo ažuriraju se u jednoj transakciji. Ponovljeno izvršavanje ne duplira vreme, čak ni posle kasnije potrošnje.

V50 ne menja korisnike, uplate, sesije, stare pakete ili njihove izvorne stavke. Novčani kredit se ne konvertuje u minute. Testovi proveravaju nadogradnju postojeće V48/V49 baze, novu praznu bazu, stari paket koji istekne nakon konverzije i ponovljeno izvršavanje dopune.

## Pravila za sledeće izmene

- Primenjene ili već distribuirane SQL migracije ostaju nepromenljive. Dodaje se sledeća verzija.
- `MigrationImmutabilityTest` proverava Flyway CRC32 checksum-e iz `gm/src/test/resources/db/released-migrations.csv`.
- Ne uključivati `validate-on-migrate=false`, automatski `repair`, `out-of-order` ili ignorisanje checksum grešaka kao rešenje.
- Kod nadogradnje baze koja je još na V47, proveriti duple aktivne sesije pre originalnog V48: njegova originalna jedinstvena ograničenja ostaju deo istorijskog ugovora. Duple sesije moraju se razrešiti poslovnim postupkom prethodne verzije aplikacije uz backup; ne prepisivati V48.

```sql
SELECT customer_id, COUNT(*) FROM gaming_sessions
WHERE status='ACTIVE' AND customer_id IS NOT NULL
GROUP BY customer_id HAVING COUNT(*)>1;
SELECT resource_id, COUNT(*) FROM gaming_sessions
WHERE status='ACTIVE' GROUP BY resource_id HAVING COUNT(*)>1;
```

## Repair

Za ovu grešku `repair` nije potreban: originalni V48 je vraćen i odgovara sačuvanoj istoriji. Nije izvršen `repair`, izmena/brisanje schema history ili reset baze.

Ako neki budući incident nema dostupnu originalnu migraciju, prvo sačuvati i testirati backup, identifikovati sve razlike i proveriti stvarnu šemu i podatke na izolovanoj kopiji. Tek kada je dokazana ekvivalentnost i odobrena konkretna promena istorije može se razmatrati ručni `repair`. Izmena checksum-a sama ne izvršava SQL, ne dodaje nedostajuće kolone i ne popravlja nepotpuno izvršenu migraciju.

## Provere

Regresioni testovi i kompletan build pokreću se komandom iz `gm`:

```powershell
.\mvnw.cmd -Pmysql-it '-Dit.test=GamingTimeMigrationIT,GamingTimeMySqlIT' verify
```

MySQL testovi koriste isključivo nove Testcontainers baze. Lokalni deployment se zatim proverava preko Flyway startup loga i `/actuator/health/readiness`, uz poređenje originalnih poslovnih podataka pre i posle migracije. Lokalni dokazi su u `artifacts/flyway-*`.

### Provera obnovljenog backupa

Isti novi backend image pokrenut je na izolovanoj kopiji backupa: validirano je 50 migracija, uspešno su primenjene samo V49 i V50, Hibernate validacija je prošla i readiness je vratio `UP`. Drugo pokretanje ponovo je validiralo svih 50 migracija i prijavilo da dodatne migracije nisu potrebne. Svih osam poslovnih tabela zadržalo je originalne vrednosti; V1–V48 istorija ostala je nepromenjena. Privremeni kontejneri koriste zasebne baze i uklanjaju se nakon provere.

### Konačni rezultat, 6. novembar 2026.

| Provera | Rezultat |
| --- | --- |
| Kompletan backend `verify`, komanda iznad | Uspešan build, Checkstyle i coverage provera; 289 testova bez grešaka |
| `GamingTimeMySqlIT` | 20 testova, bez grešaka i preskakanja |
| `GamingTimeMigrationIT` na MySQL 8.4 | 3 testa, bez grešaka i preskakanja |
| `docker compose build backend` | Uspešan image build |
| Lokalni backend nakon `docker compose up -d --no-deps backend` | `healthy`, readiness `UP`, uspešna Hibernate validacija |
| Flyway lokalne baze | Uspešno validirano 50 migracija; primenjene V49 i V50 |
| Originalna istorija V1–V48 | Script, checksum i success nepromenjeni; V48 ostaje `-366965518` |
| Postojeći poslovni podaci | SHA-256 i broj redova svih osam tabela jednaki početnim vrednostima za sve originalne kolone |

Očuvani su svi korisnici (4), nalozi vremena (2, ukupno 3557 sekundi), stavke vremena (11), uplata (1, ukupno 500.00 RSD), završena sesija (1), dodela računara (1) i prazne istorijske paket/wallet tabele. Nove nullable kolone cene nisu menjale postojeće finansijske vrednosti. Sva 50 zapisa istorije imaju `success=1`; V49 ima checksum `-904918995`, a V50 `-25807661`.

Dokazi: `artifacts/flyway-local-startup.log`, `artifacts/flyway-clone-startup.log`, `artifacts/flyway-local-after-verification.json`, `artifacts/flyway-clone-verification.json` i Maven Surefire/Failsafe izveštaji u `gm/target`. Nisu izvršeni `repair`, ručni SQL nad Flyway istorijom niti reset originalne baze.

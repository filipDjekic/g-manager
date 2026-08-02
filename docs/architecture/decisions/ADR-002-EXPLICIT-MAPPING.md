# ADR-002 — Eksplicitno ručno DTO mapiranje

Status: prihvaćeno  
Datum: 2026-08-02  
Stage: 2

## Kontekst

`pom.xml` je sadržao MapStruct API i annotation processor, ali nijedan mapper
nije postojao. Svi response DTO modeli imaju male, pregledne `from(...)`
factory metode.

## Razmatrane opcije

1. Nastaviti sa ručnim mapiranjem i ukloniti neiskorišćen dependency.
2. Migrirati sve postojeće factory metode na MapStruct.
3. Dozvoliti mešoviti pristup bez pravila.

## Odluka

Izabrana je opcija 1. Za trenutnu veličinu DTO-a eksplicitne factory metode su
čitljivije od dodatnog code-generation sloja. MapStruct i processor su uklonjeni
iz build-a. Mešoviti pristup nije dozvoljen.

## Pravila

- Request DTO se eksplicitno primenjuje u application servisu.
- Response DTO mapiranje ostaje u `Response.from(entity)` ili namenskom ručnom
  mapperu kada factory postane složen.
- JPA entitet se ne vraća iz kontrolera niti pojavljuje kao serialized DTO član.
- Mapiranje koje kombinuje više agregata pripada application/read servisu, ne
  entitetu.
- MapStruct se može ponovo razmotriti samo ADR-om ako broj/kompleksnost mappera
  postane merljiv problem.

## Posledice

- Manji dependency i annotation-processing surface.
- Nema skrivene generisane logike.
- Promene DTO-a zahtevaju eksplicitnu compile/test izmenu factory-ja.
- Boilerplate može porasti; tada se odluka ponovo evaluira.

## Migracija i rollback

Nema runtime ni data migracije. Postojeće ručno mapiranje je zadržano, a samo
neiskorišćene Maven stavke su uklonjene.

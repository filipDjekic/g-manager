# ADR-001 — Modularni monolit sa enforce-ovanim package granicama

Status: prihvaćeno  
Datum: 2026-08-02  
Stage: 2

## Kontekst

G-Manager je jedan Spring Boot deployment sa jasnim feature paketima, ali su
`user ↔ security` i `user ↔ auth` zavisnosti formirale cikluse. Sistem nema
operativnu ili organizacionu potrebu za mikroservisima ili više Maven modula.

## Razmatrane opcije

1. Zadržati neprovereni package-by-feature.
2. Jedan Maven modularni monolit sa ArchUnit pravilima i malim portovima.
3. Spring Modulith kao obavezni framework.
4. Više Maven modula ili mikroservisi.

## Odluka

Izabrana je opcija 2. Top-level feature paketi ostaju deployment moduli.
ArchUnit proverava cikluse, controller/repository i DTO granice.
`common.security` sadrži stabilne identity portove, dok implementacije ostaju u
`security` i `auth`. Spring Modulith nije uveden jer trenutni testovi ne traže
njegov runtime/event model.

## Posledice

- Dependency graf je automatski enforce-ovan.
- Uklonjeni su `user → security` implementation i `user → auth` pravci.
- Novi cross-module use case zahteva facade/port umesto direktne povratne veze.
- Sistem ostaje jednostavan za lokalni razvoj i jedan deployment.
- Mikroservisni split ostaje moguć kasnije na osnovu stvarnih granica i metrike.

## Migracija i rollback

Promena je interna: `Role`, `AuthenticatedUser` i portovi su premešteni bez
promene JSON enum vrednosti, DB kolona ili API-ja. Rollback nije data operacija;
prethodni imports mogu se vratiti, ali bi ponovo aktivirali ArchUnit cycle kvar.

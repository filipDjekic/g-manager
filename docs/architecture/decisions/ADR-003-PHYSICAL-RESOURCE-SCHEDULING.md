# ADR-003: Lokacije i fizički resursi

Status: prihvaćeno i implementirano; aktuelno pojašnjenje 1. novembra 2026.

## Odluka

`resource` poseduje Location, Area, PhysicalResource i dodele zaposlenih. Resurs referencira postojeću SERVICE stavku; cena i trajanje ostaju u katalogu. Cross-module identiteti ostaju UUID reference, uz SQL constraints i module contracts.

Rezervacija može biti employee-based ili resource-based prema usluzi. `catalog_items.requires_resource` iz V37 zahteva fizički resurs za odgovarajući tok; istorijske employee rezervacije nisu razlog da se preskoči novo pravilo. Backend zaključava relevantne redove i proverava `[start,end)` overlap, aktivnost, bookability i service kompatibilnost. Mapa je projekcija, ne authorization ili concurrency granica.

OWNER/ADMIN upravljaju resursima. EMPLOYEE operativa koristi aktivne konkretne `user_resource_assignments`; V38 je jednokratno prenela tadašnje location grant-ove. Nova location dodela ne daje implicitno sve resource dozvole. Nema nove role ili tenant modela.

## API i posledice

Aktuelne resource rute su u [API vodiču](../../reference/API.md); uključuju locations/areas/resources, floor plan, booking/availability i employee assignments. Backend izvodi lokaciju iz odabranog resursa i proverava scope pri svakoj promeni.

V28 uvodi fizički model, a kasnije migracije ga dopunjuju. [Seed](../../DEVELOPMENT_SEED.md) se pokreće nakon aktuelnih migracija i ne dodeljuje sam employee resource grant-ove. [Baza](../../reference/DATABASE.md) opisuje migracije i kompatibilnost rollback-a.

# Stage 9 — Customer/management catalog separation

Katalog koristi postojeće `/api/v1/catalog` ugovore. Backend već primorava korisnike bez management role da vide samo aktivne stavke, pa novi endpoint, projekcija i migracija nisu potrebni.

Customer prikaz je fokusiran na pregled ponude: pretraga, izbor tipa, kartice aktivnih proizvoda i usluga i direktne akcije. Akcija za uslugu otvara postojeći tok zakazivanja sa izabranom uslugom, a akcija proizvoda otvara postojeću korpu sa količinom jedan. Customer ne vidi saved views, status/cenovne administrativne filtere, selekciju, bulk komande, obrisane stavke, upload niti create/edit/deactivate kontrole.

`OWNER` i `ADMIN` zadržavaju postojeće filtere, saved views, bulk aktivaciju/deaktivaciju, soft-delete/restore, upload slike i uređivanje. Create/edit forma je premeštena u postojeći pristupačni modal, bez promene API ugovora.

Stage ne menja checkout, izračunavanje cena ili serversku validaciju narudžbine; to ostaje u obimu Stage-a 10.

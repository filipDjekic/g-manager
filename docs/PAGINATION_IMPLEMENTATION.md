# Implementacija paginacije

Implementirano direktno u kodu. Svih 14 modula ima povezanu frontend i backend paginaciju. Status oznacava implementaciju, a ne potvrdu izvrsavanjem aplikacije.
Po zahtevu nisu pokretani build, lint, testovi ni Docker. Migracija nije primenjena na bazu. Postojeci fixture-i prilagodjeni su novim API ugovorima; nisu izvrsavani.

| Modul | Frontend | Backend | Paginacija |
|---|---|---|---|
| Istorija generisanih izvestaja | Implementirano: ReportsPage | Implementirano: GET `/reports` | Server-side, 10 |
| Odsustva zaposlenih | Implementirano: EmployeeTimeOffSettings; EmployeeProfile | Implementirano: GET `/time-off; /users/employees/{id}/time-off` | Server-side, 10 |
| Bezbednosna istorija | Implementirano: SecurityHistory | Implementirano: GET `/auth/security-events` | Server-side, 20 |
| Gaming novcanik | Implementirano: GamingWalletPanel: ledger, transakcije, paketi | Implementirano: GET `/gaming-billing/customers/{id}/history/{kind}` | Server-side, 10 po listi |
| CRM beleske | Implementirano: CustomerCrmPanel | Implementirano: GET `/customers/{id}/crm/notes` | Server-side, 10 |
| Gaming istorija kupca i zaposlenog | Implementirano: GamingVisitHistory: CustomerHomePage i CustomerProfile | Implementirano: GET `/gaming-sessions/me/history; /gaming-sessions/customer/{id}/history` | Server-side, 10 |
| Istorija gaming stanice | Implementirano: StationDetails; GamingOperationsWorkspace | Implementirano: GET `/gaming-operations/stations/{id}/history` | Server-side, 20 |
| Izuzeci radnog vremena | Implementirano: WorkingHoursExceptions | Implementirano: GET `/working-hours/exceptions` | Server-side, 10 |
| Windows Client azuriranja | Implementirano: StationClientUpdates | Implementirano: GET `/stations/{id}/client-updates` | Server-side, 10 |
| Rasporedi automatskih izvestaja | Implementirano: ReportsPage | Implementirano: GET `/reports/schedules` | Server-side, 10 |
| Gaming aplikacije i profili | Implementirano: StationAdministration | Implementirano: GET `/stations/applications/page; /stations/application-profiles/page` | Server-side, 10 po listi |
| Gaming tarife i vremenski paketi | Implementirano: GamingTariffSettings; GamingWalletPanel | Implementirano: GET `/gaming-billing/tariffs/page; istorija paketa novcanika` | Server-side, 10 |
| Gaming finansijske detaljne tabele | Implementirano: GamingFinanceReport / DetailRows | Implementirano: GET `/gaming-billing/report/{table}` | Server-side, 20 po tabeli |
| Profil klijenta: rezervacije i narudzbine | Implementirano: CustomerProfile | Implementirano: GET `/customers/{id}/reservations; /customers/{id}/orders` | Server-side, 10 po listi |

Sve putanje su relativne u odnosu na `/api/v1`.

## Ugovor, stanje i izgled

Odgovori koriste content, page (od 0), size, totalElements i totalPages.
Maksimalna velicina stranice je 100 i deli se sa MVC konfiguracijom. Sortiranje odredjuje server i ukljucuje jedinstveni ID.
Spring Data Page ili SQL LIMIT/OFFSET sa COUNT ogranicavaju rezultate u bazi; istorija se ne paginira u memoriji.

Koristi se postojeci Pagination sa numerisanim stranicama kao podrazumevanim prikazom, zajednickim aktivnim stilom, rasponom, ukupnim brojem i responzivnim kontrolama.
usePagedQuery koristi postojeci useResettableState: promena filtera ili entiteta vraca na prvu stranicu, ukljucujuci ponovno ciscenje filtera.
Query keys razdvajaju entitet, filtere, stranicu i velicinu; zastareli odgovori ne prepisuju prikaz novijeg kljuca.
Posle brisanja poslednje stavke broj stranice se uskladjuje sa novim brojem stranica.
Liste imaju nezavisno stanje; promena stranice ne resetuje forme, drawer ili dijalog.
Istorija izvestaja periodicki se osvezava dok prikazana stranica sadrzi posao u obradi.

Postojece paginacije korisnika, zaposlenih, klijenata, rezervacija, mojih rezervacija, narudzbina, mojih narudzbina, kataloga, stanica, operativnog panela, liste cekanja, audit loga i obavestenja zadrzane su; dele dopunjeni Pagination stil.

## Odvojeni autoritativni podaci

- Aktivne sesije koriste `/gaming-sessions/me/active` i `/gaming-sessions/customer/{id}/active`. Istorija prikazuje zavrsene sesije; provera aktivne sesije ne zavisi od istorijske stranice.
- Kalendar izuzetaka koristi `/working-hours/exceptions/calendar?from=...&to=...`, sa kompletnim podacima za ograniceni period. Obracun dostupnosti i provere konflikata ostali su nezavisni od paginacije.
- Pregled konfiguracije koristi `/working-hours/exceptions/summary` i `/time-off/summary`, bez preuzimanja istorije radi brojanja.
- Saldo novcanika racuna se iz kompletnog ledger-a. Operativni izbor vraca sve neistekle pakete sa preostalim minutima, prema poslovnom satu; kompletna istorija paketa je zasebna.
- Izbor originalne uplate za refundaciju koristi `/gaming-billing/customers/{id}/refundable-payments`, nezavisno od stranice transakcija. Postojece provere finansijskih komandi ostale su autoritativne.
- Finansijski KPI i male kategorijske tabele dolaze iz `/gaming-billing/report`; detalji byStation, byLocation, byEmployee i packages koriste zasebne paginirane upite.
- Kompletni izbori tarifa, aplikacija, profila i stavki jednog profila ostali su dostupni konfiguracionim i naplatnim dijalozima.
- Aktivni uredjaji i postojeci nedavni bezbednosni indikatori koriste nezavisan ograniceni snapshot `/auth/security-events/recent`; paginirana istorija i filteri obuhvataju kompletan skup korisnikovih dogadjaja.

## Promene API-ja i pristup podacima

Istorijski endpoint-i koji su vracali nizove sada vracaju PageResponse; njihovi potrosaci su prilagodjeni.
Profil klijenta sadrzi zbirne podatke, a rezervacije i narudzbine imaju zasebne endpoint-e.
CRM metadata sadrzi verziju i tagove; beleske su zaseban paginirani resurs.
Novcanik vise ne ugradjuje transakcije i ledger u zbirni odgovor. Finansijski zbirni odgovor vise ne ugradjuje detaljne tabele.
Endpoint-i prihvataju page i size; /page i /history aliasi koriste isti ugovor tamo gde postoje.

Zadrzane su postojece provere dozvola i obuhvata podataka. Self-service proverava trenutnog korisnika; page i size ne menjaju korisnicki ili lokacijski obuhvat.
Zaposleni vidi gaming istoriju samo za dozvoljene resurse. Istorija stanice kombinuje komande i enforcement dogadjaje u jednom SQL UNION ALL upitu sa zajednickim sortiranjem i ukupnim brojem.
Paginirani profili grupno ucitavaju stavke i referencirane definicije. Istorija narudzbina ne koristi collection fetch join pri paginaciji.

## Migracija i ogranicenja provere

`gm/src/main/resources/db/migration/V45__history_pagination_indexes.sql` dodaje indekse za korisnicku istoriju gaming sesija, ledger-a, finansijskih operacija i paketa, kao i redosled odsustava i komandi stanice.
Postojeci odgovarajuci indeksi za ostale module zadrzani su. Migracija nije primenjena i performanse nisu merene.
Kompajliranje, runtime ponasanje, SQL izvrsavanje, mobilni prikaz i automatizovani scenariji nisu izvrsno provereni, saglasno zahtevu da se ne pokrecu build/lint/test/Docker komande.
Nove biblioteke nisu dodavane.

## Svi izmenjeni i dodati fajlovi

- Dodat: [docs/PAGINATION_IMPLEMENTATION.md](../docs/PAGINATION_IMPLEMENTATION.md)
- Izmenjen: [frontend/g-manager/src/api/authApi.ts](../frontend/g-manager/src/api/authApi.ts)
- Izmenjen: [frontend/g-manager/src/api/customerApi.ts](../frontend/g-manager/src/api/customerApi.ts)
- Izmenjen: [frontend/g-manager/src/api/gamingBillingApi.ts](../frontend/g-manager/src/api/gamingBillingApi.ts)
- Izmenjen: [frontend/g-manager/src/api/gamingSessionApi.ts](../frontend/g-manager/src/api/gamingSessionApi.ts)
- Izmenjen: [frontend/g-manager/src/api/reportApi.ts](../frontend/g-manager/src/api/reportApi.ts)
- Izmenjen: [frontend/g-manager/src/api/stationApi.ts](../frontend/g-manager/src/api/stationApi.ts)
- Izmenjen: [frontend/g-manager/src/api/timeOffApi.ts](../frontend/g-manager/src/api/timeOffApi.ts)
- Izmenjen: [frontend/g-manager/src/api/userApi.ts](../frontend/g-manager/src/api/userApi.ts)
- Izmenjen: [frontend/g-manager/src/api/workingHoursApi.ts](../frontend/g-manager/src/api/workingHoursApi.ts)
- Izmenjen: [frontend/g-manager/src/components/ui/Pagination.tsx](../frontend/g-manager/src/components/ui/Pagination.tsx)
- Izmenjen: [frontend/g-manager/src/components/ui/ui.css](../frontend/g-manager/src/components/ui/ui.css)
- Izmenjen: [frontend/g-manager/src/customers/CustomerCrmPanel.tsx](../frontend/g-manager/src/customers/CustomerCrmPanel.tsx)
- Izmenjen: [frontend/g-manager/src/customers/CustomerProfile.tsx](../frontend/g-manager/src/customers/CustomerProfile.tsx)
- Izmenjen: [frontend/g-manager/src/employees/EmployeeProfile.tsx](../frontend/g-manager/src/employees/EmployeeProfile.tsx)
- Izmenjen: [frontend/g-manager/src/gaming/GamingOperationsWorkspace.tsx](../frontend/g-manager/src/gaming/GamingOperationsWorkspace.tsx)
- Dodat: [frontend/g-manager/src/gaming/GamingVisitHistory.tsx](../frontend/g-manager/src/gaming/GamingVisitHistory.tsx)
- Izmenjen: [frontend/g-manager/src/gaming/GamingVisitList.tsx](../frontend/g-manager/src/gaming/GamingVisitList.tsx)
- Izmenjen: [frontend/g-manager/src/gaming/GamingWalletPanel.tsx](../frontend/g-manager/src/gaming/GamingWalletPanel.tsx)
- Izmenjen: [frontend/g-manager/src/pages/CustomerHomePage.tsx](../frontend/g-manager/src/pages/CustomerHomePage.tsx)
- Izmenjen: [frontend/g-manager/src/pages/CustomersPage.component.test.tsx](../frontend/g-manager/src/pages/CustomersPage.component.test.tsx)
- Izmenjen: [frontend/g-manager/src/pages/ReportsAi.test.tsx](../frontend/g-manager/src/pages/ReportsAi.test.tsx)
- Izmenjen: [frontend/g-manager/src/pages/ReportsPage.test.tsx](../frontend/g-manager/src/pages/ReportsPage.test.tsx)
- Izmenjen: [frontend/g-manager/src/pages/ReportsPage.transactions.test.tsx](../frontend/g-manager/src/pages/ReportsPage.transactions.test.tsx)
- Izmenjen: [frontend/g-manager/src/pages/ReportsPage.tsx](../frontend/g-manager/src/pages/ReportsPage.tsx)
- Izmenjen: [frontend/g-manager/src/pages/SettingsPage.tsx](../frontend/g-manager/src/pages/SettingsPage.tsx)
- Izmenjen: [frontend/g-manager/src/pages/StationsPage.tsx](../frontend/g-manager/src/pages/StationsPage.tsx)
- Dodat: [frontend/g-manager/src/query/usePagedQuery.ts](../frontend/g-manager/src/query/usePagedQuery.ts)
- Izmenjen: [frontend/g-manager/src/reports/GamingFinanceReport.tsx](../frontend/g-manager/src/reports/GamingFinanceReport.tsx)
- Izmenjen: [frontend/g-manager/src/sessions/SessionDashboardViews.tsx](../frontend/g-manager/src/sessions/SessionDashboardViews.tsx)
- Izmenjen: [frontend/g-manager/src/sessions/useSessionDashboard.ts](../frontend/g-manager/src/sessions/useSessionDashboard.ts)
- Izmenjen: [frontend/g-manager/src/settings/EmployeeTimeOffSettings.tsx](../frontend/g-manager/src/settings/EmployeeTimeOffSettings.tsx)
- Izmenjen: [frontend/g-manager/src/settings/GamingTariffSettings.tsx](../frontend/g-manager/src/settings/GamingTariffSettings.tsx)
- Izmenjen: [frontend/g-manager/src/settings/SetupOverview.tsx](../frontend/g-manager/src/settings/SetupOverview.tsx)
- Izmenjen: [frontend/g-manager/src/settings/WorkingHoursExceptions.tsx](../frontend/g-manager/src/settings/WorkingHoursExceptions.tsx)
- Izmenjen: [frontend/g-manager/src/stations/StationAdministration.tsx](../frontend/g-manager/src/stations/StationAdministration.tsx)
- Izmenjen: [frontend/g-manager/src/stations/StationClientUpdates.test.tsx](../frontend/g-manager/src/stations/StationClientUpdates.test.tsx)
- Izmenjen: [frontend/g-manager/src/stations/StationClientUpdates.tsx](../frontend/g-manager/src/stations/StationClientUpdates.tsx)
- Izmenjen: [frontend/g-manager/src/stations/StationDetails.tsx](../frontend/g-manager/src/stations/StationDetails.tsx)
- Izmenjen: [frontend/g-manager/src/test/fixtures.ts](../frontend/g-manager/src/test/fixtures.ts)
- Izmenjen: [frontend/g-manager/src/test/server.ts](../frontend/g-manager/src/test/server.ts)
- Izmenjen: [frontend/g-manager/src/types/customer.types.ts](../frontend/g-manager/src/types/customer.types.ts)
- Izmenjen: [gm/src/main/java/com/game_manager/gm/auth/AuthController.java](../gm/src/main/java/com/game_manager/gm/auth/AuthController.java)
- Izmenjen: [gm/src/main/java/com/game_manager/gm/auth/AuthService.java](../gm/src/main/java/com/game_manager/gm/auth/AuthService.java)
- Izmenjen: [gm/src/main/java/com/game_manager/gm/auth/SecurityEventRepository.java](../gm/src/main/java/com/game_manager/gm/auth/SecurityEventRepository.java)
- Izmenjen: [gm/src/main/java/com/game_manager/gm/bootstrap/SecurityConfig.java](../gm/src/main/java/com/game_manager/gm/bootstrap/SecurityConfig.java)
- Izmenjen: [gm/src/main/java/com/game_manager/gm/common/config/PaginationConfig.java](../gm/src/main/java/com/game_manager/gm/common/config/PaginationConfig.java)
- Dodat: [gm/src/main/java/com/game_manager/gm/common/dto/PageRequests.java](../gm/src/main/java/com/game_manager/gm/common/dto/PageRequests.java)
- Dodat: [gm/src/main/java/com/game_manager/gm/common/dto/SqlPages.java](../gm/src/main/java/com/game_manager/gm/common/dto/SqlPages.java)
- Izmenjen: [gm/src/main/java/com/game_manager/gm/customer/CustomerController.java](../gm/src/main/java/com/game_manager/gm/customer/CustomerController.java)
- Izmenjen: [gm/src/main/java/com/game_manager/gm/customer/CustomerService.java](../gm/src/main/java/com/game_manager/gm/customer/CustomerService.java)
- Izmenjen: [gm/src/main/java/com/game_manager/gm/customer/crm/CustomerCrmController.java](../gm/src/main/java/com/game_manager/gm/customer/crm/CustomerCrmController.java)
- Izmenjen: [gm/src/main/java/com/game_manager/gm/customer/crm/CustomerCrmNoteRepository.java](../gm/src/main/java/com/game_manager/gm/customer/crm/CustomerCrmNoteRepository.java)
- Izmenjen: [gm/src/main/java/com/game_manager/gm/customer/crm/CustomerCrmService.java](../gm/src/main/java/com/game_manager/gm/customer/crm/CustomerCrmService.java)
- Izmenjen: [gm/src/main/java/com/game_manager/gm/customer/crm/dto/CustomerCrmResponse.java](../gm/src/main/java/com/game_manager/gm/customer/crm/dto/CustomerCrmResponse.java)
- Izmenjen: [gm/src/main/java/com/game_manager/gm/customer/dto/CustomerDetailResponse.java](../gm/src/main/java/com/game_manager/gm/customer/dto/CustomerDetailResponse.java)
- Izmenjen: [gm/src/main/java/com/game_manager/gm/gamingsession/GamingSessionController.java](../gm/src/main/java/com/game_manager/gm/gamingsession/GamingSessionController.java)
- Izmenjen: [gm/src/main/java/com/game_manager/gm/gamingsession/GamingSessionRepository.java](../gm/src/main/java/com/game_manager/gm/gamingsession/GamingSessionRepository.java)
- Izmenjen: [gm/src/main/java/com/game_manager/gm/gamingsession/GamingSessionService.java](../gm/src/main/java/com/game_manager/gm/gamingsession/GamingSessionService.java)
- Izmenjen: [gm/src/main/java/com/game_manager/gm/gamingsession/billing/GamingBillingController.java](../gm/src/main/java/com/game_manager/gm/gamingsession/billing/GamingBillingController.java)
- Izmenjen: [gm/src/main/java/com/game_manager/gm/gamingsession/billing/GamingBillingService.java](../gm/src/main/java/com/game_manager/gm/gamingsession/billing/GamingBillingService.java)
- Izmenjen: [gm/src/main/java/com/game_manager/gm/gamingsession/billing/GamingFinanceReportService.java](../gm/src/main/java/com/game_manager/gm/gamingsession/billing/GamingFinanceReportService.java)
- Izmenjen: [gm/src/main/java/com/game_manager/gm/gamingsession/command/StationCommandRepository.java](../gm/src/main/java/com/game_manager/gm/gamingsession/command/StationCommandRepository.java)
- Izmenjen: [gm/src/main/java/com/game_manager/gm/gamingsession/operations/GamingOperationsBoardService.java](../gm/src/main/java/com/game_manager/gm/gamingsession/operations/GamingOperationsBoardService.java)
- Izmenjen: [gm/src/main/java/com/game_manager/gm/gamingsession/operations/GamingOperationsController.java](../gm/src/main/java/com/game_manager/gm/gamingsession/operations/GamingOperationsController.java)
- Izmenjen: [gm/src/main/java/com/game_manager/gm/order/OrderRepository.java](../gm/src/main/java/com/game_manager/gm/order/OrderRepository.java)
- Izmenjen: [gm/src/main/java/com/game_manager/gm/order/OrderService.java](../gm/src/main/java/com/game_manager/gm/order/OrderService.java)
- Izmenjen: [gm/src/main/java/com/game_manager/gm/report/ReportController.java](../gm/src/main/java/com/game_manager/gm/report/ReportController.java)
- Izmenjen: [gm/src/main/java/com/game_manager/gm/report/ReportRequestRepository.java](../gm/src/main/java/com/game_manager/gm/report/ReportRequestRepository.java)
- Izmenjen: [gm/src/main/java/com/game_manager/gm/report/ReportScheduleRepository.java](../gm/src/main/java/com/game_manager/gm/report/ReportScheduleRepository.java)
- Izmenjen: [gm/src/main/java/com/game_manager/gm/report/ReportService.java](../gm/src/main/java/com/game_manager/gm/report/ReportService.java)
- Izmenjen: [gm/src/main/java/com/game_manager/gm/reservation/ReservationRepository.java](../gm/src/main/java/com/game_manager/gm/reservation/ReservationRepository.java)
- Izmenjen: [gm/src/main/java/com/game_manager/gm/reservation/ReservationService.java](../gm/src/main/java/com/game_manager/gm/reservation/ReservationService.java)
- Izmenjen: [gm/src/main/java/com/game_manager/gm/station/StationClientUpdateController.java](../gm/src/main/java/com/game_manager/gm/station/StationClientUpdateController.java)
- Izmenjen: [gm/src/main/java/com/game_manager/gm/station/StationClientUpdateService.java](../gm/src/main/java/com/game_manager/gm/station/StationClientUpdateService.java)
- Izmenjen: [gm/src/main/java/com/game_manager/gm/station/StationController.java](../gm/src/main/java/com/game_manager/gm/station/StationController.java)
- Izmenjen: [gm/src/main/java/com/game_manager/gm/station/StationReadinessService.java](../gm/src/main/java/com/game_manager/gm/station/StationReadinessService.java)
- Izmenjen: [gm/src/main/java/com/game_manager/gm/timeoff/EmployeeTimeOffController.java](../gm/src/main/java/com/game_manager/gm/timeoff/EmployeeTimeOffController.java)
- Izmenjen: [gm/src/main/java/com/game_manager/gm/timeoff/EmployeeTimeOffRepository.java](../gm/src/main/java/com/game_manager/gm/timeoff/EmployeeTimeOffRepository.java)
- Izmenjen: [gm/src/main/java/com/game_manager/gm/timeoff/EmployeeTimeOffService.java](../gm/src/main/java/com/game_manager/gm/timeoff/EmployeeTimeOffService.java)
- Izmenjen: [gm/src/main/java/com/game_manager/gm/user/EmployeeOverviewController.java](../gm/src/main/java/com/game_manager/gm/user/EmployeeOverviewController.java)
- Izmenjen: [gm/src/main/java/com/game_manager/gm/user/EmployeeOverviewService.java](../gm/src/main/java/com/game_manager/gm/user/EmployeeOverviewService.java)
- Izmenjen: [gm/src/main/java/com/game_manager/gm/workinghours/WorkingHoursController.java](../gm/src/main/java/com/game_manager/gm/workinghours/WorkingHoursController.java)
- Izmenjen: [gm/src/main/java/com/game_manager/gm/workinghours/WorkingHoursExceptionRepository.java](../gm/src/main/java/com/game_manager/gm/workinghours/WorkingHoursExceptionRepository.java)
- Izmenjen: [gm/src/main/java/com/game_manager/gm/workinghours/WorkingHoursService.java](../gm/src/main/java/com/game_manager/gm/workinghours/WorkingHoursService.java)
- Dodat: [gm/src/main/resources/db/migration/V45__history_pagination_indexes.sql](../gm/src/main/resources/db/migration/V45__history_pagination_indexes.sql)
- Izmenjen: [gm/src/test/java/com/game_manager/gm/timeoff/EmployeeTimeOffIntegrationTest.java](../gm/src/test/java/com/game_manager/gm/timeoff/EmployeeTimeOffIntegrationTest.java)

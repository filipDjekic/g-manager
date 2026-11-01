# ADR-004: GamingSession kao runtime agregat

Status: prihvaćeno i implementirano, ne budući Stage ugovor.

## Odluka i razlog

Rezervacija opisuje planirani interval, auth sesija refresh/device životni ciklus, a `GamingSession` stvarno korišćenje jedne stanice od jednog kupca. Agregat referencira postojeće User(CUSTOMER) i PhysicalResource(GAMING_PC) identitete i opcionu rezervaciju; ne preuzima njihovu semantiku.

Start atomarno kreira ACTIVE. Dostignuti `endsAt` daje EXPIRED, a ovlašćeni ručni završetak TERMINATED uz razlog. Ne postoje dodatna CREATED/PENDING/COMPLETED gaming stanja. Produženje menja kraj istog ACTIVE agregata.

Backend Clock je autoritativan. Countdown API daje `endsAt`, `serverTime` i izvedeno preostalo vreme. Client/browser interpolacija ne menja sesiju.

## Invarijante i posledice

- Start zaključava customer pa resource i proverava jednu aktivnu sesiju po kupcu i stanici.
- Aktivnost kupca, gaming PC readiness, booking konflikt, trajanje i resource grant se proveravaju u transakciji.
- Extend/terminate proveravaju verziju i autorizaciju nad aktuelnim resursom.
- Session promena, station command, audit i outbox se čuvaju transakciono; operator vidi zasebno stanje fizičkog zaključavanja.
- Gaming događaji imaju `GAMING_SESSION_*` prefiks, a auth sesije sopstveni događajni ugovor.

Izvori su [GamingSessionService](../../../gm/src/main/java/com/game_manager/gm/gamingsession/GamingSessionService.java) i [lifecycle ugovor](../../contracts/GAMING_SESSION_LIFECYCLE.md). Odsustvo konflikta u jednom zahtevu ne zamenjuje MySQL concurrency suite ili fizički lock test.

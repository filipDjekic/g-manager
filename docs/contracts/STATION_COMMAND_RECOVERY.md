# Station command sequence and recovery

`station_commands` je durable server-to-machine projekcija uvedena u Stage-u 5.
Svaka station ima strogo rastući `sequence`; jedinstvenost `(station_id, sequence)`
je zaštićena u bazi, a cursor red se zaključava pri alokaciji broja. Session promena,
cursor i komanda se commit-uju u istoj transakciji.

Command tipovi u v1 su `SESSION_STARTED`, `SESSION_EXTENDED` i
`SESSION_TERMINATED`. Prirodni istek koristi `SESSION_TERMINATED` sa
`payload.status=EXPIRED`. Payload sadrži identitete i runtime vremena, nikada
credential, password, access/refresh token ili machine private key.

`available_at` određuje kada se komanda može preuzeti. `acknowledged_at` je null
dok Client ne potvrdi primenu; ack API dolazi u machine Stage-u. Client mora čuvati
poslednji potvrđeni cursor, tražiti samo veće sequence vrednosti, primenjivati ih
redosledom i bezbedno ignorisati već primenjeni sequence.

Komande se zadržavaju najmanje `GAMING_SESSION_COMMAND_RETENTION_DAYS` dana.
Retention briše samo potvrđene komande; nepotvrđena komanda ne nestaje zbog starosti.
Primer v1 payload-a je u `fixtures/station-commands-v1.json`.

Expiration i reconciliation koriste postojeći background-job lease mehanizam.
Ako worker padne, posao po isteku lease-a ponovo preuzima drugi worker. Ponovljeno
izvršenje expiry posla ne menja terminalnu sesiju. Reconciliation poredi session
`last_command_sequence` sa durable projekcijom i dopisuje trenutno stanje samo kada
projekcija nedostaje ili je zastarela; nikada ne pomera `endsAt`.

Operativno: proveriti metrike `gmanager.gaming.sessions.expired`,
`gmanager.gaming.sessions.reconciliation.repaired` i
`gmanager.gaming.station.commands.purged`. Rastući broj popravki zahteva proveru
transakcionih rollback-a i baze pre ručnih izmena; sequence se nikada ručno ne vraća.

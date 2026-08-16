# Machine enrollment, authentication and command protocol

Stage 7 odvaja station machine identitet od employee/customer naloga. Machine API
je pod `/api/v1/machine`; zaštićeni endpointi prihvataju samo short-lived machine
JWT sa `token_type=MACHINE`, audience `g-manager-machine`, station/key-version
claim-ovima i `MACHINE_PROTOCOL` scope-om. Employee JWT nije zamena.

## Enrollment

1. OWNER/ADMIN na stranici stanice kreira INITIAL ili ROTATION enrollment kod.
2. Kod važi 10 minuta, prikazuje se samo u create odgovoru, a baza čuva samo
   SHA-256 hash. Kreiranje novog koda opoziva prethodni nepotrošeni kod stanice.
3. Client lokalno generiše Ed25519 keypair i šalje kod, Base64 X.509 public key i
   verziju Client-a na `POST /api/v1/machine/enroll`.
4. Backend atomski troši kod i vraća identity ID/key version. Private key nikada
   ne napušta Client key store.

Ponovna upotreba, istekao kod, dupliran public-key fingerprint ili INITIAL kod za
stanicu sa aktivnim identitetom se odbijaju. Rotation postavlja prethodni ključ u
`ROTATING` sa ograničenim desetominutnim overlap-om; novi ključ odmah postaje
`ACTIVE`. Administrativni revoke trenutno opoziva sve aktivne/rotirajuće ključeve
stanice i nepotrošene kodove.

## Challenge i token

Client traži challenge preko `/machine/auth/challenge`. Server vraća jednokratni
32-byte nonce koji važi 60 sekundi; baza čuva samo njegov hash. Client Ed25519
ključem potpisuje UTF-8 niz:

```text
challengeId:identityId:nonce
```

`POST /machine/auth/token` prima identity, challenge, nonce i Base64URL potpis.
Challenge se pod zaključavanjem može potrošiti tačno jednom. Uspeh izdaje machine
JWT na pet minuta. Revoked identitet i ROTATING identitet posle overlap-a ne mogu
dobiti token, a već izdati token se pri svakom zahtevu ponovo proverava prema bazi.

## Station-scoped protokol

- `POST /machine/heartbeat` ažurira online/last-seen, Client status/verziju i cursor.
- `GET /machine/snapshot` vraća `serverTime`, station/session snapshot i cursor.
- `GET /machine/commands?afterSequence=N` vraća najviše 100 durable komandi samo
  autentifikovane stanice, strogo rastućim redom.
- `POST /machine/commands/{sequence}/ack` je idempotentan i ne može potvrditi
  komandu druge stanice.

Rate limit ključevi koriste machine identity ID (kod enrollment-a station ID), ne
IP adresu. Payload-i, audit i logovi ne sadrže enrollment kod, nonce, JWT, potpis
ili private key. Headless contract klijent je `MachineProtocolHarness`; njegov
`PrivateKeyStore` je namerno samo interfejs sa testnom in-memory implementacijom.
Windows-backed implementacija pripada Stage-u 8.
Harness `base` URI treba da se završava sa `/api/v1/`.

## Recovery

Ako enrollment response nije bezbedno sačuvan, kreira se novi kod; isti kod se ne
reaktivira. Kod sumnje na kompromitovanje prvo se radi revoke, zatim novi INITIAL
enrollment. Za planiranu zamenu koristi se ROTATION i stari Client mora preći na
novi identitet pre isteka overlap-a. Ne produžavati overlap ručnom izmenom baze.

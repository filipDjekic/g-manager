# Staff-managed customer onboarding

Customer je postojeći `User` sa rolom `CUSTOMER`; ne postoji paralelni customer identitet.

## Tok

1. Korisnik sa `CUSTOMER_CREATE` poziva `POST /api/v1/customers` sa imenom i email adresom.
2. Backend uvek postavlja rolu `CUSTOMER`, generiše kriptografski slučajan activation secret i vraća ga samo u tom create odgovoru.
3. Baza čuva isključivo SHA-256 hash secreta, rok važenja i consume audit. Customer do aktivacije ima nasumičan nepoznat password hash i `must_change_password=true`.
4. Customer poziva javni, rate-limited `POST /api/v1/auth/activate` sa secretom i novom lozinkom. Uspeh atomarno konzumira sve njegove aktivne kodove i postavlja `must_change_password=false`.
5. Ponovna upotreba, istekao kod i kod neaktivnog/non-customer naloga vraćaju isti generički odgovor.

Javna registracija ne postoji. `EMPLOYEE`, `ADMIN` i `OWNER` imaju uske customer create/update/deactivate dozvole; request nikada ne prima rolu. Puni employee/admin/owner user-management ostaje na postojećem `/api/v1/users` ugovoru.

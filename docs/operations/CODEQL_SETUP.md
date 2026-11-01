# CodeQL analiza i SARIF gate

Izvori su [CI workflow](../../.github/workflows/ci.yml), [SARIF checker](../../scripts/check_codeql_sarif.py) i [testovi checker-a](../../scripts/test_check_codeql_sarif.py). Ovaj pregled ne potvrđuje rezultat poslednjeg GitHub Actions izvršavanja ili dostupnost Code Scanning-a na repozitorijumu.

CI analizira Java/Kotlin i JavaScript/TypeScript, kompajlira Javu sa JDK 21, zatim koristi `github/codeql-action/analyze` sa `upload: never` i `output: codeql-results`. Rezultati se proveravaju lokalnim gate-om i čuvaju kao `codeql-results-<commit>` Actions artefakt 14 dana, uključujući neuspeh. SARIF se ovim workflow-om ne šalje u GitHub Code Scanning prikaz.

## Kriterijum blokiranja

Checker zahteva `java.sarif` i `javascript.sarif` i proverava run-ove generisanih SARIF fajlova. Nalaz sa `kind: fail` (default kada je izostavljen) i efektivnim nivoom `error` blokira proveru. Nivo se rešava prema:

1. Eksplicitnom `result.level`.
2. Rule override-u u invocation-u određenom sa `result.provenance.invocationIndex`.
3. `defaultConfiguration.level` odgovarajućeg rule-a, uključujući extension query pack i `result.rule.toolComponent`.
4. Default `warning` ako nivo nije naveden.

Suppressed i unchanged baseline nalazi se i dalje proveravaju. Numeric `security-severity` ne zamenjuje SARIF level. Warning/note ili kind koji nije fail ne prelaze finding prag ovog gate-a.

Exit code 1 znači error-level nalaz. Exit code 2 znači nedostajući/neispravan/nepodržan/nepotpun izveštaj, neuspešnu tool invocation ili error-level execution notification. Init, compile, analyze i gate su blokirajući koraci bez `continue-on-error`; artifact upload koristi `always()`.

## Lokalne komande

Za kasnije izvršavanje iz korena, uz Python 3 bez dodatnih paketa:

```bash
python3 -B -m unittest discover -s scripts -p 'test_check_codeql_sarif.py'
python3 -B scripts/check_codeql_sarif.py path/to/extracted/codeql-results
```

Na Windows-u koristiti raspoloživu `python` komandu umesto `python3`. Frontend CI contract proverava workflow očekivanja:

```powershell
cd frontend/g-manager
npm run ci:validate
npm run ci:validate:self-test
```

Koristiti npm/Node verzije iz [test vodiča](../development/TESTING.md). Nijedna od ovih provera nije izvršavana tokom reorganizacije dokumentacije.

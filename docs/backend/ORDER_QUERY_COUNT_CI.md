# Order query-count CI failure

## Cause

[CI run 149](https://github.com/filipDjekic/g-manager/actions/runs/43249341525/job/131290560312)
failed in Surefire's `OrderQueryCountIntegrationTest`, before Failsafe started the
MySQL integration tests. `-Pmysql-it` enables Failsafe; it does not change this
test's `test` profile from H2 to MySQL.

The test used `SessionFactory.getStatistics().getPrepareStatementCount()`. This
counter includes every Hibernate session belonging to that factory. Clearing it
after fixture setup excludes fixture SQL, but does not exclude scheduled work
running during the measured operation. Scheduled Hibernate reads remain enabled
in the test context; for example, `GamingTimeTicker.settle()` reads active gaming
sessions even when `app.jobs.enabled=false`.

The actual order operation executes four statements for a full page of 60 orders:

1. A server-paginated `SELECT` from `orders`.
2. A `COUNT` for the page's total size.
3. A batch `SELECT` of items for the first 50 orders.
4. A batch `SELECT` of items for the remaining 10 orders.

There is no order-item N+1 in this operation. With `@BatchSize(size = 50)`, the
bound is `2 + ceil(pageSize / 50)`, or four statements for both 60 and the supported
maximum of 100 orders. `OrderItem.order` is lazy; customer, handler and product
references are scalar IDs and do not cause additional entity loads here.
`OrderService.listInternal()` maps the page inside its transaction.
`OrderManagementService.list()` separately fetches only the page's item
collections through `findWithItems(ids)` and bulk-loads display data; its queries
are not part of the failing repository-level test.

A local unmodified run passed with four statements, confirming the failure is
timing-dependent. A deterministic reproduction issued the same active-gaming-
session repository read on another thread after clearing the factory counter.
For each of the three paging scenarios, the old assertion failed with **five
factory statements while the order session prepared exactly four**. The original
CI log does not include SQL text, so the particular scheduled query responsible
for its fifth statement cannot be identified from that log alone.

## Change

`OrderQueryCountIntegrationTest` now attaches a `SessionEventListener` to the
transaction's Hibernate session after flushing fixtures and clearing the
persistence context. Its counter includes all prepared statements in that
session, including lazy collection loads, and excludes other sessions. Global
statistics are no longer enabled, cleared or used by this test.

The threshold remains **at most four**. The test deliberately executes the
unrelated gaming-session read in another session and checks that the order
counter stays at zero. It then checks two statements for the page and its count,
followed by at most two item batches. Removing batch loading would produce a
statement per order and fail the same bound.

The scenarios cover pages `(0, 60)`, `(1, 60)` and `(0, 100)`. Each fixture contains
more than two full pages, so totals and SQL pagination are exercised. The test
checks that only the requested number of order entities enter the persistence
context and enables `hibernate.query.fail_on_pagination_over_collection_fetch`
to reject collection fetch pagination in memory.

Production mappings, services, Hibernate settings and Flyway migrations are
unchanged. The order operation remains at four SQL statements; the correction
removes unrelated SQL from the test measurement rather than claiming a production
query reduction. Native MySQL behavior still requires the Docker-backed tests;
an H2 pass alone does not establish it.

## Validation on 2026-11-12

Commands were executed from `gm/` using the cached Maven 3.9.14 distribution and
JDK 21, with `-o` and an explicit local Maven repository path.

| Check | Result |
| --- | --- |
| Original unmodified `OrderQueryCountIntegrationTest` | 1 passed; four order SQL statements; intermittent CI failure did not occur in this run |
| Deterministic reproduction with the old global assertion | All 3 scenarios failed as intended: global count 5, order session count 4 |
| Targeted order, customer and migration checks | 18 passed, 0 failures, 0 errors, 0 skipped |
| Final source, full `verify -Pmysql-it`: Surefire | 296 passed, 0 failures, 0 errors, 0 skipped; includes all 3 query-count scenarios and all 4 `OrderIntegrationTest` cases |
| Final SQL traces, each query-count scenario | Exactly 4 order statements: 1 paginated SELECT, 1 COUNT, 2 item batches |
| Checkstyle | 0 violations |
| JaCoCo | All coverage checks passed |
| Full `verify -Pmysql-it`: Failsafe | 15 test-class initialization errors, 0 assertion failures, 0 skipped; Docker environment unavailable |
| `git diff --check` | Passed |

The targeted command selected `OrderQueryCountIntegrationTest`,
`OrderIntegrationTest`, `CustomerIntegrationTest`, `MigrationImmutabilityTest`,
`H2MigrationConfigurationTest` and `GamingTimeMigrationTest`. These include the
released Flyway checksum contract and H2 migration checks. The full suite reran
the final source after removing all global-statistics use from this test.

The complete MySQL-profile command reached Failsafe, including `MySqlSchemaIT`,
`GamingTimeMigrationIT` and the MySQL concurrency/performance tests. Testcontainers
could not find a valid Docker environment; the Docker Desktop Linux engine pipe
was absent. No disposable MySQL instance could start, so native MySQL migrations
and behavior remain **unverified**, and the full profile command exited with a
build failure. No existing database was accessed for these MySQL checks.

The reported CI assertion failure is fixed and its regression test passes. A
successful complete MySQL CI job still needs confirmation on a runner with a
working Docker daemon; this change has not been pushed or rerun on GitHub.

Local execution logs (under ignored `gm/target/`):

- [Original test](../../gm/target/order-query-before.log)
- [Deterministic reproduction](../../gm/target/order-query-reproduction.log)
- [Targeted checks](../../gm/target/order-query-after.log)
- [Complete MySQL-profile attempt](../../gm/target/order-query-mysql-verify.log)

"""Read-only comparison against the pre-migration snapshot; no row data is saved."""
import hashlib
import json
import pathlib
import re
import subprocess
import sys

root = pathlib.Path(__file__).resolve().parent
container, phase = sys.argv[1:]
assert re.fullmatch(r"[a-zA-Z0-9_-]+", container)
assert re.fullmatch(r"[a-zA-Z0-9_-]+", phase)


def query(sql):
    return subprocess.run(
        ["docker", "exec", "-i", container, "sh", "-c",
         'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql -uroot --batch --raw --skip-column-names gmanager'],
        input=sql.encode(), capture_output=True, check=True,
    ).stdout


baseline = json.loads((root / "flyway-business-snapshot-before.json").read_text())
results = {}
for table, before in baseline.items():
    columns = before["columns"]
    assert all(re.fullmatch(r"[a-zA-Z0-9_]+", identifier) for identifier in [table, *columns])
    selected = ",".join("`" + column + "`" for column in columns)
    data = query(f"SELECT {selected} FROM `{table}` ORDER BY `{columns[0]}`;")
    digest = hashlib.sha256(data).hexdigest()
    rows = len(data.splitlines())
    results[table] = {"rows": rows, "sha256": digest,
                      "matches_before": rows == before["rows"] and digest == before["sha256"]}
history = []
for line in query("SELECT version,script,checksum,success FROM flyway_schema_history ORDER BY installed_rank;").decode().splitlines():
    history.append(dict(zip(("version", "script", "checksum", "success"), line.split("\t"))))
old_history = json.loads((root / "flyway-history-before.json").read_text())
report = {"container": container, "tables": results,
          "original_history_unchanged": history[:len(old_history)] == old_history,
          "history": history}
(root / f"flyway-{phase}-verification.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
for table, result in results.items():
    print(f"{table}: {result['rows']} rows; original columns {'MATCH' if result['matches_before'] else 'DIFFER'}")
print(f"Original migration history unchanged: {report['original_history_unchanged']}; current version: {history[-1]['version']}")
assert all(result["matches_before"] for result in results.values())
assert report["original_history_unchanged"]
assert len(history) == 50 and all(row["success"] == "1" for row in history)

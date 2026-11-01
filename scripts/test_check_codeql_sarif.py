"""Regression tests for the security gate, including CodeQL query-pack rules."""

import contextlib
import copy
import io
import json
import tempfile
import unittest
from pathlib import Path

from check_codeql_sarif import main


def report(results=None, rules=None):
    return {"version": "2.1.0", "runs": [{
        "tool": {"driver": {"name": "CodeQL", "rules": rules or []}},
        "invocations": [{"executionSuccessful": True}],
        "results": results or [],
    }]}


class SarifGateTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.directory = Path(self.temporary.name)
        self.write("java.sarif", report())
        self.write("javascript.sarif", report())

    def write(self, name, data):
        (self.directory / name).write_text(json.dumps(data), encoding="utf-8")

    def status(self):
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            return main([str(self.directory)])

    def test_complete_clean_analysis_passes(self):
        self.assertEqual(self.status(), 0)

    def test_explicit_error_in_either_language_fails(self):
        for name in ("java.sarif", "javascript.sarif"):
            with self.subTest(name=name):
                self.write(name, report([{"level": "error"}]))
                self.assertEqual(self.status(), 1)
                self.write(name, report())

    def test_driver_rule_defaults_by_id_and_index(self):
        rules = [{"id": "security/test", "defaultConfiguration": {"level": "error"}}]
        for reference in ({"ruleId": "security/test"}, {"ruleIndex": 0},
                          {"rule": {"id": "security/test", "index": 0}}):
            with self.subTest(reference=reference):
                self.write("java.sarif", report([reference], rules))
                self.assertEqual(self.status(), 1)

    def test_codeql_extension_rule_without_result_level_fails(self):
        # The previously found CSRF vulnerability used exactly this reference shape.
        data = report([{
            "ruleId": "java/spring-disabled-csrf-protection",
            "rule": {"id": "java/spring-disabled-csrf-protection", "index": 0,
                     "toolComponent": {"index": 1}},
        }])
        data["runs"][0]["tool"]["extensions"] = [
            {"name": "codeql-action/pr-diff-range", "rules": []},
            {"name": "codeql/java-queries", "rules": [{
                "id": "java/spring-disabled-csrf-protection",
                "defaultConfiguration": {"level": "error"},
            }]},
        ]
        self.write("java.sarif", data)
        self.assertEqual(self.status(), 1)

    def test_result_level_precedes_rule_default(self):
        self.write("java.sarif", report([{"ruleIndex": 0, "level": "warning"}], [
            {"id": "security/test", "defaultConfiguration": {"level": "error"}},
        ]))
        self.assertEqual(self.status(), 0)

    def test_invocation_override_precedes_rule_default(self):
        for override, expected in (("error", 1), ("warning", 0)):
            with self.subTest(override=override):
                data = report([{"ruleIndex": 0, "provenance": {"invocationIndex": 0}}], [
                    {"id": "security/test", "defaultConfiguration": {"level": "note"}},
                ])
                data["runs"][0]["invocations"][0]["ruleConfigurationOverrides"] = [{
                    "descriptor": {"id": "security/test"}, "configuration": {"level": override},
                }]
                self.write("java.sarif", data)
                self.assertEqual(self.status(), expected)

    def test_non_error_levels_and_default_warning_pass(self):
        self.write("javascript.sarif", report([
            {}, {"level": "warning"}, {"level": "note"},
            {"kind": "pass", "level": "none"},
        ]))
        self.assertEqual(self.status(), 0)

    def test_invocation_override_does_not_hide_explicit_error(self):
        data = report([{"ruleIndex": 0, "level": "error", "provenance": {"invocationIndex": 0}}], [
            {"id": "security/test"},
        ])
        data["runs"][0]["invocations"][0]["ruleConfigurationOverrides"] = [{
            "descriptor": {"index": 0}, "configuration": {"level": "warning"},
        }]
        self.write("java.sarif", data)
        self.assertEqual(self.status(), 1)

    def test_security_severity_does_not_replace_sarif_level(self):
        self.write("java.sarif", report([{"ruleIndex": 0}], [{
            "id": "security/test", "properties": {"security-severity": "9.8"},
        }]))
        self.assertEqual(self.status(), 0)

    def test_non_failure_results_are_not_vulnerability_findings(self):
        self.write("java.sarif", report([
            {"kind": kind, "level": "none"}
            for kind in ("pass", "notApplicable", "review", "open", "informational")
        ]))
        self.assertEqual(self.status(), 0)

    def test_suppressions_and_baseline_do_not_hide_error_findings(self):
        self.write("java.sarif", report([{
            "level": "error", "baselineState": "unchanged",
            "suppressions": [{"kind": "inSource", "status": "accepted"}],
        }]))
        self.assertEqual(self.status(), 1)

    def test_missing_language_report_fails(self):
        (self.directory / "javascript.sarif").unlink()
        self.assertEqual(self.status(), 2)

    def test_empty_or_malformed_report_fails(self):
        for text in ("", "{", "null", '{"version":"2.1.0","runs":[]}'):
            with self.subTest(text=text):
                (self.directory / "java.sarif").write_text(text, encoding="utf-8")
                self.assertEqual(self.status(), 2)

    def test_missing_analysis_or_results_fails(self):
        for field in ("invocations", "results"):
            with self.subTest(field=field):
                data = report()
                del data["runs"][0][field]
                self.write("java.sarif", data)
                self.assertEqual(self.status(), 2)

    def test_analysis_failure_is_not_a_clean_scan(self):
        data = report()
        data["runs"][0]["invocations"][0]["executionSuccessful"] = False
        self.write("java.sarif", data)
        self.assertEqual(self.status(), 2)

    def test_analysis_error_notifications_fail(self):
        data = report()
        data["runs"][0]["invocations"][0]["toolExecutionNotifications"] = [{"level": "error"}]
        self.write("java.sarif", data)
        self.assertEqual(self.status(), 2)

    def test_unresolved_rule_reference_or_invalid_level_fails(self):
        for result in ({"ruleIndex": 100}, {"ruleId": "missing/rule"}, {"level": "critical"}):
            with self.subTest(result=result):
                self.write("java.sarif", report([result]))
                self.assertEqual(self.status(), 2)

    def test_error_notification_default_is_checked(self):
        data = report()
        data["runs"][0]["tool"]["driver"]["notifications"] = [{
            "id": "failed-analysis", "defaultConfiguration": {"level": "error"},
        }]
        data["runs"][0]["invocations"][0]["toolExecutionNotifications"] = [{
            "descriptor": {"id": "failed-analysis"},
        }]
        self.write("java.sarif", data)
        self.assertEqual(self.status(), 2)

    def test_all_runs_and_additional_reports_are_checked(self):
        data = report()
        data["runs"].append(copy.deepcopy(report([{"level": "error"}])["runs"][0]))
        self.write("extra.sarif", data)
        self.assertEqual(self.status(), 1)

    def test_invalid_analysis_takes_precedence_over_findings(self):
        self.write("java.sarif", report([{"level": "error"}]))
        self.write("javascript.sarif", {})
        self.assertEqual(self.status(), 2)


if __name__ == "__main__":
    unittest.main()

"""Gate CodeQL SARIF 2.1.0 reports without the GitHub Code Scanning API.

Fail on kind=fail (the default) with effective level=error. Resolve level from
the result, invocation override, rule defaultConfiguration, then warning, in
that order. Include suppressed and baseline findings; do not gate on numeric
security-severity. Missing/invalid reports and unsuccessful analysis also fail.
"""

import json
import sys
from pathlib import Path


class ReportError(ValueError):
    """Missing, incomplete or invalid analysis output."""


def require(condition, message):
    if not condition:
        raise ReportError(message)


def objects(value, label, nonempty=False):
    require(isinstance(value, list), f"{label} must be an array")
    require(not nonempty or bool(value), f"{label} must not be empty")
    require(all(isinstance(item, dict) for item in value), f"Invalid {label} entry")
    return value


def at_index(items, index):
    require(type(index) is int and 0 <= index < len(items), f"Invalid SARIF index: {index}")
    return items[index]


def descriptor(run, reference, collection="rules"):
    """Resolve driver or extension rules, including CodeQL query-pack indices."""
    require(isinstance(reference, dict), "Invalid descriptor reference")
    tool = run["tool"]
    component = tool["driver"]
    component_ref = reference.get("toolComponent", {})
    require(isinstance(component_ref, dict), "Invalid toolComponent reference")
    if component_ref:
        index = component_ref.get("index", -1)
        if index != -1:
            component = at_index(objects(tool.get("extensions", []), "extensions"), index)
        elif "name" in component_ref or "guid" in component_ref:
            candidates = [component] + objects(tool.get("extensions", []), "extensions")
            matches = [c for c in candidates if all(
                c.get(key) == component_ref[key] for key in ("name", "guid") if key in component_ref
            )]
            require(len(matches) == 1, "Unresolved toolComponent reference")
            component = matches[0]
        for key in ("name", "guid"):
            require(key not in component_ref or component.get(key) == component_ref[key],
                    "Inconsistent toolComponent reference")
    entries = objects(component.get(collection, []), collection)
    index = reference.get("index", -1)
    if index != -1:
        entry = at_index(entries, index)
    else:
        identifiers = [key for key in ("id", "guid") if key in reference]
        require(bool(identifiers), "Descriptor reference has no identifier")
        matches = [entry for entry in entries if all(
            entry.get(key) == reference[key] for key in identifiers
        )]
        require(len(matches) == 1, "Unresolved descriptor reference")
        entry = matches[0]
    for key in ("id", "guid"):
        require(key not in reference or entry.get(key) == reference[key],
                "Inconsistent descriptor reference")
    return entry


def level(value):
    require(value in ("error", "warning", "note", "none"), f"Invalid SARIF level: {value}")
    return value


def effective_level(run, result):
    if "level" in result:
        return level(result["level"])
    reference = result.get("rule")
    if reference is None:
        reference = {key: result[source] for key, source in
                     (("id", "ruleId"), ("index", "ruleIndex")) if source in result}
    rule = descriptor(run, reference) if reference else {}
    provenance = result.get("provenance", {})
    require(isinstance(provenance, dict), "Invalid result provenance")
    invocation_index = provenance.get("invocationIndex", -1)
    if invocation_index != -1:
        invocation = at_index(run.get("invocations", []), invocation_index)
        for override in objects(invocation.get("ruleConfigurationOverrides", []), "overrides"):
            if descriptor(run, override.get("descriptor")) is rule:
                configuration = override.get("configuration")
                require(isinstance(configuration, dict), "Invalid rule configuration override")
                if "level" in configuration:
                    return level(configuration["level"])
    configuration = rule.get("defaultConfiguration", {})
    require(isinstance(configuration, dict), "Invalid rule defaultConfiguration")
    return level(configuration.get("level", "warning"))


def check_report(path):
    report = json.loads(path.read_text(encoding="utf-8-sig"))
    require(isinstance(report, dict) and report.get("version") == "2.1.0", "Expected SARIF 2.1.0")
    findings = []
    for run in objects(report.get("runs"), "runs", nonempty=True):
        tool = run.get("tool", {})
        require(isinstance(tool, dict) and isinstance(tool.get("driver"), dict)
                and tool["driver"].get("name") == "CodeQL", "Expected a CodeQL run")
        require(not run.get("externalPropertyFileReferences"), "External SARIF data is unsupported")
        for invocation in objects(run.get("invocations"), "invocations", nonempty=True):
            require(invocation.get("executionSuccessful") is True, "CodeQL analysis did not succeed")
            for notification in objects(invocation.get("toolExecutionNotifications", []), "notifications"):
                notification_level = notification.get("level")
                if notification_level is None:
                    rule = (descriptor(run, notification["descriptor"], "notifications")
                            if "descriptor" in notification else {})
                    notification_level = rule.get("defaultConfiguration", {}).get("level", "warning")
                require(level(notification_level) != "error", "CodeQL reported an analysis error")
        for result in objects(run.get("results"), "results"):
            kind = result.get("kind", "fail")
            require(kind in ("fail", "pass", "notApplicable", "review", "open", "informational"),
                    f"Invalid SARIF result kind: {kind}")
            if kind == "fail" and effective_level(run, result) == "error":
                locations = result.get("locations", [])
                physical = locations[0].get("physicalLocation", {}) if locations else {}
                uri = physical.get("artifactLocation", {}).get("uri", "unknown location")
                line = physical.get("region", {}).get("startLine", "?")
                rule_id = result.get("ruleId", result.get("rule", {}).get("id", "unknown rule"))
                findings.append(f"{rule_id} at {uri}:{line}")
    return findings


def main(argv=None):
    args = sys.argv[1:] if argv is None else argv
    if len(args) != 1:
        print("Usage: check_codeql_sarif.py <codeql-results-directory>", file=sys.stderr)
        return 2
    directory = Path(args[0])
    failures = []
    findings = []
    # Both languages are mandatory; a glob alone could silently accept partial analysis.
    expected = {directory / "java.sarif", directory / "javascript.sarif"}
    reports = expected | set(directory.glob("*.sarif"))
    for path in sorted(reports):
        try:
            found = check_report(path)
            findings.extend(f"{path.name}: {finding}" for finding in found)
            print(f"{path.name}: {len(found)} error-level finding(s)")
        except (OSError, ValueError, KeyError, TypeError, AttributeError, IndexError) as error:
            failures.append(f"{path.name}: invalid/incomplete analysis: {error}")
    for error in failures + findings:
        # Plain output prevents report text from injecting Actions workflow commands.
        print(f"CodeQL gate: {json.dumps(error, ensure_ascii=True)}", file=sys.stderr)
    if failures:
        return 2
    if findings:
        return 1
    print("CodeQL SARIF gate passed for Java/Kotlin and JavaScript/TypeScript.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

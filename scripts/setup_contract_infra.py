#!/usr/bin/env python3
"""
Create the AWS side of the data contract (plan 02-02, CONTRACT-01):

  budget   the owner's 25 USD/month cost budget with email alerts (80% and 100%
           of actual spend, 100% of forecast spend). It replaces the alert-less
           reefradar-2477-budget (50 USD), which is deleted only after the new
           budget and all three notifications read back correctly.

Everything is idempotent: existing resources are found by name and only what is
missing is created.

  --dry-run           print one JSON line per planned action; only describe/list/get
                      calls are made
  --confirm           required for any AWS write (a run with neither flag is also
                      read-only)
  --verify            read-only report; exit 1 on any deviation from the desired state
  --record-resources  rewrite the matching sections of infrastructure/resources.json
                      from read-only describe calls (no AWS write, no --confirm)
  --step              budget | all (default all)
  --notify-email      owner alert address (falls back to env REEFRADAR_ALERT_EMAIL).
                      Pass it on the command line only; it is never written to a file
                      and is printed only in redacted form.

The script never prints credentials, presigned URLs or the full alert address, and
it refuses to run unless the caller account is 781978598306.

Usage:
    py -3.12 scripts/setup_contract_infra.py --step budget --dry-run --notify-email <address>
    py -3.12 scripts/setup_contract_infra.py --step budget --confirm --notify-email <address>
    py -3.12 scripts/setup_contract_infra.py --step budget --verify
    py -3.12 scripts/setup_contract_infra.py --step budget --record-resources
"""

from __future__ import annotations

import argparse
import json
import os
import pathlib
import re
import sys

REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent

ACCOUNT_ID = "781978598306"
REGION = "us-east-1"
BUDGET_NAME = "reefradar-2477-ceiling-25"
LEGACY_BUDGET_NAME = "reefradar-2477-budget"
LEGACY_FORMER_LIMIT_USD = 50
BUDGET_LIMIT_USD = "25"
# (NotificationType, percentage threshold): alert at 80% and 100% of actual spend
# and at 100% of forecast spend.
THRESHOLDS = [("ACTUAL", 80), ("ACTUAL", 100), ("FORECASTED", 100)]
COMPARISON = "GREATER_THAN"
THRESHOLD_TYPE = "PERCENTAGE"
EMAIL_ENV = "REEFRADAR_ALERT_EMAIL"
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s.]+$")
JSON_INLINE_WIDTH = 100

STEPS = ("budget", "all")


class SetupError(RuntimeError):
    """Raised for any condition that must stop the setup."""


class Blocked(SetupError):
    """The owner alert address is required but absent or invalid (exit 2)."""


# ---------------------------------------------------------------- redaction


def redact_email(address: str) -> str:
    """First character plus the domain suffix, e.g. owner@example.com -> o***@***.com."""
    if not EMAIL_RE.match(address or ""):
        return "***"
    local, domain = address.rsplit("@", 1)
    return f"{local[0]}***@***.{domain.rsplit('.', 1)[-1]}"


def redact_text(text: str, address: str | None) -> str:
    if address:
        text = text.replace(address, redact_email(address))
    return text


def emit(step: str, action: str, resource: str, status: str, **extra) -> None:
    print(json.dumps({"step": step, "action": action, "resource": resource, "status": status, **extra}))


# ------------------------------------------------------ resources.json writer


def _scalar(value) -> bool:
    return not isinstance(value, (dict, list))


def _render(value, level: int, room: int) -> str:
    pad = "  " * level
    if isinstance(value, dict):
        if not value:
            return "{}"
        rows = []
        for key, item in value.items():
            prefix = f"{json.dumps(key, ensure_ascii=False)}: "
            rows.append(f"{pad}  {prefix}{_render(item, level + 1, JSON_INLINE_WIDTH - len(pad) - 2 - len(prefix))}")
        return "{\n" + ",\n".join(rows) + f"\n{pad}}}"
    if isinstance(value, list):
        if not value:
            return "[]"
        if all(_scalar(x) for x in value):
            inline = "[" + ", ".join(json.dumps(x, ensure_ascii=False) for x in value) + "]"
            if len(inline) <= room:
                return inline
        rows = [f"{pad}  {_render(x, level + 1, JSON_INLINE_WIDTH - len(pad) - 2)}" for x in value]
        return "[\n" + ",\n".join(rows) + f"\n{pad}]"
    return json.dumps(value, ensure_ascii=False)


def render_json(data) -> str:
    """Render in the existing resources.json style: 2-space indent, short scalar arrays inline."""
    return _render(data, 0, JSON_INLINE_WIDTH) + "\n"


# ------------------------------------------------------------------- clients


class Clients:
    """Injected clients first (tests), otherwise boto3 clients built lazily from the profile."""

    def __init__(self, injected, profile, region):
        self._injected = dict(injected or {})
        self._profile = profile
        self._region = region
        self._session = None

    def get(self, name):
        if name not in self._injected:
            if self._session is None:
                import boto3

                self._session = boto3.Session(profile_name=self._profile, region_name=self._region)
            self._injected[name] = self._session.client(name)
        return self._injected[name]


def _code(exc) -> str:
    return getattr(exc, "response", {}).get("Error", {}).get("Code", "")


# ------------------------------------------------------------------- budgets


def _desired_notification(ntype: str, threshold: int) -> dict:
    return {
        "NotificationType": ntype,
        "ComparisonOperator": COMPARISON,
        "Threshold": float(threshold),
        "ThresholdType": THRESHOLD_TYPE,
    }


def _nkey(n: dict) -> tuple:
    return (n["NotificationType"], n["ComparisonOperator"], float(n["Threshold"]), n["ThresholdType"])


def _desired_keys() -> set:
    return {_nkey(_desired_notification(t, v)) for t, v in THRESHOLDS}


def _get_budget(budgets, name: str):
    from botocore.exceptions import ClientError

    try:
        return budgets.describe_budget(AccountId=ACCOUNT_ID, BudgetName=name)["Budget"]
    except ClientError as exc:
        if _code(exc) == "NotFoundException":
            return None
        raise


def _notifications(budgets, name: str) -> list[dict]:
    return budgets.describe_notifications_for_budget(AccountId=ACCOUNT_ID, BudgetName=name).get("Notifications", [])


def _subscribers(budgets, name: str, notification: dict) -> list[dict]:
    return budgets.describe_subscribers_for_notification(
        AccountId=ACCOUNT_ID, BudgetName=name, Notification=notification
    ).get("Subscribers", [])


def _limit_problems(budget: dict) -> list[str]:
    problems = []
    limit = budget.get("BudgetLimit", {})
    try:
        amount_ok = float(limit.get("Amount", "nan")) == float(BUDGET_LIMIT_USD)
    except ValueError:
        amount_ok = False
    if not amount_ok or limit.get("Unit") != "USD":
        problems.append(f"limit {limit.get('Amount')} {limit.get('Unit')} != {BUDGET_LIMIT_USD} USD")
    if budget.get("BudgetType") != "COST":
        problems.append(f"budget type {budget.get('BudgetType')} != COST")
    if budget.get("TimeUnit") != "MONTHLY":
        problems.append(f"time unit {budget.get('TimeUnit')} != MONTHLY")
    return problems


def _subscriber_problems(subs: list[dict], email: str | None) -> list[str]:
    if len(subs) != 1 or subs[0].get("SubscriptionType") != "EMAIL":
        return [f"expected exactly one EMAIL subscriber, found {len(subs)}"]
    if email and subs[0].get("Address", "").lower() != email.lower():
        return ["subscriber address differs from the supplied owner alert address"]
    return []


def inspect_budget(budgets, email: str | None) -> dict:
    """Read-only comparison of the desired state with AWS. Returns a dict of findings."""
    budget = _get_budget(budgets, BUDGET_NAME)
    state = {
        "exists": budget is not None,
        "limit_problems": [],
        "missing": [],
        "extra": [],
        "subscriber_problems": {},
        "notifications": [],
    }
    if budget is None:
        state["missing"] = sorted(_desired_keys())
        return state
    state["limit_problems"] = _limit_problems(budget)
    existing = _notifications(budgets, BUDGET_NAME)
    state["notifications"] = existing
    have = {_nkey(n) for n in existing}
    state["missing"] = sorted(_desired_keys() - have)
    state["extra"] = sorted(have - _desired_keys())
    for n in existing:
        if _nkey(n) in _desired_keys():
            problems = _subscriber_problems(_subscribers(budgets, BUDGET_NAME, n), email)
            if problems:
                state["subscriber_problems"][_nkey(n)] = problems
    return state


def _describe_key(key: tuple) -> str:
    return f"{key[0]} {key[1]} {key[2]:g}% {key[3].lower()}"


def _legacy_info(budgets):
    legacy = _get_budget(budgets, LEGACY_BUDGET_NAME)
    if legacy is None:
        return None
    return {
        "limit": legacy.get("BudgetLimit"),
        "budget_type": legacy.get("BudgetType"),
        "time_unit": legacy.get("TimeUnit"),
        "notification_count": len(_notifications(budgets, LEGACY_BUDGET_NAME)),
        "cost_filters": legacy.get("CostFilters"),
        "cost_types": legacy.get("CostTypes"),
    }


def _new_budget_body() -> dict:
    return {
        "BudgetName": BUDGET_NAME,
        "BudgetType": "COST",
        "TimeUnit": "MONTHLY",
        "BudgetLimit": {"Amount": BUDGET_LIMIT_USD, "Unit": "USD"},
    }


def _subscriber(email: str) -> dict:
    return {"SubscriptionType": "EMAIL", "Address": email}


def budget_step(budgets, email: str | None, write: bool) -> None:
    state = inspect_budget(budgets, email)
    legacy = _legacy_info(budgets)

    if state["limit_problems"]:
        raise SetupError(f"{BUDGET_NAME} exists with unexpected settings ({'; '.join(state['limit_problems'])}); not altering it")
    if state["extra"]:
        raise SetupError(f"{BUDGET_NAME} has unexpected extra notifications; not altering it")

    sub_fixes = sorted(k for k, p in state["subscriber_problems"].items() if p)
    needs_write = (not state["exists"]) or bool(state["missing"]) or bool(sub_fixes) or legacy is not None
    if needs_write and not email:
        msg = f"BLOCKED: owner alert email required (--notify-email or env {EMAIL_ENV})"
        if write:
            raise Blocked(msg)
        print(msg)
        emit("budget", "owner_alert_email", BUDGET_NAME, "BLOCKED")
        return

    status = "done" if write else "planned"
    shown = redact_email(email) if email else None
    desired = [_desired_notification(t, v) for t, v in THRESHOLDS]

    if not state["exists"]:
        emit("budget", "create_budget", BUDGET_NAME, status, limit_usd=int(BUDGET_LIMIT_USD), time_unit="MONTHLY",
             notifications=[_describe_key(_nkey(n)) for n in desired], subscriber=shown)
        if write:
            budgets.create_budget(
                AccountId=ACCOUNT_ID,
                Budget=_new_budget_body(),
                NotificationsWithSubscribers=[{"Notification": n, "Subscribers": [_subscriber(email)]} for n in desired],
            )
    else:
        for n in desired:
            if _nkey(n) in state["missing"]:
                emit("budget", "create_notification", BUDGET_NAME, status, notification=_describe_key(_nkey(n)), subscriber=shown)
                if write:
                    budgets.create_notification(
                        AccountId=ACCOUNT_ID, BudgetName=BUDGET_NAME, Notification=n, Subscribers=[_subscriber(email)]
                    )
        for key in sub_fixes:
            n = _desired_notification(key[0], int(key[2]))
            emit("budget", "create_subscriber", BUDGET_NAME, status, notification=_describe_key(key), subscriber=shown)
            if write:
                budgets.create_subscriber(
                    AccountId=ACCOUNT_ID, BudgetName=BUDGET_NAME, Notification=n, Subscriber=_subscriber(email)
                )

    if legacy is not None:
        emit("budget", "legacy_budget_before_delete", LEGACY_BUDGET_NAME, "info", **legacy)
        emit("budget", "delete_legacy_budget", LEGACY_BUDGET_NAME, status)

    if not write:
        if not (needs_write):
            emit("budget", "verify", BUDGET_NAME, "exists")
        return

    # read everything back before trusting it or touching the legacy budget
    after = inspect_budget(budgets, email)
    problems = []
    if not after["exists"]:
        problems.append("budget not found")
    problems += after["limit_problems"]
    if after["missing"] and after["exists"]:
        problems.append("missing notifications: " + ", ".join(_describe_key(k) for k in after["missing"]))
    for key, probs in after["subscriber_problems"].items():
        problems.append(f"{_describe_key(key)}: {'; '.join(probs)}")
    if problems:
        raise SetupError("read-back of the new budget failed, legacy budget kept: " + " | ".join(problems))
    emit("budget", "readback", BUDGET_NAME, "ok", notifications=len(after["notifications"]))

    if legacy is not None:
        if legacy["notification_count"]:
            raise SetupError(
                f"{LEGACY_BUDGET_NAME} has {legacy['notification_count']} notification(s); not deleting it automatically"
            )
        budgets.delete_budget(AccountId=ACCOUNT_ID, BudgetName=LEGACY_BUDGET_NAME)


def budget_verify(budgets, email: str | None) -> bool:
    ok = True
    state = inspect_budget(budgets, email)

    def report(action, good, detail=None):
        nonlocal ok
        ok = ok and good
        emit("budget", action, BUDGET_NAME, "ok" if good else "deviation", **({"detail": detail} if detail else {}))

    report("budget_exists", state["exists"])
    if state["exists"]:
        report("limit_25_usd_monthly_cost", not state["limit_problems"], "; ".join(state["limit_problems"]) or None)
        report(
            "three_notifications",
            not state["missing"] and not state["extra"] and len(state["notifications"]) == 3,
            f"missing={[_describe_key(k) for k in state['missing']]} extra={[_describe_key(k) for k in state['extra']]}",
        )
        flat = [p for probs in state["subscriber_problems"].values() for p in probs]
        report("one_email_subscriber_each", not flat, "; ".join(flat) or None)
    legacy_present = _get_budget(budgets, LEGACY_BUDGET_NAME) is not None
    emit("budget", "legacy_budget_absent", LEGACY_BUDGET_NAME, "deviation" if legacy_present else "ok")
    return ok and not legacy_present


def budget_record(budgets, resources: dict) -> dict:
    if not budget_verify_quiet(budgets):
        raise SetupError("budget does not match the desired state; refusing to record it (run --verify)")
    notifications = [
        {"type": t, "operator": COMPARISON, "threshold_percent": v} for t, v in THRESHOLDS
    ]
    section = {
        "ceiling": {
            "name": BUDGET_NAME,
            "budget_type": "COST",
            "time_unit": "MONTHLY",
            "limit_usd": int(BUDGET_LIMIT_USD),
            "notifications": notifications,
            "subscriber_type": "EMAIL",
            "subscriber_note": "owner alert address per 02-CONTEXT.md; not stored in this file",
        }
    }
    if _get_budget(budgets, LEGACY_BUDGET_NAME) is None:
        section["replaced"] = {"name": LEGACY_BUDGET_NAME, "former_limit_usd": LEGACY_FORMER_LIMIT_USD, "status": "deleted"}
    resources.pop("budgets", None)
    resources["budgets"] = section
    return resources


def budget_verify_quiet(budgets) -> bool:
    state = inspect_budget(budgets, None)
    return (
        state["exists"]
        and not state["limit_problems"]
        and not state["missing"]
        and not state["extra"]
        and not state["subscriber_problems"]
    )


# ----------------------------------------------------------------------- CLI


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--confirm", action="store_true", help="Required for any AWS write")
    p.add_argument("--verify", action="store_true", help="Read-only report; exit 1 on any deviation")
    p.add_argument("--record-resources", action="store_true", help="Update infrastructure/resources.json from describe calls")
    p.add_argument("--step", choices=STEPS, default="all")
    p.add_argument("--profile", default="reefradar")
    p.add_argument("--region", default=REGION)
    p.add_argument("--notify-email", default=None, help=f"Owner alert address (falls back to env {EMAIL_ENV})")
    p.add_argument(
        "--resources-file", type=pathlib.Path, default=REPO_ROOT / "infrastructure" / "resources.json", help=argparse.SUPPRESS
    )
    return p


def _selected(step: str) -> list[str]:
    return ["budget"] if step in ("budget", "all") else []


def main(argv=None, clients=None) -> int:
    args = build_parser().parse_args(argv)
    email = args.notify_email or os.environ.get(EMAIL_ENV) or None
    steps = _selected(args.step)
    write = args.confirm and not args.dry_run and not args.verify and not args.record_resources

    try:
        if email and not EMAIL_RE.match(email):
            raise Blocked("error: the supplied owner alert address is not a valid email address")
        aws = Clients(clients, args.profile, args.region)

        account = aws.get("sts").get_caller_identity()["Account"]
        if account != ACCOUNT_ID:
            raise SetupError(f"refusing to run: caller account is not {ACCOUNT_ID}")

        if args.verify:
            ok = True
            if "budget" in steps:
                ok = budget_verify(aws.get("budgets"), email) and ok
            return 0 if ok else 1

        if args.record_resources:
            resources = json.loads(args.resources_file.read_text(encoding="utf-8"))
            if "budget" in steps:
                resources = budget_record(aws.get("budgets"), resources)
            args.resources_file.write_bytes(render_json(resources).encode("utf-8"))
            emit("resources", "record", str(args.resources_file.name), "done")
            return 0

        if "budget" in steps:
            budget_step(aws.get("budgets"), email, write)
        if not write:
            print("[dry-run] no AWS write made" if args.dry_run else "[no --confirm] no AWS write made")
        return 0
    except Blocked as exc:
        print(redact_text(str(exc), email), file=sys.stderr)
        return 2
    except SetupError as exc:
        print(f"error: {redact_text(str(exc), email)}", file=sys.stderr)
        return 1
    except Exception as exc:  # botocore ClientError and friends
        if hasattr(exc, "response"):
            print(f"error: AWS call failed ({_code(exc)}): {redact_text(str(exc), email)}", file=sys.stderr)
            return 1
        raise


if __name__ == "__main__":
    sys.exit(main())

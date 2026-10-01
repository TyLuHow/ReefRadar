"""
Tests for scripts/setup_contract_infra.py (plan 02-02).

AWS Budgets is exercised through a small in-memory fake because moto 5.2.3 does
not implement describe_subscribers_for_notification, which the read-back needs.
Only example.com addresses are used here, never the owner's real alert address.
"""

import json
import pathlib

import pytest
from botocore.exceptions import ClientError

import setup_contract_infra as sci

EMAIL = "owner@example.com"
ACCOUNT = "781978598306"
READ_ONLY_PREFIXES = ("describe_", "list_", "get_")


def _notfound(op):
    return ClientError({"Error": {"Code": "NotFoundException", "Message": "budget does not exist"}}, op)


class FakeSts:
    def __init__(self, account=ACCOUNT):
        self.account = account

    def get_caller_identity(self):
        return {"Account": self.account}


class FakeBudgets:
    """In-memory AWS Budgets. `calls` records every operation name in order."""

    def __init__(self, drop_notifications_on_create=False):
        self.budgets = {}
        self.calls = []
        self.drop_notifications_on_create = drop_notifications_on_create

    # ---- helpers
    @staticmethod
    def _key(n):
        return (n["NotificationType"], n["ComparisonOperator"], float(n["Threshold"]), n["ThresholdType"])

    def seed_legacy(self, name="reefradar-2477-budget", amount="50.0", notifications=0):
        self.budgets[name] = {
            "budget": {
                "BudgetName": name,
                "BudgetType": "COST",
                "TimeUnit": "MONTHLY",
                "BudgetLimit": {"Amount": amount, "Unit": "USD"},
                "CalculatedSpend": {"ActualSpend": {"Amount": "10.5", "Unit": "USD"}},
            },
            "notifications": {},
        }
        for i in range(notifications):
            n = {
                "NotificationType": "ACTUAL",
                "ComparisonOperator": "GREATER_THAN",
                "Threshold": 50.0 + i,
                "ThresholdType": "PERCENTAGE",
            }
            self.budgets[name]["notifications"][self._key(n)] = (n, [{"SubscriptionType": "EMAIL", "Address": "x@example.com"}])

    def mutating_calls(self):
        return [c for c in self.calls if not c.startswith(READ_ONLY_PREFIXES)]

    # ---- API
    def describe_budget(self, AccountId, BudgetName):
        self.calls.append("describe_budget")
        if BudgetName not in self.budgets:
            raise _notfound("DescribeBudget")
        return {"Budget": json.loads(json.dumps(self.budgets[BudgetName]["budget"]))}

    def describe_budgets(self, AccountId):
        self.calls.append("describe_budgets")
        return {"Budgets": [v["budget"] for v in self.budgets.values()]}

    def create_budget(self, AccountId, Budget, NotificationsWithSubscribers=()):
        self.calls.append("create_budget")
        assert AccountId == ACCOUNT
        entry = {"budget": dict(Budget), "notifications": {}}
        if not self.drop_notifications_on_create:
            for item in NotificationsWithSubscribers:
                entry["notifications"][self._key(item["Notification"])] = (
                    dict(item["Notification"]),
                    [dict(s) for s in item["Subscribers"]],
                )
        self.budgets[Budget["BudgetName"]] = entry
        return {}

    def create_notification(self, AccountId, BudgetName, Notification, Subscribers):
        self.calls.append("create_notification")
        self.budgets[BudgetName]["notifications"][self._key(Notification)] = (
            dict(Notification),
            [dict(s) for s in Subscribers],
        )
        return {}

    def describe_notifications_for_budget(self, AccountId, BudgetName):
        self.calls.append("describe_notifications_for_budget")
        if BudgetName not in self.budgets:
            raise _notfound("DescribeNotificationsForBudget")
        return {"Notifications": [n for n, _ in self.budgets[BudgetName]["notifications"].values()]}

    def describe_subscribers_for_notification(self, AccountId, BudgetName, Notification):
        self.calls.append("describe_subscribers_for_notification")
        _, subs = self.budgets[BudgetName]["notifications"][self._key(Notification)]
        return {"Subscribers": subs}

    def delete_budget(self, AccountId, BudgetName):
        self.calls.append("delete_budget")
        del self.budgets[BudgetName]
        return {}


@pytest.fixture
def budgets():
    b = FakeBudgets()
    b.seed_legacy()
    return b


def run(argv, budgets_client, capsys, sts=None, resources_path=None):
    clients = {"budgets": budgets_client, "sts": sts or FakeSts()}
    argv = list(argv)
    if resources_path is not None:
        argv += ["--resources-file", str(resources_path)]
    code = sci.main(argv, clients=clients)
    out = capsys.readouterr()
    return code, out.out, out.err


def json_lines(text):
    lines = []
    for line in text.splitlines():
        line = line.strip()
        if line.startswith("{"):
            lines.append(json.loads(line))
    return lines


# ------------------------------------------------------------------- dry-run


def test_dry_run_makes_only_read_calls_and_prints_one_json_line_per_action(budgets, capsys):
    code, out, _ = run(["--step", "budget", "--dry-run", "--notify-email", EMAIL], budgets, capsys)
    assert code == 0
    assert budgets.mutating_calls() == []
    actions = [(j["action"], j["status"]) for j in json_lines(out) if j["step"] == "budget"]
    assert ("create_budget", "planned") in actions
    assert ("delete_legacy_budget", "planned") in actions
    assert "reefradar-2477-ceiling-25" not in budgets.budgets


def test_dry_run_without_email_prints_blocked_for_budget_step(budgets, capsys, monkeypatch):
    monkeypatch.delenv("REEFRADAR_ALERT_EMAIL", raising=False)
    code, out, _ = run(["--step", "budget", "--dry-run"], budgets, capsys)
    assert code == 0
    assert "BLOCKED: owner alert email required" in out
    assert budgets.mutating_calls() == []


def test_confirm_without_email_exits_2_and_writes_nothing(budgets, capsys, monkeypatch):
    monkeypatch.delenv("REEFRADAR_ALERT_EMAIL", raising=False)
    code, out, err = run(["--step", "budget", "--confirm"], budgets, capsys)
    assert code == 2
    assert budgets.mutating_calls() == []
    assert "BLOCKED: owner alert email required" in out + err


def test_email_falls_back_to_environment(budgets, capsys, monkeypatch):
    monkeypatch.setenv("REEFRADAR_ALERT_EMAIL", EMAIL)
    code, _, _ = run(["--step", "budget", "--confirm"], budgets, capsys)
    assert code == 0
    subs = budgets.budgets["reefradar-2477-ceiling-25"]["notifications"]
    assert all(s[0]["Address"] == EMAIL for _, s in subs.values())


def test_confirm_flag_is_required_for_writes(budgets, capsys):
    code, _, _ = run(["--step", "budget", "--notify-email", EMAIL], budgets, capsys)
    assert code == 0
    assert budgets.mutating_calls() == []


# ------------------------------------------------------------------- confirm


def test_confirm_creates_the_25_usd_budget_with_three_email_notifications(budgets, capsys):
    code, _, _ = run(["--step", "budget", "--confirm", "--notify-email", EMAIL], budgets, capsys)
    assert code == 0
    entry = budgets.budgets["reefradar-2477-ceiling-25"]
    assert entry["budget"]["BudgetType"] == "COST"
    assert entry["budget"]["TimeUnit"] == "MONTHLY"
    assert entry["budget"]["BudgetLimit"] == {"Amount": "25", "Unit": "USD"}
    keys = sorted(entry["notifications"])
    assert keys == sorted(
        [
            ("ACTUAL", "GREATER_THAN", 80.0, "PERCENTAGE"),
            ("ACTUAL", "GREATER_THAN", 100.0, "PERCENTAGE"),
            ("FORECASTED", "GREATER_THAN", 100.0, "PERCENTAGE"),
        ]
    )
    for _, subs in entry["notifications"].values():
        assert subs == [{"SubscriptionType": "EMAIL", "Address": EMAIL}]


def test_second_confirm_makes_no_create_update_or_delete_call(budgets, capsys):
    run(["--step", "budget", "--confirm", "--notify-email", EMAIL], budgets, capsys)
    budgets.calls.clear()
    code, out, _ = run(["--step", "budget", "--confirm", "--notify-email", EMAIL], budgets, capsys)
    assert code == 0
    assert budgets.mutating_calls() == []
    assert not [j for j in json_lines(out) if j["status"] in ("done", "planned")]


def test_existing_budget_missing_one_notification_gets_only_that_one(budgets, capsys):
    run(["--step", "budget", "--confirm", "--notify-email", EMAIL], budgets, capsys)
    entry = budgets.budgets["reefradar-2477-ceiling-25"]
    del entry["notifications"][("FORECASTED", "GREATER_THAN", 100.0, "PERCENTAGE")]
    budgets.calls.clear()
    code, _, _ = run(["--step", "budget", "--confirm", "--notify-email", EMAIL], budgets, capsys)
    assert code == 0
    assert budgets.mutating_calls() == ["create_notification"]
    assert len(entry["notifications"]) == 3


def test_legacy_budget_deleted_only_after_readback_and_its_parameters_printed_first(budgets, capsys):
    code, out, _ = run(["--step", "budget", "--confirm", "--notify-email", EMAIL], budgets, capsys)
    assert code == 0
    assert "reefradar-2477-budget" not in budgets.budgets
    calls = budgets.calls
    delete_at = calls.index("delete_budget")
    assert calls.index("create_budget") < calls.index("describe_subscribers_for_notification") < delete_at
    assert calls.count("describe_subscribers_for_notification") >= 3
    legacy = [j for j in json_lines(out) if j["action"] == "legacy_budget_before_delete"]
    assert len(legacy) == 1
    assert legacy[0]["limit"] == {"Amount": "50.0", "Unit": "USD"}
    assert legacy[0]["notification_count"] == 0
    assert "CalculatedSpend" not in json.dumps(legacy[0])  # no spend figures


def test_legacy_not_deleted_when_readback_fails(capsys):
    b = FakeBudgets(drop_notifications_on_create=True)
    b.seed_legacy()
    code, _, err = run(["--step", "budget", "--confirm", "--notify-email", EMAIL], b, capsys)
    assert code == 1
    assert "reefradar-2477-budget" in b.budgets
    assert "delete_budget" not in b.calls
    assert "read-back" in err


def test_legacy_with_notifications_is_not_deleted_automatically(capsys):
    b = FakeBudgets()
    b.seed_legacy(notifications=1)
    code, _, err = run(["--step", "budget", "--confirm", "--notify-email", EMAIL], b, capsys)
    assert code == 1
    assert "reefradar-2477-budget" in b.budgets
    assert "notification" in err


def test_absent_legacy_budget_is_not_an_error(capsys):
    b = FakeBudgets()
    code, _, _ = run(["--step", "budget", "--confirm", "--notify-email", EMAIL], b, capsys)
    assert code == 0
    assert list(b.budgets) == ["reefradar-2477-ceiling-25"]


# ------------------------------------------------------------- redaction etc.


def test_address_is_never_printed_in_full(budgets, capsys):
    outputs = []
    for flags in (["--dry-run"], ["--confirm"], ["--verify"], ["--confirm"]):
        _, out, err = run(["--step", "budget", *flags, "--notify-email", EMAIL], budgets, capsys)
        outputs.append(out + err)
    text = "\n".join(outputs)
    assert EMAIL not in text
    assert "owner" not in text
    assert sci.redact_email(EMAIL) in text


def test_redact_email_keeps_first_character_and_domain_suffix():
    assert sci.redact_email("owner@example.com") == "o***@***.com"
    assert sci.redact_email("not-an-address") == "***"


def test_invalid_address_is_rejected_without_echoing_it(budgets, capsys):
    code, out, err = run(["--step", "budget", "--confirm", "--notify-email", "bad address"], budgets, capsys)
    assert code == 2
    assert "bad address" not in out + err
    assert budgets.mutating_calls() == []


def test_wrong_account_is_refused_before_any_budget_call(budgets, capsys):
    code, _, err = run(
        ["--step", "budget", "--confirm", "--notify-email", EMAIL], budgets, capsys, sts=FakeSts("111122223333")
    )
    assert code == 1
    assert "781978598306" in err
    assert budgets.calls == []


# --------------------------------------------------------------------- verify


def test_verify_fails_before_setup_and_passes_after(budgets, capsys):
    code, _, _ = run(["--step", "budget", "--verify"], budgets, capsys)
    assert code == 1
    assert budgets.mutating_calls() == []
    run(["--step", "budget", "--confirm", "--notify-email", EMAIL], budgets, capsys)
    code, out, _ = run(["--step", "budget", "--verify"], budgets, capsys)
    assert code == 0
    assert all(j["status"] == "ok" for j in json_lines(out) if j["step"] == "budget")


def test_verify_fails_when_legacy_budget_still_exists(budgets, capsys):
    run(["--step", "budget", "--confirm", "--notify-email", EMAIL], budgets, capsys)
    budgets.seed_legacy()
    code, _, _ = run(["--step", "budget", "--verify"], budgets, capsys)
    assert code == 1


def test_verify_fails_on_wrong_limit(budgets, capsys):
    run(["--step", "budget", "--confirm", "--notify-email", EMAIL], budgets, capsys)
    budgets.budgets["reefradar-2477-ceiling-25"]["budget"]["BudgetLimit"]["Amount"] = "50"
    code, _, _ = run(["--step", "budget", "--verify"], budgets, capsys)
    assert code == 1


# ------------------------------------------------------------ record-resources


def test_resources_renderer_round_trips_the_committed_file():
    path = sci.REPO_ROOT / "infrastructure" / "resources.json"
    text = path.read_text(encoding="utf-8")
    assert sci.render_json(json.loads(text)) == text


def test_record_resources_rewrites_only_the_budgets_section(budgets, capsys, tmp_path):
    src = (sci.REPO_ROOT / "infrastructure" / "resources.json").read_text(encoding="utf-8")
    target = tmp_path / "resources.json"
    target.write_text(src, encoding="utf-8")
    before = json.loads(src)
    run(["--step", "budget", "--confirm", "--notify-email", EMAIL], budgets, capsys)
    code, _, _ = run(["--step", "budget", "--record-resources"], budgets, capsys, resources_path=target)
    assert code == 0
    after = json.loads(target.read_text(encoding="utf-8"))
    ceiling = after["budgets"]["ceiling"]
    assert ceiling["name"] == "reefradar-2477-ceiling-25"
    assert ceiling["limit_usd"] == 25
    assert ceiling["time_unit"] == "MONTHLY"
    assert ceiling["subscriber_type"] == "EMAIL"
    assert len(ceiling["notifications"]) == 3
    assert after["budgets"]["replaced"] == {"name": "reefradar-2477-budget", "former_limit_usd": 50, "status": "deleted"}
    for key in before:
        assert after[key] == before[key]
    assert EMAIL not in target.read_text(encoding="utf-8")
    assert "example.com" not in target.read_text(encoding="utf-8")


def test_record_resources_is_a_noop_rewrite_when_run_twice(budgets, capsys, tmp_path):
    target = tmp_path / "resources.json"
    target.write_text((sci.REPO_ROOT / "infrastructure" / "resources.json").read_text(encoding="utf-8"), encoding="utf-8")
    run(["--step", "budget", "--confirm", "--notify-email", EMAIL], budgets, capsys)
    run(["--step", "budget", "--record-resources"], budgets, capsys, resources_path=target)
    first = target.read_bytes()
    run(["--step", "budget", "--record-resources"], budgets, capsys, resources_path=target)
    assert target.read_bytes() == first


def test_record_resources_refuses_when_budget_is_missing(budgets, capsys, tmp_path):
    target = tmp_path / "resources.json"
    original = (sci.REPO_ROOT / "infrastructure" / "resources.json").read_text(encoding="utf-8")
    target.write_text(original, encoding="utf-8")
    code, _, _ = run(["--step", "budget", "--record-resources"], budgets, capsys, resources_path=target)
    assert code == 1
    assert target.read_text(encoding="utf-8") == original


def test_no_credentials_in_script_source():
    src = pathlib.Path(sci.__file__).read_text(encoding="utf-8")
    assert "gmail.com" not in src
    assert "AKIA" not in src
    assert "X-Amz-Signature" not in src

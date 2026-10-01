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
        return (n["NotificationType"], n["ComparisonOperator"], float(n["Threshold"]), n.get("ThresholdType", "PERCENTAGE"))

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
        # Real AWS omits ThresholdType when it is the default (PERCENTAGE); mirror that.
        out = []
        for n, _ in self.budgets[BudgetName]["notifications"].values():
            n = dict(n)
            if n.get("ThresholdType") == "PERCENTAGE":
                del n["ThresholdType"]
            out.append(n)
        return {"Notifications": out}

    def describe_subscribers_for_notification(self, AccountId, BudgetName, Notification):
        self.calls.append("describe_subscribers_for_notification")
        _, subs = self.budgets[BudgetName]["notifications"][self._key(Notification)]
        return {"Subscribers": subs}

    def create_subscriber(self, AccountId, BudgetName, Notification, Subscriber):
        self.calls.append("create_subscriber")
        self.budgets[BudgetName]["notifications"][self._key(Notification)][1].append(dict(Subscriber))
        return {}

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


def pristine_resources_text() -> str:
    """The committed inventory minus the sections this script records, so tests start from a clean slate."""
    data = json.loads((sci.REPO_ROOT / "infrastructure" / "resources.json").read_text(encoding="utf-8"))
    for key in ("budgets", "cloudfront"):
        data.pop(key, None)
    data["s3"]["buckets"].pop("contract", None)
    return sci.render_json(data)


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


def test_notification_without_email_subscriber_gets_one(budgets, capsys):
    run(["--step", "budget", "--confirm", "--notify-email", EMAIL], budgets, capsys)
    key = ("ACTUAL", "GREATER_THAN", 80.0, "PERCENTAGE")
    budgets.budgets["reefradar-2477-ceiling-25"]["notifications"][key][1].clear()
    budgets.calls.clear()
    code, _, _ = run(["--step", "budget", "--confirm", "--notify-email", EMAIL], budgets, capsys)
    assert code == 0
    assert budgets.mutating_calls() == ["create_subscriber"]


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
    src = pristine_resources_text()
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
    target.write_text(pristine_resources_text(), encoding="utf-8")
    run(["--step", "budget", "--confirm", "--notify-email", EMAIL], budgets, capsys)
    run(["--step", "budget", "--record-resources"], budgets, capsys, resources_path=target)
    first = target.read_bytes()
    run(["--step", "budget", "--record-resources"], budgets, capsys, resources_path=target)
    assert target.read_bytes() == first


def test_record_resources_refuses_when_budget_is_missing(budgets, capsys, tmp_path):
    target = tmp_path / "resources.json"
    original = pristine_resources_text()
    target.write_text(original, encoding="utf-8")
    code, _, _ = run(["--step", "budget", "--record-resources"], budgets, capsys, resources_path=target)
    assert code == 1
    assert target.read_text(encoding="utf-8") == original


def test_no_credentials_in_script_source():
    src = pathlib.Path(sci.__file__).read_text(encoding="utf-8")
    assert "gmail.com" not in src
    assert "AKIA" not in src
    assert "X-Amz-Signature" not in src


# ============================================================ storage (Task 2)

import boto3  # noqa: E402
from moto import mock_aws  # noqa: E402

BUCKET = "reefradar-2477-contract"
READ_ONLY = ("describe_", "list_", "get_", "head_")


class Recorder:
    """Wraps a boto3 client; records (operation, kwargs) for every call."""

    def __init__(self, inner):
        self._inner = inner
        self.calls = []

    def __getattr__(self, name):
        attr = getattr(self._inner, name)
        if name.startswith("_") or not callable(attr):
            return attr

        def wrapper(*args, **kwargs):
            self.calls.append((name, kwargs))
            return attr(*args, **kwargs)

        return wrapper

    def names(self):
        return [n for n, _ in self.calls]

    def mutating(self):
        return [n for n in self.names() if not n.startswith(READ_ONLY)]

    def kwargs_of(self, op):
        return [k for n, k in self.calls if n == op]


class CloudFrontRecorder(Recorder):
    """moto 5.2.3 drops OriginAccessControlId and S3OriginConfig from get_distribution_config
    (real CloudFront returns them), so read-backs overlay the origins that were sent at create."""

    def __init__(self, inner):
        super().__init__(inner)
        self._created_origins = {}

    def create_distribution_with_tags(self, **kwargs):
        self.calls.append(("create_distribution_with_tags", kwargs))
        resp = self._inner.create_distribution_with_tags(**kwargs)
        sent = kwargs["DistributionConfigWithTags"]["DistributionConfig"]
        self._created_origins[resp["Distribution"]["Id"]] = json.loads(json.dumps(sent["Origins"]))
        return resp

    def get_distribution_config(self, **kwargs):
        self.calls.append(("get_distribution_config", kwargs))
        resp = self._inner.get_distribution_config(**kwargs)
        if kwargs["Id"] in self._created_origins:
            resp["DistributionConfig"]["Origins"] = json.loads(json.dumps(self._created_origins[kwargs["Id"]]))
        return resp


class FakeHttp:
    def __init__(self, direct=403, missing=403, latest=403, root=403, root_body="<Error>AccessDenied</Error>"):
        self.responses = {"direct": (direct, ""), "missing": (missing, ""), "latest": (latest, ""), "root": (root, root_body)}
        self.urls = []

    def __call__(self, url):
        self.urls.append(url)
        if url.startswith(f"https://{BUCKET}.s3."):
            return self.responses["direct"]
        if url.endswith("probe-missing-key.json"):
            return self.responses["missing"]
        if url.endswith("latest.json"):
            return self.responses["latest"]
        return self.responses["root"]


@pytest.fixture
def world(monkeypatch):
    monkeypatch.setenv("AWS_ACCESS_KEY_ID", "testing")
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "testing")
    with mock_aws():
        budgets = FakeBudgets()
        s3 = Recorder(boto3.client("s3", region_name="us-east-1"))
        cf = CloudFrontRecorder(boto3.client("cloudfront", region_name="us-east-1"))
        yield {"budgets": budgets, "s3": s3, "cloudfront": cf, "sts": FakeSts(), "http": FakeHttp()}


def run_with(argv, world, capsys, **overrides):
    clients = {**world, **overrides}
    code = sci.main(list(argv), clients=clients)
    out = capsys.readouterr()
    return code, out.out, out.err


def arm_budget(world, capsys):
    code, _, _ = run_with(["--step", "budget", "--confirm", "--notify-email", EMAIL], world, capsys)
    assert code == 0


def storage_confirm(world, capsys):
    arm_budget(world, capsys)
    code, out, err = run_with(["--step", "storage", "--confirm"], world, capsys)
    assert code == 0, err
    return out


def only_distribution(world):
    items = world["cloudfront"].list_distributions()["DistributionList"]["Items"]
    assert len(items) == 1
    return items[0]


def test_storage_dry_run_lists_every_action_and_makes_no_mutating_call(world, capsys):
    arm_budget(world, capsys)
    for key in ("s3", "cloudfront"):
        world[key].calls.clear()
    code, out, _ = run_with(["--step", "storage", "--dry-run"], world, capsys)
    assert code == 0
    assert world["s3"].mutating() == [] and world["cloudfront"].mutating() == []
    planned = [j["action"] for j in json_lines(out) if j["step"] == "storage" and j["status"] == "planned"]
    for action in (
        "create_bucket",
        "put_public_access_block",
        "put_bucket_ownership_controls",
        "put_bucket_tagging",
        "create_origin_access_control",
        "create_distribution",
        "put_bucket_policy",
    ):
        assert action in planned
    assert world["cloudfront"].list_distributions()["DistributionList"]["Quantity"] == 0


def test_storage_confirm_requires_the_budget_alarm_first(world, capsys):
    code, _, err = run_with(["--step", "storage", "--confirm"], world, capsys)
    assert code == 1
    assert "budget" in err
    assert world["s3"].mutating() == [] and world["cloudfront"].mutating() == []


def test_storage_confirm_creates_a_private_bucket(world, capsys):
    storage_confirm(world, capsys)
    s3 = world["s3"]
    create = s3.kwargs_of("create_bucket")[0]
    assert create["Bucket"] == BUCKET
    assert "CreateBucketConfiguration" not in create  # us-east-1: no LocationConstraint
    pab = s3.get_public_access_block(Bucket=BUCKET)["PublicAccessBlockConfiguration"]
    assert pab == {
        "BlockPublicAcls": True,
        "IgnorePublicAcls": True,
        "BlockPublicPolicy": True,
        "RestrictPublicBuckets": True,
    }
    own = s3.get_bucket_ownership_controls(Bucket=BUCKET)["OwnershipControls"]["Rules"]
    assert [r["ObjectOwnership"] for r in own] == ["BucketOwnerEnforced"]
    enc = s3.get_bucket_encryption(Bucket=BUCKET)["ServerSideEncryptionConfiguration"]["Rules"]
    assert enc[0]["ApplyServerSideEncryptionByDefault"]["SSEAlgorithm"] == "AES256"
    tags = {t["Key"]: t["Value"] for t in s3.get_bucket_tagging(Bucket=BUCKET)["TagSet"]}
    assert tags["Project"] == "reefradar-2477"
    # no website hosting and no bucket CORS (the response-headers policy supplies CORS)
    assert not [n for n in s3.names() if n in ("put_bucket_website", "put_bucket_cors")]


def test_storage_confirm_creates_oac_and_exact_distribution_config(world, capsys):
    storage_confirm(world, capsys)
    cf = world["cloudfront"]
    oac = cf.list_origin_access_controls()["OriginAccessControlList"]["Items"]
    assert [o["Name"] for o in oac] == ["reefradar-2477-contract-oac"]
    assert (oac[0]["SigningProtocol"], oac[0]["SigningBehavior"], oac[0]["OriginAccessControlOriginType"]) == (
        "sigv4",
        "always",
        "s3",
    )
    dist = only_distribution(world)
    cfg = cf.get_distribution_config(Id=dist["Id"])["DistributionConfig"]
    assert cfg["Comment"] == "reefradar-2477-contract"
    assert cfg["CallerReference"] == "reefradar-2477-contract-v1"
    assert cfg["Enabled"] is True
    origin = cfg["Origins"]["Items"][0]
    assert origin["DomainName"] == "reefradar-2477-contract.s3.us-east-1.amazonaws.com"
    assert origin["OriginAccessControlId"] == oac[0]["Id"]
    assert origin["S3OriginConfig"]["OriginAccessIdentity"] == ""
    behavior = cfg["DefaultCacheBehavior"]
    assert behavior["ViewerProtocolPolicy"] == "redirect-to-https"
    assert sorted(behavior["AllowedMethods"]["Items"]) == ["GET", "HEAD"]
    assert behavior["Compress"] is True
    assert behavior["CachePolicyId"] == "658327ea-f89d-4fab-a63d-7e88639e58f6"
    assert behavior["ResponseHeadersPolicyId"] == "60669652-455b-4ae9-85a4-c4c02393f86c"
    assert cfg["HttpVersion"] == "http2and3"
    assert cfg["IsIPV6Enabled"] is True
    assert cfg["PriceClass"] == "PriceClass_All"
    errors = {e["ErrorCode"]: e for e in cfg["CustomErrorResponses"]["Items"]}
    assert sorted(errors) == [403, 404]
    for e in errors.values():
        assert e["ErrorCachingMinTTL"] == 10
        assert not e.get("ResponsePagePath")
    tags = cf.list_tags_for_resource(Resource=dist["ARN"])["Tags"]["Items"]
    assert {"Key": "Project", "Value": "reefradar-2477"} in tags
    # created through the pay-as-you-go API with tags; no invalidation
    assert "create_distribution_with_tags" in cf.names()
    assert not [n for n in cf.names() if "invalidation" in n]


def test_bucket_policy_is_one_getobject_statement_for_this_distribution_only(world, capsys):
    storage_confirm(world, capsys)
    dist = only_distribution(world)
    policy = json.loads(world["s3"].get_bucket_policy(Bucket=BUCKET)["Policy"])
    assert len(policy["Statement"]) == 1
    st = policy["Statement"][0]
    assert st["Effect"] == "Allow"
    assert st["Principal"] == {"Service": "cloudfront.amazonaws.com"}
    assert st["Action"] == "s3:GetObject"
    assert st["Resource"] == f"arn:aws:s3:::{BUCKET}/*"
    assert st["Condition"] == {
        "StringEquals": {"AWS:SourceArn": f"arn:aws:cloudfront::781978598306:distribution/{dist['Id']}"}
    }
    assert "ListBucket" not in json.dumps(policy)
    assert st["Principal"] != "*"


def test_policy_is_put_after_the_distribution_is_created_and_awaited(world, capsys):
    storage_confirm(world, capsys)
    cf_names = world["cloudfront"].names()
    assert "create_distribution_with_tags" in cf_names and "get_waiter" in cf_names
    assert "put_bucket_policy" in world["s3"].names()
    assert cf_names.index("create_distribution_with_tags") < cf_names.index("get_waiter")


def test_second_storage_confirm_creates_nothing(world, capsys):
    storage_confirm(world, capsys)
    for key in ("s3", "cloudfront"):
        world[key].calls.clear()
    code, out, _ = run_with(["--step", "storage", "--confirm"], world, capsys)
    assert code == 0
    assert world["s3"].mutating() == [] and world["cloudfront"].mutating() == []
    assert not [j for j in json_lines(out) if j["status"] in ("done", "planned", "waiting")]
    assert world["cloudfront"].list_distributions()["DistributionList"]["Quantity"] == 1


def test_all_step_dry_run_after_setup_lists_no_create_or_update(world, capsys):
    arm_budget(world, capsys)
    code, _, err = run_with(["--step", "all", "--confirm", "--notify-email", EMAIL], world, capsys)
    assert code == 0, err
    for key in ("s3", "cloudfront"):
        world[key].calls.clear()
    world["budgets"].calls.clear()
    code, out, _ = run_with(["--step", "all", "--dry-run", "--notify-email", EMAIL], world, capsys)
    assert code == 0
    assert not [j for j in json_lines(out) if j["status"] == "planned"]
    assert world["budgets"].mutating_calls() == []
    assert world["s3"].mutating() == [] and world["cloudfront"].mutating() == []


def test_existing_bucket_gets_only_the_missing_settings(world, capsys):
    arm_budget(world, capsys)
    world["s3"].create_bucket(Bucket=BUCKET)
    world["s3"].calls.clear()
    code, _, err = run_with(["--step", "storage", "--confirm"], world, capsys)
    assert code == 0, err
    assert "create_bucket" not in world["s3"].names()
    assert "put_public_access_block" in world["s3"].names()


def test_existing_distribution_with_wrong_settings_is_not_altered_or_duplicated(world, capsys):
    storage_confirm(world, capsys)
    dist = only_distribution(world)
    cf = world["cloudfront"]
    got = cf.get_distribution_config(Id=dist["Id"])
    cfg = got["DistributionConfig"]
    cfg["DefaultCacheBehavior"]["ViewerProtocolPolicy"] = "allow-all"
    cf.update_distribution(Id=dist["Id"], IfMatch=got["ETag"], DistributionConfig=cfg)
    cf.calls.clear()
    code, _, err = run_with(["--step", "storage", "--confirm"], world, capsys)
    assert code == 1
    assert "viewer protocol" in err
    assert cf.mutating() == []
    assert cf.list_distributions()["DistributionList"]["Quantity"] == 1


# ------------------------------------------------------------- storage verify


def test_storage_verify_fails_before_setup_and_passes_after(world, capsys):
    arm_budget(world, capsys)
    code, _, _ = run_with(["--step", "storage", "--verify"], world, capsys)
    assert code == 1
    assert run_with(["--step", "storage", "--confirm"], world, capsys)[0] == 0
    code, out, _ = run_with(["--step", "storage", "--verify"], world, capsys)
    assert code == 0
    lines = [j for j in json_lines(out) if j["step"] == "storage"]
    assert all(j["status"] == "ok" for j in lines)
    assert {j["action"] for j in lines} >= {
        "direct_s3_get_denied",
        "cloudfront_missing_key_denied",
        "cloudfront_root_not_a_listing",
    }


def test_storage_verify_probes_use_only_public_https_urls(world, capsys):
    storage_confirm(world, capsys)
    run_with(["--step", "storage", "--verify"], world, capsys)
    urls = world["http"].urls
    assert urls[0] == "https://reefradar-2477-contract.s3.us-east-1.amazonaws.com/contract/latest.json"
    assert all(u.startswith("https://") for u in urls)
    assert all("X-Amz" not in u and "?" not in u for u in urls)


@pytest.mark.parametrize(
    "http",
    [
        FakeHttp(direct=200),
        FakeHttp(missing=200),
        FakeHttp(root=200, root_body="<ListBucketResult><Name>b</Name></ListBucketResult>"),
        FakeHttp(root=500),
    ],
)
def test_storage_verify_flags_public_exposure(world, capsys, http):
    storage_confirm(world, capsys)
    code, _, _ = run_with(["--step", "storage", "--verify"], world, capsys, http=http)
    assert code == 1


def test_storage_verify_accepts_a_published_latest_json_but_not_a_listing(world, capsys):
    storage_confirm(world, capsys)
    published = FakeHttp()
    published.responses["latest"] = (200, '{"contract_version": 1}')
    assert run_with(["--step", "storage", "--verify"], world, capsys, http=published)[0] == 0
    listing = FakeHttp()
    listing.responses["latest"] = (200, "<ListBucketResult></ListBucketResult>")
    assert run_with(["--step", "storage", "--verify"], world, capsys, http=listing)[0] == 1


def test_storage_verify_flags_a_widened_bucket_policy(world, capsys):
    storage_confirm(world, capsys)
    policy = sci.desired_policy(only_distribution(world)["Id"])
    policy["Statement"][0]["Action"] = ["s3:GetObject", "s3:ListBucket"]
    world["s3"].put_bucket_policy(Bucket=BUCKET, Policy=json.dumps(policy))
    code, out, _ = run_with(["--step", "storage", "--verify"], world, capsys)
    assert code == 1
    assert "Action" in out


def test_storage_verify_flags_public_principal(world, capsys):
    storage_confirm(world, capsys)
    policy = sci.desired_policy(only_distribution(world)["Id"])
    policy["Statement"][0]["Principal"] = "*"
    world["s3"].put_bucket_policy(Bucket=BUCKET, Policy=json.dumps(policy))
    assert run_with(["--step", "storage", "--verify"], world, capsys)[0] == 1


def test_storage_verify_flags_missing_public_access_block(world, capsys):
    storage_confirm(world, capsys)
    world["s3"].delete_public_access_block(Bucket=BUCKET)
    assert run_with(["--step", "storage", "--verify"], world, capsys)[0] == 1


# ------------------------------------------------------- storage record-resources


def test_record_resources_after_storage_adds_bucket_and_distribution_and_keeps_the_rest(world, capsys, tmp_path):
    storage_confirm(world, capsys)
    source = pristine_resources_text()
    target = tmp_path / "resources.json"
    target.write_text(source, encoding="utf-8")
    before = json.loads(source)
    code, _, err = run_with(["--step", "all", "--record-resources", "--resources-file", str(target)], world, capsys)
    assert code == 0, err
    after = json.loads(target.read_text(encoding="utf-8"))
    dist = only_distribution(world)
    contract = after["cloudfront"]["distributions"]["contract"]
    assert contract["id"] == dist["Id"]
    assert contract["domain_name"] == dist["DomainName"]
    assert contract["domain_name"].endswith(".cloudfront.net")
    assert contract["comment"] == "reefradar-2477-contract"
    assert contract["origin_access_control_id"]
    assert contract["cache_policy"] == "Managed-CachingOptimized"
    assert contract["response_headers_policy"] == "Managed-SimpleCORS"
    assert contract["error_caching_min_ttl"] == 10
    assert after["s3"]["buckets"]["contract"] == {
        "name": BUCKET,
        "arn": f"arn:aws:s3:::{BUCKET}",
        "region": "us-east-1",
        "folders": ["contract/", "v1/"],
    }
    assert after["s3"]["buckets"]["audio"] == before["s3"]["buckets"]["audio"]
    assert after["budgets"]["ceiling"]["name"] == "reefradar-2477-ceiling-25"
    assert list(after)[-1] == "budgets"
    for key in before:
        if key not in ("s3", "budgets"):
            assert after[key] == before[key]
    assert EMAIL not in target.read_text(encoding="utf-8")
    first = target.read_bytes()
    run_with(["--step", "all", "--record-resources", "--resources-file", str(target)], world, capsys)
    assert target.read_bytes() == first


def test_record_resources_refuses_when_storage_is_missing(world, capsys, tmp_path):
    arm_budget(world, capsys)
    target = tmp_path / "resources.json"
    original = pristine_resources_text()
    target.write_text(original, encoding="utf-8")
    code, _, _ = run_with(["--step", "storage", "--record-resources", "--resources-file", str(target)], world, capsys)
    assert code == 1
    assert target.read_text(encoding="utf-8") == original

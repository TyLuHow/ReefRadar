#!/usr/bin/env python3
"""
Create the AWS side of the data contract (plan 02-02, CONTRACT-01):

  storage  private bucket reefradar-2477-contract served only through CloudFront (origin
           access control, HTTPS, managed CachingOptimized policy, the custom CORS
           response headers policy below, 10 s error caching) with a bucket policy that
           grants s3:GetObject to that one distribution and nothing else (no listing).
  budget   the owner's 25 USD/month cost budget with email alerts (80% and 100%
           of actual spend, 100% of forecast spend). It replaces the alert-less
           reefradar-2477-budget (50 USD), which is deleted only after the new
           budget and all three notifications read back correctly.
  cors     (plan 02-13) the custom response headers policy reefradar-2477-contract-cors
           (origins *, headers *, methods GET/HEAD/OPTIONS, credentials false, max age
           600 s, origin override) attached to the distribution's default cache behaviour,
           which then allows GET/HEAD/OPTIONS and caches only GET/HEAD. The AWS managed
           Managed-SimpleCORS policy it replaces answers only simple CORS requests, so every
           real browser read (which carries Priority or Cache-Control headers) was blocked.
           The step finds or creates the policy, then updates the distribution with IfMatch on
           the ETag it just read, changing only ResponseHeadersPolicyId and AllowedMethods, waits
           for Deployed and reads back. It never requests an invalidation: CloudFront applies
           response headers policies to the responses it serves from the cache too, so cached
           objects need no purge. It makes no S3 or origin access control write.
  cors-rollback  restores Managed-SimpleCORS and GET/HEAD in one update (reachable only by
           name, never part of `all`, dry-run or --confirm only); the custom policy is kept.

Everything is idempotent: existing resources are found by name and only what is
missing is created.

  --dry-run           print one JSON line per planned action; only describe/list/get
                      calls are made
  --confirm           required for any AWS write (a run with neither flag is also
                      read-only)
  --verify            read-only report; exit 1 on any deviation from the desired state
  --record-resources  rewrite the matching sections of infrastructure/resources.json
                      from read-only describe calls (no AWS write, no --confirm)
  --step              budget | storage | cors | cors-rollback | all (default all =
                      budget, storage, cors in that order; cors-rollback only by name)
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
    py -3.12 scripts/setup_contract_infra.py --step storage --dry-run
    py -3.12 scripts/setup_contract_infra.py --step storage --confirm
    py -3.12 scripts/setup_contract_infra.py --step cors --dry-run
    py -3.12 scripts/setup_contract_infra.py --step cors --confirm
    py -3.12 scripts/setup_contract_infra.py --step cors-rollback --dry-run
    py -3.12 scripts/setup_contract_infra.py --step cors-rollback --confirm
    py -3.12 scripts/setup_contract_infra.py --step all --verify
    py -3.12 scripts/setup_contract_infra.py --step all --record-resources

--verify with the storage step also makes unauthenticated HTTPS probes (status codes
only): direct S3 must answer 403, a missing key through CloudFront 403 or 404, and
neither the CloudFront root nor latest.json may ever be a bucket listing.
"""

from __future__ import annotations

import argparse
import copy
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

BUCKET_NAME = "reefradar-2477-contract"
BUCKET_DOMAIN = f"{BUCKET_NAME}.s3.{REGION}.amazonaws.com"
OAC_NAME = "reefradar-2477-contract-oac"
DISTRIBUTION_COMMENT = "reefradar-2477-contract"
CALLER_REFERENCE = "reefradar-2477-contract-v1"
ORIGIN_ID = "reefradar-2477-contract-s3"
PROJECT_TAG = "reefradar-2477"
PAB_FLAGS = ("BlockPublicAcls", "IgnorePublicAcls", "BlockPublicPolicy", "RestrictPublicBuckets")
# AWS managed policies (identical in every account)
CACHE_POLICY_ID = "658327ea-f89d-4fab-a63d-7e88639e58f6"  # Managed-CachingOptimized
# Managed-SimpleCORS: kept only to recognise the policy plan 02-13 replaced and to roll back to it
MANAGED_SIMPLE_CORS_ID = "60669652-455b-4ae9-85a4-c4c02393f86c"
CORS_POLICY_NAME = "reefradar-2477-contract-cors"
CORS_POLICY_COMMENT = "reefradar-2477 contract: wildcard CORS for public credential-free reads (plan 02-13)"
CORS_ALLOWED_METHODS = ["GET", "HEAD", "OPTIONS"]
CACHED_METHODS = ["GET", "HEAD"]
CORS_MAX_AGE_SEC = 600
DRY_RUN_POLICY_ID = f"<id-of-{CORS_POLICY_NAME}-after-create>"
ERROR_CACHING_MIN_TTL = 10
WAITER_CONFIG = {"Delay": 30, "MaxAttempts": 60}
LATEST_KEY = "contract/latest.json"
MISSING_PROBE_KEY = "contract/probe-missing-key.json"

STEPS = ("budget", "storage", "cors", "cors-rollback", "all")


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
        if name == "http" and name not in self._injected:
            return _public_probe
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
    return (n["NotificationType"], n["ComparisonOperator"], float(n["Threshold"]), n.get("ThresholdType", THRESHOLD_TYPE))


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
        if write:
            budgets.create_budget(
                AccountId=ACCOUNT_ID,
                Budget=_new_budget_body(),
                NotificationsWithSubscribers=[{"Notification": n, "Subscribers": [_subscriber(email)]} for n in desired],
            )
        emit("budget", "create_budget", BUDGET_NAME, status, limit_usd=int(BUDGET_LIMIT_USD), time_unit="MONTHLY",
             notifications=[_describe_key(_nkey(n)) for n in desired], subscriber=shown)
    else:
        for n in desired:
            if _nkey(n) in state["missing"]:
                if write:
                    budgets.create_notification(
                        AccountId=ACCOUNT_ID, BudgetName=BUDGET_NAME, Notification=n, Subscribers=[_subscriber(email)]
                    )
                emit("budget", "create_notification", BUDGET_NAME, status, notification=_describe_key(_nkey(n)), subscriber=shown)
        for key in sub_fixes:
            n = _desired_notification(key[0], int(key[2]))
            if write:
                budgets.create_subscriber(
                    AccountId=ACCOUNT_ID, BudgetName=BUDGET_NAME, Notification=n, Subscriber=_subscriber(email)
                )
            emit("budget", "create_subscriber", BUDGET_NAME, status, notification=_describe_key(key), subscriber=shown)

    if legacy is not None:
        emit("budget", "legacy_budget_before_delete", LEGACY_BUDGET_NAME, "info", **legacy)
        if not write:
            emit("budget", "delete_legacy_budget", LEGACY_BUDGET_NAME, "planned")

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
        emit("budget", "delete_legacy_budget", LEGACY_BUDGET_NAME, "done")


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


# ------------------------------------------------------------------- storage


def _optional(call, *missing_codes):
    """Run a read call; return None when AWS answers one of the 'not configured' codes."""
    from botocore.exceptions import ClientError

    try:
        return call()
    except ClientError as exc:
        if _code(exc) in missing_codes:
            return None
        raise


def _list_all(fn, list_key: str):
    """Yield Items across pages of a CloudFront list call (Marker/NextMarker pagination)."""
    marker = None
    while True:
        resp = fn(Marker=marker) if marker else fn()
        listing = resp.get(list_key) or {}
        yield from listing.get("Items") or []
        if listing.get("IsTruncated") and listing.get("NextMarker"):
            marker = listing["NextMarker"]
        else:
            return


def desired_policy(distribution_id: str) -> dict:
    return {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Sid": "AllowCloudFrontServicePrincipalReadOnly",
                "Effect": "Allow",
                "Principal": {"Service": "cloudfront.amazonaws.com"},
                "Action": "s3:GetObject",
                "Resource": f"arn:aws:s3:::{BUCKET_NAME}/*",
                "Condition": {
                    "StringEquals": {"AWS:SourceArn": f"arn:aws:cloudfront::{ACCOUNT_ID}:distribution/{distribution_id}"}
                },
            }
        ],
    }


def policy_problems(policy: dict | None, distribution_id: str) -> list[str]:
    if policy is None:
        return ["bucket policy missing"]
    problems = []
    statements = policy.get("Statement", [])
    if not isinstance(statements, list) or len(statements) != 1:
        return [f"bucket policy must have exactly one statement, found {len(statements) if isinstance(statements, list) else 1}"]
    got, want = statements[0], desired_policy(distribution_id)["Statement"][0]
    for field in ("Effect", "Principal", "Resource", "Condition"):
        if got.get(field) != want[field]:
            problems.append(f"bucket policy {field} differs from the desired value")
    actions = got.get("Action")
    if (actions if isinstance(actions, list) else [actions]) != ["s3:GetObject"]:
        problems.append("bucket policy Action must be exactly s3:GetObject")
    return problems


def desired_distribution_config(oac_id: str, cors_policy_id: str) -> dict:
    return {
        "CallerReference": CALLER_REFERENCE,
        "Comment": DISTRIBUTION_COMMENT,
        "Enabled": True,
        "Origins": {
            "Quantity": 1,
            "Items": [
                {
                    "Id": ORIGIN_ID,
                    "DomainName": BUCKET_DOMAIN,
                    "OriginPath": "",
                    "CustomHeaders": {"Quantity": 0},
                    "S3OriginConfig": {"OriginAccessIdentity": ""},
                    "OriginAccessControlId": oac_id,
                }
            ],
        },
        "DefaultCacheBehavior": {
            "TargetOriginId": ORIGIN_ID,
            "ViewerProtocolPolicy": "redirect-to-https",
            "AllowedMethods": _allowed_methods(CORS_ALLOWED_METHODS),
            "Compress": True,
            "CachePolicyId": CACHE_POLICY_ID,
            "ResponseHeadersPolicyId": cors_policy_id,
        },
        "CustomErrorResponses": {
            "Quantity": 2,
            "Items": [{"ErrorCode": code, "ErrorCachingMinTTL": ERROR_CACHING_MIN_TTL} for code in (403, 404)],
        },
        "HttpVersion": "http2and3",
        "IsIPV6Enabled": True,
        "PriceClass": "PriceClass_All",
        "DefaultRootObject": "",
    }


def _allowed_methods(allowed: list[str]) -> dict:
    """CloudFront's AllowedMethods shape: the allowed methods, caching only GET and HEAD."""
    return {
        "Quantity": len(allowed),
        "Items": list(allowed),
        "CachedMethods": {"Quantity": len(CACHED_METHODS), "Items": list(CACHED_METHODS)},
    }


def distribution_problems(config: dict, oac_id: str | None) -> list[str]:
    """Compare the settings that matter for security and caching (CORS is checked by cors_problems)."""
    problems = []
    behavior = config.get("DefaultCacheBehavior", {})
    origins = (config.get("Origins") or {}).get("Items") or []
    checks = [
        ("enabled", config.get("Enabled") is True),
        ("single origin", len(origins) == 1),
        ("origin domain", bool(origins) and origins[0].get("DomainName") == BUCKET_DOMAIN),
        ("origin access control", bool(origins) and bool(oac_id) and origins[0].get("OriginAccessControlId") == oac_id),
        ("S3 origin without legacy identity", bool(origins) and (origins[0].get("S3OriginConfig") or {}).get("OriginAccessIdentity") == ""),
        ("viewer protocol redirect-to-https", behavior.get("ViewerProtocolPolicy") == "redirect-to-https"),
        ("compress", behavior.get("Compress") is True),
        ("cache policy Managed-CachingOptimized", behavior.get("CachePolicyId") == CACHE_POLICY_ID),
        ("http2and3", config.get("HttpVersion") == "http2and3"),
        ("IPv6", config.get("IsIPV6Enabled") is True),
        ("price class all", config.get("PriceClass") == "PriceClass_All"),
        ("no default root object", not config.get("DefaultRootObject")),
    ]
    for label, good in checks:
        if not good:
            problems.append(label)
    errors = {e.get("ErrorCode"): e for e in (config.get("CustomErrorResponses") or {}).get("Items") or []}
    for code in (403, 404):
        e = errors.get(code)
        if not e or e.get("ErrorCachingMinTTL") != ERROR_CACHING_MIN_TTL or e.get("ResponsePagePath"):
            problems.append(f"{code} error caching {ERROR_CACHING_MIN_TTL}s without a custom page")
    return problems


def cors_problems(config: dict, cors_policy_id: str | None) -> list[str]:
    """The CORS-related settings of the default cache behaviour that differ from the desired state."""
    behavior = config.get("DefaultCacheBehavior", {})
    methods = behavior.get("AllowedMethods") or {}
    problems = []
    if not cors_policy_id or behavior.get("ResponseHeadersPolicyId") != cors_policy_id:
        problems.append(f"response headers policy {CORS_POLICY_NAME}")
    if sorted(methods.get("Items") or []) != sorted(CORS_ALLOWED_METHODS) or sorted(
        (methods.get("CachedMethods") or {}).get("Items") or []
    ) != sorted(CACHED_METHODS):
        problems.append("allowed methods GET/HEAD/OPTIONS, cached GET/HEAD")
    return problems


def _find_oac(cloudfront):
    for item in _list_all(cloudfront.list_origin_access_controls, "OriginAccessControlList"):
        if item.get("Name") == OAC_NAME:
            return item
    return None


def _find_distribution(cloudfront):
    for item in _list_all(cloudfront.list_distributions, "DistributionList"):
        if item.get("Comment") == DISTRIBUTION_COMMENT:
            return item
    return None


def _oac_problems(oac: dict) -> list[str]:
    want = {"SigningProtocol": "sigv4", "SigningBehavior": "always", "OriginAccessControlOriginType": "s3"}
    return [f"OAC {k} is {oac.get(k)}, expected {v}" for k, v in want.items() if oac.get(k) != v]


def inspect_storage(s3, cloudfront) -> dict:
    """Read-only snapshot of the storage resources and the problems found in them."""
    from botocore.exceptions import ClientError

    st = {"bucket": False, "problems": [], "missing": []}
    try:
        s3.head_bucket(Bucket=BUCKET_NAME)
        st["bucket"] = True
    except ClientError as exc:
        if _code(exc) not in ("404", "NoSuchBucket", "NotFound"):
            raise SetupError(f"bucket {BUCKET_NAME} is not accessible ({_code(exc)}); refusing to continue")
    if st["bucket"]:
        pab = _optional(
            lambda: s3.get_public_access_block(Bucket=BUCKET_NAME)["PublicAccessBlockConfiguration"],
            "NoSuchPublicAccessBlockConfiguration",
        )
        st["pab_ok"] = bool(pab) and all(pab.get(k) is True for k in PAB_FLAGS)
        own = _optional(
            lambda: s3.get_bucket_ownership_controls(Bucket=BUCKET_NAME)["OwnershipControls"], "OwnershipControlsNotFoundError"
        )
        st["ownership_ok"] = bool(own) and [r.get("ObjectOwnership") for r in own.get("Rules", [])] == ["BucketOwnerEnforced"]
        enc = _optional(
            lambda: s3.get_bucket_encryption(Bucket=BUCKET_NAME)["ServerSideEncryptionConfiguration"],
            "ServerSideEncryptionConfigurationNotFoundError",
        )
        algos = [
            r.get("ApplyServerSideEncryptionByDefault", {}).get("SSEAlgorithm") for r in (enc or {}).get("Rules", [])
        ]
        st["encryption_ok"] = algos == ["AES256"]
        tags = _optional(lambda: s3.get_bucket_tagging(Bucket=BUCKET_NAME)["TagSet"], "NoSuchTagSet") or []
        st["tags"] = tags
        st["tags_ok"] = any(t.get("Key") == "Project" and t.get("Value") == PROJECT_TAG for t in tags)
        raw = _optional(lambda: s3.get_bucket_policy(Bucket=BUCKET_NAME)["Policy"], "NoSuchBucketPolicy")
        st["policy"] = json.loads(raw) if raw else None
        for label in ("pab", "ownership", "encryption", "tags"):
            if not st[f"{label}_ok"]:
                st["problems"].append(f"bucket {label} not as desired")
    else:
        st["problems"].append("bucket missing")

    oac = _find_oac(cloudfront)
    st["oac"] = oac
    if oac is None:
        st["problems"].append("origin access control missing")
    else:
        st["problems"] += _oac_problems(oac)

    dist = _find_distribution(cloudfront)
    st["distribution"] = dist
    if dist is None:
        st["problems"].append("distribution missing")
        st["dist_config"] = None
    else:
        cfg = cloudfront.get_distribution_config(Id=dist["Id"])["DistributionConfig"]
        st["dist_config"] = cfg
        if dist.get("Status") != "Deployed":
            st["problems"].append("distribution is not deployed yet")
        st["problems"] += [f"distribution: {p}" for p in distribution_problems(cfg, (oac or {}).get("Id"))]
        st["policy_problems"] = policy_problems(st.get("policy"), dist["Id"]) if st["bucket"] else ["bucket policy missing"]
        st["problems"] += st["policy_problems"]
    if st["bucket"] and dist is None and st.get("policy") is not None:
        st["problems"].append("bucket policy exists but the distribution is missing")
    return st


def _public_access_block() -> dict:
    return {k: True for k in PAB_FLAGS}


def storage_step(aws, write: bool) -> None:
    s3, cloudfront, budgets = aws.get("s3"), aws.get("cloudfront"), aws.get("budgets")
    if write and not budget_verify_quiet(budgets):
        raise SetupError(f"budget alarm {BUDGET_NAME} must exist and verify before the contract storage is created")
    st = inspect_storage(s3, cloudfront)
    status = "done" if write else "planned"

    def act(action, resource, call=None, **extra):
        if write and call:
            call()
        emit("storage", action, resource, status, **extra)

    def present(action, resource):
        emit("storage", action, resource, "ok")

    if not st["bucket"]:
        act("create_bucket", BUCKET_NAME, lambda: s3.create_bucket(Bucket=BUCKET_NAME), region=REGION)
    if not st["bucket"] or not st.get("pab_ok"):
        act(
            "put_public_access_block", BUCKET_NAME,
            lambda: s3.put_public_access_block(Bucket=BUCKET_NAME, PublicAccessBlockConfiguration=_public_access_block()),
        )
    else:
        present("public_access_block", BUCKET_NAME)
    if not st["bucket"] or not st.get("ownership_ok"):
        act(
            "put_bucket_ownership_controls", BUCKET_NAME,
            lambda: s3.put_bucket_ownership_controls(
                Bucket=BUCKET_NAME, OwnershipControls={"Rules": [{"ObjectOwnership": "BucketOwnerEnforced"}]}
            ),
        )
    else:
        present("bucket_ownership_controls", BUCKET_NAME)
    if not st["bucket"] or not st.get("encryption_ok"):
        act(
            "put_bucket_encryption", BUCKET_NAME,
            lambda: s3.put_bucket_encryption(
                Bucket=BUCKET_NAME,
                ServerSideEncryptionConfiguration={"Rules": [{"ApplyServerSideEncryptionByDefault": {"SSEAlgorithm": "AES256"}}]},
            ),
        )
    else:
        present("bucket_encryption", BUCKET_NAME)
    if not st["bucket"] or not st.get("tags_ok"):
        merged = [t for t in st.get("tags", []) if t.get("Key") != "Project"] + [{"Key": "Project", "Value": PROJECT_TAG}]
        act("put_bucket_tagging", BUCKET_NAME, lambda: s3.put_bucket_tagging(Bucket=BUCKET_NAME, Tagging={"TagSet": merged}))
    else:
        present("bucket_tagging", BUCKET_NAME)

    oac = st["oac"]
    if oac is not None and _oac_problems(oac):
        raise SetupError(f"origin access control {OAC_NAME} exists with unexpected settings; not altering it")
    if oac is None:
        created = {}

        def make_oac():
            resp = cloudfront.create_origin_access_control(
                OriginAccessControlConfig={
                    "Name": OAC_NAME,
                    "Description": "reefradar-2477 contract bucket",
                    "SigningProtocol": "sigv4",
                    "SigningBehavior": "always",
                    "OriginAccessControlOriginType": "s3",
                }
            )
            created["id"] = resp["OriginAccessControl"]["Id"]

        act("create_origin_access_control", OAC_NAME, make_oac)
        oac = {"Id": created.get("id")}
    else:
        present("origin_access_control", OAC_NAME)

    dist = st["distribution"]
    if dist is not None and st["dist_config"] is not None:
        problems = distribution_problems(st["dist_config"], oac.get("Id"))
        if problems:
            raise SetupError("distribution exists with unexpected settings (" + "; ".join(problems) + "); not altering it")
        present("distribution", DISTRIBUTION_COMMENT)
    else:
        cors_policy_id = ensure_cors_policy(cloudfront, write, "storage")
        made = {}

        def make_distribution():
            resp = cloudfront.create_distribution_with_tags(
                DistributionConfigWithTags={
                    "DistributionConfig": desired_distribution_config(oac["Id"], cors_policy_id),
                    "Tags": {"Items": [{"Key": "Project", "Value": PROJECT_TAG}]},
                }
            )
            made.update(resp["Distribution"])

        act("create_distribution", DISTRIBUTION_COMMENT, make_distribution,
            origin=BUCKET_DOMAIN, cache_policy="Managed-CachingOptimized", response_headers_policy=CORS_POLICY_NAME,
            allowed_methods=CORS_ALLOWED_METHODS, cached_methods=CACHED_METHODS)
        dist = {"Id": made.get("Id"), "DomainName": made.get("DomainName"), "Status": made.get("Status")}

    if write and (st["distribution"] is None or dist.get("Status") != "Deployed"):
        emit("storage", "wait_distribution_deployed", DISTRIBUTION_COMMENT, "waiting")
        cloudfront.get_waiter("distribution_deployed").wait(Id=dist["Id"], WaiterConfig=WAITER_CONFIG)
        emit("storage", "wait_distribution_deployed", DISTRIBUTION_COMMENT, "ok", domain_name=dist.get("DomainName"))

    dist_id = dist.get("Id")
    policy_ok = bool(st["bucket"] and st["distribution"] is not None and dist_id and not policy_problems(st.get("policy"), dist_id))
    if policy_ok:
        present("bucket_policy", BUCKET_NAME)
    else:
        act(
            "put_bucket_policy", BUCKET_NAME,
            lambda: s3.put_bucket_policy(Bucket=BUCKET_NAME, Policy=json.dumps(desired_policy(dist["Id"]))),
            effect="Allow s3:GetObject to cloudfront.amazonaws.com for this distribution only",
            distribution_id=dist_id or "<distribution-id-after-create>",
        )


def _public_probe(url: str):
    import requests

    resp = requests.get(url, timeout=30, allow_redirects=False, headers={"User-Agent": "reefradar-contract-verify"})
    return resp.status_code, resp.text[:2000]


def storage_verify(aws) -> bool:
    ok = True
    st = inspect_storage(aws.get("s3"), aws.get("cloudfront"))

    def report(action, good, detail=None):
        nonlocal ok
        ok = ok and good
        emit("storage", action, BUCKET_NAME, "ok" if good else "deviation", **({"detail": detail} if detail else {}))

    report("state_matches_desired", not st["problems"], "; ".join(st["problems"]) or None)
    dist = st["distribution"]
    if dist is None:
        report("public_probes", False, "distribution missing; probes skipped")
        return False
    probe = aws.get("http")
    base = f"https://{dist['DomainName']}"
    direct_status, _ = probe(f"https://{BUCKET_DOMAIN}/{LATEST_KEY}")
    report("direct_s3_get_denied", direct_status == 403, f"status {direct_status}")
    missing_status, _ = probe(f"{base}/{MISSING_PROBE_KEY}")
    report("cloudfront_missing_key_denied", missing_status in (403, 404), f"status {missing_status}")
    latest_status, latest_body = probe(f"{base}/{LATEST_KEY}")
    report(
        "cloudfront_latest_not_a_listing",
        latest_status in (200, 403, 404) and "ListBucketResult" not in latest_body,
        f"status {latest_status}",
    )
    root_status, root_body = probe(f"{base}/")
    report("cloudfront_root_not_a_listing", root_status in (403, 404) and "ListBucketResult" not in root_body, f"status {root_status}")
    return ok


def storage_record(aws, resources: dict) -> dict:
    st = inspect_storage(aws.get("s3"), aws.get("cloudfront"))
    if st["problems"]:
        raise SetupError("storage does not match the desired state; refusing to record it: " + "; ".join(st["problems"]))
    dist = st["distribution"]
    buckets = resources.setdefault("s3", {}).setdefault("buckets", {})
    buckets["contract"] = {
        "name": BUCKET_NAME,
        "arn": f"arn:aws:s3:::{BUCKET_NAME}",
        "region": REGION,
        "folders": ["contract/", "v1/"],
    }
    # Update only the keys this step owns; the CORS keys belong to cors_record.
    contract = resources.setdefault("cloudfront", {}).setdefault("distributions", {}).setdefault("contract", {})
    contract.update(
        {
            "id": dist["Id"],
            "arn": f"arn:aws:cloudfront::{ACCOUNT_ID}:distribution/{dist['Id']}",
            "domain_name": dist["DomainName"],
            "comment": DISTRIBUTION_COMMENT,
            "origin_access_control_id": st["oac"]["Id"],
            "cache_policy": "Managed-CachingOptimized",
            "error_caching_min_ttl": ERROR_CACHING_MIN_TTL,
        }
    )
    return resources


# ---------------------------------------------------------------------- cors
# Plan 02-13: the custom response headers policy that replaces Managed-SimpleCORS.


def desired_cors_policy_config() -> dict:
    """ResponseHeadersPolicyConfig in CloudFront's Quantity/Items shape, with no other sections."""

    def items(values):
        return {"Quantity": len(values), "Items": list(values)}

    return {
        "Name": CORS_POLICY_NAME,
        "Comment": CORS_POLICY_COMMENT,
        "CorsConfig": {
            "AccessControlAllowOrigins": items(["*"]),
            "AccessControlAllowHeaders": items(["*"]),
            "AccessControlAllowMethods": items(CORS_ALLOWED_METHODS),
            "AccessControlAllowCredentials": False,
            "AccessControlMaxAgeSec": CORS_MAX_AGE_SEC,
            "OriginOverride": True,
        },
    }


def _policy_config_of(cloudfront, item: dict) -> dict:
    """The full config of a listed policy (the list normally carries it; fall back to a get)."""
    policy = item.get("ResponseHeadersPolicy") or {}
    config = policy.get("ResponseHeadersPolicyConfig")
    if config is None and policy.get("Id"):
        got = cloudfront.get_response_headers_policy(Id=policy["Id"])
        config = got["ResponseHeadersPolicy"]["ResponseHeadersPolicyConfig"]
    return config or {}


def _find_cors_policy(cloudfront):
    """(id, config) of the custom policy named CORS_POLICY_NAME, or None.

    ResponseHeadersPolicyList has no IsTruncated field, so the pages are followed by NextMarker."""
    marker = None
    while True:
        kwargs = {"Type": "custom"}
        if marker:
            kwargs["Marker"] = marker
        listing = cloudfront.list_response_headers_policies(**kwargs).get("ResponseHeadersPolicyList") or {}
        for item in listing.get("Items") or []:
            config = _policy_config_of(cloudfront, item)
            if config.get("Name") == CORS_POLICY_NAME:
                return item["ResponseHeadersPolicy"]["Id"], config
        marker = listing.get("NextMarker")
        if not marker:
            return None


def _items(section) -> list:
    return sorted((section or {}).get("Items") or [])


def _cors_policy_problems(config: dict) -> list[str]:
    """Differences between a policy's config and the desired one (Items order and Quantity ignored)."""
    want = desired_cors_policy_config()["CorsConfig"]
    got = config.get("CorsConfig") or {}
    problems = []
    for key in ("AccessControlAllowOrigins", "AccessControlAllowHeaders", "AccessControlAllowMethods"):
        if _items(got.get(key)) != sorted(want[key]["Items"]):
            problems.append(f"{key} is {_items(got.get(key))}, expected {sorted(want[key]['Items'])}")
    for key in ("AccessControlAllowCredentials", "AccessControlMaxAgeSec", "OriginOverride"):
        if got.get(key) != want[key]:
            problems.append(f"{key} is {got.get(key)!r}, expected {want[key]!r}")
    if _items(got.get("AccessControlExposeHeaders")):
        problems.append("AccessControlExposeHeaders is not empty")
    for section in ("SecurityHeadersConfig", "CustomHeadersConfig", "RemoveHeadersConfig", "ServerTimingHeadersConfig"):
        if config.get(section) not in (None, {}, {"Quantity": 0}, {"Enabled": False}):
            problems.append(f"unexpected {section}")
    return problems


def ensure_cors_policy(cloudfront, write: bool, step: str = "cors") -> str:
    """Find the custom CORS policy, create it when missing, refuse one that differs. Returns its id
    (a placeholder in a dry run when it does not exist yet)."""
    found = _find_cors_policy(cloudfront)
    if found is not None:
        policy_id, config = found
        problems = _cors_policy_problems(config)
        if problems:
            raise SetupError(
                f"response headers policy {CORS_POLICY_NAME} exists with unexpected settings "
                f"({'; '.join(problems)}); not altering it"
            )
        emit(step, "response_headers_policy", CORS_POLICY_NAME, "ok", id=policy_id)
        return policy_id
    desired = desired_cors_policy_config()
    cors = desired["CorsConfig"]
    summary = {
        "allow_origins": cors["AccessControlAllowOrigins"]["Items"],
        "allow_headers": cors["AccessControlAllowHeaders"]["Items"],
        "allow_methods": cors["AccessControlAllowMethods"]["Items"],
        "allow_credentials": False,
        "max_age_sec": CORS_MAX_AGE_SEC,
        "origin_override": True,
    }
    if not write:
        emit(step, "create_response_headers_policy", CORS_POLICY_NAME, "planned", **summary)
        return DRY_RUN_POLICY_ID
    created = cloudfront.create_response_headers_policy(ResponseHeadersPolicyConfig=desired)
    policy_id = created["ResponseHeadersPolicy"]["Id"]
    emit(step, "create_response_headers_policy", CORS_POLICY_NAME, "done", id=policy_id, **summary)
    return policy_id


def _methods_of(config: dict) -> list[str]:
    return _items((config.get("DefaultCacheBehavior") or {}).get("AllowedMethods"))


def _cors_distribution(aws):
    """(listed distribution, its config, ETag) or raise when the distribution is absent or deviates."""
    cloudfront = aws.get("cloudfront")
    dist = _find_distribution(cloudfront)
    if dist is None:
        raise SetupError(f"distribution {DISTRIBUTION_COMMENT} does not exist; run --step storage first")
    got = cloudfront.get_distribution_config(Id=dist["Id"])
    config, etag = got["DistributionConfig"], got["ETag"]
    oac = _find_oac(cloudfront)
    problems = distribution_problems(config, (oac or {}).get("Id"))
    if problems:
        raise SetupError("distribution exists with unexpected settings (" + "; ".join(problems) + "); not altering it")
    return dist, config, etag


def _apply_cors_fields(cloudfront, dist: dict, config: dict, etag: str, policy_id: str, allowed: list[str], step: str, write: bool):
    """update_distribution with IfMatch, changing only ResponseHeadersPolicyId and AllowedMethods."""
    from botocore.exceptions import ClientError

    behavior = config["DefaultCacheBehavior"]
    changes = {
        "ResponseHeadersPolicyId": {"old": behavior.get("ResponseHeadersPolicyId"), "new": policy_id},
        "AllowedMethods": {"old": _methods_of(config), "new": sorted(allowed)},
    }
    if write:
        updated = copy.deepcopy(config)
        target = updated["DefaultCacheBehavior"]
        target["ResponseHeadersPolicyId"] = policy_id
        methods = target.setdefault("AllowedMethods", {})
        methods["Items"] = list(allowed)
        methods["Quantity"] = len(allowed)
        if sorted((methods.get("CachedMethods") or {}).get("Items") or []) != sorted(CACHED_METHODS):
            methods["CachedMethods"] = {"Quantity": len(CACHED_METHODS), "Items": list(CACHED_METHODS)}
        try:
            cloudfront.update_distribution(Id=dist["Id"], IfMatch=etag, DistributionConfig=updated)
        except ClientError as exc:
            if _code(exc) == "PreconditionFailed":
                raise SetupError("the distribution changed concurrently (stale ETag); nothing was updated, re-run the step")
            raise
    emit(step, "update_distribution", DISTRIBUTION_COMMENT, "done" if write else "planned", id=dist["Id"], changes=changes)


def _wait_and_read_back(aws, dist: dict, step: str, expect_policy_id: str, allowed: list[str]) -> None:
    cloudfront = aws.get("cloudfront")
    emit(step, "wait_distribution_deployed", DISTRIBUTION_COMMENT, "waiting")
    cloudfront.get_waiter("distribution_deployed").wait(Id=dist["Id"], WaiterConfig=WAITER_CONFIG)
    emit(step, "wait_distribution_deployed", DISTRIBUTION_COMMENT, "ok", domain_name=dist.get("DomainName"))
    config = cloudfront.get_distribution_config(Id=dist["Id"])["DistributionConfig"]
    behavior = config["DefaultCacheBehavior"]
    problems = []
    if behavior.get("ResponseHeadersPolicyId") != expect_policy_id:
        problems.append("response headers policy not attached as expected")
    if _methods_of(config) != sorted(allowed):
        problems.append(f"allowed methods are {_methods_of(config)}, expected {sorted(allowed)}")
    if problems:
        raise SetupError("read-back of the distribution failed: " + "; ".join(problems))
    emit(step, "readback", DISTRIBUTION_COMMENT, "ok", response_headers_policy_id=expect_policy_id, allowed_methods=sorted(allowed))


def cors_step(aws, write: bool, storage_planned: bool = False) -> None:
    cloudfront = aws.get("cloudfront")
    if storage_planned and _find_distribution(cloudfront) is None:
        emit("cors", "distribution", DISTRIBUTION_COMMENT, "info", detail="not created yet; the storage step plans it with the custom policy")
        return
    dist, config, etag = _cors_distribution(aws)
    policy_id = ensure_cors_policy(cloudfront, write)
    problems = cors_problems(config, policy_id)
    updated = False
    if problems:
        _apply_cors_fields(cloudfront, dist, config, etag, policy_id, CORS_ALLOWED_METHODS, "cors", write)
        updated = True
    else:
        emit("cors", "distribution_cors", DISTRIBUTION_COMMENT, "ok")
    if write and (updated or dist.get("Status") != "Deployed"):
        _wait_and_read_back(aws, dist, "cors", policy_id, CORS_ALLOWED_METHODS)


def cors_rollback_step(aws, write: bool) -> None:
    """Re-attach Managed-SimpleCORS and GET/HEAD. The custom policy is left in place."""
    cloudfront = aws.get("cloudfront")
    dist, config, etag = _cors_distribution(aws)
    behavior = config["DefaultCacheBehavior"]
    rolled_back = behavior.get("ResponseHeadersPolicyId") == MANAGED_SIMPLE_CORS_ID and _methods_of(config) == sorted(CACHED_METHODS)
    updated = False
    if not rolled_back:
        _apply_cors_fields(cloudfront, dist, config, etag, MANAGED_SIMPLE_CORS_ID, CACHED_METHODS, "cors-rollback", write)
        updated = True
    else:
        emit("cors-rollback", "distribution_cors", DISTRIBUTION_COMMENT, "ok", detail="already on Managed-SimpleCORS with GET/HEAD")
    if write and (updated or dist.get("Status") != "Deployed"):
        _wait_and_read_back(aws, dist, "cors-rollback", MANAGED_SIMPLE_CORS_ID, CACHED_METHODS)


def _cors_state(aws) -> dict:
    """Read-only snapshot for verify and record-resources."""
    cloudfront = aws.get("cloudfront")
    state = {"policy_id": None, "policy_problems": [], "distribution": None, "cors_problems": [], "deployed": False}
    found = _find_cors_policy(cloudfront)
    if found is not None:
        state["policy_id"] = found[0]
        state["policy_problems"] = _cors_policy_problems(found[1])
    dist = _find_distribution(cloudfront)
    state["distribution"] = dist
    if dist is not None:
        config = cloudfront.get_distribution_config(Id=dist["Id"])["DistributionConfig"]
        state["deployed"] = dist.get("Status") == "Deployed"
        state["cors_problems"] = cors_problems(config, state["policy_id"])
    return state


def cors_verify(aws) -> bool:
    ok = True
    state = _cors_state(aws)

    def report(action, good, detail=None):
        nonlocal ok
        ok = ok and good
        emit("cors", action, CORS_POLICY_NAME, "ok" if good else "deviation", **({"detail": detail} if detail else {}))

    report("policy_exists", state["policy_id"] is not None, None if state["policy_id"] else f"custom policy {CORS_POLICY_NAME} not found")
    report("policy_config_matches", state["policy_id"] is not None and not state["policy_problems"], "; ".join(state["policy_problems"]) or None)
    if state["distribution"] is None:
        report("distribution_deployed", False, "distribution missing")
        report("attachment_and_methods", False, "distribution missing")
        return False
    report("distribution_deployed", state["deployed"], None if state["deployed"] else f"status {state['distribution'].get('Status')}")
    report("attachment_and_methods", not state["cors_problems"], "; ".join(state["cors_problems"]) or None)
    return ok


def cors_record(aws, resources: dict) -> dict:
    state = _cors_state(aws)
    if (
        state["policy_id"] is None
        or state["policy_problems"]
        or state["distribution"] is None
        or state["cors_problems"]
        or not state["deployed"]
    ):
        raise SetupError("the CORS policy and its attachment do not match the desired state; refusing to record it (run --step cors --verify)")
    cors = desired_cors_policy_config()["CorsConfig"]
    cloudfront = resources.setdefault("cloudfront", {})
    cloudfront.setdefault("response_headers_policies", {})["contract_cors"] = {
        "id": state["policy_id"],
        "name": CORS_POLICY_NAME,
        "allow_origins": cors["AccessControlAllowOrigins"]["Items"],
        "allow_headers": cors["AccessControlAllowHeaders"]["Items"],
        "allow_methods": cors["AccessControlAllowMethods"]["Items"],
        "allow_credentials": False,
        "max_age_sec": CORS_MAX_AGE_SEC,
        "origin_override": True,
        "expose_headers": [],
        "replaced": {
            "name": "Managed-SimpleCORS",
            "id": MANAGED_SIMPLE_CORS_ID,
            "reason": "adds Access-Control-Allow-Origin only to simple CORS requests; browsers add non-safelisted headers such as Priority",
        },
    }
    contract = cloudfront.setdefault("distributions", {}).setdefault("contract", {})
    contract.update(
        {
            "response_headers_policy": CORS_POLICY_NAME,
            "response_headers_policy_id": state["policy_id"],
            "allowed_methods": list(CORS_ALLOWED_METHODS),
            "cached_methods": list(CACHED_METHODS),
        }
    )
    return resources


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
    return {
        "budget": ["budget"],
        "storage": ["storage"],
        "cors": ["cors"],
        "cors-rollback": ["cors-rollback"],
        "all": ["budget", "storage", "cors"],
    }[step]


def main(argv=None, clients=None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    if args.step == "cors-rollback" and (args.verify or args.record_resources):
        parser.error("--step cors-rollback is a change: use it with --dry-run or --confirm, not --verify or --record-resources")
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
            if "storage" in steps:
                ok = storage_verify(aws) and ok
            if "cors" in steps:
                ok = cors_verify(aws) and ok
            return 0 if ok else 1

        if args.record_resources:
            resources = json.loads(args.resources_file.read_text(encoding="utf-8"))
            if "budget" in steps:
                resources = budget_record(aws.get("budgets"), resources)
            if "storage" in steps:
                resources = storage_record(aws, resources)
            if "cors" in steps:
                resources = cors_record(aws, resources)
            if "budgets" in resources:  # keep the budgets section last
                resources["budgets"] = resources.pop("budgets")
            args.resources_file.write_bytes(render_json(resources).encode("utf-8"))
            emit("resources", "record", str(args.resources_file.name), "done")
            return 0

        if "budget" in steps:
            budget_step(aws.get("budgets"), email, write)
        if "storage" in steps:
            storage_step(aws, write)
        if "cors" in steps:
            cors_step(aws, write, storage_planned=("storage" in steps and not write))
        if "cors-rollback" in steps:
            cors_rollback_step(aws, write)
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

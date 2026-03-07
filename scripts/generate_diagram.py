#!/usr/bin/env python3
"""
AWS Architecture Diagram Generator
===================================
Auto-discovers AWS resources via boto3 and generates official-style
architecture diagrams using the `diagrams` library (AWS icon set).

Zero cost: Read-only API calls only. Free Tier safe.

Usage:
    python generate_diagram.py                          # Default: us-east-1
    python generate_diagram.py --regions us-east-1 us-west-2
    python generate_diagram.py --profile student        # Named AWS profile
    python generate_diagram.py --tag Project=ReefRadar  # Filter by tag
    python generate_diagram.py --mock                   # Sample diagram (no AWS)

Requirements:
    pip install boto3 diagrams
    # Also need Graphviz binary:
    #   macOS:   brew install graphviz
    #   Ubuntu:  sudo apt install graphviz
    #   Windows: choco install graphviz  (or winget install Graphviz.Graphviz)

Output:
    aws_architecture.png   (default)
    aws_architecture.json  (resource inventory)
"""

import argparse
import json
import sys
import os
from datetime import datetime, timezone
from collections import defaultdict

try:
    import boto3
    from botocore.exceptions import ClientError, NoCredentialsError
except ImportError:
    print("ERROR: boto3 not installed. Run: pip install boto3")
    sys.exit(1)

try:
    from diagrams import Diagram, Cluster, Edge
    from diagrams.aws.compute import Lambda, EC2, ECS, Fargate
    from diagrams.aws.database import Dynamodb, RDS, ElastiCache
    from diagrams.aws.storage import S3
    from diagrams.aws.network import APIGateway, ELB, CloudFront, VPC, Route53
    from diagrams.aws.integration import SQS, SNS, StepFunctions, Eventbridge
    from diagrams.aws.management import Cloudwatch
    from diagrams.aws.security import IAMRole, Cognito, WAF
    from diagrams.aws.ml import Sagemaker
    from diagrams.aws.devtools import Codebuild, Codepipeline
    from diagrams.aws.general import Users
    from diagrams.aws.engagement import SES
    from diagrams.aws.analytics import Kinesis, Athena
    from diagrams.aws.cost import CostExplorer
    HAS_DIAGRAMS = True
except ImportError:
    HAS_DIAGRAMS = False
    print("WARNING: diagrams library not installed. Run: pip install diagrams")
    print("         Also install Graphviz: choco install graphviz (Windows)")


# ---------------------------------------------------------------------------
# Resource discovery
# ---------------------------------------------------------------------------

def create_session(profile: str = None, region: str = "us-east-1"):
    """Create a boto3 session with optional named profile."""
    kwargs = {"region_name": region}
    if profile:
        kwargs["profile_name"] = profile
    return boto3.Session(**kwargs)


def truncate(name: str, max_len: int = 28) -> str:
    """Truncate long resource names for diagram labels."""
    if len(name) <= max_len:
        return name
    return name[: max_len - 3] + "..."


def matches_tag(tags: list, tag_filter: dict) -> bool:
    """Check if resource tags match the filter. Empty filter = match all."""
    if not tag_filter:
        return True
    if not tags:
        return False
    tag_map = {t.get("Key", t.get("key", "")): t.get("Value", t.get("value", "")) for t in tags}
    for k, v in tag_filter.items():
        if tag_map.get(k) != v:
            return False
    return True


_clock_warned = False


def safe_call(fn, default=None, **kwargs):
    """Call a boto3 function, return default on permission or service errors."""
    global _clock_warned
    try:
        return fn(**kwargs) if kwargs else fn()
    except ClientError as e:
        code = e.response["Error"]["Code"]
        if code in ("InvalidSignatureException", "RequestTimeTooSkewed", "AuthFailure"):
            if not _clock_warned:
                print(f"    WARNING: Clock drift or auth error ({code}). "
                      f"Sync system clock or check credentials.")
                _clock_warned = True
            return default
        if code in ("AccessDeniedException", "UnauthorizedAccess", "AccessDenied",
                     "AuthorizationError", "OptInRequired"):
            return default
        # Unknown client error — skip gracefully
        return default
    except Exception:
        return default


def fetch_resources(session, tag_filter: dict = None, limit: int = 15):
    """
    Discover AWS resources in the session's region.
    Returns dict keyed by service name -> list of resource dicts.
    """
    resources = defaultdict(list)
    region = session.region_name

    # --- Lambda ---
    lam = session.client("lambda")
    resp = safe_call(lam.list_functions, default={})
    for fn in (resp.get("Functions") or [])[:limit]:
        name = fn["FunctionName"]
        tags_resp = safe_call(lam.list_tags, default={}, Resource=fn["FunctionArn"])
        tags_list = [{"Key": k, "Value": v} for k, v in (tags_resp.get("Tags") or {}).items()]
        if not matches_tag(tags_list, tag_filter):
            continue
        pkg = fn.get("PackageType", "Zip")
        mem = fn.get("MemorySize", 128)
        runtime = fn.get("Runtime", pkg)
        resources["lambda"].append({
            "name": name, "runtime": runtime, "memory_mb": mem,
            "package_type": pkg, "region": region,
        })

    # --- S3 ---
    s3 = session.client("s3")
    resp = safe_call(s3.list_buckets, default={})
    for bucket in (resp.get("Buckets") or [])[:limit]:
        name = bucket.get("BucketName") or bucket.get("Name", "unknown")
        try:
            loc = s3.get_bucket_location(Bucket=name).get("LocationConstraint") or "us-east-1"
        except Exception:
            loc = "unknown"
        if loc != region and region != "all":
            continue
        tags_resp = safe_call(s3.get_bucket_tagging, default={}, Bucket=name)
        tags_list = tags_resp.get("TagSet", [])
        if not matches_tag(tags_list, tag_filter):
            continue
        resources["s3"].append({"name": name, "region": loc})

    # --- DynamoDB ---
    ddb = session.client("dynamodb")
    resp = safe_call(ddb.list_tables, default={})
    for table_name in (resp.get("TableNames") or [])[:limit]:
        desc = safe_call(ddb.describe_table, default={}, TableName=table_name)
        table = (desc.get("Table") or {})
        tags_resp = safe_call(ddb.list_tags_of_resource, default={},
                              ResourceArn=table.get("TableArn", ""))
        if not matches_tag(tags_resp.get("Tags", []), tag_filter):
            continue
        resources["dynamodb"].append({
            "name": table_name,
            "billing": table.get("BillingModeSummary", {}).get("BillingMode", "PROVISIONED"),
            "item_count": table.get("ItemCount", 0),
            "region": region,
        })

    # --- API Gateway (HTTP + REST) ---
    apigw = session.client("apigatewayv2")
    resp = safe_call(apigw.get_apis, default={})
    for api in (resp.get("Items") or [])[:limit]:
        resources["api_gateway"].append({
            "name": api.get("Name", "unknown"),
            "protocol": api.get("ProtocolType", "HTTP"),
            "endpoint": api.get("ApiEndpoint", ""),
            "region": region,
        })

    apigw_v1 = session.client("apigateway")
    resp = safe_call(apigw_v1.get_rest_apis, default={})
    for api in (resp.get("items") or [])[:limit]:
        resources["api_gateway"].append({
            "name": api.get("name", "unknown"),
            "protocol": "REST",
            "region": region,
        })

    # --- EC2 ---
    ec2 = session.client("ec2")
    resp = safe_call(ec2.describe_instances, default={})
    for res in (resp.get("Reservations") or []):
        for inst in res.get("Instances", [])[:limit]:
            tags = inst.get("Tags", [])
            if not matches_tag(tags, tag_filter):
                continue
            name_tag = next((t["Value"] for t in tags if t["Key"] == "Name"), inst["InstanceId"])
            resources["ec2"].append({
                "name": name_tag,
                "instance_id": inst["InstanceId"],
                "type": inst.get("InstanceType", "unknown"),
                "state": inst.get("State", {}).get("Name", "unknown"),
                "region": region,
            })

    # --- RDS ---
    rds = session.client("rds")
    resp = safe_call(rds.describe_db_instances, default={})
    for db in (resp.get("DBInstances") or [])[:limit]:
        arn = db.get("DBInstanceArn", "")
        tags_resp = safe_call(rds.list_tags_for_resource, default={}, ResourceName=arn)
        if not matches_tag(tags_resp.get("TagList", []), tag_filter):
            continue
        resources["rds"].append({
            "name": db.get("DBInstanceIdentifier", "unknown"),
            "engine": db.get("Engine", "unknown"),
            "class": db.get("DBInstanceClass", "unknown"),
            "status": db.get("DBInstanceStatus", "unknown"),
            "region": region,
        })

    # --- ECR ---
    ecr = session.client("ecr")
    resp = safe_call(ecr.describe_repositories, default={})
    for repo in (resp.get("repositories") or [])[:limit]:
        resources["ecr"].append({
            "name": repo.get("repositoryName", "unknown"),
            "uri": repo.get("repositoryUri", ""),
            "region": region,
        })

    # --- SQS ---
    sqs = session.client("sqs")
    resp = safe_call(sqs.list_queues, default={})
    for url in (resp.get("QueueUrls") or [])[:limit]:
        name = url.rsplit("/", 1)[-1]
        resources["sqs"].append({"name": name, "url": url, "region": region})

    # --- SNS ---
    sns = session.client("sns")
    resp = safe_call(sns.list_topics, default={})
    for topic in (resp.get("Topics") or [])[:limit]:
        arn = topic["TopicArn"]
        name = arn.rsplit(":", 1)[-1]
        resources["sns"].append({"name": name, "arn": arn, "region": region})

    # --- CloudWatch Alarms ---
    cw = session.client("cloudwatch")
    resp = safe_call(cw.describe_alarms, default={}, StateValue="ALARM")
    for alarm in (resp.get("MetricAlarms") or [])[:5]:
        resources["cloudwatch_alarms"].append({
            "name": alarm.get("AlarmName", "unknown"),
            "region": region,
        })

    # --- CodeBuild ---
    cb = session.client("codebuild")
    resp = safe_call(cb.list_projects, default={})
    for proj_name in (resp.get("projects") or [])[:limit]:
        resources["codebuild"].append({"name": proj_name, "region": region})

    # --- CloudFront ---
    cf = session.client("cloudfront")
    resp = safe_call(cf.list_distributions, default={})
    dist_list = (resp.get("DistributionList") or {}).get("Items") or []
    for dist in dist_list[:limit]:
        resources["cloudfront"].append({
            "name": dist.get("DomainName", "unknown"),
            "id": dist.get("Id", ""),
            "region": "global",
        })

    # --- VPC ---
    resp = safe_call(ec2.describe_vpcs, default={})
    for vpc in (resp.get("Vpcs") or []):
        tags = vpc.get("Tags", [])
        name_tag = next((t["Value"] for t in tags if t["Key"] == "Name"), vpc["VpcId"])
        if name_tag == "default" or vpc.get("IsDefault"):
            continue
        resources["vpc"].append({
            "name": name_tag, "vpc_id": vpc["VpcId"],
            "cidr": vpc.get("CidrBlock", ""), "region": region,
        })

    # --- ECS ---
    ecs = session.client("ecs")
    resp = safe_call(ecs.list_clusters, default={})
    for arn in (resp.get("clusterArns") or [])[:limit]:
        name = arn.rsplit("/", 1)[-1]
        resources["ecs"].append({"name": name, "arn": arn, "region": region})

    # --- SageMaker Endpoints ---
    sm = session.client("sagemaker")
    resp = safe_call(sm.list_endpoints, default={})
    for ep in (resp.get("Endpoints") or [])[:limit]:
        resources["sagemaker"].append({
            "name": ep.get("EndpointName", "unknown"),
            "status": ep.get("EndpointStatus", "unknown"),
            "region": region,
        })

    return dict(resources)


def fetch_multi_region(regions: list, profile: str = None, tag_filter: dict = None):
    """Fetch resources across multiple regions and merge."""
    merged = defaultdict(list)
    for region in regions:
        print(f"  Scanning {region}...")
        session = create_session(profile=profile, region=region)
        region_resources = fetch_resources(session, tag_filter=tag_filter)
        for svc, items in region_resources.items():
            merged[svc].extend(items)
    return dict(merged)


def get_mock_resources():
    """Return sample resources for testing without AWS credentials."""
    return {
        "api_gateway": [
            {"name": "reefradar-2477-api", "protocol": "HTTP",
             "endpoint": "https://rgoe4pqatf.execute-api.us-east-1.amazonaws.com/prod",
             "region": "us-east-1"},
        ],
        "lambda": [
            {"name": "reefradar-2477-router", "runtime": "python3.11",
             "memory_mb": 256, "package_type": "Zip", "region": "us-east-1"},
            {"name": "reefradar-2477-preprocessor", "runtime": "python3.11",
             "memory_mb": 1024, "package_type": "Zip", "region": "us-east-1"},
            {"name": "reefradar-2477-classifier", "runtime": "python3.11",
             "memory_mb": 512, "package_type": "Zip", "region": "us-east-1"},
            {"name": "reefradar-2477-inference", "runtime": "python3.12",
             "memory_mb": 3008, "package_type": "Image", "region": "us-east-1"},
        ],
        "s3": [
            {"name": "reefradar-2477-audio", "region": "us-east-1"},
            {"name": "reefradar-2477-embeddings", "region": "us-east-1"},
        ],
        "dynamodb": [
            {"name": "reefradar-2477-metadata", "billing": "PAY_PER_REQUEST",
             "item_count": 42, "region": "us-east-1"},
        ],
        "ecr": [
            {"name": "reefradar-2477-inference", "uri": "781978598306.dkr.ecr.us-east-1.amazonaws.com/reefradar-2477-inference",
             "region": "us-east-1"},
        ],
        "codebuild": [
            {"name": "reefradar-2477-inference-build", "region": "us-east-1"},
        ],
    }


# ---------------------------------------------------------------------------
# Diagram generation
# ---------------------------------------------------------------------------

# Map service names to diagrams node classes (populated if diagrams is installed)
NODE_CLASSES = {}
if HAS_DIAGRAMS:
    NODE_CLASSES = {
        "lambda": Lambda,
        "s3": S3,
        "dynamodb": Dynamodb,
        "api_gateway": APIGateway,
        "ec2": EC2,
        "rds": RDS,
        "ecr": Codebuild,
        "codebuild": Codebuild,
        "sqs": SQS,
        "sns": SNS,
        "cloudfront": CloudFront,
        "cloudwatch_alarms": Cloudwatch,
        "ecs": ECS,
        "sagemaker": Sagemaker,
        "vpc": VPC,
    }

# Friendly display names
SERVICE_LABELS = {
    "lambda": "Lambda Functions",
    "s3": "S3 Buckets",
    "dynamodb": "DynamoDB Tables",
    "api_gateway": "API Gateway",
    "ec2": "EC2 Instances",
    "rds": "RDS Databases",
    "ecr": "ECR / CodeBuild",
    "codebuild": "CodeBuild",
    "sqs": "SQS Queues",
    "sns": "SNS Topics",
    "cloudfront": "CloudFront",
    "cloudwatch_alarms": "CloudWatch Alarms",
    "ecs": "ECS Clusters",
    "sagemaker": "SageMaker Endpoints",
    "vpc": "VPCs",
}

# Layer grouping for layout
LAYER_ORDER = [
    ("Networking", ["api_gateway", "cloudfront", "vpc"]),
    ("Compute", ["lambda", "ec2", "ecs"]),
    ("ML / Build", ["sagemaker", "codebuild", "ecr"]),
    ("Storage", ["s3", "dynamodb", "rds"]),
    ("Integration", ["sqs", "sns"]),
    ("Monitoring", ["cloudwatch_alarms"]),
]


def build_diagram(resources: dict, output_name: str = "aws_architecture",
                  title: str = None, fmt: str = "png"):
    """Build and save the architecture diagram."""
    if not HAS_DIAGRAMS:
        print("ERROR: Cannot generate diagram. Install: pip install diagrams")
        print("       Also install Graphviz: choco install graphviz (Windows)")
        return None

    if not resources:
        print("No resources found. Use --mock for a sample diagram.")
        return None

    # Count totals for title
    total = sum(len(v) for v in resources.values())
    regions = set()
    for items in resources.values():
        for item in items:
            regions.add(item.get("region", "us-east-1"))
    region_str = ", ".join(sorted(regions))

    if not title:
        title = f"AWS Architecture ({total} resources in {region_str})"

    graph_attr = {
        "fontsize": "14",
        "bgcolor": "white",
        "pad": "0.5",
        "ranksep": "1.0",
        "nodesep": "0.6",
    }

    with Diagram(title, filename=output_name, outformat=fmt,
                 show=False, direction="TB", graph_attr=graph_attr):

        users = Users("Users")
        all_nodes = {}

        for layer_name, service_keys in LAYER_ORDER:
            # Only create cluster if we have resources in this layer
            layer_services = {k: resources[k] for k in service_keys if k in resources}
            if not layer_services:
                continue

            with Cluster(layer_name):
                for svc, items in layer_services.items():
                    NodeClass = NODE_CLASSES.get(svc, EC2)
                    for item in items:
                        label = truncate(item["name"])
                        # Add detail to label
                        if svc == "lambda":
                            label += f"\n{item.get('memory_mb', '?')}MB"
                        elif svc == "ec2":
                            label += f"\n{item.get('type', '')}"
                        elif svc == "dynamodb":
                            label += f"\n{item.get('billing', '')[:8]}"
                        elif svc == "rds":
                            label += f"\n{item.get('engine', '')}"

                        node = NodeClass(label)
                        all_nodes.setdefault(svc, []).append(node)

        # Draw connections based on common patterns
        # Users -> API Gateway / CloudFront
        for gw in all_nodes.get("api_gateway", []):
            users >> Edge(color="darkblue") >> gw
        for cf in all_nodes.get("cloudfront", []):
            users >> Edge(color="darkblue") >> cf

        # API Gateway -> Lambda
        for gw in all_nodes.get("api_gateway", []):
            for lam in all_nodes.get("lambda", []):
                gw >> Edge(color="darkorange", style="dashed") >> lam

        # Lambda -> S3, DynamoDB, SQS, SNS
        for lam in all_nodes.get("lambda", []):
            for s3 in all_nodes.get("s3", []):
                lam >> Edge(color="green", style="dashed") >> s3
            for ddb in all_nodes.get("dynamodb", []):
                lam >> Edge(color="blue", style="dashed") >> ddb

        # EC2 -> RDS
        for inst in all_nodes.get("ec2", []):
            for db in all_nodes.get("rds", []):
                inst >> Edge(color="purple", style="dashed") >> db

    output_path = f"{output_name}.{fmt}"
    return output_path


# ---------------------------------------------------------------------------
# Reporting
# ---------------------------------------------------------------------------

def print_summary(resources: dict):
    """Print a formatted resource summary table."""
    total = sum(len(v) for v in resources.values())
    print(f"\n{'='*60}")
    print(f"  AWS Resource Summary: {total} resources found")
    print(f"{'='*60}")
    for svc, items in sorted(resources.items()):
        label = SERVICE_LABELS.get(svc, svc)
        print(f"\n  {label} ({len(items)}):")
        for item in items:
            name = item.get("name", "unknown")
            region = item.get("region", "")
            detail = ""
            if svc == "lambda":
                detail = f" [{item.get('runtime', '')} {item.get('memory_mb', '')}MB]"
            elif svc == "ec2":
                detail = f" [{item.get('type', '')} {item.get('state', '')}]"
            elif svc == "rds":
                detail = f" [{item.get('engine', '')} {item.get('status', '')}]"
            elif svc == "dynamodb":
                detail = f" [{item.get('billing', '')} {item.get('item_count', 0)} items]"
            elif svc == "api_gateway":
                detail = f" [{item.get('protocol', '')}]"
            print(f"    - {name}{detail}  ({region})")
    print(f"\n{'='*60}\n")


def save_inventory(resources: dict, path: str = "aws_architecture.json"):
    """Save resource inventory as JSON."""
    output = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "total_resources": sum(len(v) for v in resources.values()),
        "services": resources,
    }
    with open(path, "w") as f:
        json.dump(output, f, indent=2, default=str)
    print(f"  Inventory saved: {path}")
    return path


def generate_readme_snippet(resources: dict, diagram_path: str) -> str:
    """Generate a Markdown snippet for embedding in a README."""
    total = sum(len(v) for v in resources.values())
    regions = set()
    for items in resources.values():
        for item in items:
            regions.add(item.get("region", "us-east-1"))

    lines = [
        "## AWS Architecture",
        "",
        f"![AWS Architecture](./{os.path.basename(diagram_path)})",
        "",
        f"**{total} resources** across {', '.join(sorted(regions))}",
        "",
        "| Service | Count | Details |",
        "|---------|-------|---------|",
    ]
    for svc, items in sorted(resources.items()):
        label = SERVICE_LABELS.get(svc, svc)
        names = ", ".join(i["name"] for i in items[:3])
        if len(items) > 3:
            names += f" (+{len(items)-3} more)"
        lines.append(f"| {label} | {len(items)} | {names} |")

    lines.append("")
    lines.append(f"*Auto-generated on {datetime.now().strftime('%Y-%m-%d')} "
                 f"by `generate_diagram.py`*")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def parse_args():
    parser = argparse.ArgumentParser(
        description="Auto-discover AWS resources and generate architecture diagrams.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python generate_diagram.py                            # Scan us-east-1
  python generate_diagram.py --regions us-east-1 us-west-2
  python generate_diagram.py --profile student --tag Project=MyApp
  python generate_diagram.py --mock                     # No AWS needed
  python generate_diagram.py --format svg               # SVG output
        """,
    )
    parser.add_argument("--regions", nargs="+", default=["us-east-1"],
                        help="AWS regions to scan (default: us-east-1)")
    parser.add_argument("--profile", type=str, default=None,
                        help="AWS CLI named profile (default: default)")
    parser.add_argument("--tag", type=str, default=None,
                        help="Filter by tag, e.g. Project=ReefRadar")
    parser.add_argument("--mock", action="store_true",
                        help="Use mock data (no AWS credentials needed)")
    parser.add_argument("--output", type=str, default="aws_architecture",
                        help="Output filename without extension")
    parser.add_argument("--title", type=str, default=None,
                        help="Custom diagram title")
    parser.add_argument("--format", type=str, default="png",
                        choices=["png", "svg", "pdf", "jpg"],
                        help="Output format (default: png)")
    parser.add_argument("--limit", type=int, default=15,
                        help="Max resources per service (default: 15)")
    parser.add_argument("--no-diagram", action="store_true",
                        help="Skip diagram, only output JSON inventory")
    parser.add_argument("--readme-snippet", action="store_true",
                        help="Print a Markdown snippet for README embedding")
    return parser.parse_args()


def main():
    args = parse_args()

    # Parse tag filter
    tag_filter = {}
    if args.tag:
        if "=" in args.tag:
            k, v = args.tag.split("=", 1)
            tag_filter = {k: v}
        else:
            print(f"WARNING: Invalid tag format '{args.tag}'. Use Key=Value")

    # Fetch resources
    if args.mock:
        print("Using mock data (no AWS calls)...")
        resources = get_mock_resources()
    else:
        try:
            print(f"Scanning AWS resources...")
            if len(args.regions) == 1:
                session = create_session(profile=args.profile, region=args.regions[0])
                resources = fetch_resources(session, tag_filter=tag_filter, limit=args.limit)
            else:
                resources = fetch_multi_region(args.regions, profile=args.profile,
                                              tag_filter=tag_filter)
        except NoCredentialsError:
            print("ERROR: No AWS credentials found.")
            print("  Run: aws configure")
            print("  Or:  export AWS_ACCESS_KEY_ID=... && export AWS_SECRET_ACCESS_KEY=...")
            print("\n  Use --mock for a sample diagram without credentials.")
            sys.exit(1)

    if not resources:
        print("No resources found. Generating sample diagram with --mock...")
        resources = get_mock_resources()

    # Print summary
    print_summary(resources)

    # Save JSON inventory
    json_path = save_inventory(resources, f"{args.output}.json")

    # Generate diagram
    diagram_path = f"{args.output}.{args.format}"
    if not args.no_diagram:
        print(f"Generating {args.format.upper()} diagram...")
        result = build_diagram(
            resources,
            output_name=args.output,
            title=args.title,
            fmt=args.format,
        )
        if result:
            diagram_path = result
            print(f"  Diagram saved: {diagram_path}")
        else:
            print("  Diagram generation failed. Check that Graphviz is installed.")
            print("  Fallback: Use Cloudcraft (https://cloudcraft.co) free tier.")
    else:
        print("Skipped diagram generation (--no-diagram).")

    if args.readme_snippet:
        snippet = generate_readme_snippet(resources, diagram_path)
        print(f"\n--- README Snippet ---\n")
        print(snippet)
        print(f"\n--- End Snippet ---")

    print("\nDone!")


if __name__ == "__main__":
    main()

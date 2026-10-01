# API Coverage — AWS contract hosting (S3 contract bucket, CloudFront, AWS Budgets) via boto3

> Full coverage by default. Opt-outs are explicit, reasoned decisions.
> Phase 2 adds no third-party data API. It newly integrates three AWS service surfaces for the data contract (plans 02-02, 02-04, 02-06, 02-11): a private S3 bucket written by the publisher, a CloudFront distribution that serves it to browsers, and an AWS Budgets cost alarm. Lambda/STS calls reuse Phase 1 tooling. The browser only issues unauthenticated GETs to CloudFront.

| capability | decision | reason |
|---|---|---|
| s3_put_object_create_only (If-None-Match *) | INTEGRATE | |
| s3_put_object_compare_and_swap (If-Match on pointer ETag) | INTEGRATE | |
| s3_get_object (re-download sha256 verification) | INTEGRATE | |
| s3_head_object (pointer ETag, existence) | INTEGRATE | |
| s3_object_metadata (Cache-Control, Content-Type, sha256 user metadata) | INTEGRATE | |
| s3_create_bucket_with_public_access_block_ownership_encryption_tags | INTEGRATE | |
| s3_bucket_policy (CloudFront OAC GetObject only) | INTEGRATE | |
| s3_checksum_sha256_header | OPT-OUT | not needed — integrity is proven by re-download sha256 against the manifest |
| s3_bucket_versioning | OPT-OUT | not needed — immutability is enforced by conditional writes and separate keys per version |
| s3_object_lock | OPT-OUT | not needed yet — conditional writes plus the PUBLISHED.json CI guard suffice for a single-owner account |
| s3_delete_object | OPT-OUT | explicitly out of scope — published versions are never deleted |
| s3_list_bucket_public | OPT-OUT | explicitly excluded for security — missing keys must answer 403, never a listing |
| s3_bucket_cors | OPT-OUT | not needed — the CloudFront response-headers policy supplies CORS |
| s3_static_website_hosting | OPT-OUT | not needed — CloudFront with origin access control serves the private bucket |
| cloudfront_origin_access_control | INTEGRATE | |
| cloudfront_distribution_create_get_list_wait | INTEGRATE | |
| cloudfront_managed_cache_policy (CachingOptimized) | INTEGRATE | |
| cloudfront_managed_response_headers_policy (SimpleCORS) | INTEGRATE | |
| cloudfront_custom_error_responses (error caching TTL) | INTEGRATE | |
| cloudfront_tagging | INTEGRATE | |
| cloudfront_invalidation | OPT-OUT | not needed — versioned keys are immutable and latest.json has a 60 s TTL |
| cloudfront_custom_domain_and_acm_certificate | OPT-OUT | not needed yet — the default cloudfront.net domain is used until a launch decision |
| cloudfront_standard_or_realtime_logs | OPT-OUT | not needed yet — the budget alarm bounds cost; add when traffic analysis is required |
| cloudfront_waf | OPT-OUT | not needed yet — public, read-only, small static payloads; budget alarm bounds abuse cost |
| cloudfront_signed_urls_or_cookies | OPT-OUT | explicitly out of scope — contract data is public and open-licensed |
| cloudfront_functions_or_lambda_edge | OPT-OUT | not needed — no request rewriting is required |
| cloudfront_flat_rate_pricing_plan | OPT-OUT | explicitly excluded — flat-rate plans do not support private origins (OAC) |
| budgets_cost_budget_create_describe_delete | INTEGRATE | |
| budgets_notifications_email (actual 80/100%, forecast 100%) | INTEGRATE | |
| budgets_sns_subscribers | OPT-OUT | not needed — direct email subscribers suffice for one owner |
| budgets_actions_automated_stop | OPT-OUT | explicitly out of scope — the automated stop action belongs to Phase 8 (DRIVING-QUESTIONS Q10) |

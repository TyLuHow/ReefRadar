# API Coverage — Vercel Speed Insights and runtime logs, OpenStreetMap / CARTO map tiles, existing ReefRadar API client

> Full coverage by default. Opt-outs are explicit, reasoned decisions.
> Phase 3 adds no new data API. It newly adopts one external SDK (`@vercel/speed-insights`, plan 03-13) and one platform
> sink (Vercel runtime logs, written by the self-owned `/api/client-error/` route, plans 03-12/03-13). Maps move to
> MapLibre but keep the same external tile services (OpenStreetMap raster for WorldMap/MiniMap, the existing CARTO
> dark-matter style for ReefMap; plans 03-08..03-10). The existing ReefRadar backend API keeps its surface; Phase 3
> only proves that one client serves it (plan 03-01).

| capability | decision | reason |
|---|---|---|
| speed_insights_component_injection (root layout) | INTEGRATE | |
| speed_insights_sample_rate | OPT-OUT | not needed yet — default sampling; the 10,000-event free-tier cap is documented in docs/MONITORING.md and sampleRate is the lever if it is hit |
| speed_insights_before_send (event filtering or redaction) | OPT-OUT | not needed — app URLs carry only public ids (?cv, ?mode, ?sample), no personal data |
| speed_insights_route_override | OPT-OUT | not needed — the Next.js integration derives the route |
| speed_insights_debug_mode | OPT-OUT | not needed — development-only console output |
| speed_insights_custom_endpoint_or_script_src (dsn, endpoint, scriptSrc) | OPT-OUT | not needed — the default Vercel endpoint is the monitoring destination |
| speed_insights_plus_per_metric_views | OPT-OUT | explicitly out of scope — paid add-on; the owner is on Vercel Hobby (decision 2026-10-02) |
| vercel_runtime_logs_structured_stderr_line | INTEGRATE | |
| vercel_log_drains | OPT-OUT | not needed yet — owner accepted 1-hour Hobby retention (2026-10-02); revisit together with the deferred Sentry idea |
| vercel_observability_plus_retention | OPT-OUT | explicitly out of scope — owner decision to stay on Hobby |
| vercel_web_analytics (@vercel/analytics page views) | OPT-OUT | not needed — the decision covers web vitals and errors only |
| third_party_error_tracker (Sentry) | OPT-OUT | explicitly out of scope — deferred by owner decision (CONTEXT Deferred Ideas) |
| osm_standard_raster_tiles (tile.openstreetmap.org, WorldMap and MiniMap) | INTEGRATE | |
| osm_visible_attribution | INTEGRATE | |
| osm_bulk_prefetch_or_offline_tiles | OPT-OUT | explicitly excluded — OpenStreetMap tile usage policy |
| osm_alternative_layers_or_vector_tiles | OPT-OUT | not needed yet — Phase 6 restyles the maps |
| carto_dark_matter_vector_style (ReefMap, existing) | INTEGRATE | |
| reef_api_health | INTEGRATE | |
| reef_api_samples | INTEGRATE | |
| reef_api_upload | INTEGRATE | |
| reef_api_analyze | INTEGRATE | |
| reef_api_status | INTEGRATE | |
| reef_api_visualize (poll results) | INTEGRATE | |
| reef_api_results_alias | OPT-OUT | not needed — alias of /visualize; the client uses /visualize |
| reef_api_sites | OPT-OUT | not needed — site data comes only from the data contract since Phase 2 (fenced by check-contract-fence.mjs) |

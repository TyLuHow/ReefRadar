# API Coverage — figshare public API v2 (MARRS dataset, article 29958062)

> Full coverage by default. Opt-outs are explicit, reasoned decisions.
> figshare is the only third-party API whose capabilities phase code consumes (scripts/extract_marrs_excerpts.py; citation metadata check in plan 01-02). AWS, GitHub and Vercel are the project's own infrastructure tooling, and the ReefRadar API is first-party.

| capability | decision | reason |
|---|---|---|
| get_article_metadata | INTEGRATE | |
| list_article_files | INTEGRATE | |
| download_file_range | INTEGRATE | |
| list_article_versions | OPT-OUT | not needed yet — dataset version pinning belongs to Phase 8 ingestion (DATA-03/04) |
| search_articles | OPT-OUT | not needed — the dataset is a single known article id |
| collections_and_projects | OPT-OUT | not needed — MARRS is published as one article |
| article_stats | OPT-OUT | not needed — usage statistics are not product data |
| private_account_endpoints | OPT-OUT | explicitly out of scope — read-only public consumer; no figshare account, uploads or authentication |

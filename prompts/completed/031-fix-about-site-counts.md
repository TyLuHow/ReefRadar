<objective>
Fix stale site counts on the About page and clarify the training vs. deployed distinction in HowItWorks. The testing checklist (prompt 030) found 4 failures — all related to hardcoded "6 sites" that should be "8 sites" since the reference site expansion.
</objective>

<context>
Working directory: `dashboard-next/` inside the ReefRadar repo root.
Two files need changes. Do NOT modify backend code.
</context>

<requirements>

## Fix 1: About page — line ~229
Read `dashboard-next/src/app/about/page.tsx` and change "6 validated sites" to "8 validated sites".

## Fix 2: About page — line ~279
In the same file, change "Currently 6 reference sites" to "Currently 8 reference sites".

## Fix 3: HowItWorks — line ~183
Read `dashboard-next/src/components/landing/HowItWorks.tsx` and update the training stats line:
- Change "Trained on 45 sites in 5 countries" to "Trained on 45 sites across 5 countries"
- Append or add nearby: "(8 reference sites currently deployed)"

</requirements>

<verification>
1. Run `cd dashboard-next && npm run build` — must pass with zero errors
2. Grep for any remaining "6 sites" or "6 reference" in dashboard-next/src/ to ensure no stale counts remain
3. Confirm the About page now says "8" in both locations
4. Confirm HowItWorks clarifies training vs deployed sites
</verification>

<success_criteria>
- About page references "8 validated sites" and "8 reference sites"
- HowItWorks distinguishes "45 training sites" from "8 deployed reference sites"
- Build passes with zero errors
- No other "6 sites" references remain in the codebase
</success_criteria>

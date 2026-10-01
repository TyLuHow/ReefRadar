# Pitfalls Research

**Domain:** Passive-acoustic-monitoring (PAM) research instrument — reef soundscape ML pipeline + evidence-first research UI
**Researched:** 2026-09-30
**Confidence:** MEDIUM-HIGH (domain/ML pitfalls cross-checked against published literature; UI/perf pitfalls checked against current ReefRadar code via the required audits — see Sources)

This document does not re-litigate findings already proven true in `.planning/audit/DATA-MODEL.md` (F1–F12) and `.planning/audit/PRODUCT-AUDIT.md` (items 1–12). It names the *general failure pattern* behind each so the roadmap prevents recurrence as the codebase is rebuilt, not just patches the specific instances already caught.

---

## Critical Pitfalls

### Pitfall 1: Site/recorder leakage masquerading as model accuracy

**What goes wrong:**
A classifier is trained and evaluated with samples from the same site (often the same recording unit, same deployment) in both train and test splits. Reported accuracy is actually "which hydrophone is this," not "what does a healthy vs. degraded reef sound like." The number looks rigorous (a percentage, a confusion matrix) but generalizes to nothing outside the exact 5 sites it saw.

**Why it happens:**
Random per-sample (not per-site) splitting is the path-of-least-resistance default in every ML tutorial and library (`train_test_split` with no `groups=`). It requires one extra argument to do correctly, and the failure is invisible until someone tests on a genuinely new site — which this codebase never did (`DATA-MODEL.md` F3: random per-sample split, site_ids loaded but never used). The literature confirms this is a known, common bioacoustics failure mode: "recording equipment and sampling site location mismatch can cause severe degradation of performance in cross-validation," and the standard fix in the field is to group folds by recording/site/equipment so no acoustic encounter from the same site crosses the train/test boundary (grouped CV).

**How to avoid:**
- Every evaluation split in the Data & Model track must be **leave-one-site-out or leave-one-country-out**, never per-window or per-clip random split (already decided in PROJECT.md — this pitfall is the reason why; don't let a "quick retrain" skip it under time pressure).
- Report **balanced accuracy with confidence intervals**, not a single point estimate — a 90% headline on n=10 was shown to have a ~55–100% CI (`DATA-MODEL.md` §6).
- Track and report, per fold, *which site/recorder/deployment* was held out, so a reviewer can see the generalization claim is real.
- Treat "accuracy on sites the model has seen" and "accuracy on unseen sites" as two different numbers in the model card; never let only the first one reach the UI.

**Warning signs:**
- Any script that calls a random split without a `groups=`/`stratify=` argument tied to `site_id`.
- Confusion matrices that look "too good" (>85%) on <10 sites.
- Model card or UI copy that says "X% accurate" without naming the holdout unit.

**Phase to address:** Data & Model track (evaluation step, before retrain) — this is the single highest-leverage gate: a retrained model on a leaky split is worse than no retrain, because it looks more credible while being equally wrong.

---

### Pitfall 2: Confounds dressed up as biological signal (region, campaign, diel, season)

**What goes wrong:**
A class label (healthy/degraded/restored) is confounded with something else entirely — country, recording unit, deployment length, time of day, or season — and the model (or a human reading a chart) learns the confound instead of the thing being claimed. ReefRadar already has four live instances: region predicts "healthy" because healthy = Kenya in training data (`DATA-MODEL.md` F7, §6 confound #3); "healthy"/"restored_early" classes come from unusually *short* deployments vs. "degraded" from long ones (§3, a literal campaign confound not yet verified); Bora-Bora disturbance-context labels ("tourist," "boat traffic") were folded into "degraded" reef-health semantics (F9); Irma reefs are labelled "healthy" from audio recorded *after* the hurricane (F9).

**Why it happens:**
Upstream ecological field datasets are rarely true experiments — they're opportunistic campaigns with one deployment per site, one season per country, one recorder per campaign. The confound is invisible in a single site's data and only shows up when you compare across the confound axis, which nobody does until an audit forces it. The published literature on reef soundscapes is explicit about this: diel and lunar cycle alone produce 6–10 dB swings and strong snap-rate periodicity, independent of reef condition, so any comparison that doesn't control for time-of-day/lunar phase is comparing confounds, not health.

**How to avoid:**
- Before ingesting MARRS timestamped audio, **verify filename timezone** (flagged unresolved in DATA-MODEL.md §3 — HydroMoth/AudioMoth default to UTC; several ReefRadar sample captions assert local time-of-day that may be off by 5–11 hours). Do this before any diel analysis ships, not after.
- For every new lens (diel, sonotype, restoration stage), explicitly check it against the confound axes already identified: country, recorder/deployment campaign, disturbance-type-vs-health-label, pre/post-event timing. Write the check into the ingestion script, not just a one-time manual audit.
- When pairing recordings for any "fair comparison" (healthy vs. degraded, before vs. after), **match on time-of-day, lunar phase, and recorder/campaign** wherever upstream data allows (the South Sulawesi paired design in `~2 km` already does this better than any cross-country pair — build comparisons from it first).
- Label provenance explicitly: a "degraded" label in Bora-Bora means "tourist/boat-traffic disturbance context" per upstream, not "coral condition" per MARRS — the UI and the data model must carry *which* definition applies per dataset, not collapse them into one taxonomy.

**Warning signs:**
- Any class comparison where sites differ on more than one axis (country *and* status, or deployment length *and* status).
- A "contrast" demo pair that was chosen because it produced the most dramatic difference (`AUDIO_DIAGNOSIS.md §3.5` already documents this happened once — cherry-picking maximum contrast is a repeatable mistake, not a one-off).
- Diel/seasonal claims made before filename timezone is verified against at least one independently-dated recording.

**Phase to address:** Data & Model track (ingestion + evaluation) for the confound audit itself; Time-as-first-class-dimension phase for diel/lunar lenses specifically (block on timezone verification).

---

### Pitfall 3: Train/serve skew in preprocessing — the model never sees what it's asked to score

**What goes wrong:**
The exact preprocessing used to build training/reference embeddings (normalization, window selection, resampling) differs from what's applied to a live upload, so the model operates outside its effective training distribution on every real request — even before any topical confound. ReefRadar has this in at least four dimensions simultaneously today (`DATA-MODEL.md` F8): peak-normalized training audio vs. unnormalized uploads; single-window training vs. mean-of-N-windows inference; 16 kHz MARRS content (no energy above 8 kHz) vs. 44.1/48/96 kHz uploads resampled with a **non-anti-aliased** linear interpolation (`resample_linear`, which aliases high-frequency content into the band the model was trained on); and reference vectors built from inconsistent numbers of windows (5, ~30, 10) with no per-vector uncertainty carried forward.

**Why it happens:**
Preprocessing code accretes per-dataset (`generate_training_embeddings.py`, `generate_site_embeddings.py`, `generate_expansion_embeddings.py`, `preprocessor/handler.py` each do it differently) because each ingestion was a one-off script written to get a specific dataset in, not a shared, versioned pipeline. Anti-aliasing in particular is the kind of thing that's silently wrong — `np.interp`-based resampling runs without error, just introduces artifacts in exactly the frequency bands the embeddings are built from.

**How to avoid:**
- Build **one preprocessing function**, shared by every ingestion script and the live inference path (the CONCERNS.md "shared `lambdas/common/` module" recommendation applies here specifically to audio preprocessing, not just CORS/response helpers).
- Use a proper anti-aliased resampler (e.g. `scipy.signal.resample_poly` or `librosa.resample` with a `kaiser` filter), not linear interpolation, for any downsampling path.
- Decide and document one normalization policy (peak-normalize everywhere, or nowhere, with level preserved as a separate reported feature) — the current mixed policy actively destroys the single strongest health cue the data has (§5.6: "degraded" demo clip reads 8.6 dB **louder** than "healthy" purely because of inconsistent normalization).
- Persist `num_windows_used` and per-dimension variance/SE alongside every mean embedding so downstream consumers can tell a 5-window-mean from a 120-window-mean apart — never treat them as equivalent evidence.
- Add a Nyquist-aware guard: reject or flag (not silently pass) audio whose claimed useful bandwidth exceeds what the recording's actual sample rate/anti-alias filtering can support.

**Warning signs:**
- Any resampling call without an explicit filter/window argument.
- Any two preprocessing scripts in the repo that compute "the same" derived quantity (window selection, normalization) differently.
- A live inference path that imports different code than the offline embedding-generation scripts.

**Phase to address:** Data & Model track (before batch re-embedding of MARRS; this must be fixed once, centrally, before the large ingestion multiplies the inconsistency across 542k files).

---

### Pitfall 4: Probabilities that have stopped being probabilities, and "confidence" that isn't calibrated

**What goes wrong:**
A softmax output is treated as if it were a calibrated probability of a ground-truth condition, then further mangled (ReefRadar multiplies all four class probabilities by an arbitrary 0.6/0.7 OOD penalty, so they stop summing to 1 and the UI renders this as a literal "Probability Distribution" — `DATA-MODEL.md` F7, `PRODUCT-AUDIT.md` §4.2). Users — especially non-expert public visitors — read a percentage as "how likely this is true," when it is neither calibrated nor, after the multiplier, even internally consistent.

**Why it happens:**
Softmax outputs are not inherently calibrated — this is a well-documented ML property, not specific to this codebase, but it's especially dangerous in low-data regimes (n=100 training samples here) where overconfidence is the default failure mode. The "fix" of multiplying by a hand-picked constant to "express uncertainty" is a common but wrong pattern: it conflates *model confidence* with *distributional coverage* and destroys the one property (summing to 1) that made the numbers interpretable at all. Published guidance on this exact problem (camera-trap ML, which has the same low-data-field-ecology shape as PAM) is blunt: calibration "has rarely been studied in ecological studies" despite being essential before any field deployment; the safe design pattern is a model that can say "I don't know" rather than one that reports a falsely-precise score.

**How to avoid:**
- Separate three facts that the current design conflates into one multiplied number: (1) where the recording is / whether location was given, (2) how much training data exists from that region (a count, shown plainly), (3) the raw, un-mangled model output. Never fold (2) into (3) by multiplication — this is the literal recommendation already reached independently by `CONCERNS.md`'s scientific-validity-risks section.
- Implement an explicit **abstention** path: below a confidence/coverage threshold, the UI shows "classifier output withheld — this sample is too far outside training coverage to score" rather than a low but present number. The evidence-first classifier role decision (Q4 in DRIVING-QUESTIONS.md) already commits to this; the pitfall is implementing "abstain" as a footnote instead of a first-class UI state.
- If post-hoc calibration is pursued, use a method validated against a real held-out set (e.g. temperature scaling fit on a leave-one-site-out validation split, not the 10–21 sample test set) and report the calibration curve itself in the model card, not just a single accuracy number.
- Replace the OOD multiplier with an explicit, separately-displayed **out-of-distribution score** (e.g. embedding-space distance/percentile to nearest training-site vector — already scoped as a cheap addition in `DATA-MODEL.md` §9 item 5) rather than a penalty baked into the probability itself.

**Warning signs:**
- Any UI element labelled "probability," "%," or "confidence" whose values don't sum to 100% (or aren't a single calibrated scalar for a binary case).
- Any constant multiplier applied to model output for a reason other than genuine renormalization.
- A model-card or About page that states calibration without showing a reliability diagram or calibration table computed on a non-leaky holdout.

**Phase to address:** Truth & reproducibility track (remove the multiplier, add explicit abstention UI state) and Data & Model track (actual calibration work once a non-leaky evaluation exists).

---

### Pitfall 5: Acoustic indices and band-energy readouts presented as ecological signal

**What goes wrong:**
Simple acoustic summary statistics (ACI, ADI, RMS band energy, "frequency bands as guilds") are computed and shown as if they reliably indicate reef condition, when the published literature on exactly this question finds they frequently do not transfer across sites or times of day. One study found ACI "failed to reveal any expected differences between sites or times of day" on coral reefs despite continued use; another found the Bioacoustic Index only identified the single most acoustically active reef with otherwise weak correlation to visual health metrics; the most robust indices in that literature (RMS SPL and acoustic entropy in the 50–1200 Hz fish band) are narrow, not a general-purpose "health meter." ReefRadar's own client-side band-energy visualizations (`useAudioVisualBridge.ts`, `FrequencyBandLabels.tsx`) already present banded RMS as if it reflects "fish," "grazing," "shrimp" activity, with three mutually inconsistent band definitions and no citation.

**Why it happens:**
Band-energy and simple acoustic indices are cheap to compute client-side and visually compelling (a bar that moves with the audio *feels* like evidence), so they get added as a demo feature before anyone checks whether the specific index is validated for the specific question being implied. The gap between "this frequency band has more energy" and "this indicates reef health/species activity" is exactly the gap the published acoustic-indices literature says is unreliable.

**How to avoid:**
- If acoustic indices are computed (`DATA-MODEL.md` §9 item 6 scopes this as a cheap addition), label them explicitly as "descriptive acoustic features," cite the specific index definition and its known limitations, and **never map them to a health/vitality score** — this exact trap is why the Q7 decision retired the vitality layer; don't let it re-enter through a side door as "band activity."
- Keep band-energy playback filters (which are real, correct Web Audio biquads — `PRODUCT-AUDIT.md` confirms these are genuinely functional) clearly scoped as a *listening aid* ("isolate this frequency range so you can hear it"), not as a measurement panel implying guild/species identification.
- Pick one canonical, Nyquist-aware band definition, cite it, and delete the other three (`DATA-MODEL.md` F8 note: four inconsistent band schemes exist today).
- Any index shown in a research-facing (not just decorative) context must state what the literature says about its cross-site reliability, not present a bar/number with no caveat.

**Warning signs:**
- A UI element whose value changes with FFT bin energy but whose label implies a biological conclusion ("fish chorus," "shrimp activity," "grazing").
- Band ranges that extend past the Nyquist frequency of the source recording.
- Any new acoustic-index feature added without a literature citation in the model card / methods page.

**Phase to address:** Evidence pages / methods-and-model-card phase (citation and labelling discipline); Instrument/Listening Bench phase (keep band filters as playback-only, not measurement).

---

### Pitfall 6: Restoration/health labels treated as an ordinal score or absolute standard

**What goes wrong:**
MARRS's four-class taxonomy (healthy / degraded / restored_early / restored_mid) is a **site-level, locally-relative habitat category**, not a continuous, ordinal, or cross-site-comparable health score. "Healthy" in Mexico (~20% coral cover) is worse in absolute terms than "degraded" in Indonesia in places; "restored_mid" is time-since-intervention, not a condition score, and the source paper reports mid-stage sites sometimes *exceeding* healthy sites on specific functions. ReefRadar's retired vitality system literally mapped these four labels to a 0–1.0 "vitality" interval (healthy=1.0, mid=0.7, early=0.4, degraded=0), implying restoration is a smooth percentage climb — an invented mapping with no basis in the data (`DATA-MODEL.md` §4.2, §6).

**Why it happens:**
Four ordered-sounding class names (healthy > restored_mid > restored_early > degraded) invite treatment as a scale, especially once a UI needs a single color/position to render. It is far easier to build a compelling "recovery arc" visualization than to build one that honestly shows four locally-relative categories that aren't universally comparable. The ethics-of-restoration-communication literature is explicit about the downstream risk: overly optimistic technological-recovery narratives can make audiences "casual about preserving existing natural landscapes" and can be "abused because it contradicts... the fragility and irreplaceability of ecosystems" — i.e., overclaiming recovery has a real cost beyond scientific accuracy.

**How to avoid:**
- Never render the four classes on a continuous scale, gradient, or single numeric score. Each lens that touches these labels should carry its upstream definition text inline (already scoped as a requirement — "label definitions" evidence page).
- Any "restoration narrative" or "recovery ladder" feature (explicitly in scope per PROJECT.md) must be built from the **same-location paired design** (South Sulawesi H/D/N/R within ~2 km — `DATA-MODEL.md`'s own "best question in the dataset") and must cite the upstream finding that mid-stage sites aren't simply "between" degraded and healthy — not stitch together cross-country exemplars for dramatic effect (the current "Recovery in Sound" story mixes Australia and Indonesia sites into a fake single-reef arc; `PRODUCT-AUDIT.md` §3.1).
- Cite the upstream population-level findings (e.g., "mid-stage restored reefs had ~4x the night-time fish cuescape of degraded reefs," per Williams et al. 2025) as attributed study results, never as a ReefRadar-measured outcome for an individual clip.
- Keep the label-basis field (`DATA-MODEL.md` §9 item 8: "label_basis: upstream vs. ReefRadar-assigned") on every site record, surfaced in the UI, so a disturbance-context label (Bora-Bora "tourist") is never rendered identically to a condition label (MARRS "degraded").

**Warning signs:**
- Any gradient, slider, or single-number "health score" derived from the four-class label.
- A "before/after" or "recovery" visualization built from two different countries/sites.
- Restoration-stage text that implies a trajectory ("two years into restoration," "on its way to healthy") not supported by the site's actual install-date metadata.

**Phase to address:** Instrument phase (recovery-ladder feature design) and Evidence-pages phase (label-definition and provenance display) — both gate on the Truth & reproducibility pass that removes the vitality mapping.

---

### Pitfall 7: Map-first / dashboard-first overreach on a dataset that doesn't have map-scale density

**What goes wrong:**
A redesign defaults to "big interactive map + rich multi-panel dashboard" because that's the template for research-instrument UIs, without checking whether the data supports that scale. ReefRadar's 54 sites cluster into **7 project areas** (the GBR cluster is 140m × 340m — `DATA-MODEL.md` F5, §2.2); below city-block zoom there are 7 dots, not 54, and no amount of map engine sophistication (the current build runs deck.gl **and** MapLibre **and** Leaflet simultaneously, `CONCERNS.md` tech-debt) fixes a problem that is about information density, not rendering technology. The same audit is blunt about the dashboard layer: "with 54 sites × ~10 categorical fields, a 'dense analytical UI' built on current data would be decoration... charts with 6-site classes have no statistical power" (`DATA-MODEL.md` §7).

**Why it happens:**
"Research instrument" reads as "needs a map and a dashboard" by genre convention, and building an impressive-looking map/chart stack is a satisfying, visible unit of redesign work — much more so than the less glamorous work of computing a real diel aggregate or a real PCA. The previous milestone's three parallel map stacks are exactly this pattern already executed once.

**How to avoid:**
- Match visualization density to the actual data density per `DATA-MODEL.md §2.3`'s honest semantic-zoom table: world view shows **7 project clusters** with counts, not 54 interpolated dots; project-level zoom shows individual sites; site-level only goes deeper for a user's own upload or (once ingested) per-site diel/detection profiles.
- Put real density where it actually exists: within an upload (per-segment timeline, up to 120 points), within the 48×1280 reference-vector space (one real PCA/UMAP, not per-chart reinventions), and in the ingested MARRS time series (9,000 hours — this is where "dense" is honest). Build the map and the dashboard shell *after* confirming which of these three axes a given screen is drawing from.
- One map engine for the whole app (already decided: MapLibre only) — resist adding a second "just for this one view."
- Before building any new chart/panel, ask whether current site counts per class (6–21 per class) give it statistical meaning, or whether it's decoration; if decoration, cut it or relabel it explicitly as illustrative.

**Warning signs:**
- A map view where every zoom level below ~13 shows the same handful of overlapping markers.
- A chart with fewer data points than axis tick marks.
- A second mapping/charting library added "just for this one page."

**Phase to address:** Instrument phase (Atlas component design, from day one of its spec) — this is an architectural decision, not a polish pass; retrofitting honest density later is expensive.

---

## Moderate Pitfalls

### Pitfall 8: Spectrogram / audio-visualization performance debt reintroduced wholesale

**What goes wrong:**
Real-time spectrogram and waveform rendering is CPU-intensive; naive full-canvas `getImageData`/`putImageData` redraws every frame, uncapped `requestAnimationFrame` loops that never stop when off-screen, and large-FFT settings on long files can freeze the tab on zoom/pan — exactly what `CONCERNS.md` already documents in the current app (13+ independent rAF loops, full-canvas readback per frame, always-on background loops at 30-60fps on every route). Published guidance on exactly this (wavesurfer spectrogram) confirms: a 10-minute file with `fftSamples: 2048` can take seconds on the main thread and freeze on zoom; the fix is smaller FFT windows (256/512), rendering only the visible window, and not re-running the full FFT on every interaction.

**How to avoid:**
- Keep FFT window sizes modest (256–512) for interactive spectrograms; only load/process the audio window currently in view, not the whole file at once.
- Use `drawImage`-based canvas scrolling instead of `getImageData`/`putImageData` full-frame readback.
- Every animation loop must pause when off-screen/reduced-motion is requested and must not run continuously on routes where it's not the focal content (the current "decorative spectrogram" running at 30-60fps on every route while occluded is the anti-pattern to avoid repeating, not just move).
- Establish a performance budget (already in scope per PROJECT.md) and test it against the actual longest MARRS file class the Listening Bench will serve (up to 600s uploads, and eventually MARRS 60s clips at scale).

**Warning signs:** Jank/frame drops on zoom or band-toggle interactions; CPU usage that doesn't drop to near-zero when a spectrogram view is scrolled off-screen; more than one `requestAnimationFrame` loop active on a single route.

**Phase to address:** Instrument phase (Listening Bench spectrogram component), with the performance budget enforced via the automated/visual regression testing requirement.

---

### Pitfall 9: Accessibility bolted onto maps, charts, and audio after the fact

**What goes wrong:**
Maps, charts, and audio players are inherently harder to make accessible than text/forms, and teams routinely treat accessibility as a pass applied after the visual design is locked — resulting in color-only status encoding, mouse-only map interactions, and charts with no non-visual alternative, all of which `PRODUCT-AUDIT.md` documents are already present (deck.gl points mouse-only with no list alternative §5.6; checkbox proxies with invisible focus; status palette luminance ratios as low as 1.06:1; charts with no text alternative).

**Why it happens:**
Accessible-by-default patterns for maps and charts aren't the default output of most charting/mapping libraries; they require deliberate extra work (ARIA roles on data points, a parallel accessible-table view, keyboard-navigable point lists) that's easy to defer when visual polish is the thing being reviewed.

**How to avoid:**
- Design accessibility requirements (keyboard-navigable point lists capped around 10–20 tabbable map points per view, `aria-label`+`role="button"` on clickable map markers, text/table alternative for every chart, CVD-safe + shape/position-redundant status encoding) **into the UI-SPEC for Atlas/Inspector/Listening Bench before implementation**, not as a post-hoc audit item — this is exactly the class of issue a retroactive 6-pillar visual audit catches too late to be cheap to fix.
- Pick an ordinal, CVD-validated palette for the four-class health scale with sufficient luminance separation, and encode status redundantly (color + text + icon/position), per the already-identified contrast failures.
- Keyboard-reachable upload dropzones and filter controls from the start (current clickable `<div>` dropzone and `sr-only`-with-invisible-focus checkboxes are the anti-patterns to not re-introduce).

**Warning signs:** Any new interactive map/chart component shipped without a keyboard-only and screen-reader pass before merge; status color choices made without a contrast-checker run.

**Phase to address:** Design-system phase (token/palette decisions) and each UI-building phase individually (Atlas, Inspector, Listening Bench) via their UI-SPEC accessibility requirements.

---

### Pitfall 10: Incremental strangler migration silently drops capabilities

**What goes wrong:**
When redesigning "incrementally inside `dashboard-next/`" rather than big-bang, it's easy for a capability that existed in one of the "two of everything" duplicate flows to quietly disappear because nobody explicitly ported it — the current codebase already has this exact problem baked in (two analyze flows with different capabilities, two compare experiences, two site browsers, each missing something the other has — `PRODUCT-AUDIT.md` §2.7, §1.5).

**Why it happens:**
Consolidating N duplicate implementations into one is naturally lossy unless every capability from every duplicate is enumerated first; it's much easier to notice what the new unified flow *does* than what the old flows did that it doesn't.

**How to avoid:**
- This is precisely why `CAPABILITY-MATRIX.md` exists as an anti-regression contract — treat every consolidation (Analyze flows → one, Compare flows → one, Map/Sites → one) as a checklist against that matrix, not a fresh build from a blank page.
- Retire old routes only after the matrix confirms the replacement covers every row, per the Legacy-operability constraint already in PROJECT.md.
- When two duplicate implementations disagree (e.g., different band-filter definitions, different caveat text), resolve the disagreement explicitly and document which one won and why — don't let the newer one silently overwrite the other's correct parts.

**Warning signs:** A consolidated flow that "feels" complete but hasn't been checked against the matrix; a retired route whose unique capability (e.g., `/dashboard/analyze`'s preview spectrogram, `/dashboard/compare`'s dual waterfall) has no replacement yet in the new flow.

**Phase to address:** Every consolidation phase, gated by CAPABILITY-MATRIX sign-off before the legacy route is retired.

---

### Pitfall 11: Provenance claims without a traceable source

**What goes wrong:**
A number, label, or claim appears in the UI with no link back to what produced it — which dataset, which script, which model version, which license. ReefRadar today has zero numbers with provenance chips (`PRODUCT-AUDIT.md` §0 item 12, §4.12); this directly conflicts with the project's stated Core Value ("every sound, label and number shown is real, traceable to its source").

**Why it happens:**
Provenance metadata (DOI, license, recorder type, label-basis, model/dataset version) exists in scripts and docs but isn't carried through the data model into the API response, so by the time it reaches a component there's nothing left to attach a citation to (`DATA-MODEL.md` §1.2: DOI/citation/site_type fields stored in S3 but never exposed by `/sites`).

**How to avoid:**
- Treat provenance fields (dataset, DOI, license, recorder, label_basis, model_version, embedding_version) as required, not optional, additions to every entity the Data & Model track touches — expose them in the API from the start of the versioned data contract, not bolted on later.
- Every evidence page (site, dataset, methods/model-card) must be the single source of truth a UI number links to; build the link mechanism (e.g., a provenance chip/tooltip pattern) once, early, and require every new number-rendering component to use it.
- License attribution (CC BY 4.0 / CC0 / public domain) must render on every surface where the audio/derived data appears, per the Licensing constraint — not just on a Credits/About page.

**Warning signs:** A new component that renders a number, count, or audio clip with no accompanying source/link; an evidence page that exists but nothing in the main UI links to it.

**Phase to address:** Evidence-pages phase (build the provenance-chip pattern early) and Data & Model track (expose the fields in the API/data contract).

---

## Minor Pitfalls

### Pitfall 12: Precision theater — false numeric precision implying false certainty

**What goes wrong:** Coordinates to 4-7 decimal places (sub-meter precision for a site centroid that was never that precisely surveyed), confidence to one decimal place on a 10-sample test set, cosine similarity shown as "92.4% similarity" with no reference distribution — all imply more certainty than the underlying data supports.

**How to avoid:** Round to the precision the underlying measurement supports; show similarity as rank + percentile among references rather than a raw percentage; state sample sizes next to any statistic.

**Phase to address:** Truth & reproducibility track (quick, broad pass); Evidence-pages phase (methods page states precision policy).

---

### Pitfall 13: "Real-time" and other UI copy claims that are checked against nothing

**What goes wrong:** Copy describing the system's behavior (processing-stage messages, "real-time processing," dataset country counts) drifts from what the code actually does, because it was never tied to a single source of truth and nobody re-checks it when the backend changes.

**How to avoid:** Generate user-facing counts (site/country/class counts) from the live API response, never hard-code them; tie processing-status copy to actual pipeline stage events (`/status/{id}`), not a scripted message list; add a lightweight content-freshness check (e.g., a test that snapshots `/about` claims against `/sites`/`/health` responses) to the automated test suite already in scope.

**Phase to address:** Truth & reproducibility track; ongoing via automated testing requirement.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|-----------------|------------------|
| Per-sample random train/test split instead of grouped/leave-one-site-out CV | Faster to write, higher-looking accuracy number | Accuracy number is meaningless outside the training sites; erodes all downstream trust once discovered | Never, for any evaluation that will be shown to a user or cited in a model card |
| Multiplying softmax output by a hand-tuned OOD penalty instead of building a real OOD score | One-line fix, "shows uncertainty" | Breaks probability semantics (doesn't sum to 1), arbitrary constants, worse than no adjustment | Never — use an explicit flag or a computed OOD percentile instead |
| Linear-interpolation resampling instead of an anti-aliased resampler | Faster, fewer dependencies | Silently aliases high-frequency content into the exact band the embeddings are built from | Never for any audio feeding the classifier/embedding model; acceptable only for non-ML playback resampling where artifacts are inaudible |
| One-off per-dataset ingestion scripts instead of a shared preprocessing module | Ships an individual dataset faster | Each new dataset multiplies the train/serve-skew surface; the MARRS batch ingestion (542k files) will bake in whatever inconsistency exists at ingestion time, at scale | Acceptable only as a throwaway prototype for a single-dataset spike, never for the production ingestion pipeline |
| A second map/chart library "just for this one view" | Unblocks a specific visual idea quickly | Bundle weight, duplicate WebGL contexts, inconsistent legends/interactions across pages (already happened three times) | Never — evaluate against the single chosen engine (MapLibre / Observable Plot) first; if it truly can't do the job, that's an architecture decision, not a one-off addition |
| Decorative audio-reactive visuals using ground-truth/predicted labels as input | Looks lively, cheap to wire | Restates a label as "evidence," conflicts with Core Value, invisible effort if occluded (already happened) | Never on a surface that also displays numbers; acceptable only as pure decoration driven solely by *measured* audio energy of what's currently playing, clearly separated from data surfaces |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|-----------------|-------------------|
| MARRS figshare ingestion | Trusting filename timestamps as local time without checking recorder/firmware timezone default | Verify against at least one independently-dated event (e.g., known deployment start) before any diel/seasonal claim ships; AudioMoth/HydroMoth default to UTC |
| SurfPerch / Perch 2.0 inference container | Assuming the model's output signature/key is stable across versions (current code falls back to "first output, truncate to 1280" if the expected key is missing — `DATA-MODEL.md` §4.2 [verify]) | Pin and verify the exact output tensor name per model version; fail loudly, not silently-truncate, on a signature mismatch |
| S3 reference-vector key naming | Writer scripts use `embedding`, reader uses `mean_embedding` (`DATA-MODEL.md` F12) — a classic producer/consumer field-name drift across scripts with no shared schema | Define one versioned schema (already planned: "versioned dataset/model contract") and validate every writer/reader against it in CI, not by convention |
| Presigned S3 upload URLs for gallery/sample audio | ~1-hour expiry with no retry/refresh in a long-open tab (`PRODUCT-AUDIT.md` §3.1) | Either refresh presigned URLs on play failure or serve stable, cacheable public URLs for reference/gallery audio (not user uploads) |
| API Gateway + unauthenticated upload/analyze | Treating "public uploads with guardrails" as just a size cap (current: 50MB check only, no rate limit, no budget alarm — `CONCERNS.md` security section) | Implement per-IP rate limiting (WAF), a budget alarm before any large job, and duration/size caps enforced *before* the expensive inference container is invoked, per the Q6/Budget constraints already in PROJECT.md |
| MARRS 32-bit float / 24-bit WAV variants | Hand-rolled `struct`-based WAV parser reads float32 as int32 (garbage) and rejects 24-bit outright (`CONCERNS.md` fragile-areas) | Use a real WAV-parsing library (`soundfile`/`scipy.io.wavfile`) with explicit format assertions; reject unsupported formats with a clear error, not silent garbage |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|-----------------|
| Full-canvas `getImageData`/`putImageData` spectrogram redraw every frame | Jank on zoom/pan, tab becomes unresponsive on long files | `drawImage`-based scroll, smaller FFT window (256-512), render only the visible time window | ~10-minute files at `fftSamples: 2048`+ |
| Always-on `requestAnimationFrame` loops across unrelated routes | Battery/CPU drain even when idle, multiple loops stacking | Pause/destroy loops on unmount and when off-screen/reduced-motion; one shared ticker instead of 13+ independent loops | Immediately on low-power devices; compounds as more routes are added |
| Three simultaneous map engines (deck.gl + MapLibre + Leaflet) | 400-700KB+ combined bundle weight, duplicate WebGL contexts | One map engine for the whole app (MapLibre, already decided) | At first load on a slow connection; worsens with every new map-bearing page |
| Whole-file upload through API Gateway as raw request body | Payload-limit failures surface late (after upload completes) instead of at validation time | Validate duration/format client-side before upload where feasible; use presigned S3 upload (already decided) to bypass API Gateway payload limits entirely | Files approaching the API Gateway payload ceiling |
| Batch re-embedding 542k MARRS files with per-file one-off script overhead | Ingestion job runs far longer/costs far more than estimated; no visibility into partial failure | Precompute aggregates in a resumable, checkpointed batch job with explicit cost/budget tracking (Budget constraint already in PROJECT.md) | At the full 9,000-hour MARRS corpus, not the handful of files current scripts were written against |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Unauthenticated `/upload` + `/analyze` with only a size ceiling | Anyone can trigger unlimited paid 3GB/300s container-Lambda inference | Per-IP rate limiting via WAF, request caps, budget alarm before any public-upload feature ships (already a stated guardrail requirement) |
| Wide-open CORS (`*`) paired with no auth | Any origin can call the API directly, compounding the abuse surface | Restrict to known deployed origins once the redesign's final domain is fixed, or pair open CORS with the auth/rate-limit fix above |
| No S3 public-access-block verification for audio/embeddings buckets | Potential for unintended public read/write exposure | Explicitly verify (not assume) bucket policy and public-access-block settings as part of the AWS reconciliation pass in Truth & reproducibility |
| Revealing internal identifiers (UUIDs) in user-facing toasts | Minor info leakage, no functional security issue, but signals un-productized rough edges to any technical reviewer | Show human-meaningful status text, not raw `upload_id`/`analysis_id`, in toasts |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|------------------|
| Scripted "processing" messages that don't reflect actual pipeline state ("Measuring fish chorus density…") | Erodes trust the moment a technical user notices the mismatch between claimed and actual processing | Drive progress copy from real `/status/{id}` stage transitions |
| Ground-truth label and model-predicted label rendered in the same visual style | Visitor can't tell "what the dataset says" from "what the AI guessed" | Visually and textually distinguish reference/ground-truth badges from model-output badges everywhere, not just in one component |
| Geographic proximity shown for *acoustic* nearest-neighbors (MiniMap of similar sites) | Invites "my reef is like this one because it's nearby," when nearness is acoustic not spatial | Don't co-locate acoustic-similarity results on a literal map unless the map also encodes distance-in-embedding-space, not just lat/lon |
| Uncertainty buried in a caveat footer, contradicted by three other caveat components with different text | Users who read the confident headline number never see the caveat; users who do see four different, partially contradictory versions | One caveat/model-card source of truth, rendered inline next to the number it qualifies, not as a separate footer users can skip |
| Skipping an optional input (coordinates) silently costs confidence with no warning | Users have no idea an action they took (or didn't take) changed the result's credibility | State the tradeoff before the action ("skipping location reduces result specificity") rather than penalizing silently after |

## "Looks Done But Isn't" Checklist

- [ ] **Model evaluation**: Often missing a genuinely held-out site/country — verify every reported accuracy states its holdout unit and was computed via grouped/leave-one-site-out CV, not a random split.
- [ ] **Probability/confidence display**: Often missing calibration — verify displayed values sum correctly, are traceable to an un-mangled model output, and have an abstention path for low-coverage inputs.
- [ ] **New audio dataset ingestion**: Often missing preprocessing parity with the serving path — verify normalization, window selection, resampling, and Nyquist handling match exactly what inference will apply.
- [ ] **Map/chart feature**: Often missing an accessible alternative — verify keyboard navigation, screen-reader announcement, and a non-visual data table/list exist before merge.
- [ ] **Restoration/comparison narrative**: Often missing same-location pairing — verify any "before/after" or "recovery" story uses one location's paired sites, not cross-country exemplars chosen for visual contrast.
- [ ] **New UI number/label**: Often missing provenance — verify it links to (or visibly states) its dataset, license, and label-basis (upstream vs. ReefRadar-assigned).
- [ ] **Consolidated legacy flow**: Often missing a capability the duplicate it replaces had — verify against CAPABILITY-MATRIX.md before retiring the old route.
- [ ] **Spectrogram/visualization component**: Often missing a performance budget check — verify frame time on the longest supported file length and that animation loops stop off-screen/under reduced-motion.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|-----------------|
| Leaky evaluation already shipped as "90% accurate" | LOW | Recompute with leave-one-site-out CV, publish both numbers (old leaky figure explicitly marked invalid) in the model card; this is cheap because the audit already has the data needed |
| Synthetic audio/class already deployed and publicly reachable | MEDIUM | Already scoped as in-milestone work (Truth & reproducibility): pull the synthetic gallery/class, replace with real excerpts, verify deployed model config directly via S3 before claiming it's fixed |
| Train/serve preprocessing skew discovered after large-scale re-embedding | HIGH | Re-run the batch embedding job with corrected preprocessing — expensive at 542k-file scale, which is exactly why Pitfall 3's prevention (fix the pipeline once, centrally, before the large ingestion) matters |
| A redesigned screen ships without an accessible map/chart alternative | MEDIUM | Retrofit ARIA/keyboard support and a text/table alternative post-hoc (the `gsd-ui-review` 6-pillar audit pattern exists for exactly this, but it's a second pass, not free) |
| A consolidated flow is later found to have dropped a legacy capability | LOW–MEDIUM | Check CAPABILITY-MATRIX.md for the gap, re-add the specific missing capability to the new unified flow rather than reviving the old route |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase/Track | Verification |
|---------|------------------------|---------------|
| Site/recorder leakage in evaluation | Data & Model track — evaluation step, before retrain | Model card states holdout unit (site/country) and shows balanced accuracy with CI from leave-one-site-out CV |
| Confounds (region, campaign, diel, disturbance-vs-health label) | Data & Model track — ingestion, before diel/sonotype lenses ship | Confound checklist run against every new lens before merge; MARRS timezone independently verified |
| Train/serve preprocessing skew | Data & Model track — shared preprocessing module, before batch re-embedding | Single preprocessing function used by all ingestion scripts and the live inference path; anti-aliased resampling confirmed in code review |
| Non-probabilistic "probabilities" / uncalibrated confidence | Truth & reproducibility track (remove multiplier, add abstention UI) + Data & Model track (real calibration) | Probability bars sum to 100% or show an explicit abstained state; OOD shown as a separate flag/score, never a multiplier |
| Acoustic indices / band-energy as pseudo-science | Evidence pages / methods phase | Every index on a data-facing surface carries a citation and explicit reliability caveat; band filters scoped as playback-only |
| Restoration labels treated as ordinal/absolute | Instrument phase (recovery ladder) + Evidence pages | Recovery narrative built from one paired location; label_basis field rendered per site; no gradient/slider health score exists |
| Map/dashboard overreach vs. actual data density | Instrument phase — Atlas component spec | Semantic-zoom table (world=clusters, project=sites, upload/reference=real density) implemented as designed, not as literal 54-dot world map |
| Spectrogram/audio performance debt | Instrument phase — Listening Bench | Frame-time budget met on longest supported file; animation loops verified to stop off-screen |
| Map/chart/audio accessibility bolted on late | Design-system phase + each UI phase's UI-SPEC | Keyboard/screen-reader pass completed before each component merges, not as a retroactive audit |
| Strangler-migration capability regression | Every consolidation phase | Sign-off against CAPABILITY-MATRIX.md before legacy route retirement |
| Numbers/labels without provenance | Evidence-pages phase + Data & Model track (API contract) | Every rendered number/label links to or states dataset/license/label-basis |
| False numeric precision | Truth & reproducibility track | Precision policy documented on methods page; spot-check rendered values against it |
| Stale/scripted UI copy vs. actual system state | Truth & reproducibility track; ongoing via automated tests | Counts generated from live API, not hard-coded; content-freshness check in test suite |

## Sources

Domain / scientific literature:
- Elise, S. et al. — acoustic complexity index performance on coral reefs, discussed in ["An optimised passive acoustic sampling scheme to discriminate among coral reefs' ecological states"](https://publications.cirad.fr/une_notice.php?dk=598886) and related Frontiers in Remote Sensing coverage of ACI/SPL diurnal-pattern unreliability — [frontiersin.org/.../frsen.2024.1338586](https://www.frontiersin.org/journals/remote-sensing/articles/10.3389/frsen.2024.1338586/full)
- ["The utility of different acoustic indicators to describe biological sounds of a coral reef soundscape"](https://dspace.library.uvic.ca/items/3c5db3fa-0b6a-4f04-bad0-cae174df2165) — Bioacoustic Index and ACI weak/inconsistent correlation to visual health metrics; RMS SPL and acoustic entropy in the 50-1200 Hz fish band as the stronger-performing indices
- ["Limitations of α-acoustic diversity indices in assessing invertebrate sounds in coral reefs"](https://bioacoustics.info/article/limitations-%CE%B1-acoustic-diversity-indices-assessing-invertebrate-sounds-coral-reefs)
- Mooney/Lillis et al. — diel pattern and lunar-cycle effects on reef soundscape SPL and snap rates: [Lillis & Mooney 2018](https://www2.whoi.edu/site/amooney/wp-content/uploads/sites/31/2018/06/Lillis_Mooney_2018_CR.pdf)
- Williams et al. — SurfPerch cross-domain-mixing pretraining for reef transfer learning: [arXiv 2404.16436](https://arxiv.com/abs/2404.16436); Perch 2.0 marine transfer performance: [arXiv 2512.03219](https://arxiv.org/pdf/2512.03219)
- Grouped cross-validation / pseudoreplication / site-leakage in bioacoustic ML: synthesis from multiple 2025-2026 bioacoustics ML papers on recording-equipment/site mismatch degrading cross-validation performance and grouped-fold practice (arXiv 2608.03977, arXiv 1905.04418, and related)
- Calibration and abstention in low-data ecological ML: ["Being confident in confidence scores: calibration in deep learning models for camera trap image sequences"](https://www.biorxiv.org/content/10.1101/2023.11.10.566512.full.pdf); ["Things Machine Learning Models Know That They Don't Know"](https://ojs.aaai.org/index.php/AAAI/article/view/35094)
- Hydrophone/recorder calibration and anti-alias filtering: IMEKO TC19 METROSEA proceedings on autonomous-recorder system-level calibration — [imeko.org/.../IMEKO-TC19-METROSEA-2019-40.pdf](https://imeko.org/publications/tc19-Metrosea-2019/IMEKO-TC19-METROSEA-2019-40.pdf)
- Ethics of restoration/recovery communication and overclaiming risk — synthesis of restoration-ethics literature on public messaging and the risk that optimistic recovery narratives reduce urgency around preserving existing ecosystems

UI/performance/accessibility:
- wavesurfer.js spectrogram plugin performance guidance (FFT size, zoom cost, main-thread blocking on long files) — [wavesurfer.xyz/docs/plugins/spectrogram](https://wavesurfer.xyz/docs/plugins/spectrogram/)
- Observable Plot / accessible data-viz evaluation axes (SVG/ARIA, keyboard navigation, screen-reader hierarchy, alt table view) and accessible-map tab-stop guidance — [equalentry.com/accessible-maps-on-the-web](https://equalentry.com/accessible-maps-on-the-web/), [disabilityworld.org/articles/accessible-data-viz-tooling-2026](https://www.disabilityworld.org/articles/accessible-data-viz-tooling-2026/)
- Olli: screen-reader-accessible visualization library — [vis.mit.edu/pubs/olli](https://vis.mit.edu/pubs/olli)

Project evidence (required reading, primary source for domain-specific instances cited throughout):
- `.planning/audit/DATA-MODEL.md` (findings F1-F12, §§2-9)
- `.planning/audit/PRODUCT-AUDIT.md` (executive summary items 1-12, §§1-8)
- `.planning/codebase/CONCERNS.md` (tech debt, security, scientific-validity-risks, performance, stale documentation)
- `.planning/PROJECT.md`, `.planning/research/DRIVING-QUESTIONS.md` (scope, constraints, Q1-Q9 decisions)

---
*Pitfalls research for: reef-soundscape research instrument (PAM ML + data pipeline + research-UI redesign)*
*Researched: 2026-09-30*

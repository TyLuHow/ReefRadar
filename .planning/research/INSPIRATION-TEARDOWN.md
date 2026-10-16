# Inspiration Teardown: Feature-Level Study for the Instrument Shell, Atlas and Listening Bench

**Researched:** 2026-10-16 (resumed from an interrupted capture run; 73 evidence files plus 8 new gap-fill captures)
**Branch:** redesign/v2-discovery
**Feeds:** Phase 6 (Instrument Shell & Atlas), Phase 7 (Listening Bench), Phase 9 (Analysis as Search), Phase 13 (Evidence), Phase 14 (Time), Phase 15 (Front Door), Phase 16 (A11y/Responsive)
**Relationship to earlier research:** `REFERENCE-PLATFORMS.md` (2026-09-30) profiled 40 products mostly from write-ups and help pages, and several flagship SPAs were marked "[write-up based]" because they could not be inspected. This document adds what that study could not: what the live UIs actually render and do when clicked, at the level of single features. Where this study confirms an earlier claim it says so briefly; it does not re-profile the products.

## Summary

Looking at the live interfaces (not their marketing) sharpens three things. First, the best reference tools put **provenance inside the control, not beside it**: GFW puts the data source and unit on every layer card and recomputes the legend for the selected time range; Restor puts a plain-language "what this shows" sentence, a spatial-resolution tag, an explicit "No data available" row and a "self-disclosed, not validated" disclaimer on each site metric; MBARI's spectrogram browser labels its time axis "hour (UTC)" and its colourbar in dB re 1 µPa²/Hz. ReefRadar's ProvenanceChip and Why panel should be built into each primitive the same way, not added as footnotes. Second, the **strongest listening interface (Pattern Radio) is also the clearest warning**: its fixed centre playhead, spectrogram, model strip and overview scrubber are the right anatomy for the Listening Bench, but its red "AI" strip has no legend or meaning on screen and its frequency axis is off by default, which our integrity rules forbid. Third, **guided tours that drive the live instrument are real and work** (Half-Earth encodes the tour step in the URL and narrates it with a speaker button; Pattern Radio lists named expert guides with an explicit "No tour"), which de-risks FRONT-03. The Earth Index geography/similarity morph is confirmed live and is cheap at our scale, but it explains itself with a blocking modal on first load and a derived colour ("aridity" from embeddings) that ReefRadar must not imitate as a pseudo health score. The four bold directions at the end ("Score", "Specimen Drawer", "Sound-space First", "Investigation Docket") are alternatives to the shipped Atlas default, each built only from our fixed stack.

## Method and evidence tags

- **Capture:** headless Chromium from the repo's own Playwright install (`dashboard-next/node_modules/playwright`), 1440 x 900, one page load per URL, then at most a short scripted click sequence with a screenshot after each step (`shoot.cjs`, `interact.cjs` in the scratchpad). No logins, no crawling, no dataset downloads. Cookie banners were left untouched where the "Reject" click failed, so some screenshots carry an overlay.
- **Look, don't copy:** this document describes patterns in our own words. UI labels are quoted only where the exact label is the evidence (e.g. "No tour", "By similarity"). No third-party code, branding, copy or assets are proposed for the repo.
- **Tags:**
  - **SEEN** - directly visible in a named screenshot or captured page text (file cited), or on a cited URL loaded this session.
  - **INFERRED** - a reasonable reading of what was seen (e.g. how a control probably behaves), not directly observed.
  - **UNKNOWN** - attempted but not observed (click timed out, canvas text not readable, page blocked).
- **Evidence location (not in repo):** `C:\Users\TYLERL~1\AppData\Local\Temp\claude\C--Users-TylerLubyHoward-reefradar\5130a996-1159-50d4-8c67-b3ff16b0d142\scratchpad\inspiration\`. File names below are relative to that folder.
- **Limits:** WebGL canvases (Pattern Radio, Earth Index, Half-Earth globe, Climate TRACE) expose no DOM text, so labels inside them were read from screenshots only. Several Earth Index screenshots timed out (`ei-steps.json`, `ei2-steps.json`), so only three Earth Index frames exist. Half-Earth's globe rendered as a blank sphere in headless Chromium (`he2-tour2.png`); its data layers were read from page text, not pixels.

## Sites studied

| Site | Reachable this session? | Feature(s) studied | Evidence files |
|---|---|---|---|
| Global Fishing Watch map | Yes | Layer cards and legends, inline filters (include/exclude), timebar with granularity and range, cell click popover, hover readout, report/graph mode, share workspace, contextual "?" beacons, tool rail | `gfw-map.json/.png`, `gfw-map-closed.png`, `gfw-map-click-cell.png`, `gfw-map-steps.json`, `gfw2-month.png`, `gfw2-vessel.png`, `gfw2-vessel-scroll.png`, `gfw2-steps.json`, `gfw3-layermenu.png`, `gfw3-graphmode.png`, `gfw3-share.png`, `gfw3-steps.json` |
| GFW home + user guide | Yes | Context only (registration-gated features list) | `gfw-home.json/.png`, `gfw-userguide.json/.png` |
| GFW vessel profile | Partly | Click on vessel name in popover timed out; full vessel profile **UNKNOWN** this session | `gfw2-steps.json` (error entry) |
| MBARI Soundscape Listening Room | Yes (cookie overlay) | Listening honesty notices, library instructions; category buttons not clicked (timeout) | `mbari-listening.json/.png`, `mb-library.png`, `mb-library2.png`, `mb-steps.json` |
| MBARI Soundscape Visual Browser | Yes (cookie overlay) | Year x month availability grid, daily spectrogram with UTC axis and dB colourbar, overview/detail pairing | `mbari-visual.json/.png`, `mbv-browser.png`, `mbv-steps.json` |
| Pattern Radio: Whale Songs | Yes (canvas only, no DOM text) | Landing, explorer anatomy, tour picker, settings panel, two zoom-out levels; "Share Link" and "Help" clicks timed out (**UNKNOWN**) | `patternradio-app.json/.png`, `patternradio-explore.png`, `patternradio-explore2.png`, `pr2-tours.png`, `pr2-settings.png`, `pr2-share.png`, `pr2-help.png`, `pr3-zoomout.png`, `pr3-zoomout2.png`, `pr*-steps.json`, `patternradio-blog.json/.png` |
| Calling in our Corals | Landing only | Three-step loop as described on the launch page; the experiment itself was not launched (**UNKNOWN** interaction details) | `calling.json/.png` |
| Half-Earth Project map | Yes (globe blank headless) | Audio-tour chooser, tour step with narration tooltip and beacon, URL-encoded onboarding state, layer cards with sources and resolution | `halfearth-app.json/.png`, `he-priority.png`, `he-priority2.png`, `he-steps.json`, `he2-tour.png`, `he2-tour2.png`, `he2-steps.json`, `vz-halfearth.json/.png` |
| Earth Index embeddings explorer | Yes (some shots timed out) | Geography/similarity morph, explainer modal, colour legend with method, load counter, hover preview | `earthindex-emb.json/.png`, `ei-map.png`, `ei-steps.json`, `ei2-click.png`, `ei2-steps.json`, `eg-blog.json/.png` |
| Restor (restor.eco) + Vizzuality case study | Yes | Map/panel shell, clustered pins, site profile (tabs, metric cards, absence rows, self-disclosure disclaimer, "Site images over time") | `restor-app.json/.png`, `rs-nocookie.png`, `rs-pin.png`, `rs-steps.json`, `rs2-pin.png`, `rs2-pin2.png`, `rs2-steps.json`, `vz-restor.json/.png` |
| Climate TRACE explore (c10e.org/explore) | Yes (new) | Summary card (big numeral, unit, source count, inline monthly bars), metric horizon toggle, ranked asset list, 3D extruded globe | `c10e-explore.json/.png` |
| NOAA SanctSound (home + Florida Keys) | Yes (new) | Question-tile home, question tabs on a sanctuary page, clickable sound scene with a parallel categorised list | `sanctsound-home.json/.png`, `sanctsound-fknms.json/.png` |
| Climate Central Coastal Risk Finder | Yes (new, landing only) | Question-headed fact-card quadrants, search-first entry | `cc-risk.json/.png` |
| xeno-canto | **No** - "Access Denied" to the automated browser on both the home and a species page | Not studied | `xc-home.json/.png`, `xc-species.json/.png` |
| Google Earth Timelapse | Landing only | The viewer now lives inside Google Earth; the Earth Engine page is a marketing landing. Scrubber not studied | `timelapse.json/.png` |

## Feature teardowns

Each teardown: **Does** (what it is for) · **Interaction** · **Layout and visual** · **Provenance, uncertainty, attribution** · **ReefRadar equivalent** (fixed stack: Next.js 16, MapLibre via react-map-gl, Observable Plot + d3, Tailwind 4 tokens, zustand, URL state, React Aria; no deck.gl, Leaflet, Recharts or wavesurfer).

### A. Global Fishing Watch map

#### F1. Layer card with embedded legend, source chips and inline filter
- **Does:** each data layer is a card in the left panel that holds its toggle, its source, its unit and its legend together. SEEN `gfw-map-closed.png`.
- **Interaction:** toggle switch per layer; a filter icon opens the filter form *inside the card* (not a modal) with FLAG and GEAR TYPE dropdowns, each with an INCLUDE / EXCLUDE segmented control, a port-buffer slider and a CONFIRM button; a small "User Guide: Filter activity layers" link sits at the bottom of the open form. SEEN `gfw3-layermenu.png`, `gfw3-steps.json`. Section headers (ACTIVITY, DETECTIONS, EVENTS) carry a "+" to add layers. SEEN.
- **Layout and visual:** dark navy map, light panel; layer colour (teal for AIS, amber for VMS) is used for the toggle, the legend ramp and the chart line in report mode, so one colour identifies one dataset everywhere. SEEN `gfw-map-closed.png`, `gfw3-graphmode.png`.
- **Provenance/uncertainty:** the source chip ("AIS", "VMS (10 countries)") and unit line ("hours / 32,000 km²") are part of the card. The legend tick values change when the time range changes (373 to 19.9K for a 3-month window vs 460 to 18.2K for a year; the hovered value 180 is inserted into the scale). SEEN `gfw-map.json` vs `gfw2-steps.json`, `gfw2-vessel.png`. INFERRED: the legend is data-driven per view, which is honest about the view but means two screenshots are not comparable by colour.
- **ReefRadar equivalent:** our "layers" are lenses, not datasets (status, restoration stage, dataset, evidence), so do not build a layer library. Do build the *card anatomy* into the Atlas filter rail: each facet card shows its legend (StatusMark shapes plus live counts from the `Legend` primitive), its source (`ProvenanceChip`: "MARRS labels, assigned by dataset authors") and an inline include/exclude toggle (React Aria `ToggleGroup`). Filter state goes to the URL. Use a **fixed** scale wherever two views will be compared (spectrogram dB range is already fixed at -120 to -50 dB in Phase 4) and only use view-relative legends where no comparison is implied. Targets ATLAS-05, ATLAS-04, EVID-02, DS-05.

#### F2. Timebar that is itself a chart
- **Does:** the bottom band selects the time range for every layer and also shows the activity volume over time. SEEN `gfw-map-closed.png`, `gfw2-month.png`.
- **Interaction:** play button, calendar icon, bookmark icon, a YEAR / MONTH / DAY / HOUR granularity stack, and two bracket handles to drag the range; the selected range is printed in bold over the map's lower-left ("JAN 1, 2026 - JAN 1, 2027") and written into the URL as `start=`/`end=`. SEEN `gfw2-month.png`, URL in `gfw2-steps.json`. A "?" beacon sits on the timebar. SEEN.
- **Layout and visual:** a stacked area mini-chart (teal over amber, one band per active layer) fills the timebar between the handles and is dimmed outside them. SEEN `gfw2-vessel.png`.
- **Provenance/uncertainty:** none on the bar itself; the area chart has no axis. INFERRED: acceptable because it is a navigation aid, not a figure.
- **ReefRadar equivalent:** our calendar time is sparse snapshots now and deployment windows after Phase 11, so a GFW calendar timebar is still wrong for the Atlas (agrees with `REFERENCE-PLATFORMS.md` and `FEATURES.md` anti-feature). Two transfers do fit: (1) the **within-recording** overview strip under the bench spectrogram should be a mini-chart (per-window level or reading density in Observable Plot), with bracket handles that set the zoom window, and the zoom window written to the URL (`t0`, `t1`) per PERSIST-01 and TIME-07; (2) in Phase 14, the **effort calendar** can act as a range selector whose selection is printed in words above the views it filters (TIME-02, TIME-07).

#### F3. Click a cell, get a small table; hover, get a value and coordinates
- **Does:** clicking a grid cell opens a popover headed by layer name and total ("137.73 hours"), with a table of vessels (name, flag, gear, source, hours), a pin icon per row to add that vessel to the workspace, and "+ 1 more". SEEN `gfw-map-click-cell.png`, `gfw-map-steps.json`. Hover shows a value chip ("179.9 hours") and the map footer shows decimal and DMS coordinates. SEEN `gfw2-vessel.png`.
- **Provenance:** the SOURCE column repeats the source per row. SEEN.
- **ReefRadar equivalent:** `ATLAS-07` already says the Inspector replaces popups; GFW shows why a *small* in-place table is still useful when one map mark aggregates several entities. For a South Sulawesi cluster (four statuses within ~2 km), clicking the cluster should populate the Inspector with a mini-table (site, status shape plus label, label source, clips, embedded yes/no) where each row has an "add to compare" action, the equivalent of the pin. Hover gives a one-line chip (site id + status word), never a number without its unit. Coordinates readout belongs to the Analyze coordinate entry (ANLZ-03), not the Atlas.

#### F4. Report mode: a sentence headline and an "estimate" disclaimer
- **Does:** switching to the analysis view widens the panel (about half the screen) and shrinks the map; the URL path becomes `/report`. SEEN `gfw3-graphmode.png`, `gfw3-steps.json`.
- **Layout and visual:** the headline is a sentence with the key numbers and dates in a stronger weight than the connecting words ("26,411,256 hours of activity globally between Jul 13, 2026 and Oct 13, 2026"); under it, the same source chips as the layer cards, now with a filter glyph; then an "Evolution" dropdown and a line chart in the layer colours. SEEN `gfw3-graphmode.png`.
- **Provenance/uncertainty:** directly under the chart: the data should be taken as an estimate, with a "Learn more" link, next to a contextual user-guide chip. A registration wall hides the vessel list below. SEEN.
- **ReefRadar equivalent:** the Phase 9 result view should open with a **sentence headline whose numbers are tokens**: "7 of 9 windows sit nearest healthy references; 2 can't tell" (ANLZ-05), where "7", "9" and "can't tell" are emphasised spans that each open their provenance (EVID-02). Put the standing caveat directly under the figure it qualifies, linking to the single Methods source (EVID-03), not in a banner. Layout transition: Atlas map shrinks to a locator while the result panel widens, as one layout state in the URL (`?view=result&analysis=...`). Never gate evidence behind registration (we have no accounts, PROJECT.md Q5).

#### F5. Share, contextual help beacons and the tool rail
- **Does:** the share icon copies the workspace URL and confirms with a toast ("link ... copied to your clipboard"). SEEN `gfw3-share.png`. The URL carries `latitude`, `longitude`, `zoom`, `start`, `end`. SEEN `gfw2-steps.json`. Yellow "?" beacons sit on the map, on a layer and on the timebar; a welcome modal and a "new dataset" card appear on first load. SEEN `gfw-map.json`, `gfw-map-closed.png`. A vertical right-hand rail holds zoom, ruler, annotation ("Ab"), screenshot and basemap. SEEN.
- **ReefRadar equivalent:** copy-link with a polite live-region confirmation (React Aria toast pattern or an `aria-live` status) for PERSIST-01 and Phase 6 criterion 4. The yellow beacons are a good *opt-in* form of onboarding for FRONT-03 if they are off by default after first dismissal; the GFW first-load stack (modal plus product card plus beacons) is too much for a "hear a reef in 5 s" landing (LISTEN-01). A screenshot/export tool on the rail maps to PERSIST-03 exports (with a provenance block), not raster screenshots.

### B. Pattern Radio: Whale Songs

#### F6. Fixed-centre playhead over a continuous spectrogram, model strip and overview
- **Does:** the explorer is one full-width spectrogram with a white vertical playhead fixed at the screen centre; content scrolls under it. Directly under the spectrogram, a red-to-dark heat strip on the same x-axis; then a time axis with hh:mm ticks and the date ("FEB 11 2015"); then a thin full-width overview line with a white thumb showing where in the archive you are; then a centred play button, and +/- zoom at bottom right. SEEN `patternradio-explore.png`.
- **Interaction:** zoom changes tick density from 1-minute to 5-minute spacing while the playhead stays centred. SEEN `pr3-zoomout.png`, `pr3-zoomout2.png`. Thin grey bars with dots above the spectrogram change with zoom. SEEN; INFERRED to be the "highlight similar sounds" repetition markers described in the project blog (`patternradio-blog.json`).
- **Layout and visual:** black ground, cyan-on-navy spectrogram palette, monospaced uppercase type, very few controls (Settings, Share Link, Help, bottom-left). SEEN.
- **Provenance/uncertainty:** the heat strip has no legend, no label and no explanation on screen; frequency values are hidden by default (see F8). The landing credits NOAA and Google. SEEN `patternradio-app.png`, `pr2-settings.png`.
- **ReefRadar equivalent:** this is the right anatomy for the Listening Bench (LISTEN-03, TIME-01, A11Y-02) and matches the Phase 4 primitives already built (`Spectrogram`, `WindowStrip`, `Transport`, `playhead-clock`). Adopt: spectrogram, window strip and time axis share one d3 x-scale; an overview strip below sets the visible window; play is central. Adapt: for clips of 30 s to a few minutes, a *moving* playhead over a static spectrogram is more legible than scrolling content, so offer fixed-centre scrolling only when zoomed in past the clip width. Required differences: the WindowStrip always has a labelled legend (StatusMark shape + word + "opacity = confidence") and a frequency axis in Hz/kHz is always on (LISTEN-03).

#### F7. Tour picker with named guides and an explicit "No tour"
- **Does:** a "Select tour" dropdown in the top centre lists "No tour" first, then each guide with portrait, name and role (oceanographer, engineer, acoustic biologist, composer, a 7th-grade class workshop and others). SEEN `pr2-tours.png`.
- **Interaction:** picking a tour plays a guided path through the live explorer (blog description, `patternradio-blog.json`); the tour itself was not run this session (**UNKNOWN** step UI).
- **Provenance:** every tour is attributed to a named person with a role. SEEN.
- **ReefRadar equivalent:** FRONT-03 tours should be **authored and attributed** (who wrote this path and on what basis), with "No tour" as the first, always-available option, rendered with React Aria `Listbox`/`Select`. A tour is a list of URL states (PERSIST-01) plus a caption, so it cannot show anything the instrument cannot. A student-workshop tour is a nice precedent for a public-audience path alongside an expert path.

#### F8. Settings that change what the evidence looks like
- **Does:** a settings popover with a volume slider and three toggles: "Highlight similar sounds" (on), "Reduce visual noise" (on), "Show frequency values" (off). SEEN `pr2-settings.png`.
- **ReefRadar equivalent:** keep a settings sheet for *listening* (volume, level-matching on/off with disclosure, LISTEN-05) and *display* (linear/log frequency), but anything that alters the spectrogram image (denoise, contrast) must be visibly flagged on the well itself, and the frequency axis cannot be turned off. See "Patterns to avoid".

### C. MBARI

#### F9. Visual Browser: availability grid plus a fully labelled daily spectrogram
- **Does:** a Year x Month table marks which months have data (a link in each available cell, empty cells where none), and below it a daily long-term spectrogram for the chosen month. SEEN `mbv-browser.png`.
- **Interaction:** a day-of-month ruler (1 to 30) with a green dot marks the current day; animation controls step by an hour, scroll forward or back, stop, or restart from the beginning of the month (page text, `mbari-visual.json`). Visual browsing is deliberately silent and points to the Listening Room for audio. SEEN `mbari-visual.json`.
- **Layout and visual:** time axis labelled "hour (UTC)" across 0 to 23; log frequency axis (10^4, 10^5 visible); a vertical colourbar labelled in dB re 1 µPa²/Hz from about 50 to 100; a second, lower panel joined by a grey trapezoid, which reads as an overview-to-detail zoom. SEEN `mbv-browser.png`; the detail-panel reading is INFERRED.
- **Provenance:** license, citation requirements and user documentation are listed beside the browser (page text). SEEN `mbari-visual.json`.
- **ReefRadar equivalent:** the **availability grid is the effort calendar** (TIME-02) in its simplest honest form: a site x date (or month) matrix with empty cells for no recording, drawn with Observable Plot `cell` marks and a `text` fallback table (A11Y-01). The spectrogram labelling is the bar for LISTEN-03 and DS-03: explicit time zone on any clock axis (DATA-02 makes this a hard dependency for MARRS), units on the colourbar, frequency scale stated. The overview-detail trapezoid is a cheap, readable way to show "this zoomed bench view is this part of the recording". Do not copy the silent split (see F10 and "avoid").

#### F10. Listening honesty notices
- **Does:** the Listening Room states that the live stream is amplified, delayed about 20 minutes for processing, delivered in 10-minute files, and that very loud sounds are muted; library clips that need a subwoofer or good headphones are flagged in their titles. SEEN `mbari-listening.json`, `mb-library2.png`.
- **ReefRadar equivalent:** confirms `REFERENCE-PLATFORMS.md` (#18) and `FEATURES.md`. New detail worth adopting: MBARI discloses **processing applied to what you hear** (amplification, muting) in the same breath as the listening advice. ReefRadar's level-matching disclosure (LISTEN-05) and any band-isolation filter (LISTEN-04) should be stated *on the transport* while active (a one-line "levels matched by <method>; original levels differ by <n> dB" readout, with the method and numbers taken from the Phase 4 `compare-math`, not invented copy), not only in Methods.

### D. Calling in our Corals

#### F11. Listen, train, tag (three-step loop)
- **Does:** the launch page describes a three-minute flow: compare a healthy and an unhealthy reef, train your ear on sound types, then click when you hear a fish. Crowd clicks are described as data for scientists. SEEN `calling.json`, `calling.png`. The experiment itself was not launched (**UNKNOWN** UI).
- **Provenance:** authors named with date (April 2023). SEEN. The page also makes a strong restoration claim about playing frequencies to call life back to reefs. SEEN `calling.json`.
- **ReefRadar equivalent:** the A/B-then-ear-training order is still the right *front door* order (LISTEN-01, FRONT-01, FRONT-02), already recommended in `REFERENCE-PLATFORMS.md` #19. New point from the live page: the loop's power is that the user *does* something with their ears before seeing any model output. ReefRadar can do this without collecting data: a "tap when you hear a snap / grunt" practice mode on a real, attributed MARRS clip that, on finishing, reveals the bench's band view of where those sounds are. No scoring of the user, no stored taps (no accounts). Fits Phase 15 as an optional story.

### E. NOAA SanctSound

#### F12. Question tabs, a sound scene and its parallel list
- **Does:** the home page is a 3 x 2 grid of photo tiles, each a question ("Why and how did we listen?", "Where and when did we listen?", "What did we measure?", "What did we hear?", "What did we learn?", "Who are we?"). SEEN `sanctsound-home.png`. A sanctuary page uses the questions as tabs and shows an illustrated scene where each sound source carries concentric "listen" rings; to its right, a categorised text list (Animal, Human-made, Physical, Soundscape) uses the same highlight colours as the rings. SEEN `sanctsound-fknms.png`.
- **Provenance:** partner logos tile ("Who are we?") on the home page. SEEN.
- **ReefRadar equivalent:** confirms the question-first IA (FRONT-01). New detail: the **scene and the list are two views of the same items with one colour key**, so the scene is never the only route to a sound, an accessible pattern we should require for any illustrative view (A11Y-01). ReefRadar's "scene" should not be an illustration (we cannot attribute illustrated fish to a recording), but the same structure applies to the band table: a frequency-band diagram with clickable bands and a parallel list of the same bands and their cited sources (LISTEN-04, EVID-03).

### F. Half-Earth Project map

#### F13. Audio tours that drive the live map, with the step in the URL
- **Does:** the landing offers two numbered tours ("01. Priority Areas", "02. National Report Cards"), then "OR" three free-exploration entries (Discover stories, Explore data, National Report Cards). SEEN `he-priority.png`, `halfearth-app.json`.
- **Interaction:** starting a tour opens the real map interface with a tooltip card at the lower right that has a speaker button (narration), a close "x", and a progress ring; a numbered teal beacon ("1") marks the layer card the step refers to. SEEN `he2-tour.png`, `he2-tour2.png`. The URL holds `onboardingType=priority-places` and `onboardingStep=0` plus the globe centre and zoom. SEEN `he2-steps.json`.
- **Layout and visual:** dark starfield; large serif headings on photo-thumbnail category cards (Biodiversity, Protection, Human pressures, Carbon). SEEN. The globe did not render in headless Chromium, leaving a dark sphere. SEEN `he2-tour2.png`.
- **Provenance:** each layer description in the panel ends with a source line (e.g. Rinnan et al. 2021 via Map of Life) and states resolution ("~27 km²" terrestrial, "~55 km²" marine). SEEN `he2-steps.json`.
- **ReefRadar equivalent:** strongest evidence so far for FRONT-03 done right: the tour is *state of the live instrument* (URL params), narrated, exitable at every step, with a visible pointer to the control being explained. Implementation on our stack: tour definition = ordered list of `{urlState, caption, targetId, audio?}`; zustand holds `tourStep`; the URL carries `tour` and `step` so a tour step can be shared; the beacon is a positioned element anchored to the target's bounding box; narration, if any, is a real recorded voice with a transcript (A11Y-04), never synthetic audio passed off as anything else. The resolution line is a model for our "unit and method" rows in the provenance view (EVID-02). The blank globe is a warning: a WebGL-only hero must have a non-WebGL fallback (existing CAP for WebGL fallback; LISTEN-09 analogue for maps).

### G. Earth Index embeddings explorer

#### F14. Geography/similarity morph with a method-bearing legend
- **Does:** one control in the header toggles "By similarity" and "By location"; points animate between a UMAP layout and their geographic positions. SEEN `earthindex-emb.png` (toggle), `ei-map.png` (mid-morph clusters), `ei2-click.png` (geographic layout). Colour mode toggles "Aridity" and "PCA". SEEN.
- **Interaction:** hovering a point shows a thumbnail of the actual satellite patch. SEEN `ei2-click.png`. Clicking a point links its similarity and map positions (modal text). SEEN `earthindex-emb.json`. A loading counter reads "706,568 / 867,462 sampled embeddings (loading...)" while data streams. SEEN `earthindex-emb.png`.
- **Layout and visual:** light paper ground, faint graticule, serif title, very small legend card bottom-left, product promo card bottom-right. SEEN.
- **Provenance/uncertainty:** the legend states what the colour is *and how it was computed* (an embedding-space contrast between desert-like and humid-like prototypes). The first load opens a "What are Embeddings?" modal that names the projection (UMAP) and the sampling. SEEN `earthindex-emb.png`. The blog explains stratified spatial sampling (`eg-blog.json`). No statement that UMAP axes have no units appears on the map. SEEN by absence in the captured text.
- **ReefRadar equivalent:** ATLAS-03 and ANLZ-09. Our scale makes this cheap: 48 embedded sites (54 total) in contract v1 with PCA coordinates and disclosed explained variance (33%). Implementation: one set of features in a MapLibre GeoJSON source for geography; for sound-space, render the same ids in an SVG/Canvas overlay positioned by a d3 scale over PCA coords, and tween positions with d3-interpolate under `prefers-reduced-motion` guards (DS-06, A11Y-05); MapLibre itself cannot draw non-geographic coordinates, so the morph happens in the overlay layer while the basemap fades. Adopt the method-bearing legend: "Position = PCA of SurfPerch embeddings, PC1 x PC2, 33% of variance; axes have no units; distance is approximate." Adopt the hover preview as **hover-to-hear** (a short attributed excerpt plus thumbnail spectrogram) with the sites that have no embedding (6 of 54 in contract v1) shown as hollow marks that stay parked in a labelled "no acoustic position" tray instead of moving to sound-space (ATLAS-04). Replace the blocking modal with an inline, dismissible explainer beside the toggle.

### H. Restor

#### F15. Site profile as a panel that replaces the welcome panel
- **Does:** the left panel shows a welcome, stats and featured content; clicking a site swaps the panel for a site profile with a Back button while the map zooms to the site; the URL becomes `/sites/{uuid}?lat=&lng=&zoom=`. SEEN `rs2-pin.png`, `rs2-pin2.png`, `rs2-steps.json`. Map pins are clustered with count badges ("10+", "250+", "1000+"). SEEN `rs2-pin.png`.
- **Layout and visual:** profile header (name, country flag, area, intervention type, share icon), tabs (Overview, Scientific Data, About, Connections), Email/Save buttons, then cards. A "Site images over time" pill floats over the map. SEEN `rs2-pin2.png`.
- **Provenance/uncertainty:** each scientific card has a title, an (i), one plain-language sentence on what it shows, a "Spatial Resolution: Medium/Higher" tag and "Show on map". Metrics without data are listed as "Not shown ... No data available" rather than hidden. The page states that the site data is self-disclosed by the project and not validated by Restor. SEEN `rs2-steps.json`.
- **ReefRadar equivalent:** EVID-01 and ATLAS-07. Three things to adopt exactly in spirit: (1) **name who asserted the label and whether we validated it**: "Status: degraded. Assigned by MARRS dataset authors (Williams et al. 2025); not assessed by ReefRadar" (TRUTH-09, LISTEN-08); (2) **list absent evidence explicitly** ("Diel fingerprint: not available in contract v1", driven by contract coverage flags, CONTRACT-03, TIME-02); (3) a **resolution/precision tag** per number (e.g. "location precision: site, about 100 m" or "computed from 9 windows"). Panel-swap with Back, plus a deep link per site, matches the Inspector + `/sites/[id]` split. Do not cluster (54 sites; agrees with earlier research).

### I. Climate TRACE and Climate Central (gap fills)

#### F16. Climate TRACE summary card: one large number with its unit, count and timeline
- **Does:** a card at lower left shows the scope ("2025: All Sectors (Jan 2025 - Dec 2025)"), a very large numeral (57.8B t), its unit and accounting basis (CO2e 100yr), the count of sources behind it (2,765,771), a Monthly/Annual toggle and an inline bar chart 2021 to 2026, with "More Details". A header toggle switches 100 YR / 20 YR horizon. SEEN `c10e-explore.png`, `c10e-explore.json`. Behind it, a 3D globe with extruded bars per asset. SEEN.
- **ReefRadar equivalent:** the `Stat` primitive (Phase 4) should always carry the trio *number, unit/basis, n behind it*: "48 of 54 sites have embeddings", "9 windows", "33% variance". The basis toggle (100 yr vs 20 yr) is the pattern for any user-selectable normalisation (e.g. level-matched vs original levels), with the active basis printed next to the number. The extruded-bar globe is an avoid (see below).

#### F17. Climate Central: question-headed quadrants of fact sentences
- **Does:** under a search box, four columns headed by a word and a question (Trends: what has already changed? Risks: what's at risk? Solutions: what are the solutions? Projections: when are the risks?), each holding cards that are single factual sentences naming a place, a quantity and a period, with a chevron to open the map at that state. SEEN `cc-risk.png`.
- **ReefRadar equivalent:** a concrete, testable form of FRONT-01: each curated question card is a full sentence with a real number and place ("At one South Sulawesi location, four reef states were recorded within about 2 km") that opens a pre-configured instrument state. Numbers in those sentences must come from the contract at render time, not be typed into copy, so they stay true when the contract version changes (CONTRACT-04).

## Patterns worth adopting

Ordered by phase. "Built on" names the Phase 4 primitive or feature module it extends, so planners can see it is a composition, not a new dependency.

| # | Pattern | Source (tag) | ReefRadar form | Phase | Requirements | Built on |
|---|---|---|---|---|---|---|
| P1 | Facet card = control + legend + source + include/exclude, filter opens inline | GFW F1 (SEEN) | Atlas filter rail: one card per lens (status, stage, country/cluster, dataset, evidence) with StatusMark legend, live counts, ProvenanceChip, include/exclude ToggleGroup; all in URL | 6 | ATLAS-05, ATLAS-04, EVID-02, PERSIST-01 | `Legend`, `ProvenanceChip`, `ToggleGroup`, `count-by.ts` |
| P2 | Aggregated mark opens a mini-table with "add" per row | GFW F3 (SEEN) | Cluster click fills the Inspector with a site mini-table; each row "add to compare" | 6 | ATLAS-01, ATLAS-07, LISTEN-05 | `DataTable`, `CompareDeck` |
| P3 | Panel swap with Back + deep-linkable entity URL | Restor F15 (SEEN) | Inspector swaps between overview, cluster, site, clip, analysis; Back restores the previous selection; `/sites/[id]` mirrors it | 6, 13 | ATLAS-07, EVID-01, PERSIST-01 | `Sheet` (phone), Inspector composition |
| P4 | Copy-link with polite confirmation; layout mode in URL (map shrinks when report widens) | GFW F4, F5 (SEEN) | `?view=atlas|bench|result`, panel widths as layout state; copy link announces via live region | 6, 9 | PERSIST-01, PERSIST-02 | URL state (nuqs per Key Decisions, not yet installed; or `useSearchParams`) |
| P5 | Geography/similarity morph with a method-bearing legend and hover preview | Earth Index F14 (SEEN) | Atlas lens toggle "By place / By sound"; PCA overlay with variance disclosed; hover-to-hear; non-embedded sites parked in a labelled tray | 6, 9 | ATLAS-03, ANLZ-09, ATLAS-04, DS-06 | `MapShell`, d3-scale, `StripPlot` projection helpers (`useProjection`) |
| P6 | Spectrogram + model strip + time axis on one x-scale, overview strip below, central play | Pattern Radio F6 (SEEN) | Bench anatomy; overview mini-chart with bracket handles sets the zoom window (`t0`,`t1` in URL); fixed-centre scroll only when zoomed past the clip | 7, 9 | LISTEN-03, TIME-01, TIME-07, A11Y-02 | `Spectrogram`, `WindowStrip`, `Transport`, `playhead-clock` |
| P7 | Fully labelled spectrogram: clock axis with time zone, log/linear frequency stated, colourbar with acoustic units | MBARI F9 (SEEN) | Every well shows Hz/kHz axis, time axis, dB colourbar with reference; any wall-clock axis names its zone | 7, 14 | LISTEN-03, DS-03, DATA-02, TIME-03 | `Spectrogram`, `ColourBar` |
| P8 | Processing disclosure next to the listening control | MBARI F10 (SEEN) | Active level-matching and band filters print a one-line disclosure on the Transport | 7 | LISTEN-04, LISTEN-05, LISTEN-09 | `Transport`, `BandToggle`, `compare-math` |
| P9 | Overview-to-detail connector (trapezoid) between a long view and its zoom | MBARI F9 (SEEN shape; INFERRED purpose) | Thin connector between the overview strip and the zoomed bench; also between the effort calendar and a day | 7, 14 | TIME-01, TIME-02 | Observable Plot `area`/`link` marks |
| P10 | Sentence headline with emphasised number tokens, caveat directly under the figure | GFW F4 (SEEN) | Result opens with "7 of 9 windows ... 2 can't tell"; each token opens provenance; caveat under the figure links Methods | 9 | ANLZ-05, ANLZ-06, ANLZ-07, EVID-02, EVID-03 | `Stat`, `WhyPanel`, `ProbabilityBar` |
| P11 | Name who asserted a label and whether we validated it; list absent evidence | Restor F15 (SEEN) | "Assigned by MARRS authors; not assessed by ReefRadar"; "Diel fingerprint: not available in contract v1" rows from coverage flags | 7, 13, 14 | LISTEN-08, TRUTH-09, EVID-01, CONTRACT-03, TIME-02 | `ProvenanceChip`, `EmptyState` |
| P12 | Precision/resolution tag on each number | Restor F15, Half-Earth F13 (SEEN) | Provenance view row "precision": windows count, location precision, projection variance | 13 | EVID-02 | `WhyPanel` |
| P13 | Big number + unit/basis + n behind it; basis toggle printed beside the number | Climate TRACE F16 (SEEN) | `Stat` always renders value, unit or basis, and count | 6, 9, 13 | EVID-02, DS-05 | `Stat` |
| P14 | Year x month availability grid (empty = no data) | MBARI F9 (SEEN) | Effort calendar as Plot `cell` marks per site x date, with a table fallback; honest "not available" when the coverage flag is off | 14 | TIME-02, A11Y-01 | `PlotFigure`, `DataTable` |
| P15 | Tours drive the live instrument; step in URL; narrated; beacon on the target; "No tour" first; named author | Half-Earth F13, Pattern Radio F7 (SEEN) | Tour = ordered URL states + caption + target id (+ optional recorded narration with transcript); zustand `tourStep`; exit at every step | 15 | FRONT-03, A11Y-04, PERSIST-01 | `Listbox`, `Dialog`, URL state |
| P16 | Question cards as factual sentences that open a state | Climate Central F17, SanctSound F12 (SEEN) | Landing question cards whose numbers are read from the contract at render | 15 | FRONT-01, FRONT-02, CONTRACT-04 | contract client |
| P17 | Illustration and list are two views of the same items with one colour key | SanctSound F12 (SEEN) | Band diagram with clickable bands plus a parallel cited band list | 7, 13, 16 | LISTEN-04, EVID-03, A11Y-01 | `BandSection`, `BandToggle` |
| P18 | Do something with your ears before seeing a model output | Calling in our Corals F11 (SEEN description) | Optional "tap when you hear a snap" practice on a real attributed clip; reveals the band view after; nothing stored | 15 | FRONT-02, LISTEN-01 | `Transport`, `WindowStrip` |
| P19 | Opt-in contextual "?" beacons rather than a first-load modal | GFW F5 (SEEN), counter-example Earth Index F14 | Beacons off after first dismissal; never block the 5-second listen | 6, 15 | LISTEN-01, FRONT-03 | `Tooltip` |

## Bold alternative directions

The shipped default is the Phase 4 **Atlas** direction (quiet editorial, map + Inspector + bench; owner chose `keep-atlas` on 2026-10-05), with **Nocturne** (dark, spectrogram-as-page) and **Poster** (colour-blocked) as token-level alternates. Those three differ mostly in tokens. The four below differ in **structure**: what the main canvas is, what the primary gesture is, and where the map lives. Each is buildable from the fixed stack and obeys the integrity rules. They are meant to be shown beside Atlas at the Phase 6 and Phase 7 UI gates, in any of the three token directions.

### D1. "The Score" - time is the canvas, sites are staves

- **Idea:** the whole workspace is a horizontal score. Each selected recording is a stave (a spectrogram well with its window strip beneath), stacked vertically like GFW's expanded timebar rows and read left to right like Pattern Radio. One shared playhead runs down through every stave. The map shrinks to a locator thumbnail in the header showing where each stave was recorded.
- **What it changes:** Atlas becomes a picker that "adds a stave"; the Inspector becomes the stave's margin (left gutter: site, status shape + word, label source, date, local time, DOI). Compare (LISTEN-05) and the recovery ladder (LISTEN-06) are just 2 to 4 staves; the ladder shows four staves at one South Sulawesi location with each rung's definition in its margin and no connecting line between them (no implied trajectory). An upload (Phase 9) is a stave pinned at the top with its nearest references as staves below.
- **Why it is bold:** it demotes the map further than any reference does and makes "fair comparison" the default posture: shared time axis, shared dB scale, shared frequency scale, level-matching disclosed once for the whole score.
- **From:** Pattern Radio F6, GFW F2 (stacked rows), MBARI F9 (overview-detail).
- **Stack:** `CompareDeck` already shares scale and playhead (Phase 4); staves are CSS grid rows; locator is `MiniMap`; URL holds `staves=a,b,c&t=`. 
- **Risks:** weak for the "where are the reefs?" question; needs a strong Atlas entry. Vertical space limits staves to about 4 on tablet; phones get one stave at a time with a stave switcher (A11Y-06).
- **Integrity checks:** the stave margin must show recording date and time of day so confounds are visible (LISTEN-07).

### D2. "Specimen Drawer" - a contact sheet of every reef, sortable into place or sound

- **Idea:** the main canvas is a grid of 54 tiles, one per site, like a museum drawer of labelled specimens or MBARI's grid of spectrogram thumbnails. Each tile is a small real spectrogram (precomputed, contract-served) with the status shape, site id and dataset. Sort/group controls rearrange the drawer: by country, by status, by dataset, by recording date, or **by acoustic similarity to a chosen tile** (rank order from cosine similarity, ANLZ-04 language "rank among all references"). Hover or focus a tile and it plays a short attributed excerpt; Enter opens it in the bench.
- **What it changes:** geography becomes one sort order plus a small map strip showing the clusters of whatever is selected. Non-embedded sites (6 of 54) sit in their own labelled row with no spectrogram, which makes absent evidence physically visible (ATLAS-04, P11). An upload is "a new specimen placed into the drawer" at its similarity rank.
- **Why it is bold:** it is the only layout where all 54 references are simultaneously *seeable* and one gesture from hearing, which at n = 54 is possible and no big-map reference can do. It is also the most print/export-friendly (light editorial, Q8).
- **From:** MBARI F9 (grid), Restor F15 (absence rows), Earth Index F14 (re-layout by similarity, but as a sort, not a projection), CoralSoundExplorer (earlier research, click-to-listen).
- **Stack:** CSS grid + View Transitions (already in the Phase 4 motion tokens, reduced-motion zeroes them) for the re-sort animation; tiles are `ClipCard` variants; thumbnails need Phase 11 reference spectrogram images or client STFT on the 9 real excerpts until then.
- **Risks:** thumbnails before Phase 11 exist only for sites with clips; the drawer must show "no clip in contract v1" honestly for the rest. Grid order must not imply a score (sorting by status must say "grouped by label", not "ranked").
- **Integrity checks:** similarity sort shows rank, never a percentage "match".

### D3. "Sound-space First" - the projection is home, the globe is a lens

- **Idea:** the default canvas is the sound-space: all embedded sites as marks positioned by PCA, recoloured by status, dataset or country, with a persistent method line ("PCA of SurfPerch embeddings, 33% variance, axes have no units"). The geographic map is the *secondary* layout reached by the same morph toggle, and a minimap shows where the current selection sits on Earth. Brushing a region of sound-space builds a listening queue in the Inspector (Renumics pattern from earlier research), and an upload lands as a query point with lines to its nearest references.
- **What it changes:** the Atlas question becomes "which reefs sound alike?" rather than "where are the reefs?". It is the direct visual form of "upload as search, not verdict" (ANLZ-04, ANLZ-09).
- **Why it is bold:** it commits the product to the thing only it can show, and it is the earlier research's top recommendation (`REFERENCE-PLATFORMS.md` §1.1) taken all the way rather than as a toggle.
- **From:** Earth Index F14, CoralSoundExplorer and Renumics (earlier research), GFW F3 (aggregate-to-table).
- **Stack:** Observable Plot `dot` + `link` marks in an SVG, d3-scale, d3-interpolate tween to MapLibre-projected screen coordinates for the morph; keyboard navigation through marks via a roving-focus list mirrored in a `DataTable` (A11Y-01).
- **Risks:** 33% explained variance means visible distance is a weak proxy; the honest framing must be loud, and the nearest-neighbour list (computed in full dimension, ML-08) must be the authority, with the scatter as illustration. Novice visitors may not read a scatter: the front door must not land here.
- **Integrity checks:** never draw contours, "healthy zones" or density blobs that turn the projection into a classifier.

### D4. "Investigation Docket" - the notebook is the shell

- **Idea:** the left column is a numbered investigation: a short list of steps, each a sentence plus a frozen instrument state (URL), authored by ReefRadar for curated questions or by the user for their own (local, PERSIST-04). Clicking a step restores its state in the instrument on the right; the user can add a step from the current state with a note. A curated question (FRONT-01) is simply a read-only docket; a tour (FRONT-03) is a docket played in order with optional narration; a shared link can carry a whole docket.
- **What it changes:** it unifies question-led entry, tours, saved investigations, notes and permalinks into one object and one UI, instead of four features. The right side can be Atlas, The Score or the Drawer.
- **Why it is bold:** it treats the product as a research instrument with a lab notebook attached, the opposite of a scroll-driven microsite: the narrative never renders anything the instrument cannot.
- **From:** Half-Earth F13 (URL-encoded tour steps), Pattern Radio F7 (named authored tours), Climate Central F17 (sentence cards), GFW F5 (workspaces).
- **Stack:** docket = array of `{note, urlState, author, contractVersion}` in zustand, persisted to `localStorage` for user dockets (wrapped in try/catch), encoded in the URL for sharing when small; React Aria `GridList` or `Listbox` for keyboard reordering.
- **Risks:** URL length for long dockets (fall back to export JSON with provenance, PERSIST-03); local-only storage can be lost (say so).
- **Integrity checks:** each step pins the contract version it was made with (CONTRACT-04), so a docket made today still shows today's numbers after a model retrain, with a "newer version available" notice.

**Suggested gate pairing:** Phase 6 gate: Atlas (default) beside D3 and D2. Phase 7 gate: the Atlas bench beside D1. Phase 15 gate: D4 as the front-door and investigations shell.

## Patterns to avoid

Each conflicts with a Core Value rule (no synthetic audio, no fake probabilities, provenance on every number, label provenance) or with a locked decision.

| Pattern | Where seen | Why it conflicts | Do instead |
|---|---|---|---|
| Model-output strip with no legend, scale or meaning on screen | Pattern Radio F6 (SEEN `patternradio-explore.png`) | An unexplained colour is an unqualified model claim (Core Value: no unvalidated output as diagnosis; EVID-02) | WindowStrip always carries legend, shape + word, "opacity = confidence", and a "can't tell" state (TIME-01, ANLZ-05) |
| Frequency axis off by default; "reduce visual noise" silently changing the image | Pattern Radio F8 (SEEN `pr2-settings.png`) | Evidence altered or unlabelled by default (LISTEN-03, DS-03) | Axes always on; any image processing labelled on the well |
| Binary "healthy vs unhealthy" framing and restoration claims beyond the data | Calling in our Corals F11 (SEEN `calling.json`) | Labels are site-level, locally relative categories, not a health scale (`PITFALLS.md` #6); no claims the system did not measure (TRUTH-07) | Use the dataset's own four labels with definitions and who assigned them; the ladder at one location only (LISTEN-06) |
| A derived colour computed from embeddings, presented as an environmental property | Earth Index "Aridity" (SEEN `earthindex-emb.png`) | The ReefRadar equivalent ("healthiness" from embedding distance to healthy prototypes) would be a pseudo health score (Out of Scope: continuous health score) | Colour only by attributed labels or dataset facts; the model's reading is shown only as the model's reading |
| Blocking explainer modal on first load | Earth Index (SEEN), GFW welcome modal (SEEN `gfw-map.json`) | Delays the 5-second real-reef listen (LISTEN-01) | Inline explainer beside the control; opt-in beacons (P19) |
| WebGL-only hero with no fallback (blank sphere headless) | Half-Earth (SEEN `he2-tour2.png`) | Breaks on no-GPU devices; preserved fallback capability for missing WebGL | Map and sound-space have table and list fallbacks (A11Y-01); SVG for the sound-space overlay |
| Emotional dark globe / 3D extruded bars | Half-Earth, Climate TRACE (SEEN `c10e-explore.png`) | 7 tight clusters on a globe is mostly empty ocean; extruded height invites magnitude reading of categorical labels; register close to the rejected "Mapping Resilience" direction (`REFERENCE-PLATFORMS.md` §5) | Flat MapLibre locator with all 54 marks visible |
| Clustered pins with "1000+" badges | Restor (SEEN `rs2-pin.png`) | Hides individual sites at n = 54 (earlier research, `FEATURES.md`) | Semantic zoom with counts only at world zoom, overlap offsets at site zoom (ATLAS-02) |
| View-relative legends when views will be compared | GFW legend re-scaling with time range (SEEN `gfw-map.json` vs `gfw2-steps.json`) | Two screenshots that look alike can mean different values; fair comparison requires one scale (LISTEN-05) | Fixed dB range for all spectrograms (already -120 to -50 dB); state the scale on every exported image |
| Evidence behind registration | GFW report "register to see vessels" (SEEN `gfw3-graphmode.png`) | No accounts (Q5); provenance must be one click away for everyone | All evidence public; only uploads are rate-limited (PLAT-06) |
| Narrative-only routes to sounds (illustrated scene as the only way in) | SanctSound scene, mitigated there by the parallel list (SEEN `sanctsound-fknms.png`) | Inaccessible and unattributable if illustrated sources stand in for recordings | Any illustrative view has a parallel list and every item resolves to a real, attributed clip (P17) |
| Splitting seeing and hearing onto separate pages | MBARI Visual Browser is silent by design (SEEN `mbari-visual.json`) | Every ReefRadar spectrogram should be playable and every clip visible (LISTEN-03) | One bench: spectrogram, strip and audio together |
| Causal sentences in fact cards ("... caused by ...") | Climate Central (SEEN `cc-risk.png`) | Fine for their attribution science; ReefRadar cannot attribute causes of soundscape differences (confounds of region, campaign, diel and season, `PITFALLS.md` Pitfall 2) | Fact cards state what was recorded, where, when and by whom; never why |
| Hard-coded numbers in marketing copy | Climate Central and GFW home stats (SEEN) | Copy goes stale against a versioned contract (CONTRACT-04) | Numbers in copy are rendered from the contract with their version |

## Evidence files

All files are in the scratchpad folder named under "Method"; none are in the repo. SEEN claims above cite these names.

**Capture scripts:** `shoot.cjs` (one load: screenshot + visible text + rendering hints), `interact.cjs` (one load + scripted clicks with a screenshot per step). Both import the repo's installed Playwright; nothing was installed.

**Global Fishing Watch:** `gfw-home.json`, `gfw-home.png`, `gfw-userguide.json`, `gfw-userguide.png`, `gfw-map.json`, `gfw-map.png`, `gfw-map-closed.png`, `gfw-map-click-cell.png`, `gfw-map-steps.json`, `gfw2-month.png`, `gfw2-vessel.png`, `gfw2-vessel-scroll.png`, `gfw2-steps.json`, `gfw3-layermenu.png`, `gfw3-graphmode.png`, `gfw3-share.png`, `gfw3-steps.json`

**MBARI:** `mbari-listening.json`, `mbari-listening.png`, `mbari-visual.json`, `mbari-visual.png`, `mb-library.png`, `mb-library2.png`, `mb-steps.json`, `mbv-browser.png`, `mbv-steps.json`

**Pattern Radio:** `patternradio-app.json`, `patternradio-app.png`, `patternradio-blog.json`, `patternradio-blog.png`, `patternradio-explore.png`, `patternradio-explore2.png`, `patternradio-steps.json`, `pr2-tours.png`, `pr2-settings.png`, `pr2-share.png`, `pr2-help.png`, `pr2-steps.json`, `pr3-zoomout.png`, `pr3-zoomout2.png`, `pr3-steps.json` (note: `pr2-share.png` and `pr2-help.png` are the same frame because both clicks timed out)

**Calling in our Corals:** `calling.json`, `calling.png`

**Half-Earth / Vizzuality:** `halfearth-app.json`, `halfearth-app.png`, `he-priority.png`, `he-priority2.png`, `he-steps.json`, `he2-tour.png`, `he2-tour2.png`, `he2-steps.json`, `vz-halfearth.json`, `vz-halfearth.png`

**Earth Index / Earth Genome:** `earthindex-emb.json`, `earthindex-emb.png`, `ei-map.png`, `ei-steps.json`, `ei2-click.png`, `ei2-steps.json`, `eg-blog.json`, `eg-blog.png`

**Restor / Vizzuality:** `restor-app.json`, `restor-app.png`, `rs-nocookie.png`, `rs-pin.png`, `rs-steps.json`, `rs2-pin.png`, `rs2-pin2.png`, `rs2-steps.json`, `vz-restor.json`, `vz-restor.png`

**Gap fills captured this session (2026-10-16):** `c10e-explore.json`, `c10e-explore.png`, `sanctsound-home.json`, `sanctsound-home.png`, `sanctsound-fknms.json`, `sanctsound-fknms.png`, `cc-risk.json`, `cc-risk.png`, `timelapse.json`, `timelapse.png`, `xc-species.json`, `xc-species.png`, `xc-home.json`, `xc-home.png` (xeno-canto returned "Access Denied" to the automated browser; not studied)

**URLs loaded:** globalfishingwatch.org (home, /user-guide/, /platform/map), mbari.org (/project/soundscape-listening-room/, /data/soundscape-visual-browser/), patternradio.withgoogle.com, blog.google (Pattern Radio post), experiments.withgoogle.com/calling-in-our-corals, map.half-earthproject.org, vizzuality.com/project/half-earth, vizzuality.com/project/restor, restor.eco/map, embeddings.earthindex.ai, earthgenome.org/blog/visualizing-a-planet-of-embeddings, c10e.org/explore, sanctsound.ioos.us (home, /s_fknms.html), coastal.climatecentral.org, xeno-canto.org (blocked), earthengine.google.com/timelapse/.

# ReefRadar — Sample Audio Gallery & Quick-Select Feature

## Context

ReefRadar's dashboard at `dashboard-next-indol-nu.vercel.app` currently requires users to upload their own coral reef audio — but nobody visiting a demo has hydrophone recordings. We need to bring the audio TO them.

We have 54 reference sites across 7 countries with real audio already in S3 (`reefradar-2477-audio/reference/`). The task is to surface a curated subset of these as playable, analyzable samples directly in the dashboard.

**This is the single most important UX improvement for demo/presentation purposes.**

## UX Flow (Updated)

The sample gallery is the **LANDING EXPERIENCE** — the first thing anyone sees.

```
Gallery (new front door) → Spectrogram (analyzer) → Results
```

1. User lands on gallery — sees story sections, hits play, hears reef audio immediately
2. User clicks "Analyze This" on a sample (or selects from dropdown)
3. UI transitions into the Living Spectrogram view with that audio loaded, spectrogram animating, results appearing
4. Upload-your-own is still available from within the spectrogram view, but it's not the first thing they see

The current spectrogram landing becomes accessible via a "Skip to analyzer" link or after any sample interaction — don't delete it, just move it one step deeper.

---

## What To Build

### 1. Sample Audio API Endpoint

Add a new route to the Router Lambda:

```
GET /samples → Returns curated sample metadata + pre-signed S3 URLs for audio playback
```

The endpoint should:
- Return a curated list of 8-12 sample recordings (not all 54)
- Include pre-signed S3 URLs so audio is playable directly in the browser (URLs valid for ~1 hour)
- Include metadata: site name, country, health category, evocative description, duration, frequency highlights
- Group samples by "story" (see curation below)

Response shape:
```json
{
  "samples": [
    {
      "id": "idn_healthy_dawn",
      "name": "Dawn Chorus, Sulawesi",
      "country": "Indonesia",
      "country_code": "IDN",
      "category": "healthy",
      "story": "healthy_vs_degraded",
      "description": "A thriving reef at sunrise — fish recruitment calls, snapping shrimp, and parrotfish grazing create a dense acoustic landscape.",
      "duration_seconds": 30,
      "audio_url": "<pre-signed S3 URL>",
      "frequency_highlights": ["Fish chorus (200-2000 Hz)", "Snapping shrimp (2000-20000 Hz)"],
      "coordinates": { "lat": -5.45, "lng": 119.45 }
    }
  ],
  "stories": {
    "healthy_vs_degraded": {
      "title": "The Sound of Health",
      "subtitle": "Hear the difference between a thriving reef and a silent one",
      "sample_ids": ["idn_healthy_dawn", "idn_degraded_1"]
    },
    "restoration_timeline": {
      "title": "Recovery in Sound",
      "subtitle": "How a reef's voice returns after restoration — from silence to chorus",
      "sample_ids": ["idn_degraded_1", "idn_restored_early", "idn_restored_mid", "idn_healthy_dawn"]
    },
    "geographic_diversity": {
      "title": "Reefs Around the World",
      "subtitle": "Every reef has its own acoustic signature",
      "sample_ids": ["idn_healthy_dawn", "aus_healthy_1", "usa_sanctsound_1", "ken_healthy_1"]
    }
  }
}
```

### 2. Sample Curation

From existing reference data, select samples that tell each story. Prioritize recordings that are aurally distinct, short (15-30 seconds), and from different regions.

**Story 1: "The Sound of Health"** — Most acoustically rich healthy Indonesia site vs. quietest degraded site.

**Story 2: "Recovery in Sound"** — 4 Indonesia recordings: Degraded -> Early restoration -> Mid restoration -> Healthy.

**Story 3: "Reefs Around the World"** — One healthy site each from Indonesia, Australia, USA (SanctSound), Kenya/Maldives.

### 3. Dashboard UI

#### A. Gallery Landing Page (new `/` route)

Story-based sections with audio cards. Each card has:
- Play/pause with inline audio playback
- Site name + country + health category badge
- Evocative 1-line description
- "Analyze This" button -> transitions to spectrogram view with results
- Golden Hour aesthetic (warm ochre, dusty rose, pale gold)

#### B. Quick-Select Dropdown in analyzer

In the spectrogram/upload area, add dropdown to pick a sample instead of uploading.

### 4. Routing Changes

- Current `/` (landing with spectrogram links) -> becomes the gallery
- Current `/experience` (spectrogram) -> stays, but gallery links into it
- "Skip to analyzer" link on gallery for power users
- "Analyze This" on gallery cards -> `/experience?sample=idn_healthy_dawn`

### 5. Pre-computed Results

Pre-compute analysis results for each curated sample. Store in DynamoDB. Return instantly when sample is selected. User sees full result flow without 30s cold-start wait.

---

## Implementation Phases

### Phase 1: Backend (Lambda + S3)
1. Identify and extract 8-10 sample audio clips from S3 reference data
2. Store clips in `reefradar-2477-audio/samples/`
3. Add `GET /samples` route to Router Lambda
4. Pre-compute analysis results for each sample
5. Deploy Router Lambda update

### Phase 2: Frontend Gallery
1. Create `SampleGallery` component with story sections
2. Create `SampleCard` component with audio playback
3. Rewire `/` route to show gallery instead of current landing
4. Move current landing content to be accessible via "Skip to analyzer"
5. Wire "Analyze This" to transition into `/experience` with sample loaded

### Phase 3: Quick-Select + Polish
1. Add sample dropdown to upload/analyze area
2. Wire sample selection to auto-load audio and trigger analysis
3. Polish transitions, loading states, waveform visualizations

---

## Priority

1. Curate audio clips + GET /samples endpoint
2. Gallery UI as landing page
3. Quick-select in analyzer
4. Pre-computed results for instant demo
5. Polish

## Success Criteria

Someone visiting for the first time can hear reef audio within 5 seconds of landing, see the health difference, click Analyze, and see real ML results — all without uploading anything.

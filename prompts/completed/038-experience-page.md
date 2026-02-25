<objective>
Build the immersive Living Spectrogram Experience page — a single-page application at `/experience` with a state machine that handles file upload, API analysis, audio playback, and results display. Also replace the current landing page (`/`) with a minimal choice screen.

Read `./CLAUDE.md` for project context. The API is at `https://rgoe4pqatf.execute-api.us-east-1.amazonaws.com/prod`.
</objective>

<context>
This is prompt 3 of 5 in the Living Spectrogram Overhaul. Previous prompts established:
- 036: Golden Hour design system (globals.css, tailwind.config, glass components at `components/ui/glass/`)
- 037: SpectrogramCanvas component (at `components/spectrogram/`) with frequency band lines, particle system, and audio reactivity

The app uses Next.js 14 App Router at `./dashboard-next/`. Existing API client is at `src/lib/api.ts`. Types are at `src/types/index.ts`.

API endpoints used by this page:
- POST /upload — Upload WAV file, returns { upload_id }
- POST /analyze — Start analysis with { upload_id, latitude?, longitude? }, returns { analysis_id }
- GET /visualize/{id} — Poll for results (returns status: processing | complete, with full results when complete)
- GET /sites — List reference sites for comparison data

Real demo audio files exist at `public/audio/healthy-reef.wav` and `public/audio/degraded-reef.wav`.
</context>

<requirements>

## 1. New Landing Page (Choice Screen)

Replace `./dashboard-next/src/app/page.tsx` with a minimal choice screen:

**Layout:**
- Full viewport height, centered content
- SpectrogramCanvas in background with `opacity={0.15}` and `state="idle"`
- Background: bg-abyss

**Content (centered, stacked vertically):**
- Title: "ReefRadar" in hero-text style (font-weight 200, large)
- Subtitle: "Listen to the invisible reef" in text-secondary
- Two primary action cards side-by-side (glass panels):
  - "Explore Demo Reefs" — Links to `/experience?mode=demo`
  - "Upload Your Recording" — Links to `/experience?mode=upload`
- One full-width secondary card below:
  - "Explore 44 Reference Sites" — Links to `/dashboard/map`
- Footer links: About, Methodology (links to /about), site count text "44 sites across 5 countries" in text-muted

**Mobile:** Stack the two primary cards vertically.

**Do NOT import or use any of the old landing page components** (HeroSection, ProblemSection, SoundSection, etc.). The old `components/landing/` directory files can remain for now — they just won't be imported.

## 2. Experience Page

Create `./dashboard-next/src/app/experience/page.tsx`

**'use client' directive required.**

**State Machine:**

```typescript
type ExperienceState =
  | { type: 'landing' }
  | { type: 'demo' }
  | { type: 'uploading'; file: File }
  | { type: 'processing'; analysisId: string }
  | { type: 'results'; data: AnalysisResult; audioUrl?: string }
  | { type: 'error'; message: string }
```

Use `useReducer` for state management.

**URL Parameter Handling:**
- `?mode=demo` — Skip to demo state immediately on mount
- `?mode=upload` — Show landing state with upload prompt active
- No param — Show landing state

### State: landing

- Full viewport SpectrogramCanvas background, state="idle"
- Floating nav: "Back" (ghost button, links to /) on left, "ReefRadar" text on right
- Centered content:
  - Heading: "Listen to the invisible reef"
  - Upload drop zone: glass panel with dashed border
    - Text: "Drop hydrophone recording" and "or click to browse — WAV format"
    - Hidden file input, accept=".wav,audio/wav"
    - Drag & drop support (onDragOver, onDrop)
  - On file selection → transition to `uploading` state

### State: demo

- SpectrogramCanvas state="playing"
- Fetch both demo WAVs (`/audio/healthy-reef.wav`, `/audio/degraded-reef.wav`)
- Create AudioContext and decode both buffers
- Create AnalyserNode, connect to SpectrogramCanvas
- Left panel (glass): Playback controls
  - Toggle between "Healthy Reef" and "Degraded Reef"
  - Play/Pause button
  - Current time / duration display (mono font)
  - Frequency band toggles (checkboxes for Fish/Grazing/Shrimp)
- Right panel (glass): Info panel
  - Brief explanation of what you're hearing
  - Links: "Upload your own recording" (→ landing state), "View reference sites" (→ /dashboard/map)
- Crossfade slider between healthy and degraded (reuse concept from AudioCompare)
- Scientific caveats footer (collapsible glass panel)

### State: uploading

- Show the uploaded file name and size
- Glass modal overlay with coordinate input:
  - Title: "Add Recording Location (optional)"
  - Latitude input (GlassInput)
  - Longitude input (GlassInput)
  - Helper text: "Providing coordinates improves classification accuracy by enabling geographic region detection"
  - Two buttons: "Skip" and "Analyze Recording"
- On "Skip": POST /upload with file, then POST /analyze with { upload_id }, transition to processing
- On "Analyze Recording": POST /upload, then POST /analyze with { upload_id, latitude, longitude }, transition to processing
- Handle upload errors → transition to error state

### State: processing

- SpectrogramCanvas state="analyzing"
- Custom spinner: two concentric rings (ochre outer, dusty-rose inner) rotating opposite directions
- Status text cycling every 3 seconds:
  - "Decomposing acoustic layers..."
  - "Measuring fish chorus density..."
  - "Identifying snapping shrimp patterns..."
  - "Comparing to 44 reference sites..."
- Poll GET /visualize/{analysisId} every 2 seconds
- When status is "complete" → transition to results state
- If error → transition to error state
- Timeout after 120 seconds → error state with timeout message

### State: results

- SpectrogramCanvas state="playing" (if audio playback active) or "idle"
- Two side panels flanking the canvas:

**Left Panel — Controls (glass):**
- Health verdict: Large text showing primary classification (e.g., "Healthy Reef") in the corresponding status color
- Confidence: percentage in large mono text
- Audio playback: If the WAV was small enough to keep in memory, play it back with controls
- Frequency band toggles
- "Compare" button → opens comparison modal or navigates to /dashboard/compare

**Right Panel — Reference Comparison (glass):**
- Bar chart showing similarity to each health category (healthy, degraded, restored_early, restored_mid)
  - Bars colored with status colors
  - Percentages in mono text
- Region detection info:
  - If in_training_distribution: "In training distribution" with check mark
  - If not: warning with region name and "Confidence reduced 40%"
- Top 3 most similar reference sites with similarity percentages
- "View on Map" button → /dashboard/map

**Bottom — Scientific Caveats Footer (same collapsible component as demo state)**

### State: error

- SpectrogramCanvas state="idle"
- Glass panel with error message
- "Try Again" button → transition back to landing

## 3. Audio Playback with Web Audio API

Create `./dashboard-next/src/components/experience/useAudioPlayback.ts`

Hook that manages:
- AudioContext creation (lazy, on user interaction)
- BufferSource for playback
- AnalyserNode for spectrogram visualization
- BiquadFilterNodes for frequency band isolation:
  - Low pass at 1000 Hz (Fish)
  - Band pass centered at 2500 Hz, Q=1 (Grazing)
  - High pass at 4000 Hz (Shrimp)
- Band toggle: when a band is toggled off, disconnect its filter chain; when on, reconnect
- Play/pause/stop controls
- Current time tracking (via AudioContext.currentTime)
- Cleanup on unmount

**Return type:**
```typescript
{
  play: () => void;
  pause: () => void;
  stop: () => void;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  analyser: AnalyserNode | null;
  activeBands: Set<'low' | 'mid' | 'high'>;
  toggleBand: (band: 'low' | 'mid' | 'high') => void;
  loadBuffer: (audioBuffer: AudioBuffer) => void;
}
```

## 4. Experience Sub-Components

Create these in `./dashboard-next/src/components/experience/`:

**ControlsPanel.tsx** — Left side panel for results state
**ComparisonPanel.tsx** — Right side panel for results state
**ProcessingOverlay.tsx** — Spinner + cycling status text for processing state
**CoordinateModal.tsx** — Lat/lon input modal for uploading state
**CaveatsFooter.tsx** — Collapsible scientific methodology footer

Each should:
- Use 'use client' directive
- Use glass components from `components/ui/glass/`
- Use the Golden Hour color palette exclusively
- Be properly typed with TypeScript interfaces

**CaveatsFooter caveats list:**
1. "Classification based on acoustic similarity to reference sites. Not a definitive health diagnosis."
2. "Passive acoustic monitoring complements but does not replace visual surveys."
3. "Model trained on Indo-Pacific reefs (Indonesia, Australia, Kenya, Maldives, Mexico). Results for other regions carry lower confidence."
4. "Confidence scores reflect acoustic similarity, not absolute reef health measurements."
5. "Environmental noise, recording equipment, and time of day affect acoustic signatures."

## 5. Floating Navigation

The experience page uses a minimal overlay nav instead of the site-wide Navbar:

- Position: fixed, top, full width, z-40
- Left: "Back" ghost button (glass-button style, links to /)
- Right: "ReefRadar" text in bone color, small status dot (ochre when playing, gray when idle)
- Transparent background, no blur (content shows through)

Hide the main Navbar on this page. The simplest approach: in the experience page layout or the page itself, set a CSS class or use a conditional in the root layout. Alternatively, create `./dashboard-next/src/app/experience/layout.tsx` that wraps children without the Navbar.

</requirements>

<constraints>
- AudioContext must ONLY be created after user interaction (click/tap) — never on page load
- All API calls should use the existing API base URL from environment or hardcoded constant
- File upload is limited to WAV format
- Coordinate inputs should validate: latitude -90 to 90, longitude -180 to 180
- The experience page must work without JavaScript for basic content (SSR the shell, hydrate interactions)
- No forbidden colors (cyan, teal, neon green, hot coral)
- Keep component files focused — no component over 300 lines
- Polling interval for /visualize should be 2 seconds with 120s timeout
</constraints>

<verification>
After completing:

1. Run `cd dashboard-next && npm run build` — must pass with zero errors
2. Verify new routes exist:
   - `src/app/page.tsx` — New choice screen
   - `src/app/experience/page.tsx` — Experience page
   - `src/app/experience/layout.tsx` — Experience layout (no Navbar)
3. Verify all experience components exist:
   - `src/components/experience/ControlsPanel.tsx`
   - `src/components/experience/ComparisonPanel.tsx`
   - `src/components/experience/ProcessingOverlay.tsx`
   - `src/components/experience/CoordinateModal.tsx`
   - `src/components/experience/CaveatsFooter.tsx`
   - `src/components/experience/useAudioPlayback.ts`
4. Verify no forbidden color references in new files
5. Verify AudioContext is only created on user interaction (search for `new AudioContext` — must be inside click/interaction handler)
</verification>

<success_criteria>
- Landing page shows choice screen with 3 action cards
- /experience route renders with SpectrogramCanvas background
- State machine handles all 6 states with proper transitions
- Demo mode loads and plays real audio files
- Upload flow sends WAV to API and polls for results
- Results display health classification with reference comparison
- Frequency band filtering works via Web Audio API
- Coordinate input is optional with skip functionality
- Scientific caveats footer is collapsible
- Build passes with zero errors
- No forbidden colors anywhere in new code
</success_criteria>

# Phase 4 API coverage

Phase 4 builds UI primitives and a dev-only fixtures route. It integrates no third-party API. The api-coverage gate fired on one line of the 04-22 threat table ("init scripts wrap browser APIs during tests only"), which describes test stubs. The only services the phase touches are ReefRadar's own, listed below so the decision is on record.

| capability | decision | reason |
|---|---|---|
| Contract CDN: sites, projection and coverage reads through features/contract | INTEGRATE | Read through the existing versioned contract client (Phase 2) with sha256 checks and Zod parsing; useProjection is the only new hook, and the contract fence keeps all CDN reads inside features/contract |
| ReefRadar API GET /visualize/{id} | OPT-OUT | Read once, read-only, on 2026-10-05 to capture the real ind_H1 analysis as a committed fixture (04-18); no live calls from the kit, live analysis UI is Phase 9 |
| ReefRadar API POST /upload, POST /analyze, GET /status, GET /sites | OPT-OUT | Not used in Phase 4; the legacy routes keep their existing client, and upload as search is Phase 10 |
| Audio excerpts under /audio/*.wav | INTEGRATE | Same-origin static files from the audio manifest, fetched by useClipSpectrogram (allowlisted fetch site), decoded locally for spectrograms and playback |
| Browser APIs (Web Audio, Canvas 2D, ResizeObserver, IntersectionObserver, matchMedia) | OPT-OUT | Platform APIs, not an external service; the "wrap" wording refers to Playwright init scripts that stub them in tests only |
| MapLibre tile, glyph and sprite servers | OPT-OUT | The token-probe map uses an inline style with no remote tiles; token-bridge.spec.ts asserts no tile, glyph or sprite requests |

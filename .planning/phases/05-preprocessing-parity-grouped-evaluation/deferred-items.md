# Phase 5 deferred items

Things found or knowingly left out during Phase 5 that belong to a later phase. Recorded by plan 05-14.
None of them blocks the Phase 5 goal ("serving and offline share one pipeline", grouped evaluation, contract v2).

## Inference container rebuild (before any embedding change; Phase 11)

The `reefradar-2477-inference` container was not rebuilt in Phase 5 (decision Q3: the container is not rebuilt,
so `infrastructure/lambda_container/inference.py` is not edited). Two things are therefore still as they were:

- `infrastructure/lambda_container/requirements.txt` lists `tensorflow-cpu>=2.18.0`, `kagglehub>=0.3.0` and
  `setuptools>=69.0.0` with floors only. A rebuild could resolve different packages and change embeddings.
  Rebuild with pinned versions, then re-run the parity fixture (`scripts/verify_live_embeddings.py`).
- `inference.py` downloads the 4-component handle `google/surfperch/tensorFlow2/1` (`MODEL_HANDLE`). The model
  pinned in the contract's `preprocessing_spec.json` (`model_pin`) is the 5-component handle
  `google/surfperch/tensorFlow2/1/1`, with the sha256 and size of its three SavedModel files. When the container
  is rebuilt, change `MODEL_HANDLE` to `google/surfperch/tensorFlow2/1/1` and verify the downloaded files against
  `lambdas/shared/reef_audio.py` `SAVED_MODEL_SHA256`.
- Remove the two dead fallback handles in `inference.py` (`google/surfperch/tensorFlow2` and `google/surfperch`
  in `handles_to_try`): they would download an unpinned model if the first handle failed, which the pin forbids.

Open as gap `F8-inference-container` in `contracts/bucket/v2/preprocessing_spec.json` (owner Phase 11).

## Legacy-UI model card copy (Phase 13, model card)

`dashboard-next/src/data/model-card.json` still names `interim-real-only` and the model card shown by the legacy
UI describes the predecessor. It sits under visual baselines, so changing it in Phase 5 would force a baseline
refresh unrelated to this phase. Phase 13 (evidence pages, methods and model card) rewrites it from the contract's
`model_version.json` and `evaluation_report.json` rather than hand-copied numbers.

## Classifier memory and timeout for 120-window uploads (Phase 10)

The classifier is 512 MB with a 120 s timeout. A 10-minute upload is 120 windows of 5 s; the per-window
probabilities, similarities and embeddings are now held and written per upload. The item-size test
(`test_item_size_120_windows_under_limit`) covers the DynamoDB item, not memory or wall time. Phase 10 (guarded
public upload) sets the upload cap and should size the classifier memory and timeout against the cap.

## Re-embedding the reference sites to close F8d (Phase 11)

The 48 reference embeddings in `contracts/bucket/v1/embeddings.f32` were built by the earlier methods (5-window
means, about 30-file means, or 10 random windows, with and without normalisation) and v2 reuses them by uri. Site
similarity therefore compares reef_audio windows with reference vectors from a different pipeline. Phase 11 (batch
embedding) re-embeds the reference audio through `reef_audio` and publishes the result in a new contract version.
Open as gap `F8d` (owner Phase 11).

## Served model evidence (Phase 12)

The served model is an interim 3-class MLP fitted to 100 windows from 5 sites. Its leave-one-site-out balanced
accuracy cannot be told apart from chance (see `contracts/bucket/v2/evaluation_report.json`). The real-data retrain,
model selection and abstain logic are Phase 12. Open as gap `F8-model-evidence` (owner Phase 12).

## Known test-environment noise

On Windows checkouts `scripts/tests/test_build_gallery_manifest.py::test_regenerating_manifest_is_idempotent` can
fail from CRLF line endings and rewrites `data/audio-manifest.json` and two dashboard fixtures. Not caused by Phase 5;
restore the files with `git checkout -- <file>` and do not commit them.

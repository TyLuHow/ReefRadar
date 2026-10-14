# Reef Health Classifier - Model Evaluation

**Status:** the 2026-02-03 version of this page is withdrawn and replaced. The current evaluation is the leave-one-site-out report in [`models/interim-real-only/evaluation/REPORT.md`](../models/interim-real-only/evaluation/REPORT.md) (machine-readable: `models/interim-real-only/evaluation/report.json`, version `loso-2026.10.1`). Every number on this page is copied from that report.

## Withdrawn: the 2026-02-03 random-split figures

The earlier page (model version 1.0, generated 2026-02-03) reported an overall accuracy of 90.0% together with per-class precision and recall, a confusion matrix and a confidence-calibration table. Those figures are withdrawn: they came from a random split of windows, so windows from the same site were in both the training and the test set, and the score measured how well the model recognised sites it had already heard, not how it performs at a new place. The 100% held-out-split accuracy stored in the model configuration files is withdrawn for the same reason. Neither figure is an estimate of how the classifier behaves on a recording from a site it has not seen, and neither should be quoted.

## What replaces them

The report holds out every window of one site at a time, retrains the interim recipe on the other sites and tests on the held-out site, with 95% intervals from a two-level bootstrap (sites, then windows within sites). It covers both model families: the original model in its original embedding space and the successor in the re-embedded space the service uses.

The model served is `interim-real-only-2026.10.1`.

| Model | Embedding space | Balanced accuracy on held-out sites | 95% interval |
|---|---|---|---|
| `interim-real-only-2026.10.1` (served) | re-embedded, `preproc-2026.10.1-reef-audio` | 0.4375 | [0.3000, 0.5833] |
| `interim-real-only` (not served) | original, `preproc-2026.10.0-as-deployed` | 0.0625 | [0.0000, 0.1750] |

How to read it:

- Chance for the two classes that can be evaluated (degraded and healthy) is 0.5. The served model's interval contains that line, so on the sites available its result cannot be told apart from chance. It is not evidence that the model recognises reef health at a new site.
- The original model's whole interval lies far below chance. It identified sites, not reef health. Its numbers live in a different embedding space from the successor's, so the two scores are not a measure of one model improving on the other.
- `restored_early` has a single site, so it cannot be evaluated: it is absent from the training data of the fold that holds that site out. Kenya also has a single site, so its accuracy has no interval.
- Only four sites are evaluable, the bootstrap can draw only 35 distinct combinations of them, and sites are confounded with country, recorder and class. The intervals are indicative only (Cameron, Gelbach and Miller, 2008, "Bootstrap-based improvements for inference with clustered errors", Review of Economics and Statistics; Field and Welsh, 2007, "Bootstrapping clustered data", Journal of the Royal Statistical Society Series B).
- Both models are interim, trained on a handful of sites in Indonesia and Kenya. The real retrain and model selection are Phase 12.

Reproduce: `py -3.12 scripts/evaluate_loso.py report` regenerates `report.json` and `REPORT.md` from the committed, sha256-pinned inputs under `models/interim-real-only/evaluation/inputs/`; `py -3.12 -m pytest scripts/tests/test_loso_eval.py -k "report or reproduces"` checks them.

## Deployment notes

The model is exported as NumPy weights for deployment in AWS Lambda. No PyTorch dependency is required for inference; the classifier uses a pure NumPy forward pass (1280 -> 256 -> 64 -> 3, ReLU, softmax). The weights and configuration of the served model are in `models/interim-real-only-2026.10.1/`.

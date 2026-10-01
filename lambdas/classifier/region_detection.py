"""
Detect biogeographic region from coordinates and report an honest,
unscaled region object alongside the classifier's raw probabilities.

D-12 (TRUTH-06): this module used to multiply the classifier's raw
softmax probabilities and confidence by a per-region "confidence
multiplier" (1.0 in-distribution, 0.6 out-of-distribution, 0.7 unknown
coordinates). That silently changed what the model actually output and
made `sum(probabilities.values())` not equal 1. The multiplier concept
has been removed entirely: `adjust_classification()` below never scales
anything. Instead, it attaches a separate, honest `region` object that
states where the recording is (or that coordinates were not provided),
whether the classifier's REAL training data has any site in that region,
how many, and which countries the training data actually covers.

The classifier's real training data (audited in plan 01-10, see
`docs/model/deployed-model.lock.json`) covers only Indonesia and Kenya --
not the broader 5-country MARRS reference-site footprint (Indonesia,
Australia, Kenya, Maldives, Mexico) this module previously treated as
"in distribution". `DEFAULT_TRAINING_SITES` below mirrors the audited
training sites so `in_training_region` reflects where the model was
actually trained, not where MARRS happened to record reference audio.
"""


# Copied from docs/model/deployed-model.lock.json "training_sites"
# (audited 2026-10-01, plan 01-10 `scripts/audit_deployed_model.py --s3`).
# These are the 5 real training rows' source sites behind the deployed
# classifier -- Indonesia and Kenya only. Used as the default when a
# caller (handler.py) does not pass a more specific `training_sites` list
# (e.g. from a future model_config.json `training_sites` field).
DEFAULT_TRAINING_SITES = [
    {'site_id': 'ind_D2', 'country': 'Indonesia', 'latitude': -4.9401, 'longitude': 119.318815},
    {'site_id': 'ind_D3', 'country': 'Indonesia', 'latitude': -4.930635, 'longitude': 119.316119},
    {'site_id': 'ind_H4', 'country': 'Indonesia', 'latitude': -4.929463, 'longitude': 119.316792},
    {'site_id': 'ind_N1', 'country': 'Indonesia', 'latitude': -4.9310799, 'longitude': 119.3159127},
    {'site_id': 'ken_H1', 'country': 'Kenya', 'latitude': -2.215614, 'longitude': 41.013482},
]


# Bounding boxes for major reef regions (approximate).
# `scope` is purely about geographic granularity:
#   'specific' -- a small box tight enough that falling inside it is a
#                 meaningful geographic claim (a named reef system).
#   'broad'    -- a huge ocean-basin box, too coarse to claim training
#                 coverage from alone.
# `in_training_region` (computed in detect_region, not stored here) is
# true only when the matched region is 'specific' AND at least one real
# training site's coordinates fall inside its box -- never from `scope`
# alone, and never from reference-site geography.
REGION_BOUNDS = {
    # --- Broad ocean-basin regions ---
    'INDO_PACIFIC_WEST': {
        'lat_min': -35, 'lat_max': 30,
        'lon_min': 90, 'lon_max': 180,
        'name': 'Western Indo-Pacific',
        'scope': 'broad',
    },
    'INDO_PACIFIC_CENTRAL': {
        'lat_min': -35, 'lat_max': 30,
        'lon_min': -180, 'lon_max': -120,
        'name': 'Central Pacific',
        'scope': 'broad',
    },
    'INDIAN_OCEAN': {
        'lat_min': -35, 'lat_max': 30,
        'lon_min': 30, 'lon_max': 90,
        'name': 'Indian Ocean',
        'scope': 'broad',
    },
    'CARIBBEAN': {
        'lat_min': 8, 'lat_max': 35,
        'lon_min': -100, 'lon_max': -55,
        'name': 'Caribbean/Western Atlantic',
        'scope': 'broad',
    },
    'EASTERN_ATLANTIC': {
        'lat_min': 10, 'lat_max': 35,
        'lon_min': -30, 'lon_max': 0,
        'name': 'Eastern Atlantic',
        'scope': 'broad',
    },
    'RED_SEA': {
        'lat_min': 12, 'lat_max': 32,
        'lon_min': 32, 'lon_max': 45,
        'name': 'Red Sea',
        'scope': 'broad',
    },
    'EASTERN_PACIFIC': {
        'lat_min': -5, 'lat_max': 25,
        'lon_min': -120, 'lon_max': -75,
        'name': 'Tropical Eastern Pacific',
        'scope': 'broad',
    },
    # --- Specific regions (smaller area, matched first by smallest-area-wins) ---
    'INDONESIA': {
        'lat_min': -11, 'lat_max': 6,
        'lon_min': 95, 'lon_max': 141,
        'name': 'Indonesia',
        'scope': 'specific',
    },
    'EAST_AFRICA': {
        'lat_min': -12, 'lat_max': 5,
        'lon_min': 38, 'lon_max': 52,
        'name': 'East African Coast',
        'scope': 'specific',
    },
    'GREAT_BARRIER_REEF': {
        'lat_min': -25, 'lat_max': -10,
        'lon_min': 142, 'lon_max': 155,
        'name': 'Great Barrier Reef',
        'scope': 'specific',
    },
    'MALDIVES': {
        'lat_min': -1, 'lat_max': 8,
        'lon_min': 71, 'lon_max': 75,
        'name': 'Maldives',
        'scope': 'specific',
    },
    'MESOAMERICAN_REEF': {
        'lat_min': 15, 'lat_max': 22,
        'lon_min': -90, 'lon_max': -84,
        'name': 'Mesoamerican Barrier Reef',
        'scope': 'specific',
    },
    'FLORIDA_KEYS': {
        'lat_min': 24.3, 'lat_max': 25.5,
        'lon_min': -82.5, 'lon_max': -80.0,
        'name': 'Florida Keys',
        'scope': 'specific',
    },
    'FRENCH_POLYNESIA': {
        'lat_min': -18, 'lat_max': -14,
        'lon_min': -155, 'lon_max': -148,
        'name': 'French Polynesia',
        'scope': 'specific',
    },
}

CAVEATS = {
    'no_coordinates': (
        "No coordinates were provided with this recording. Classification is "
        "based on acoustic similarity to reference sites, but the classifier "
        "itself was trained only on {n} real sites in {countries}. "
        "Probabilities shown are the model's raw, unmodified output -- they "
        "have not been adjusted for location, and this recording's actual "
        "location relative to the training sites is unknown."
    ),
    'in_training_region': (
        "This recording's coordinates fall within a region containing "
        "{in_region} of the classifier's {n} real training sites ({countries}). "
        "Probabilities shown are the model's raw, unmodified output. "
        "Classification reflects acoustic similarity to training data, not a "
        "definitive health diagnosis."
    ),
    'outside_training_region': (
        "GEOGRAPHIC LIMITATION: This recording appears to be from {region_name}, "
        "which has no real training data behind this classifier. The "
        "classifier was trained only on {n} real reef recording sites in "
        "{countries} and has NOT been validated for {region_name}. "
        "Probabilities shown are the model's raw, unmodified output -- they "
        "have NOT been reduced or adjusted for this geographic mismatch. "
        "Results from outside the training region should be interpreted with "
        "significant caution."
    ),
}


def _validate_coordinate(value, min_value, max_value):
    """Return a finite float within [min_value, max_value], or None.

    Per T-01-11-01: any non-numeric or out-of-range input is treated as
    "coordinates not provided" rather than raising, so a malformed
    lat/lon from a public caller degrades gracefully instead of crashing
    region detection.
    """
    if value is None:
        return None
    try:
        value = float(value)
    except (TypeError, ValueError):
        return None
    if value != value:  # NaN
        return None
    if not (min_value <= value <= max_value):
        return None
    return value


def detect_region(lat, lon, training_sites=None):
    """
    Detect the biogeographic region for a recording and report whether
    the classifier's real training data has any coverage there.

    Returns a dict with:
      region, region_name, scope, coordinates_provided, in_training_region,
      training_sites_in_region, training_countries, caveat.

    No field here ever scales or adjusts a classification -- this
    function only describes where the recording is and what the
    classifier was actually trained on.
    """
    if training_sites is None:
        training_sites = DEFAULT_TRAINING_SITES

    training_countries = sorted({site['country'] for site in training_sites})
    num_training_sites = len(training_sites)
    countries_text = ', '.join(training_countries) if training_countries else 'no countries'

    lat = _validate_coordinate(lat, -90, 90)
    lon = _validate_coordinate(lon, -180, 180)

    if lat is None or lon is None:
        return {
            'region': 'UNKNOWN',
            'region_name': 'Unknown',
            'scope': None,
            'coordinates_provided': False,
            'in_training_region': False,
            'training_sites_in_region': 0,
            'training_countries': training_countries,
            'caveat': CAVEATS['no_coordinates'].format(
                n=num_training_sites, countries=countries_text
            ),
        }

    # Find all matching regions, then pick the most specific (smallest area)
    # to handle overlapping bounding boxes (e.g. Red Sea within Indian Ocean,
    # Indonesia within the broader Western Indo-Pacific).
    matches = []
    for region_code, bounds in REGION_BOUNDS.items():
        if (bounds['lat_min'] <= lat <= bounds['lat_max'] and
                bounds['lon_min'] <= lon <= bounds['lon_max']):
            area = ((bounds['lat_max'] - bounds['lat_min']) *
                    (bounds['lon_max'] - bounds['lon_min']))
            matches.append((area, region_code, bounds))

    if not matches:
        return {
            'region': 'UNKNOWN',
            'region_name': 'Unknown Region',
            'scope': None,
            'coordinates_provided': True,
            'in_training_region': False,
            'training_sites_in_region': 0,
            'training_countries': training_countries,
            'caveat': CAVEATS['outside_training_region'].format(
                region_name='an unrecognized region', n=num_training_sites,
                countries=countries_text,
            ),
        }

    matches.sort(key=lambda x: x[0])
    _, region_code, bounds = matches[0]
    scope = bounds['scope']

    sites_in_region = [
        s for s in training_sites
        if bounds['lat_min'] <= s['latitude'] <= bounds['lat_max']
        and bounds['lon_min'] <= s['longitude'] <= bounds['lon_max']
    ]
    in_training_region = scope == 'specific' and len(sites_in_region) > 0

    if in_training_region:
        caveat = CAVEATS['in_training_region'].format(
            in_region=len(sites_in_region), n=num_training_sites, countries=countries_text,
        )
    else:
        caveat = CAVEATS['outside_training_region'].format(
            region_name=bounds['name'], n=num_training_sites, countries=countries_text,
        )

    return {
        'region': region_code,
        'region_name': bounds['name'],
        'scope': scope,
        'coordinates_provided': True,
        'in_training_region': in_training_region,
        'training_sites_in_region': len(sites_in_region),
        'training_countries': training_countries,
        'caveat': caveat,
    }


def adjust_classification(classification, region_result):
    """
    Attach an honest region object to a classification. Despite the
    historical name (kept for call-site compatibility), this function
    never adjusts/scales `label`, `confidence` or `probabilities` -- per
    D-12/TRUTH-06 those are returned exactly as the classifier produced
    them.

    Args:
        classification: dict with 'label', 'confidence' and 'probabilities'
        region_result: dict from detect_region()

    Returns:
        A copy of `classification` with an added 'region' key following
        the response contract (legacy `in_training_distribution` and
        `confidence_adjusted` fields are kept for backward compatibility
        with the current production frontend; `confidence_adjusted` is
        always False now).
    """
    adjusted = classification.copy()

    adjusted['region'] = {
        'detected': region_result['region'],
        'name': region_result['region_name'],
        'scope': region_result['scope'],
        'coordinates_provided': region_result['coordinates_provided'],
        'in_training_region': region_result['in_training_region'],
        'training_sites_in_region': region_result['training_sites_in_region'],
        'training_countries': region_result['training_countries'],
        # --- legacy fields, kept for the current production frontend ---
        'in_training_distribution': region_result['in_training_region'],
        'confidence_adjusted': False,
    }

    return adjusted

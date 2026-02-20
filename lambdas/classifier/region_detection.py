"""
Detect biogeographic region from coordinates and apply appropriate
confidence adjustments and caveats.

The model was trained on Indo-Pacific data (MARRS dataset: Indonesia, Kenya,
Australia, Maldives, Mexico). Caribbean, Atlantic, and Red Sea reefs have
fundamentally different soundscapes and are out of distribution.
"""


# Bounding boxes for major reef regions (approximate)
REGION_BOUNDS = {
    'INDO_PACIFIC_WEST': {
        'lat_min': -35, 'lat_max': 30,
        'lon_min': 90, 'lon_max': 180,
        'name': 'Western Indo-Pacific',
        'in_distribution': True
    },
    'INDO_PACIFIC_CENTRAL': {
        'lat_min': -35, 'lat_max': 30,
        'lon_min': -180, 'lon_max': -120,
        'name': 'Central Pacific',
        'in_distribution': True
    },
    'INDIAN_OCEAN': {
        'lat_min': -35, 'lat_max': 30,
        'lon_min': 30, 'lon_max': 90,
        'name': 'Indian Ocean',
        'in_distribution': True
    },
    'CARIBBEAN': {
        'lat_min': 8, 'lat_max': 35,
        'lon_min': -100, 'lon_max': -55,
        'name': 'Caribbean/Western Atlantic',
        'in_distribution': False
    },
    'EASTERN_ATLANTIC': {
        'lat_min': 10, 'lat_max': 35,
        'lon_min': -30, 'lon_max': 0,
        'name': 'Eastern Atlantic',
        'in_distribution': False
    },
    'RED_SEA': {
        'lat_min': 12, 'lat_max': 32,
        'lon_min': 32, 'lon_max': 45,
        'name': 'Red Sea',
        'in_distribution': False
    },
    'EASTERN_PACIFIC': {
        'lat_min': -5, 'lat_max': 25,
        'lon_min': -120, 'lon_max': -75,
        'name': 'Tropical Eastern Pacific',
        'in_distribution': False
    }
}

CAVEATS = {
    'in_distribution': (
        "Classification based on acoustic similarity to reference sites from the "
        "Indo-Pacific region (MARRS dataset). Results represent acoustic profile "
        "similarity, not definitive health diagnosis. Acoustic monitoring "
        "complements but does not replace visual surveys."
    ),
    'out_of_distribution': (
        "GEOGRAPHIC LIMITATION: This recording appears to be from {region_name}, "
        "which is outside the model's training distribution (Indo-Pacific). "
        "The model was trained on Indo-Pacific reef soundscapes and has NOT been "
        "validated for {region_name} reefs. Confidence scores have been reduced. "
        "Results should be interpreted with significant caution."
    ),
    'unknown_region': (
        "No coordinates provided. Classification is based on acoustic similarity "
        "to Indo-Pacific reference sites. If this recording is from outside the "
        "Indo-Pacific region, results may not be ecologically valid."
    )
}


def detect_region(lat, lon):
    """
    Detect biogeographic region from coordinates.

    Returns dict with region info, confidence multiplier, and caveat.
    """
    if lat is None or lon is None:
        return {
            'region': 'UNKNOWN',
            'region_name': 'Unknown',
            'in_training_distribution': False,
            'confidence_multiplier': 0.7,
            'caveat': CAVEATS['unknown_region']
        }

    for region_code, bounds in REGION_BOUNDS.items():
        if (bounds['lat_min'] <= lat <= bounds['lat_max'] and
                bounds['lon_min'] <= lon <= bounds['lon_max']):
            in_dist = bounds['in_distribution']

            if in_dist:
                caveat = CAVEATS['in_distribution']
            else:
                caveat = CAVEATS['out_of_distribution'].format(
                    region_name=bounds['name']
                )

            return {
                'region': region_code,
                'region_name': bounds['name'],
                'in_training_distribution': in_dist,
                'confidence_multiplier': 1.0 if in_dist else 0.6,
                'caveat': caveat
            }

    return {
        'region': 'UNKNOWN',
        'region_name': 'Unknown Region',
        'in_training_distribution': False,
        'confidence_multiplier': 0.7,
        'caveat': CAVEATS['unknown_region']
    }


def adjust_classification(classification, region_result):
    """
    Adjust classification confidence based on region.

    Args:
        classification: dict with 'confidence' and 'probabilities'
        region_result: dict from detect_region()

    Returns:
        Adjusted classification dict with region metadata
    """
    adjusted = classification.copy()
    multiplier = region_result['confidence_multiplier']

    if multiplier < 1.0:
        adjusted['confidence'] = classification['confidence'] * multiplier
        adjusted['probabilities'] = {
            k: v * multiplier for k, v in classification['probabilities'].items()
        }

    adjusted['region'] = {
        'detected': region_result['region'],
        'name': region_result['region_name'],
        'in_training_distribution': region_result['in_training_distribution'],
        'confidence_adjusted': multiplier < 1.0
    }

    return adjusted

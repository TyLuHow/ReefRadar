#!/usr/bin/env python3
"""
Test region detection logic for biogeographic regions.

Verifies that:
- Training regions (Indonesia, Australia, Kenya, Maldives, Mexico) are in-distribution
- Non-training regions (Jamaica, Florida, Red Sea, etc.) are out-of-distribution
- Smallest-area matching correctly resolves overlapping bounding boxes
- Unknown coordinates return appropriate defaults
"""

import sys
from pathlib import Path

# Add classifier to path
sys.path.insert(0, str(Path(__file__).parent.parent / 'lambdas' / 'classifier'))

from region_detection import detect_region

passed = 0
failed = 0


def check(description, condition):
    global passed, failed
    if condition:
        print(f"  PASS: {description}")
        passed += 1
    else:
        print(f"  FAIL: {description}")
        failed += 1


print("=" * 60)
print("Testing in-distribution regions")
print("=" * 60)

# Indonesia (Coral Triangle) - should match INDO_PACIFIC_WEST
result = detect_region(-4.93, 119.32)
check("Indonesia in_training_distribution=True",
      result['in_training_distribution'])
check("Indonesia confidence_multiplier=1.0",
      result['confidence_multiplier'] == 1.0)

# Australia GBR - should match GREAT_BARRIER_REEF (more specific than INDO_PACIFIC_WEST)
result = detect_region(-18.0, 147.0)
check("Australia GBR in_training_distribution=True",
      result['in_training_distribution'])
check("Australia GBR region=GREAT_BARRIER_REEF",
      result['region'] == 'GREAT_BARRIER_REEF')

# Kenya - should match EAST_AFRICA (more specific than INDIAN_OCEAN)
result = detect_region(-2.22, 41.01)
check("Kenya in_training_distribution=True",
      result['in_training_distribution'])
check("Kenya region=EAST_AFRICA",
      result['region'] == 'EAST_AFRICA')

# Maldives - should match MALDIVES (more specific than INDIAN_OCEAN)
result = detect_region(4.17, 73.51)
check("Maldives in_training_distribution=True",
      result['in_training_distribution'])
check("Maldives region=MALDIVES",
      result['region'] == 'MALDIVES')

# Mexico (Mesoamerican Reef) - should match MESOAMERICAN_REEF (more specific than CARIBBEAN)
result = detect_region(20.5, -87.4)
check("Mexico Mesoamerican in_training_distribution=True",
      result['in_training_distribution'])
check("Mexico region=MESOAMERICAN_REEF",
      result['region'] == 'MESOAMERICAN_REEF')

print()
print("=" * 60)
print("Testing out-of-distribution regions")
print("=" * 60)

# Jamaica (Caribbean, NOT Mesoamerican)
result = detect_region(18.1, -77.3)
check("Jamaica in_training_distribution=False",
      not result['in_training_distribution'])
check("Jamaica region=CARIBBEAN",
      result['region'] == 'CARIBBEAN')
check("Jamaica confidence_multiplier=0.6",
      result['confidence_multiplier'] == 0.6)

# Florida Keys (Caribbean)
result = detect_region(24.5, -81.8)
check("Florida Keys in_training_distribution=False",
      not result['in_training_distribution'])
check("Florida Keys region=CARIBBEAN",
      result['region'] == 'CARIBBEAN')

# Red Sea
result = detect_region(25.0, 37.0)
check("Red Sea in_training_distribution=False",
      not result['in_training_distribution'])
check("Red Sea region=RED_SEA",
      result['region'] == 'RED_SEA')

# Eastern Atlantic
result = detect_region(15.0, -17.0)
check("Eastern Atlantic in_training_distribution=False",
      not result['in_training_distribution'])
check("Eastern Atlantic region=EASTERN_ATLANTIC",
      result['region'] == 'EASTERN_ATLANTIC')

print()
print("=" * 60)
print("Testing unknown/null coordinates")
print("=" * 60)

result = detect_region(None, None)
check("Unknown in_training_distribution=False",
      not result['in_training_distribution'])
check("Unknown confidence_multiplier=0.7",
      result['confidence_multiplier'] == 0.7)
check("Unknown region=UNKNOWN",
      result['region'] == 'UNKNOWN')

print()
print("=" * 60)
print("Testing overlap resolution (smallest area wins)")
print("=" * 60)

# Verify Mesoamerican Reef is smaller than Caribbean
from region_detection import REGION_BOUNDS

meso_area = ((REGION_BOUNDS['MESOAMERICAN_REEF']['lat_max'] - REGION_BOUNDS['MESOAMERICAN_REEF']['lat_min']) *
             (REGION_BOUNDS['MESOAMERICAN_REEF']['lon_max'] - REGION_BOUNDS['MESOAMERICAN_REEF']['lon_min']))
carib_area = ((REGION_BOUNDS['CARIBBEAN']['lat_max'] - REGION_BOUNDS['CARIBBEAN']['lat_min']) *
              (REGION_BOUNDS['CARIBBEAN']['lon_max'] - REGION_BOUNDS['CARIBBEAN']['lon_min']))
check(f"Mesoamerican area ({meso_area}) < Caribbean area ({carib_area})",
      meso_area < carib_area)

# Verify East Africa is smaller than Indian Ocean
ea_area = ((REGION_BOUNDS['EAST_AFRICA']['lat_max'] - REGION_BOUNDS['EAST_AFRICA']['lat_min']) *
           (REGION_BOUNDS['EAST_AFRICA']['lon_max'] - REGION_BOUNDS['EAST_AFRICA']['lon_min']))
io_area = ((REGION_BOUNDS['INDIAN_OCEAN']['lat_max'] - REGION_BOUNDS['INDIAN_OCEAN']['lat_min']) *
           (REGION_BOUNDS['INDIAN_OCEAN']['lon_max'] - REGION_BOUNDS['INDIAN_OCEAN']['lon_min']))
check(f"East Africa area ({ea_area}) < Indian Ocean area ({io_area})",
      ea_area < io_area)

# Verify GBR is smaller than INDO_PACIFIC_WEST
gbr_area = ((REGION_BOUNDS['GREAT_BARRIER_REEF']['lat_max'] - REGION_BOUNDS['GREAT_BARRIER_REEF']['lat_min']) *
            (REGION_BOUNDS['GREAT_BARRIER_REEF']['lon_max'] - REGION_BOUNDS['GREAT_BARRIER_REEF']['lon_min']))
ipw_area = ((REGION_BOUNDS['INDO_PACIFIC_WEST']['lat_max'] - REGION_BOUNDS['INDO_PACIFIC_WEST']['lat_min']) *
            (REGION_BOUNDS['INDO_PACIFIC_WEST']['lon_max'] - REGION_BOUNDS['INDO_PACIFIC_WEST']['lon_min']))
check(f"GBR area ({gbr_area}) < Indo-Pacific West area ({ipw_area})",
      gbr_area < ipw_area)

print()
print("=" * 60)
print(f"RESULTS: {passed} passed, {failed} failed")
print("=" * 60)

if failed > 0:
    sys.exit(1)
else:
    print("All tests passed!")

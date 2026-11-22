# Geocoding dataset

City and postal coordinates in this directory are derived from
[GeoNames](https://www.geonames.org/).

License: [Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/)

Attribution: GeoNames (https://www.geonames.org/)

## Files

- `cities.tsv.gz` — GeoNames `cities5000` (populated places with population ≥ 5,000). Columns: `name`, `admin1`, `country` (ISO 3166-1 alpha-2), `lat`, `lng`.
- `postal.tsv.gz` — GeoNames postal dump:
  - Canada: Forward Sortation Area (FSA, first 3 characters of a postal code) centroids
  - United States: 5-digit ZIP centroids
  - India: 3-digit PIN prefixes (centroids of member pincodes), not full 6-digit PINs

No street addresses are included. vPeople geocodes candidates from city / province / postal / country only and never sends home addresses to a third-party geocoder.

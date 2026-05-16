"""
kml_parser.py
Parses KML files exported from GCS tools (Mission Planner, QGroundControl, etc.).
KML is GPS-path only — no telemetry, no events, no battery data.
Extracts: flight path, summary (distance, altitude), minimal telemetry.
"""

import math
from xml.etree import ElementTree as ET
from utils.schema import (
    make_telemetry_sample, make_event,
    make_geojson_linestring, build_parsed_data
)
from utils.anomaly import compute_anomaly_score

MAX_TELEMETRY_SAMPLES = 2000

KML_NS = {
    'kml': 'http://www.opengis.net/kml/2.2',
    'kml22': 'http://earth.google.com/kml/2.2',
    'kml21': 'http://earth.google.com/kml/2.1',
}


def parse(file_path: str) -> dict:
    tree = ET.parse(file_path)
    root = tree.getroot()

    # Detect namespace
    tag = root.tag
    ns = ''
    if '{' in tag:
        ns = tag[tag.index('{'):tag.index('}')+1]

    coords = _extract_coordinates(root, ns)

    if not coords:
        raise ValueError('No coordinates found in KML file')

    # coords = list of (lng, lat, alt)
    gps_records = [{'lng': c[0], 'lat': c[1], 'alt': c[2] if len(c) > 2 else 0} for c in coords]

    # Build minimal time axis (no real timestamps in KML)
    for i, r in enumerate(gps_records):
        r['time'] = float(i)

    # Telemetry (position only)
    step = max(1, len(gps_records) // MAX_TELEMETRY_SAMPLES)
    telemetry = []
    for i in range(0, len(gps_records), step):
        g = gps_records[i]
        telemetry.append(make_telemetry_sample(
            t=g['time'],
            lat=g['lat'], lng=g['lng'], alt=round(g['alt'], 2),
        ))

    flight_path = make_geojson_linestring([[r['lng'], r['lat'], r['alt']] for r in gps_records])

    # Events
    raw_events = [
        make_event('takeoff', None, {'inferred': True}),
        make_event('land', None, {'inferred': True}),
    ]

    alts = [r['alt'] for r in gps_records]
    summary = {
        'maxAltitude': round(max(alts), 2),
        'minAltitude': round(min(alts), 2),
        'avgAltitude': round(sum(alts) / len(alts), 2),
        'totalDistance': round(_total_distance(gps_records), 2),
        'homePoint': {'lat': gps_records[0]['lat'], 'lng': gps_records[0]['lng'], 'alt': gps_records[0]['alt']},
    }

    parser_meta = {'autopilotType': 'unknown', 'logFormat': 'kml'}
    anomaly_score = compute_anomaly_score([], raw_events, summary)

    return build_parsed_data(
        summary=summary, telemetry=telemetry, flight_path=flight_path,
        events=raw_events, alerts=[], flight_modes=[],
        parser_meta=parser_meta, anomaly_score=anomaly_score,
    )


def _extract_coordinates(root, ns: str) -> list:
    """Extract coordinate tuples from any KML LineString or Track."""
    results = []

    # Try LineString coordinates
    for coord_elem in root.iter(f'{ns}coordinates'):
        text = coord_elem.text
        if not text:
            continue
        for point in text.strip().split():
            parts = point.strip().split(',')
            if len(parts) >= 2:
                try:
                    results.append(tuple(float(p) for p in parts))
                except ValueError:
                    continue
        if results:
            return results

    # Try gx:Track coord elements (Google Earth extended)
    for coord_elem in root.iter('{http://www.google.com/kml/ext/2.2}coord'):
        text = coord_elem.text
        if text:
            parts = text.strip().split()
            if len(parts) >= 2:
                try:
                    results.append(tuple(float(p) for p in parts))
                except ValueError:
                    continue

    return results


def _total_distance(records) -> float:
    total = 0.0
    for i in range(1, len(records)):
        total += _haversine(records[i-1]['lat'], records[i-1]['lng'], records[i]['lat'], records[i]['lng'])
    return total


def _haversine(lat1, lng1, lat2, lng2) -> float:
    R = 6371000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = math.sin(math.radians(lat2-lat1)/2)**2 + math.cos(p1)*math.cos(p2)*math.sin(math.radians(lng2-lng1)/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))

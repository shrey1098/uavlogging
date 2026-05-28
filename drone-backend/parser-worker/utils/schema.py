"""
schema.py
Builds a normalised ParsedFlightData dict from raw parser output.
Every parser returns a dict with these keys; missing keys default to safe values.
"""

from datetime import datetime, timezone


def build_parsed_data(
    summary: dict,
    telemetry: list,
    flight_path: dict,
    events: list,
    alerts: list,
    flight_modes: list,
    parser_meta: dict,
    anomaly_score: float = 0.0
) -> dict:
    return {
        'summary': _normalise_summary(summary),
        'telemetry': telemetry,          # list of sample dicts
        'flightPath': flight_path,        # GeoJSON LineString or None
        'events': events,                 # list of event dicts
        'alerts': alerts,                 # list of alert dicts
        'flightModes': flight_modes,      # list of mode dicts
        'parserMeta': parser_meta,
        'anomalyScore': anomaly_score,
    }


def _normalise_summary(s: dict) -> dict:
    return {
        'flightDuration':   s.get('flightDuration', 0),        # seconds
        'actualStart':      s.get('actualStart'),               # datetime or None
        'actualEnd':        s.get('actualEnd'),                 # datetime or None
        'maxAltitude':      s.get('maxAltitude', 0),            # metres
        'minAltitude':      s.get('minAltitude', 0),
        'avgAltitude':      s.get('avgAltitude', 0),
        'maxSpeed':         s.get('maxSpeed', 0),               # m/s
        'avgSpeed':         s.get('avgSpeed', 0),
        'totalDistance':    s.get('totalDistance', 0),          # metres
        'maxVoltage':       s.get('maxVoltage'),
        'minVoltage':       s.get('minVoltage'),
        'avgVoltage':       s.get('avgVoltage'),
        'maxCurrent':       s.get('maxCurrent'),
        'avgCurrent':       s.get('avgCurrent'),
        'gpsLockTime':      s.get('gpsLockTime'),               # seconds to first fix
        'gpsSatCount':      s.get('gpsSatCount'),
        'maxVibration':     s.get('maxVibration'),
        'homePoint':        s.get('homePoint'),                 # {lat, lng, alt}
    }


def make_telemetry_sample(
    t: float,
    lat=None, lng=None, alt=None,
    roll=None, pitch=None, yaw=None,
    speed=None, voltage=None, current=None,
    mode=None
) -> dict:
    return {
        't': t,
        'lat': lat, 'lng': lng, 'alt': alt,
        'roll': roll, 'pitch': pitch, 'yaw': yaw,
        'speed': speed,
        'voltage': voltage,
        'current': current,
        'mode': mode,
    }


def make_event(event_type: str, timestamp=None, data: dict = None) -> dict:
    return {
        'type': event_type,
        'timestamp': timestamp,
        'data': data or {}
    }


def make_alert(alert_type: str, severity: str, timestamp=None, value=None, threshold=None) -> dict:
    return {
        'type': alert_type,
        'severity': severity,    # 'warning' | 'critical'
        'timestamp': timestamp,
        'value': value,
        'threshold': threshold,
    }


def make_flight_mode(mode: str, start_time: float, end_time: float) -> dict:
    return {
        'mode': mode,
        'startTime': start_time,
        'endTime': end_time,
        'duration': round(end_time - start_time, 2) if end_time and start_time else 0
    }


def make_geojson_linestring(coords: list) -> dict:
    """coords: list of [lng, lat, alt]. Requires at least 2 points for valid GeoJSON."""
    if not coords or len(coords) < 2:
        return None
    return {
        'type': 'LineString',
        'coordinates': coords
    }

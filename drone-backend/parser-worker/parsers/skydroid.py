"""
skydroid.py
Parses Skydroid .log files (text-based, CSV-like format used by Skydroid GCS).
Format varies by firmware version — this handles the most common tab/comma-delimited export.
Falls back to generic CSV parsing if structure is unrecognised.
"""

import csv
import math
import io
from datetime import datetime, timezone
from utils.schema import (
    make_telemetry_sample, make_event, make_alert,
    make_flight_mode, make_geojson_linestring, build_parsed_data
)
from utils.anomaly import compute_anomaly_score

MAX_TELEMETRY_SAMPLES = 2000

# Skydroid column name patterns
SKYDROID_COL_MAP = {
    'time':    ['time', 'timestamp', 'time(ms)', 'time_ms'],
    'lat':     ['latitude', 'lat', 'gps_lat'],
    'lng':     ['longitude', 'lon', 'lng', 'gps_lon'],
    'alt':     ['altitude', 'alt', 'height', 'relative_alt'],
    'speed':   ['speed', 'groundspeed', 'h_speed'],
    'roll':    ['roll', 'roll_angle'],
    'pitch':   ['pitch', 'pitch_angle'],
    'yaw':     ['yaw', 'heading', 'compass_heading'],
    'voltage': ['voltage', 'battery_voltage', 'volt'],
    'current': ['current', 'battery_current'],
    'mode':    ['mode', 'flight_mode', 'flightmode'],
    'armed':   ['armed', 'arm_status'],
}


def parse(file_path: str) -> dict:
    rows, delimiter = _read_skydroid(file_path)

    if not rows:
        raise ValueError('Skydroid log file is empty or unreadable')

    headers = list(rows[0].keys())
    col_map = _map_columns(headers)

    gps_records = []
    att_records = []
    bat_records = []
    mode_records = []
    arm_states = []

    for row in rows:
        t = _float(row, col_map, 'time')
        # Skydroid often stores time in ms — normalise to seconds
        if t and t > 1e9:
            t = t / 1000.0

        lat = _float(row, col_map, 'lat')
        lng = _float(row, col_map, 'lng')
        alt = _float(row, col_map, 'alt')
        speed = _float(row, col_map, 'speed')
        roll = _float(row, col_map, 'roll')
        pitch = _float(row, col_map, 'pitch')
        yaw = _float(row, col_map, 'yaw')
        volt = _float(row, col_map, 'voltage')
        curr = _float(row, col_map, 'current')
        mode = _str(row, col_map, 'mode')
        armed = _str(row, col_map, 'armed')

        if lat and lng and abs(lat) > 0.001 and abs(lng) > 0.001:
            gps_records.append({'time': t, 'lat': lat, 'lng': lng, 'alt': alt or 0, 'spd': speed or 0})
        if roll is not None or pitch is not None:
            att_records.append({'time': t, 'roll': roll or 0, 'pitch': pitch or 0, 'yaw': yaw or 0})
        if volt and volt > 2.0:
            bat_records.append({'time': t, 'volt': volt, 'curr': curr})
        if mode and (not mode_records or mode_records[-1]['mode'] != mode):
            mode_records.append({'time': t, 'mode': mode})
        if armed is not None:
            arm_states.append({'time': t, 'armed': armed.lower() in ('1', 'true', 'armed', 'yes')})

    # Arm/disarm events
    raw_events = []
    prev_armed = False
    for s in arm_states:
        if s['armed'] and not prev_armed:
            raw_events.append(make_event('arm', None))
        elif not s['armed'] and prev_armed:
            raw_events.append(make_event('disarm', None))
        prev_armed = s['armed']

    if gps_records:
        raw_events.append(make_event('takeoff', None, {'inferred': True}))
        raw_events.append(make_event('land', None, {'inferred': True}))

    # Alerts
    raw_alerts = []
    volts = [b['volt'] for b in bat_records if b['volt'] > 0]
    if volts:
        min_v, avg_v = min(volts), sum(volts) / len(volts)
        cells = _estimate_cells(max(volts))
        if min_v < 3.5 * cells:
            raw_alerts.append(make_alert('battery_low', 'warning', value=round(min_v, 2)))
        if avg_v > 0 and (avg_v - min_v) / avg_v > 0.10:
            raw_alerts.append(make_alert('voltage_sag', 'warning', value=round(avg_v - min_v, 2)))

    telemetry = _build_telemetry(gps_records, att_records, bat_records)
    coords = [[r['lng'], r['lat'], r['alt']] for r in gps_records]
    flight_path = make_geojson_linestring(coords)

    flight_modes = []
    for i, m in enumerate(mode_records):
        end = mode_records[i+1]['time'] if i+1 < len(mode_records) else (gps_records[-1]['time'] if gps_records else m['time'])
        flight_modes.append(make_flight_mode(m['mode'], m['time'] or 0, end or 0))

    summary = _build_summary(gps_records, bat_records)
    parser_meta = {'autopilotType': 'skydroid', 'logFormat': 'skydroid_log'}
    anomaly_score = compute_anomaly_score(raw_alerts, raw_events, summary)

    return build_parsed_data(
        summary=summary, telemetry=telemetry, flight_path=flight_path,
        events=raw_events, alerts=raw_alerts, flight_modes=flight_modes,
        parser_meta=parser_meta, anomaly_score=anomaly_score,
    )


def _read_skydroid(file_path: str):
    """Try tab then comma delimiter."""
    for delimiter in ['\t', ',', ';']:
        try:
            with open(file_path, newline='', encoding='utf-8-sig') as f:
                reader = csv.DictReader(f, delimiter=delimiter)
                rows = list(reader)
                if rows and len(rows[0]) > 2:
                    return rows, delimiter
        except Exception:
            continue
    return [], ','


def _map_columns(headers):
    lower = {h.lower().strip(): h for h in headers}
    col_map = {}
    for canonical, aliases in SKYDROID_COL_MAP.items():
        for alias in aliases:
            if alias.lower() in lower:
                col_map[canonical] = lower[alias.lower()]
                break
    return col_map


def _float(row, col_map, key):
    col = col_map.get(key)
    if not col:
        return None
    try:
        return float(row.get(col, '') or 0)
    except (ValueError, TypeError):
        return None


def _str(row, col_map, key):
    col = col_map.get(key)
    if not col:
        return None
    return (row.get(col, '') or '').strip() or None


def _estimate_cells(v):
    if v > 22: return 6
    elif v > 16: return 4
    elif v > 11: return 3
    return 2


def _build_summary(gps_records, bat_records) -> dict:
    s = {}
    if gps_records:
        times = [r['time'] for r in gps_records if r['time'] is not None]
        alts = [r['alt'] for r in gps_records]
        spds = [r['spd'] for r in gps_records]
        if times:
            s['flightDuration'] = round(max(times) - min(times))
        s['maxAltitude'] = round(max(alts), 2)
        s['minAltitude'] = round(min(alts), 2)
        s['avgAltitude'] = round(sum(alts) / len(alts), 2)
        s['maxSpeed'] = round(max(spds), 2)
        s['avgSpeed'] = round(sum(spds) / len(spds), 2)
        s['totalDistance'] = round(_total_distance(gps_records), 2)
        s['homePoint'] = {'lat': gps_records[0]['lat'], 'lng': gps_records[0]['lng'], 'alt': gps_records[0]['alt']}
    if bat_records:
        volts = [b['volt'] for b in bat_records if b['volt'] > 0]
        currs = [b['curr'] for b in bat_records if b['curr'] is not None]
        if volts:
            s['maxVoltage'] = round(max(volts), 3)
            s['minVoltage'] = round(min(volts), 3)
            s['avgVoltage'] = round(sum(volts) / len(volts), 3)
        if currs:
            s['maxCurrent'] = round(max(currs), 2)
            s['avgCurrent'] = round(sum(currs) / len(currs), 2)
    return s


def _build_telemetry(gps_records, att_records, bat_records) -> list:
    if not gps_records:
        return []
    step = max(1, len(gps_records) // MAX_TELEMETRY_SAMPLES)
    att_map = {round(r['time'], 1): r for r in att_records if r['time'] is not None}
    bat_map = {round(r['time'], 1): r for r in bat_records if r['time'] is not None}
    samples = []
    for i in range(0, len(gps_records), step):
        g = gps_records[i]
        tk = round(g['time'], 1) if g['time'] is not None else None
        att = att_map.get(tk, {})
        bat = bat_map.get(tk, {})
        samples.append(make_telemetry_sample(
            t=g['time'] or i,
            lat=g['lat'], lng=g['lng'], alt=round(g['alt'], 2),
            roll=round(att.get('roll', 0), 2),
            pitch=round(att.get('pitch', 0), 2),
            yaw=round(att.get('yaw', 0), 2),
            speed=round(g['spd'], 2),
            voltage=bat.get('volt'),
            current=bat.get('curr'),
        ))
    return samples


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

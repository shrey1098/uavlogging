"""
csv_parser.py
Parses generic CSV drone logs.
Attempts to auto-detect column names across common GCS export formats
(Mission Planner CSV, DJI CSV, generic telemetry exports).
"""

import csv
import math
from datetime import datetime, timezone
from utils.schema import (
    make_telemetry_sample, make_event, make_alert,
    make_geojson_linestring, build_parsed_data
)
from utils.anomaly import compute_anomaly_score

MAX_TELEMETRY_SAMPLES = 2000

# Column name aliases — maps canonical name -> possible CSV headers
COL_ALIASES = {
    'time':    ['timestamp', 'time', 'time_s', 'time(s)', 'elapsed', 'time_boot_ms', 'gps_time'],
    'lat':     ['lat', 'latitude', 'gps_lat', 'latitude(deg)'],
    'lng':     ['lng', 'lon', 'longitude', 'gps_lon', 'longitude(deg)'],
    'alt':     ['alt', 'altitude', 'relative_alt', 'alt(m)', 'altitude(m)', 'height'],
    'speed':   ['speed', 'groundspeed', 'spd', 'gps_speed', 'vel_m_s', 'velocity'],
    'roll':    ['roll', 'roll(deg)', 'roll_deg'],
    'pitch':   ['pitch', 'pitch(deg)', 'pitch_deg'],
    'yaw':     ['yaw', 'heading', 'yaw(deg)', 'heading(deg)'],
    'voltage': ['voltage', 'volt', 'battery_voltage', 'vbat', 'voltage_v', 'batt_volt'],
    'current': ['current', 'curr', 'battery_current', 'current_a', 'batt_curr'],
    'mode':    ['mode', 'flightmode', 'flight_mode', 'nav_state'],
}


def parse(file_path: str) -> dict:
    rows = _read_csv(file_path)
    if not rows:
        raise ValueError('CSV file is empty or unreadable')

    headers = list(rows[0].keys())
    col_map = _map_columns(headers)

    gps_records = []
    att_records = []
    bat_records = []
    mode_records = []

    for row in rows:
        t = _float(row, col_map, 'time')
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

        if lat and lng:
            gps_records.append({'time': t, 'lat': lat, 'lng': lng, 'alt': alt or 0, 'spd': speed or 0})
        if roll is not None or pitch is not None or yaw is not None:
            att_records.append({'time': t, 'roll': roll or 0, 'pitch': pitch or 0, 'yaw': yaw or 0})
        if volt and volt > 0:
            bat_records.append({'time': t, 'volt': volt, 'curr': curr})
        if mode:
            if not mode_records or mode_records[-1]['mode'] != mode:
                mode_records.append({'time': t, 'mode': mode})

    raw_events = _infer_events(gps_records, mode_records)
    raw_alerts = _infer_alerts(bat_records)

    telemetry = _build_telemetry(gps_records, att_records, bat_records, mode_records)
    coords = [[r['lng'], r['lat'], r['alt']] for r in gps_records if r['lat'] and r['lng']]
    flight_path = make_geojson_linestring(coords)

    flight_modes = []
    for i, m in enumerate(mode_records):
        end = mode_records[i+1]['time'] if i+1 < len(mode_records) else (gps_records[-1]['time'] if gps_records else m['time'])
        from utils.schema import make_flight_mode
        flight_modes.append(make_flight_mode(m['mode'], m['time'] or 0, end or 0))

    summary = _build_summary(gps_records, bat_records)
    parser_meta = {'autopilotType': 'unknown', 'logFormat': 'csv'}
    anomaly_score = compute_anomaly_score(raw_alerts, raw_events, summary)

    return build_parsed_data(
        summary=summary, telemetry=telemetry, flight_path=flight_path,
        events=raw_events, alerts=raw_alerts, flight_modes=flight_modes,
        parser_meta=parser_meta, anomaly_score=anomaly_score,
    )


def _read_csv(file_path: str) -> list:
    encodings = ['utf-8', 'utf-8-sig', 'latin-1']
    for enc in encodings:
        try:
            with open(file_path, newline='', encoding=enc) as f:
                reader = csv.DictReader(f)
                return [row for row in reader]
        except Exception:
            continue
    return []


def _map_columns(headers: list) -> dict:
    """Returns {canonical_name: actual_csv_header}"""
    lower_headers = {h.lower().strip(): h for h in headers}
    col_map = {}
    for canonical, aliases in COL_ALIASES.items():
        for alias in aliases:
            if alias.lower() in lower_headers:
                col_map[canonical] = lower_headers[alias.lower()]
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
    return row.get(col, '').strip() or None


def _infer_events(gps_records, mode_records) -> list:
    events = []
    if gps_records:
        events.append(make_event('takeoff', None, {'inferred': True}))
        events.append(make_event('land', None, {'inferred': True}))
    for m in mode_records:
        if m['mode'].upper() in ('RTL', 'AUTO_RTL'):
            events.append(make_event('rtl', None, {'mode': m['mode']}))
    return events


def _infer_alerts(bat_records) -> list:
    alerts = []
    volts = [b['volt'] for b in bat_records if b['volt'] and b['volt'] > 0]
    if volts:
        min_v, avg_v = min(volts), sum(volts) / len(volts)
        cells = _estimate_cells(max(volts))
        if min_v < 3.5 * cells:
            alerts.append(make_alert('battery_low', 'warning', value=round(min_v, 2)))
        if avg_v > 0 and (avg_v - min_v) / avg_v > 0.10:
            alerts.append(make_alert('voltage_sag', 'warning', value=round(avg_v - min_v, 2)))
    return alerts


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
        volts = [b['volt'] for b in bat_records if b['volt'] and b['volt'] > 0]
        currs = [b['curr'] for b in bat_records if b['curr'] is not None and b['curr'] >= 0]
        if volts:
            s['maxVoltage'] = round(max(volts), 3)
            s['minVoltage'] = round(min(volts), 3)
            s['avgVoltage'] = round(sum(volts) / len(volts), 3)
        if currs:
            s['maxCurrent'] = round(max(currs), 2)
            s['avgCurrent'] = round(sum(currs) / len(currs), 2)
    return s


def _build_telemetry(gps_records, att_records, bat_records, mode_records) -> list:
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


def _estimate_cells(v):
    if v > 22: return 6
    elif v > 16: return 4
    elif v > 11: return 3
    return 2

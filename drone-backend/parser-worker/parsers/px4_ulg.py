"""
px4_ulg.py
Parses PX4 .ULG (ULog) binary logs using pyulog.
"""

import math
from datetime import datetime, timezone
from pyulog import ULog
from utils.schema import (
    make_telemetry_sample, make_event, make_alert,
    make_flight_mode, make_geojson_linestring, build_parsed_data
)
from utils.anomaly import compute_anomaly_score

MAX_TELEMETRY_SAMPLES = 2000

PX4_NAV_STATES = {
    0: 'MANUAL', 1: 'ALTCTL', 2: 'POSCTL', 3: 'AUTO_MISSION',
    4: 'AUTO_LOITER', 5: 'AUTO_RTL', 10: 'ACRO', 12: 'DESCEND',
    13: 'TERMINATION', 14: 'OFFBOARD', 15: 'STAB', 17: 'AUTO_TAKEOFF',
    18: 'AUTO_LAND', 19: 'AUTO_FOLLOW_TARGET', 20: 'AUTO_PRECLAND',
}


def parse(file_path: str) -> dict:
    ulog = ULog(file_path, disable_str_exceptions=True)

    gps_records = _extract_topic(ulog, 'vehicle_gps_position', ['timestamp', 'lat', 'lon', 'alt', 'vel_m_s', 'satellites_used', 'fix_type'])
    att_records = _extract_topic(ulog, 'vehicle_attitude', ['timestamp', 'q'])
    bat_records = _extract_topic(ulog, 'battery_status', ['timestamp', 'voltage_v', 'current_a'])
    vibe_records = _extract_topic(ulog, 'sensor_accel', ['timestamp', 'x', 'y', 'z'])
    nav_records = _extract_topic(ulog, 'vehicle_status', ['timestamp', 'nav_state'])

    raw_events = []
    raw_alerts = []

    # Arm/disarm events
    arm_records = _extract_topic(ulog, 'actuator_armed', ['timestamp', 'armed'])
    prev_armed = False
    for r in arm_records:
        armed = bool(r.get('armed'))
        if armed and not prev_armed:
            raw_events.append(make_event('arm', _dt(r['timestamp'])))
        elif not armed and prev_armed:
            raw_events.append(make_event('disarm', _dt(r['timestamp'])))
        prev_armed = armed

    # Takeoff / land from nav state transitions
    prev_nav = None
    for r in nav_records:
        ns = r.get('nav_state')
        if ns == 17 and prev_nav != 17:
            raw_events.append(make_event('takeoff', _dt(r['timestamp'])))
        elif ns == 18 and prev_nav != 18:
            raw_events.append(make_event('land', _dt(r['timestamp'])))
        elif ns == 5 and prev_nav != 5:
            raw_events.append(make_event('rtl', _dt(r['timestamp'])))
        prev_nav = ns

    # Failsafe
    fs_records = _extract_topic(ulog, 'vehicle_status', ['timestamp', 'failsafe'])
    prev_fs = False
    for r in fs_records:
        fs = bool(r.get('failsafe'))
        if fs and not prev_fs:
            raw_events.append(make_event('failsafe', _dt(r['timestamp'])))
            raw_alerts.append(make_alert('failsafe', 'critical', _dt(r['timestamp'])))
        prev_fs = fs

    # Vibration alerts
    if vibe_records:
        mags = [math.sqrt(r.get('x', 0)**2 + r.get('y', 0)**2 + r.get('z', 0)**2) for r in vibe_records]
        max_vibe = max(mags)
        if max_vibe > 60:
            raw_alerts.append(make_alert('high_vibration', 'critical', value=round(max_vibe, 2), threshold=60))
        elif max_vibe > 30:
            raw_alerts.append(make_alert('high_vibration', 'warning', value=round(max_vibe, 2), threshold=30))

    # Battery alerts
    volts = [r['voltage_v'] for r in bat_records if r.get('voltage_v', 0) > 0]
    if volts:
        min_v, avg_v = min(volts), sum(volts) / len(volts)
        cells = _estimate_cells(max(volts))
        if min_v < 3.5 * cells:
            raw_alerts.append(make_alert('battery_low', 'warning', value=round(min_v, 2)))
        if avg_v > 0 and (avg_v - min_v) / avg_v > 0.10:
            raw_alerts.append(make_alert('voltage_sag', 'warning', value=round(avg_v - min_v, 2)))

    # GPS filter — fix_type >= 3
    gps_records = [r for r in gps_records if r.get('fix_type', 0) >= 3]

    # Convert GPS lat/lon from 1e7 degrees
    for r in gps_records:
        r['lat'] = r['lat'] / 1e7
        r['lon'] = r['lon'] / 1e7
        r['alt'] = r['alt'] / 1000.0  # mm -> m

    telemetry = _build_telemetry(gps_records, att_records, bat_records)
    coords = [[r['lon'], r['lat'], r['alt']] for r in gps_records]
    flight_path = make_geojson_linestring(coords)

    # Flight modes
    flight_modes = []
    for i, r in enumerate(nav_records):
        mode_name = PX4_NAV_STATES.get(r.get('nav_state'), f"STATE_{r.get('nav_state')}")
        end_ts = nav_records[i+1]['timestamp'] if i+1 < len(nav_records) else r['timestamp']
        flight_modes.append(make_flight_mode(mode_name, r['timestamp'] / 1e6, end_ts / 1e6))

    summary = _build_summary(gps_records, bat_records, vibe_records)

    # Parser meta from ULog info
    fw_version = ulog.msg_info_dict.get('sys_version', 'unknown')
    hw_version = ulog.msg_info_dict.get('sys_hw', 'unknown')
    parser_meta = {
        'autopilotType': 'px4',
        'logFormat': 'ulg',
        'firmwareVersion': fw_version,
        'hardwareId': hw_version,
    }

    anomaly_score = compute_anomaly_score(raw_alerts, raw_events, summary)

    return build_parsed_data(
        summary=summary, telemetry=telemetry, flight_path=flight_path,
        events=raw_events, alerts=raw_alerts, flight_modes=flight_modes,
        parser_meta=parser_meta, anomaly_score=anomaly_score,
    )


def _extract_topic(ulog, topic_name, fields) -> list:
    try:
        data = ulog.get_dataset(topic_name)
        records = []
        length = len(data.data.get(fields[0], []))
        for i in range(length):
            r = {}
            for f in fields:
                val = data.data.get(f)
                r[f] = val[i] if val is not None and i < len(val) else None
            records.append(r)
        return records
    except Exception:
        return []


def _dt(timestamp_us):
    if timestamp_us is None:
        return None
    return datetime.fromtimestamp(timestamp_us / 1e6, tz=timezone.utc)


def _estimate_cells(v):
    if v > 22: return 6
    elif v > 16: return 4
    elif v > 11: return 3
    return 2


def _build_summary(gps_records, bat_records, vibe_records) -> dict:
    s = {}
    if gps_records:
        times = [r['timestamp'] / 1e6 for r in gps_records if r.get('timestamp')]
        alts = [r['alt'] for r in gps_records]
        spds = [r.get('vel_m_s', 0) or 0 for r in gps_records]
        if times:
            s['actualStart'] = datetime.fromtimestamp(min(times), tz=timezone.utc)
            s['actualEnd'] = datetime.fromtimestamp(max(times), tz=timezone.utc)
            s['flightDuration'] = round(max(times) - min(times))
        s['maxAltitude'] = round(max(alts), 2)
        s['minAltitude'] = round(min(alts), 2)
        s['avgAltitude'] = round(sum(alts) / len(alts), 2)
        s['maxSpeed'] = round(max(spds), 2)
        s['avgSpeed'] = round(sum(spds) / len(spds), 2)
        s['totalDistance'] = round(_total_distance(gps_records), 2)
        s['homePoint'] = {'lat': gps_records[0]['lat'], 'lng': gps_records[0]['lon'], 'alt': gps_records[0]['alt']}
        sats = [r.get('satellites_used', 0) or 0 for r in gps_records]
        s['gpsSatCount'] = round(sum(sats) / len(sats), 1)
    if bat_records:
        volts = [r['voltage_v'] for r in bat_records if r.get('voltage_v', 0) > 0]
        currs = [r['current_a'] for r in bat_records if r.get('current_a', 0) >= 0]
        if volts:
            s['maxVoltage'] = round(max(volts), 3)
            s['minVoltage'] = round(min(volts), 3)
            s['avgVoltage'] = round(sum(volts) / len(volts), 3)
        if currs:
            s['maxCurrent'] = round(max(currs), 2)
            s['avgCurrent'] = round(sum(currs) / len(currs), 2)
    if vibe_records:
        mags = [math.sqrt(r.get('x', 0)**2 + r.get('y', 0)**2 + r.get('z', 0)**2) for r in vibe_records]
        s['maxVibration'] = round(max(mags), 2)
    return s


def _build_telemetry(gps_records, att_records, bat_records) -> list:
    if not gps_records:
        return []
    step = max(1, len(gps_records) // MAX_TELEMETRY_SAMPLES)
    bat_map = {round(r['timestamp'] / 1e6, 0): r for r in bat_records if r.get('timestamp')}
    samples = []
    for i in range(0, len(gps_records), step):
        g = gps_records[i]
        ts = g.get('timestamp', 0) / 1e6
        bat = bat_map.get(round(ts, 0), {})
        samples.append(make_telemetry_sample(
            t=round(ts, 2),
            lat=g['lat'], lng=g['lon'], alt=round(g['alt'], 2),
            speed=round(g.get('vel_m_s', 0) or 0, 2),
            voltage=bat.get('voltage_v'),
            current=bat.get('current_a'),
        ))
    return samples


def _total_distance(records) -> float:
    total = 0.0
    for i in range(1, len(records)):
        total += _haversine(records[i-1]['lat'], records[i-1]['lon'], records[i]['lat'], records[i]['lon'])
    return total


def _haversine(lat1, lng1, lat2, lng2) -> float:
    R = 6371000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = math.sin(math.radians(lat2-lat1)/2)**2 + math.cos(p1)*math.cos(p2)*math.sin(math.radians(lng2-lng1)/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))

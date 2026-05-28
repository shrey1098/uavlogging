"""
ardupilot_tlog.py
Parses ArduPilot .TLOG (MAVLink telemetry) logs using pymavlink.
TLOGs are GCS-side recordings of MAVLink traffic — less complete than BIN.
"""

import math
from datetime import datetime, timezone
from pymavlink import mavutil
from utils.schema import (
    make_telemetry_sample, make_event, make_alert,
    make_flight_mode, make_geojson_linestring, build_parsed_data
)
from utils.anomaly import compute_anomaly_score

MAX_TELEMETRY_SAMPLES = 2000

COPTER_MODES = {
    0: 'STABILIZE', 2: 'ALT_HOLD', 3: 'AUTO', 4: 'GUIDED',
    5: 'LOITER', 6: 'RTL', 9: 'LAND', 16: 'POSHOLD', 21: 'SMART_RTL',
}


def parse(file_path: str) -> dict:
    mlog = mavutil.mavlink_connection(file_path, dialect='ardupilotmega', robust_parsing=True)

    gps_records = []
    att_records = []
    bat_records = []
    mode_records = []
    raw_events = []
    raw_alerts = []

    prev_armed = False

    while True:
        try:
            msg = mlog.recv_match(blocking=False)
            if msg is None:
                break
            msg_type = msg.get_type()
            ts = getattr(msg, '_timestamp', None)

            if msg_type == 'GLOBAL_POSITION_INT':
                lat = msg.lat / 1e7
                lng = msg.lon / 1e7
                if lat == 0.0 and lng == 0.0:
                    continue
                if not (-90 <= lat <= 90) or not (-180 <= lng <= 180):
                    continue
                gps_records.append({
                    'time': ts,
                    'lat': lat,
                    'lng': lng,
                    'alt': msg.relative_alt / 1000.0,
                    'spd': math.sqrt((msg.vx**2 + msg.vy**2)) / 100.0,
                })

            elif msg_type == 'ATTITUDE':
                att_records.append({
                    'time': ts,
                    'roll': math.degrees(msg.roll),
                    'pitch': math.degrees(msg.pitch),
                    'yaw': math.degrees(msg.yaw),
                })

            elif msg_type == 'SYS_STATUS':
                volt = msg.voltage_battery / 1000.0
                curr = msg.current_battery / 100.0
                if volt > 0:
                    bat_records.append({'time': ts, 'volt': volt, 'curr': curr})

            elif msg_type == 'HEARTBEAT':
                armed = bool(msg.base_mode & mavutil.mavlink.MAV_MODE_FLAG_SAFETY_ARMED)
                if armed and not prev_armed:
                    raw_events.append(make_event('arm', _dt(ts)))
                elif not armed and prev_armed:
                    raw_events.append(make_event('disarm', _dt(ts)))
                prev_armed = armed

                if hasattr(msg, 'custom_mode'):
                    mode_name = COPTER_MODES.get(msg.custom_mode, f'MODE_{msg.custom_mode}')
                    if not mode_records or mode_records[-1]['mode'] != mode_name:
                        mode_records.append({'time': ts, 'mode': mode_name})

            elif msg_type == 'STATUSTEXT':
                text = msg.text.lower()
                if 'land' in text:
                    raw_events.append(make_event('land', _dt(ts), {'text': msg.text}))
                elif 'takeoff' in text or 'take off' in text:
                    raw_events.append(make_event('takeoff', _dt(ts), {'text': msg.text}))
                elif 'rtl' in text:
                    raw_events.append(make_event('rtl', _dt(ts), {'text': msg.text}))
                elif 'failsafe' in text:
                    raw_events.append(make_event('failsafe', _dt(ts), {'text': msg.text}))
                    raw_alerts.append(make_alert('failsafe', 'critical', _dt(ts)))
                elif 'ekf' in text and 'variance' in text:
                    raw_events.append(make_event('ekf_error', _dt(ts), {'text': msg.text}))
                    raw_alerts.append(make_alert('ekf_variance', 'critical', _dt(ts)))
                elif 'crash' in text:
                    raw_events.append(make_event('crash_detected', _dt(ts), {'text': msg.text}))
                    raw_alerts.append(make_alert('crash_detected', 'critical', _dt(ts)))

        except Exception:
            continue

    # Battery alerts
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
        end = mode_records[i + 1]['time'] if i + 1 < len(mode_records) else (gps_records[-1]['time'] if gps_records else m['time'])
        flight_modes.append(make_flight_mode(m['mode'], m['time'], end))

    summary = _build_summary(gps_records, bat_records, raw_events)
    parser_meta = {'autopilotType': 'ardupilot', 'logFormat': 'tlog'}
    anomaly_score = compute_anomaly_score(raw_alerts, raw_events, summary)

    return build_parsed_data(
        summary=summary, telemetry=telemetry, flight_path=flight_path,
        events=raw_events, alerts=raw_alerts, flight_modes=flight_modes,
        parser_meta=parser_meta, anomaly_score=anomaly_score,
    )


def _dt(ts):
    if ts is None:
        return None
    return datetime.fromtimestamp(ts, tz=timezone.utc)


def _estimate_cells(max_volt):
    if max_volt > 22: return 6
    elif max_volt > 16: return 4
    elif max_volt > 11: return 3
    return 2


def _build_summary(gps_records, bat_records, events) -> dict:
    s = {}
    if gps_records:
        times = [r['time'] for r in gps_records if r['time']]
        alts = [r['alt'] for r in gps_records]
        spds = [r['spd'] for r in gps_records]
        if times:
            s['actualStart'] = _dt(min(times))
            s['actualEnd'] = _dt(max(times))
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
        currs = [b['curr'] for b in bat_records if b['curr'] and b['curr'] >= 0]
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
    att_map = {round(r['time'], 0): r for r in att_records if r['time']}
    bat_map = {round(r['time'], 0): r for r in bat_records if r['time']}
    samples = []
    for i in range(0, len(gps_records), step):
        g = gps_records[i]
        if not g['time']:
            continue
        tk = round(g['time'], 0)
        att = att_map.get(tk, {})
        bat = bat_map.get(tk, {})
        samples.append(make_telemetry_sample(
            t=round(g['time'], 2),
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

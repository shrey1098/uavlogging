"""
ardupilot_bin.py
Parses ArduPilot .BIN (DataFlash) binary logs using pymavlink.
Extracts: telemetry, flight path, events, alerts, flight modes, summary.
"""

import math
from datetime import datetime, timezone
from pymavlink import mavutil
from utils.schema import (
    make_telemetry_sample, make_event, make_alert,
    make_flight_mode, make_geojson_linestring, build_parsed_data
)
from utils.anomaly import compute_anomaly_score

# Downsample telemetry to max N samples
MAX_TELEMETRY_SAMPLES = 2000

FLIGHT_MODES_COPTER = {
    0: 'STABILIZE', 1: 'ACRO', 2: 'ALT_HOLD', 3: 'AUTO',
    4: 'GUIDED', 5: 'LOITER', 6: 'RTL', 7: 'CIRCLE',
    9: 'LAND', 11: 'DRIFT', 13: 'SPORT', 14: 'FLIP',
    15: 'AUTOTUNE', 16: 'POSHOLD', 17: 'BRAKE', 18: 'THROW',
    19: 'AVOID_ADSB', 20: 'GUIDED_NOGPS', 21: 'SMART_RTL',
}


def parse(file_path: str) -> dict:
    mlog = mavutil.mavlink_connection(file_path, dialect='ardupilotmega', robust_parsing=True)

    # Raw accumulators
    gps_records = []
    att_records = []
    bat_records = []
    vibe_records = []
    mode_records = []
    raw_events = []
    raw_alerts = []

    while True:
        try:
            msg = mlog.recv_match(blocking=False)
            if msg is None:
                break
            msg_type = msg.get_type()

            if msg_type == 'GPS':
                if msg.Status >= 3:  # 3D fix
                    gps_records.append({
                        'time': msg.TimeUS / 1e6,
                        'lat': msg.Lat,
                        'lng': msg.Lng,
                        'alt': msg.Alt,
                        'spd': msg.Spd,
                        'nsats': msg.NSats,
                    })

            elif msg_type == 'ATT':
                att_records.append({
                    'time': msg.TimeUS / 1e6,
                    'roll': msg.Roll,
                    'pitch': msg.Pitch,
                    'yaw': msg.Yaw,
                })

            elif msg_type == 'BAT' or msg_type == 'CURR':
                volt = getattr(msg, 'Volt', None) or getattr(msg, 'Volt', None)
                curr = getattr(msg, 'Curr', None)
                t = msg.TimeUS / 1e6
                if volt is not None:
                    bat_records.append({'time': t, 'volt': volt, 'curr': curr})

            elif msg_type == 'VIBE':
                vibe_records.append({
                    'time': msg.TimeUS / 1e6,
                    'vx': msg.VibeX,
                    'vy': msg.VibeY,
                    'vz': msg.VibeZ,
                })

            elif msg_type == 'MODE':
                mode_name = FLIGHT_MODES_COPTER.get(msg.Mode, f'MODE_{msg.Mode}')
                mode_records.append({'time': msg.TimeUS / 1e6, 'mode': mode_name})

            elif msg_type == 'EV':
                ev_id = msg.Id
                if ev_id == 10:
                    raw_events.append(make_event('arm', _ts(msg.TimeUS)))
                elif ev_id == 11:
                    raw_events.append(make_event('disarm', _ts(msg.TimeUS)))
                elif ev_id == 15:
                    raw_events.append(make_event('takeoff', _ts(msg.TimeUS)))
                elif ev_id == 17:
                    raw_events.append(make_event('land', _ts(msg.TimeUS)))

            elif msg_type == 'ERR':
                subsys = msg.Subsys
                ecode = msg.ECode
                if subsys == 2 and ecode != 0:
                    raw_events.append(make_event('compass_error', _ts(msg.TimeUS), {'code': ecode}))
                elif subsys == 3 and ecode != 0:
                    raw_events.append(make_event('optical_flow_error', _ts(msg.TimeUS), {'code': ecode}))
                elif subsys == 4 and ecode != 0:
                    raw_events.append(make_event('ekf_error', _ts(msg.TimeUS), {'code': ecode}))
                    raw_alerts.append(make_alert('ekf_variance', 'critical', _ts(msg.TimeUS)))
                elif subsys == 8 and ecode != 0:
                    raw_events.append(make_event('failsafe', _ts(msg.TimeUS), {'subsys': subsys, 'code': ecode}))
                    raw_alerts.append(make_alert('failsafe', 'critical', _ts(msg.TimeUS)))
                elif subsys == 24 and ecode != 0:
                    raw_events.append(make_event('crash_detected', _ts(msg.TimeUS)))
                    raw_alerts.append(make_alert('crash_detected', 'critical', _ts(msg.TimeUS)))

        except Exception:
            continue

    # ── Vibration alerts ──
    for v in vibe_records:
        mag = math.sqrt(v['vx']**2 + v['vy']**2 + v['vz']**2)
        if mag > 60:
            raw_alerts.append(make_alert('high_vibration', 'critical', value=round(mag, 2), threshold=60))
            break
        elif mag > 30:
            raw_alerts.append(make_alert('high_vibration', 'warning', value=round(mag, 2), threshold=30))
            break

    # ── Battery alerts ──
    volts = [b['volt'] for b in bat_records if b['volt']]
    if volts:
        min_v = min(volts)
        avg_v = sum(volts) / len(volts)
        if min_v < 3.5 * _estimate_cell_count(max(volts)):
            raw_alerts.append(make_alert('battery_low', 'warning', value=round(min_v, 2)))
        sag = avg_v - min_v
        if avg_v > 0 and sag / avg_v > 0.10:
            raw_alerts.append(make_alert('voltage_sag', 'warning', value=round(sag, 2)))

    # ── GPS alerts ──
    if gps_records:
        avg_sats = sum(r['nsats'] for r in gps_records) / len(gps_records)
        if avg_sats < 6:
            raw_alerts.append(make_alert('gps_glitch', 'warning', value=round(avg_sats, 1), threshold=6))

    # ── Build telemetry (downsampled) ──
    telemetry = _build_telemetry(gps_records, att_records, bat_records)

    # ── Flight path ──
    coords = [[r['lng'], r['lat'], r['alt']] for r in gps_records if r['lat'] and r['lng']]
    flight_path = make_geojson_linestring(coords)

    # ── Flight modes timeline ──
    flight_modes = []
    for i, m in enumerate(mode_records):
        end = mode_records[i + 1]['time'] if i + 1 < len(mode_records) else (gps_records[-1]['time'] if gps_records else m['time'])
        flight_modes.append(make_flight_mode(m['mode'], m['time'], end))

    # ── Summary ──
    summary = _build_summary(gps_records, bat_records, vibe_records, raw_events)

    # ── Parser meta ──
    parser_meta = {
        'autopilotType': 'ardupilot',
        'logFormat': 'bin',
    }

    anomaly_score = compute_anomaly_score(raw_alerts, raw_events, summary)

    return build_parsed_data(
        summary=summary,
        telemetry=telemetry,
        flight_path=flight_path,
        events=raw_events,
        alerts=raw_alerts,
        flight_modes=flight_modes,
        parser_meta=parser_meta,
        anomaly_score=anomaly_score,
    )


def _ts(time_us: int):
    return datetime.fromtimestamp(time_us / 1e6, tz=timezone.utc)


def _estimate_cell_count(max_volt: float) -> int:
    if max_volt > 22:
        return 6
    elif max_volt > 16:
        return 4
    elif max_volt > 11:
        return 3
    return 2


def _build_summary(gps_records, bat_records, vibe_records, events) -> dict:
    summary = {}

    if gps_records:
        times = [r['time'] for r in gps_records]
        alts = [r['alt'] for r in gps_records]
        spds = [r['spd'] for r in gps_records]
        summary['actualStart'] = datetime.fromtimestamp(times[0], tz=timezone.utc)
        summary['actualEnd'] = datetime.fromtimestamp(times[-1], tz=timezone.utc)
        summary['flightDuration'] = round(times[-1] - times[0])
        summary['maxAltitude'] = round(max(alts), 2)
        summary['minAltitude'] = round(min(alts), 2)
        summary['avgAltitude'] = round(sum(alts) / len(alts), 2)
        summary['maxSpeed'] = round(max(spds), 2)
        summary['avgSpeed'] = round(sum(spds) / len(spds), 2)
        summary['totalDistance'] = round(_total_distance(gps_records), 2)
        summary['homePoint'] = {'lat': gps_records[0]['lat'], 'lng': gps_records[0]['lng'], 'alt': gps_records[0]['alt']}
        summary['gpsSatCount'] = round(sum(r['nsats'] for r in gps_records) / len(gps_records), 1)

    if bat_records:
        volts = [b['volt'] for b in bat_records if b['volt']]
        currs = [b['curr'] for b in bat_records if b['curr']]
        if volts:
            summary['maxVoltage'] = round(max(volts), 3)
            summary['minVoltage'] = round(min(volts), 3)
            summary['avgVoltage'] = round(sum(volts) / len(volts), 3)
        if currs:
            summary['maxCurrent'] = round(max(currs), 2)
            summary['avgCurrent'] = round(sum(currs) / len(currs), 2)

    if vibe_records:
        mags = [math.sqrt(v['vx']**2 + v['vy']**2 + v['vz']**2) for v in vibe_records]
        summary['maxVibration'] = round(max(mags), 2)

    return summary


def _build_telemetry(gps_records, att_records, bat_records) -> list:
    if not gps_records:
        return []

    step = max(1, len(gps_records) // MAX_TELEMETRY_SAMPLES)
    samples = []

    att_map = {round(r['time'], 1): r for r in att_records}
    bat_map = {round(r['time'], 1): r for r in bat_records}

    for i in range(0, len(gps_records), step):
        g = gps_records[i]
        t_key = round(g['time'], 1)
        att = att_map.get(t_key, {})
        bat = bat_map.get(t_key, {})

        samples.append(make_telemetry_sample(
            t=round(g['time'], 2),
            lat=g['lat'], lng=g['lng'], alt=round(g['alt'], 2),
            roll=round(att.get('roll', 0), 2),
            pitch=round(att.get('pitch', 0), 2),
            yaw=round(att.get('yaw', 0), 2),
            speed=round(g['spd'], 2),
            voltage=bat.get('volt'),
            current=bat.get('curr'),
            mode=None,
        ))

    return samples


def _total_distance(gps_records) -> float:
    total = 0.0
    for i in range(1, len(gps_records)):
        total += _haversine(
            gps_records[i - 1]['lat'], gps_records[i - 1]['lng'],
            gps_records[i]['lat'], gps_records[i]['lng']
        )
    return total


def _haversine(lat1, lng1, lat2, lng2) -> float:
    R = 6371000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

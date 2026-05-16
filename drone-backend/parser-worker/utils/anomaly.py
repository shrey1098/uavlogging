"""
anomaly.py
Computes a 0-100 anomaly score from parsed flight data.
Higher = more anomalous / concerning flight.
Used for operator performance tracking over time.
"""


ALERT_WEIGHTS = {
    'high_vibration':    10,
    'voltage_sag':       15,
    'gps_glitch':        12,
    'ekf_variance':      20,
    'motor_imbalance':   10,
    'battery_low':       10,
    'crash_detected':    40,
    'failsafe':          25,
    'fence_breach':      20,
    'ekf_error':         20,
}

EVENT_WEIGHTS = {
    'failsafe':          20,
    'crash_detected':    40,
    'fence_breach':      15,
    'ekf_error':         15,
}


def compute_anomaly_score(alerts: list, events: list, summary: dict) -> float:
    score = 0.0

    # Alert contributions
    for alert in alerts:
        alert_type = alert.get('type', '')
        weight = ALERT_WEIGHTS.get(alert_type, 5)
        if alert.get('severity') == 'critical':
            weight *= 1.5
        score += weight

    # Event contributions
    for event in events:
        event_type = event.get('type', '')
        weight = EVENT_WEIGHTS.get(event_type, 0)
        score += weight

    # Voltage sag depth bonus
    min_v = summary.get('minVoltage')
    avg_v = summary.get('avgVoltage')
    if min_v and avg_v and avg_v > 0:
        sag_ratio = (avg_v - min_v) / avg_v
        if sag_ratio > 0.15:
            score += 10
        elif sag_ratio > 0.10:
            score += 5

    # GPS quality penalty
    sat_count = summary.get('gpsSatCount')
    if sat_count is not None and sat_count < 6:
        score += 10

    return min(round(score, 1), 100.0)

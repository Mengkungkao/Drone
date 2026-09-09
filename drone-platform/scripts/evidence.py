"""Evaluate recorded PX4 positions; this alone cannot verify integration PASS."""
import csv
import math


def analyze(path, target=5.0, tolerance=0.5, max_drift=1.0, hover_seconds=10.0):
    with open(path, newline='', encoding='utf-8') as stream:
        rows = list(csv.DictReader(stream))
    if not rows:
        raise ValueError('no telemetry samples')
    for row in rows:
        for key in ('elapsed_s', 'x', 'y', 'z', 'altitude_m'):
            row[key] = float(row[key])
            if not math.isfinite(row[key]):
                raise ValueError(f'non-finite telemetry: {key}')
        if row['elapsed_s'] < 0:
            raise ValueError('negative elapsed time')
        if not math.isclose(row['altitude_m'], -row['z'], abs_tol=0.001):
            raise ValueError('altitude must equal -z for PX4 NED telemetry')
    if any(b['elapsed_s'] <= a['elapsed_s'] for a, b in zip(rows, rows[1:])):
        raise ValueError('telemetry elapsed time must increase')
    takeoff = [r for r in rows if r['flight_state'] == 'TAKEOFF']
    hover = [r for r in rows if r['flight_state'] == 'HOLD']
    landing = [r for r in rows if r['flight_state'] in ('LAND', 'LANDED')]
    landed = [r for r in rows if r['flight_state'] == 'LANDED']
    reached = next((r for r in takeoff + hover if abs(r['altitude_m'] - target) <= tolerance), None)
    touchdown = next((r for r in landing if r['altitude_m'] <= 0.3), None)
    disarmed = next((r for r in landing if touchdown and r['elapsed_s'] >= touchdown['elapsed_s'] and r['armed'] == 'false'), None)
    duration = hover[-1]['elapsed_s'] - hover[0]['elapsed_s'] if len(hover) > 1 else 0.0
    drift = max((math.hypot(r['x'] - hover[0]['x'], r['y'] - hover[0]['y']) for r in hover), default=math.inf)
    time_to_target = reached['elapsed_s'] - takeoff[0]['elapsed_s'] if reached and takeoff else None
    landing_duration = touchdown['elapsed_s'] - landing[0]['elapsed_s'] if touchdown else None
    disarm_delay = disarmed['elapsed_s'] - touchdown['elapsed_s'] if disarmed else None
    result = {
        'samples': len(rows), 'max_altitude_m': max(r['altitude_m'] for r in rows),
        'hover_min_m': min((r['altitude_m'] for r in hover), default=math.nan),
        'hover_max_m': max((r['altitude_m'] for r in hover), default=math.nan),
        'hover_mean_m': sum(r['altitude_m'] for r in hover) / len(hover) if hover else math.nan,
        'max_hover_drift_m': drift, 'hover_duration_s': duration,
        'time_to_target_s': time_to_target,
        'landing_time_s': touchdown['elapsed_s'] if touchdown else None,
        'landing_duration_s': landing_duration, 'disarm_delay_s': disarm_delay,
        'total_mission_time_s': rows[-1]['elapsed_s'],
    }
    checks = {
        'target_reached': reached is not None,
        'takeoff_duration': time_to_target is not None and 0 <= time_to_target <= 30,
        'hover_duration': duration >= hover_seconds,
        'hover_altitude': bool(hover) and all(abs(r['altitude_m'] - target) <= tolerance for r in hover),
        'horizontal_drift': drift < max_drift,
        'landed': bool(landed) and landed[-1]['altitude_m'] <= 0.3,
        'landing_duration': landing_duration is not None and 0 <= landing_duration <= 60,
        'disarmed': bool(landed) and landed[-1]['armed'] == 'false',
        'disarm_duration': disarm_delay is not None and 0 <= disarm_delay <= 30,
        'mission_duration': rows[-1]['elapsed_s'] <= 240,
    }
    return result, checks

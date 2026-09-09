import csv, math

def analyze(path, target=5.0, tolerance=0.5, max_drift=1.0, hover_seconds=10.0):
    with open(path, newline='', encoding='utf-8') as f: rows=list(csv.DictReader(f))
    if not rows: raise ValueError('no telemetry samples')
    for r in rows:
        for k in ('elapsed_s','x','y','altitude_m'): r[k]=float(r[k])
    takeoff=[r for r in rows if r['flight_state'] in ('TAKEOFF','HOLD','LAND')]
    hover=[r for r in rows if r['flight_state']=='HOLD']
    landed=[r for r in rows if r['flight_state']=='LANDED']
    reached=next((r for r in takeoff if abs(r['altitude_m']-target)<=tolerance),None)
    duration=(hover[-1]['elapsed_s']-hover[0]['elapsed_s']) if len(hover)>1 else 0.0
    drift=max((math.hypot(r['x']-hover[0]['x'],r['y']-hover[0]['y']) for r in hover),default=math.inf)
    result={'samples':len(rows),'max_altitude_m':max(r['altitude_m'] for r in rows),'hover_min_m':min((r['altitude_m'] for r in hover),default=math.nan),'hover_max_m':max((r['altitude_m'] for r in hover),default=math.nan),'hover_mean_m':sum(r['altitude_m'] for r in hover)/len(hover) if hover else math.nan,'max_hover_drift_m':drift,'hover_duration_s':duration,'time_to_target_s':reached['elapsed_s'] if reached else None,'landing_time_s':landed[0]['elapsed_s'] if landed else None}
    checks={'target_reached':reached is not None,'hover_duration':duration>=hover_seconds,'hover_altitude':bool(hover) and all(abs(r['altitude_m']-target)<=tolerance for r in hover),'horizontal_drift':drift<=max_drift,'landed':bool(landed) and landed[0]['altitude_m']<=0.3,'disarmed':bool(landed) and landed[-1]['armed']=='false','mission_duration':rows[-1]['elapsed_s']<=240}
    return result, checks


import csv, pathlib, sys
import pytest
sys.path.insert(0,str(pathlib.Path(__file__).parents[1]/'scripts'))
from evidence import analyze
FIELDS=['timestamp','elapsed_s','x','y','z','altitude_m','velocity_x','velocity_y','velocity_z','armed','flight_state']
def write(path,bad=False):
    rows=[dict(timestamp=0,elapsed_s=0,x=0,y=0,z=0,altitude_m=0,velocity_x=0,velocity_y=0,velocity_z=0,armed='true',flight_state='TAKEOFF')]
    for i in range(1,14): rows.append(dict(timestamp=i,elapsed_s=i,x=(.2*i if bad else .01*i),y=0,z=-5,altitude_m=5,velocity_x=0,velocity_y=0,velocity_z=0,armed='true',flight_state='HOLD'))
    rows.append(dict(timestamp=14,elapsed_s=14,x=0,y=0,z=-1,altitude_m=1,velocity_x=0,velocity_y=0,velocity_z=0,armed='true',flight_state='LAND'))
    rows.append(dict(timestamp=15,elapsed_s=15,x=0,y=0,z=-0.1,altitude_m=0.1,velocity_x=0,velocity_y=0,velocity_z=0,armed='false',flight_state='LANDED'))
    with open(path,'w',newline='') as f:w=csv.DictWriter(f,FIELDS);w.writeheader();w.writerows(rows)
def test_accepts_complete_unit_fixture(tmp_path):
    p=tmp_path/'a.csv';write(p);_,checks=analyze(p);assert all(checks.values())
def test_rejects_excess_drift(tmp_path):
    p=tmp_path/'a.csv';write(p,True);_,checks=analyze(p);assert not checks['horizontal_drift']

def rewrite(path, change):
    with open(path, newline='') as stream:
        rows = list(csv.DictReader(stream))
    change(rows)
    with open(path, 'w', newline='') as stream:
        writer = csv.DictWriter(stream, FIELDS)
        writer.writeheader(); writer.writerows(rows)

def test_exact_drift_limit_is_rejected(tmp_path):
    p = tmp_path/'a.csv'; write(p)
    rewrite(p, lambda rows: rows[13].update(x=1.01))
    assert not analyze(p)[1]['horizontal_drift']

def test_late_takeoff_is_rejected(tmp_path):
    p = tmp_path/'a.csv'; write(p)
    rewrite(p, lambda rows: [r.update(elapsed_s=float(r['elapsed_s']) + 31) for r in rows[1:]])
    assert not analyze(p)[1]['takeoff_duration']

def test_late_landing_is_rejected(tmp_path):
    p = tmp_path/'a.csv'; write(p)
    rewrite(p, lambda rows: rows[-1].update(elapsed_s=75))
    assert not analyze(p)[1]['landing_duration']

def test_late_disarm_is_rejected(tmp_path):
    p = tmp_path/'a.csv'; write(p)
    def delay_disarm(rows):
        rows[-1].update(flight_state='LAND', armed='true')
        rows.append(dict(rows[-1], elapsed_s=46, flight_state='LANDED', armed='false'))
    rewrite(p, delay_disarm)
    assert not analyze(p)[1]['disarm_duration']

def test_unknown_armed_status_is_not_disarm_evidence(tmp_path):
    p = tmp_path/'a.csv'; write(p)
    rewrite(p, lambda rows: rows[-1].update(armed='unknown'))
    checks = analyze(p)[1]
    assert not checks['disarmed']
    assert not checks['disarm_duration']

@pytest.mark.parametrize('value', ['nan', 'inf'])
def test_nonfinite_telemetry_cannot_pass(tmp_path, value):
    p = tmp_path/'a.csv'; write(p)
    rewrite(p, lambda rows: rows[1].update(x=value))
    with pytest.raises(ValueError, match='non-finite'):
        analyze(p)

def test_wrong_altitude_coordinate_is_rejected(tmp_path):
    p = tmp_path/'a.csv'; write(p)
    rewrite(p, lambda rows: rows[1].update(z=5))
    with pytest.raises(ValueError, match='NED'):
        analyze(p)

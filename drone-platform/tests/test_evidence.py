import csv, pathlib, sys
sys.path.insert(0,str(pathlib.Path(__file__).parents[1]/'scripts'))
from evidence import analyze
FIELDS=['timestamp','elapsed_s','x','y','z','altitude_m','velocity_x','velocity_y','velocity_z','armed','flight_state']
def write(path,bad=False):
    rows=[]
    for i in range(13): rows.append(dict(timestamp=i,elapsed_s=i,x=(.2*i if bad else .01*i),y=0,z=-5,altitude_m=5,velocity_x=0,velocity_y=0,velocity_z=0,armed='true',flight_state='HOLD'))
    rows.append(dict(timestamp=14,elapsed_s=14,x=0,y=0,z=0,altitude_m=0.1,velocity_x=0,velocity_y=0,velocity_z=0,armed='false',flight_state='LANDED'))
    with open(path,'w',newline='') as f:w=csv.DictWriter(f,FIELDS);w.writeheader();w.writerows(rows)
def test_accepts_measured_good_flight(tmp_path):
    p=tmp_path/'a.csv';write(p);_,checks=analyze(p);assert all(checks.values())
def test_rejects_excess_drift(tmp_path):
    p=tmp_path/'a.csv';write(p,True);_,checks=analyze(p);assert not checks['horizontal_drift']

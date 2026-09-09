#!/usr/bin/env python3
import argparse, asyncio, csv, json, math, pathlib, time
from evidence import analyze

async def first(stream, timeout): return await asyncio.wait_for(anext(stream), timeout)

async def collect_telemetry(drone, state, started, samples):
    position_stream = drone.telemetry.position_velocity_ned()
    armed_stream = drone.telemetry.armed()
    armed = False
    pending_armed = None
    try:
        async for pv in position_stream:
            if pending_armed is None:
                pending_armed = asyncio.create_task(anext(armed_stream))
            try:
                # Keep a slow armed update alive across position samples. Cancelling
                # anext() on timeout would close the MAVSDK async iterator.
                armed = await asyncio.wait_for(asyncio.shield(pending_armed), .05)
            except asyncio.TimeoutError:
                # asyncio.TimeoutError is distinct from TimeoutError on Python 3.10.
                pass
            else:
                pending_armed = None
            p, v = pv.position, pv.velocity
            elapsed = time.monotonic() - started
            samples.append({'timestamp':time.time(),'elapsed_s':f'{elapsed:.3f}','x':p.north_m,'y':p.east_m,'z':p.down_m,'altitude_m':-p.down_m,'velocity_x':v.north_m_s,'velocity_y':v.east_m_s,'velocity_z':v.down_m_s,'armed':str(armed).lower(),'flight_state':state['name']})
    finally:
        if pending_armed is not None:
            pending_armed.cancel()
            try:
                await pending_armed
            except asyncio.CancelledError:
                pass
        await armed_stream.aclose()
        await position_stream.aclose()

async def mission(run, config, safety):
    if not safety.get('simulation_only') or safety.get('real_hardware_enabled') or safety.get('allow_serial_devices'): raise RuntimeError('simulation safety interlock rejected configuration')
    url=safety['connection_url']
    if not url.startswith('udp://:'): raise RuntimeError('only a local listen-only UDP simulation URL is permitted')
    from mavsdk import System
    drone=System(); await drone.connect(system_address=url)
    async def connected():
        async for connection in drone.core.connection_state():
            if connection.is_connected: return
    await asyncio.wait_for(connected(), 30)
    health=await first(drone.telemetry.health(),20)
    if not (health.is_local_position_ok and health.is_home_position_ok): raise RuntimeError(f'preflight health not ready: {health}')
    target=float(config['mission']['target_altitude_m']); hold_s=float(config['mission']['hover_seconds'])
    await drone.action.set_takeoff_altitude(target)
    state={'name':'PREFLIGHT'}; started=time.monotonic(); samples=[]
    collector=asyncio.create_task(collect_telemetry(drone, state, started, samples))
    try:
        await asyncio.wait_for(drone.action.arm(),20); state['name']='TAKEOFF'; await drone.action.takeoff()
        deadline=time.monotonic()+30
        while time.monotonic()<deadline:
            if samples and abs(float(samples[-1]['altitude_m'])-target)<=float(config['mission']['altitude_tolerance_m']): break
            await asyncio.sleep(.1)
        else: raise RuntimeError('target altitude timeout')
        state['name']='HOLD'; await asyncio.sleep(hold_s+.25)
        state['name']='LAND'; await drone.action.land()
        deadline=time.monotonic()+60
        while time.monotonic()<deadline:
            landed=await first(drone.telemetry.landed_state(),2)
            if landed.name == 'ON_GROUND' and samples and float(samples[-1]['altitude_m'])<=.3: break
        else: raise RuntimeError('landing timeout')
        deadline=time.monotonic()+30
        while time.monotonic()<deadline:
            if not await first(drone.telemetry.armed(),2): break
            await asyncio.sleep(.2)
        else: await asyncio.wait_for(drone.action.disarm(),5)
        state['name']='LANDED'; await asyncio.sleep(.5)
    finally:
        collector.cancel()
        try: await collector
        except asyncio.CancelledError: pass
        fields=['timestamp','elapsed_s','x','y','z','altitude_m','velocity_x','velocity_y','velocity_z','armed','flight_state']
        with open(run/'altitude.csv','w',newline='',encoding='utf-8') as f: w=csv.DictWriter(f,fields);w.writeheader();w.writerows(samples)
    metrics,checks=analyze(run/'altitude.csv',target,float(config['mission']['altitude_tolerance_m']),float(config['mission']['max_horizontal_drift_m']),hold_s)
    metrics={k:(None if isinstance(v,float) and math.isnan(v) else v) for k,v in metrics.items()}
    (run/'evidence.json').write_text(json.dumps({'metrics':metrics,'checks':checks},indent=2))
    print(json.dumps({'metrics':metrics,'checks':checks},indent=2))
    if not all(checks.values()): raise RuntimeError('measured acceptance criteria failed')

def main():
    import yaml
    p=argparse.ArgumentParser(); p.add_argument('--run',required=True); p.add_argument('--config',required=True); p.add_argument('--safety',required=True); a=p.parse_args()
    asyncio.run(asyncio.wait_for(mission(pathlib.Path(a.run),yaml.safe_load(open(a.config)),yaml.safe_load(open(a.safety))),240))
if __name__=='__main__': main()

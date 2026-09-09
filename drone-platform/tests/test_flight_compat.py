import asyncio
import pathlib
import sys
import time
from types import SimpleNamespace

import pytest

sys.path.insert(0, str(pathlib.Path(__file__).parents[1] / 'scripts'))
from phase1_flight import collect_telemetry


class DelayedTelemetry:
    """Local async streams; these are unit-test inputs, not flight evidence."""

    def __init__(self):
        self.release_armed = asyncio.Event()
        self.armed_started = asyncio.Event()
        self.armed_closed = False
        self.position_closed = False

    async def armed(self):
        try:
            self.armed_started.set()
            await self.release_armed.wait()
            yield True
            await asyncio.Event().wait()
        finally:
            self.armed_closed = True

    async def position_velocity_ned(self):
        pv = SimpleNamespace(
            position=SimpleNamespace(north_m=1.0, east_m=2.0, down_m=-5.0),
            velocity=SimpleNamespace(north_m_s=0.0, east_m_s=0.0, down_m_s=0.0),
        )
        try:
            yield pv
            yield pv
            self.release_armed.set()
            yield pv
            yield pv
        finally:
            self.position_closed = True


@pytest.mark.parametrize('legacy_timeout', [False, True])
def test_slow_armed_updates_preserve_position_collection(monkeypatch, legacy_timeout):
    if legacy_timeout:
        # Python 3.10 has a distinct asyncio timeout class. Reproduce that
        # exception contract even when the test runner uses Python 3.11+.
        class LegacyAsyncTimeout(Exception):
            pass

        wait_for = asyncio.wait_for
        native_timeout = asyncio.TimeoutError

        async def legacy_wait_for(awaitable, timeout):
            try:
                return await wait_for(awaitable, timeout)
            except native_timeout as exc:
                raise LegacyAsyncTimeout from exc

        monkeypatch.setattr(asyncio, 'TimeoutError', LegacyAsyncTimeout)
        monkeypatch.setattr(asyncio, 'wait_for', legacy_wait_for)

    async def scenario():
        telemetry = DelayedTelemetry()
        samples = []
        await collect_telemetry(
            SimpleNamespace(telemetry=telemetry), {'name': 'HOLD'},
            time.monotonic(), samples,
        )
        assert [sample['armed'] for sample in samples] == ['unknown', 'unknown', 'true', 'true']
        assert all(sample['altitude_m'] == 5.0 for sample in samples)
        assert telemetry.armed_closed
        assert telemetry.position_closed

    asyncio.run(scenario())


def test_collector_cancellation_closes_pending_armed_read():
    async def scenario():
        telemetry = DelayedTelemetry()
        collector = asyncio.create_task(collect_telemetry(
            SimpleNamespace(telemetry=telemetry), {'name': 'PREFLIGHT'},
            time.monotonic(), [],
        ))
        await telemetry.armed_started.wait()
        collector.cancel()
        with pytest.raises(asyncio.CancelledError):
            await collector
        assert telemetry.armed_closed
        assert telemetry.position_closed

    asyncio.run(scenario())

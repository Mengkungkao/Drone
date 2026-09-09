"""Gate legacy PX4 execution on verified DroneLab phase state, before I/O."""
import json
import pathlib
import sys


def require_px4_phase(state_path):
    try:
        state = json.loads(pathlib.Path(state_path).read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise RuntimeError("DroneLab phase state is missing or invalid") from exc
    if state.get("phase1_complete") is not True:
        raise RuntimeError("PX4 execution is gated until the Betaflight read-only Phase 1 has measured PASS evidence")


if __name__ == "__main__":
    try:
        require_px4_phase(sys.argv[1])
    except RuntimeError as exc:
        sys.exit(str(exc))

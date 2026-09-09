"""Phase-state tests use temporary data, never production integration evidence."""
import json
import pathlib
import sys

import pytest

sys.path.insert(0, str(pathlib.Path(__file__).parents[1] / "scripts"))
from phase_gate import require_px4_phase


@pytest.mark.parametrize("flag", [None, False, "true", 1])
def test_unverified_or_loosely_typed_phase_is_rejected(tmp_path, flag):
    path = tmp_path / "project.json"
    path.write_text(json.dumps({"phase1_complete": flag}))
    with pytest.raises(RuntimeError, match="gated"):
        require_px4_phase(path)


def test_missing_phase_state_fails_closed(tmp_path):
    with pytest.raises(RuntimeError, match="missing or invalid"):
        require_px4_phase(tmp_path / "missing.json")


def test_verified_phase_state_permits_next_gate(tmp_path):
    path = tmp_path / "project.json"
    path.write_text(json.dumps({"phase1_complete": True}))
    require_px4_phase(path)

#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' 'Deprecated: test_phase1.sh refers to the old PX4 project, not DroneLab Phase 1.' >&2
exec bash "$(dirname "$0")/test_px4_sitl.sh" "$@"

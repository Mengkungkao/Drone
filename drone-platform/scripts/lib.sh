#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATE="$ROOT/.state"

die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || die "required command not found: $1"; }
yaml_value() {
  local key=${2##*.}
  awk -F: -v key="$key" '$1 ~ "^[[:space:]]*" key "[[:space:]]*$" {v=$2; gsub(/^[[:space:]]+|[[:space:]]+$/, "", v); print tolower(v); exit}' "$ROOT/$1"
}
assert_simulation_only() {
  [[ "$(yaml_value config/safety.yaml simulation_only)" == true ]] || die "simulation-only interlock is disabled"
  [[ "$(yaml_value config/safety.yaml real_hardware_enabled)" == false ]] || die "real hardware must remain disabled"
  [[ "$(yaml_value config/safety.yaml allow_serial_devices)" == false ]] || die "serial access must remain disabled"
}

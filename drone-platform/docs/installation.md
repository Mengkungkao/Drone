# Installation

Desktop development and PX4 simulation have separate prerequisites. The desktop can be developed on Windows or Linux. The future PX4 subsystem targets Ubuntu 24.04 LTS x86-64, ROS 2 Jazzy, and Gazebo Harmonic.

The currently inspected host is Ubuntu 22.04.5 LTS x86-64 with Node.js 22.23.2, npm 10.9.8, rustc/cargo 1.98.1, GCC 11.4.0, CMake 3.22.1, 20 logical CPUs, approximately 15.25 GiB RAM and 17.48 GiB free storage. The GTK/WebKit libraries Tauri links against are not installed, so the desktop shell does not compile here. Docker and Gazebo are absent, and the installed ROS 2 distribution is Humble rather than the documented Jazzy target. These observations establish the current native/simulation blockers; they do not establish runtime readiness.

An earlier snapshot of a Windows host recorded Node.js 24.16.0 and npm 12.0.2 with WebView2 present but no Rust or MSVC toolchain. That host is not the current environment; the Windows instructions below are retained as platform guidance, not as a description of this machine.

From `drone-platform`:

```bash
npm install
npm run check:environment
npm run check:foundation
npm run dev
```

The browser preview is useful for the shell and unavailable-state UX. Native project persistence requires Tauri. Install the prerequisites for your OS, then run:

```bash
npm run test:native
npm run desktop:build
npm run desktop:dev
```

Windows requires the Rust MSVC toolchain, Visual Studio C++ build tools/Windows SDK, and WebView2. Use the environment report to identify missing components. Installers that need elevation are operator actions: DroneLab prints required commands and stops before a password prompt. No system installer is run by this migration.

The following are exact **operator-only PowerShell commands**, printed for review and not executed by DroneLab:

```powershell
winget install --id Microsoft.VisualStudio.2022.BuildTools --exact --override "--wait --passive --norestart --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
winget install --id Rustlang.Rustup --exact
```

After installation, open a fresh terminal and select the MSVC Rust toolchain:

```powershell
rustup default stable-msvc
rustc --version
cargo --version
```

The first command installs Microsoft's C++ build workload and can request Windows elevation. The second installs Rustup. The commands follow [Tauri's Windows prerequisites](https://v2.tauri.app/start/prerequisites/#windows), the [Rust MSVC setup guide](https://rust-lang.github.io/rustup/installation/windows-msvc.html), and Microsoft's [installer parameter reference](https://learn.microsoft.com/en-us/visualstudio/install/use-command-line-parameters-to-install-visual-studio?view=vs-2022). WebView2 was already detected on this host. These commands have not been run or verified as installations in this workspace.

## Linux desktop prerequisites

Tauri links the desktop shell against GTK 3 and WebKitGTK at build time. A working `cargo` alone is not enough: `npm run check:environment` probes these libraries with `pkg-config` and reports `nativeToolchainPresent: false` while any are missing.

Install the Rust toolchain as the ordinary user; it needs no elevation:

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable --profile minimal
. "$HOME/.cargo/env"
```

The system libraries do require elevation, so they are an **operator action**. DroneLab prints the command and stops; it never runs a package installer itself. On Ubuntu 22.04:

```bash
sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev libsoup-3.0-dev \
  libayatana-appindicator3-dev librsvg2-dev libxdo-dev libssl-dev build-essential
```

These package names follow [Tauri's Linux prerequisites](https://v2.tauri.app/start/prerequisites/#linux). Ubuntu 24.04 and later use the same set. Re-run `npm run check:environment` afterwards and confirm `nativeToolchainPresent` is `true` before attempting `npm run desktop:build`.

Until the libraries are present, `npm run check:foundation` still runs the native suite through `cargo test --workspace --no-default-features`, which exercises storage, migrations and safety without the window layer. It reports the desktop shell as `BLOCKED` and exits non-zero, because Phase 0 requires a verified native launch that this host cannot yet produce.

For the future Ubuntu simulation environment, first follow the official [ROS 2 Jazzy installation instructions](https://docs.ros.org/en/jazzy/Installation/Ubuntu-Install-Debs.html) and [Gazebo Harmonic Ubuntu instructions](https://gazebosim.org/docs/harmonic/install_ubuntu/). The [PX4 development environment](https://docs.px4.io/main/en/dev_setup/dev_env_linux_ubuntu) documents Ubuntu toolchain requirements. Upstream documentation was checked on 2026-09-09; recheck it when provisioning because releases and package instructions change.

`scripts/setup.sh` checks packages first. When packages or rosdep initialization are missing, it prints the exact apt or rosdep command and exits 2. It never invokes `sudo`, an elevated upstream setup script, or system package installation, even when credentials are cached. Repository configuration is an operator step from the official guides.

Once system prerequisites exist, setup resolves a published stable PX4 release, preserves existing checkouts, checks the matching `px4_msgs release/X.Y` branch, creates project-local Python environments, and builds Micro XRCE-DDS Agent into `.local/`. The selected source and observed package versions are written to `config/versions.yaml` only after preparation succeeds. Requested versions and source tags do not prove runtime compatibility.

```bash
bash scripts/setup.sh
bash scripts/build.sh
bash scripts/check_environment.sh
```

These commands have not been executed on an Ubuntu 24.04 simulator host. Build uses `rosdep check`; if system dependencies are missing it stops and provides a non-installing dependency plan. Additional toolchain packages reported by the selected PX4 release must be reviewed and installed manually.

Do not reuse Humble/Jammy binaries or virtual environments for Jazzy/Noble. Prefer a fresh checkout on Ubuntu 24.04, preserving the old workspace, logs, and local changes. A fresh terminal must not source another ROS distribution. ROS/colcon use Ubuntu Python 3.12; PX4 and MAVSDK use separate `.px4-venv` and `.venv` environments.

Runtime remains blocked until the Betaflight Phase 1 evidence gate is complete and Phase 2 vehicle identity/network isolation are implemented and verified. Do not change `px4_runtime_enabled` merely to bypass this gate.

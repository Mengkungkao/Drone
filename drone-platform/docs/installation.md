# Installation

Desktop development and PX4 simulation have separate prerequisites. The desktop can be developed on Windows. The future PX4 subsystem targets Ubuntu 24.04 LTS x86-64, ROS 2 Jazzy, and Gazebo Harmonic.

The inspected Windows host has Node.js 24.16.0 and npm 12.0.2, WebView2, 20 logical CPUs, approximately 15.64 GiB RAM and 74.48 GiB free storage. Rust/Cargo and an MSVC toolchain were not available. WSL, ROS 2, Gazebo and Docker were not installed. These observations establish the current native/simulation blockers; they do not establish runtime readiness.

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

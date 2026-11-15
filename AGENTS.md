# AGENTS.md

Guidance for AI coding agents working in the LedFx repository.

## Project Overview

LedFx (`pyproject.toml`, version `2.2.0`) is a network-based LED effect controller written in Python (`>=3.11,<3.15`) using `asyncio` and `aiohttp`. It analyses audio input (via `sounddevice`, `aubio-ledfx`, `samplerate-ledfx`, `audio-hotplug`), renders pixel effects with NumPy, and streams frames to LED devices over network/serial protocols (via `ledfx-senders`, WLED/DDP, E1.31, Art-Net, LIFX, OpenRGB, Hue, Nanoleaf, Twinkly, Flux, etc.).

Dependencies and environments are managed with `uv` (`uv.lock`) and built with `pdm-backend`.

## Common Commands

```bash
# Install all dependencies (runtime + extras + dev tools)
uv sync --all-extras --dev

# Run LedFx from source
uv run ledfx

# Run the full test suite (boots a live LedFx subprocess + LIFX emulator via tests/conftest.py)
uv run pytest -v --timeout=120

# Run isolated unit/spec tests without booting the live LedFx server
uv run pytest -v --noconftest tests/api_v2/test_committed_spec.py tests/api_v2/test_spec_lint.py

# Run all CI lint, formatting, and static checks
uv run prek run --all-files

# Run Pyrefly strict type checker against the pyrefly_errors.json baseline
uv run --isolated --locked --python 3.12 --group dev python tools/pyrefly_check.py --error-stale-baseline

# Prune fixed errors from pyrefly_errors.json (never use --update-baseline to silence new errors)
uv run --isolated --locked --python 3.12 --group dev python tools/pyrefly_check.py --prune-baseline

# Regenerate the committed OpenAPI v2 spec (run on Linux / Python 3.12 with all extras)
uv run ledfx --dump-openapi openapi/ledfx-v2.json
```

## Repository Layout

- `ledfx/` — Main Python package:
  - `__main__.py` — CLI entry point, logging setup, argument parsing.
  - `core.py` — `LedFxCore` lifecycle, event loop, thread pool, and subsystem orchestration.
  - `events.py` — `Event` definitions and `Events` pub/sub dispatcher.
  - `errors.py` — Domain exceptions (`LedFxError`, `NotFound`, `Conflict`, `Invalid`, `Unavailable`, `SafeMode`) mapped to HTTP responses.
  - `utils.py` — Shared utilities, `BaseRegistry`, and `RegistryLoader`.
  - `virtuals.py`, `scenes.py`, `playlists.py`, `presets.py`, `transitions.py`, `silence_scene.py` — Virtual strips/matrices, scenes, playlists, presets, transitions, and silence-scene automation.
  - `devices/` — `Device` base class and protocol implementations.
  - `effects/` — `Effect` / `DummyEffect` base classes, audio analysis (`audio.py`, `melbank.py`), oneshots, and effect plugins.
  - `configuration/` — Pydantic v2 config models (`LedFxConfig`, `PluginConfig`, `TypedConfig`), `ConfigStore`, schema/field helpers, and `migrations/`.
  - `api/` — Legacy v1 `RestEndpoint` handlers, WebSocket handler, origin policy, and `v2/` typed REST API.
  - `integrations/` — Spotify, MQTT / Home Assistant, QLC+.
  - `nowplaying/` — MPRIS (Linux), SMTC (Windows), and album art / gradient extraction.
  - `sendspin/` — Sendspin audio streaming integration (`python_version >= 3.12`).
- `tests/` — Pytest suite; `tests/conftest.py` launches a live LedFx server with `LEDFX_API_VALIDATE_RESPONSES=1` and an emulated LIFX matrix device.
- `openapi/` — Committed OpenAPI 3.1 spec (`ledfx-v2.json`) and `oasdiff-levels.txt`.
- `tools/` — Maintenance scripts (`pyrefly_check.py`, `classvar_audit.py`, `update_scalar.py`, `bump_frontend_version.py`).
- `ledfx_frontend/` — Prebuilt frontend bundle (excluded from linting/typechecking; do not hand-edit).
- `ledfx_assets/` — Bundled icons, shaders/assets, and static resources.
- `docs/` — Sphinx + MyST documentation (`docs/api_v2.md` documents the v2 API contract).

## Architecture & Conventions

### Core & Lifecycle
- `LedFxCore` (`ledfx/core.py`) owns the `asyncio` event loop, `ThreadPoolExecutor`, `ConfigStore`, and managers (`Devices`, `Virtuals`, `Effects`, `Scenes`, `PlaylistManager`, `Integrations`, `HttpServer`, `ZeroConfRunner`, `NowPlayingService`, `SilenceSceneController`).
- Do **not** import or use `sounddevice` in `ledfx/__main__.py` (explicitly warned at top of file).

### Plugin Discovery (`BaseRegistry`)
- `Device`, `Effect`, `RestEndpoint`, and `Integration` subclasses are auto-discovered via `BaseRegistry` and `RegistryLoader` (`ledfx/utils.py`).
- Decorate intermediate/abstract base classes with `@BaseRegistry.no_registration` so they are not registered as concrete plugins.

### Configuration (`ledfx/configuration/`)
- `ConfigStore` (`ledfx/configuration/store.py`) is the single reader/writer for `config.json`, using debounced atomic writes and `SafeMode` (`ensure_writable`) when config is read-only.
- Plugin configs inherit from `PluginConfig` (frozen Pydantic v2 `BaseModel` with `extra="allow"` and `defer_build=True`). `PluginConfig.__pydantic_init_subclass__` preserves subclass field declaration order for `/api/schema` and UI forms.
- Access plugin config through `TypedConfig` (`plugin.config`) and mutate only via `update_config()` (direct assignment to `plugin.config` raises `AttributeError`).
- `Device.OUTPUT_KEYS` lists config keys that require rebuilding the underlying device output when changed.

### REST API: v1 vs v2
- **v1 (`ledfx/api/`)**: `RestEndpoint` subclasses; keeps legacy HTTP 200 failure envelopes for backwards compatibility.
- **v2 (`ledfx/api/v2/`)**: New API work goes here. Typed `Router` handlers under `/api/v2` with strict Pydantic request validation, RFC 9457 `application/problem+json` error responses from `LedFxError`, and auto-generated OpenAPI 3.1 schema (`openapi/ledfx-v2.json`) served at `/api/v2/openapi.json` and `/api/v2/docs` (Scalar).
- When changing `/api/v2` routes or models:
  - Bump `API_VERSION` in `ledfx/api/v2/core/app.py` (minor for additions, major for breaking changes).
  - Regenerate `openapi/ledfx-v2.json` and keep it within `SPEC_BUDGET_BYTES` (`tests/api_v2/test_committed_spec.py`).

## Code Quality & Tooling Rules

- **Ruff (`pyproject.toml`, `.pre-commit-config.yaml`)**: `G004` is enabled — always use lazy `%s` formatting in `_LOGGER.*(...)` calls, never f-strings.
- **Pyrefly (`pyproject.toml`)**: Configured with `preset = "strict"`, `python-platform = "linux"`, and `explicit-any = "error"`. Use `object` or concrete types instead of `Any`. Existing diagnostics are ratcheted in `pyrefly_errors.json`; new errors fail CI.
- **ClassVar Audit**: `tools/classvar_audit.py` verifies `ClassVar` annotations match their literal values.
- **Vendored/Generated Files**: Do not manually edit `ledfx_frontend/` or `ledfx/api/v2/docs/scalar.standalone.js` (use `python tools/update_scalar.py --sync` if `SCALAR_VERSION` changes).

## Custom DJ / Fork Additions

- **DJ Controller (`ledfx-control.html`)**: Standalone live controller served directly by `HttpServer` (`ledfx/http_manager.py`) at `/control` and `/dj` (auto-connects to `location.host` when served over HTTP). Includes Vibe Macros, Scene previews + live **Update Scene** (`POST /api/scenes` with `snapshot: true`), Hits (`/api/virtuals_tools`), collapsible Virtuals + manual offline tube reconnect (`POST /api/devices/{id}`), and an **EQ & Spectrum** tab.
- **Zero-Latency 5-Band Audio EQ (`ledfx/effects/audio.py`, `ledfx/configuration/models.py`)**: `AudioInputConfig` exposes `eq_enabled`, `eq_low` (60 Hz), `eq_low_mid` (250 Hz), `eq_mid` (1 kHz), `eq_high_mid` (4 kHz), and `eq_high` (12 kHz) (`-24.0` to `+24.0` dB, permitted in `PERMITTED_KEYS["audio"]`), applied directly in the frequency domain in `pre_process_audio()` before melbank/beat analysis.
- **Device Auto-Reconnect Toggle (`auto_reconnect_devices`)**: `LedFxConfig.auto_reconnect_devices` (default `True`, permitted in `PERMITTED_KEYS["core"]`) controls whether `NativePacketDevice` (`ledfx/devices/native_packet.py`) and `WLED` (`ledfx/devices/wled.py`) automatically schedule background retries for offline devices.
- **Physical Layout Profiles (`ledfx/api/layouts.py`, `ledfx/configuration/models.py`)**: `LedFxConfig.layout_profiles` (`dict[str, LayoutProfile]`) and `LedFxConfig.active_layout_id` store named virtual `segments`/`rows`/`grouping` mappings with optional `scene_tag` filtering, managed via `GET/POST/PUT/DELETE /api/layouts` and the **Stage Layout** bar in `ledfx-control.html`.
- **Tube Hardware Geometry**: Each WLED tube has 36 RGBW segments (4 per side, starting at the same side of the tube) — `grouping=4` treats each 4-segment ring as 1 ring-segment for linear effects, while `grouping=1` addresses all 36 segments individually for spirals/2D effects.
- **Known bugs (`BUGS.md`)**: Open review findings for the fork additions live in `BUGS.md`. Update it whenever you find or fix a bug, and keep this file in sync with any new fork feature.

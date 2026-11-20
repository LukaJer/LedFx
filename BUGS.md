# BUGS.md

Known bugs and review findings for the fork additions (DJ controller, physical layouts, 5-band EQ & autogain, auto-reconnect toggle, and tube-native effects). Reviewed at commit `4f4b440d` (+ uncommitted `ledfx_control/performance.js` and `config/config.json`). Keep this file up to date: add new findings, move fixed items to "Fixed".

Severity: **H** = high (crash, race, data/state corruption, silent breakage), **M** = medium (real user-visible breakage), **L** = low (edge case / hardening / static checks). Feature TODOs live in [TODO.md](TODO.md).

## Open

### Medium

### M1. `/control`, `/dj`, and `/ledfx_control/*` return 404 in installed / frozen builds
- **Where:** `ledfx/http_manager.py:70-85` (`dj_control`, `/ledfx_control`), `pyproject.toml:86-98` (`[tool.pdm.build].includes`).
- **Problem:** Both `<repo root>/ledfx-control.html` and `<repo root>/ledfx_control/` live outside the `ledfx` package and are omitted from `includes`, so wheels and PyInstaller builds do not ship the DJ controller or its JS/CSS modules.
- **Fix:** Move `ledfx-control.html` and `ledfx_control/` inside `ledfx/` or `ledfx_assets/` (or add them to `[tool.pdm.build].includes`) and update `ledfx/http_manager.py`.

### M9. `beat_min_mel_index` / `beat_power_min_idx` wrap to `0` when `beat_min_freq` exceeds melbank 0 (~350 Hz)
- **Where:** `ledfx/effects/audio.py:1272-1297, 1359-1363`, `ledfx/configuration/models.py:195-200`.
- **Problem:** `AudioAnalysisConfig` allows `beat_min_freq` up to `5000` Hz and `beat_max_freq` `30..10000` Hz without validating `beat_min_freq < beat_max_freq`. Because melbank 0 ends at ~350 Hz, any `beat_min_hz > freqs_0[-1]` makes `next(..., 0)` fall back to `0` and max to `len(freqs_0)`, causing `volume_beat_now()` to average the entire `20–350 Hz` melbank. `beat_min_freq >= beat_max_freq` also silently collapses `beat_min_hz` to `beat_max_freq - 10`.
- **Fix:** Validate `beat_min_freq < beat_max_freq` in `AudioAnalysisConfig`, and use melbank 2 (or clamp fallback index cleanly) when beat frequencies exceed melbank 0.

### M10. Unchecked `melbank_processors` length and `samples=0` crash `AudioAnalysisSource` and `Melbanks`
- **Where:** `ledfx/configuration/models.py:237, 244`, `ledfx/effects/audio.py:1255-1297, 1391`, `ledfx/effects/melbank.py:385-439, 464-468`.
- **Problem:** `MelbanksConfig.max_frequencies` has no `min_length=3` and `samples` permits `0`. `< 3` melbanks raises `IndexError` in `initialise_analysis()`/`freq_power()`; `0` melbanks raises `IndexError` in `send_melbank_event(-1)`. `Melbanks.update_config()` also clears `self.melbank_processors = []` before rebuilding buffers while `__call__()` runs on the audio thread.
- **Fix:** Enforce `min_length=3` on `max_frequencies` and `samples >= 1` in `MelbanksConfig`; synchronize or atomically swap `Melbanks` buffers in `update_config()`.

### M11. `Bleep` reactive background clashes with `Effect.get_pixels()` additive background and overwrites `draw_test()`
- **Where:** `ledfx/effects/bleep.py:336-353`, `ledfx/effects/__init__.py:468-469`.
- **Problem:** `Bleep.draw()` calls `draw_test(self.m_draw)` (`:337`) and then overwrites the canvas with `self.matrix.paste(...)` (`:350`). With default `background_mode == "additive"`, `Effect.get_pixels()` later adds static `self._bg_color` on top, preventing dimming below static background level and blending static color over `bg_reactive_color`.
- **Fix:** Apply the reactive background before `draw_test()`, and avoid adding `self._bg_color` in `get_pixels()` when `bg_reactive_*` overrides it.

### M12. `--open-ui` defaults to `True` and `get_default_config_directory()` uses tracked `config/config.json`
- **Where:** `ledfx/__main__.py:97, 101-106`, `ledfx/core.py:283-290`, `ledfx/configuration/paths.py:58-63`, `tests/conftest.py:214-228`, `config/config.json`.
- **Problem:** `--open-ui` defaults to `True`, attempting to open a browser on headless/test runs (including `tests/conftest.py`). Additionally, because `config/config.json` is tracked in git, `get_default_config_directory()` picks `<repo>/config` over `~/.ledfx` on any source run without `-c`, modifying the repository's personal config.
- **Fix:** Restore `default=False` on `--open-ui` (or pass `--no-open-ui` in `tests/conftest.py`), and untrack personal `config/config.json` / require an explicit flag for repo-local config.

### M20. `connect()` / reconnect `Promise.all()` races `loadLayouts()` against `loadDevices()`, and layout editor cleanup leaks state
- **Where:** `ledfx_control/core.js:52, 404-430, 459-472, 541-552`, `ledfx_control/audio-eq.js:85-95, 970-972`.
- **Problem:** Concurrent `loadLayouts()` and `loadDevices()` in `connect()`/`connectWS()` lets `syncLayoutUI()` render raw device IDs and unfiltered device chips before `devicesCache` loads (`loadDevices()` only calls `refreshArranger()`, not `syncLayoutUI()`). Separately, `#delLayoutBtn` (`core.js:541-552`) fails to clear `activeDeckId` / `layoutEditingId` when deleting a layout, and `loadLayoutIntoEditor('')` (`+ New`, `:407-415`) retains previous `gridCells`, leaking them into `ledfx_stage_grid` and the next saved layout.
- **Fix:** Refresh `syncLayoutUI()` after `loadDevices()`, clear `activeDeckId`/`layoutEditingId`/`loadLayoutIntoEditor('')` on `#delLayoutBtn`, and reset `gridCells` when creating a new layout.

### M21. Gradient curve editor, Scene Studio, and `loadEffectSliders()` edge cases
- **Where:** `ledfx_control/scenes-virtuals.js:166-214, 405-411, 1103-1109, 1211-1239`, `ledfx_control/performance.js:1342`.
- **Problem:**
  - `parseGradientStops()` (`:166-187`) only matches `#rrggbb` and `rgb()`/`rgba()`; 3-digit hex, CSS color names, and case-mismatched preset names fall back to `#ff0000 -> #0000ff`, and invalid numeric input in `[data-gs-pos]` yields `NaN` in `readStopsFromDOM()` (`:409`).
  - Switching to the `Scenes` tab (`performance.js:1342`) unconditionally calls `renderSceneStudio()`, discarding unsaved Scene Studio drafts; `.se-grad-canvas` (`:219`) stays blank if rendered while hidden (`rect.width === 0`).
  - `saveStudioScene()` (`:1107-1108`) omits `renderSceneStudio()` before `loadStudioScene(savedId)`, leaving `#stSceneSel` stale on `(New Scene)`.
  - `loadEffectSliders()` (`:1223, 1231`) uses float step `(max - min) / 100 || 0.01` on `integer` fields and does not update `virtualsCache[id].effect.config[key]`.
- **Fix:** Support 3-digit hex / CSS color names in `parseGradientStops()`, guard `Number.isFinite` in `readStopsFromDOM()`, redraw `.se-grad-canvas` when shown/resized, preserve dirty Studio drafts on tab switch, refresh `#stSceneSel` in `saveStudioScene()`, and use `step=1` for `integer` sliders.

### Low

### L3. 5-band EQ silently disables itself on a size mismatch
- **Where:** `ledfx/effects/audio.py:41-60, 1172-1176`.
- **Problem:** If the phase-vocoder spectrum length differs, `len(eq_curve) != len(self._frequency_domain.norm)` and EQ is silently skipped with no log message, so the UI shows "EQ Active" while nothing happens.
- **Fix:** Log once (lazy `%s`) on mismatch or rebuild the curve to match `len(self._frequency_domain.norm)`.

### L4. DJ controller: unescaped HTML, selectors, and CSS `style` attribute injection
- **Where:** `ledfx_control/scenes-virtuals.js:40, 946, 1172-1188, 1226`, `ledfx_control/core.js:90-105`, `ledfx_control/previews.js:189, 257`.
- **Problem:** `virtualCard()` (`scenes-virtuals.js:1172-1182`) and `loadEffectSliders()` (`:1226`) still insert virtual IDs, names, effect types, and schema keys into `innerHTML` without `escHtml()` (and `wireVirtual()` `:1188` skips `CSS.escape(id)`). `sceneSegmentStyle()` (`core.js:94`) only checks prefix `/^(#|rgb|hsl|linear-gradient|radial-gradient)/i`, allowing `;` / `"` style-attribute injection via `eff.config` colors/gradients.
- **Fix:** Escape all dynamic text/attributes with `escHtml()`, use `CSS.escape(id)` in selectors, and sanitize/escape `sceneSegmentStyle()` outputs.

### L5. DJ controller: `ws://` / `http://` hardcoded
- **Where:** `ledfx_control/core.js:20, 44`, `ledfx_control/performance.js:535`.
- **Problem:** `api()` hardcodes `http://${HOST}/api...` (`connect()` strips `https://`), and `connectWS()` hardcodes `ws://${HOST}/api/websocket`, blocking HTTPS deployments as mixed content.
- **Fix:** Derive `http:`/`https:` and `ws:`/`wss:` from `location.protocol` when served over HTTPS or preserve scheme.

### L8. Pyrefly strict type errors in fork Python modules and tests
- **Where:** `ledfx/effects/tube_kick_strobe.py:61-135` (15 errors), `ledfx/effects/tube_tiktok.py:54, 56, 110` (3 errors), `ledfx/http_manager.py:80` (1 error), `tests/test_layouts.py:55, 76, 87, 101, 111, 117` (6 errors), `tests/test_audio_eq.py:79-88` (5 errors under Python 3.14 `.venv`).
- **Problem:** Unannotated `audio_data_updated(self, data)`, `list[list[object]]` unpacking in `TubeKickStrobeEffect`, nullable `self.pixels.reshape(...)` in `TubeTikTokEffect`, unannotated `dj_control(self, request)`, untyped test lambdas / `resp.text` in `test_layouts.py`, and missing attributes/stub issues in `test_audio_eq.py` fail `tools/pyrefly_check.py`.
- **Fix:** Add concrete parameter/tuple annotations and `None` assertions (and re-verify `--python 3.12` in CI).

### L9. `LayoutsEndpoint.post()` validation gaps & `tests/test_layouts.py` coverage
- **Where:** `ledfx/api/layouts.py:55, 84-87`, `ledfx/configuration/models.py:469`, `tests/test_layouts.py`.
- **Problem:** `post()` does not check `isinstance(snapshot, bool)`, accepts empty/unstripped `name` when updating an existing layout, and `LayoutVirtualMapping.segments: list[list[object]]` defers segment tuple validation until `PUT`. `tests/test_layouts.py` only tests mocked happy-path CRUD.
- **Fix:** Validate `snapshot` as `bool`, strip/reject blank `name` on updates, type-validate segments in `LayoutVirtualMapping`, and add tests for error, rollback, `SafeMode`, and metadata updates.

### L10. `AudioInputSource._autogain_env` shared class attribute never reset on stream open or AGC toggle
- **Where:** `ledfx/effects/audio.py:76, 1136-1149`.
- **Problem:** `_autogain_env = 0.1` is defined at class level, never reset on stream `activate()` or `autogain` `False → True` transitions, and `rms > 1e-4` lets low room noise boost `auto_scale` up to `6.0x`.
- **Fix:** Initialize/reset `_autogain_env = 0.1` per instance on `activate()` and AGC enable, and raise or gate the noise floor.

### L11. `TubeTikTokEffect` & `GradientEffect.roll_gradient()` fail on `pixel_count == 0`, dt-less `_flash`, and unbounded `_phase`
- **Where:** `ledfx/effects/tube_base.py:58-62, 100-101`, `ledfx/effects/tube_tiktok.py:110`, `ledfx/effects/gradient.py:139`, `ledfx/effects/tube_*.py`.
- **Problem:** `TubeEffectBase._compute_grid(0)` returns `(1, 1, 1)`, causing `self.pixels.reshape(...)` `ValueError` in `TubeTikTokEffect` (`:110`) and `ZeroDivisionError` in `GradientEffect.roll_gradient()` (`:139`) when `pixel_count == 0`. `TubeEffectBase._flash *= 0.84` (`tube_base.py:101`) is frame-rate-dependent rather than `dt`-scaled, and `_phase` grows unboundedly in `tube_beat_pulse.py`, `tube_tiktok.py`, `tube_wave.py`, `tube_vortex.py`, `tube_strobe_helix.py`, `tube_lighthouse.py`, `tube_helix.py`, and `tube_gate.py`.
- **Fix:** Guard `pixel_count <= 0`, convert `_flash` decay to exponential `dt`-based attenuation, and wrap `_phase` modulo `1.0` / `2π`.

## Open (Upstream / Core Codebase)

Remaining open findings from the full-codebase review (`28ad9d51`, excluding items already fixed in `da1af616`):

### High
- **Unsynchronized `Virtual.replace_config()` & `force_frame()` vs. render/audio threads** — `ledfx/virtuals.py:765-772,1386-1443,2368-2372` — Mutates `_config`, `frame_transitions`, `complex_segments`, `_device_remap`, `assembled_frame`, and `oneshots` without `self.lock`.
- **Unsynchronized `Virtual` fallback state** — `ledfx/virtuals.py:515-581,832-835` — `fallback_fire_set()` and `set_fallback()`/`fallback_clear()` run outside `self.lock`, racing with `set_effect(..., fallback=...)`.
- **`Virtuals._apply_active()` rollback restores a destroyed effect** — `ledfx/virtuals.py:1959-1962,1983` — Restores `_active_effect = old_effect` after `set_effect()` already deactivated/unregistered it (`pixels=None`); `_set_active()` also skips restoring `{}` configs.
- **WASAPI multi-channel loopback fed to 1-channel `Resampler`** — `ledfx/effects/audio.py:801-815,1030-1089` — Loopback leaves `channels=None` (multi-channel) and passes flattened samples to a 1-channel `Resampler`.
- **`PlaylistManager` unsynchronized across `await self._task`** — `ledfx/playlists.py:384-608,677-717` — Concurrent `start()`/`next()`/`prev()` calls can spawn multiple concurrent `_runner` tasks.
- **`LifxDevice` `activate()`/`deactivate()` async race & leaked connections** — `ledfx/devices/lifx.py:375-536,643-678` — `_create_animator()` / `_async_connect()` do not re-check `self._active` after `await`ing I/O.
- **`OpenRGB` leaks TCP connections on `deactivate()` and blocks event loop** — `ledfx/devices/openrgb.py:81-88,122-150` — `OpenRGBClient(...)` blocks the loop, `deactivate()` never closes `openrgb_device`, and `flush()` calls `activate()` synchronously on `AttributeError`.
- **`Nanoleaf` blocks event loop (some requests without timeouts) and activates on `config_updated()`** — `ledfx/devices/nanoleaf.py:75-80,116-147,203-293` — Synchronous `requests.*` and `socket.gethostbyname` run on the event loop; `write_tcp()` doesn't catch `requests.ConnectionError`/`RequestException`.
- **`TwinklySquares` `flush()`/`deactivate()` unlocked race & unhandled exceptions** — `ledfx/devices/twinkly_squares.py:40-68,120-125` — `deactivate()` sets `self.ctrl = None` unlocked and calls `set_mode("movie")` without `try/except`.
- **`MQTT_HASS` never disconnects & duplicates listeners on reconnect** — `ledfx/integrations/mqtt_hass.py:149-225,754-767` — Defines `on_disconnect()` instead of overriding `disconnect()`, never calls `loop_stop()`/`disconnect()`, and appends 6 listeners per reconnect.
- **`MQTT` never stores `self._client` and never disconnects** — `ledfx/integrations/mqtt.py:55,112-121` — Local `client = mqtt.Client()` leaks the paho thread on shutdown.
- **Blocking HTTP download in `NowPlayingService.set_artwork_url()`** — `ledfx/nowplaying/service.py:247,834-894` — Calls synchronous `safe_urlopen()` directly on the calling thread.
- **WinRT `SMTCNowPlayingProvider` callbacks can hit a closed loop** — `ledfx/nowplaying/providers/smtc.py:44-58,97-109` — `stop()` doesn't clear `self._loop`, causing `RuntimeError: Event loop is closed`.
- **`LogWebsocket.handle()` can hang on `await self._sender_task` & races across connections** — `ledfx/api/log.py:28,141-193` — Shared instance across requests; `finally:` awaits `_sender_task` without cancelling it.

### Medium
- **`assets.py` unlocked in-place `.asset_metadata_cache.json` writes & non-atomic Windows rename** — `ledfx/assets.py:119-135,396-401`.
- **`Scenes.create()` crashes on `DummyEffect` during fade-out and collides on generated IDs** — `ledfx/scenes.py:69-74`.
- **`Scenes.deactivate()` clears effects on virtuals marked `action="ignore"`** — `ledfx/scenes.py:286-288`.
- **`PlaylistManager._advance_index()` bugs on 1-item playlists, pause timing, and empty `_order` `ZeroDivisionError`** — `ledfx/playlists.py:291,691-717`.
- **`SilenceSceneController` retry loop, `_operation` clobber, and unlocked shared flags** — `ledfx/silence_scene.py:224-234,448-457,616-630`.
- **Missing `OUTPUT_KEYS` / `config_updated()` runtime handling** — `ledfx/devices/adalight.py:41-56`, `openrgb.py:63-65`, `zengge.py:31-43`.
- **Unclipped pixel integer wraparound / channel bleed** — `ledfx/devices/lifx.py:57-99`, `rpi_ws281x.py:129-140`.
- **`Govee.activate()` blocks event loop and `flush()` uses `udp_server` unlocked** — `ledfx/devices/govee.py:114-160`.
- **`SocketSingleton.__init__` mutates `ref_count` outside `_lock`** — `ledfx/devices/utils/socket_singleton.py:26-47`.
- **`Integration.deactivate()` doesn't await `disconnect()`; `MQTT` logs plaintext password; `MQTT`/`MQTT_HASS` miss `rc == 0` and payload guards; `QLC` leaks listeners & fails on `CLOSE` frames** — `ledfx/integrations/__init__.py:55-59`, `mqtt.py:58,64-88`, `mqtt_hass.py:153-500`, `qlc.py:75-85,344-368`.
- **`AlbumArtResolver._resolve` `finally` clobbers newer task; `MusicBrainzArtProvider` unbounded `resp.read()` & per-request `ClientSession`** — `ledfx/nowplaying/album_art/resolver.py:66-85,146-147`, `musicbrainz.py:567-612`.

### Low
- **`ConfigStore.save_now()` / `flush_sync()` increment `_seq` and call `serialise()` unlocked; `replace()` doesn't reset `unreadable`** — `ledfx/configuration/store.py:234-278,344-359`.
- **`SilenceSceneController` synchronous `fsync` on event loop** — `ledfx/silence_scene.py:555-586`.
- **`smooth()` clamps kernel radius to roughly half the intended width** — `ledfx/effects/__init__.py:239-240`.
- **`RPI_WS281X` lacks synchronization between `config_updated()` and `flush()`** — `ledfx/devices/rpi_ws281x.py:78-86`.
- **`MQTT` / `MQTT_HASS` call `username_pw_set("", "")` when `username` defaults to `""`** — `ledfx/integrations/mqtt.py:117-118`, `mqtt_hass.py:764-765`.

## Fixed
- **Fork / DJ Controller, Tube Effects & Audio:**
  - **`M3`, `M7`, `M19`, `L1`, `L2`, `L12` (`ledfx/scenes.py`, `ledfx/api/scenes.py`, `ledfx/api/device.py`, `ledfx/core.py`, `ledfx/effects/tube_kick_strobe.py`, `ledfx-control.html`, `ledfx_control/*`):** Tracked `active_scene_id` on `Scenes.activate()` and exposed it on `GET /api/scenes` (`M3`); hid unused `TubeKickStrobeEffect` inherited keys via `HIDDEN_KEYS` (`M7`); required `virt?.active` in `getTubePixelsFromVirtuals` and added `mapping === 'copy'` handling in both tube/layout previews (`M19`); returned `online` from `POST /api/devices/{id}` and surfaced offline status in UI (`L1`); re-armed `resolve_address()` for offline `_requested` devices when `auto_reconnect_devices` is re-enabled (`L2`); removed duplicate `#mainZoneBar`, defined `--warn`, fixed per-deck `Rotate Colors` fallback to deck scene colors, pruned deleted `hiddenScenes`, and preserved `sceneDraftVirtuals` on `.cyc-pick` clicks (`L12`).
  - **`H2`, `H3`, `H4` (`ledfx/api/layouts.py`, `tests/test_layouts.py`):** Added `SafeMode` (`ensure_writable()`) and non-blocking `request_save()` across `POST`/`PUT`/`DELETE`, defaulted `snapshot=False` when updating an existing layout by `id`, and added rollback in `PUT` on partial virtual failures.
  - **`H8`, `H9`, `H10`, `H11` (`ledfx_control/scenes-virtuals.js`, `ledfx_control/performance.js`):** Preserved `sceneDraftVirtuals` across virtual cloning (`H8`); cleared `activePalettePatch` on save and patched color inputs in-place on `applyPalette()` (`H9`); preserved `stop`/`forceblack`/`ignore` virtual entries in Scene Studio (`H10`); added per-scope monotonic tokens in `activateScene()` and avoided overwriting global `lastScene` on deck-card clicks (`H11`, completing `L6`).
  - **`H1` (`ledfx/effects/audio.py`):** `AudioAnalysisSource.update_config()` now only runs `initialise_analysis()` when FFT/sample-rate/tempo/onset/pitch method settings change (keeping BPM/tempo intact on EQ/gain/beat-range edits), swaps `freq_mel_indexes` atomically, and guards `bar_oscillator()` against `beat_period <= 0`.
  - **`M5` (`ledfx/effects/tube_base.py`):** Added `TubeEffectBase.config_updated()` delegating to `GradientEffect.config_updated()` (fixing live palette/gradient updates across all 14 tube effects while preserving `Effect.mirror` tube-to-tube symmetry).
  - **`M8` (`ledfx/effects/audio.py`, `tests/test_audio_eq.py`):** `_build_eq_curve()` now uses resampled `MIC_RATE` (`30000`) instead of `config.mic_rate` (`44100`).
  - **`H5`, `H6`, `H7`, `M13`/`L7`, `M14`, `M15`, `M16`, `M17`, `M18` (`ledfx_control/*`):** Keyed momentary hit state/tokens per zone+hit and restored `active: false` virtuals cleanly (`H5`); switched EQ/Melbanks config saves to partial dirty-key patches synced with `setSensitivity()` (`H6`); clamped spectrum `BEAT Min <= 5000` and `HIGH Max >= 10000` (`H7`); added Blackout persistence, per-virtual brightness snapshots, Whiteout reconciliation, `activateScene()` re-application, and per-deck `toggleDeckOutMode()` busy locks (`M13`/`L7`/`M14`); synced Layout tab Scene Cycler controls with `deckSceneCycleState` and layout/hidden filters (`M15`); scoped `audio.min_volume` updates to global `All`, expanded `inferSceneCtlPct()` keys, cleared `dblclick` debounce timers, and wired deck card `dblclick` (`M16`); hydrated deck slider state across `multiGrid` rebuilds and avoided resetting `multiPreviewKey` on tab switches (`M17`); stopped `#stBpmInput`/`#autoBpmBtn` keydown bubbling to `#stBpmBox` and clamped `tapBpm()` (`M18`).
  - **(Previously `L6`, partial):** `activateScene()` (`ledfx_control/scenes-virtuals.js:109`) now `await`s `loadVirtuals()` (remaining superseded-call race moved to `H11`).
  - **(Previously `M4`, not a preview bug):** Re-verified `BlinkerL`/`BlinkerR` (`config/config.json:3984-4027`) against `remap` (`rows=18`, 12 cols, `config/config.json:1716-1770`) and `PixelsEffect` (`ledfx/effects/pixels.py:75-82`): `PixelsEffect` steps `pixels: 18` at a time (`18 % 12 = 6`), physically splitting `WLEDBB01`/`WLEDBB04` columns `4..7` between sides `0..1` and `2..3` in the virtual output rather than mis-reconstructing frames in `previews.js:533-589` (real preview issues moved to `M19`).
  - **Update Scene** no longer uses destructive `snapshot: true` when updating an existing scene: it now preserves `ignore`/`stop`/`forceblack` actions and only updates the scene's tracked active virtuals.
  - Virtual toggle threw `e.currentTarget is null` after `await` (captured the element first).
  - API errors showed `200 OK` instead of the real reason (`payload.reason` now read).
  - UI did not show disconnects / did not re-sync after reconnect.
  - Top status bar and palette strip did not follow scene changes.
  - Scene preview strip drew empty virtuals and missed colors stored under non-`gradient` keys.
- **Core / Devices / Audio (`da1af616` & follow-up):**
  - `Events` (`ledfx/events.py`): protected `_listeners` with `RLock` and guarded `loop.is_closed()` in `fire_event()`.
  - `Virtual` & `Effect` (`ledfx/virtuals.py`, `ledfx/effects/__init__.py`): moved `EffectSetEvent`, `EffectClearedEvent`, and `EffectUpdatedEvent` emission outside `self.lock`.
  - `AudioInputSource` / `AudioAnalysisSource` / `AudioReactiveEffect` (`ledfx/effects/audio.py`): closed leaked `_stream` on failed `open_audio_stream()`, synchronized `check_and_deactivate()` timer state under `self.lock`, guarded empty slices in `freq_power()`, clamped `_selected_melbank` fallback, and replaced `@cache` on `melbank()` with a lock-protected cache returning copies.
  - `HttpServer` & `LedFxCore` (`ledfx/http_manager.py`, `ledfx/core.py`): initialized `HttpServer.runner = None`, made `handle_start_error()` async + re-raise to abort `async_start()`, added `_stopping` re-entrancy guard in `stop()`/`async_stop()`, cleaned up `RollingQueueHandler` and `loop.close()` on exit, and handled second `KeyboardInterrupt` during shutdown.
  - Cross-thread calls from `SendspinAudioThread` into `NowPlayingService` and main event loop marshaled via `call_soon_threadsafe`.
  - `AudioInputSource._callbacks` mutation/iteration protected with `self.lock`; read-only audio buffers copied before NaN cleanup.
  - `Melbank` filterbank `coeffs` and `mel_gain` clamped to prevent division-by-zero `NaN` latching.
  - `Virtual` `clear_frame` `call_later()` marshaled onto the main event loop; `None` guard added for `transition_frame`.
  - `Device._pixels` protected with `self.lock`; `clear_virtual_segments()` invalidates cache on all segment removals.
  - `WLEDDevice` dual-resolution race, offline startup init, HTTP `/json` error fallback, and `add_postamble()` empty-segments guard fixed.

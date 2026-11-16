# BUGS.md

Known bugs and review findings for the fork additions (DJ controller, 5-band EQ, auto-reconnect toggle). Reviewed at commit `72fa4a8e`. Keep this file up to date: add new findings, move fixed items to "Fixed".

Severity: **M** = medium (real user-visible breakage), **L** = low (edge case / hardening).

## TODO / Planned

- **Audio Auto-Gain (AGC) improvements** — `ledfx/effects/audio.py`, `ledfx/effects/melbank.py`, `ledfx-control.html`:
  - Review and tune incoming audio auto-gain / `mel_gain` / `volume_threshold` behavior for live DJ levels (prevent pumping during breakdowns, fast attack / controlled release, manual gain/AGC toggle + live readout in the **EQ & Spectrum** tab).
- **Speed & Sensitivity controls** — `ledfx-control.html` (`#speedSlider`, `#sensSlider`, Vibe Macros, Global target group):
  - Fix and improve how global Speed and Sensitivity map onto heterogeneous effect config schemas (not all effects use the same `speed` / `sensitivity` / `reactivity` keys or ranges, and relative scaling vs. overwriting per-effect values should be handled cleanly).

## Open

### M1. `/control` and `/dj` return 404 in installed / frozen builds
- **Where:** `ledfx/http_manager.py` (`dj_control`), `pyproject.toml` (`[tool.pdm.build].includes`).
- **Problem:** The handler serves `<repo root>/ledfx-control.html`, but that file is outside the `ledfx` package and is not listed in `includes`, so wheels and PyInstaller builds do not ship it. It only works when running from the source tree.
- **Fix:** Move the file into the package (e.g. `ledfx/ledfx-control.html` or `ledfx_assets/`) and update the path in `dj_control`, or add it to `includes`.

### M3. Several scenes can show as active at once
- **Where:** `ledfx/scenes.py` `is_active()` (upstream behaviour); partly mitigated in `ledfx-control.html` `loadScenes()`.
- **Problem:** Each scene is compared against live state independently and `ignore`/`{}` virtuals always match, so overlapping scenes all report `active: true` (also in the stock LedFx UI). The DJ controller now highlights one using `lastScene` or the scene with the most effects, which is a heuristic, not the truth.
- **Fix:** Track the last activated scene id in the backend (`Scenes.activate`) and expose it, instead of inferring from state.

### M4. Offline simulated tube preview shows 1-segment offset on `WLEDBB01` / `WLEDBB04` in `BlinkerL` / `BlinkerR`
- **Where:** `ledfx-control.html` (`getTubePixelsFromVirtuals`, `drawTubePreview`) and/or `remap` virtual preview reconstruction.
- **Problem:** When physical tubes are offline and the preview simulates pixels from `remap` (`18×12` matrix, 216 segments), `WLEDBB01` and `WLEDBB04` still show the bottom two segment rows shifted 1 segment ahead of the top two rows in `BlinkerL` and `BlinkerR`, even with `visualisation_maxlen=512`. (`config.json` segment definitions are clean; needs inspection of the raw `VirtualUpdateEvent` pixel order vs. `getTubePixelsFromVirtuals` / `remap` segment mapping.)
- **Fix:** Inspect the exact `VirtualUpdateEvent` frame bytes for `remap` during `BlinkerL`/`BlinkerR` and align the 2D/segment reconstruction in `getTubePixelsFromVirtuals` (and verify against live online `DeviceUpdateEvent` frames).

### L1. `POST /api/devices/{id}` reports success when the device is still offline
- **Where:** `ledfx/api/device.py` (`post`).
- **Problem:** `resolve_address()` swallows `ValueError` and sets `_online = False`, then `device.activate()` runs and the endpoint returns success. The UI toast says "Connected" even if it failed.
- **Fix:** After resolving, check `device.is_online()` and return an error/`online: false` in the response; the UI should check it.

### L2. Re-enabling `auto_reconnect_devices` does not restart retries
- **Where:** `ledfx/devices/native_packet.py`, `ledfx/devices/wled.py`.
- **Problem:** With the toggle off, `_schedule_retry` / `trigger_reconnect` / the WLED retry stop scheduling. Turning it back on does not re-arm retries for devices that are already offline until they are connected manually or a send error triggers `trigger_reconnect`.
- **Fix:** On the config update event, call `resolve_address()` for devices that are requested but offline.

### L3. 5-band EQ silently disables itself on a size mismatch
- **Where:** `ledfx/effects/audio.py` (`pre_process_audio`, `_build_eq_curve`).
- **Problem:** The curve is built from `config.fft_size` and `config.mic_rate`. If the phase-vocoder spectrum length differs, `len(eq_curve) != len(norm)` and the EQ is skipped with no log message, so the UI shows "EQ Active" while nothing happens.
- **Fix:** Log once (lazy `%s`) on mismatch, or rebuild the curve from the actual spectrum length.

### L4. DJ controller: unescaped HTML from server data
- **Where:** `ledfx-control.html` `virtualCard()` (`v.config.name`, effect type options) — scene cards already use `escHtml`.
- **Problem:** Virtual names and effect names are inserted into `innerHTML` raw. A virtual named `<img onerror=…>` executes script in the controller page.
- **Fix:** Wrap with `escHtml()`.

### L5. DJ controller: `ws://` / `http://` hardcoded
- **Where:** `ledfx-control.html` (`api()`, `connectWS()`).
- **Problem:** If the page is served over HTTPS (LedFx's `port_s` listener), requests to `http://` and `ws://` are blocked as mixed content.
- **Fix:** Derive the scheme from `location.protocol` (`https:` → `https://`, `wss://`) when served from LedFx.

### L6. DJ controller: `activateScene` does not await `loadVirtuals()`
- **Where:** `ledfx-control.html` (`activateScene`).
- **Problem:** The virtual cards refresh in the background, so rapid scene changes can render stale state out of order.
- **Fix:** `await loadVirtuals()` (or ignore results from superseded calls).

### L7. DJ controller: Blackout only affects currently active virtuals and is not persisted
- **Where:** `ledfx-control.html` (`toggleBlackout`).
- **Problem:** Virtuals/scenes activated after Blackout start at normal brightness; the stored previous brightness is lost on reload; effects without a `brightness` key fail silently (errors swallowed).
- **Fix:** Re-apply brightness after scene activation while Blackout is on, persist state, and report failures.

## Open (Upstream / Core Codebase)

Remaining open findings from the full-codebase review (`28ad9d51`, excluding items already fixed in `da1af616`):

### High
- **HTTP startup failure blocks event loop and races `async_start()` / `async_stop()`** — `ledfx/http_manager.py:104-138`, `ledfx/core.py:541-590` — `handle_start_error()` calls synchronous `time.sleep(2)` on the event loop, triggers `stop(1)`, and returns normally so `async_start()` keeps initializing during teardown.
- **`HttpServer.runner` uninitialized before `start()`** — `ledfx/http_manager.py:23-37,140-144` — Early startup failures raise `AttributeError` in `http.stop()`, skipping `await self.app.cleanup()`.
- **No re-entrancy guard in `LedFxCore.stop()` / `async_stop()`** — `ledfx/core.py:625-703` — Concurrent `stop()` calls spawn two `async_stop` tasks where the first cancels the second mid-cleanup.
- **Unsynchronized `Virtual.replace_config()` & `force_frame()` vs. render/audio threads** — `ledfx/virtuals.py:765-772,1386-1443,2368-2372` — Mutates `_config`, `frame_transitions`, `complex_segments`, `_device_remap`, `assembled_frame`, and `oneshots` without `self.lock`.
- **Unsynchronized `Virtual` fallback state** — `ledfx/virtuals.py:515-581,832-835` — `fallback_fire_set()` and `set_fallback()`/`fallback_clear()` run outside `self.lock`, racing with `set_effect(..., fallback=...)`.
- **Event emission under `self.lock` deadlock risk** — `ledfx/virtuals.py:652-678`, `ledfx/effects/__init__.py:413-416` — `EffectSetEvent`/`EffectClearedEvent`/`EffectUpdatedEvent` fire while holding non-reentrant `threading.Lock`s.
- **`Virtuals._apply_active()` rollback restores a destroyed effect** — `ledfx/virtuals.py:1959-1962,1983` — Restores `_active_effect = old_effect` after `set_effect()` already deactivated/unregistered it (`pixels=None`); `_set_active()` also skips restoring `{}` configs.
- **Concurrent `AudioAnalysisSource.update_config()` / `initialise_analysis()` vs. audio thread** — `ledfx/effects/audio.py:582-601,1156-1228` — Rebuilds `freq_mel_indexes` in-place while `freq_power()` indexes it (`IndexError`).
- **WASAPI multi-channel loopback fed to 1-channel `Resampler`** — `ledfx/effects/audio.py:801-815,1030-1089` — Loopback leaves `channels=None` (multi-channel) and passes flattened samples to a 1-channel `Resampler`.
- **Out-of-bounds / empty-slice / zero-division in `AudioAnalysisSource` & `AudioReactiveEffect`** — `ledfx/effects/audio.py:1207-1216,1308-1317,1392-1394,1499-1509` — `_selected_melbank` can default to `len(max_frequencies)`, `beat_max_mel_index` can default to a Hz value or `0`, `freq_power()` empty-slice `np.average` produces `NaN`, and `bar_oscillator()` divides by `beat_period == 0.0`.
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
- **`LedFxCore` leaks `asyncio` event loops and `RollingQueueHandler`s on restart (`exit_code == 4`)** — `ledfx/core.py:110,391-399,692-703`.
- **`Events.fire_event()` iterates `_listeners` unlocked and doesn't check `loop.is_closed()`** — `ledfx/events.py:649-703`.
- **`assets.py` unlocked in-place `.asset_metadata_cache.json` writes & non-atomic Windows rename** — `ledfx/assets.py:119-135,396-401`.
- **`Scenes.create()` crashes on `DummyEffect` during fade-out and collides on generated IDs** — `ledfx/scenes.py:69-74`.
- **`Scenes.deactivate()` clears effects on virtuals marked `action="ignore"`** — `ledfx/scenes.py:286-288`.
- **`PlaylistManager._advance_index()` bugs on 1-item playlists, pause timing, and empty `_order` `ZeroDivisionError`** — `ledfx/playlists.py:291,691-717`.
- **`AudioReactiveEffect.melbank()` `@cache` race on `cache_clear()` and shared slice mutation** — `ledfx/effects/audio.py:1468-1472,1580-1603`.
- **`SilenceSceneController` retry loop, `_operation` clobber, and unlocked shared flags** — `ledfx/silence_scene.py:224-234,448-457,616-630`.
- **`AudioInputSource._timer` unsynchronized and failed `open_audio_stream()` leaks `_stream`** — `ledfx/effects/audio.py:816-881`.
- **Missing `OUTPUT_KEYS` / `config_updated()` runtime handling** — `ledfx/devices/adalight.py:41-56`, `openrgb.py:63-65`, `zengge.py:31-43`.
- **Unclipped pixel integer wraparound / channel bleed** — `ledfx/devices/lifx.py:57-99`, `rpi_ws281x.py:129-140`.
- **`Govee.activate()` blocks event loop and `flush()` uses `udp_server` unlocked** — `ledfx/devices/govee.py:114-160`.
- **`SocketSingleton.__init__` mutates `ref_count` outside `_lock`** — `ledfx/devices/utils/socket_singleton.py:26-47`.
- **`Integration.deactivate()` doesn't await `disconnect()`; `MQTT` logs plaintext password; `MQTT`/`MQTT_HASS` miss `rc == 0` and payload guards; `QLC` leaks listeners & fails on `CLOSE` frames** — `ledfx/integrations/__init__.py:55-59`, `mqtt.py:58,64-88`, `mqtt_hass.py:153-500`, `qlc.py:75-85,344-368`.
- **`AlbumArtResolver._resolve` `finally` clobbers newer task; `MusicBrainzArtProvider` unbounded `resp.read()` & per-request `ClientSession`** — `ledfx/nowplaying/album_art/resolver.py:66-85,146-147`, `musicbrainz.py:567-612`.

### Low
- **`ConfigStore.save_now()` / `flush_sync()` increment `_seq` and call `serialise()` unlocked; `replace()` doesn't reset `unreadable`** — `ledfx/configuration/store.py:234-278,344-359`.
- **Second `KeyboardInterrupt` during shutdown aborts `loop.run_forever()` before cleanup** — `ledfx/core.py:466-478`.
- **`SilenceSceneController` synchronous `fsync` on event loop** — `ledfx/silence_scene.py:555-586`.
- **`smooth()` clamps kernel radius to roughly half the intended width** — `ledfx/effects/__init__.py:239-240`.
- **`RPI_WS281X` lacks synchronization between `config_updated()` and `flush()`** — `ledfx/devices/rpi_ws281x.py:78-86`.
- **`MQTT` / `MQTT_HASS` call `username_pw_set("", "")` when `username` defaults to `""`** — `ledfx/integrations/mqtt.py:117-118`, `mqtt_hass.py:764-765`.

## Fixed
- **Fork / DJ Controller:**
  - **Update Scene** no longer uses destructive `snapshot: true` when updating an existing scene: it now preserves `ignore`/`stop`/`forceblack` actions and only updates the scene's tracked active virtuals.
  - Virtual toggle threw `e.currentTarget is null` after `await` (captured the element first).
  - API errors showed `200 OK` instead of the real reason (`payload.reason` now read).
  - UI did not show disconnects / did not re-sync after reconnect.
  - Top status bar and palette strip did not follow scene changes.
  - Scene preview strip drew empty virtuals and missed colors stored under non-`gradient` keys.
- **Core / Devices / Audio (`da1af616`):**
  - Cross-thread calls from `SendspinAudioThread` into `NowPlayingService` and main event loop marshaled via `call_soon_threadsafe`.
  - `AudioInputSource._callbacks` mutation/iteration protected with `self.lock`; read-only audio buffers copied before NaN cleanup.
  - `Melbank` filterbank `coeffs` and `mel_gain` clamped to prevent division-by-zero `NaN` latching.
  - `Virtual` `clear_frame` `call_later()` marshaled onto the main event loop; `None` guard added for `transition_frame`.
  - `Device._pixels` protected with `self.lock`; `clear_virtual_segments()` invalidates cache on all segment removals.
  - `WLEDDevice` dual-resolution race, offline startup init, HTTP `/json` error fallback, and `add_postamble()` empty-segments guard fixed.

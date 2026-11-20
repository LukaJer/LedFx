# BUGS.md

Known bugs and review findings for the fork additions (DJ controller, physical layouts, 5-band EQ & autogain, auto-reconnect toggle, and tube-native effects). Reviewed at commit `4f4b440d` (+ uncommitted `ledfx_control/performance.js` and `config/config.json`). Keep this file up to date: add new findings, move fixed items to "Fixed".

Severity: **H** = high (crash, race, data/state corruption, silent breakage), **M** = medium (real user-visible breakage), **L** = low (edge case / hardening / static checks).

## TODO / Planned

- **Audio Auto-Gain (AGC) improvements** — `ledfx/effects/audio.py`, `ledfx/effects/melbank.py`, `ledfx_control/audio-eq.js`:
  - `autogain_speed` control is implemented; live AGC scale / `mel_gain` / `volume_threshold` readouts and tuning against pumping during breakdowns remain open (see also `L10`).
- **Speed & Sensitivity controls** — `ledfx_control/performance.js`, `ledfx_control/previews.js`:
  - `unscaleAroundDefault()`, `inferSceneCtlPct()`, double-click reset (including deck cards), and per-deck Sensitivity scoping are implemented; further tuning across custom effect ranges remains open.
- **Separate Palette / Speed / Brightness controls per layer (Main, Background, Flash)** — `ledfx-control.html`, `ledfx_control/*`:
  - Provide independent Palette, Speed, and Brightness controls for **Main elements**, **Background** (`background_color`, `background_brightness`, `bg_reactive_*`), and **Flash / Beat** (`beat_flash`, `flash_color`, `strobe_color`, `sparks_color`, `hit_color`), dynamically adapting the UI controls shown based on the active scene effect's schema.

## Open

### High

### H2. `LayoutsEndpoint.put()` is non-atomic on partial failure
- **Where:** `ledfx/api/layouts.py:175-210`.
- **Problem:** Virtuals are mutated sequentially via `set_config()` then `set_segments()`. If a later virtual fails (or `set_segments()` fails after `set_config()` changed `rows`/`grouping` on the same virtual), earlier virtuals remain altered while `active_layout_id` stays unchanged.
- **Fix:** Pre-validate all target `VirtualConfig` models and `_v1_segments` constraints before applying changes, or snapshot and roll back all modified virtuals on error.

### H3. `LayoutsEndpoint.post()` defaults `snapshot=True` on metadata-only updates
- **Where:** `ledfx/api/layouts.py:55, 119-145`.
- **Problem:** `snapshot = data.get("snapshot", virtuals_payload is None)` defaults to `True` even when `id` is passed to update an existing layout without `"virtuals"` (e.g. renaming or updating tags/grid), overwriting saved `virtuals` with current live virtuals and unconditionally setting `active_layout_id = layout_id`.
- **Fix:** Default `snapshot` to `False` when updating an existing `raw_id`, and only change `active_layout_id` when creating/switching or explicitly requested.

### H4. `LayoutsEndpoint` bypasses `SafeMode` and calls blocking `save_now()` on the event loop
- **Where:** `ledfx/api/layouts.py:36-155, 157-228, 230-255`, `ledfx/configuration/store.py:268-278`.
- **Problem:** `post()`, `delete()`, and `put()` (when `profile.virtuals` is empty or skipped) never call `ensure_writable(self._ledfx)`. In `SafeMode`, they mutate `self._ledfx.config`, ignore `save_now() == False`, and still return `200 {"status": "success"}`. Calling `request_save()` followed immediately by `save_now()` also executes synchronous `os.fsync()` on the event loop.
- **Fix:** Call `ensure_writable(self._ledfx)` at the top of `post()`, `put()`, and `delete()`, and use `request_save()` (or `await config_store.flush()` off-thread) instead of blocking `save_now()`.

### H8. Cloning a virtual in the Scene Editor wipes `sceneDraftVirtuals` mid-flow
- **Where:** `ledfx_control/scenes-virtuals.js:689-730, 761-793`, `ledfx_control/core.js:467`.
- **Problem:** `wireVirtualMappingBar` clones the virtual, stops `oldVid` / starts `newVid` (`:721-722`), then calls `await loadLayouts()` (`:724`), which triggers `renderScenes()` (`core.js:467`) → `renderSceneEditor()` (`scenes-virtuals.js:28`), clearing `sceneDraftVirtuals = {}` and `sceneReplacedVirtuals = new Set()` (`:761-762`) right before the `onCloned` callback (`:779-781`) runs.
- **Fix:** Preserve `sceneDraftVirtuals`/`sceneReplacedVirtuals` across `loadLayouts()`/`renderScenes()` refreshes, or invoke `onCloned` against the preserved draft and re-render only after cloning finishes.

### H9. Stale `activePalettePatch` reverts saved gradient edits; Scene Editor updates lose unsaved edits on palette click
- **Where:** `ledfx_control/scenes-virtuals.js:89, 766, 796-847`, `ledfx_control/performance.js:160, 164-166`.
- **Problem:** `applyPalette()` writes `activePalettePatch[id] = patch` and calls `renderSceneEditor(editingSceneId)` (`performance.js:165`), overwriting any other unsaved edits in `sceneDraftVirtuals`. Worse, `saveEditedScene()` (`scenes-virtuals.js:839-842`) persists changes and awaits `loadScenes()` → `renderSceneEditor()`, but never clears `activePalettePatch` — so line `:766` merges the stale `activePalettePatch[vid]` right back over the newly saved `eff.config`, reverting gradient edits in the editor and on a second Update click.
- **Fix:** Clear saved virtuals from `activePalettePatch` in `saveEditedScene()`, and patch color fields in `sceneDraftVirtuals` in-place rather than discarding unsaved edits on `applyPalette()`.

### H10. Scene Studio drops `stop` / `forceblack` / `ignore` virtual entries on save
- **Where:** `ledfx_control/scenes-virtuals.js:885-895, 1090-1109`.
- **Problem:** `loadStudioScene()` only loads virtuals with `eff && eff.type` into `studioDraftVirtuals`, dropping `stop`, `forceblack`, `ignore`, and `{}` entries. Saving via `saveStudioScene(false)` (`:1095, 1104`) overwrites `scene.virtuals` with `studioDraftVirtuals` alone, silently deleting those virtual actions.
- **Fix:** Preserve non-activate virtual entries from the original scene and merge them back when building `payload.virtuals`.

### H11. Async `activateScene()` race and cross-deck `lastScene` overwrite *(extends L6)*
- **Where:** `ledfx_control/scenes-virtuals.js:87-113`, `ledfx_control/core.js:152-163`.
- **Problem:** `activateScene()` has no request/sequence token across `await quantWait(...)`, `await api('/scenes', PUT)`, `await loadVirtuals()`, and `await restoreSceneCtl(...)`, so rapid or quantized calls can apply DOM `.cur`, `lastDeckScene`, `lastScene`, and `restoreSceneCtl` out of order. Deck-scoped activations (`activateScene(id, deckId)`) also overwrite global `lastScene` and `curPalette` via `syncSceneDisplay(id)`.
- **Fix:** Track a monotonic activation token per target deck/global scope and ignore superseded continuations; keep deck-card activations from clobbering unrelated decks' `lastScene`/`curPalette`.

### Medium

### M1. `/control`, `/dj`, and `/ledfx_control/*` return 404 in installed / frozen builds
- **Where:** `ledfx/http_manager.py:70-85` (`dj_control`, `/ledfx_control`), `pyproject.toml:86-98` (`[tool.pdm.build].includes`).
- **Problem:** Both `<repo root>/ledfx-control.html` and `<repo root>/ledfx_control/` live outside the `ledfx` package and are omitted from `includes`, so wheels and PyInstaller builds do not ship the DJ controller or its JS/CSS modules.
- **Fix:** Move `ledfx-control.html` and `ledfx_control/` inside `ledfx/` or `ledfx_assets/` (or add them to `[tool.pdm.build].includes`) and update `ledfx/http_manager.py`.

### M3. Several scenes can show as active at once
- **Where:** `ledfx/scenes.py:311-392` (`is_active()`), partly mitigated in `ledfx_control/scenes-virtuals.js:10-25` and `ledfx_control/previews.js:166-177`.
- **Problem:** Each scene is evaluated independently and `ignore`/`{}` virtuals always match, so overlapping scenes all report `active: true` (also in the stock LedFx UI). The controller relies on `lastScene`/`lastDeckScene` and most-active-effects heuristics rather than backend truth.
- **Fix:** Track the last activated scene id in the backend (`Scenes.activate`) and expose it instead of inferring from live virtual state.

### M7. `TubeKickStrobeEffect` exposes dead inherited config fields
- **Where:** `ledfx/effects/tube_kick_strobe.py:18-46`, `ledfx/effects/tube_base.py:21-40`.
- **Problem:** `TubeKickStrobeEffect` inherits `speed`, `reactivity`, `color_by_intensity`, and redeclares `beat_flash: 0.0` from `TubeEffectBase.Config`, none of which are read in `render()` or `_render_grid()`.
- **Fix:** Avoid inheriting unused fields (or honor them in `render()`), keeping only active audio-envelope config (`decay`).

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

### M19. `getTubePixelsFromVirtuals` ignores `virt.active` and both previews assume `mapping === 'span'`
- **Where:** `ledfx_control/previews.js:527-589, 841-850`, `ledfx/virtuals.py:762-766`.
- **Problem:** `getTubePixelsFromVirtuals` (`:537`) does not require `virt?.active`, so a recently deactivated virtual that emits an all-black `clear_frame` (`virtuals.py:765`) can shadow an active virtual within `2000ms` when `dt > 500`. Both `getTubePixelsFromVirtuals` (`:572`) and `drawLayoutPreview` (`:842`) assume `mapping === 'span'`, misrendering `mapping === 'copy'` virtuals.
- **Fix:** Prioritize/require `virt?.active` in `getTubePixelsFromVirtuals`, and branch on `virt?.config?.mapping === 'copy'` in both previewers.

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

### L1. `POST /api/devices/{id}` reports success when the device is still offline
- **Where:** `ledfx/api/device.py:79-113` (`post`), `ledfx_control/audio-eq.js:113-121`.
- **Problem:** `resolve_address()` swallows `ValueError` and sets `_online = False`, then `device.activate()` runs and the endpoint returns `{"status": "success"}`. The UI toast says "Connected" even when the device remains offline.
- **Fix:** Check `device.is_online()` after resolving and return an error / `online: false`; have the UI check it.

### L2. Re-enabling `auto_reconnect_devices` does not restart retries
- **Where:** `ledfx/devices/native_packet.py:106-141`, `ledfx/devices/wled.py:177-194`.
- **Problem:** With the toggle off, `_schedule_retry` / `trigger_reconnect` / the WLED retry stop scheduling. Turning it back on does not subscribe to `Event.BASE_CONFIG_UPDATE` or re-arm retries for devices that are already offline until connected manually or triggered by a send error.
- **Fix:** Subscribe to `Event.BASE_CONFIG_UPDATE` and call `resolve_address()` for requested offline devices when re-enabled.

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

### L12. Minor UI polish: duplicate `#mainZoneBar`, per-deck palette rotate fallback, undefined `--warn`, stale `hiddenScenes`, Scene Editor draft loss
- **Where:** `ledfx-control.html:43, 95`, `ledfx_control/core.js:270, 313`, `ledfx_control/control.css:1-5, 313`, `ledfx_control/performance.js:1074`, `ledfx_control/scenes-virtuals.js:68, 853-861, 935`.
- **Problem:** `id="mainZoneBar"` appears twice (`ledfx-control.html:43, 95`), leaving the second div permanently hidden/unused (`core.js:270`). `stepDeckPalCycler()` (`performance.js:1074`) falls back to global `curPalette` when `dc.pal` is cleared instead of the deck's current scene colors (`extractSceneColors(scenesCache[lastDeckScene[deckId]])`). `--warn` is undefined in `control.css:1-5`. `hiddenScenes` (`localStorage`) never prunes deleted scene IDs, inflating `#stPickerCount` (`scenes-virtuals.js:935`). Clicking `.cyc-pick` in `renderScenes()` (`:68`) re-runs `renderSceneEditor()`, discarding unsaved drafts.
- **Fix:** Remove duplicate `#mainZoneBar`, fall back to the deck's active scene colors, define `--warn` in `:root`, prune `hiddenScenes` against `scenesCache`, and avoid re-rendering Scene Editor on pool checkbox clicks.

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
- **Fork / DJ Controller, Tube Effects & Audio:**
  - **`H1` (`ledfx/effects/audio.py`):** `AudioAnalysisSource.update_config()` now only runs `initialise_analysis()` when FFT/sample-rate/tempo/onset/pitch method settings change (keeping BPM/tempo intact on EQ/gain/beat-range edits), swaps `freq_mel_indexes` atomically, and guards `bar_oscillator()` against `beat_period <= 0`.
  - **`M5` & `M6` (`ledfx/effects/tube_base.py`):** Added `TubeEffectBase.config_updated()` delegating to `GradientEffect.config_updated()` (fixing live palette/gradient updates across all 14 tube effects) and forcing `self.mirror = False` so `Effect.get_pixels()` does not apply 1D strip folding.
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
- **Core / Devices / Audio (`da1af616`):**
  - Cross-thread calls from `SendspinAudioThread` into `NowPlayingService` and main event loop marshaled via `call_soon_threadsafe`.
  - `AudioInputSource._callbacks` mutation/iteration protected with `self.lock`; read-only audio buffers copied before NaN cleanup.
  - `Melbank` filterbank `coeffs` and `mel_gain` clamped to prevent division-by-zero `NaN` latching.
  - `Virtual` `clear_frame` `call_later()` marshaled onto the main event loop; `None` guard added for `transition_frame`.
  - `Device._pixels` protected with `self.lock`; `clear_virtual_segments()` invalidates cache on all segment removals.
  - `WLEDDevice` dual-resolution race, offline startup init, HTTP `/json` error fallback, and `add_postamble()` empty-segments guard fixed.

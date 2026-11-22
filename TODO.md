# TODO

## DJ Controller & Live Performance
- [x] Split HTML (`ledfx-control.html` + `ledfx_control/*`)
- [x] Scene Cycler on the main tab similar to the color cycler (`previews.js` deck cards + `performance.js` `deckSceneCycleState`)
- [x] Toggle to use tapped/manual BPM or auto-recognized BPM (`#autoBpmBtn`)
- [x] Momentary "Hold-to-FX" Performance Pads (`Z`/`X`/`C`/`V` shortcuts, non-destructive oneshot Blackout/Blinder overlays, BPM Build Up, per-layout `FX Settings` for Strobe & Palette Punch, Sim View oneshot rendering)
- [x] Master Energy / "Hype" Macro Dial (`hype-drop.js`, Chill/Groove/Peak snaps, optional `Scale Bri` default OFF, Scene Cycler tag filter, `Cue on Drop` & `Drop Flash`)
- [ ] Improve/change/fix sensitivity & speed sliders (`unscaleAroundDefault()`, `inferSceneCtlPct()`, `dblclick` reset, and per-deck Sensitivity scoping done; further tuning across custom effect ranges remains open)
- [ ] Speed slider should mostly affect movement speed (currently prioritizes movement keys in `buildSpeedPatch()` and falls back to `decay`/`gradient_roll`)
- [ ] Improve Vibe Macros
- [ ] Check Target & Hit controls (Hold-to-FX pads & active-virtual filtering implemented; hardware verification still open)
- [ ] Separate Palette / Speed / Brightness controls per layer (Main, Background, Flash) — independent controls for Main elements, Background (`background_color`, `background_brightness`, `bg_reactive_*`), and Flash/Beat (`beat_flash`, `flash_color`, `strobe_color`, `sparks_color`, `hit_color`), adapting to the active effect schema (`ledfx-control.html`, `ledfx_control/*`)

## Scenes, Layouts & Setups
- [x] Scene tab (`#pane-scenes` Scene Editor & Creator)
- [x] Better separation between virtuals and tubes in the Virtuals tab (`Virtuals & Tubes` + `#virtViewSeg` toggle)
- [x] When creating/editing a layout, choose which scenes to copy from other layouts
- [x] Minimal / Deep House Pack (`front`/`back` `Candle Shimmer`, `Sunset Horizon`, `Deep Pulse`, `Minimal Afterglow`, and `Deep House Duo` in `config/config.json`)
- [ ] Scene Variants / Grouping — group similar scenes (even with different underlying effects/virtuals) into one card with variant pills, stored in `config.json` (optional `scene_group` + `variant_label` on `Scene`); re-clicking an active grouped tile cycles to the next variant; do not auto-group existing scenes until the user specifies which ones to group
- [ ] Setups
- [ ] Improve layout tab
- [ ] Audit scene/layout create & modify flows for accidental overwrites, and clarify which buttons are temporary vs. persisted config changes

## Audio, BPM & Effects
- [x] Autogain settings / gain settings
- [x] Envelope-Driven Drop & Breakdown Detector (`AudioAnalysisSource._update_energy_envelope`, AGC `_breakdown_hold` freeze, `GraphUpdateEvent` telemetry, `TubeEffectBase` breakdown damping / drop accent, `#stEnergyPill` HUD)
- [ ] Audio Auto-Gain (AGC) tuning — live AGC scale / `mel_gain` / `volume` readouts (`#agcReadout`) and `_breakdown_hold` freeze implemented; tuning during live transitions remains open
- [ ] Check sound-to-light algorithm
- [ ] Improve BPM detection — `aubio.tempo` still reads ~40 BPM too high on live tracks even with 160 Hz LPF + confidence/median smoothing (`AudioAnalysisSource.detected_bpm`); Tap is default in `/control` (`#autoBpmBtn`)
- [ ] Fix effects that struggle with fast music
- [ ] Energy/bass strength effect on effect speed
- [ ] RGBW support

## Packaging, Performance & Long Term
- [ ] Performance improvements
- [ ] Executable / AppImage creator
- [ ] Long term: remove unused features, vastly improve mapping & scene creation

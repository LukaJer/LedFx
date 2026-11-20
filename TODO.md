# TODO

## DJ Controller & Live Performance
- [x] Split HTML (`ledfx-control.html` + `ledfx_control/*`)
- [x] Scene Cycler on the main tab similar to the color cycler (`previews.js` deck cards + `performance.js` `deckSceneCycleState`)
- [x] Toggle to use tapped/manual BPM or auto-recognized BPM (`#autoBpmBtn`)
- [ ] Improve/change/fix sensitivity & speed sliders (`unscaleAroundDefault()`, `inferSceneCtlPct()`, `dblclick` reset, and per-deck Sensitivity scoping done; further tuning across custom effect ranges remains open)
- [ ] Speed slider should mostly affect movement speed (currently prioritizes movement keys in `buildSpeedPatch()` and falls back to `decay`/`gradient_roll`)
- [ ] Improve Vibe Macros
- [ ] Check Target & Hit controls (per-zone Hit state/tokens fixed; verify on hardware)
- [ ] Separate Palette / Speed / Brightness controls per layer (Main, Background, Flash) — independent controls for Main elements, Background (`background_color`, `background_brightness`, `bg_reactive_*`), and Flash/Beat (`beat_flash`, `flash_color`, `strobe_color`, `sparks_color`, `hit_color`), adapting to the active effect schema (`ledfx-control.html`, `ledfx_control/*`)

## Scenes, Layouts & Setups
- [x] Scene tab (`#pane-scenes` Scene Editor & Creator)
- [x] Better separation between virtuals and tubes in the Virtuals tab (`Virtuals & Tubes` + `#virtViewSeg` toggle)
- [x] When creating/editing a layout, choose which scenes to copy from other layouts
- [ ] Setups
- [ ] Improve layout tab
- [ ] Audit scene/layout create & modify flows for accidental overwrites, and clarify which buttons are temporary vs. persisted config changes

## Audio, BPM & Effects
- [x] Autogain settings / gain settings
- [ ] Audio Auto-Gain (AGC) tuning — live AGC scale / `mel_gain` / `volume` readouts implemented (`#agcReadout`); tuning against pumping during breakdowns remains open
- [ ] Check sound-to-light algorithm
- [ ] Improve BPM detection — `aubio.tempo` still reads ~40 BPM too high on live tracks even with 160 Hz LPF + confidence/median smoothing (`AudioAnalysisSource.detected_bpm`); Tap is default in `/control` (`#autoBpmBtn`)
- [ ] Fix effects that struggle with fast music
- [ ] Energy/bass strength effect on effect speed
- [ ] RGBW support

## Packaging, Performance & Long Term
- [ ] Performance improvements
- [ ] Executable / AppImage creator
- [ ] Long term: remove unused features, vastly improve mapping & scene creation

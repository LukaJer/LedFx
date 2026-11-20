# TODO

## DJ Controller & Live Performance
- [ ] Improve/change/fix sensitivity & speed sliders (`unscaleAroundDefault()`, `inferSceneCtlPct()`, `dblclick` reset, and per-deck Sensitivity scoping done; further tuning across custom effect ranges remains open)
- [ ] Scene Cycler on the main tab similar to the color cycler
- [ ] Improve Vibe Macros
- [ ] Check Target & Hit controls
- [ ] Separate Palette / Speed / Brightness controls per layer (Main, Background, Flash) — independent controls for Main elements, Background (`background_color`, `background_brightness`, `bg_reactive_*`), and Flash/Beat (`beat_flash`, `flash_color`, `strobe_color`, `sparks_color`, `hit_color`), adapting to the active effect schema (`ledfx-control.html`, `ledfx_control/*`)

## Scenes, Layouts & Setups
- [ ] Setups
- [ ] Improve layout tab
- [ ] Better separation between virtuals and tubes in the Virtuals tab (maybe rename)
- [ ] Audit scene/layout create & modify flows for accidental overwrites, and clarify which buttons are temporary vs. persisted config changes

## Audio, BPM & Effects
- [ ] Check sound-to-light algorithm
- [ ] Audio Auto-Gain (AGC) tuning & live readouts — live AGC scale / `mel_gain` / `volume_threshold` readouts and tuning against pumping during breakdowns (`ledfx/effects/audio.py`, `ledfx/effects/melbank.py`, `ledfx_control/audio-eq.js`; see `BUGS.md` `L10`)
- [ ] Improve BPM detection
- [ ] Fix effects that struggle with fast music
- [ ] RGBW support

## Packaging, Performance & Long Term
- [ ] Performance improvements
- [ ] Executable / AppImage creator
- [ ] Long term: remove unused features, vastly improve mapping & scene creation

## Done
- [x] Scene tab
- [x] Autogain settings / gain settings
- [x] When creating/editing a layout, choose which scenes to copy from other layouts
- [x] Split HTML (`ledfx-control.html` + `ledfx_control/*`)
- [x] Toggle to use tapped/manual BPM or auto-recognized BPM (`#autoBpmBtn`)

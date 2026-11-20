# TODO

- [x] Scene tab
- [ ] Improve/change/fix sensitivity & speed sliders (`unscaleAroundDefault()`, `inferSceneCtlPct()`, `dblclick` reset, and per-deck Sensitivity scoping done; further tuning across custom effect ranges remains open)
- [ ] Setups
- [ ] Improve layout tab
- [ ] Check sound-to-light algorithm
- [ ] RGBW support
- [x] Autogain settings / gain settings
- [ ] Audio Auto-Gain (AGC) tuning & live readouts — live AGC scale / `mel_gain` / `volume_threshold` readouts and tuning against pumping during breakdowns (`ledfx/effects/audio.py`, `ledfx/effects/melbank.py`, `ledfx_control/audio-eq.js`; see `BUGS.md` `L10`)
- [ ] Better separation between virtuals and tubes in the Virtuals tab (maybe rename)
- [ ] Executable / AppImage creator
- [ ] Performance improvements
- [ ] Scene Cycler on the main tab similar to the color cycler
- [x] When creating/editin a  layout being able to choose which scenes to copy from other layouts
- [ ] Improve Vibe Macros
- [ ] Check Target & Hit controls
- [x] split html maybe?
- [ ] forany functions which create a new scene/layout/etc or modify it and check whether the saving is done correctly and how eas it is for the user to accidentialy overwrite it. also clarify what buttons do, if its temporary or if a config change occurs 
- [ ] add a toggle to use the tapped bpm or the recognized
- [ ] some effects have a problem with fast music

- [ ] Separate Palette / Speed / Brightness controls per layer (Main, Background, Flash) — independent controls for Main elements, Background (`background_color`, `background_brightness`, `bg_reactive_*`), and Flash/Beat (`beat_flash`, `flash_color`, `strobe_color`, `sparks_color`, `hit_color`), adapting to the active effect schema (`ledfx-control.html`, `ledfx_control/*`)

- [ ] long term: remove unused features, vastly improve mapping & scene creation

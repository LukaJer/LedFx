# LedFx DJ & Tube Rig — Feature, Effect & Scene Ideas

Ideas tailored to the current **10× WLED 36-segment RGBW tube rig** (`wledbb00`–`wledbb09`) across the `front`, `back`, `libelle`, and `single` layouts, paired with the live DJ Controller (`/control`).

---

## 1. New Tube-Native Effects (`4-side × 9-ring` & Multi-Tube)

- **`tube_chase` / `tube_relay` — Ping-Pong & Multi-Tube Chase** *(High impact · Medium effort)*
  - Passes an energy packet or glowing ring from tube to tube on each kick or onset (`L→R`, `R→L`, center-out, or non-repeating random), leaving a decaying afterglow trail on previous tubes across Front + Back.
- **`tube_meteor` — Comet / Meteor Shower** *(Medium-High impact · Low-Medium effort)*
  - Gravity-accelerated vertical streaks firing upward on bass hits or falling on hi-hat/mid onsets, with independent per-side phase so all 4 faces shimmer in 3D instead of looking flat.
- **`tube_scanner` — 360° Moving-Head Beam** *(High impact · Low-Medium effort)*
  - Treats the 4 sides around each tube as a rotating beam (1 primary face lit with soft spill onto adjacent sides) that speeds up with mid/high energy and snaps direction or flashes all 4 faces on kicks. Per-tube phase offsets let all 10 tubes sweep the room like synchronized moving heads.
- **`tube_band_stack` — 3-Band Frequency Totem** *(Medium-High impact · Low effort)*
  - Maps bottom 3 rings to sub/kick, middle 3 rings to mids/vocals, and top 3 rings to hi-hats/air using the EQ/spectrum zones—much more readable on 9 rings than a dense 1D spectrum.
- **`tube_riser` — Breakdown & Build-Up Riser** *(High impact · Medium effort)*
  - Smoothly fills tubes bottom-to-top while accelerating flicker/helix spin from sustained high-mid energy (snare rolls) or a manual Build trigger, exploding full-bright on the drop.
- **`tube_lava` — Seamless Cylindrical 3D Plasma** *(Medium impact · Medium effort)*
  - Wraps 3D simplex/periodic noise cleanly around the 4 tube sides (zero seam) for lush slow-house and deep ambient sets.
- **`tube_alt_pulse` — Call-and-Response Alternator** *(Medium impact · Low effort)*
  - Alternates opposite faces (sides `0+2` vs `1+3`) or even/odd tube groups on every beat/onset, with smooth crossfades for house or razor cuts for techno.

---

## 2. New Scenes & Multi-Zone Choreography (`front` / `back` / `libelle`)

- **Front-to-Back Depth Wave** *(High impact · Low effort)*
  - Front pillars run tight bass-reactive ring/kick hits while Back pillars run a slower ambient rim or delayed echo, giving the room genuine front-to-back depth instead of every tube flashing identically.
- **Minimal / Deep House Pack** *(High impact · Low effort)*
  - *Candle / Amber Shimmer*: warm tungsten palette with gentle 4-side drift, zero harsh strobes, slow breathing.
  - *Sunset Horizon*: deep indigo/violet base fading into coral/gold rings that sway subtly with mids.
  - *Deep Pulse*: keeps tubes ~90% dark with a single warm rising ring on kicks.
- **Peak-Time Techno Pack** *(High impact · Low effort)*
  - *Industrial White + Single Accent*: cold white / crisp red kick strobes separated by deep blackness (high contrast makes strobes pop far harder).
  - *Laser Cage*: razor-thin vertical face slicing—only sides `0+2` in cyan/white, flipping cleanly to `1+3` on snares.
- **Breakdown / Vocal Sanctuary Scene** *(Medium-High impact · Low effort)*
  - Ignores sub/kick completely and shimmers softly on mids/highs so vocal breakdowns feel intentionally atmospheric rather than dark or jittery.

---

## 3. DJ Controller (`/control`) Live Performance Features

- **Momentary "Hold-to-FX" Performance Pads** *(Very high impact · Low effort)*
  - **Hold to Strobe**: overrides active virtuals with white/accent strobe while pressed and restores prior state on release.
  - **Hold to Blackout / Kill**: instant pre-drop kill switch—release right on beat 1.
  - **Hold to White Blinder**: warm/cold crowd wash on hold.
  - **4/8-Bar Build-Up Trigger**: Tap-BPM-synced brightness + speed ramp into a drop flash.
- **Browser WebMIDI Support (`navigator.requestMIDIAccess()`)** *(High impact · Medium effort)*
  - Zero Python dependencies: connect a Launchpad Mini, Akai LPD8, MIDI Fighter, or controller pads/knobs to trigger scenes, Vibe Macros, Hold-to-Strobe, Blackout, Tap BPM, Master Brightness, Speed, Sensitivity, and Strobe Guard.
- **Ableton Link / MIDI Clock BPM Sync** *(Very high impact · Medium effort)*
  - Replaces noisy audio-only BPM estimation (`aubio.tempo`) with sample-accurate BPM + 4-beat phase from Rekordbox, Traktor, Serato, VirtualDJ, or Ableton Link (`aalink` / `carabiner`).
- **Master Energy / "Hype" Macro Dial (`0%` Chill → `50%` Groove → `100%` Peak)** *(High impact · Low-Medium effort)*
  - Single control scaling brightness, speed, and strobe intensity together while optionally narrowing the Scene Cycler pool to matching energy tags.
- **Cross-Deck Sync / Mirror / Offset Toggle** *(Medium impact · Low effort)*
  - Syncs `front` and `back` decks to the same scene/palette with one click, or offsets `back` (half-speed, inverted palette, or 180° phase shift).
- **Scene Energy Tags & Filters (`chill` / `groove` / `peak` / `strobe`)** *(Medium impact · Low effort)*
  - Tag scenes by energy/intensity to filter the Scene Picker and restrict Scene Cycler pools during specific parts of a set.

---

## 4. High-Leverage Engine & System Upgrades

- **Native RGBW White-Channel Extraction** *(Very high impact · Medium effort · also in `TODO.md`)*
  - Route desaturated highlights and white strobes directly to the hardware `W` LED channel on `wledbb00`–`wledbb09` instead of mixing `R+G+B`—cleaner whites/pastels, punchier strobes, and lower LED heat/power draw.
- **Envelope-Driven Drop & Breakdown Detector** *(High impact · Medium effort)*
  - Compare short-term (~1s) vs long-term (~12s) bass energy in `AudioAnalysisSource`:
    - *Breakdown*: soften strobes, slow motion, and hold AGC steady so noise-floor pumping doesn't happen in quiet parts.
    - *Drop*: fire a 1-beat drop flash or auto-trigger a cued scene change when bass surges back in.
- **"Next Scene on Drop / Next Beat" Cueing** *(Medium-High impact · Medium effort)*
  - Let DJs cue the next scene so it activates cleanly on the next strong kick/downbeat instead of mid-bar.
- **Live Hardware Health Strip** *(Medium impact · Low-Medium effort)*
  - Compact header indicator for `wledbb00`–`wledbb09` showing online status / dropped frames / Wi-Fi RSSI so a weak signal or low battery stands out immediately before a blackout.

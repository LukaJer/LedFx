==========================================
LedFx DJ Fork — Live Tube & Audio Control
==========================================

Custom LedFx fork tailored for live DJ sets with 36-segment RGBW WLED tubes
(4 segments per side, 9 rings per tube) on Linux and macOS.

Quick Start
===========

.. code-block:: bash

   # Install dependencies
   uv sync --all-extras --dev

   # Run LedFx from source
   uv run ledfx

Once running, open the live DJ controller directly from LedFx (works from any
laptop, phone, or tablet on the same network with zero CORS/origin setup):

- ``http://127.0.0.1:8888/dj`` (or ``/control``)
- ``http://<your-lan-ip>:8888/dj``

What Was Added
==============

1. Live DJ Controller (``ledfx-control.html`` at ``/dj`` & ``/control``)
-----------------------------------------------------------------------

Served directly by ``HttpServer`` (``ledfx/http_manager.py``) and auto-connects
to ``location.host`` over HTTP/WebSocket:

- **Stage Layout & Scene Filtering:** 1-click switching between saved physical
  tube layouts, filtering scenes by ``scene_tags`` (with an **All Scenes**
  override).
- **Scenes & Safe Update:** Multi-tube color/gradient previews, active scene
  highlight, hover breakdown, and **Update Scene** (updates tracked active
  virtuals while preserving ``ignore`` / ``stop`` / ``forceblack`` actions).
- **Vibe Macros, Palettes & Palette Lab:** Instant palette + speed + sensitivity
  macros and custom palette creation.
- **Global Controls & Hits:** Master Brightness, Speed, Sensitivity, **Blackout**
  toggle, Tap Tempo, Quantize/Beat modes, Auto-pilot, Strobe Guard,
  Perform-Lock, and momentary **Hits** (``/api/virtuals_tools``).
- **Collapsible Virtuals & Tube Reconnect:** IDE-style collapsible Virtuals list,
  **Auto-Connect ON/OFF** toggle, and manual **Connect Offline** buttons.
- **Keyboard Shortcuts:** ``1``–``9`` (scenes), ``B`` (blackout), ``T`` (tap
  tempo), ``E`` (EQ & Spectrum tab), ``M`` (Main tab).

2. Zero-Latency 5-Band Incoming Audio EQ & Spectrum Analyzer
------------------------------------------------------------

- **Backend (``ledfx/effects/audio.py``, ``ledfx/configuration/models.py``):**
  5-band frequency-domain EQ (``60 Hz``, ``250 Hz``, ``1 kHz``, ``4 kHz``,
  ``12 kHz``, ``-24.0`` to ``+24.0 dB``) applied directly to the FFT magnitude
  spectrum in ``pre_process_audio()`` before melbank and beat analysis—zero
  added sample-buffer latency.
- **UI (**EQ & Spectrum** tab):** High-DPI log-frequency spectrum analyzer with
  decaying peak-hold markers, live EQ response curve overlay, DJ EQ presets
  (``Flat``, ``Bass Cut``, ``Sub Boost``, ``Scoop``, ``Crisp Highs``), and an
  audio input device selector (``/api/audio/devices``).

3. Physical Layout Profiles & Tube Arranger (``/api/layouts``)
--------------------------------------------------------------

- **Layout Profiles (``ledfx/api/layouts.py``, ``ledfx/configuration/models.py``):**
  Named ``layout_profiles`` stored in ``config.json`` (``GET/POST/PUT/DELETE /api/layouts``)
  capturing ``segments``, ``rows``, ``grouping``, and an optional ``scene_tag``
  so all logical scenes work across different stage arrangements and tube counts.
- **Visual Tube Arranger (**Layouts & Tubes** tab):** Include/exclude tubes,
  reorder (▲/▼), invert direction, set ``rows``, and switch between
  **Ring-Grouped** (``grouping=4``, 9 rings/tube) and **Full 36px**
  (``grouping=1`` for spirals/2D effects).

4. Device Auto-Reconnect Toggle & Stability Fixes
-------------------------------------------------

- **``auto_reconnect_devices`` (``LedFxConfig``):** Disables automatic
  background retries for offline WLED / ``NativePacketDevice`` tubes when you
  only bring a subset of tubes, paired with manual ``POST /api/devices/{id}``
  reconnect.
- **WLED / mDNS / Audio / Thread-Safety Fixes:** Timeout-enforced DNS/mDNS
  resolution with transient ``.local`` retries, safe ``Device._pixels`` locking,
  ``AudioInputSource._callbacks`` locking, ``Melbank`` NaN-latching guards,
  read-only audio buffer copy before NaN cleanup, and event-loop marshaling for
  ``Virtual`` / ``Sendspin`` callbacks.

Testing & Project Notes
=======================

.. code-block:: bash

   # Run unit tests for fork additions & device/audio fixes
   .venv/bin/pytest -v --noconftest \
     tests/test_audio_eq.py \
     tests/test_layouts.py \
     tests/test_wled_native_destination.py \
     tests/test_device_lifecycle_regressions.py \
     tests/test_device_config_locking.py \
     tests/test_virtual_clear_effect.py \
     tests/test_melbank_config.py

- ``AGENTS.md`` — Repo conventions and fork architecture summary.
- ``BUGS.md`` — Known open issues and resolved bug log.

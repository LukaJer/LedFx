"""Unit tests for the envelope-driven drop and breakdown detector."""

import asyncio
import json
import threading
from concurrent.futures import ThreadPoolExecutor
from types import SimpleNamespace
from typing import override
from unittest.mock import MagicMock

import aubio
import numpy as np
import pytest

from ledfx.api.audio_energy import AudioEnergyResetEndpoint
from ledfx.configuration.models import AudioConfig
from ledfx.effects.audio import AudioAnalysisSource, AudioInputSource
from ledfx.effects.math import ExpFilter
from ledfx.effects.melbank import Melbanks
from ledfx.effects.tube_base import TubeEffectBase
from ledfx.events import GraphUpdateEvent
from tests.test_utilities.fake_ledfx import fake_ledfx


def _make_analysis_source(
    min_volume: float = 0.2,
    start_ts: float = 100.0,
) -> AudioAnalysisSource:
    """Create a headless AudioAnalysisSource without opening an audio device."""
    ledfx = fake_ledfx()
    src = object.__new__(AudioAnalysisSource)
    src._ledfx = ledfx
    src._config = AudioConfig(min_volume=min_volume, fft_size=4096, sample_rate=60)
    callbacks: list[object] = []
    src.__dict__["_callbacks"] = callbacks
    src._has_volume_measurement = True
    src._volume_filter = ExpFilter(0.8, alpha_decay=0.99, alpha_rise=0.99)
    src._autogain_env = 0.1
    src._auto_scale = 1.0
    src._breakdown_hold = False
    src.initialise_analysis()
    src._energy_last_ts = start_ts
    return src


def _step_bass(
    src: AudioAnalysisSource,
    bass_level: float,
    start_t: float,
    duration_s: float,
    dt: float = 0.05,
    volume: float | None = 0.8,
) -> float:
    """Drive _update_energy_envelope over simulated time at constant bass level."""
    src._volume_filter.value = volume
    t = start_t
    steps = max(1, round(duration_s / dt))
    for _ in range(steps):
        t += dt
        src.melbanks.melbanks[0][:] = 0.0
        src.melbanks.melbanks[0][src.beat_min_mel_index : src.beat_max_mel_index] = (
            bass_level
        )
        src._update_energy_envelope(now=t)
    return t


class _DummyTubeEffect(TubeEffectBase):
    NAME = "Dummy Tube Test"

    @override
    def render(self) -> None:
        if self.pixels is not None:
            self.pixels[:] = 0.0


def test_steady_bass_stays_normal():
    t = 100.0
    src = _make_analysis_source(start_ts=t)

    t = _step_bass(src, 0.5, t, 45.0)

    assert src.energy_state() == "normal"
    assert src.drop_now() is False
    assert src._breakdown_hold is False
    assert src.bass_ratio() == pytest.approx(1.0, abs=0.05)


def test_sustained_bass_drop_enters_breakdown_and_holds_autogain():
    t = 100.0
    src = _make_analysis_source(start_ts=t)

    # Establish long-term bass energy >= 0.08
    t = _step_bass(src, 0.6, t, 20.0)
    long_before = src._energy_long
    assert long_before >= 0.35

    # Brief dip (< 2.5s after ratio < 0.35) should stay in normal
    t = _step_bass(src, 0.01, t, 2.0)
    assert src.energy_state() == "normal"
    assert src._breakdown_hold is False

    # Crossing 2.5s sustained low ratio enters breakdown and locks long baseline + autogain
    t = _step_bass(src, 0.01, t, 2.0)
    assert src.energy_state() == "breakdown"
    assert src.drop_now() is False
    assert src._breakdown_hold is True
    frozen_long = src._energy_long

    # Further breakdown frames keep _energy_long frozen
    _step_bass(src, 0.01, t, 2.0)
    assert src._energy_state == "breakdown"
    assert src._energy_long == pytest.approx(frozen_long)


def test_pre_process_audio_freezes_autogain_during_breakdown_hold():
    src = object.__new__(AudioInputSource)
    src._ledfx = fake_ledfx()
    src._config = AudioConfig(
        autogain=True,
        autogain_target=0.5,
        autogain_speed=0.5,
        min_volume=0.0,
        fft_size=512,
        mic_rate=44100,
        sample_rate=60,
    )
    src._eq_curve = None
    src._volume_filter = MagicMock()
    src._volume_filter.value = 0.5
    src._has_volume_measurement = False
    src.pre_emphasis = None
    src._phase_vocoder = aubio.pvoc(512, 512 // 2)  # pyrefly: ignore[missing-attribute]
    src._frequency_domain_null = aubio.cvec(512)  # pyrefly: ignore[missing-attribute]
    src._autogain_env = 0.25
    src._auto_scale = 2.0
    src._breakdown_hold = True

    quiet_sample = np.full(512 // 2, 0.01, dtype=np.float32)
    src._raw_audio_sample = quiet_sample.copy()
    src.pre_process_audio()

    # Held at existing scale and env without ramping up on quiet breakdown noise
    assert src._autogain_env == pytest.approx(0.25)
    assert src._auto_scale == pytest.approx(2.0)
    assert np.allclose(src._raw_audio_sample, quiet_sample * 2.0)

    # Even ultra-quiet (<5e-4 RMS) does not reset _auto_scale while held
    ultra_quiet = np.full(512 // 2, 1e-4, dtype=np.float32)
    src._raw_audio_sample = ultra_quiet.copy()
    src.pre_process_audio()
    assert src._auto_scale == pytest.approx(2.0)

    # Releasing hold resumes normal autogain tracking
    src._breakdown_hold = False
    src._raw_audio_sample = quiet_sample.copy()
    src.pre_process_audio()
    assert src._autogain_env < 0.25
    assert src._auto_scale != pytest.approx(2.0)

    # Mock created via object.__new__ without _breakdown_hold/_auto_scale never crashes
    bare = object.__new__(AudioInputSource)
    bare._ledfx = fake_ledfx()
    bare._config = AudioConfig(autogain=True, min_volume=0.0, fft_size=512)
    bare._eq_curve = None
    bare._volume_filter = MagicMock()
    bare._volume_filter.value = 0.5
    bare._has_volume_measurement = False
    bare.pre_emphasis = None
    bare._phase_vocoder = aubio.pvoc(512, 512 // 2)  # pyrefly: ignore[missing-attribute]
    bare._frequency_domain_null = aubio.cvec(512)  # pyrefly: ignore[missing-attribute]
    bare._raw_audio_sample = quiet_sample.copy()
    bare.pre_process_audio()
    assert bare._auto_scale > 1.0


def test_update_config_autogain_enable_resets_breakdown_hold():
    src = object.__new__(AudioInputSource)
    src._ledfx = fake_ledfx()
    callbacks: list[object] = []
    src.__dict__["_callbacks"] = callbacks
    src._eq_curve = None
    src._autogain_env = 0.3
    src._auto_scale = 2.0
    src._breakdown_hold = True
    src._config = AudioConfig(autogain=False)
    src._resolve_device_from_name = lambda: None

    src.update_config({"autogain": True})

    assert src._breakdown_hold is False
    assert src._auto_scale == 1.0
    assert src._autogain_env == 0.1


def test_bass_surge_from_breakdown_triggers_drop_and_expires():
    t = 100.0
    src = _make_analysis_source(start_ts=t)

    t = _step_bass(src, 0.6, t, 20.0)
    t = _step_bass(src, 0.01, t, 4.0)
    assert src.energy_state() == "breakdown"
    assert src._breakdown_hold is True

    # Bass surges back in -> immediate "drop"
    t = _step_bass(src, 0.7, t, 0.05)
    assert src.energy_state() == "drop"
    assert src.drop_now() is True
    assert src._breakdown_hold is False

    # Stays in "drop" during the 1.2s window
    t = _step_bass(src, 0.7, t, 1.0)
    assert src.energy_state() == "drop"
    assert src.drop_now() is True

    # Expires back to "normal" once 1.2s window elapses
    t = _step_bass(src, 0.7, t, 0.3)
    assert src.energy_state() == "normal"
    assert src.drop_now() is False


def test_drop_cooldown_prevents_retrigger():
    t = 100.0
    src = _make_analysis_source(start_ts=t)

    # Build up long-term bass (~0.37) and enter breakdown
    t = _step_bass(src, 0.50, t, 16.0)
    t = _step_bass(src, 0.01, t, 4.5)
    assert src.energy_state() == "breakdown"

    # Brief transient surge (just above 0.85 * _energy_long) triggers drop (sets 4.0s cooldown)
    surge = max(0.15, src._energy_long * 0.88)
    t = _step_bass(src, surge, t, 0.05)
    assert src.energy_state() == "drop"
    drop_start = t

    # Bass drops right back to 0.01 during the 1.2s drop window, then stays low for 2.55s
    t = _step_bass(src, 0.01, t, 1.25)
    assert src.energy_state() == "normal"
    t = _step_bass(src, 0.01, t, 2.55)
    assert src.energy_state() == "breakdown"
    assert t - drop_start < 4.0

    # Surge during active 4s cooldown goes to "normal", NOT "drop"
    t = _step_bass(src, 0.7, t, 0.05)
    assert src.energy_state() == "normal"
    assert src.drop_now() is False
    assert src._breakdown_hold is False

    # After cooldown expires, another breakdown + surge triggers "drop" again
    t = _step_bass(src, 0.01, t, 5.5)
    assert src.energy_state() == "breakdown"
    _step_bass(src, 0.7, t, 0.05)
    assert src.energy_state() == "drop"
    assert src.drop_now() is True


def test_silence_gate_decays_and_never_enters_breakdown():
    t = 100.0
    src = _make_analysis_source(min_volume=0.2, start_ts=t)

    t = _step_bass(src, 0.6, t, 20.0)
    short_before = src._energy_short
    long_before = src._energy_long

    # Silence (vol <= min_volume) for 5s should decay and stay normal
    t = _step_bass(src, 0.0, t, 5.0, volume=0.1)
    assert src.energy_state() == "normal"
    assert src._breakdown_hold is False
    assert src._energy_short < short_before * 0.1
    assert src._energy_long < long_before

    # vol=None also gates safely
    _step_bass(src, 0.0, t, 1.0, volume=None)
    assert src.energy_state() == "normal"
    assert src._breakdown_hold is False


def test_ambient_breakdown_timeout_resets_after_45s():
    t = 100.0
    src = _make_analysis_source(start_ts=t)

    t = _step_bass(src, 0.6, t, 20.0)
    t = _step_bass(src, 0.01, t, 4.0)
    assert src.energy_state() == "breakdown"
    assert src._breakdown_hold is True
    entered_since = src._breakdown_since

    # Still in breakdown just before 45s
    remaining_before = max(0.0, (entered_since + 44.9) - t)
    if remaining_before > 0:
        t = _step_bass(src, 0.01, t, remaining_before)
    assert src.energy_state() == "breakdown"

    # Crossing 45s ambient breakdown timeout resets safely to normal
    src.melbanks.melbanks[0][:] = 0.0
    src.melbanks.melbanks[0][src.beat_min_mel_index : src.beat_max_mel_index] = 0.01
    src._update_energy_envelope(now=entered_since + 45.05)
    assert src.energy_state() == "normal"
    assert src._breakdown_hold is False
    assert src._breakdown_since == 0.0

    # Staying at ambient level after timeout should remain normal (baseline adapted)
    _step_bass(src, 0.01, entered_since + 45.05, 3.5)
    assert src.energy_state() == "normal"


def test_mel_gain_normalization_does_not_mask_breakdown():
    t = 100.0
    src = _make_analysis_source(start_ts=t)
    proc0 = src.melbanks.melbank_processors[0]

    # Groove with mel_gain = 2.0 and normalized bass = 0.5 (raw bass = 1.0)
    proc0.mel_gain.value = 2.0
    t = _step_bass(src, 0.5, t, 20.0)
    assert src.energy_state() == "normal"

    # Breakdown: mel_gain decays to 0.2 so normalized melbanks[0] stays 0.5 (raw = 0.1)
    proc0.mel_gain.value = 0.2
    t = _step_bass(src, 0.5, t, 5.0)
    assert src.energy_state() == "breakdown"
    assert src._breakdown_hold is True

    src.reset_energy_envelope()
    assert src.energy_state() == "normal"
    assert src.drop_now() is False
    assert src._breakdown_hold is False
    assert src._energy_short == 0.0
    assert src._energy_long == 0.0
    assert src.bass_ratio() == 1.0


def test_graph_update_event_and_melbank_forward_drop_fields():
    melbank_arr = np.zeros(8, dtype=np.float64)
    freqs_arr = np.linspace(20.0, 1000.0, 8)

    # Backwards compatibility when optional drop fields are omitted
    ev_plain = GraphUpdateEvent("melbank_0", melbank_arr, freqs_arr)
    plain_dict = ev_plain.to_dict()
    assert "energy_state" not in plain_dict
    assert "drop_now" not in plain_dict
    assert "bass_ratio" not in plain_dict

    # Forwarded when specified
    ev_drop = GraphUpdateEvent(
        "melbank_0",
        melbank_arr,
        freqs_arr,
        energy_state="drop",
        drop_now=True,
        bass_ratio=1.85,
    )
    drop_dict = ev_drop.to_dict()
    assert drop_dict["energy_state"] == "drop"
    assert drop_dict["drop_now"] is True
    assert drop_dict["bass_ratio"] == 1.85

    # Melbanks.send_melbank_event with drop-detector audio
    ledfx = fake_ledfx()
    audio_with_drop = SimpleNamespace(
        _config=AudioConfig(min_volume=0.2, autogain=False),
        volume=lambda filtered=True: 0.75,
        energy_state=lambda: "breakdown",
        drop_now=lambda: False,
        bass_ratio=lambda: 0.24,
    )
    mb = Melbanks(ledfx, audio_with_drop, ledfx.config.melbanks.model_dump())
    mb.send_melbank_event(0)
    fired = ledfx.events.fire_event.call_args[0][0]
    assert isinstance(fired, GraphUpdateEvent)
    assert fired.energy_state == "breakdown"
    assert not hasattr(fired, "drop_now")
    assert fired.bass_ratio == 0.24

    # Melbanks.send_melbank_event with lightweight mock lacking drop methods
    ledfx_mock = fake_ledfx()
    audio_plain = SimpleNamespace(
        _config=AudioConfig(min_volume=0.2, autogain=False),
        volume=lambda filtered=True: 0.5,
    )
    mb_plain = Melbanks(ledfx_mock, audio_plain, ledfx_mock.config.melbanks.model_dump())
    mb_plain.send_melbank_event(0)
    fired_plain = ledfx_mock.events.fire_event.call_args[0][0]
    assert not hasattr(fired_plain, "energy_state")
    assert not hasattr(fired_plain, "drop_now")
    assert not hasattr(fired_plain, "bass_ratio")


def test_tube_effect_base_breakdown_damps_and_drop_boosts():
    ledfx = fake_ledfx()
    effect = _DummyTubeEffect(ledfx, {})
    effect.on_activate(36)
    assert effect._energy_state == "normal"

    def _make_data(state: str, onset: bool) -> SimpleNamespace:
        return SimpleNamespace(
            lows_power=lambda filtered=False: np.array([0.4]),
            mids_power=lambda filtered=False: np.array([0.3]),
            high_power=lambda filtered=False: np.array([0.2]),
            onset=lambda: onset,
            energy_state=lambda: state,
        )

    # Breakdown damps _flash even when onset fires
    effect.audio_data_updated(_make_data("breakdown", onset=True))
    assert effect._energy_state == "breakdown"
    assert effect._flash == pytest.approx(0.35)

    # Transitioning into drop triggers 1-beat drop accent even without onset()
    effect._onset = False
    effect._flash = 0.0
    effect.audio_data_updated(_make_data("drop", onset=False))
    assert effect._energy_state == "drop"
    assert effect._onset is True
    assert effect._flash == pytest.approx(1.0)

    # Staying in drop on subsequent frames does not re-trigger the entry accent
    effect._onset = False
    effect._flash = 0.2
    effect.audio_data_updated(_make_data("drop", onset=False))
    assert effect._onset is False
    assert effect._flash == pytest.approx(0.2)


def test_detected_bpm_returns_stable_when_volume_is_none():
    src = _make_analysis_source()
    src._volume_filter.value = None
    src._stable_bpm = 128.0

    assert src.detected_bpm() == 128.0


def test_audio_energy_reset_endpoint_and_concurrent_envelope_updates():
    t = 100.0
    src = _make_analysis_source(start_ts=t)
    t = _step_bass(src, 0.6, t, 20.0)
    t = _step_bass(src, 0.01, t, 4.0)
    assert src.energy_state() == "breakdown"

    ledfx = fake_ledfx()
    ledfx.audio = src
    endpoint = AudioEnergyResetEndpoint(ledfx)
    resp = asyncio.run(endpoint.post())
    assert resp.status == 200
    assert resp.text is not None
    assert json.loads(resp.text)["status"] == "success"
    assert src.energy_state() == "normal"
    assert src.drop_now() is False
    assert src.bass_ratio() == 1.0

    # Also safe when no active audio source is present
    ledfx_no_audio = fake_ledfx()
    ledfx_no_audio.audio = None
    resp_empty = asyncio.run(AudioEnergyResetEndpoint(ledfx_no_audio).post())
    assert resp_empty.status == 200

    # Concurrent updates, reads, and resets under _energy_lock
    barrier = threading.Barrier(3)

    def _updater() -> None:
        barrier.wait(timeout=5.0)
        src.melbanks.melbanks[0][:] = 0.5
        for i in range(200):
            src._update_energy_envelope(now=200.0 + i * 0.05)

    def _resetter() -> None:
        barrier.wait(timeout=5.0)
        for _ in range(100):
            src.reset_energy_envelope()

    def _reader() -> None:
        barrier.wait(timeout=5.0)
        for _ in range(200):
            assert src.energy_state() in {"normal", "breakdown", "drop"}
            assert isinstance(src.drop_now(), bool)
            ratio = src.bass_ratio()
            assert 0.0 <= ratio <= 4.0

    with ThreadPoolExecutor(max_workers=3) as pool:
        futures = [
            pool.submit(_updater),
            pool.submit(_resetter),
            pool.submit(_reader),
        ]
        for fut in futures:
            fut.result(timeout=10.0)

    src.reset_energy_envelope()
    assert src.energy_state() == "normal"
    assert src.drop_now() is False
    assert src.bass_ratio() == 1.0

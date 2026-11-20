"""Unit tests for the zero-latency 5-band incoming audio EQ."""

from unittest.mock import MagicMock

import aubio
import numpy as np
import pytest
from pydantic import ValidationError

from ledfx.configuration.models import AudioConfig
from ledfx.effects.audio import AudioInputSource, _build_eq_curve
from ledfx.effects.melbank import MIC_RATE


def test_audio_config_eq_defaults_and_bounds():
    cfg = AudioConfig()
    assert cfg.eq_enabled is False
    assert cfg.eq_low == 0.0
    assert cfg.eq_low_mid == 0.0
    assert cfg.eq_mid == 0.0
    assert cfg.eq_high_mid == 0.0
    assert cfg.eq_high == 0.0

    with pytest.raises(ValidationError):
        AudioConfig(eq_low=25.0)
    with pytest.raises(ValidationError):
        AudioConfig(eq_high=-25.0)


def test_build_eq_curve_disabled_or_flat_returns_none():
    assert _build_eq_curve(AudioConfig(eq_enabled=False, eq_low=6.0)) is None
    assert _build_eq_curve(AudioConfig(eq_enabled=True)) is None


def test_build_eq_curve_gains():
    cfg = AudioConfig(
        eq_enabled=True,
        eq_low=6.0,
        eq_low_mid=0.0,
        eq_mid=-12.0,
        eq_high_mid=0.0,
        eq_high=6.0,
        fft_size=4096,
        mic_rate=44100,
    )
    curve = _build_eq_curve(cfg)
    assert curve is not None
    assert curve.dtype == np.float32
    assert curve.shape == (4096 // 2 + 1,)

    freqs = np.fft.rfftfreq(4096, 1.0 / MIC_RATE)
    low_bin = int(np.argmin(np.abs(freqs - 60.0)))
    mid_bin = int(np.argmin(np.abs(freqs - 1000.0)))
    high_bin = int(np.argmin(np.abs(freqs - 12000.0)))

    assert curve[low_bin] == pytest.approx(10 ** (6.0 / 20.0), rel=0.05)
    assert curve[mid_bin] == pytest.approx(10 ** (-12.0 / 20.0), rel=0.05)
    assert curve[high_bin] == pytest.approx(10 ** (6.0 / 20.0), rel=0.05)


def test_pre_process_audio_applies_eq_in_place():
    src = object.__new__(AudioInputSource)
    src._ledfx = MagicMock()
    src._config = AudioConfig(
        eq_enabled=True,
        eq_low=6.0,
        eq_low_mid=6.0,
        eq_mid=6.0,
        eq_high_mid=6.0,
        eq_high=6.0,
        min_volume=0.0,
        fft_size=512,
        mic_rate=44100,
        sample_rate=60,
    )
    src._eq_curve = _build_eq_curve(src._config)
    src._volume_filter = MagicMock()
    src._volume_filter.value = 0.8
    src._has_volume_measurement = False
    src._volume = 0.8
    src._audio_sample_rate = 44100
    src.pre_emphasis = None
    src._frequency_domain_null = aubio.cvec(512)

    pvoc = aubio.pvoc(512, 512 // 2)
    sample = np.sin(np.linspace(0, 8 * np.pi, 512 // 2, dtype=np.float32))
    baseline = pvoc(sample).norm.copy()

    src._phase_vocoder = aubio.pvoc(512, 512 // 2)
    src._raw_audio_sample = sample.copy()
    src.pre_process_audio()

    assert np.allclose(
        src._frequency_domain.norm, baseline * (10 ** (6.0 / 20.0)), rtol=1e-4
    )

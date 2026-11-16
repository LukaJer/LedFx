import time
from typing import override

import numpy as np
from pydantic import Field

from ledfx.configuration.fields import CoercedFloat
from ledfx.configuration.plugin import TypedConfig
from ledfx.effects.audio import AudioReactiveEffect
from ledfx.effects.gradient import GradientEffect
from ledfx.utils import BaseRegistry


@BaseRegistry.no_registration
class TubeEffectBase(AudioReactiveEffect, GradientEffect):
    """Shared 4x9 RGBW tube geometry & audio-envelope base for tube-native effects."""

    CATEGORY = "Tube"
    USES_MELBANK_RANGE = False

    class Config(GradientEffect.Config):
        speed: CoercedFloat = Field(
            1.5, description="Animation speed", ge=0.05, le=10.0
        )
        reactivity: CoercedFloat = Field(
            0.6, description="Audio reactivity amount", ge=0.0, le=1.0
        )
        decay: CoercedFloat = Field(
            0.78, description="Trail / envelope persistence", ge=0.1, le=0.98
        )

    config = TypedConfig(Config)

    def on_activate(self, pixel_count: int) -> None:
        self._n_tubes, self._sides, self._segs = self._compute_grid(pixel_count)
        self._low = 0.0
        self._mid = 0.0
        self._high = 0.0
        self._onset = False
        self._last_time = time.monotonic()
        self._phase = 0.0
        self._grid = np.zeros(
            (self._n_tubes, self._sides, self._segs), dtype=np.float64
        )

    @staticmethod
    def _compute_grid(pixel_count: int) -> tuple[int, int, int]:
        if pixel_count >= 36 and pixel_count % 36 == 0:
            return pixel_count // 36, 4, 9
        if pixel_count >= 4 and pixel_count % 4 == 0:
            return 1, 4, pixel_count // 4
        return 1, 1, max(1, pixel_count)

    def _dt(self) -> float:
        now = time.monotonic()
        dt = min(0.1, max(0.001, now - self._last_time))
        self._last_time = now
        return dt

    @override
    def audio_data_updated(self, data: object) -> None:
        low = float(np.max(data.lows_power(filtered=False)))  # type: ignore[attr-defined]
        mid = float(np.max(data.mids_power(filtered=False)))  # type: ignore[attr-defined]
        high = float(np.max(data.high_power(filtered=False)))  # type: ignore[attr-defined]
        decay = float(self.config.decay)
        self._low = max(low, self._low * decay)
        self._mid = max(mid, self._mid * decay)
        self._high = max(high, self._high * decay)
        if data.onset():  # type: ignore[attr-defined]
            self._onset = True

    def _render_grid(self, intensity: np.ndarray) -> None:
        flat = np.clip(intensity.reshape(-1), 0.0, 1.0)
        if len(flat) != self.pixel_count:
            out = np.zeros(self.pixel_count, dtype=np.float64)
            n = min(len(flat), self.pixel_count)
            out[:n] = flat[:n]
            flat = out
        self.pixels = self.apply_gradient(flat)

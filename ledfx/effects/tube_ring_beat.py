from typing import override

import numpy as np
from pydantic import Field

from ledfx.configuration.fields import CoercedFloat
from ledfx.configuration.plugin import TypedConfig
from ledfx.effects.tube_base import TubeEffectBase


class TubeRingBeatEffect(TubeEffectBase):
    """Clean full-ring bands pulsing & stepping along the 9 rings on every beat."""

    NAME = "Tube Ring Beat"

    class Config(TubeEffectBase.Config):
        beat_flash: CoercedFloat = Field(
            0.85, description="Brightness flash / pump on beat transients", ge=0.0, le=1.0
        )
        ring_width: CoercedFloat = Field(
            0.35, description="Thickness of the lit ring band", ge=0.1, le=1.0
        )

    config = TypedConfig(Config)

    @override
    def on_activate(self, pixel_count: int) -> None:
        super().on_activate(pixel_count)
        self._ring_pos = 0.0
        self._pulse = 0.0

    @override
    def render(self) -> None:
        dt = self._dt()
        if self._onset:
            self._onset = False
            self._ring_pos = (self._ring_pos + 1.0) % max(1, self._segs)
            self._pulse = 1.0

        self._pulse = max(
            self._low, self._pulse * (float(self.config.decay) ** (dt * 28.0))
        )
        segs = np.arange(self._segs, dtype=np.float64)
        # Distance to current beat ring (wrapped cleanly)
        diff = np.abs(segs - self._ring_pos)
        dist = np.minimum(diff, self._segs - diff) / max(1.0, self._segs * 0.5)
        width = float(self.config.ring_width)
        ring = np.clip(1.0 - dist / max(0.05, width), 0.0, 1.0) ** 1.6
        amp = 0.25 + 0.75 * self._pulse
        grid = np.broadcast_to((ring * amp)[None, None, :], self._grid.shape).copy()
        self._render_grid(grid)

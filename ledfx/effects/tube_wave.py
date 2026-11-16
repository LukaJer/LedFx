from typing import override

import numpy as np
from pydantic import Field

from ledfx.configuration.fields import CoercedFloat
from ledfx.configuration.plugin import TypedConfig
from ledfx.effects.tube_base import TubeEffectBase


class TubeWaveEffect(TubeEffectBase):
    """Smooth 3D plasma-like wave flowing across the 2x3 tube grid and around 4 sides."""

    NAME = "Tube Wave"

    class Config(TubeEffectBase.Config):
        ripple: CoercedFloat = Field(
            1.4, description="Wave frequency along each tube", ge=0.2, le=4.0
        )

    config = TypedConfig(Config)

    @override
    def render(self) -> None:
        dt = self._dt()
        boost = 1.0 + float(self.config.reactivity) * (self._mid * 1.8 + self._low)
        self._phase += dt * float(self.config.speed) * boost

        sides = np.arange(self._sides, dtype=np.float64)[None, :, None] / max(
            1, self._sides
        )
        segs = np.arange(self._segs, dtype=np.float64)[None, None, :] / max(
            1, self._segs
        )
        tubes = self._tube_phase_offsets()[:, None, None] * 0.35

        w1 = np.sin((segs * float(self.config.ripple) - self._phase + tubes) * 2.0 * np.pi)
        w2 = np.cos((sides + self._phase * 0.5 - tubes) * 2.0 * np.pi)
        val = 0.5 + 0.25 * w1 + 0.25 * w2
        amp = 0.45 + 0.55 * min(1.0, max(self._low, self._high) + 0.15)
        self._render_grid((val**1.6) * amp)

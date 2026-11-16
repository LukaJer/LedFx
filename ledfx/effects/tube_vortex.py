from typing import override

import numpy as np
from pydantic import Field

from ledfx.configuration.fields import CoercedFloat
from ledfx.configuration.plugin import TypedConfig
from ledfx.effects.tube_base import TubeEffectBase


class TubeVortexEffect(TubeEffectBase):
    """Counter-rotating dual 3D spirals meeting at the center ring of each tube."""

    NAME = "Tube Vortex"

    class Config(TubeEffectBase.Config):
        twist: CoercedFloat = Field(
            1.5, description="Spiral twist density", ge=0.25, le=4.0
        )

    config = TypedConfig(Config)

    @override
    def render(self) -> None:
        dt = self._dt()
        boost = 1.0 + float(self.config.reactivity) * (self._low * 2.2 + self._mid)
        self._phase += dt * float(self.config.speed) * boost

        sides = np.arange(self._sides, dtype=np.float64)[None, :, None] / max(
            1, self._sides
        )
        segs = np.arange(self._segs, dtype=np.float64)[None, None, :] / max(
            1, self._segs
        )
        # Symmetric distance from tube center so top & bottom halves counter-rotate
        sym_segs = np.abs(segs - 0.5) * 2.0
        tubes = self._tube_phase_offsets()[:, None, None] * 0.2

        a1 = (sides + sym_segs * float(self.config.twist) + tubes - self._phase) * (
            2.0 * np.pi
        )
        a2 = (-sides + sym_segs * float(self.config.twist) + tubes - self._phase * 0.7) * (
            2.0 * np.pi
        )
        wave = 0.5 * (0.5 + 0.5 * np.cos(a1)) + 0.5 * (0.5 + 0.5 * np.cos(a2))
        amp = 0.45 + 0.55 * min(1.0, max(self._low, self._mid) + 0.15)
        self._render_grid((wave**1.8) * amp)

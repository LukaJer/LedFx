from typing import override

import numpy as np
from pydantic import Field

from ledfx.configuration.fields import CoercedFloat
from ledfx.configuration.plugin import TypedConfig
from ledfx.effects.tube_base import TubeEffectBase


class TubeStrobeHelixEffect(TubeEffectBase):
    """3D rotating tube helix with a punchy brightness flash on every beat."""

    NAME = "Tube Strobe Helix"

    class Config(TubeEffectBase.Config):
        beat_flash: CoercedFloat = Field(
            0.75, description="Brightness flash / pump on beat transients", ge=0.0, le=1.0
        )
        twist: CoercedFloat = Field(
            1.4, description="Helix turns per tube", ge=0.25, le=4.0
        )

    config = TypedConfig(Config)

    @override
    def render(self) -> None:
        dt = self._dt()
        boost = 1.0 + float(self.config.reactivity) * (self._low * 2.4)
        self._phase += dt * float(self.config.speed) * boost

        sides = np.arange(self._sides, dtype=np.float64)[None, :, None] / max(
            1, self._sides
        )
        segs = np.arange(self._segs, dtype=np.float64)[None, None, :] / max(
            1, self._segs
        )
        tubes = self._tube_phase_offsets()[:, None, None] * 0.25

        angle = (sides + segs * float(self.config.twist) + tubes - self._phase) * (
            2.0 * np.pi
        )
        wave = 0.5 + 0.5 * np.cos(angle)
        amp = 0.35 + 0.65 * min(1.0, self._low * (0.6 + float(self.config.reactivity)))
        self._render_grid((wave**2.0) * amp)

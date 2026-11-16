from typing import override

import numpy as np
from pydantic import Field

from ledfx.configuration.fields import CoercedFloat
from ledfx.configuration.plugin import TypedConfig
from ledfx.effects.tube_base import TubeEffectBase


class TubeHelixEffect(TubeEffectBase):
    """3D helical spiral wrapping around the 4 sides x 9 rings of each tube."""

    NAME = "Tube Helix"

    class Config(TubeEffectBase.Config):
        twist: CoercedFloat = Field(
            1.2, description="Helix turns per tube", ge=0.25, le=4.0
        )
        flip_on_kick: bool = Field(
            True, description="Reverse spiral direction on kick transients"
        )

    config = TypedConfig(Config)

    @override
    def on_activate(self, pixel_count: int) -> None:
        super().on_activate(pixel_count)
        self._dir = 1.0

    @override
    def render(self) -> None:
        dt = self._dt()
        if self._onset:
            self._onset = False
            if self.config.flip_on_kick:
                self._dir *= -1.0

        boost = 1.0 + float(self.config.reactivity) * (self._low * 2.5)
        self._phase += self._dir * dt * float(self.config.speed) * boost

        sides = np.arange(self._sides, dtype=np.float64)[None, :, None] / max(
            1, self._sides
        )
        segs = np.arange(self._segs, dtype=np.float64)[None, None, :] / max(
            1, self._segs
        )
        tubes = np.arange(self._n_tubes, dtype=np.float64)[:, None, None] * 0.25

        angle = (sides + segs * float(self.config.twist) + tubes - self._phase) * (
            2.0 * np.pi
        )
        wave = 0.5 + 0.5 * np.cos(angle)
        amp = 0.35 + 0.65 * min(1.0, self._low * (0.6 + float(self.config.reactivity)))
        self._render_grid((wave**2.2) * amp)

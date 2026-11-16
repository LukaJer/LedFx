from typing import override

import numpy as np
from pydantic import Field

from ledfx.configuration.fields import CoercedFloat
from ledfx.configuration.plugin import TypedConfig
from ledfx.effects.tube_base import TubeEffectBase


class TubeLighthouseEffect(TubeEffectBase):
    """Rotating 1-side beam sweeping around the 4 sides of each tube."""

    NAME = "Tube Lighthouse"

    class Config(TubeEffectBase.Config):
        spread: CoercedFloat = Field(
            0.35, description="Phase offset between adjacent tubes", ge=0.0, le=1.0
        )

    config = TypedConfig(Config)

    @override
    def render(self) -> None:
        dt = self._dt()
        boost = 1.0 + float(self.config.reactivity) * self._mid * 2.0
        self._phase += dt * float(self.config.speed) * boost

        tubes = np.arange(self._n_tubes, dtype=np.float64)[:, None, None]
        sides = np.arange(self._sides, dtype=np.float64)[None, :, None]
        target = (self._phase + tubes * float(self.config.spread)) % max(
            1, self._sides
        )
        diff = np.abs(sides - target)
        circ = np.minimum(diff, self._sides - diff)
        beam = np.clip(1.0 - circ / 1.15, 0.0, 1.0) ** 2.0
        amp = 0.25 + 0.75 * min(1.0, max(self._low, self._mid) + 0.15)
        grid = np.broadcast_to(beam * amp, self._grid.shape).copy()
        self._render_grid(grid)

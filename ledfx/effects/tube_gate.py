from typing import override

import numpy as np
from pydantic import Field

from ledfx.configuration.fields import CoercedFloat
from ledfx.configuration.plugin import TypedConfig
from ledfx.effects.tube_base import TubeEffectBase


class TubeGateEffect(TubeEffectBase):
    """Sharp step-sequenced techno blocks advancing along the 9 rings on transients."""

    NAME = "Tube Gate"

    class Config(TubeEffectBase.Config):
        step_size: int = Field(
            2, description="Active ring block width", ge=1, le=5
        )
        blur: CoercedFloat = Field(
            0.0, description="Amount to blur the effect", ge=0.0, le=10.0
        )

    config = TypedConfig(Config)

    @override
    def on_activate(self, pixel_count: int) -> None:
        super().on_activate(pixel_count)
        self._step = 0

    @override
    def render(self) -> None:
        dt = self._dt()
        if self._onset:
            self._onset = False
            self._step = (self._step + 1) % max(1, self._segs)
        else:
            self._phase += dt * float(self.config.speed)
            if self._phase >= 1.0:
                self._phase %= 1.0
                self._step = (self._step + 1) % max(1, self._segs)

        grid = np.zeros_like(self._grid)
        width = max(1, min(self._segs, int(self.config.step_size)))
        amp = 0.4 + 0.6 * min(1.0, max(self._low, self._high) + 0.2)
        for t in range(self._n_tubes):
            pos = (self._step + t * 2) % self._segs
            for w in range(width):
                grid[t, :, (pos + w) % self._segs] = amp
        self._render_grid(grid)

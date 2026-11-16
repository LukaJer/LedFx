from typing import override

import numpy as np
from pydantic import Field

from ledfx.configuration.fields import CoercedFloat
from ledfx.configuration.plugin import TypedConfig
from ledfx.effects.tube_base import TubeEffectBase


class TubeSolidBeatEffect(TubeEffectBase):
    """Whole-tube solid color flash that pumps and shifts on every beat."""

    NAME = "Tube Solid Beat"

    class Config(TubeEffectBase.Config):
        beat_flash: CoercedFloat = Field(
            0.9, description="Brightness flash / pump on beat transients", ge=0.0, le=1.0
        )
        base_level: CoercedFloat = Field(
            0.15, description="Minimum glow between beats", ge=0.0, le=0.6
        )
        alternate: bool = Field(
            False, description="Alternate bright beat hits between even/odd tubes"
        )

    config = TypedConfig(Config)

    @override
    def on_activate(self, pixel_count: int) -> None:
        super().on_activate(pixel_count)
        self._beat_idx = 0
        self._pulse = 0.0

    @override
    def render(self) -> None:
        dt = self._dt()
        if self._onset:
            self._onset = False
            self._beat_idx += 1
            self._pulse = 1.0

        self._pulse = max(
            self._low, self._pulse * (float(self.config.decay) ** (dt * 28.0))
        )
        base = float(self.config.base_level)
        grid = np.empty_like(self._grid)
        for t in range(self._n_tubes):
            if self.config.alternate and self._n_tubes > 1:
                active_tube = (t % 2) == (self._beat_idx % 2)
                lvl = (
                    base + (1.0 - base) * self._pulse
                    if active_tube
                    else base * 0.6
                )
            else:
                lvl = base + (1.0 - base) * self._pulse
            grid[t, :, :] = lvl
        self._render_grid(grid)

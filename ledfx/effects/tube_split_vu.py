from typing import override

import numpy as np
from pydantic import Field

from ledfx.configuration.fields import CoercedFloat
from ledfx.configuration.plugin import TypedConfig
from ledfx.effects.tube_base import TubeEffectBase


class TubeSplitVUEffect(TubeEffectBase):
    """Symmetric house VU: bass center-out on sides 0-1, mids/highs on sides 2-3."""

    NAME = "Tube Split VU"

    class Config(TubeEffectBase.Config):
        blur: CoercedFloat = Field(
            1.5, description="Amount to blur the effect", ge=0.0, le=10.0
        )

    config = TypedConfig(Config)

    @override
    def render(self) -> None:
        segs = np.arange(self._segs, dtype=np.float64)
        center = (self._segs - 1) / 2.0
        dist = np.abs(segs - center) / max(1.0, center)

        react = 0.5 + float(self.config.reactivity)
        low_lvl = np.clip(self._low * react, 0.0, 1.0)
        hi_lvl = np.clip((self._mid * 0.6 + self._high * 0.7) * react, 0.0, 1.0)

        low_bar = np.clip((low_lvl - dist) * 3.5 + 0.15, 0.0, 1.0)
        hi_bar = np.clip((hi_lvl - (1.0 - dist)) * 3.5 + 0.1, 0.0, 1.0)

        grid = np.zeros_like(self._grid)
        for s in range(self._sides):
            grid[:, s, :] = low_bar if s < max(1, self._sides // 2) else hi_bar
        self._render_grid(grid)

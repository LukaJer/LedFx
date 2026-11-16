from typing import override

import numpy as np
from pydantic import Field

from ledfx.color import parse_color
from ledfx.configuration.fields import Color
from ledfx.configuration.plugin import TypedConfig
from ledfx.effects.tube_base import TubeEffectBase


class TubePistonEffect(TubeEffectBase):
    """4-on-the-floor bass piston down the 9 rings with hi-hat sparkle."""

    NAME = "Tube Piston"

    class Config(TubeEffectBase.Config):
        sparkle_color: Color = Field(
            "#ffffff", description="Hi-hat sparkle color on upper frequencies"
        )
        mirror: bool = Field(
            False, description="Fire piston from center outward"
        )

    config = TypedConfig(Config)

    @override
    def on_activate(self, pixel_count: int) -> None:
        super().on_activate(pixel_count)
        self._piston = 0.0
        self._spark = np.zeros(
            (self._n_tubes, self._sides, self._segs), dtype=np.float64
        )
        self._spark_color = parse_color(self.config.sparkle_color)

    @override
    def config_updated(self, config: object) -> None:
        self._spark_color = parse_color(self.config.sparkle_color)

    @override
    def render(self) -> None:
        dt = self._dt()
        if self._onset:
            self._onset = False
            self._piston = 1.0

        self._piston = max(
            self._low, self._piston * (float(self.config.decay) ** (dt * 30.0))
        )
        self._spark *= 0.82 ** (dt * 30.0)
        if self._high > 0.35:
            t_idx = np.random.randint(0, self._n_tubes)
            s_idx = np.random.randint(0, self._sides)
            k_idx = np.random.randint(0, self._segs)
            self._spark[t_idx, s_idx, k_idx] = min(1.0, self._high * 1.4)

        segs = np.arange(self._segs, dtype=np.float64)
        if self.config.mirror:
            dist = np.abs(segs - (self._segs - 1) / 2.0) / max(
                1.0, (self._segs - 1) / 2.0
            )
        else:
            dist = segs / max(1.0, self._segs - 1)

        level = np.clip(self._piston * (0.6 + float(self.config.reactivity)), 0.0, 1.0)
        bar = np.clip((level - dist) * 4.0 + 0.25, 0.0, 1.0)
        grid = np.broadcast_to(bar[None, None, :], self._grid.shape).copy()
        self._render_grid(grid)

        spark_flat = self._spark.reshape(-1, 1)
        if spark_flat.shape[0] == self.pixel_count:
            self.pixels = np.clip(
                self.pixels + spark_flat * self._spark_color, 0.0, 255.0
            )

from typing import Literal, override

import numpy as np
from pydantic import Field

from ledfx.configuration.fields import CoercedFloat
from ledfx.configuration.plugin import TypedConfig
from ledfx.effects.tube_base import TubeEffectBase


class TubeLighthouseEffect(TubeEffectBase):
    """Rotating 1-side or along-tube beam sweeping across each tube."""

    NAME = "Tube Lighthouse"

    class Config(TubeEffectBase.Config):
        spread: CoercedFloat = Field(
            0.35, description="Phase offset between adjacent tubes", ge=0.0, le=1.0
        )
        orientation: Literal["Vertical", "Horizontal"] = Field(
            "Vertical",
            description="Sweep around the 4 tube sides (Vertical) or along the tube segments (Horizontal)",
        )

    config = TypedConfig(Config)

    @override
    def render(self) -> None:
        dt = self._dt()
        boost = 1.0 + float(self.config.reactivity) * self._mid * 2.0
        self._phase += dt * float(self.config.speed) * boost

        tubes = self._tube_phase_offsets()[:, None, None]
        rot = int(getattr(getattr(self._virtual, "config", None), "rotate", 0) or 0)
        is_horizontal = (self.config.orientation == "Horizontal") ^ (rot % 2 == 1)
        if is_horizontal:
            span = max(1, self._segs)
            coords = np.arange(self._segs, dtype=np.float64)[None, None, :]
            target = (self._phase * (span / max(1, self._sides)) + tubes * float(self.config.spread) * span) % span
            width = max(1.15, span * 0.28)
        else:
            span = max(1, self._sides)
            coords = np.arange(self._sides, dtype=np.float64)[None, :, None]
            target = (self._phase + tubes * float(self.config.spread)) % span
            width = 1.15
        diff = np.abs(coords - target)
        circ = np.minimum(diff, span - diff)
        beam = np.clip(1.0 - circ / width, 0.0, 1.0) ** 2.0
        amp = 0.45 + 0.55 * min(1.0, max(self._low, self._mid) + 0.15)
        grid = np.broadcast_to(beam * amp, self._grid.shape).copy()
        self._render_grid(grid)

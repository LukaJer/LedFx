from typing import override

import numpy as np
from pydantic import Field

from ledfx.configuration.fields import CoercedFloat
from ledfx.configuration.plugin import TypedConfig
from ledfx.effects.tube_base import TubeEffectBase


class TubeBeatPulseEffect(TubeEffectBase):
    """Symmetric 2x3 ring wave with a full-tube brightness flash on kicks."""

    NAME = "Tube Beat Pulse"

    class Config(TubeEffectBase.Config):
        beat_flash: CoercedFloat = Field(
            0.85, description="Brightness flash / pump on beat transients", ge=0.0, le=1.0
        )
        pulse_width: CoercedFloat = Field(
            1.2, description="Ring pulse sharpness", ge=0.3, le=3.0
        )

    config = TypedConfig(Config)

    @override
    def render(self) -> None:
        dt = self._dt()
        boost = 1.0 + float(self.config.reactivity) * self._low * 2.0
        self._phase += dt * float(self.config.speed) * boost

        segs = np.arange(self._segs, dtype=np.float64)[None, None, :] / max(
            1, self._segs
        )
        sym_segs = np.abs(segs - 0.5) * 2.0
        tubes = self._tube_phase_offsets()[:, None, None] * 0.3

        wave = 0.5 + 0.5 * np.cos((sym_segs - self._phase + tubes) * 2.0 * np.pi)
        shaped = wave ** float(self.config.pulse_width)
        amp = 0.3 + 0.7 * min(1.0, max(self._low, self._mid) + 0.15)
        grid = np.broadcast_to(shaped * amp, self._grid.shape).copy()
        self._render_grid(grid)

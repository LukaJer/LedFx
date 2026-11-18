import time
from typing import override

import numpy as np
from pydantic import Field

from ledfx.color import parse_color
from ledfx.configuration.fields import CoercedFloat, CoercedInt, Color
from ledfx.configuration.plugin import TypedConfig
from ledfx.effects.tube_base import TubeEffectBase


class TubeTikTokEffect(TubeEffectBase):
    """Libelle concentric radial pulse + wipe bars + onset line flashes (TikTok style)."""

    NAME = "Tube TikTok"

    class Config(TubeEffectBase.Config):
        beat_flash: CoercedFloat = Field(
            0.30, description="Brightness pump on beat transients", ge=0.0, le=1.0
        )
        decay: CoercedFloat = Field(
            0.70, description="Pulse & line decay persistence", ge=0.1, le=0.98
        )
        ring_scale: CoercedFloat = Field(
            1.5, description="Spatial frequency of the concentric rings", ge=0.5, le=4.0
        )
        idle_speed: CoercedFloat = Field(
            0.35, description="Base concentric expansion speed", ge=0.0, le=2.0
        )
        flash_color: Color = Field(
            "#FFFFFF", description="Color of sharp onset line flashes"
        )
        segment_length: CoercedInt = Field(
            3, description="Length of onset segment/line flashes (rings, 1-9)", ge=1, le=9
        )
        bg_kick_flash: CoercedFloat = Field(
            0.60, description="Occasional full-grid flash intensity on strong kicks", ge=0.0, le=1.0
        )

    config = TypedConfig(Config)

    @override
    def on_activate(self, pixel_count: int) -> None:
        super().on_activate(pixel_count)
        self._seg_overlay = np.zeros(
            (self._n_tubes, self._sides, self._segs, 3), dtype=np.float64
        )
        self._bg_flash = 0.0
        self._last_bg_flash = 0.0
        self._volume_beat = False

    @override
    def audio_data_updated(self, data) -> None:
        super().audio_data_updated(data)
        if data.volume_beat_now():
            self._volume_beat = True

    @override
    def render(self) -> None:
        dt = self._dt()
        now = time.monotonic()

        boost = float(self.config.idle_speed) + self._low * (
            1.8 * float(self.config.reactivity) + 0.5
        )
        self._phase += dt * float(self.config.speed) * boost

        if self._volume_beat:
            self._volume_beat = False
            if now - self._last_bg_flash >= 0.28:
                self._last_bg_flash = now
                self._bg_flash = float(self.config.bg_kick_flash)
        self._bg_flash *= 0.70 ** (dt * 30.0)

        if self._onset:
            self._onset = False
            seg_col = np.array(parse_color(self.config.flash_color), dtype=np.float64)
            t = int(np.random.randint(self._n_tubes))
            s = int(np.random.randint(self._sides))
            seg_len = min(int(self.config.segment_length), self._segs)
            pos = (
                0
                if self._segs <= seg_len
                else int(np.random.randint(self._segs - seg_len + 1))
            )
            self._seg_overlay[t, s, pos : pos + seg_len] = seg_col

        self._seg_overlay *= float(self.config.decay) ** (dt * 34.0)

        # Concentric radial distance across 2x3 Libelle layout (or N tubes)
        rows = 2 if self._n_tubes == 6 else 1
        cols = max(1, self._n_tubes // rows)
        t_idx = np.arange(self._n_tubes, dtype=np.float64)
        ty = (t_idx // cols) - (rows - 1) * 0.5
        tx = ((t_idx % cols) - (cols - 1) * 0.5) * 1.4
        segs = (np.arange(self._segs, dtype=np.float64) / max(1, self._segs - 1)) - 0.5
        radial = np.sqrt(
            (tx[:, None] + segs[None, :] * 1.2) ** 2 + (ty[:, None] * 1.1) ** 2
        )

        # Sharp concentric bands (high-contrast red/black/neon style)
        wave = np.sin((radial * float(self.config.ring_scale) - self._phase) * 2.0 * np.pi)
        bands = np.clip((wave + 0.15) * 2.2, 0.0, 1.0)
        amp = 0.25 + 0.75 * min(1.0, self._low * 1.2 + self._mid * 0.3)

        grid = np.broadcast_to((bands * amp)[:, None, :], self._grid.shape).copy()
        self._render_grid(grid)

        fg = self.pixels.reshape(self._n_tubes, self._sides, self._segs, 3)
        if self._bg_flash > 0.01:
            flash_col = np.array(self.get_gradient_color(0.0), dtype=np.float64) * self._bg_flash
            fg = np.maximum(fg, flash_col)
        out = fg + self._seg_overlay
        np.clip(out, 0.0, 255.0, out=out)
        self.pixels = out.reshape(-1, 3)

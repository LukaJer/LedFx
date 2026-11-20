import time
from typing import ClassVar, override

import numpy as np
from pydantic import Field

from ledfx.color import parse_color
from ledfx.configuration.fields import CoercedFloat, CoercedInt, Color
from ledfx.configuration.plugin import TypedConfig
from ledfx.effects.tube_base import TubeEffectBase


class TubeKickStrobeEffect(TubeEffectBase):
    """Dynamic gliding segment flashes on onsets + whole-background flashes on kicks."""

    NAME = "Tube Kick Strobe"
    HIDDEN_KEYS: ClassVar[list[str]] = [
        "speed",
        "reactivity",
        "color_by_intensity",
        "beat_flash",
    ]

    class Config(TubeEffectBase.Config):
        beat_flash: CoercedFloat = Field(
            0.0, description="Extra brightness pump on beat transients", ge=0.0, le=1.0
        )
        strobe_color: Color = Field(
            "#FFFFFF", description="Primary color for percussive segment/line flashes"
        )
        segment_length: CoercedInt = Field(
            3, description="Max length of each flashing segment (in rings, 1-9)", ge=1, le=9
        )
        drift_speed: CoercedFloat = Field(
            14.0, description="How fast segments glide along the tube (rings/sec)", ge=0.0, le=40.0
        )
        single_side_line: bool = Field(
            True, description="Flash individual tube side lines instead of full 4-side rings"
        )
        strobe_decay: CoercedFloat = Field(
            0.74, description="Segment flash decay (higher = longer tail)", ge=0.1, le=0.95
        )
        bass_decay: CoercedFloat = Field(
            0.72, description="Whole-background kick flash decay (higher = longer tail)", ge=0.1, le=0.95
        )
        kick_cooldown: CoercedFloat = Field(
            0.22, description="Minimum seconds between whole-background kick flashes", ge=0.05, le=1.0
        )
        idle_glow: CoercedFloat = Field(
            0.0, description="Subtle resting background glow between flashes", ge=0.0, le=0.25
        )

    config = TypedConfig(Config)

    @override
    def on_activate(self, pixel_count: int) -> None:
        super().on_activate(pixel_count)
        self._segments: list[list[object]] = []
        self._bass_overlay = np.zeros(
            (self._n_tubes, self._sides, self._segs, 3), dtype=np.float64
        )
        self._last_kick_time = 0.0
        self._color_idx = 0.0
        self._volume_beat = False

    @override
    def audio_data_updated(self, data) -> None:
        super().audio_data_updated(data)
        if data.volume_beat_now():
            self._volume_beat = True

    def _spawn_segment(self, base_col: np.ndarray) -> None:
        t = int(np.random.randint(self._n_tubes))
        s = int(np.random.randint(self._sides))
        max_len = min(int(self.config.segment_length), self._segs)
        seg_len = int(np.random.randint(1, max_len + 1))
        pos = float(np.random.randint(max(1, self._segs - seg_len + 1)))
        direction = -1.0 if np.random.random() < 0.5 else 1.0
        vel = direction * float(self.config.drift_speed) * (0.6 + 0.8 * np.random.random())
        self._segments.append([t, s, pos, seg_len, vel, base_col, 1.0])

    @override
    def render(self) -> None:
        dt = self._dt()
        now = time.monotonic()

        if self._volume_beat:
            self._volume_beat = False
            if now - self._last_kick_time >= float(self.config.kick_cooldown):
                self._last_kick_time = now
                self._color_idx = (self._color_idx + 0.12) % 1.0
                bass_col = np.array(
                    self.get_gradient_color(self._color_idx), dtype=np.float64
                )
                self._bass_overlay[:] = bass_col

        if self._onset:
            self._onset = False
            white_col = np.array(parse_color(self.config.strobe_color), dtype=np.float64)
            grad_col = np.array(
                self.get_gradient_color((self._color_idx + 0.35) % 1.0), dtype=np.float64
            )
            col = white_col if np.random.random() < 0.7 else grad_col
            self._spawn_segment(col)
            if self._low > 0.5 or self._high > 0.45:
                self._spawn_segment(white_col)
            if len(self._segments) > 24:
                self._segments = self._segments[-24:]

        bass_decay = float(self.config.bass_decay) ** (dt * 30.0)
        seg_decay = float(self.config.strobe_decay) ** (dt * 36.0)
        self._bass_overlay *= bass_decay

        seg_layer = np.zeros_like(self._bass_overlay)
        kept: list[list[object]] = []
        for seg in self._segments:
            t, s, pos, seg_len, vel, col, alpha = seg
            alpha = float(alpha) * seg_decay
            if alpha < 0.03:
                continue
            pos = float(pos) + float(vel) * dt
            if pos < 0.0:
                pos = 0.0
                vel = abs(float(vel))
            elif pos + int(seg_len) > self._segs:
                pos = float(max(0, self._segs - int(seg_len)))
                vel = -abs(float(vel))
            seg[2] = pos
            seg[4] = vel
            seg[6] = alpha
            kept.append(seg)

            i0 = round(pos)
            i1 = min(self._segs, i0 + int(seg_len))
            if self.config.single_side_line and self._sides > 1:
                seg_layer[int(t), int(s), i0:i1] = np.maximum(
                    seg_layer[int(t), int(s), i0:i1], col * alpha
                )
            else:
                seg_layer[int(t), :, i0:i1] = np.maximum(
                    seg_layer[int(t), :, i0:i1], col * alpha
                )
        self._segments = kept

        idle = float(self.config.idle_glow)
        if idle > 0.0:
            bg_col = (
                np.array(self.get_gradient_color(self._color_idx), dtype=np.float64)
                * idle
            )
            out = bg_col + self._bass_overlay + seg_layer
        else:
            out = self._bass_overlay + seg_layer

        np.clip(out, 0.0, 255.0, out=out)
        self.pixels = out.reshape(-1, 3)

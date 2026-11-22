import threading
from types import SimpleNamespace
from typing import Literal, cast

import numpy as np
from numpy.typing import NDArray

from ledfx.configuration.fields import VirtualIdStr
from ledfx.configuration.models import VirtualConfig
from ledfx.effects.oneshots.oneshot import Flash
from ledfx.events import Event
from ledfx.virtuals import Virtual, Virtuals


def test_flash_zero_ramp_and_fade_do_not_divide_by_zero():
    flash = Flash(color=(0, 0, 0), ramp=0, hold=1000, fade=0, brightness=1.0)
    flash.update()
    assert flash.active is True
    assert flash._weight == 1.0

    frame = np.full((6, 3), 200.0, dtype=np.float64)
    flash.apply(frame, 0, 6)
    assert np.allclose(frame, 0.0)


def test_virtual_fire_update_event_applies_oneshot_without_mutating_frame():
    fired = []
    ledfx = SimpleNamespace(
        events=SimpleNamespace(fire_event=lambda ev: fired.append(ev)),
    )
    virtual = Virtual.__new__(Virtual)
    virtual._ledfx = ledfx
    virtual._id = "test-virt"
    virtual._config = SimpleNamespace(rows=1)
    virtual.group_size = 1
    virtual.assembled_frame = np.full((8, 3), 20.0, dtype=np.float64)

    flash = Flash(color=(255, 245, 228), ramp=0, hold=1000, fade=0, brightness=1.0)
    flash.update()
    virtual._oneshots = [flash]

    virtual._fire_update_event()

    # Source assembled_frame must stay untouched while emitted frame reflects the flash
    assert np.allclose(virtual.assembled_frame, 20.0)
    assert len(fired) == 1
    assert np.allclose(fired[0].pixels, np.array([[255, 245, 228]], dtype=np.uint8))


def _make_flush_virtual(
    mapping: Literal["span", "copy"] = "copy", pixel_count: int = 8
) -> tuple[Virtual, list[tuple[str, list[tuple[object, ...]]]]]:
    updates: list[tuple[str, list[tuple[object, ...]]]] = []

    def _is_active() -> bool:
        return True

    def _update_pixels(vid: str, data: list[tuple[object, ...]]) -> None:
        updates.append((vid, data))

    def _get_device(_did: str) -> SimpleNamespace:
        return device

    def _fire_event(_ev: Event) -> None:
        return None

    device = SimpleNamespace(
        is_active=_is_active,
        update_pixels=_update_pixels,
    )
    ledfx = SimpleNamespace(
        devices=SimpleNamespace(get=_get_device),
        events=SimpleNamespace(fire_event=_fire_event),
    )
    virtual = Virtual.__new__(Virtual)
    virtual._ledfx = ledfx
    virtual.__dict__["_id"] = "test-virt"
    virtual._config = VirtualConfig(name="test", mapping=mapping, grouping=1, rows=1)
    virtual._calibration = False
    virtual.complex_segments = False
    virtual._device_remap = {}
    virtual.lock = threading.Lock()
    virtual._active_effect = None
    virtual._segments_by_device = {
        "dev1": [(0, pixel_count, 1, 0, pixel_count - 1)],
    }
    virtual._segments = [("dev1", 0, pixel_count - 1, False)]
    virtual._oneshots = []
    virtual.assembled_frame = np.full((pixel_count, 3), 20.0, dtype=np.float64)
    return virtual, updates


def test_copy_mode_flush_with_group_size_one_does_not_mutate_assembled_frame():
    virtual, updates = _make_flush_virtual(mapping="copy", pixel_count=8)
    flash = Flash(color=(255, 245, 228), ramp=0, hold=1000, fade=0, brightness=1.0)
    flash.update()
    virtual._oneshots = [flash]

    virtual._flush_simple_segments(virtual.assembled_frame)

    assert virtual.assembled_frame is not None
    assert np.allclose(virtual.assembled_frame, 20.0)
    assert len(updates) == 1
    seg = cast(NDArray[np.float64], updates[0][1][0][0])
    assert np.allclose(seg, np.array([255.0, 245.0, 228.0]))


def test_inactive_oneshots_are_skipped_in_simple_and_complex_flush():
    virtual, updates = _make_flush_virtual(mapping="span", pixel_count=6)
    inactive_flash = Flash(color=(255, 0, 0), ramp=0, hold=1000, fade=0, brightness=1.0)
    inactive_flash.update()
    inactive_flash.active = False
    virtual._oneshots = [inactive_flash]

    virtual._flush_simple_segments(virtual.assembled_frame)
    seg = cast(NDArray[np.float64], updates[0][1][0][0])
    assert np.allclose(seg, 20.0)

    updates.clear()
    virtual._device_remap = {
        "dev1": {
            "src": np.arange(6, dtype=np.intp),
            "dst": np.arange(6, dtype=np.intp),
        }
    }
    virtual._flush_complex_segments(virtual.assembled_frame)
    complex_seg = cast(NDArray[np.float64], updates[0][1][0][0])
    assert np.allclose(complex_seg, 20.0)


def test_clear_oneshots_cancels_active_flashes_under_lock():
    virtual = Virtual.__new__(Virtual)
    virtual.lock = threading.Lock()
    flash1 = Flash(color=(255, 255, 255), ramp=0, hold=1000, fade=0, brightness=1.0)
    flash2 = Flash(color=(0, 255, 0), ramp=0, hold=1000, fade=0, brightness=1.0)
    virtual._oneshots = [flash1, flash2]

    def _get_or_raise(virtual_id: VirtualIdStr) -> Virtual:
        return virtual

    mgr = Virtuals.__new__(Virtuals)
    mgr.get_or_raise = _get_or_raise

    assert mgr.clear_oneshots(VirtualIdStr("test-virt")) is True
    assert flash1.active is False
    assert flash2.active is False


def test_force_frame_creates_float64_pixels_compatible_with_flash_apply():
    virtual, updates = _make_flush_virtual(mapping="span", pixel_count=6)
    flash = Flash(color=(100, 150, 200), ramp=0, hold=1000, fade=0, brightness=1.0)
    flash.update()
    virtual._oneshots = [flash]

    virtual.force_frame((10, 20, 30))

    assert virtual.assembled_frame is not None
    assert virtual.assembled_frame.dtype == np.float64
    assert np.allclose(virtual.assembled_frame, np.array([10.0, 20.0, 30.0]))
    assert len(updates) == 1
    seg = cast(NDArray[np.float64], updates[0][1][0][0])
    assert np.allclose(seg, np.array([100.0, 150.0, 200.0]))

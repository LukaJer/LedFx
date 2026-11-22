from types import SimpleNamespace

import numpy as np

from ledfx.effects.oneshots.oneshot import Flash
from ledfx.virtuals import Virtual


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

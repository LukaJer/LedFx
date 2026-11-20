import json
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from ledfx.api.layouts import LayoutsEndpoint
from ledfx.configuration.models import (
    LayoutProfile,
    LayoutVirtualMapping,
    LedFxConfig,
    Segment,
    VirtualConfig,
)


def _make_request(payload: object) -> MagicMock:
    req = MagicMock()

    async def _json() -> object:
        return payload

    req.json = _json
    return req


def test_layout_profile_model_validates() -> None:
    cfg = LedFxConfig(
        active_layout_id="pillars",
        layout_profiles={
            "pillars": LayoutProfile(
                name="10 Pillars",
                scene_tag="pillars",
                virtuals={
                    "all": LayoutVirtualMapping(
                        rows=2, segments=[["wled-1", 0, 9, False]]
                    )
                },
            )
        },
    )
    assert cfg.active_layout_id == "pillars"
    assert cfg.layout_profiles["pillars"].virtuals["all"].rows == 2


@pytest.mark.asyncio
async def test_layouts_endpoint_crud_and_apply() -> None:
    cfg = LedFxConfig()
    v_cfg = VirtualConfig(name="Matrix", rows=1)
    virtual = SimpleNamespace(
        id="matrix",
        is_device=False,
        config=v_cfg,
        segments=[Segment("wled-1", 0, 9, False)],
        validate_segment=lambda seg: tuple(seg),
    )

    set_config_calls: list[tuple[str, VirtualConfig]] = []
    set_segments_calls: list[tuple[str, list[Segment]]] = []

    def _set_config(vid: str, new_cfg: VirtualConfig) -> object:
        set_config_calls.append((vid, new_cfg))
        virtual.config = new_cfg
        return virtual

    def _set_segments(vid: str, segs: list[Segment]) -> object:
        set_segments_calls.append((vid, segs))
        virtual.segments = segs
        return virtual

    ledfx = SimpleNamespace(
        config=cfg,
        config_store=SimpleNamespace(request_save=MagicMock(), read_only=False, error=None),
        virtuals=SimpleNamespace(
            values=lambda: [virtual],
            get=lambda vid: virtual if vid == "matrix" else None,
            set_config=_set_config,
            set_segments=_set_segments,
        ),
    )
    ep = LayoutsEndpoint(ledfx)

    # POST snapshot
    resp = await ep.post(
        _make_request({"name": "2x5 Grid", "scene_tag": "grid", "snapshot": True})
    )
    body = json.loads(resp.text)
    assert body["status"] == "success"
    layout_id = body["layout"]["id"]
    assert layout_id in cfg.layout_profiles
    assert cfg.layout_profiles[layout_id].scene_tag == "grid"
    assert cfg.layout_profiles[layout_id].virtuals["matrix"].segments == [
        ["wled-1", 0, 9, False]
    ]

    # Modify stored mapping and PUT apply
    cfg.layout_profiles[layout_id].virtuals["matrix"] = LayoutVirtualMapping(
        rows=2, grouping=4, segments=[["wled-1", 0, 9, True]]
    )
    resp = await ep.put(_make_request({"id": layout_id}))
    applied_body = json.loads(resp.text)
    assert applied_body["status"] == "success"
    assert applied_body["applied"] == ["matrix"]
    assert len(set_config_calls) == 1
    assert set_config_calls[0][1].rows == 2
    assert set_config_calls[0][1].grouping == 4
    assert set_segments_calls[0][1] == [Segment("wled-1", 0, 9, True)]

    # GET
    resp = await ep.get()
    get_body = json.loads(resp.text)
    assert get_body["active_layout_id"] == layout_id
    assert layout_id in get_body["layouts"]

    # DELETE
    resp = await ep.delete(_make_request({"id": layout_id}))
    del_body = json.loads(resp.text)
    assert del_body["status"] == "success"
    assert layout_id not in cfg.layout_profiles
    assert cfg.active_layout_id == ""


@pytest.mark.asyncio
async def test_layouts_metadata_update_rollback_and_safemode() -> None:
    from ledfx.errors import Invalid, SafeMode

    cfg = LedFxConfig()
    v1 = SimpleNamespace(
        id="v1",
        is_device=False,
        config=VirtualConfig(name="V1", rows=1, grouping=1),
        segments=[Segment("wled-1", 0, 9, False)],
        validate_segment=lambda seg: tuple(seg),
    )
    v2 = SimpleNamespace(
        id="v2",
        is_device=False,
        config=VirtualConfig(name="V2", rows=1, grouping=1),
        segments=[Segment("wled-2", 0, 9, False)],
        validate_segment=lambda seg: tuple(seg),
    )
    vmap = {"v1": v1, "v2": v2}

    def _set_config(vid: str, new_cfg: VirtualConfig) -> object:
        vmap[vid].config = new_cfg
        return vmap[vid]

    def _set_segments(vid: str, segs: list[Segment]) -> object:
        if vid == "v2" and segs and segs[0][3] is True:
            raise Invalid("invalid segment on v2")
        vmap[vid].segments = segs
        return vmap[vid]

    store = SimpleNamespace(request_save=MagicMock(), read_only=False, error=None)
    ledfx = SimpleNamespace(
        config=cfg,
        config_store=store,
        virtuals=SimpleNamespace(
            values=lambda: [v1, v2],
            get=lambda vid: vmap.get(vid),
            set_config=_set_config,
            set_segments=_set_segments,
        ),
    )
    ep = LayoutsEndpoint(ledfx)

    # Create layout with snapshot
    resp = await ep.post(_make_request({"name": "Main", "snapshot": True}))
    lid = json.loads(resp.text)["layout"]["id"]
    orig_segs = dict(cfg.layout_profiles[lid].virtuals)

    # H3: metadata-only update by id without snapshot preserves stored virtuals
    v1.segments = [Segment("wled-1", 0, 4, False)]
    resp = await ep.post(_make_request({"id": lid, "scene_tag": "front"}))
    assert json.loads(resp.text)["status"] == "success"
    assert cfg.layout_profiles[lid].scene_tag == "front"
    assert cfg.layout_profiles[lid].virtuals == orig_segs

    # H2: partial PUT failure rolls back v1
    cfg.active_layout_id = ""
    v1.segments = [Segment("wled-1", 0, 4, False)]
    cfg.layout_profiles[lid].virtuals["v1"] = LayoutVirtualMapping(
        rows=2, grouping=4, segments=[["wled-1", 0, 9, True]]
    )
    cfg.layout_profiles[lid].virtuals["v2"] = LayoutVirtualMapping(
        rows=1, grouping=1, segments=[["wled-2", 0, 9, True]]
    )
    resp = await ep.put(_make_request({"id": lid}))
    assert json.loads(resp.text)["status"] == "failed"
    assert v1.config.rows == 1
    assert v1.config.grouping == 1
    assert v1.segments == [Segment("wled-1", 0, 4, False)]
    assert cfg.active_layout_id == ""

    # H4: SafeMode blocks POST/PUT/DELETE
    store.read_only = True
    with pytest.raises(SafeMode):
        await ep.post(_make_request({"id": lid, "scene_tag": "blocked"}))
    with pytest.raises(SafeMode):
        await ep.put(_make_request({"id": lid}))
    with pytest.raises(SafeMode):
        await ep.delete(_make_request({"id": lid}))

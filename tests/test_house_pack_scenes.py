import importlib
import json
import pkgutil
from pathlib import Path

import ledfx.effects as effects_pkg
from ledfx.effects import Effect

CONFIG_PATH = Path(__file__).resolve().parent.parent / "config" / "config.json"

EXPECTED_HOUSE_PACK_SCENES: dict[str, dict[str, object]] = {
    "front-candle-shimmer": {
        "name": "Candle Shimmer",
        "scene_tags": "chill,house",
        "virtuals": {"front-pillars": "tube_lighthouse"},
    },
    "back-candle-shimmer": {
        "name": "Candle Shimmer",
        "scene_tags": "chill,house",
        "virtuals": {"back-pillars": "tube_lighthouse"},
    },
    "front-sunset-horizon": {
        "name": "Sunset Horizon",
        "scene_tags": "chill,house",
        "virtuals": {"front-pillars": "tube_wave"},
    },
    "back-sunset-horizon": {
        "name": "Sunset Horizon",
        "scene_tags": "chill,house",
        "virtuals": {"back-pillars": "tube_wave"},
    },
    "front-deep-pulse": {
        "name": "Deep Pulse",
        "scene_tags": "chill,house",
        "virtuals": {"front-pillars": "tube_ring_beat"},
    },
    "back-deep-pulse": {
        "name": "Deep Pulse",
        "scene_tags": "chill,house",
        "virtuals": {"back-pillars": "tube_ring_beat"},
    },
    "front-minimal-afterglow": {
        "name": "Minimal Afterglow",
        "scene_tags": "chill,house",
        "virtuals": {"front-matrix": "plasma2d"},
    },
    "back-minimal-afterglow": {
        "name": "Minimal Afterglow",
        "scene_tags": "chill,house",
        "virtuals": {"back-matrix": "plasma2d"},
    },
    "deep-house-duo": {
        "name": "Deep House Duo",
        "scene_tags": "chill,house,all",
        "virtuals": {
            "front-pillars": "tube_ring_beat",
            "back-pillars": "tube_lighthouse",
        },
    },
}


def _load_effect_registry() -> dict[str, type[Effect]]:
    for _, module_name, _ in pkgutil.iter_modules(
        effects_pkg.__path__, effects_pkg.__name__ + "."
    ):
        importlib.import_module(module_name)
    return Effect.registry()


def _load_config() -> dict[str, object]:
    return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))


def test_house_pack_scenes_present_with_expected_metadata() -> None:
    cfg = _load_config()
    scenes = cfg["scenes"]
    assert isinstance(scenes, dict)

    for scene_id, expected in EXPECTED_HOUSE_PACK_SCENES.items():
        assert scene_id in scenes, f"Missing scene {scene_id!r}"
        scene = scenes[scene_id]
        assert scene["name"] == expected["name"]
        assert scene["scene_tags"] == expected["scene_tags"]
        assert scene["scene_image"] == "Wallpaper"

        expected_virtuals = expected["virtuals"]
        assert isinstance(expected_virtuals, dict)
        assert set(scene["virtuals"].keys()) == set(expected_virtuals.keys())
        for virtual_id, effect_type in expected_virtuals.items():
            entry = scene["virtuals"][virtual_id]
            assert entry["action"] == "activate"
            assert entry["type"] == effect_type


def test_house_pack_virtuals_exist_in_config() -> None:
    cfg = _load_config()
    virtuals = cfg["virtuals"]
    assert isinstance(virtuals, list)
    defined_virtual_ids = {v["id"] for v in virtuals if "id" in v}

    scenes = cfg["scenes"]
    for scene_id in EXPECTED_HOUSE_PACK_SCENES:
        for virtual_id in scenes[scene_id]["virtuals"]:
            assert (
                virtual_id in defined_virtual_ids
            ), f"Scene {scene_id!r} references missing virtual {virtual_id!r}"


def test_house_pack_effect_configs_validate_strictly() -> None:
    cfg = _load_config()
    scenes = cfg["scenes"]
    registry = _load_effect_registry()

    for scene_id in EXPECTED_HOUSE_PACK_SCENES:
        for virtual_id, entry in scenes[scene_id]["virtuals"].items():
            effect_type = entry["type"]
            assert effect_type in registry, (
                f"Scene {scene_id!r} virtual {virtual_id!r} uses unknown effect {effect_type!r}"
            )
            effect_cls = registry[effect_type]
            effect_cfg = entry["config"]
            assert isinstance(effect_cfg, dict)

            unknown_keys = set(effect_cfg.keys()) - set(
                effect_cls.Config.model_fields.keys()
            )
            assert not unknown_keys, (
                f"Scene {scene_id!r} virtual {virtual_id!r} has unknown config keys: {unknown_keys}"
            )

            validated = effect_cls.Config.model_validate(effect_cfg)
            assert validated is not None

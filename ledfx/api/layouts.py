import logging
from json import JSONDecodeError

from aiohttp import web
from pydantic import ValidationError

from ledfx.api import RestEndpoint
from ledfx.api.virtual import _v1_segments
from ledfx.configuration.fields import VirtualIdStr
from ledfx.configuration.models import LayoutProfile, VirtualConfig
from ledfx.errors import Invalid
from ledfx.utils import generate_id

_LOGGER = logging.getLogger(__name__)


class LayoutsEndpoint(RestEndpoint):
    """REST endpoint for managing and applying physical layout profiles."""

    ENDPOINT_PATH = "/api/layouts"

    async def get(self) -> web.Response:
        """Return all saved layout profiles and the active layout ID."""
        layouts = {
            layout_id: profile.model_dump(mode="json")
            for layout_id, profile in self._ledfx.config.layout_profiles.items()
        }
        return await self.bare_request_success(
            {
                "status": "success",
                "active_layout_id": self._ledfx.config.active_layout_id,
                "layouts": layouts,
            }
        )

    async def post(self, request: web.Request) -> web.Response:
        """Create or update a layout profile, snapshotting virtuals by default."""
        try:
            data = await request.json()
        except JSONDecodeError:
            return await self.json_decode_error()
        if not isinstance(data, dict):
            return await self.invalid_request("Request body must be a JSON object")

        raw_id = data.get("id")
        raw_name = data.get("name")
        scene_tag = data.get("scene_tag")
        virtuals_payload = data.get("virtuals")
        snapshot = data.get("snapshot", virtuals_payload is None)

        if raw_id is not None and not isinstance(raw_id, str):
            return await self.invalid_request('"id" must be a string')
        if raw_name is not None and not isinstance(raw_name, str):
            return await self.invalid_request('"name" must be a string')
        if scene_tag is not None and not isinstance(scene_tag, str):
            return await self.invalid_request('"scene_tag" must be a string')

        if raw_id:
            layout_id = generate_id(raw_id)
            existing = self._ledfx.config.layout_profiles.get(layout_id)
            if existing is None:
                return await self.invalid_request(
                    f"Layout '{raw_id}' does not exist"
                )
            profile_dict = existing.model_dump(mode="json")
            if raw_name is not None:
                profile_dict["name"] = raw_name
            if scene_tag is not None:
                profile_dict["scene_tag"] = scene_tag
        else:
            if not raw_name or not raw_name.strip():
                return await self.invalid_request("Required attribute 'name' was not provided")
            base_id = generate_id(raw_name)
            layout_id = base_id
            idx = 1
            while layout_id in self._ledfx.config.layout_profiles:
                layout_id = f"{base_id}-{idx}"
                idx += 1
            profile_dict = {
                "name": raw_name.strip(),
                "scene_tag": scene_tag.strip() if isinstance(scene_tag, str) else "",
                "virtuals": {},
            }

        if snapshot:
            non_device = [
                v for v in self._ledfx.virtuals.values() if not v.is_device
            ]
            targets = non_device or list(self._ledfx.virtuals.values())
            profile_dict["virtuals"] = {
                v.id: {
                    "rows": v.config.rows,
                    "grouping": v.config.grouping,
                    "segments": [list(seg) for seg in v.segments],
                }
                for v in targets
            }
        elif virtuals_payload is not None:
            if not isinstance(virtuals_payload, dict):
                return await self.invalid_request('"virtuals" must be an object')
            profile_dict["virtuals"] = virtuals_payload

        try:
            profile = LayoutProfile.model_validate(profile_dict)
        except ValidationError as err:
            return await self.validation_error(err)

        self._ledfx.config.layout_profiles[layout_id] = profile
        self._ledfx.config.active_layout_id = layout_id
        self._ledfx.config_store.request_save()
        _LOGGER.info("Saved layout profile %s (%s)", layout_id, profile.name)
        return await self.bare_request_success(
            {
                "status": "success",
                "layout": {"id": layout_id, **profile.model_dump(mode="json")},
            }
        )

    async def put(self, request: web.Request) -> web.Response:
        """Apply a saved layout profile to all matching logical virtuals."""
        try:
            data = await request.json()
        except JSONDecodeError:
            return await self.json_decode_error()
        if not isinstance(data, dict):
            return await self.invalid_request("Request body must be a JSON object")

        raw_id = data.get("id")
        if not isinstance(raw_id, str) or not raw_id.strip():
            return await self.invalid_request('Required attribute "id" was not provided')

        layout_id = generate_id(raw_id)
        profile = self._ledfx.config.layout_profiles.get(layout_id)
        if profile is None:
            return await self.invalid_request(f"Layout '{raw_id}' not found")

        applied: list[str] = []
        skipped: list[str] = []
        for virtual_id, mapping in profile.virtuals.items():
            virtual = self._ledfx.virtuals.get(virtual_id)
            if virtual is None:
                skipped.append(virtual_id)
                continue
            vid = VirtualIdStr(virtual_id)
            try:
                if (
                    virtual.config.rows != mapping.rows
                    or virtual.config.grouping != mapping.grouping
                ):
                    new_cfg = VirtualConfig.model_validate(
                        {
                            **virtual.config.model_dump(),
                            "rows": mapping.rows,
                            "grouping": mapping.grouping,
                        }
                    )
                    self._ledfx.virtuals.set_config(vid, new_cfg)
                segments = _v1_segments(virtual, mapping.segments)
                self._ledfx.virtuals.set_segments(vid, segments)
                applied.append(virtual_id)
            except (ValueError, ValidationError, Invalid) as err:
                detail = err.detail if isinstance(err, Invalid) else str(err)
                _LOGGER.warning(
                    "Layout %s failed updating virtual %s: %s",
                    layout_id,
                    virtual_id,
                    detail,
                )
                return await self.invalid_request(
                    f"Failed applying layout to virtual '{virtual_id}': {detail}"
                )

        self._ledfx.config.active_layout_id = layout_id
        self._ledfx.config_store.request_save()
        _LOGGER.info(
            "Applied layout %s (applied=%d, skipped=%d)",
            layout_id,
            len(applied),
            len(skipped),
        )
        return await self.bare_request_success(
            {
                "status": "success",
                "active_layout_id": layout_id,
                "applied": applied,
                "skipped": skipped,
            }
        )

    async def delete(self, request: web.Request) -> web.Response:
        """Delete a saved layout profile by ID."""
        try:
            data = await request.json()
        except JSONDecodeError:
            return await self.json_decode_error()
        if not isinstance(data, dict):
            return await self.invalid_request("Request body must be a JSON object")

        raw_id = data.get("id")
        if not isinstance(raw_id, str) or not raw_id.strip():
            return await self.invalid_request('Required attribute "id" was not provided')

        layout_id = generate_id(raw_id)
        if layout_id not in self._ledfx.config.layout_profiles:
            return await self.invalid_request(f"Layout '{raw_id}' not found")

        del self._ledfx.config.layout_profiles[layout_id]
        if self._ledfx.config.active_layout_id == layout_id:
            self._ledfx.config.active_layout_id = ""
        self._ledfx.config_store.request_save()
        return await self.request_success(
            type="success", message=f"Deleted layout '{layout_id}'"
        )

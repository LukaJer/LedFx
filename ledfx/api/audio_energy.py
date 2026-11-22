from aiohttp import web

from ledfx.api import RestEndpoint


class AudioEnergyResetEndpoint(RestEndpoint):
    """Reset the audio energy envelope and drop/breakdown detector baseline."""

    ENDPOINT_PATH = "/api/audio/energy/reset"

    async def post(self) -> web.Response:
        audio = getattr(self._ledfx, "audio", None)
        reset_fn = getattr(audio, "reset_energy_envelope", None)
        if callable(reset_fn):
            reset_fn()
            return await self.request_success("info", "Energy envelope reset")
        return await self.request_success("info", "No active audio source to reset")

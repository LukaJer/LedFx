"""Shared ownership and publication lifecycle for synchronous packet senders."""

from __future__ import annotations

import asyncio
import logging
import threading
import time
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from typing import TYPE_CHECKING

from ledfx_senders import (
    ArtNetSender,
    DDPSender,
    OPCSender,
    OSCSender,
    UDPRealtimeSender,
)
from typing_extensions import override

from ledfx.devices import Device, NetworkedDevice, resolve_destination
from ledfx.utils import BaseRegistry

if TYPE_CHECKING:
    from ledfx.core import LedFxCore

_LOGGER = logging.getLogger(__name__)


@BaseRegistry.no_registration
class NativePacketDevice(NetworkedDevice):
    RETRY_INTERVAL_SECONDS = 5.0

    def __init__(self, ledfx: LedFxCore, config: NetworkedDevice.Config) -> None:
        super().__init__(ledfx, config)
        self.device_lock = threading.RLock()
        self._sender: (
            ArtNetSender | DDPSender | OPCSender | OSCSender | UDPRealtimeSender | None
        ) = None
        self._destination = None
        self._generation = 0
        self._requested = False
        self._retry_handle: asyncio.TimerHandle | None = None
        self._last_reconnect_attempt: float = 0.0

    @override
    @contextmanager
    def _config_update_context(self, config: dict[str, object]) -> Iterator[None]:
        with self.device_lock, super()._config_update_context(config):
            yield

    def _validate_configuration(self) -> None:
        raise NotImplementedError

    def _make_sender(
        self, destination: str
    ) -> ArtNetSender | DDPSender | OPCSender | OSCSender | UDPRealtimeSender:
        raise NotImplementedError

    def _replace(
        self,
        candidate: ArtNetSender
        | DDPSender
        | OPCSender
        | OSCSender
        | UDPRealtimeSender
        | None,
    ) -> None:
        old = self._sender
        self._sender = candidate
        self._generation += 1
        if old is not None:
            old.close()

    @override
    def config_updated(self, config: object) -> None:
        with self.device_lock:
            if not self._output_changed():
                return
            self._validate_configuration()
            candidate = None
            if self._requested and self._destination is not None:
                candidate = self._make_sender(self._destination)
            self._replace(candidate)
            self._built_settings = self._output_settings()
            if self._requested and candidate is None:
                self._schedule_resolution()

    def _cancel_retry(self) -> None:
        handle = self._retry_handle
        self._retry_handle = None
        if handle is not None:
            loop = self._ledfx.loop
            if not loop.is_closed():
                loop.call_soon_threadsafe(handle.cancel)

    def _schedule_resolution(self) -> None:
        address, generation = self.config.ip_address, self._generation
        loop = self._ledfx.loop
        if not loop.is_closed():
            loop.call_soon_threadsafe(
                lambda: loop.create_task(self._resolve(address, generation))
            )

    def _schedule_retry(self, address: str, generation: int) -> None:
        loop = self._ledfx.loop
        if loop.is_closed():
            return

        def _arm() -> None:
            with self.device_lock:
                if (
                    not self._requested
                    or generation != self._generation
                    or address != self.config.ip_address
                ):
                    return
                if self._retry_handle is not None:
                    self._retry_handle.cancel()
                self._retry_handle = loop.call_later(
                    self.RETRY_INTERVAL_SECONDS,
                    lambda: loop.create_task(self._resolve(address, generation)),
                )

        loop.call_soon_threadsafe(_arm)

    def trigger_reconnect(self) -> None:
        """Rate-limited re-resolution when an active sender hits send errors."""
        now = time.monotonic()
        with self.device_lock:
            if not self._requested:
                return
            if now - self._last_reconnect_attempt < self.RETRY_INTERVAL_SECONDS:
                return
            self._last_reconnect_attempt = now
            self._schedule_resolution()

    @override
    async def resolve_address(
        self, success_callback: Callable[[], object] | None = None
    ) -> None:
        with self.device_lock:
            address, generation = self.config.ip_address, self._generation
        await self._resolve(address, generation, success_callback)

    async def _resolve(
        self,
        address: str,
        generation: int,
        success_callback: Callable[[], object] | None = None,
    ) -> None:
        try:
            destination = await resolve_destination(
                self._ledfx.loop, self._ledfx.thread_executor, address
            )
        except ValueError as error:
            with self.device_lock:
                if generation == self._generation and address == self.config.ip_address:
                    self._online = False
                    _LOGGER.warning("Device %s: %s", self.name, error)
                    if self._requested:
                        self._schedule_retry(address, generation)
            return
        with self.device_lock:
            if generation != self._generation or address != self.config.ip_address:
                return
            self._cancel_retry()
            candidate = None
            if self._requested and (
                self._sender is None or destination != self._destination
            ):
                self._validate_configuration()
                candidate = self._make_sender(destination)
            # Publish only after construction succeeds, keeping the live sender
            # and DNS metadata consistent on candidate failure.
            self._destination = destination
            self._online = True
            if candidate is not None:
                self._replace(candidate)
                if not self.is_active():
                    Device.activate(self)
        if success_callback is not None:
            success_callback()

    @override
    async def async_initialize(self) -> None:
        await self.resolve_address()

    @override
    def activate(self, *args: object, **kwargs: object) -> None:
        with self.device_lock:
            self._validate_configuration()
            self._requested = True
            if self._destination is None:
                self._schedule_resolution()
                return
            candidate = self._make_sender(self._destination)
            self._replace(candidate)
            self._online = True
            Device.activate(self)

    @override
    def deactivate(self) -> None:
        with self.device_lock:
            self._requested = False
            self._cancel_retry()
            self._replace(None)
            Device.deactivate(self)

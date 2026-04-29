"""
picow_net_bridge — Pico W (CYW43439) network bridge

The chip-side gSPI emulation lives in the **frontend**
(``frontend/src/simulation/cyw43/``) — the bus state machine, scan
results, IOCTL responses and the on-board LED IOCTL all run inside the
browser. What the frontend cannot do is forward TCP/UDP packets out to
the real internet, so this backend service plays the same role
``esp32_worker.py`` does for the ESP32:

   frontend cyw43_emulator → onPacketOut → WebSocket
   → picow_net_bridge → host network (TCP/UDP via slirp-style proxy)
   → response back → WebSocket → cyw43_emulator.injectPacket → driver

By design this bridge:

  * **Does NOT execute any closed firmware blob.** The 224 KB CYW43
    firmware never enters this process. The bridge only sees Layer-2
    Ethernet frames produced by the frontend's emulator after lwIP has
    finished framing.
  * **Does NOT speak 802.11.** Slirp / userspace TCP-UDP only, the
    same trade-off the ESP32 path accepts.
  * **Does NOT know about WPA / WPA2.** Passwords on the frontend are
    accepted as-is; what reaches us is plain TCP/UDP traffic.

Protocol (mirrors Esp32Bridge — same ws://…/api/simulation/ws/<id>):

   Frontend → Backend
     { type: 'start_picow',       data: { wifi_enabled: bool } }
     { type: 'stop_picow' }
     { type: 'picow_packet_out',  data: { ether_b64: str } }

   Backend → Frontend
     { type: 'wifi_status',       data: { status: str, ssid?, ip? } }
     { type: 'picow_packet_in',   data: { ether_b64: str } }
     { type: 'system',            data: { event, ... } }
     { type: 'error',             data: { message } }

References
----------
- Implementation guide: docs/PICO_W_WIFI_EMULATION.md
- Wiki post-mortem:     docs/wiki/picow-cyw43-emulation.md
- Test vectors:         test/test_Raspberry_Pi_Pico_W/test_code/
- Public sources used:  Infineon CYW43439 datasheet,
                        raspberrypi/pico-sdk pico_cyw43_driver (BSD-3),
                        jbentham/picowi (MIT)
- Upstream IoT projects: github.com/KritishMohapatra/100_Days_100_IoT_Projects
"""

from __future__ import annotations

import asyncio
import base64
import logging
from typing import Awaitable, Callable, Dict

logger = logging.getLogger(__name__)

# Network reach is gated on this single env-var so it can be disabled
# in CI / sandboxed environments. When False the bridge becomes a
# loopback-only echo for tests; production is True.
import os
_NET_ENABLED = os.environ.get('VELXIO_PICOW_NET', 'true').lower() not in ('0', 'false', 'no')


# Per-instance state used to track outbound TCP streams (slirp-style).
class _Picow:
    def __init__(
        self,
        client_id: str,
        callback: Callable[[str, dict], Awaitable[None]],
        wifi_enabled: bool,
    ) -> None:
        self.client_id = client_id
        self.callback = callback
        self.wifi_enabled = wifi_enabled
        self.running = True
        # Per-stream task table — keyed by (src_ip:port, dst_ip:port).
        self._tcp_streams: Dict[tuple, asyncio.Queue] = {}
        # Synthetic STA IP — must match frontend/virtual-ap.ts.
        self.sta_ip = '10.13.37.42'

    async def emit(self, kind: str, data: dict) -> None:
        try:
            await self.callback(kind, data)
        except Exception:
            logger.exception('[picow:%s] callback failed for %s', self.client_id, kind)

    async def shutdown(self) -> None:
        self.running = False
        # Drop all queued TCP streams. asyncio cleans up the listeners.
        self._tcp_streams.clear()


class PicowNetManager:
    """Singleton-like manager mirroring esp_qemu_manager API surface."""

    def __init__(self) -> None:
        self._instances: Dict[str, _Picow] = {}

    # ── Lifecycle ──────────────────────────────────────────────────
    async def start_instance(
        self,
        client_id: str,
        callback: Callable[[str, dict], Awaitable[None]],
        wifi_enabled: bool,
    ) -> None:
        if client_id in self._instances:
            return
        inst = _Picow(client_id, callback, wifi_enabled)
        self._instances[client_id] = inst
        logger.info('[picow:%s] start wifi_enabled=%s', client_id, wifi_enabled)
        await inst.emit('wifi_status', {
            'status': 'started',
            'ssid': 'Velxio-GUEST' if wifi_enabled else None,
            'ip': inst.sta_ip if wifi_enabled else None,
        })

    async def stop_instance(self, client_id: str) -> None:
        inst = self._instances.pop(client_id, None)
        if inst is None:
            return
        await inst.shutdown()
        logger.info('[picow:%s] stop', client_id)

    def has_instance(self, client_id: str) -> bool:
        return client_id in self._instances

    # ── Outbound traffic — chip → host ─────────────────────────────
    async def deliver_packet_out(self, client_id: str, ether_b64: str) -> None:
        inst = self._instances.get(client_id)
        if inst is None or not inst.running or not inst.wifi_enabled:
            return
        try:
            ether = base64.b64decode(ether_b64)
        except Exception:
            logger.warning('[picow:%s] bad ether_b64', client_id)
            return

        if not _NET_ENABLED:
            logger.debug('[picow:%s] net disabled — drop %d bytes', client_id, len(ether))
            return

        # Strip Ethernet header (14 bytes) and route by ethertype.
        if len(ether) < 14:
            return
        ethertype = (ether[12] << 8) | ether[13]

        if ethertype == 0x0800:  # IPv4
            await self._handle_ipv4(inst, ether[14:])
        elif ethertype == 0x0806:  # ARP — synthesize a reply for the gateway
            await self._handle_arp(inst, ether)
        elif ethertype == 0x86dd:  # IPv6
            # Not implemented; drop silently — slirp ESP32 path also drops.
            logger.debug('[picow:%s] drop IPv6 frame', client_id)
        else:
            logger.debug('[picow:%s] drop ethertype 0x%04x', client_id, ethertype)

    # ── Inbound traffic — host → chip ──────────────────────────────
    async def deliver_packet_in(self, client_id: str, ether: bytes) -> None:
        inst = self._instances.get(client_id)
        if inst is None or not inst.running:
            return
        await inst.emit('picow_packet_in', {
            'ether_b64': base64.b64encode(ether).decode('ascii'),
        })

    # ── Stub L3/L4 handlers ────────────────────────────────────────
    async def _handle_ipv4(self, inst: _Picow, ip: bytes) -> None:
        if len(ip) < 20:
            return
        proto = ip[9]
        if proto == 0x06:   # TCP
            # Real implementation would terminate TCP locally and forward
            # the payload to the destination. For the first iteration we
            # log the SYN target so users know the request reached us.
            ihl = (ip[0] & 0x0f) * 4
            if len(ip) >= ihl + 20:
                tcp_flags = ip[ihl + 13]
                src_port = (ip[ihl] << 8) | ip[ihl + 1]
                dst_port = (ip[ihl + 2] << 8) | ip[ihl + 3]
                if tcp_flags & 0x02:  # SYN
                    dst_ip = '%d.%d.%d.%d' % (ip[16], ip[17], ip[18], ip[19])
                    logger.info(
                        '[picow:%s] TCP SYN %d → %s:%d',
                        inst.client_id, src_port, dst_ip, dst_port,
                    )
        elif proto == 0x11:  # UDP
            ihl = (ip[0] & 0x0f) * 4
            if len(ip) >= ihl + 8:
                dst_port = (ip[ihl + 2] << 8) | ip[ihl + 3]
                logger.debug('[picow:%s] UDP → :%d', inst.client_id, dst_port)
        elif proto == 0x01:  # ICMP — could synthesize a pong; not yet.
            logger.debug('[picow:%s] ICMP', inst.client_id)

    async def _handle_arp(self, _inst: _Picow, _ether: bytes) -> None:
        # Tier 0 ARP: ignore. The MicroPython lwIP stack on the
        # frontend pre-populates its ARP cache with the synthetic
        # gateway MAC, so it never asks.
        return


# Module-level singleton — same pattern as esp_qemu_manager.
picow_net_manager = PicowNetManager()

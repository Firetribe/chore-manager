from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

import voluptuous as vol

from homeassistant.components.frontend import async_register_built_in_panel, async_remove_panel
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.helpers import config_validation as cv, dispatcher
from homeassistant.helpers.entity_registry import async_get as async_get_registry
from homeassistant.helpers.typing import ConfigType

from .const import DOMAIN, PLATFORMS, SIGNAL_UPDATE
from .store import ChoreStore

SERVICE_MARK_DONE = "mark_done"
SERVICE_ADD = "add_chore"
SERVICE_UPDATE = "update_chore"
SERVICE_REMOVE = "remove_chore"
DATA_STORE = "store"
PANEL_PATH = "chore-manager"
PANEL_URL = "/chore_manager/chore-manager-panel.js?v=1.0.2"


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    static_key = f"{DOMAIN}_static"
    if not hass.data.get(static_key):
        await hass.http.async_register_static_paths(
            [StaticPathConfig("/chore_manager", str(Path(__file__).parent / "frontend"), False)]
        )
        hass.data[static_key] = True
    return True


def _base_id(hass: HomeAssistant, value: str) -> str | None:
    if value.startswith("sensor."):
        state = hass.states.get(value)
        return state.attributes.get("chore_id") if state else None
    return value


async def _person(hass: HomeAssistant, call: ServiceCall) -> tuple[str, str | None]:
    entity = call.data.get("person")
    if entity:
        state = hass.states.get(entity)
        return (state.name if state else entity), entity
    uid = call.context.user_id
    if uid:
        for state in hass.states.async_all("person"):
            if state.attributes.get("user_id") == uid:
                return state.name, state.entity_id
        user = await hass.auth.async_get_user(uid)
        if user and user.name:
            return user.name, None
    return "", None


def _ids(hass: HomeAssistant, data) -> list[str]:
    vals = data.get("chore_id") or data.get("entity_id")
    if isinstance(vals, str):
        vals = [vals]
    return [cid for cid in (_base_id(hass, v) for v in vals or []) if cid]


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    store = ChoreStore(hass)
    await store.async_load()
    hass.data.setdefault(DOMAIN, {})[entry.entry_id] = {DATA_STORE: store}

    async def signal() -> None:
        dispatcher.async_dispatcher_send(hass, f"{SIGNAL_UPDATE}_{entry.entry_id}")

    async def mark(call: ServiceCall) -> None:
        now = datetime.now(timezone.utc).isoformat()
        name, entity = await _person(hass, call)
        for cid in _ids(hass, call.data):
            if cid in store.chores:
                store.chores[cid].update(last_done=now, done_by=name, done_by_entity=entity)
        await store.async_save()
        await signal()

    async def add(call: ServiceCall) -> None:
        chore = {
            "id": uuid4().hex,
            "name": call.data["name"],
            "room": call.data.get("room", ""),
            "floor": call.data.get("floor", ""),
            "frequency_days": call.data.get("frequency_days", 7),
            "last_done": None,
            "done_by": "",
            "done_by_entity": None,
        }
        store.chores[chore["id"]] = chore
        await store.async_save()
        await signal()

    async def update(call: ServiceCall) -> None:
        for cid in _ids(hass, call.data):
            if cid in store.chores:
                for key in (
                    "name",
                    "room",
                    "floor",
                    "frequency_days",
                    "done_by",
                    "done_by_entity",
                ):
                    if key in call.data:
                        value = call.data[key]
                        store.chores[cid][key] = (
                            (value or None) if key == "done_by_entity" else value
                        )
        await store.async_save()
        await signal()

    async def remove(call: ServiceCall) -> None:
        reg = async_get_registry(hass)
        for cid in _ids(hass, call.data):
            store.chores.pop(cid, None)
            for ent in list(reg.entities.values()):
                if (
                    ent.config_entry_id == entry.entry_id
                    and ent.unique_id == f"{entry.entry_id}_{cid}"
                ):
                    reg.async_remove(ent.entity_id)
        await store.async_save()
        await signal()

    id_list = vol.All(cv.ensure_list, [cv.string])
    entity_list = vol.All(cv.ensure_list, [cv.entity_id])
    freq = vol.All(vol.Coerce(int), vol.Range(min=1))

    schemas = {
        SERVICE_MARK_DONE: vol.Schema({
            vol.Optional("chore_id"): id_list,
            vol.Optional("entity_id"): entity_list,
            vol.Optional("person"): cv.entity_id,
        }),
        SERVICE_ADD: vol.Schema({
            vol.Required("name"): cv.string,
            vol.Optional("room", default=""): cv.string,
            vol.Optional("floor", default=""): cv.string,
            vol.Optional("frequency_days", default=7): freq,
        }),
        SERVICE_UPDATE: vol.Schema({
            vol.Optional("chore_id"): id_list,
            vol.Optional("entity_id"): entity_list,
            vol.Optional("name"): cv.string,
            vol.Optional("room"): cv.string,
            vol.Optional("floor"): cv.string,
            vol.Optional("frequency_days"): freq,
            vol.Optional("done_by"): cv.string,
            vol.Optional("done_by_entity"): cv.string,
        }),
        SERVICE_REMOVE: vol.Schema({
            vol.Optional("chore_id"): id_list,
            vol.Optional("entity_id"): entity_list,
        }),
    }
    funcs = {
        SERVICE_MARK_DONE: mark,
        SERVICE_ADD: add,
        SERVICE_UPDATE: update,
        SERVICE_REMOVE: remove,
    }
    for name, func in funcs.items():
        hass.services.async_register(DOMAIN, name, func, schemas[name])

    if not hass.data.get(f"{DOMAIN}_panel"):
        async_register_built_in_panel(
            hass,
            "custom",
            sidebar_title="Chores",
            sidebar_icon="mdi:broom",
            frontend_url_path=PANEL_PATH,
            config={
                "_panel_custom": {
                    "name": "chore-manager-panel",
                    "module_url": PANEL_URL,
                    "embed_iframe": False,
                    "trust_external": False,
                },
            },
        )
        hass.data[f"{DOMAIN}_panel"] = True

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if ok:
        hass.data[DOMAIN].pop(entry.entry_id, None)
        if hass.data.pop(f"{DOMAIN}_panel", False):
            async_remove_panel(hass, PANEL_PATH)
        for name in (SERVICE_MARK_DONE, SERVICE_ADD, SERVICE_UPDATE, SERVICE_REMOVE):
            hass.services.async_remove(DOMAIN, name)
    return ok
from __future__ import annotations
from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store
from .const import STORAGE_KEY, STORAGE_VERSION

class ChoreStore:
    def __init__(self, hass: HomeAssistant) -> None:
        self._store = Store(hass, STORAGE_VERSION, STORAGE_KEY)
        self.chores: dict[str, dict] = {}
    async def async_load(self) -> None:
        data = await self._store.async_load() or {}
        self.chores = {c["id"]: c for c in data.get("chores", []) if c.get("id") and c.get("name")}
    async def async_save(self) -> None:
        await self._store.async_save({"chores": list(self.chores.values())})

from __future__ import annotations
from datetime import datetime, timezone, timedelta
from homeassistant.components.sensor import SensorEntity
from homeassistant.const import EntityCategory
from homeassistant.helpers.event import async_track_time_interval
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from .const import DOMAIN, SIGNAL_UPDATE

async def async_setup_entry(hass, entry, async_add_entities):
    store=hass.data[DOMAIN][entry.entry_id]["store"]; entities={}
    def add_missing():
        new=[]
        for cid,chore in store.chores.items():
            if cid not in entities: entities[cid]=ChoreSensor(entry,store,cid); new.append(entities[cid])
        if new: async_add_entities(new)
        for cid in list(entities):
            if cid not in store.chores:
                entity = entities.pop(cid)
                hass.async_create_task(entity.async_remove(force_remove=True))
    add_missing()
    unsub=async_dispatcher_connect(hass,f"{SIGNAL_UPDATE}_{entry.entry_id}",lambda: (add_missing(),[e.async_write_ha_state() for e in entities.values()]))
    timer=async_track_time_interval(hass,lambda _: [e.async_write_ha_state() for e in entities.values()],timedelta(minutes=1))
    entry.async_on_unload(unsub); entry.async_on_unload(timer)

class ChoreSensor(SensorEntity):
    _attr_has_entity_name=False; _attr_device_class="enum"; _attr_translation_key="chore"; _attr_should_poll=False
    _attr_options=["ok","due_soon","overdue"]
    def __init__(self,entry,store,cid): self.entry=entry; self.store=store; self.cid=cid; self._attr_unique_id=f"{entry.entry_id}_{cid}"
    @property
    def _chore(self): return self.store.chores.get(self.cid,{})
    @property
    def name(self): return self._chore.get("name", "Chore")
    @property
    def native_value(self): return self._state()[0]
    def _state(self):
        c=self._chore; last=c.get("last_done"); freq=int(c.get("frequency_days",1)); ratio=None
        if last:
            try: ratio=(datetime.now(timezone.utc)-datetime.fromisoformat(last.replace("Z","+00:00"))).total_seconds()/(freq*86400)
            except ValueError: ratio=None
        return ("overdue" if ratio is None or ratio>=1 else "due_soon" if ratio>=.7 else "ok",ratio)
    @property
    def extra_state_attributes(self):
        c=self._chore; state,ratio=self._state(); return {"chore_id":self.cid,"chore_name":c.get("name"),"room":c.get("room",""),"floor":c.get("floor",""),"frequency_days":c.get("frequency_days",1),"last_done":c.get("last_done"),"done_by":c.get("done_by",""),"done_by_entity":c.get("done_by_entity"),"due":state!="ok","urgency_ratio":ratio}

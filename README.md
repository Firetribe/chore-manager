# Chore Manager

A lightweight Home Assistant integration for recurring household chores. It creates one sensor per chore, tracks who completed it, and includes a responsive dashboard card.

## Features
- Status sensors: `ok`, `due_soon`, and `overdue`; dynamic add/remove via services.
- Room, floor, frequency, completion time, and person tracking.
- English and German translations; minute-level updates.
- Flat, responsive Lovelace card with urgency/location/frequency sorting.

## Installation
In HACS, open **Integrations → Custom repositories**, add `https://github.com/Firetribe/chore-manager`, choose category **Integration**, and install. Restart Home Assistant, then go to **Settings → Devices & services → Add integration** and choose **Chore Manager**.

Add the card to a dashboard:
```yaml
type: custom:chore-manager-card
title: Household chores
sort: urgency # urgency | location | frequency
confirm: true
```

## Services
`chore_manager.add_chore`, `update_chore`, `remove_chore`, and `mark_done`. Use a chore sensor `entity_id` or its `chore_id`; `mark_done` can accept an optional person entity. Sensors expose `chore_id`, `chore_name`, `room`, `floor`, `frequency_days`, `last_done`, `done_by`, `done_by_entity`, `due`, and `urgency_ratio`.

Example automation:
```yaml
alias: Notify overdue chores
trigger:
  - platform: state
    entity_id: sensor.example_chore
    to: overdue
action:
  - service: notify.mobile_app_phone
    data:
      message: "{{ state_attr(trigger.entity_id, 'chore_name') }} is overdue."
```

switchbot-bridge
================

This script allows you to connect [SwitchBot](https://www.switch-bot.com/) devices to HomeAssistant without the need of a hub. I'm aware of the official SwitchBot [integration](https://www.home-assistant.io/integrations/switchbot/), but in some cases the machine running HomeAssistant is too far away from the bot or doesn't support Bluetooth.

Raspberry Pi
------------

It's recommended to use an external USB Bluetooth adapter and not the integrated module in most Raspberry Pis to avoid connection issues or slow response time.

Installation
------------

To install and run the script execute:

```sh
    $ git clone https://github.com/1RandomDev/switchbot-bridge
    $ cp config.sample.json config.json
    $ node index.js
```

Configuration
-------------

- `devices`
    - List of your devices
        - `name`: Device name displayed in HomeAssistant
        - `address`: Bluetooth mac address (SwitchBot app -> Device settings -> 3 dots -> BLE MAC)
- `mqtt`: MQTT broker which HA is connected to
    - ...
- `updateInterval`: The update interval for the device info (in hours)
- `logLevel`: Application log level (available [log levels](https://github.com/winstonjs/winston#logging-levels))
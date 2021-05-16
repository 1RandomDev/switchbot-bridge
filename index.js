const Switchbot = require('node-switchbot');
const mqtt = require('mqtt');

const config = require('./config.json');
const switchbot = new Switchbot();

const mqttClient = mqtt.connect({
    host: config.mqtt.host,
    port: config.mqtt.port,
    username: config.mqtt.username,
    password: config.mqtt.password,
    will: {
        topic: 'switchbot/available',
        payload: 'offline',
        retain: true
    }
});

mqttClient.on('error', err => {
    console.log('Can\'t connect to mqtt broker: '+err.message);
    process.exit(1);
});

mqttClient.publish('switchbot/available', 'online', {retain: true});

(async () => {
    const devices = config.devices;
    await asyncForEach(devices, async device => {
        device.nextBatteryMessage = 0;
        device.id = device.address.replace(/:/g, '').toLowerCase();

        const clients = await switchbot.discover({ id: device.address, quick: true });
        if(clients.length == 0) {
            console.log('Connection to device '+device.name+' failed.');
        } else {
            device.client = clients[0];
            advertiseHomeAssistantDevice(device);
        }
    });

    await switchbot.startScan();
    switchbot.onadvertisement = ad => {
        const device = devices.find(device => device.address == ad.address);
        const currentTime = Date.now()

        if(device.nextBatteryMessage < currentTime) {
            device.nextBatteryMessage = currentTime + 600000; // = 10min
            mqttClient.publish('switchbot/'+device.id+'/battery', ad.serviceData.battery.toString(), {retain: true});
        }

        if(device.invertState) ad.serviceData.state = !ad.serviceData.state;
        if(device.lastState == null || device.lastState != ad.serviceData.state) {
            device.lastState = ad.serviceData.state;
            mqttClient.publish('switchbot/'+device.id+'/state', ad.serviceData.state ? 'ON' : "OFF", {retain: true});
        }
    };

    mqttClient.subscribe('switchbot/+/control');
    mqttClient.on('message', async (topic, payload) => {
        const currentId = topic.match(/switchbot\/(.+)\/control/)[1];
        const device = devices.find(device => device.id == currentId);

        switchbot.stopScan();

        if(payload == 'ON') {
            await device.client.turnOn()
        } else if(payload == 'OFF') {
            await device.client.turnOff();
        }

        switchbot.startScan();
    });
})();

function advertiseHomeAssistantDevice(device) {
    const deviceInfo = {
        identifiers: 'sb_'+device.id,
        name: device.name,
        manufacturer: 'SwitchBot',
        model: 'Switch'
    };

    mqttClient.publish('homeassistant/switch/sb_'+device.id+'_switch/config', JSON.stringify({
        name: device.name,
        unique_id: 'sb_'+device.id+'_switch',
        availability_topic: 'switchbot/available',
        state_topic: 'switchbot/'+device.id+'/state',
        command_topic: 'switchbot/'+device.id+'/control',
        device: deviceInfo
    }));

    mqttClient.publish('homeassistant/sensor/sb_'+device.id+'_battery/config', JSON.stringify({
        name: device.name+" Batterie",
        icon: 'mdi:battery-bluetooth',
        unique_id: 'sb_'+device.id+'_battery',
        availability_topic: 'switchbot/available',
        state_topic: 'switchbot/'+device.id+'/battery',
        unit_of_measurement: '%',
        device_class: 'battery',
        device: deviceInfo
    }));
}

async function asyncForEach(array, callback) {
    for (let index = 0; index < array.length; index++) {
      await callback(array[index], index, array);
    }
}

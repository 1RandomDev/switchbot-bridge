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

mqttClient.on('connect', async () => {
    console.log('Connected to mqtt broker');
    mqttClient.publish('switchbot/available', 'online', {retain: true});
});


(async () => {
    const devices = config.devices;
    await asyncForEach(devices, async device => {
        device.id = device.address.replace(/:/g, '').toLowerCase();

        advertiseHomeAssistantDevice(device);
    });

    mqttClient.subscribe('switchbot/+/control');
    mqttClient.on('message', async (topic, payload) => {
        const currentId = topic.match(/switchbot\/(.+)\/control/)[1];
        const device = devices.find(device => device.id == currentId);
        if(device == null) {
            console.error('Device with id '+currentId+' not found!');
            return;
        }

        const clients = await switchbot.discover({ id: device.address, quick: true });
        if(clients.length == 0) {
            console.log('Connection to device '+device.name+' failed.');
        } else {
           const client = clients[0];
            if(payload == 'ON') {
                await client.turnOn()
            } else if(payload == 'OFF') {
                await client.turnOff();
            }
        }
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
        command_topic: 'switchbot/'+device.id+'/control',
        device: deviceInfo,
        optimistic: true
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

async function getDeviceInfo() {
    devices.forEach(device => {
        device.scanComplete = false;
    });

    switchbot.onadvertisement = ad => {
        const device = devices.find(device => device.address == ad.address);
        if(device == null) return;

        if(device.scanComplete) return;
        device.scanComplete = true;

        mqttClient.publish('switchbot/'+device.id+'/battery', ad.serviceData.battery.toString(), {retain: true});
    };

    switchbot.startScan();
    await delay(5000);
    switchbot.stopScan();
}

async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function asyncForEach(array, callback) {
    for (let index = 0; index < array.length; index++) {
      await callback(array[index], index, array);
    }
}

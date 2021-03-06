const Switchbot = require('node-switchbot');
const mqtt = require('mqtt');
const winston = require('winston');
const noble = require('@homebridge/noble');

const config = require('./config.json');
const devices = config.devices;
const switchbot = new Switchbot({noble: noble});
let initialized = false;

const myformat = winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp({format: 'YYYY-MM-DD HH:mm:ss'}),
    winston.format.printf(info => `${info.timestamp} ${info.level}: ${info.message}`)
);
const logger = winston.createLogger({
    level: config.logLevel,
    format: myformat,
    defaultMeta: { service: 'user-service' },
    transports: [
        new winston.transports.Console()
    ]
});

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
    if(!mqttClient.reconnecting) {
        logger.error('Unable to connect to mqtt broker: '+err.message);
        process.exit(1);
    }
});

mqttClient.on('offline', () => {
    logger.error('Connection to mqtt broker lost');
});

mqttClient.on('connect', async () => {
    logger.info('Connected to mqtt broker');
    mqttClient.publish('switchbot/available', 'online', {retain: true});

    if(!initialized) {
        initialized = true;

        await asyncForEach(devices, async device => {
            device.id = device.address.replace(/:/g, '').toLowerCase();
            advertiseHomeAssistantDevice(device);
            logger.info(`Loaded device ${device.name} (${device.address})`);
        });

        mqttClient.subscribe('switchbot/+/control');
        mqttClient.on('message', async (topic, payload) => {
            const currentId = topic.match(/switchbot\/(.+)\/control/)[1];
            const device = devices.find(device => device.id == currentId);
            if(device == null) {
                logger.error(`No device with id ${currentId} found!`);
                return;
            }

            mqttClient.publish('switchbot/'+device.id+'/state', payload, {retain: true});

            let clients;
            try {
                clients = await switchbot.discover({ id: device.address, quick: true });
            } catch(err) {
                logger.error(`Connection to device ${device.name} (${device.address}) failed. (Invalid address)`);
                return;
            }
            if(clients.length == 0) {
                logger.error(`Connection to device ${device.name} (${device.address}) failed.`);
            } else {
                const client = clients[0];
                let errorCount = 0;

                while(errorCount < 5) {
                    try {
                        if(payload == 'ON') {
                            await client.turnOn();
                            logger.debug(`Device ${device.name} (${device.address}) turned on`);
                            break;
                        } else if(payload == 'OFF') {
                            await client.turnOff();
                            logger.debug(`Device ${device.name} (${device.address}) turned off`);
                            break;
                        }
                    } catch(err) {
                        logger.error(`Connection to device ${device.name} (${device.address}) failed: ${err.message}`);
                        errorCount++;
                    }
                }
            }
        });

        updateDeviceInfo();
        setInterval(updateDeviceInfo, config.updateInterval * 3600000);
    }
});

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
        state_topic: 'switchbot/'+device.id+'/state',
        optimistic: config.optimisticMode,
        device: deviceInfo
    }), {retain: true});

    mqttClient.publish('homeassistant/sensor/sb_'+device.id+'_battery/config', JSON.stringify({
        name: device.name+" Batterie",
        icon: 'mdi:battery-bluetooth',
        unique_id: 'sb_'+device.id+'_battery',
        availability_topic: 'switchbot/available',
        state_topic: 'switchbot/'+device.id+'/battery',
        unit_of_measurement: '%',
        device_class: 'battery',
        device: deviceInfo
    }), {retain: true});
}

async function updateDeviceInfo() {
    logger.debug("Updating device info...");
    devices.forEach(device => {
        device.scanComplete = false;
    });

    switchbot.onadvertisement = ad => {
        const device = devices.find(device => device.address == ad.address);
        if(device == null) return;

        if(device.scanComplete) return;
        device.scanComplete = true;

        const batteryLevel = ad.serviceData.battery.toString();
        logger.debug(`Battery level of device ${device.name} (${device.address}): ${batteryLevel}%`);
        mqttClient.publish('switchbot/'+device.id+'/battery', batteryLevel, {retain: true});
    };

    switchbot.startScan();
    await delay(3000);
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

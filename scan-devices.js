const Switchbot = require('node-switchbot');
const switchbot = new Switchbot();

(async () => {
  await switchbot.startScan();
  
  switchbot.onadvertisement = (ad) => {
    console.log(JSON.stringify(ad, null, '  '));
  };
  
  /*await switchbot.wait(10000);
  
  switchbot.stopScan();
  process.exit();*/
})();
const garagedoorclass = require('./lib/garagedoorcontrollerv2');
const homebridgeLib = require('homebridge-lib')

let Service, Characteristic;

module.exports = function(homebridge) {
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  homebridge.registerAccessory('homebridge-garage-door-plugin', 'Garage Door Opener', GarageDoorOpener);
};

class GarageDoorOpener {
  constructor(log, configJson) {
    this.log = log;
    // Config option defaults
    this.config = {
      name: 'Garage Door',
      open_pin: 12,
      close_pin: 15,
      relay_pin: 13,
      motor_motion_open_pin: 29,
      motor_motion_close_pin: 16,
      openclose_timeout: 400,
      heartbeat_interval: 500
    }

    this.targetDoorState = 1;

    // Parse the assessory config
    const optionParser = new homebridgeLib.OptionParser(this.config, true);
    optionParser.stringKey('accessory');
    optionParser.stringKey('name');
    optionParser.intKey('open_pin', 1, 40);
    optionParser.intKey('close_pin', 1, 40);
    optionParser.intKey('relay_pin', 1, 40);
    optionParser.intKey('motor_motion_open_pin', 1, 40);
    optionParser.intKey('motor_motion_close_pin', 1, 40);
    optionParser.intKey('openclose_timeout', 100, 1000);
    optionParser.intKey('heartbeat_interval', 100, 5000);
    optionParser.on('usageError', (message) => {
      this.log.warn('config.json: %s', message)
    });
    optionParser.parse(configJson);

    // Dump configuration
    this.log("Configuration: " + JSON.stringify(this.config));
    this.name = this.config.name;


    this.GarageDoorController = new garagedoorclass.GarageDoorController(log, this.config);

    this.GarageDoorService = new Service.GarageDoorOpener(this.name, 'Auto');
    this.setupGarageDoorOpenerService();

    this.InformationService = new Service.AccessoryInformation();

    this.InformationService
      .setCharacteristic(Characteristic.Identify, 'GD-HACK-PLUGIN')
      .setCharacteristic(Characteristic.Manufacturer, 'HackMaster')
      .setCharacteristic(Characteristic.Model, 'Garage Door Opener')
      .setCharacteristic(Characteristic.Name, this.name)
      .setCharacteristic(Characteristic.SerialNumber, 'ABC123456')
      .setCharacteristic(Characteristic.FirmwareRevision, '1.0');

    // Setup our heartbeat
    // This will run periodically to check for events that need to be reported back to HomeKit
    if (this.config.heartbeat_interval && (this.config.heartbeat_interval > 100)) {
      this.log("Heartbeat will run every " + this.config.heartbeat_interval + "ms to check for state transitions...");
      setInterval(this.heartbeat, this.config.heartbeat_interval, this);
    }
  }

  identify(callback) {
    // If we had a light, we'd flash it
    this.log('Detected a call to identify, but we have no facility to do so');
    callback(null);
  }

  getServices() {
    return [this.InformationService, this.GarageDoorService];
  }

  setupGarageDoorOpenerService() {
    this.GarageDoorService.setCharacteristic(Characteristic.TargetDoorState, Characteristic.TargetDoorState.CLOSED);
    this.GarageDoorService.setCharacteristic(Characteristic.CurrentDoorState, Characteristic.CurrentDoorState.CLOSED);
    this.GarageDoorService.setCharacteristic(Characteristic.ObstructionDetected, false);

    // Here's what to do when a request for current door state arrives
    this.GarageDoorService.getCharacteristic(Characteristic.CurrentDoorState)
      .on('get', (callback) => {
        this.log("Current state get requested");
        var status = this.GarageDoorController.checkDoorStatus();
        if (status) {
          this.log("Current state sent: " + status.Status);
          callback(null, status.HomeKitState);
        } else {
          this.log('A request for current door state was received, but we did not get anything from the controller class')
          callback(null);
        }
      });

    // Here's what to do when a request to check obstruction state arrives
    this.GarageDoorService.getCharacteristic(Characteristic.ObstructionDetected)
      .on('get', (callback) => {
        this.log("Obstruction state get requested");
        var obstruction = this.GarageController.Obstruction;
        callback(null, obstruction);
      });

    // Here's what to do when a request to get target door state arrives
    this.GarageDoorService.getCharacteristic(Characteristic.TargetDoorState)
      .on('get', (callback) => {
        this.log("Target state get requested");
        callback(null, this.targetDoorState);
      })
      .on('set', (value, callback) => {
        this.log("Target state set requested: " + value);

        this.GarageDoorController.operateGarageDoor(value);

        var status = this.garagedoorcontroller.checkDoorStatus();
        if (status) {
          this.log('Target Status Update: ' + this.name + ' is ' + status.Status);
        }
        callback(null, value);
      });

    this.GarageDoorService.getCharacteristic(Characteristic.Name)
      .on('get', callback => {
        callback(null, this.name);
      });
  }

  heartbeat(self) {
    const status = self.GarageDoorController.checkDoorStatus();
    if (status) {
      self.log('Heartbeat detected: ' + status.Status);
      self.GarageDoorService.setCharacteristic(Characteristic.CurrentDoorState, status.HomeKitState);
      self.GarageDoorService.setCharacteristic(Characteristic.ObstructionDetected, self.GarageDoorController.Obstruction);
    }
  }
}

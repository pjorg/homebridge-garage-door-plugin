const garagedoorclass = require('./lib/garagedoorcontroller');
const homebridgeLib = require('homebridge-lib')

let Service, Characteristic;
const OFF = true;
const ON = false;

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
      openclose_timeout: 400,
      heartbeat_interval: 500,
      mock_model: 'raspi-3',
      mock: false
    }

    // Parse the assessory config
    const optionParser = new homebridgeLib.OptionParser(this.config, true);
    optionParser.stringKey('accessory');
    optionParser.stringKey('name');
    optionParser.intKey('open_pin', 1, 40)
    optionParser.intKey('close_pin', 1, 40)
    optionParser.intKey('relay_pin', 1, 40)
    optionParser.intKey('openclose_timeout', 100, 1000)
    optionParser.intKey('heartbeat_interval', 100, 5000)
    optionParser.stringKey('mock_model');
    optionParser.boolKey('mock');
    optionParser.on('usageError', (message) => {
      this.log.warn('config.json: %s', message)
    });
    optionParser.parse(configJson);
    
    // Dump configuration
    this.log("Configuration: " + JSON.stringify(this.config));
    this.name = this.config.name;
    this.garagedoorcontroller = new garagedoorclass.GarageDoorController(log, this.config);

    this.garagedoorservice = new Service.GarageDoorOpener(this.name, 'Auto');
    this.garagedoorswitchname = this.name + ' Manual';
    this.garagedoorswitchservice = new Service.Switch(this.garagedoorswitchname, 'Manual')
    this.garagedoorclosername = this.name + ' Closer';
    this.garagedoorcloserservice = new Service.Switch(this.garagedoorclosername, 'Closer')
    this.setupGarageDoorOpenerService();

    this.opensensorname = 'Garage Open Sensor';
    this.opensensor = new Service.ContactSensor(this.opensensorname, 'Open Sensor');
    this.closesensorname = 'Garage Close Sensor';
    this.closesensor = new Service.ContactSensor(this.closesensorname, 'Close Sensor');
    this.motionsensorname = 'Garage Motion Sensor';
    this.motionsensor = new Service.MotionSensor(this.motionsensorname, 'Motion Sensor');
    this.setupGarageDoorSensorsService();

    this.informationService = new Service.AccessoryInformation();

    this.informationService
      .setCharacteristic(Characteristic.Identify, 'GD-HACK-PLUGIN')
      .setCharacteristic(Characteristic.Manufacturer, 'HackMaster')
      .setCharacteristic(Characteristic.Model, 'Garage Door Opener')
      .setCharacteristic(Characteristic.Name, this.name)
      .setCharacteristic(Characteristic.SerialNumber, 'ABC123456')
      .setCharacteristic(Characteristic.FirmwareRevision, '1.0');

      // Setup our heartbeat (yea, we would have used homebrigdeLib)
      if (this.config.heartbeat_interval && (this.config.heartbeat_interval>100))
      {
        this.log("Heartbeat is enabled at " + this.config.heartbeat_interval + "ms");
        setInterval(this.heartbeat, this.config.heartbeat_interval, this);
      }
  }

  identify(callback) {
    // If we had a light, we'd flash it
    this.log('Identify requested!');
    callback(null);
  }

  getServices () {
		return [this.informationService, this.garagedoorservice, this.garagedoorswitchservice, this.garagedoorcloserservice, this.opensensor, this.closesensor, this.motionsensor];
	}

  setupGarageDoorOpenerService() {

    this.garagedoorswitchservice.setCharacteristic(Characteristic.On, false);
    this.garagedoorcloserservice.setCharacteristic(Characteristic.On, false);
    this.garagedoorservice.setCharacteristic(Characteristic.TargetDoorState, Characteristic.TargetDoorState.CLOSED);
    this.garagedoorservice.setCharacteristic(Characteristic.CurrentDoorState, Characteristic.CurrentDoorState.CLOSED);
    this.garagedoorservice.setCharacteristic(Characteristic.ObstructionDetected, false);

    this.garagedoorswitchservice.getCharacteristic(Characteristic.On)
      .on('get', (callback) => {
        this.log("Current switch state get requested");
        var value = false;
        if (this.garagedoorcontroller.checkOpenSensor() == Characteristic.ContactSensorState.CONTACT_DETECTED)
        {
          value = true;
        }
        callback(null, value);
      })
      .on('set', (value, callback) => {
        this.log("Target state set requested: " + value);
        if (!this.garagedoorcontroller.checkMotionDetected())
        {
          this.log("Operating Garage door relay");
          this.garagedoorcontroller.forceOpenGarageDoor();
        }
        callback(null, false);
      });

      this.garagedoorcloserservice.getCharacteristic(Characteristic.On)
      .on('get', (callback) => {
        this.log("Current closer switch state get requested");
        var value = false;
        if (this.garagedoorcontroller.checkOpenSensor() == Characteristic.ContactSensorState.CONTACT_DETECTED)
        {
          value = true;
        }
        callback(null, value);
      })
      .on('set', (value, callback) => {
        this.log("Target state set requested: " + value);
        if (this.garagedoorcontroller.checkCloseSensor() == Characteristic.ContactSensorState.CONTACT_NOT_DETECTED)
        {
          this.log("Door not fully closed. Operating Garage door relay");
          this.garagedoorcontroller.forceOpenGarageDoor();
        }
        else
        {
          this.log("Door closed. Ignoring request");
        }
        callback(null, false);
      });

    this.garagedoorservice.getCharacteristic(Characteristic.CurrentDoorState)
      .on('get', (callback) => {
        this.log("Current state get requested");
        var status = this.garagedoorcontroller.checkDoorStatus();
        if (status)
        {
          this.log("Current state sent: " + status.status);
          callback(null, status.Current);
        }
        else
        {
          callback(null);
        }
      });

      this.garagedoorservice.getCharacteristic(Characteristic.ObstructionDetected)
      .on('get', (callback) => {
        this.log("Obstruction state get requested");
        var obstruction = this.garagedoorcontroller.ObstructionDetected;
        callback(null, obstruction);
      });

      this.garagedoorservice.getCharacteristic(Characteristic.TargetDoorState)
      .on('get', (callback) => {
        this.log("Target state set requested");
        callback(null, this.targetDoorState);
      })
      .on('set', (value, callback) => {
        this.log("Target state set requested: " + value);
        // We don't really care what Homekit wants. We will open the door if closed, and close if open. The openGarageDoor
        // routine checks the current door status and tells homekit what is really is.
        this.garagedoorcontroller.openGarageDoor();
        var status = this.garagedoorcontroller.checkDoorStatus();
        if (status)
        {
          this.log('Target Status Update: ' + this.name + ' is ' + status.Status);
        }
        callback(null, value);
      });

      this.garagedoorservice
      .getCharacteristic(Characteristic.Name)
      .on('get', callback => {
        callback(null, this.name);
      });

      this.garagedoorswitchservice
      .getCharacteristic(Characteristic.Name)
      .on('get', callback => {
        callback(null, this.garagedoorswitchname);
      });
  }

  setupGarageDoorSensorsService()  {
    this.opensensor.setCharacteristic(Characteristic.ContactSensorState, Characteristic.ContactSensorState.CONTACT_DETECTED);
    this.closesensor.setCharacteristic(Characteristic.ContactSensorState, Characteristic.ContactSensorState.CONTACT_DETECTED);
    this.motionsensor.setCharacteristic(Characteristic.MotionDetected, false);

    this.opensensor.getCharacteristic(Characteristic.ContactSensorState)
    .on('get', (callback) => {
      var open_status = this.garagedoorcontroller.checkOpenSensor();
      this.log("Open sensor state get requested:" + open_status);
      callback(null, open_status);
    });

    this.closesensor.getCharacteristic(Characteristic.ContactSensorState)
    .on('get', (callback) => {
      var close_status = this.garagedoorcontroller.checkCloseSensor();
      this.log("Close sensor state get requested: " + close_status);
      callback(null, close_status);
    });

    this.motionsensor.getCharacteristic(Characteristic.MotionDetected)
    .on('get', (callback) => {
      var motion_detected = this.garagedoorcontroller.checkMotionDetected();
      this.log("Motion sensor state get requested: " + motion_detected);
      callback(null, motion_detected);
    });

    this.closesensor
      .getCharacteristic(Characteristic.Name)
      .on('get', callback => {
        callback(null, this.closesensorname);
      });

    this.motionsensor
      .getCharacteristic(Characteristic.Name)
      .on('get', callback => {
        callback(null, this.motionsensorname);
      });

      this.opensensor
      .getCharacteristic(Characteristic.Name)
      .on('get', callback => {
        callback(null, this.opensensorname);
      });

  }

  heartbeat(self)
  {
    const status = self.garagedoorcontroller.checkDoorStatus();
    if (status)
    {
      self.log('Heartbeat detected: ' + self.name + ' is ' + status.Status);
      self.garagedoorservice.setCharacteristic(Characteristic.CurrentDoorState, status.Current);          
      self.garagedoorservice.setCharacteristic(Characteristic.ObstructionDetected, self.garagedoorcontroller.ObstructionDetected);
      self.opensensor.setCharacteristic(Characteristic.ContactSensorState, status.OpenState);
      self.closesensor.setCharacteristic(Characteristic.ContactSensorState, status.CloseState);
      self.motionsensor.setCharacteristic(Characteristic.MotionDetected, status.MotionDetected);
    }
    /*
    else
    {
      // Force the updates if the status isn't valid
      var open_status = self.garagedoorcontroller.checkOpenSensor();
      var close_status = self.garagedoorcontroller.checkCloseSensor();
      self.opensensor.setCharacteristic(Characteristic.ContactSensorState, open_status);
      self.closesensor.setCharacteristic(Characteristic.ContactSensorState, close_status);
      // Open sensor contacted? We are closing
      if (open_status == Characteristic.ContactSensorState.CONTACT_DETECTED)
      {
        self.garagedoorservice.setCharacteristic(Characteristic.CurrentDoorState, Characteristic.CurrentDoorState.OPEN);
        //self.garagedoorswitchservice.setCharacteristic(Characteristic.On, true);
      }
      else if (open_status == Characteristic.ContactSensorState.CONTACT_DETECTED)
      {
        self.garagedoorservice.setCharacteristic(Characteristic.CurrentDoorState, Characteristic.CurrentDoorState.CLOSED);
        //self.garagedoorswitchservice.setCharacteristic(Characteristic.On, false);
      }
    }*/
  }
}

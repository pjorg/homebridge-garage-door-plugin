// homebridge-garage-door-plugin/lib/garagedoorcontrollerv2.js
//
// Library to access the garage door sensors and relay
// Portions Copyright © 2018-2019 Mark Buckaway. All rights reserved.

'use strict';

/**
 * Uses the rpio GPIO library
 */
var rpio = require('rpio');

/**
 * TargetDoorState enum - matches homekit status for same
    Characteristic.TargetDoorState.OPEN = 0;
    Characteristic.TargetDoorState.CLOSED = 1;
 */
var TargetDoorState = {
  'OPEN': 0,
  'CLOSED': 1
};

/**
 * CurrentDoorState enum - matches homekit status for same
    Characteristic.CurrentDoorState.OPEN = 0;
    Characteristic.CurrentDoorState.CLOSED = 1;
    Characteristic.CurrentDoorState.OPENING = 2;
    Characteristic.CurrentDoorState.CLOSING = 3;
    Characteristic.CurrentDoorState.STOPPED = 4;
 */
var CurrentDoorState = {
  'OPEN': 0,
  'OPENING': 2,
  'CLOSING': 3,
  'CLOSED': 1,
  'STOPPED': 4
};

/**
 * ContactState enum - matches the homekit status for same
 * Characteristic.ContactSensorState.CONTACT_DETECTED = 0;
 * Characteristic.ContactSensorState.CONTACT_NOT_DETECTED = 1;
 */
var ContactState = {
  'CONTACT_DETECTED': 0,
  'CONTACT_NOT_DETECTED': 1
};


/**
 * Motor motion state
 * this is a custom enum created by me to track the motion of the door
 * based on whether and in which direction the motor is operating
 */
const DOOR_POSITION = {
  'DETECTED_FULLY_CLOSED': 0,
  'DETECTED_FULLY_OPEN': 1,
  'INTERMEDIATE': 2
};
const MOTOR_MOTION = {
  'NOT_IN_MOTION': 0,
  'IN_MOTION_OPENING': 1,
  'IN_MOTION_CLOSING': 2
};
const CURRENT_PHYSICAL_STATE = {
  '0,0': {
    Status: 'Door is fully closed',
    HomeKitState: CurrentDoorState.CLOSED
  },
  '0,1': {
    Status: 'Door is fully open',
    HomeKitState: CurrentDoorState.OPEN
  },
  '0,2': {
    Status: 'Door is stopped in an intermediate position',
    HomeKitState: CurrentDoorState.STOPPED
  },
  '1,0': {
    Status: 'Door just started moving to open from fully closed',
    HomeKitState: CurrentDoorState.OPENING
  },
  '1,1': {
    Status: 'Door is completing motion to fully open',
    HomeKitState: CurrentDoorState.OPENING
  },
  '1,2': {
    Status: 'Door is in motion to open',
    HomeKitState: CurrentDoorState.OPENING
  },
  '2,0': {
    Status: 'Door is completing motion to fully closed',
    HomeKitState: CurrentDoorState.CLOSING
  },
  '2,1': {
    Status: 'Door just started moving to closed from fully open',
    HomeKitState: CurrentDoorState.CLOSING
  },
  '2,2': {
    Status: 'Door is in motion to closed',
    HomeKitState: CurrentDoorState.CLOSING
  }
};



/**
 * Class to control a GarageDoor using a relay module and two magnetic switch "sensors". The class
 * has the logic to check the garage door status and open and close the door.
 */
class GarageDoorController {
  /**
   * Create a new instance of the Garagedoor Controller
   * @param {!object} log - reference to the log output
   * @param {!object} options - reference to the options map (homebridge config object)
   * @param {!number} options.relay_pin - pin for the relay (active low)
   * @param {!number} options.open_pin - pin for the open sensor (active low)
   * @param {!number} options.close_pin - pin for the close sensor (active low)
   * @param {!number} options.motor_motion_open_pin - pin for detecting motor opening (active low)
   * @param {!number} options.motor_motion_close_pin - pin for detecting motor closing (active low)
   * @param {!number} options.openclose_timeout - timeout value to activate the relay
   */
  constructor(log, options) {
    this.options = options;
    this.log = log;

    this.log("Executing GarageDoorController constructor for '" + this.options.name + "'...")

    // Initialize these input pin values to the correct "not contacted" states
    // For the RPi, these are known values
    // Per https://roboticsbackend.com/raspberry-pi-gpios-default-state/
    // GPIOs up to 8: default state is 1 (HIGH, or close to 3.3V).
    // GPIOs 9 to 27: default state is 0 (LOW, or close to 0V).
    // Keep in mind that the GPIO number is different from the physical number
    // The physical number can be different based on the generation of Pi, so
    // for consistency that's why we use the physical numbers here

    // Basically, always use GPIO pins higher than 8 so that they start out LOW
    // Then, when there's a change (contactor is closed, motor motion is detected)
    // the input will read high ("TRUE") which is what you want

    // Start by assuming 'fully closed'
    this.last_physical_state = CURRENT_PHYSICAL_STATE['0,0'];

    this.change_detected = false;
    this.initialized = false;
    this.lastStatus = CurrentDoorState.CLOSED;
    this.obstruction = false;
    this.failed = false;

    var rpiooptions = {
      gpiomem: true,
      /* Use /dev/gpiomem */
      mapping: 'physical',
      /* Use the P1-P40 numbering scheme */
      mock: false,
      /* Emulate specific hardware in mock mode */
    };
    rpio.init(rpiooptions);

    // Use PULL_DOWN if connected to +Vcc or PULL_UP if connected to ground
    try {
      rpio.open(this.options.open_pin, rpio.INPUT, rpio.PULL_DOWN);
      rpio.open(this.options.close_pin, rpio.INPUT, rpio.PULL_DOWN);
      rpio.open(this.options.motor_motion_open_pin, rpio.INPUT, rpio.PULL_DOWN);
      rpio.open(this.options.motor_motion_close_pin, rpio.INPUT, rpio.PULL_DOWN);
      rpio.open(this.options.relay_pin, rpio.OUTPUT, rpio.HIGH);
    } catch (err) {
      this.log("Initialiation failed! Error opening pin: " + err.message);
      this.failed = true;
    }
    if (!this.failed) {
      this.initialized = true;
    }
  }


  /**
   * @returns {bool} - if a obstruction was detected (door went from CLOSING to OPEN)
   */
  get Obstruction() {
    return this.obstruction;
  }

  doorKick() {
    return new Promise((resolve) => {
      rpio.write(this.options.relay_pin, rpio.LOW);
      setTimeout(function(options) {
        rpio.write(options.relay_pin, rpio.HIGH);
        resolve();
      }, this.options.openclose_timeout, this.options);
    });
  }

  async operateGarageDoor(desiredDoorState) {
    if (typeof desiredDoorState !== 'undefined') {
      var current_physical_state = await this.checkDoorStatus();
      var expression = desiredDoorState + ',' + current_physical_state.HomeKitState;
      this.log(expression);

      switch (expression) {
        case '0,0':
          break;
        case '0,1':
          this.doorKick();
          break; // desire open, but it's closed, toggle
        case '0,2':
          break; // desire open, but it's opening, do nothing
        case '0,3':
          // I want this to be two kicks separated by time, but I can't figure it out
          //await this.doorKick();
          this.doorKick();
          break; // desire open, but it's closing
        case '0,4':
          this.doorKick();
          break; // desire open, but it's stopped
        case '1,0':
          this.doorKick();
          break; // desire closed, but it's open, toggle
        case '1,1':
          break;
        case '1,2':
          // I want this to be two kicks separated by time, but I can't figure it out
          //await this.doorKick();
          this.doorKick();
          break; // desire closed, but it's opening
        case '1,3':
          break; // desire closed, but it's closing, do nothing
        case '1,4':
          this.doorKick();
          break; // desire closed, but it's stopped
      }
    } else {
      this.doorKick();
    }
  }

  /**
   * checkDoorStatus reads the open and close door sensors, and checks the door status depending on the state table.
   * Additionally, if the door went from the CLOSING state to OPEN, the obstruction flag is set. This method is expected
   * to be call on an interval to ensure HomeKit always knows the door state.
   * @returns {!object} - state table object
   */
  checkDoorStatus() {
    var current_physical_state = undefined;
    if (this.initialized) {
      // If the door is fully open, the open pin will report '1'
      var is_open_contactor_activated = rpio.read(this.options.open_pin);
      // If the door is fully closed, the close pin will report '1'
      var is_closed_contactor_activated = rpio.read(this.options.close_pin);
      // If the door is in motion opening, the motor motion open pin will report '1'
      var is_motor_open_motion_detected = rpio.read(this.options.motor_motion_open_pin);
      // If the door is in motion closing, the motor motion close pin will report '1'
      var is_motor_close_motion_detected = rpio.read(this.options.motor_motion_close_pin);

      // Convert these raw inputs to a physical state
      // First, let's identify inputs that make no sense and bail if we find those
      if (
        (is_motor_open_motion_detected && is_motor_close_motion_detected) ||
        (is_open_contactor_activated && is_closed_contactor_activated)
      ) {
        this.log('When getting door state, we found inputs that are physically impossible; bailing out...');
        return undefined;
      }

      if (is_open_contactor_activated + is_closed_contactor_activated == 0) {
        // Neither are activated
        var current_door_position = DOOR_POSITION.INTERMEDIATE;
      } else if (is_closed_contactor_activated) {
        // Door closed is activated; door is fully closed
        var current_door_position = DOOR_POSITION.DETECTED_FULLY_CLOSED;
      } else {
        // Door must be fully open
        var current_door_position = DOOR_POSITION.DETECTED_FULLY_OPEN
      }


      if (is_motor_open_motion_detected + is_motor_close_motion_detected == 0) {
        // No motion detected
        var current_motor_motion = MOTOR_MOTION.NOT_IN_MOTION;
      } else if (is_motor_close_motion_detected) {
        // Detected closing motion
        var current_motor_motion = MOTOR_MOTION.IN_MOTION_CLOSING;
      } else {
        // Door must be opening
        var current_motor_motion = MOTOR_MOTION.IN_MOTION_OPENING;
      }

      // Combine the motion and position states to get the overall system state
      current_physical_state = CURRENT_PHYSICAL_STATE[current_motor_motion + ',' + current_door_position];
    }
    var stateChanged = false;
    if(current_physical_state != this.last_physical_state) {
      this.last_physical_state = current_physical_state;
      var stateChanged = true;
    }
    return {
      'isChanged': stateChanged,
      'state': current_physical_state
    }
  }
}


module.exports = {
  GarageDoorController
};

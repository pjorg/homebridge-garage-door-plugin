// homebridge-garage-door-plugin/lib/garagedoorcontroller.js
//
// Library to access the garage door sensors and relay
// Copyright © 2018-2019 Mark Buckaway. All rights reserved.

'use strict'

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
}

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
}

/**
 * ContactState enum - matches the homekit status for same
 * Characteristic.ContactSensorState.CONTACT_DETECTED = 0;
 * Characteristic.ContactSensorState.CONTACT_NOT_DETECTED = 1;
 */
var ContactState = {
    'CONTACT_DETECTED': 0,
    'CONTACT_NOT_DETECTED': 1
}
/**
 * Maps the states of the variables to the state of the door. Prevents a huge if statement.
 */
var STATES = {
    '1,0,0,0': {  // Open sensor on, and last time we were moving
    Target: TargetDoorState.OPEN,
    Current: CurrentDoorState.OPEN,
    Status: "Open",
    OpenState: ContactState.CONTACT_DETECTED,
    CloseState: ContactState.CONTACT_NOT_DETECTED,
    MotionDetected: 0
    },
    '0,1,0,0': { // Closed sensor on, and last time we were moving
    Target: TargetDoorState.CLOSED,
    Current: CurrentDoorState.CLOSED,
    Status: "Closed",
    OpenState: ContactState.CONTACT_NOT_DETECTED,
    CloseState: ContactState.CONTACT_DETECTED,
    MotionDetected: 0
    },
    '0,0,1,0': { // Open/Closed sensors off (moving), and last time we were open
    Target: TargetDoorState.CLOSED,
    Current: CurrentDoorState.CLOSING,
    Status: "Closing",
    OpenState: ContactState.CONTACT_NOT_DETECTED,
    CloseState: ContactState.CONTACT_NOT_DETECTED,
    MotionDetected: 1
    },
    '0,0,0,1': { // Open/Closed sensors off (moving), and last time we were closed
    Target: TargetDoorState.OPEN,
    Current: CurrentDoorState.OPENING,
    Status: "Opening",
    OpenState: ContactState.CONTACT_NOT_DETECTED,
    CloseState: ContactState.CONTACT_NOT_DETECTED,
    MotionDetected: 1
    },
    '1,0,1,0': { // Open sensor on, closed off, and last time we were open: open!
    Target: TargetDoorState.OPEN,
    Current: CurrentDoorState.OPEN,
    Status: "Open",
    OpenState: ContactState.CONTACT_DETECTED,
    CloseState: ContactState.CONTACT_NOT_DETECTED,
    MotionDetected: 0
    },
    '0,1,0,1': { // Open sensor off, closed on, and last time we were closed: closed!
    Target: TargetDoorState.CLOSED,
    Current: CurrentDoorState.CLOSED,
    Status: "Closed",
    OpenState: ContactState.CONTACT_NOT_DETECTED,
    CloseState: ContactState.CONTACT_DETECTED,
    MotionDetected: 0
    },
};

/**
 * Class to control a GarageDoor using a relay module and two magnetic switch "sensors". The class
 * has the logic to check the garage door status and open and close the door.
 */
class GarageDoorController
{
    /**
     * Create a new instance of the Garagedoor Controller
     * @param {!object} log - reference to the log output
     * @param {!object} options - reference to the options map (homebridge config object)
     * @param {!number} options.relay_pin - pin for the relay
     * @param {!number} options.open_pin - pin for the open sensor (active low)
     * @param {!number} options.close_pin - pin for the close sensor (active low)
     * @param {!number} options.openclose_timeout - timeout value to activate the relay
     */
    constructor(log, options)
    {
        this.options = options;
        this.log = log;
        this.last_open_state = rpio.LOW;
        this.last_close_state = rpio.LOW;
        this.change_detected = false;
        this.initialized = false;
        this.lastStatus = CurrentDoorState.CLOSED;
        this.obstruction = false;
        this.failed = false;
        this.mock_mode = options.mock;

        var rpiooptions = {
            gpiomem: true,          /* Use /dev/gpiomem */
            mapping: 'physical',    /* Use the P1-P40 numbering scheme */
            mock: false,        /* Emulate specific hardware in mock mode */
        };
        if (this.mock_mode)
        {
            log.warn('Running GarageController in MOCK mode');
            rpiooptions.mock = this.options.mock_model;
        }
        rpio.init(rpiooptions);

        // Use PULL_DOWN if connected to +Vcc or PULL_UP if connected to ground
        try
        {
            rpio.open(this.options.open_pin, rpio.INPUT, rpio.PULL_DOWN);
            rpio.open(this.options.close_pin, rpio.INPUT, rpio.PULL_DOWN);
            rpio.open(this.options.relay_pin, rpio.OUTPUT, rpio.HIGH);
        }
        catch (err)
        {
            this.log("Initialiation failed! Error opening pin: " + err.message);
            this.failed = true;
        }
        if (!this.failed)
        {
            this.initialized = true;
        }
    }

    /**
     * @returns {bool} - if the class has been initialized (no errors)
     */
    get Initialized()
    {
        return this.initialized;
    }

    /**
     * @returns {bool} - if a change in the garage door status has been detected
     */
    get ChangeDetected()
    {
        return this.change_detected;
    }

    /**
     * @returns {bool} - if a obstruction was detected (door went from CLOSING to OPEN)
     */
    get Obstruction()
    {
        return this.obstruction;
    }

    /**
     * @returns {number} - last status of the garagedoor
     */
    get LastStatus()
    {
        return this.lastStatus;
    }

    /**
     * Get the door state depending on the pin status. This is not meant to be called outside the class.
     * @param {!number} open - current open pin status
     * @param {!number} closed - current close pin status
     * @param {!number} lastOpen - open pin status the last time we checked
     * @param {!number} lastClosed - close pin status the last time we checked
     * @returns {!object} - reference to the status map or undefined if the status is not valid or used
     */
    getState(open, closed, lastOpen, lastClosed)
    {
        var key = open + ',' + closed + ',' + lastOpen + ',' + lastClosed;
        //this.log("Key = " + key);
        var state = undefined;
        try
        {
            state = STATES[key];
        }
        catch (err) {}
        return state;
    }

    /**
     * openGarageDoor method
     * If the class is initialized, and the garage door is in the open or closed state (ie. not moving - opening or closing),
     * fire the door relay for the openclose_timeout value.
     */
    openGarageDoor()
    {
        if (this.initialized)
        {
            // If the door is NOT in motion, we can kick the relay
            if (!this.checkMotionDetected())
            {
                this.log("Kicking door relay");
                rpio.write(this.options.relay_pin, rpio.LOW);
                setTimeout(function(options) {
                    rpio.write(options.relay_pin, rpio.HIGH);
                }, this.options.openclose_timeout, this.options);
            }
            else
            {
                this.log('Garage door is in motion! Ignoring!');
            }
        }
    }

        /**
     * forceOpenGarageDoor method
     * If the class is initialized, and the garage door relay is operated regardless of state. This allows the user
     * to stop the garage door manually.
     */
    forceOpenGarageDoor()
    {
        if (this.initialized)
        {
            this.log('Firing Garage Door');
            rpio.write(this.options.relay_pin, rpio.LOW);
            setTimeout(function(options) {
                rpio.write(options.relay_pin, rpio.HIGH);
            }, this.options.openclose_timeout, this.options);
        }
    }

    /**
     * checkDoorStatus reads the open and close door sensors, and checks the door status depending on the state table.
     * Additionally, if the door went from the CLOSING state to OPEN, the obstruction flag is set. This method is expected
     * to be call on an interval to ensure HomeKit always knows the door state.
     * @returns {!object} - state table object
     */
    checkDoorStatus()
    {
        var door_state = undefined;
        if (this.initialized)
        {
            this.change_detected = false;
            var current_open_state = rpio.read(this.options.open_pin);
            var current_close_state = rpio.read(this.options.close_pin);
            var saved_last_close_state = this.last_close_state;
            var saved_last_open_state = this.last_open_state;
            if (current_open_state != this.last_open_state)
            {
                this.log('Open state change = %d', current_open_state);
                this.last_open_state = current_open_state;
                this.change_detected = true;
            }
            if (current_close_state != this.last_close_state)
            {
                this.log('Close state change = %d', current_close_state);
                this.last_close_state = current_close_state;
                this.change_detected = true;
            }
            if (this.change_detected)
            {
                this.log('Change detected!');
                door_state = this.getState(current_open_state, current_close_state, saved_last_open_state, saved_last_close_state);
                if (door_state)
                {
                    this.log('Door is ' + door_state.Status);
                    if ((this.lastStatus == CurrentDoorState.CLOSING) && (door_state.Current == CurrentDoorState.OPEN))
                    {
                        this.log('Obstruction detected!!');
                        this.obstruction = true;
                    }
                    this.lastStatus = door_state.Current;
                    if ((this.obstruction) && (door_state.Current == CurrentDoorState.CLOSED))
                    {
                        this.log('Obstruction cleared');
                        this.obstruction = false;
                    }
                }
            }
        }
        return door_state;
    }

    checkOpenSensor() {
        var open_state = 0;
        if (this.options.mock_mode)
        {
            open_state = 1;
        }
        else
        {
            open_state = rpio.read(this.options.open_pin);
        }
        var result = ContactState.CONTACT_NOT_DETECTED;
        if (open_state)
        {
            result = ContactState.CONTACT_DETECTED;
        }
        return result;
    }

    checkCloseSensor() {
        var close_state = 0;
        if (this.options.mock_mode)
        {
            close_state = 1;
        }
        else
        {
            close_state = rpio.read(this.options.close_pin);
        }
        var result = ContactState.CONTACT_NOT_DETECTED;
        if (close_state)
        {
            result = ContactState.CONTACT_DETECTED;
        }
        return result;
    }

    checkMotionDetected()
    {
        var result = false;
        if ((this.checkOpenSensor() == ContactState.CONTACT_NOT_DETECTED) &&
            (this.checkCloseSensor() == ContactState.CONTACT_NOT_DETECTED))
        {
            result = true;
        }
        return result;
    }

}

module.exports = {
    GarageDoorController
};

var rpio = require('rpio');

var TargetDoorState = {
    'OPEN': 1,
    'CLOSED': 0
}

var CurrentDoorState = {
    'OPEN': 1,
    'OPENING': 2,
    'CLOSING': 3,
    'CLOSED': 0
}
    // Maps the states of the variables to the state of the door. Prevents a huge if statement.
var STATES = {
    '1,0,0,0': {  // Open sensor on, and last time we were moving
    Target: TargetDoorState.OPEN,
    Current: CurrentDoorState.OPEN,
    Status: "Open"
    },
    '0,1,0,0': { // Closed sensor on, and last time we were moving
    Target: TargetDoorState.CLOSED,
    Current: CurrentDoorState.CLOSED,
    Status: "Closed"
    },
    '0,0,1,0': { // Open/Closed sensors off (moving), and last time we were open
    Target: TargetDoorState.CLOSED,
    Current: CurrentDoorState.CLOSING,
    Status: "Closing"
    },
    '0,0,0,1': { // Open/Closed sensors off (moving), and last time we were closed
    Target: TargetDoorState.OPEN,
    Current: CurrentDoorState.OPENING,
    Status: "Opening"
    },
    '1,0,1,0': { // Open sensor on, closed off, and last time we were open: open!
    Target: TargetDoorState.OPEN,
    Current: CurrentDoorState.OPEN,
    Status: "Open"
    },
    '0,1,0,1': { // Open sensor off, closed on, and last time we were closed: closed!
    Target: TargetDoorState.CLOSED,
    Current: CurrentDoorState.CLOSED,
    Status: "Open"
    },
};

class GarageDoor
{
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

        var rpiooptions = {
            gpiomem: true,          /* Use /dev/gpiomem */
            mapping: 'physical',    /* Use the P1-P40 numbering scheme */
            mock: undefined,        /* Emulate specific hardware in mock mode */
        };
        rpio.init(rpiooptions);

        // Use PULL_DOWN if connected to +Vcc or PULL_UP if connected to ground
        try
        {
            rpio.open(this.options.open_pin, rpio.INPUT, rpio.PULL_DOWN);
            rpio.open(this.options.close_pin, rpio.INPUT, rpio.PULL_DOWN);
            rpio.open(this.options.relay_pin, rpio.OUTPUT, rpio.LOW);
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

    get Initialized() {
        return this.initialized;
    }

    get ChangeDetected()
    {
        return this.change_detected;
    }

    get Obstruction()
    {
        return this.obstruction;
    }
    get LastStatus()
    {
        return this.lastStatus;
    }

    getState(open, closed, lastOpen, lastClosed)
    {
        var key = open + ',' + closed + ',' + lastOpen + ',' + lastClosed;
        var state = undefined;
        try
        {
            state = STATES[key];
        }
        catch (err) {}
        return state;
    }

    openGarageDoor()
    {
        if (this.initialized)
        {
            var state = this.checkDoorStatus();
            // Open toggle the door relay if we have a open or closed door
            // If we are opening or closing, ignore it!
            if ((state) && (state.Current != CurrentDoorState.CLOSING) && (state.Current != CurrentDoorState.OPENING))
            {
                this.log('Firing Garage Door: ' + state.Status);
                rpio.write(this.options.relay_pin, rpio.HIGH);
                setTimeout(function(options) {
                    rpio.write(options.relay_pin, rpio.LOW);
                }, this.options.openclose_timeout, this.options);
            }
            else
            {
                this.log('Garage door not in open or closed state! Ignoring!');
            }
        }
    }

    checkDoorStatus()
    {
        if (this.initialized)
        {
            this.change_detected = false;
            var door_state = undefined;
            var current_open_state = rpio.read(this.options.open_pin);
            var current_close_state = rpio.read(this.options.close_pin);
            var saved_last_close_state = this.last_close_state;
            var saved_last_open_state = this.last_open_state;
            if (current_open_state != this.last_open_state)
            {
                //console.log('Open state change = %d', current_open_state);
                this.last_open_state = current_open_state;
                this.change_detected = true;
            }
            if (current_close_state != this.last_close_state)
            {
                //console.log('Close state change = %d', current_close_state);
                this.last_close_state = current_close_state;
                this.change_detected = true;
            }
            if (this.change_detected)
            {
                this.log('Change detectd!');
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
}

module.exports = {
    GarageDoor
};


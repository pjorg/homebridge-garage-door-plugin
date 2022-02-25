# Homebridge Pi Garage Door Opener with Open/Close Sensors

[This document needs some work]

This repo is no longer in use, and the garage door controller has been replaced by an ESP32 (code available) because the whole idea of running a linux OS on a RPi just seemed kinda silly. However, the code was working with Homebridge for more than a year. Your mileage may vary.

This is a [homebridge](https://github.com/nfarina/homebridge) plugin to make a Raspberry Pi connected with a Relay Board into a Garage Door Opener, via the Home app on iOS using Homekit.  It uses two magnetic switches to determine the state of the garage door, open, moving, or closed. Tested with iOS 12.

This project is loosely based on:
- Homebridge Pi Garage Door Opener with Sensors (https://github.com/plhyhc/homebridge-garage-door-wsensor.git)
- Building a Siri/IOS Homekit Enabled Garage Door Control wtih Raspberry PI by Jordan Nelson https://spin.atomicobject.com/2017/08/27/siri-homekit-raspberry-pi-software/

I created my own code because I found the above somewhat lacking. The other Homebridge module used a rpio library that was marked depreciated and "do not use" by the author (and it didn't work), and Jordan's Nelson's code didn't use Homebridge....while great, means I have basically dedicate the raspberry pi to the garage door or some way to make homebridge his code co-exist. I also thought about it, and it is would could be error prone to assume the garage door is actually open with only one sensor....it could be stuck. So, I wanted to add an open and a closed sensor. In this way, I would be able to check if the door was either open, closed, opening, closing or obstructed. Homekit allows for all these status. Obstructed would occur if there is too much time between the either sensor going off.

## GPIO Library

First, while it would be easy to write something that maps the I/O pins and read their status from the /sys file system, a GPIO library is a better idea. The selected library is node-gpio (https://github.com/jperkin/node-rpio). These lib is based on C code with a Javascript interface. Rather than use the /sys filesystem to control the Rasberry PI GPIO,  it uses /dev/gpio and friends...which makes it more reliable never mind fast. These library also allows for "mock" mode where the GPIO pins are simulated for testing - useful to work on code on another non-Raspberry computer.

Like the other GPIO libs, it has a translation table built in to map the GPIO header pins to the actual GPIO chip interface pins. The pin numbers in the config and test code uses the header pin numbers and not the GPIO chip numbers. Keep that in mind.

The code uses three GPIO pins:
- one for the open sensor (top of the garage door frame)
- one for the closed sensor (bottom of the garage door frame)
- one for connecting to the relay board (which connects to the garage door button)

## Accessories

Unlike the other Garage Door plugins, this one exposes a few accessories:
- Garage Door
- Open Contact Sensor (tells you if the garage door is open - no guessing!)
- Close Contact Sensor (tells you if the garage door is closed)
- Motion Sensor (tells you if the garage door is in motion !open and !closed)
- Manual Door Switch
- Close Door Switch

The Garage Door accessory will not operate the garage door if it is in motion. Further, if the garage door is open, and you ask it to close, and the open sensor is contacted again, it assumes the garage door is obstructed, and tells Homekit it is such.

The Manual Switch accessory is does two things:
- forces the garage door relay to operate
- gets around Homekit's security whereby the Garage Door accessory cannot operate from an automation without confirmation.

The second item is useful. If you setup an automation that says when you get home, open the garage door, and turn on the lights, if you use the Manual Switch, the garage door will operate without you having to unlock your phone to force it to go. This may be a security issue, but more device manuafacturers offer this type of thing through their app to get around the problem (ie. August Lock)...and I didn't feel like writing an app. This works around the issue.

The Close Switch accessory is does two things will only operate the relay IF the close sensor is not contacted (the garage door isn't fully closed). This is created to allow automations to fire the relay only if the garage door is NOT closed (open) since I found the HomeKit sometimes ignores the open/close state to close the door. This makes sure that automations close the door only when they are supposed to.


## How to Save Money

Stop now. Go buy a new garage door opener. Seriously, Home Depot has them for around $300-400 with Homekit support. By the time you buy the raspberry PI, a case, wire, switches, and set everything up... it will be cheaper just to replace the old garage door opener...and it will have things like the garage door position built in. However, it will lack the customability of this project...and your Homebridge setup can also interface to other devices like Nest devices, Lights, etc..

### How to Setup

Install the plugin like any other. Use the Homebridge UI to configure the PINs for the close and open switches, and the relay pin. The timeouts can be left alone. If your door does not work on the relay, change the openclose timeout. This sets the amount of time the relay stays closed.

```
sudo npm install -g --unsafe-perm homebridge
sudo npm install -g homebridge-garage-door-plugin
homebridge
```

### Sample Config

Use the Homebridge UI to configure the plugin. The sample config is for reference only.

```json
{
  "bridge": {
      "name": "Garage Homebridge",
      "username": "CC:22:3D:E3:CE:30",
      "port": 51826,
      "pin":"031-45-154",
      "manufacturer": "@nfarina",
      "model": "Homebridge",
      "serialNumber": "0.4.20"
  },
  "description": "The garage home bridge",
    "accessories": [
        {
            "accessory": "Garage Door Opener",
            "name": "Garage Door",
            "open_pin": 15,
            "close_pin": 12,
            "relay_pin": 13,
            "openclose_timeout": 400,
            "heartbeat_interval": 500,
            "mock_model": "raspi-3",
            "mock": false
         }
    ],}
```

[ Add some explanation of the options here ]

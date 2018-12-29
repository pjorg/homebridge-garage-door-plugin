# Homebridge Pi Garage Door Opener with Open/Close Sensors


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

## How to Save Money

Stop now. Go buy a new garage door opener. Seriously, Home Depot has them for around $300-400 with Homekit support. By the time you buy the raspberry PI, a case, wire, switches, and set everything up... it will be cheaper just to replace the old garage door opener...and it will have things like the garage door position built in. However, it will lack the customability of this project...and your Homebridge setup can also interface to other devices like Nest devices, Lights, etc..

## State of the Project

As of December 29, it doesn't work. Still work in progress.

### Sample Config

Config to be placed in .homebridge/config.json
* If you run homebridge from sudo, place config in /root/.homebridge/config.json
* If you run homebridge without sudo, place config in /home/pi/.homebridge/config.json

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
  "accessories": [{
    "accessory": "Garage Door Opener",
    "name": "Garage Door",
    "doorRelayPin": 11,
    "doorSensorPin": 10
  }]
}
```

### How to Setup

```
sudo apt-get install libavahi-compat-libdnssd-dev
git clone git://github.com/quick2wire/quick2wire-gpio-admin.git
cd quick2wire-gpio-admin
make
sudo make install
sudo adduser $USER gpio
sudo npm install -g --unsafe-perm homebridge
sudo npm install -g homebridge-garage-door-wsensor
sudo homebridge
```
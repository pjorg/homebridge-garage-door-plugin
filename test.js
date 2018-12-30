var garagedoorclass = require('./garagedoor');

var options = {
    open_pin: 12,
    close_pin: 15,
    relay_pin: 13,
    openclose_timeout: 400
};

var garagedoor = new garagedoorclass.GarageDoor(console.log, options);

garagedoor.openGarageDoor();

function checkStatus()
{
    garagedoor.checkDoorStatus();
}
setInterval(checkStatus, 250);

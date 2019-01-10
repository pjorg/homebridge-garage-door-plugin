var garagedoorclass = require('./lib/garagedoorcontroller');

var options = {
    open_pin: 12,
    close_pin: 15,
    relay_pin: 13,
    openclose_timeout: 400
};

var garagedoorcontroller = new garagedoorclass.GarageDoorController(console.log, options);

garagedoorcontroller.openGarageDoor();

if (garagedoorcontroller.checkCloseSensor())
{
    console.log("Close sensor contacted");
}
else
{
    console.log("Close sensor NOT contacted");
}

if (garagedoorcontroller.checkOpenSensor())
{
    console.log("Open sensor contacted");
}
else
{
    console.log("Open sensor NOT contacted");
}

function checkStatus()
{
    garagedoorcontroller.checkDoorStatus();
}
setInterval(checkStatus, 250);

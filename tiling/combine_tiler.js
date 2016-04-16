/* Copyright 2015-2016 Brian Hackett. Released under the MIT license. */

// Given a directory of USGS tiles and a directory of elevation tiles, populate
// a directory with combined tiles.

load('../client/utility.js');
load('utility.js');

if (scriptArgs.length != 3) {
    print("Usage: js combine_tiler.js dstDirectory usgsDirectory elevationDirectory");
    quit();
}

var destinationDirectory = scriptArgs[0];
var usgsDirectory = scriptArgs[1];
var elevationDirectory = scriptArgs[2];

var tmpFile = "/tmp/tiler" + ((Math.random() * 1000000) | 0);
var tmpTxt = tmpFile + ".txt";

os.system(`ls ${elevationDirectory} > ${tmpTxt}`);
var elevationContents = snarf(tmpTxt).split('\n');

os.system(`ls "${usgsDirectory}" > ${tmpTxt}`);
var usgsContents = snarf(tmpTxt).split('\n');

var usgsIndex = {};
for (var i = 0; i < usgsContents.length; i++)
    usgsIndex[usgsContents[i]] = true;

for (var i = 0; i < elevationContents.length; i++) {
    var elevationFile = elevationContents[i];
    if (!/\.elv$/.test(elevationFile))
        continue;

    var usgsFile = elevationFile.substr(0, elevationFile.length - 3) + "jpg";
    if (!(usgsFile in usgsIndex))
        continue;

    var dstFile = destinationDirectory + "/" + elevationFile.substr(0, elevationFile.length - 3) + "zip";

    os.system(`cp ${elevationDirectory}/${elevationFile} .elv`);
    os.system(`cp ${usgsDirectory}/${usgsFile} .jpg`);
    os.system(`zip ${dstFile} .elv .jpg`);

    //os.system(`mv .elv ${elevationFile}`);
    //os.system(`mv .jpg ${usgsFile}`);
    os.system(`rm .elv .jpg`);
}

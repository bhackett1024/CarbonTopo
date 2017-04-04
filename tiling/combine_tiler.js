/* -*- indent-tabs-mode: nil; js-indent-level: 4; js-indent-level: 4 -*- */
/* Copyright 2015-2017 Brian Hackett. Released under the MIT license. */

// Populate a directory of combined tiles, given separate directories for
// different kinds of tile information.

if (scriptArgs.length != 4) {
    print("Usage: js combine_tiler.js dstDirectory elevationDirectory hydrographyDirectory featureDirectory");
    quit();
}

var destinationDirectory = scriptArgs[0];
os.system(`mkdir ${destinationDirectory} 2> /dev/null`);

var elevationDirectory = scriptArgs[1];
var hydrographyDirectory = scriptArgs[2];
var featureDirectory = scriptArgs[3];

var tmpFile = "/tmp/tiler" + ((Math.random() * 1000000) | 0);
var tmpTxt = tmpFile + ".txt";

os.system(`ls ${elevationDirectory} > ${tmpTxt}`);
var elevationContents = snarf(tmpTxt).split('\n');

os.system(`ls "${hydrographyDirectory}" > ${tmpTxt}`);
var hydrographyContents = snarf(tmpTxt).split('\n');

var hydrographyIndex = {};
for (var i = 0; i < hydrographyContents.length; i++)
    hydrographyIndex[hydrographyContents[i]] = true;

os.system(`ls "${featureDirectory}" > ${tmpTxt}`);
var featureContents = snarf(tmpTxt).split('\n');

var featureIndex = {};
for (var i = 0; i < featureContents.length; i++)
    featureIndex[featureContents[i]] = true;

for (var i = 0; i < elevationContents.length; i++) {
    var elevationFile = elevationContents[i];
    if (!/\.elv$/.test(elevationFile))
        continue;
    var baseFile = elevationFile.substr(0, elevationFile.length - 3);
    var dstFile = destinationDirectory + "/" + baseFile + "zip";

    os.system(`cp ${elevationDirectory}/${elevationFile} elv`);
    var cmd = `zip ${dstFile} elv`;

    var hydrographyFile = baseFile + "hyd";
    if (hydrographyFile in hydrographyIndex) {
	os.system(`cp ${hydrographyDirectory}/${hydrographyFile} hyd`);
	cmd += " hyd";
    }

    var featureFile = baseFile + "ftr";
    if (featureFile in featureIndex) {
        os.system(`cp ${featureDirectory}/${featureFile} ftr`);
        cmd += " ftr";
    }

    os.system(cmd);
    os.system("rm -f elv hyd ftr");
}

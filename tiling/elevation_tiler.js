/* -*- indent-tabs-mode: nil; js-indent-level: 4; js-indent-level: 4 -*- */
/* Copyright 2015-2017 Brian Hackett. Released under the MIT license. */

// Given one or more input 1 degree AIG binary grids, populate a destination
// directory with reformatted files for each 2.5 minute x 2.5 minute tile.

load('../client/utility.js');
load('utility.js');

if (scriptArgs.length == 0) {
    print("Usage: js elevation_tiler.js dstDirectory src0.zip src1.zip ...");
    quit();
}

var destinationDirectory = scriptArgs[0];

var tmpFile = "/tmp/tiler" + ((Math.random() * 1000000) | 0);
var tmpTxt = tmpFile + ".txt";

// The tiles we're generating are 2.5 minutes on each side.
var tileD = 2.5 / 60;

for (var i = 1; i < scriptArgs.length; i++) {
    try {
        generateElevationTiles(scriptArgs[i]);
    } finally {
        os.system("rm -rf tmp");
        os.system("rm -f .elv");
    }
}

function generateElevationTiles(sourceZip) {
    print("Processing " + sourceZip);

    os.system(`unzip ${sourceZip} -d tmp 2> /dev/null > /dev/null`);

    os.system(`ls tmp/*/metadata.xml > ${tmpTxt}`);
    var sourceGrid = /tmp\/(.*?)\//.exec(snarf(tmpTxt))[1];

    // Make sure the source uses NAD 83.
    os.system(`gdalinfo "tmp/${sourceGrid}" > ${tmpTxt}`);
    var sourceInfo = os.file.readFile(tmpTxt);
    assertEq(/DATUM\[\"North_American_Datum_1983\"/.test(sourceInfo), true);

    var mapBoundaryD = parseBoundary(sourceInfo);

    // Find the upper left boundary of the 1x1 degree area.
    var mapLeftD = Math.floor(mapBoundaryD.left + .5);
    var mapTopD = Math.ceil(mapBoundaryD.top - .5);

    // The dimensions given should encompass a 1x1 degree area, with some extra
    // on the sides.
    assertEq(mapLeftD + 1 < mapBoundaryD.right, true);
    assertEq(mapTopD - 1 > mapBoundaryD.bottom, true);

    os.system(`gdal_translate -co "DECIMAL_PRECISION=0" -of AAIGrid "tmp/${sourceGrid}" -projwin ${mapLeftD} ${mapTopD} ${mapLeftD + 1} ${mapTopD - 1} ${tmpTxt} 2> /dev/null > /dev/null`);
    os.system(`split ${tmpTxt} tmp/x`);

    var row = 0;
    for (var fileIndex = 0;; fileIndex++) {
        var splitFile = "tmp/xa" + String.fromCharCode('a'.charCodeAt(0) + fileIndex);
        var lineArray = os.file.readFile(splitFile).split('\n');
        if (fileIndex == 0) {
            var mapWidth = +/ncols.*?(\d+)/.exec(lineArray[0])[1];
            var mapHeight = +/nrows.*?(\d+)/.exec(lineArray[1])[1];
            var heightMatrix = new Uint16Array(mapHeight * mapWidth);

            assertEq(/xllcorner/.test(lineArray[2]), true);
            assertEq(/yllcorner/.test(lineArray[3]), true);
            assertEq(/cellsize/.test(lineArray[4]), true);
            assertEq(/NODATA_value/.test(lineArray[5]), true);
            lineArray = lineArray.slice(6);
        }
        assertEq(lineArray[lineArray.length - 1], "");
        lineArray.pop();
        for (var i = 0; i < lineArray.length; i++) {
            var heightArray = lineArray[i].split(" ");
            assertEq(heightArray.length, mapWidth + 1);
            assertEq(heightArray[0], "");

            for (var j = 0; j < mapWidth; j++)
                heightMatrix[row * mapWidth + j] = +heightArray[j + 1];
            row++;
        }
        if (row >= mapHeight) {
            assertEq(row, mapHeight);
            break;
        }
    }

    for (var i = 0; i < 24; i++) {
        for (var j = 0; j < 24; j++)
            generateTile(mapLeftD + i * tileD, mapTopD - j * tileD);
    }

    function getHeight(lon, lat) {
        var hPos = (lat - (mapTopD - 1)) * (mapHeight - 1);
        var wPos = (lon - mapLeftD) * (mapWidth - 1);
        var max = 0;
        for (var h = Math.floor(hPos); h <= Math.ceil(hPos); h++) {
             for (var w = Math.floor(wPos); w <= Math.ceil(wPos); w++)
                 max = Math.max(max, heightMatrix[(mapHeight - h - 1) * mapWidth + w]);
        }
        return max;
    }

    function generateTile(leftD, topD) {
        // Generate a tile with the specified lon and lat at the upper left corner.
        var dstFile = tileFile(destinationDirectory, leftD, topD, ".zip");

        var rightD = leftD + tileD;
        var bottomD = topD - tileD;

        var outputData = [];
        var last = 0;
        function encode(number)
        {
            assertEq(number, number | 0);

            var diff = number - last;

            while (true) {
                if (diff <= 127 && diff >= -127) {
                    outputData.push(127 + diff);
                    break;
                } else {
                    outputData.push(0xff);
                    outputData.push(diff & 0xff);
                    diff >>= 8;
                }
            }

            last = number;
        }

        for (var h = 0; h < 256; h++) {
            for (var w = 0; w < 256; w++) {
                var lon = leftD + w / 255 * tileD;
                var lat = topD - tileD + h / 255 * tileD;
                var height = getHeight(lon, lat);
                encode(height);
            }
        }

        os.file.writeTypedArrayToFile(".elv", new Uint8Array(outputData));
        os.system(`zip ${dstFile} .elv`);
        os.system("rm .elv");
    }
}

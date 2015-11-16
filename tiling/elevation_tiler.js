/* Copyright 2015 Brian Hackett. Released under the MIT license. */

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

for (var i = 1; i < scriptArgs.length; i++)
    generateElevationTiles(scriptArgs[i]);

function generateElevationTiles(sourceZip) {
    print("Processing " + sourceZip);

    os.system(`unzip ${sourceZip} 2> /dev/null > /dev/null`);

    os.system(`ls */metadata.xml > ${tmpTxt}`);
    var sourceGrid = /(.*?)\//.exec(snarf(tmpTxt))[1];

    // Make sure the source uses NAD 83.
    os.system(`gdalinfo "${sourceGrid}" > ${tmpTxt}`);
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

    for (var i = 0; i < 24; i++) {
        for (var j = 0; j < 24; j++)
            generateTile(mapLeftD + i * tileD, mapTopD - j * tileD);
    }

    os.system(`rm -rf ${sourceGrid} info readme.pdf *_13_meta.* ned_13arcsec_g.* *.url *_13_thumb.jpg`);

    function generateTile(leftD, topD) {
        // Generate a tile with the specified lon and lat at the upper left corner.
        var dstFile = tileFile(destinationDirectory, leftD, topD, ".elv");

        var rightD = leftD + tileD;
        var bottomD = topD - tileD;

        os.system(`gdal_translate -co "DECIMAL_PRECISION=0" -of AAIGrid "${sourceGrid}" -projwin ${leftD} ${topD} ${rightD} ${bottomD} ${tmpTxt} 2> /dev/null > /dev/null`);
        var text = os.file.readFile(tmpTxt);

        var lineArray = text.split('\n');
        var mapWidth = +/ncols.*?(\d+)/.exec(lineArray[0])[1];
        var mapHeight = +/nrows.*?(\d+)/.exec(lineArray[1])[1];

        assertEq(lineArray.length, mapHeight + 7);
        assertEq(/xllcorner/.test(lineArray[2]), true);
        assertEq(/yllcorner/.test(lineArray[3]), true);
        assertEq(/cellsize/.test(lineArray[4]), true);
        assertEq(/NODATA_value/.test(lineArray[5]), true);
        assertEq(lineArray[lineArray.length-1], "");

        lineArray = lineArray.slice(6, lineArray.length - 1);
        assertEq(lineArray.length, mapHeight);

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

        var heightMatrix = new Uint16Array(mapHeight * mapWidth);
        for (var i = 0; i < mapHeight; i++) {
            var heightArray = lineArray[i].split(" ");
            assertEq(heightArray.length, mapWidth + 1);
            assertEq(heightArray[0], "");

            for (var j = 0; j < mapWidth; j++)
                heightMatrix[i * mapWidth + j] = +heightArray[j + 1];
        }

        for (var i = 0; i < 256; i++) {
            for (var j = 0; j < 256; j++) {
                var minHeightIndex = i * (mapHeight / 256);
                var maxHeightIndex = (i + 1) * (mapHeight / 256);
                var minWidthIndex = j * (mapWidth / 256);
                var maxWidthIndex = (j + 1) * (mapWidth / 256);

                var max = 0;
                for (var h = Math.ceil(minHeightIndex); h < maxHeightIndex; h++) {
                    for (var w = Math.ceil(minWidthIndex); w < maxWidthIndex; w++)
                        max = Math.max(max, heightMatrix[(mapHeight - h - 1) * mapWidth + w]);
                }

                encode(max);
            }
        }

        os.file.writeFile(dstFile, new Uint8Array(outputData));
    }
}

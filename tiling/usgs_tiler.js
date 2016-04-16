/* Copyright 2015-2016 Brian Hackett. Released under the MIT license. */

// Given one or more input USGS 7.5 minute quadrangles, populate a destination
// directory with JPG images for each 2.5 minute x 2.5 minute tile.

load('../client/utility.js');
load('utility.js');
load('nadcon.js');

if (scriptArgs.length == 0) {
    print("Usage: js quad_tiler.js dstDirectory src0.zip src1.zip ...");
    quit();
}

var destinationDirectory = scriptArgs[0];

var tmpFile = "/tmp/tiler" + ((Math.random() * 1000000) | 0);
var tmpTxt = tmpFile + ".txt";
var tmpTif = tmpFile + ".tif";
var tmpJpg = tmpFile + ".jpg";
var tmpJpg2 = tmpFile + "_2.jpg";

// USGS quads are 7.5 minutes on each side.
var quadD = 7.5 / 60;

// The tiles we're generating are 2.5 minutes on each side.
var tileD = 2.5 / 60;

for (var i = 1; i < scriptArgs.length; i++) {
    var name = scriptArgs[i];
    try {
        generateQuadTiles(name);
        print(`Processing ${name}: Success`);
    } catch (e) {
        print(`Processing ${name}: Failure`);
    }
    os.system(`rm ${tmpTxt} ${tmpTif} *.tif *.xml 2> /dev/null > /dev/null`);
}

function generateQuadTiles(sourceZip) {
    os.system(`unzip "${sourceZip}" 2> /dev/null > /dev/null`);
    os.system(`ls *.tif > ${tmpTxt}`);
    var sourceTif = snarf(tmpTxt).split('\n')[0];

    // Make sure the source uses NAD 27.
    os.system(`gdalinfo "${sourceTif}" > ${tmpTxt}`);
    var sourceInfo = snarf(tmpTxt);

    // Find the boundaries of the quad.
    var mapInfo = parseDimensions(sourceInfo);
    var quadLeftD = Math.floor((mapInfo.boundary.left + quadD / 2) / quadD) * quadD;
    var quadTopD = Math.floor(mapInfo.boundary.top / quadD) * quadD;
    var quadRightD = quadLeftD + quadD;
    var quadBottomD = quadTopD - quadD;

    // Find the pixel boundaries of the quad as represented on the TIF.
    var quadLeftP = ((quadLeftD - mapInfo.boundary.left) * mapInfo.pixelsPerLonD) | 0;
    var quadTopP = ((mapInfo.boundary.top - quadTopD) * mapInfo.pixelsPerLatD) | 0;
    var quadRightP = quadLeftP + (mapInfo.pixelsPerLonD * quadD) | 0;
    var quadBottomP = quadTopP + (mapInfo.pixelsPerLatD * quadD) | 0;

    var correction;
    if (/DATUM\[\"North_American_Datum_1927\"/.test(sourceInfo)) {
        correction = correctionNAD27toNAD83(quadTopD, quadLeftD);
    } else if (/DATUM\[\"WGS_1984\"/.test(sourceInfo)) {
        correction = { lon:0, lat:0 };
    } else {
        assertEq(true, false);
    }

    for (var lon = Math.floor((quadLeftD + correction.lon) / tileD) * tileD;
         lessThan(lon, quadRightD + correction.lon);
         lon += tileD)
    {
        for (var lat = Math.floor((quadBottomD + correction.lat) / tileD) * tileD;
             lessThan(lat, quadTopD + correction.lat);
             lat += tileD)
        {
            generateTile(lon, lat + tileD, !correction.lon && !correction.lat);
        }
    }

    function generateTile(leftD, topD, nad83) {
        // Generate a tile or portion thereof with the specified upper left
        // NAD83 corner. The source TIF will partially overlap this tile.

        var pixelLeft = ((leftD - correction.lon - mapInfo.boundary.left) * mapInfo.pixelsPerLonD) | 0;
        var pixelTop = ((mapInfo.boundary.top - (topD - correction.lat)) * mapInfo.pixelsPerLatD) | 0;
        var pixelWidth = (tileD * mapInfo.pixelsPerLonD) | 0;
        var pixelHeight = (tileD * mapInfo.pixelsPerLatD) | 0;

        var corners = {
            upperLeft: true,
            upperRight: true,
            lowerLeft: true,
            lowerRight: true
        };

        if (!nad83) {
            if (pixelLeft < quadLeftP) {
                pixelWidth -= (quadLeftP - pixelLeft);
                pixelLeft = quadLeftP;
                corners.upperLeft = false;
                corners.lowerLeft = false;
            }
            if (pixelTop < quadTopP) {
                pixelHeight -= (quadTopP - pixelTop);
                pixelTop = quadTopP;
                corners.upperLeft = false;
                corners.upperRight = false;
            }
            if (pixelLeft + pixelWidth > quadRightP) {
                pixelWidth = quadRightP - pixelLeft;
                corners.upperRight = false;
                corners.lowerRight = false;
            }
            if (pixelTop + pixelHeight > quadBottomP) {
                pixelHeight = quadBottomP - pixelTop;
                corners.lowerLeft = false;
                corners.lowerRight = false;
            }
        }

        os.system(`gdal_translate -srcwin ${pixelLeft} ${pixelTop} ${pixelWidth} ${pixelHeight} "${sourceTif}" ${tmpTif} 2> /dev/null > /dev/null`);

        var distances = latlonDistances(topD);

        assertEq(corners.upperLeft || corners.upperRight || corners.lowerLeft || corners.lowerRight, true);
        var suffix = "";
        if (corners.upperLeft && corners.upperRight && corners.lowerLeft && corners.lowerRight) {
            // The entire tile is contained in this TIF, no suffix needed.
        } else {
            for (var name in corners) {
                if (corners[name])
                    suffix += "_" + name;
            }
        }

        var dstFile = tileFile(destinationDirectory, leftD, topD, suffix + ".jpg");

        // The pixel dimensions of a complete tile.
        var fullTileHeight = 2000;
        var fullTileWidth = ((distances.lon / distances.lat) * fullTileHeight);

        var height = (fullTileHeight * (pixelHeight / mapInfo.pixelsPerLatD / tileD)) | 0;
        var width = (fullTileWidth * (pixelWidth / mapInfo.pixelsPerLonD / tileD)) | 0;

        os.system(`convert ${tmpTif} -scale ${width}x${height}\! -quality 30 ${dstFile} 2> /dev/null > /dev/null`);

        if (suffix)
            tryMergeTile(leftD, topD);
    }
}

function tryMergeTile(leftD, topD) {
    var fileMatch = tileFile(destinationDirectory, leftD, topD, "_*");
    os.system(`ls ${fileMatch} > ${tmpTxt}`);

    var corners = {
        upperLeft: null,
        upperRight: null,
        lowerLeft: null,
        lowerRight: null
    };

    var lines = snarf(tmpTxt).split('\n');
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        for (var name in corners) {
            if (line.indexOf(name) != -1) {
                assertEq(corners[name], null);
                corners[name] = line;
            }
        }
    }

    for (var name in corners) {
        if (!corners[name])
            return;
    }

    var dstFile = tileFile(destinationDirectory, leftD, topD, ".jpg");

    if (corners.upperLeft == corners.lowerLeft) {
        assertEq(corners.upperRight, corners.lowerRight);
        os.system(`convert +append ${corners.upperLeft} ${corners.upperRight} ${dstFile} 2> /dev/null > /dev/null`);
    } else if (corners.upperLeft == corners.upperRight) {
        assertEq(corners.lowerLeft, corners.lowerRight);
        os.system(`convert -append ${corners.upperLeft} ${corners.lowerLeft} ${dstFile} 2> /dev/null > /dev/null`);
    } else {
        os.system(`convert +append ${corners.upperLeft} ${corners.upperRight} ${tmpJpg} 2> /dev/null > /dev/null`);
        os.system(`convert +append ${corners.lowerLeft} ${corners.lowerRight} ${tmpJpg2} 2> /dev/null > /dev/null`);
        os.system(`convert -append ${tmpJpg} ${tmpJpg2} ${dstFile}`);
    }

    os.system(`rm ${fileMatch}`);
}

function parseDimensions(sourceInfo) {
    var boundary = parseBoundary(sourceInfo);
    var pixels = /Size is (\d+), (\d+)/.exec(sourceInfo);
    return {
        boundary: boundary,
        pixelWidth: pixels[1],
        pixelHeight: pixels[2],
        pixelsPerLonD: pixels[1] / (boundary.right - boundary.left),
        pixelsPerLatD: pixels[2] / (boundary.top - boundary.bottom)
    };
}

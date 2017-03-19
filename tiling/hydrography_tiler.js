/* -*- indent-tabs-mode: nil; js-indent-level: 4; js-indent-level: 4 -*- */
/* Copyright 2017 Brian Hackett. Released under the MIT license. */

// Given one or more input hydrography shapefile zips, populate a destination
// directory with reformatted hydrography data files for each tile.

load('../client/utility.js');
load('utility.js');

if (scriptArgs.length == 0) {
    print("Usage: js hydrography_tiler.js hydrographyDirectory src0.zip src1.zip ...");
    quit();
}

var destinationDirectory = scriptArgs[0];
os.system(`mkdir ${destinationDirectory} 2> /dev/null`);

for (var i = 1; i < scriptArgs.length; i++) {
    try {
        processDirectory(scriptArgs[i]);
    } finally {
        //os.system("rm -rf tmp");
    }
}

function processDirectory(sourceZip)
{
    print("Processing " + sourceZip);

    //os.system(`unzip ${sourceZip} -d tmp 2> /dev/null > /dev/null`);

    os.system("ls tmp/*.shp > " + tmpTxt);
    var shapeFiles = snarf(tmpTxt).split('\n');

    for (var i = 0; i < shapeFiles.length; i++) {
        var file = shapeFiles[i];
        if (/\.shp/.test(file))
            processShapeFile(file);
    }
}

function processShapeFile(shapeFile)
{
    print("FILE " + shapeFile);

    os.system(`ogrinfo -al ${shapeFile} > ${tmpTxt}`);
    var lines = os.file.readFile(tmpTxt).split('\n');

    var arr;
    var line;
    var geometry;
    for (line = 0; line < lines.length; line++) {
        if (arr = /Geometry: (.*)/.exec(lines[line])) {
            geometry = arr[1];
            break;
        }
    }
    assertEq(typeof geometry == "string", true);

    assertEq(geometry, "Polygon");

    for (; line < lines.length; line++) {
        if (/DATUM/.test(lines[line])) {
            assertEq(/DATUM\[\"North_American_Datum_1983\"/.test(lines[line]), true);
            break;
        }
    }

    var currentName;

    for (; line < lines.length; line++) {
        if (arr = /GNIS_NAME \(String\) = (.*)/.exec(lines[line]))
            currentName = arr[1];

        if (arr = /POLYGON \(\((.*?)\)\)/.exec(lines[line])) {
            var poly = arr[1].split(',');
            var points = [];
            for (var i = 0; i < poly.length; i++) {
                var coords = /(.*?) (.*)/.test(points[i]);
                var lon = +coords[1];
                var lat = +coords[2];
                points.push(new Coordinate(lat, lon));
            }
            processPolygon(currentName, points);
        }
    }
}

function getTileLeftD(lon)
{
    return Math.floor(lon / tileD) * tileD;
}

function getTileBottomD(lat)
{
    return Math.floor(lat / tileD) * tileD;
}

function insertTileBorderPoints(points)
{
    // Given an ordered series of points, insert new points where the described
    // line/polygon crosses tile borders. This ensures that adjacent points are
    // inside or on the border of the same tile.
    for (var i = 0; i < points.length - 1; i++) {
        var point = points[i];
        var nextPoint = points[i + 1];
        var borderFractions = [];
        var minLon = Math.min(point.lon, nextPoint.lon);
        var maxLon = Math.max(point.lon, nextPoint.lon);
        for (var lon = getTileLeftD(minLon) + tileD; lon < maxLon; lon += tileD)
            borderFractions.push(Math.abs(lon - point.lon) / Math.abs(nextPoint.lon - point.lon));
        var minLat = Math.min(point.lat, nextPoint.lat);
        var maxLat = Math.max(point.lat, nextPoint.lat);
        for (var lat = getTileBottomD(minLat) + tileD; lat < maxLat; lat += tileD)
            borderFractions.push(Math.abs(lat - point.lat) / Math.abs(nextPoint.lat - point.lat));
        borderFractions.sort();
        for (var j = 0; j < borderFractions.length; j++) {
            var newPoint = new Coordinate;
            newPoint.interpolate(point, nextPoint, borderFractions[j]);
            points.splice(++i, 0, newPoint);
        }
    }
}

function processPolygon(name, points)
{
    assertEq("" + points[0], "" + points[points.length - 1]);

    insertTileBorderPoints(points);

    // Find a bounding box for the entire polygon.
    var leftD, topD, bottomD, rightD;
    leftD = rightD = points[0].lon;
    topD = bottomD = points[0].lat;
    for (var i = 1; i < points.length; i++) {
        leftD = Math.min(leftD, points[i].lon);
        rightD = Math.max(rightD, points[i].lon);
        topD = Math.max(topD, points[i].lat);
        bottomD = Math.min(bottomD, points[i].lat);
    }

    for (var lon = getTileLeftD(leftD); lon < rightD; lon += tileD) {
        for (var lat = getTileBottomD(bottomD); lat < topD; lat += tileD)
            processPolygonTile(name, points, lon, lat);
    }
}

function processPolygonTile(name, points, leftD, bottomD)
{
    var rightD = leftD + tileD;
    var topD = bottomD + tileD;

    var poly = [];

    for (var i = 0; i < points.length; i++) {
        var point = points[i];
        if (point.lat >= bottomD && point.lat <= topD && point.lon >= leftD && point.lon <= rightD) {
            var h = Math.round((point.lat - bottomD) / tileD * 255);
            var w = Math.round((point.lon - leftD) / tileD * 255);
            poly.push({h:h,w:w});
        }
    }

    for (var i = 0; i < poly.length; i++) {
    }
}

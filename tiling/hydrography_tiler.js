/* -*- indent-tabs-mode: nil; js-indent-level: 4; js-indent-level: 4 -*- */
/* Copyright 2015-2017 Brian Hackett. Released under the MIT license. */

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

function processDirectory(sourceZip)
{
    print("Processing Zip " + sourceZip);

    os.system(`unzip ${sourceZip} -d tmp 2> /dev/null > /dev/null`);

    os.system("ls tmp/*.shp > " + tmpTxt);
    var shapeFiles = snarf(tmpTxt).split('\n');

    for (var i = 0; i < shapeFiles.length; i++) {
        var file = shapeFiles[i];
        if (/\.shp/.test(file))
            processShapeFile(file);
    }
}

function ignoreShapeFile(shapeFile)
{
    if (/NHDWaterbody/.test(shapeFile))
        return false;
    return true;
}

function ignorePolygon(name)
{
    return false;
}

function processShapeFile(shapeFile)
{
    if (ignoreShapeFile(shapeFile))
        return;

    print("Processing ShapeFile " + shapeFile);

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

    if (geometry != "Polygon")
        return;

    for (; line < lines.length; line++) {
        if (/DATUM/.test(lines[line])) {
            assertEq(/DATUM\[\"North_American_Datum_1983\"/.test(lines[line]), true);
            break;
        }
    }

    var currentName = null;

    for (; line < lines.length; line++) {
        if (/OGRFeature/.test(lines[line]))
            currentName = null;

        if (arr = /^  (GNIS_)?NAME \(String\) = (.*)/.exec(lines[line]))
            currentName = arr[2];

        if (arr = /POLYGON \(\((.*?)\)\)/.exec(lines[line])) {
            if (ignorePolygon(currentName))
                continue;
            print("Processing polygon \"" + currentName + "\"");
            var polyList = arr[1].split("),(");
            for (var i = 0; i < polyList.length; i++) {
                var poly = polyList[i].split(',');
                var points = [];
                for (var j = 0; j < poly.length; j++) {
                    var coords = /(.*?) (.*)/.exec(poly[j]);
                    var lon = +coords[1];
                    var lat = +coords[2];
                    points.push(new Coordinate(lat, lon));
                }
                processPolygon(currentName, points);
            }
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
        var lonDiff = Math.abs(point.lon - nextPoint.lon);
        for (var lon = getTileLeftD(minLon) + tileD; lon < maxLon; lon += tileD) {
            if (point.lon < nextPoint.lon)
                borderFractions.push(1 - (lon - point.lon) / lonDiff);
            else
                borderFractions.push((lon - nextPoint.lon) / lonDiff);
        }
        var minLat = Math.min(point.lat, nextPoint.lat);
        var maxLat = Math.max(point.lat, nextPoint.lat);
        var latDiff = Math.abs(point.lat - nextPoint.lat);
        for (var lat = getTileBottomD(minLat) + tileD; lat < maxLat; lat += tileD) {
            if (point.lat < nextPoint.lat)
                borderFractions.push(1 - (lat - point.lat) / latDiff);
            else
                borderFractions.push((lat - nextPoint.lat) / latDiff);
        }
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
    if ("" + points[0] != "" + points[points.length - 1])
        points.push(points[0]);

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

    var what = 0;
    for (var lon = getTileLeftD(leftD); lon < rightD; lon += tileD) {
        for (var lat = getTileBottomD(bottomD); lat < topD; lat += tileD)
            processPolygonTile(name, points, lon, lat);
    }
}

function tileContainsPoint(leftD, bottomD, point)
{
    var rightD = leftD + tileD;
    var topD = bottomD + tileD;
    return lessThanOrEqual(bottomD, point.lat)
        && lessThanOrEqual(point.lat, topD)
        && lessThanOrEqual(leftD, point.lon)
        && lessThanOrEqual(point.lon, rightD);
}

function writePolygon(name, poly, leftD, bottomD)
{
    if (poly.length <= 2)
        return;

    var dstFile = tileFile(destinationDirectory, leftD, bottomD + tileD, ".hyd");

    var existingData = null;
    try {
        existingData = os.file.readFile(dstFile, "binary");
    } catch (e) {}

    var output = new Encoder();
    if (existingData)
        output.writeTypedArray(existingData);

    output.writeString(name != "(null)" ? name : "");
    output.writeByte(TAG_POLYGON);
    output.writeNumber(poly.length);
    for (var i = 0; i < poly.length; i++) {
        output.writeByte(poly[i].h);
        output.writeByte(poly[i].w);
    }

    os.file.writeTypedArrayToFile(dstFile, output.toTypedArray());
}

function processPolygonTile(name, points, leftD, bottomD)
{
    var firstOutsidePoint = -1;
    for (var i = 0; i < points.length; i++) {
        if (!tileContainsPoint(leftD, bottomD, points[i])) {
            firstOutsidePoint = i;
            break;
        }
    }

    var startPoint = firstOutsidePoint != -1 ? firstOutsidePoint : 0;
    var i = startPoint;
    var poly = [];
    do {
        var point = points[i];
        if (tileContainsPoint(leftD, bottomD, point)) {
            var h = Math.round((point.lat - bottomD) / tileD * 255);
            var w = Math.round((point.lon - leftD) / tileD * 255);
            poly.push({h:h,w:w});
        } else {
            writePolygon(name, poly, leftD, bottomD);
            poly = [];
        }
        i = i = (i + 1) % points.length;
    } while (i != startPoint);

    writePolygon(name, poly, leftD, bottomD);
}

for (var i = 1; i < scriptArgs.length; i++) {
    try {
        processDirectory(scriptArgs[i]);
    } finally {
        os.system("rm -rf tmp");
    }
}

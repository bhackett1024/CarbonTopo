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

function handleShapeFile(shapeFile)
{
    return /NHDWaterbody/.test(shapeFile) || /NHDFlowline/.test(shapeFile);
}

function handleFeature(name)
{
    assert(name);
    return true;
}

function parsePointList(str)
{
    var items = str.split(',');
    var points = [];
    for (var i = 0; i < items.length; i++) {
        var coords = /(.*?) (.*)/.exec(items[i]);
        var lon = +coords[1];
        var lat = +coords[2];
        points.push(new Coordinate(lat, lon));
    }
    return points;
}

function processShapeFile(shapeFile)
{
    if (!handleShapeFile(shapeFile))
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
    assert(typeof geometry == "string");
    assert(geometry == "Polygon" || geometry == "Line String");

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

        if (arr = /^  GNIS_NAME \(String\) = (.*)/.exec(lines[line]))
            currentName = arr[1];

        if (arr = /POLYGON \(\((.*?)\)\)/.exec(lines[line])) {
            if (!handleFeature(currentName))
                continue;
            var polyList = arr[1].split("),(");
            for (var i = 0; i < polyList.length; i++) {
                var points = parsePointList(polyList[i]);
                processFeature(currentName, points, true);
            }
        }

        if (arr = /LINESTRING \((.*?)\)/.exec(lines[line])) {
            if (!handleFeature(currentName))
                continue;
            var points = parsePointList(arr[1]);
            processFeature(currentName, points, false);
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
        borderFractions.reverse();
        for (var j = 0; j < borderFractions.length; j++) {
            var newPoint = new Coordinate;
            newPoint.interpolate(point, nextPoint, borderFractions[j]);
            points.splice(++i, 0, newPoint);
        }
    }
}

function processFeature(name, points, isPolygon)
{
    print("Processing feature \"" + name + "\"");

    if (isPolygon && ("" + points[0] != "" + points[points.length - 1]))
        points.push(points[0]);

    insertTileBorderPoints(points);

    // Find a bounding box for the entire feature.
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
            processFeatureTile(name, points, lon, lat, isPolygon);
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

function segmentCrossesLine(segmentStart, segmentEnd, lineStart, lineEnd)
{
    // Get new coordinates that are relative to |lineStart|.
    segmentStart = Coordinate.displace(segmentStart, -lineStart.lat, -lineStart.lon);
    segmentEnd = Coordinate.displace(segmentEnd, -lineStart.lat, -lineStart.lon);
    lineEnd = Coordinate.displace(lineEnd, -lineStart.lat, -lineStart.lon);

    var angle = Math.atan(lineEnd.lat / lineEnd.lon);

    var startY = rotateY(segmentStart.lon, segmentStart.lat, -angle);
    var endY = rotateY(segmentEnd.lon, segmentEnd.lat, -angle);

    return (equals(endY, 0) && !equals(startY, 0)) ||
           (lessThan(startY, 0) != lessThan(endY, 0));
}

var loopCount = 0;

function writeFeature(name, points, leftD, bottomD, tag)
{
    if (points.length <= 1)
        return;

    var dstFile = tileFile(destinationDirectory, leftD, bottomD + tileD, ".hyd");

    var existingData = null;
    try {
        existingData = os.file.readFile(dstFile, "binary");
    } catch (e) {}

    var output = new Encoder();
    if (existingData)
        output.writeTypedArray(existingData);

    output.writeByte(tag);
    if (tag != TAG_WATERBODY_SHORELINE)
        output.writeString(name != "(null)" ? name : "");
    output.writeNumber(points.length);
    for (var i = 0; i < points.length; i++) {
        output.writeByte(points[i].h);
        output.writeByte(points[i].w);
    }

    os.file.writeTypedArrayToFile(dstFile, output.toTypedArray());
}

function getTilePoint(leftD, bottomD, point)
{
    var h = Math.round((point.lat - bottomD) / tileD * 255);
    var w = Math.round((point.lon - leftD) / tileD * 255);
    return { h:h, w:w };
}

function processFeatureTile(name, allPoints, leftD, bottomD, isPolygon)
{
    // Partition the points into series of points which are both either inside
    // or outside the tile.
    var series = [];
    for (var i = 0; i < allPoints.length; i++) {
        var point = allPoints[i];
        var lastSeries = series.length ? series[series.length - 1] : null;
        var isInside = tileContainsPoint(leftD, bottomD, allPoints[i]);
        if (lastSeries && isInside == lastSeries.isInside) {
            lastSeries.points.push(point);
        } else {
            lastSeries = { points: [point], isInside: isInside };
            series.push(lastSeries);
        }
    }

    if (series.length == 1) {
        if (!series[0].isInside)
            return;
    } else {
        // Normalize point series so that the first series is inside the tile and
        // the last is outside it.
        if (series[0].isInside == series[series.length - 1].isInside) {
            series[0].points = series[series.length - 1].points.concat(series[0].points);
            series.pop();
        }
        if (!series[0].isInside)
            series.push(series.shift());
    }

    var tag;
    if (isPolygon) {
        if (series.length == 1) {
            tag = TAG_WATERBODY;
        } else {
            assert(series.length % 2 == 0);
            var tilePoints = [];
            for (var i = 0; i < series.length; i+= 2) {
                assert(series[i].isInside);
                var points = series[i].points;
                for (var j = 0; j < points.length; j++)
                    tilePoints.push(getTilePoint(leftD, bottomD, points[j]));

                // Insert additional points to travel around the border of the
                // tile to the start of the next interior series. We assume
                // that points in the polygon travel around it clockwise.
                var lastInteriorPoint = points[points.length - 1];
                var nextInteriorPoint = series[(i == series.length - 2) ? 0 : i + 2].points[0];

                var rightD = leftD + tileD;
                var topD = bottomD + tileD;

                var nextLon = nextInteriorPoint.lon;
                var nextLat = nextInteriorPoint.lat;
                var lon = lastInteriorPoint.lon;
                var lat = lastInteriorPoint.lat;
                while (!equals(lon, nextLon) || !equals(lat, nextLat)) {
                    if (equals(lon, leftD) && !equals(lat, topD))
                        lat = (equals(nextLon, lon) && lessThan(lat, nextLat)) ? nextLat : topD;
                    else if (equals(lat, topD) && !equals(lon, rightD))
                        lon = (equals(nextLat, lat) && lessThan(lon, nextLon)) ? nextLon : rightD;
                    else if (equals(lon, rightD) && !equals(lat, bottomD))
                        lat = (equals(nextLon, lon) && lessThan(nextLat, lat)) ? nextLat : bottomD;
                    else if (equals(lat, bottomD) && !equals(lon, leftD))
                        lon = (equals(nextLat, lat) && lessThan(nextLon, lon)) ? nextLon : leftD;
                    else
                        assert(false);
                    tilePoints.push(getTilePoint(leftD, bottomD, new Coordinate(lat, lon)));
                }
            }
            writeFeature(name, tilePoints, leftD, bottomD, TAG_WATERBODY_INTERIOR);
            tag = TAG_WATERBODY_SHORELINE;
        }
    } else {
        tag = TAG_STREAM;
    }

    for (var i = 0; i < series.length; i += 2) {
        assert(series[i].isInside);
        var points = series[i].points;
        var tilePoints = [];
        for (var j = 0; j < points.length; j++)
            tilePoints.push(getTilePoint(leftD, bottomD, points[j]));
        writeFeature(name, tilePoints, leftD, bottomD, tag);
    }
}

for (var i = 1; i < scriptArgs.length; i++) {
    try {
        processDirectory(scriptArgs[i]);
    } finally {
        os.system("rm -rf tmp");
    }
}

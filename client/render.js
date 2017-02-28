/* -*- indent-tabs-mode: nil; js-indent-level: 4; js-indent-level: 4 -*- */
/* Copyright 2015-2017 Brian Hackett. Released under the MIT license. */

"use strict";

// Routines related to rendering tile images.

var feetPerMeter = 3.28084;

var renderedTileHeight = 1000;
var contourLineIntervalFeet = 100;

var renderTileData = (function() {
    var renderCanvas = document.createElement('canvas');
    var renderContext = renderCanvas.getContext('2d', { alpha: false });
    var renderedTileWidth = 0;
    var currentTile = null;

    var contourPoints = [];
    var coordLL = new Coordinate();
    var coordLR = new Coordinate();
    var coordUL = new Coordinate();
    var coordUR = new Coordinate();

    var coordFreelist = [];

    function findContourPoints(firstCoord, secondCoord)
    {
        if (secondCoord.elv < firstCoord.elv) {
            var tmp = firstCoord;
            firstCoord = secondCoord;
            secondCoord = tmp;
        }

        var firstElv = firstCoord.elv * feetPerMeter;
        var secondElv = secondCoord.elv * feetPerMeter;

        for (var contour = contourLineIntervalFeet * Math.ceil(firstElv / contourLineIntervalFeet);
             contour < secondElv;
             contour += contourLineIntervalFeet)
        {
            var fraction = (contour - firstElv) / (secondElv - firstElv);
            var coord = coordFreelist.length ? coordFreelist.pop() : new Coordinate();
            coord.interpolate(firstCoord, secondCoord, 1 - fraction);
            contourPoints.push(coord);
        }
    }

    function lonPixel(lon)
    {
        return clamp(((lon - currentTile.leftD) / tileD * renderedTileWidth) | 0, 0, renderedTileWidth - 1);
    }

    function latPixel(lat)
    {
        return clamp(((currentTile.topD - lat) / tileD * renderedTileHeight) | 0, 0, renderedTileHeight - 1);
    }

    function drawContour(firstCoord, secondCoord)
    {
        var sx = lonPixel(firstCoord.lon);
        var sy = latPixel(firstCoord.lat);
        var tx = lonPixel(secondCoord.lon);
        var ty = latPixel(secondCoord.lat);

        renderContext.moveTo(sx, sy);
        renderContext.lineTo(tx, ty);
    }

    var reentrant = false;

    return function(tile) {
        assert(!reentrant);
        reentrant = true;

        currentTile = tile;
        if (!tile.elevationData)
            computeElevationData(tile);

        var distances = latlonDistances(tile.topD);
        renderedTileWidth = (renderedTileHeight * (distances.lon / distances.lat)) | 0;

        renderCanvas.height = renderedTileHeight;
        renderCanvas.width = renderedTileWidth;

        renderContext.fillStyle = "rgb(180,255,180)";
        renderContext.fillRect(0, 0, renderedTileWidth, renderedTileHeight);

        renderContext.beginPath();

        for (var h = 0; h < 255; h++) {
            for (var w = 0; w < 255; w++) {
                tile.getElevationCoordinate(h, w, coordLL);
                tile.getElevationCoordinate(h, w + 1, coordLR);
                tile.getElevationCoordinate(h + 1, w, coordUL);
                tile.getElevationCoordinate(h + 1, w + 1, coordUR);

                findContourPoints(coordLL, coordUL);
                findContourPoints(coordLL, coordLR);
                findContourPoints(coordUR, coordUL);
                findContourPoints(coordUR, coordLR);

                assert(contourPoints.length % 2 == 0);

                while (contourPoints.length) {
                    var coord = contourPoints.pop();
                    var otherCoord = null;
                    for (var i = 0; i < contourPoints.length; i++) {
                        if (equals(coord.elv, contourPoints[i].elv)) {
                            otherCoord = contourPoints[i];
                            contourPoints[i] = contourPoints[contourPoints.length - 1];
                            contourPoints.pop();
                            break;
                        }
                    }
                    assert(otherCoord);
                    drawContour(coord, otherCoord);

                    coordFreelist.push(coord, otherCoord);
                }

                contourPoints.length = 0;
            }
        }

        renderContext.stroke();
        reentrant = false;

        return renderCanvas.toDataURL();
    }
})();

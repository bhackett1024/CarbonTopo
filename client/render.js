/* -*- indent-tabs-mode: nil; js-indent-level: 4; js-indent-level: 4 -*- */
/* Copyright 2015-2017 Brian Hackett. Released under the MIT license. */

"use strict";

// Routines related to rendering tile images.

var feetPerMeter = 3.28084;

var renderedTileHeight = 1000;
var contourLineIntervalFeet = 100;
var majorContourLineIntervalFeet = 500;

var elevationColorFloor = 7000;
var elevationColorCeiling = 13000;

var colorFloor = [180,255,180];
var colorCeiling = [255,0,0];

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
            coord.major = (contour | 0) % majorContourLineIntervalFeet == 0;
            contourPoints.push(coord);
        }
    }

    function lonPixel(lon)
    {
        return clamp(Math.round((lon - currentTile.leftD) / tileD * renderedTileWidth), 0, renderedTileWidth);
    }

    function latPixel(lat)
    {
        return clamp(Math.round((currentTile.topD - lat) / tileD * renderedTileHeight), 0, renderedTileHeight);
    }

    function interpolateColor(first, second, fraction)
    {
        return clamp((first * fraction + second * (1 - fraction)) | 0, 0, 255);
    }

    function elevationColor(elv)
    {
        var fraction = clamp(((elv * feetPerMeter) - elevationColorFloor) / (elevationColorCeiling - elevationColorFloor), 0, 1);
        var r = interpolateColor(colorCeiling[0], colorFloor[0], fraction);
        var g = interpolateColor(colorCeiling[1], colorFloor[1], fraction);
        var b = interpolateColor(colorCeiling[2], colorFloor[2], fraction);
        return "rgb(" + r + "," + g + "," + b + ")";
    }

    function drawContour(firstCoord, secondCoord)
    {
        var sx = lonPixel(firstCoord.lon);
        var sy = latPixel(firstCoord.lat);
        var tx = lonPixel(secondCoord.lon);
        var ty = latPixel(secondCoord.lat);

        assert(firstCoord.major == secondCoord.major);
        renderContext.lineWidth = firstCoord.major ? 3 : 1;

        renderContext.beginPath();
        renderContext.moveTo(sx, sy);
        renderContext.lineTo(tx, ty);
        renderContext.stroke();
    }

    return function(tile) {
        currentTile = tile;
        if (!tile.elevationData)
            computeElevationData(tile);

        var distances = latlonDistances(tile.topD);
        renderedTileWidth = (renderedTileHeight * (distances.lon / distances.lat)) | 0;

        renderCanvas.height = renderedTileHeight;
        renderCanvas.width = renderedTileWidth;

        for (var h = 0; h < 255; h++) {
            for (var w = 0; w < 255; w++) {
                tile.getElevationCoordinate(h, w, coordLL);
                tile.getElevationCoordinate(h, w + 1, coordLR);
                tile.getElevationCoordinate(h + 1, w, coordUL);
                var sx = lonPixel(coordUL.lon);
                var sy = latPixel(coordUL.lat);
                renderContext.fillStyle = elevationColor(coordLL.elv);
                renderContext.fillRect(sx, sy, lonPixel(coordLR.lon) - sx, latPixel(coordLL.lat) - sy);
            }
        }

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

        var alphas = new Float32Array(255 * 255);

        for (var h = 0; h < 255; h++) {
            for (var w = 0; w < 255; w++) {
                tile.getElevationCoordinate(h, w, coordLL);
                tile.getElevationCoordinate(h, w + 1, coordLR);
                tile.getElevationCoordinate(h + 1, w, coordUL);

                var verticalDiff = coordUL.elv - coordLL.elv;
                var horizontalDiff = coordLR.elv - coordLL.elv;

                if (!lessThan(0, verticalDiff))
                    verticalDiff = 0;
                if (!lessThan(0, horizontalDiff))
                    horizontalDiff = 0;
                if (verticalDiff || horizontalDiff) {
                    var alpha = clamp(verticalDiff / 40 + horizontalDiff / 30, 0, .4);
                    alphas[h*255 + w] = alpha;
                }
            }
        }

        for (var h = 0; h < 255; h++) {
            for (var w = 0; w < 255; w++) {
                var alpha = Math.max(alphas[h*255 + w],
                                     alphas[h*255 + clamp(w-1,0,254)],
                                     alphas[h*255 + clamp(w+1,0,254)],
                                     alphas[clamp(h-1,0,254)*255 + w],
                                     alphas[clamp(h+1,0,254)*255 + w]);
                if (alpha) {
                    tile.getElevationCoordinate(h, w, coordLL);
                    tile.getElevationCoordinate(h, w + 1, coordLR);
                    tile.getElevationCoordinate(h + 1, w, coordUL);
                    var sx = lonPixel(coordUL.lon);
                    var sy = latPixel(coordUL.lat);
                    renderContext.fillStyle = "rgba(0,0,0," + alpha + ")";
                    renderContext.fillRect(sx, sy, lonPixel(coordLR.lon) - sx, latPixel(coordLL.lat) - sy);
                }
            }
        }

        return renderCanvas.toDataURL();
    }
})();

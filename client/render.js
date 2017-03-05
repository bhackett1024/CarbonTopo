/* -*- indent-tabs-mode: nil; js-indent-level: 4; js-indent-level: 4 -*- */
/* Copyright 2015-2017 Brian Hackett. Released under the MIT license. */

"use strict";

// Routines related to rendering tile images.

var feetPerMeter = 3.28084;

// Height of tile images, in pixels.
var renderedTileHeight = 1000;

// Variables for controlling tile rendering.
var contourLineIntervalFeet = 100;
var majorContourLineIntervalFeet = 500;
var elevationColorFloor = 7000;
var elevationColorCeiling = 11500;
var colorFloor = [180,255,180];
var colorCeiling = [255,0,0];

var renderTileData = (function() {
    // All tiles that are waiting to render. The active/next tile to render is
    // at position zero. If non-empty, either we are in renderTileWorklist or
    // there is a timer for a pending call to renderTileWorklist.
    var worklist = [];

    // Canvas/context used for rendering tiles.
    var renderCanvas = document.createElement('canvas');
    var renderContext = renderCanvas.getContext('2d', { alpha: false });

    // Width of the current tile.
    var renderedTileWidth = 0;

    // Scratch data used while rendering.
    var coordLL = new Coordinate();
    var coordLR = new Coordinate();
    var coordUL = new Coordinate();
    var coordUR = new Coordinate();
    var contourPoints = [];
    var coordFreelist = [];
    var renderAlphas = new Float32Array(255 * 255);

    // Start time of the current rendering slice.
    var renderStartTime = null;

    // Position in the various main rendering loops, for resuming work if
    // rendering stops in the middle of a slice.
    var backgroundH, contourH, fillAlphaH, drawAlphaH;

    function resetRenderingState() {
        backgroundH = contourH = fillAlphaH = drawAlphaH = 0;
    }
    resetRenderingState();

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
        return clamp(Math.round((lon - worklist[0].tile.leftD) / tileD * renderedTileWidth), 0, renderedTileWidth);
    }

    function latPixel(lat)
    {
        return clamp(Math.round((worklist[0].tile.topD - lat) / tileD * renderedTileHeight), 0, renderedTileHeight);
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

    function stopRendering() {
        // Lazily fill in the start time here. This is a convoluted way of
        // ensuring we always render at least one row in renderTileWorklist.
        if (!renderStartTime) {
            renderStartTime = new Date;
            return false;
        }
        var timeDiff = new Date - renderStartTime;
        if (timeDiff >= renderingBudget) {
            setTimeout(renderTileWorklist);
            return true;
        }
        return false;
    }

    function renderTileWorklist() {
        renderStartTime = null;

        var tile = worklist[0].tile;
        if (backgroundH == 0) {
            // We are just starting to render this tile.
            if (!tile.elevationData)
                computeElevationData(tile);

            var distances = latlonDistances(tile.topD);
            renderedTileWidth = (renderedTileHeight * (distances.lon / distances.lat)) | 0;

            renderCanvas.height = renderedTileHeight;
            renderCanvas.width = renderedTileWidth;
        }

        for (; backgroundH < 255; backgroundH++) {
            if (stopRendering())
                return;
            for (var backgroundW = 0; backgroundW < 255; backgroundW++) {
                tile.getElevationCoordinate(backgroundH, backgroundW, coordLL);
                tile.getElevationCoordinate(backgroundH, backgroundW + 1, coordLR);
                tile.getElevationCoordinate(backgroundH + 1, backgroundW, coordUL);
                var sx = lonPixel(coordUL.lon);
                var sy = latPixel(coordUL.lat);
                renderContext.fillStyle = elevationColor(coordLL.elv);
                renderContext.fillRect(sx, sy, lonPixel(coordLR.lon) - sx, latPixel(coordLL.lat) - sy);
            }
        }

        for (; contourH < 255; contourH++) {
            if (stopRendering())
                return;
            for (var contourW = 0; contourW < 255; contourW++) {
                tile.getElevationCoordinate(contourH, contourW, coordLL);
                tile.getElevationCoordinate(contourH, contourW + 1, coordLR);
                tile.getElevationCoordinate(contourH + 1, contourW, coordUL);
                tile.getElevationCoordinate(contourH + 1, contourW + 1, coordUR);

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

        for (; fillAlphaH < 255; fillAlphaH++) {
            if (stopRendering())
                return;
            for (var fillAlphaW = 0; fillAlphaW < 255; fillAlphaW++) {
                tile.getElevationCoordinate(fillAlphaH, fillAlphaW, coordLL);
                tile.getElevationCoordinate(fillAlphaH, fillAlphaW + 1, coordLR);
                tile.getElevationCoordinate(fillAlphaH + 1, fillAlphaW, coordUL);

                var verticalDiff = coordUL.elv - coordLL.elv;
                var horizontalDiff = coordLR.elv - coordLL.elv;

                if (!lessThan(0, verticalDiff))
                    verticalDiff = 0;
                if (!lessThan(0, horizontalDiff))
                    horizontalDiff = 0;

                var alpha = (verticalDiff || horizontalDiff)
                            ? clamp(verticalDiff / 40 + horizontalDiff / 30, 0, .4)
                            : 0;
                renderAlphas[fillAlphaH*255 + fillAlphaW] = alpha;
            }
        }

        for (; drawAlphaH < 255; drawAlphaH++) {
            if (stopRendering())
                return;
            for (var drawAlphaW = 0; drawAlphaW < 255; drawAlphaW++) {
                var alpha = Math.max(renderAlphas[drawAlphaH*255 + drawAlphaW],
                                     renderAlphas[drawAlphaH*255 + clamp(drawAlphaW-1,0,254)],
                                     renderAlphas[drawAlphaH*255 + clamp(drawAlphaW+1,0,254)],
                                     renderAlphas[clamp(drawAlphaH-1,0,254)*255 + drawAlphaW],
                                     renderAlphas[clamp(drawAlphaH+1,0,254)*255 + drawAlphaW]);
                if (alpha) {
                    tile.getElevationCoordinate(drawAlphaH, drawAlphaW, coordLL);
                    tile.getElevationCoordinate(drawAlphaH, drawAlphaW + 1, coordLR);
                    tile.getElevationCoordinate(drawAlphaH + 1, drawAlphaW, coordUL);
                    var sx = lonPixel(coordUL.lon);
                    var sy = latPixel(coordUL.lat);
                    renderContext.fillStyle = "rgba(0,0,0," + alpha + ")";
                    renderContext.fillRect(sx, sy, lonPixel(coordLR.lon) - sx, latPixel(coordLL.lat) - sy);
                }
            }
        }

        resetRenderingState();

        worklist[0].callback(renderCanvas.toDataURL());
        worklist = worklist.slice(1);

        if (worklist.length) {
            // Render tiles in sequence according to how close they are to the
            // center of the overhead view.
            var closestIndex = 0;
            for (var i = 1; i < worklist.length; i++) {
                if (overheadViewDistanceFrom(worklist[i].tile) < overheadViewDistanceFrom(worklist[closestIndex].tile))
                    closestIndex = i;
            }
            var tmp = worklist[0];
            worklist[0] = worklist[closestIndex];
            worklist[closestIndex] = tmp;

            setTimeout(renderTileWorklist);
        }
    }

    return function(tile, callback) {
        worklist.push({tile:tile, callback:callback});
        if (worklist.length == 1)
            setTimeout(renderTileWorklist);
    }
})();

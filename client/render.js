/* -*- indent-tabs-mode: nil; js-indent-level: 4; js-indent-level: 4 -*- */
/* Copyright 2015-2017 Brian Hackett. Released under the MIT license. */

"use strict";

// Routines related to rendering tile images.

var feetPerMeter = 3.28084;

// Pixel height of tile images.
var renderedTileHeight = 1000;

// Variables for controlling tile rendering.
var contourLineIntervalFeet = 100;
var majorContourLineIntervalFeet = 500;
var elevationColorFloor = 7000;
var elevationColorCeiling = 11500;
var colorFloor = [180,255,180];
var colorCeiling = [255,0,0];
var waterStrokeStyle = 'rgb(0,0,180)';
var waterFillStyle = 'rgb(120,120,255)';
var contourTextPixelHeight = 14;
var contourTextFont = 'serif';
var hydrographyTextPixelHeight = 18;
var hydrographyTextFont = 'serif';
var contourPixelDistanceSame = 400;
var contourPixelDistanceDifferent = 200;
var contourPixelDistanceBorder = 100;

var majorContourIndexBias = 5;

function computeMajorContourIndex(elv)
{
    return Math.round(elv * feetPerMeter / majorContourLineIntervalFeet) + majorContourIndexBias;
}

function majorContourIndexText(index)
{
    return "" + Math.round((index - majorContourIndexBias) * majorContourLineIntervalFeet);
}

const majorContourIndexNone = 0;
const majorContourIndexInUse = 1;

// computeMajorContourIndex should return an index in [2,255] for any major
// contour on earth. Make sure the bias value is suitable for this purpose.
(function() {
    var minGlobalElevationFeet = -1410;
    var maxGlobalElevationFeet = 29029;

    var minIndex = computeMajorContourIndex(minGlobalElevationFeet / feetPerMeter);
    assert(minIndex >= 2 && minIndex <= 255);

    var maxIndex = computeMajorContourIndex(maxGlobalElevationFeet / feetPerMeter);
    assert(maxIndex >= 2 && maxIndex <= 255);
})();

var renderTileData = (function() {
    // All tiles that are waiting to render. The active/next tile to render is
    // at position zero. If non-empty, either we are in renderTileWorklist or
    // there is a timer for a pending call to renderTileWorklist.
    var worklist = [];

    function currentTile() { return worklist[0].tile; }

    // Canvas/context used for rendering tiles.
    var renderCanvas = document.createElement('canvas');
    var renderContext = renderCanvas.getContext('2d', { alpha: false });

    // Pixel width of the current tile.
    var renderedTileWidth = 0;

    // Rendering is based on a 255x255 grid. Each piece of this grid has as its
    // corners one of the 256x256 elevation points for the tile.

    // Temporary data used while rendering.
    var coordLL = new Coordinate();
    var coordLR = new Coordinate();
    var coordUL = new Coordinate();
    var coordUR = new Coordinate();
    var contourPoints = [];
    var coordFreelist = [];
    var renderAlphas = new Float32Array(255 * 255);
    var contourState = new Uint8Array(255 * 255);
    var textLocations = [];
    var textLocationFreelist = [];

    // Start time of the current rendering slice.
    var renderStartTime = null;

    // Position in the various main rendering loops, for resuming work if
    // rendering stops in the middle of a slice.
    var backgroundH, contourH, contourTextH, fillAlphaH, drawAlphaH;
    var hydrographyGraphicsDecoder = new Decoder();
    var hydrographyTextDecoder = new Decoder();

    function resetRenderingState() {
        backgroundH = contourH = contourTextH = fillAlphaH = drawAlphaH = 0;
        hydrographyGraphicsDecoder.reset();
        hydrographyTextDecoder.reset();
        for (var i = 0; i < textLocations.length; i++)
            textLocationFreelist.push(textLocations[i]);
        textLocations.length = 0;
    }
    resetRenderingState();

    // Get an index into one of the various 255x255 arrays.
    function gridIndex(h, w) { return h*255 + w; }
    function gridIndexToHeight(index) { return Math.floor(index / 255); }
    function gridIndexToWidth(index) { return index % 255; }

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
        return clamp(Math.round((lon - currentTile().leftD) / tileD * renderedTileWidth), 0, renderedTileWidth);
    }

    function latPixel(lat)
    {
        return clamp(Math.round((currentTile().topD - lat) / tileD * renderedTileHeight), 0, renderedTileHeight);
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

    function drawBackground(h, w, red)
    {
        currentTile().getElevationCoordinate(h, w, coordLL);
        currentTile().getElevationCoordinate(h, w + 1, coordLR);
        currentTile().getElevationCoordinate(h + 1, w, coordUL);
        var sx = lonPixel(coordUL.lon);
        var sy = latPixel(coordUL.lat);
        renderContext.fillStyle = red ? 'rgb(255,0,0)' : elevationColor(coordLL.elv);
        renderContext.fillRect(sx, sy, lonPixel(coordLR.lon) - sx, latPixel(coordLL.lat) - sy);
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

    function addTextLocation(x, y, text)
    {
        var location = textLocationFreelist.length ? textLocationFreelist.pop() : {};
        location.x = x;
        location.y = y;
        location.text = text;
        textLocations.push(location);
    }

    function mayDrawContourText(x, y, text)
    {
        if (x <= contourPixelDistanceBorder ||
            y <= contourPixelDistanceBorder ||
            (renderedTileWidth - x) <= contourPixelDistanceBorder ||
            (renderedTileHeight - y) <= contourPixelDistanceBorder)
        {
            return false;
        }
        for (var i = 0; i < textLocations.length; i++) {
            var location = textLocations[i];
            var limit = (location.text == text) ? contourPixelDistanceSame : contourPixelDistanceDifferent;
            var xdist = x - location.x;
            var ydist = y - location.y;
            if (Math.abs(xdist) + Math.abs(ydist) <= limit ||
                xdist * xdist + ydist * ydist <= limit * limit)
            {
                return false;
            }
        }
        return true;
    }

    function pixelToNearestGridHeight(p)
    {
        return 256 - Math.round(p / renderedTileHeight * 256);
    }

    function pixelToNearestGridWidth(p)
    {
        return Math.round(p / renderedTileWidth * 256);
    }

    function addGridPiece(pieces, h, w)
    {
        var index = gridIndex(h, w);
        for (var i = 0; i < pieces.length; i++) {
            if (pieces[i] == index)
                return;
        }
        pieces.push(index);
    }

    // Return whether a box centered at the origin with the specified width,
    // height, and rotation angle contains x/y.
    function pointIntersectsBox(x, y, width, height, angle)
    {
        return Math.abs(rotateX(x, y, -angle)) <= width / 2 &&
               Math.abs(rotateY(x, y, -angle)) <= height / 2;
    }

    function addGridPiecesInBox(pieces, cx, cy, width, height, angle)
    {
        var sin = Math.abs(Math.sin(angle));
        var cos = Math.cos(angle);
        var startH = pixelToNearestGridHeight(cy + sin * width + cos * height);
        var endH = pixelToNearestGridHeight(cy - sin * width - cos * height);
        var startW = pixelToNearestGridWidth(cx - cos * width - sin * height);
        var endW = pixelToNearestGridWidth(cx + cos * width + sin * height);
        for (var h = startH + 1; h < endH; h++) {
            for (var w = startW + 1; w < endW; w++) {
                var x = w / 256 * renderedTileWidth;
                var y = renderedTileHeight - (h / 256 * renderedTileHeight);
                if (pointIntersectsBox(x - cx, y - cy, width, height, angle)) {
                    addGridPiece(pieces, h - 1, w - 1);
                    addGridPiece(pieces, h - 1, w);
                    addGridPiece(pieces, h, w - 1);
                    addGridPiece(pieces, h, w);
                }
            }
        }
    }

    function addGridPiecesInLine(pieces, sx, sy, tx, ty, width)
    {
        var cx = (sx + tx) / 2;
        var cy = (sy + ty) / 2;
        var length = Math.sqrt((sx-tx)*(sx-tx) + (sy-ty)*(sy-ty));
        var angle = Math.atan((ty - sy) / (tx - sx));
        addGridPiecesInBox(pieces, cx, cy, length + 6, width + 6, angle, true);
    }

    function textRenderSearchScore(cx, cy, angle, pixelWidth, pixelHeight, search)
    {
        var maxAngle = Math.PI / 2;
        var minAngle = -maxAngle;

        var pieces = [];
        addGridPiecesInBox(pieces, cx, cy, pixelWidth, pixelHeight, angle);

        if (cx - pixelWidth / 2 < 0 ||
            cx + pixelWidth / 2 > renderedTileWidth ||
            cy - pixelHeight / 2 < 0 ||
            cy + pixelHeight / 2 > renderedTileHeight) {
            return -1;
        }
        for (var i = 0; i < pieces.length; i++) {
            if (contourState[pieces[i]] == majorContourIndexInUse)
                return -1;
        }

        var score = 0;
        for (var i = 0; i < pieces.length; i++)
            score += search.searchScore(pieces[i]);
        return score;
    }

    function textRenderSearchNeighbors(cx, cy, angle)
    {
        var pixelDelta = 3;
        var angleDelta = Math.PI / 6;
        return [{ cx: cx - pixelDelta, cy: cy, angle: angle },
                { cx: cx + pixelDelta, cy: cy, angle: angle },
                { cx: cx, cy: cy - pixelDelta, angle: angle },
                { cx: cx, cy: cy + pixelDelta, angle: angle },
                { cx: cx, cy: cy, angle: angle - angleDelta },
                { cx: cx, cy: cy, angle: angle + angleDelta }];
    }

    function tryRenderText(cx, cy, angle, text, pixelHeight, search)
    {
        var pixelWidth = renderContext.measureText(text).width;
        var score = textRenderSearchScore(cx, cy, angle, pixelWidth, pixelHeight, search);

        var seen = [];
        for (var i = 0; i < search.limit; i++) {
            var neighbors = textRenderSearchNeighbors(cx, cy, angle);
            var bestcx = cx, bestcy = cy, bestAngle = angle, bestScore = score;
            for (var j = 0; j < neighbors.length; j++) {
                var neighbor = neighbors[j];
                var found = false;
                for (var k = 0; k < seen.length; k++) {
                    var item = seen[k];
                    if (neighbor.cx == item.cx && neighbor.cy == item.cy && neighbor.angle == item.angle) {
                        found = true;
                        break;
                    }
                }
                if (!found) {
                    seen.push(neighbor);
                    var neighborScore = textRenderSearchScore(neighbor.cx, neighbor.cy, neighbor.angle,
                                                              pixelWidth, pixelHeight, search);
                    if (neighborScore > bestScore) {
                        bestcx = neighbor.cx;
                        bestcy = neighbor.cy;
                        bestAngle = neighbor.angle;
                        bestScore = neighborScore;
                    }
                }
            }
            if (bestScore > score) {
                cx = bestcx;
                cy = bestcy;
                angle = bestAngle;
                score = bestScore;
            } else {
                // We found a local maximum.
                break;
            }
        }

        if (score < 0)
            return false;

        var pieces = [];
        addGridPiecesInBox(pieces, cx, cy, pixelWidth, pixelHeight, angle);
        for (var i = 0; i < pieces.length; i++) {
            var index = pieces[i];
            var h = gridIndexToHeight(index);
            var w = gridIndexToWidth(index);
            drawBackground(h, w);
            contourState[index] = majorContourIndexInUse;
        }

        // Compute rx and ry for drawing the text such that in the rotated
        // canvas the rendered text will be placed with its center at cx/cy.
        var rx = rotateX(cx, cy, -angle) - pixelWidth / 2;
        var ry = rotateY(cx, cy, -angle) + pixelHeight / 2;
        renderContext.rotate(angle);
        renderContext.lineWidth = 1;
        renderContext.fillStyle = 'rgb(0,0,0)';
        renderContext.fillText(text, rx, ry);
        renderContext.rotate(-angle);
        addTextLocation(cx, cy, text);

        return true;
    }

    var contourTextSearch = {
        limit: 20,
        majorContourIndex: majorContourIndexNone,
        searchScore: function(index) {
            return contourState[index] == contourTextSearch.majorContourIndex ? 5 : -1;
        }
    };

    function loadHydrographyFeature(decoder) {
        var tag = decoder.readByte();
        assert(tag == TAG_WATERBODY ||
               tag == TAG_WATERBODY_INTERIOR ||
               tag == TAG_WATERBODY_SHORELINE ||
               tag == TAG_STREAM);
        var name = (tag != TAG_WATERBODY_SHORELINE) ? decoder.readString() : "";

        var data = {
            tag: tag,
            name: name,
            eachX: [],
            eachY: []
        };

        var numPoints = decoder.readNumber();
        for (var i = 0; i < numPoints; i++) {
            var h = decoder.readByte();
            var w = decoder.readByte();
            currentTile().getElevationCoordinate(h, w, coordLL);
            data.eachX.push(lonPixel(coordLL.lon));
            data.eachY.push(latPixel(coordLL.lat));
        }

        return data;
    }

    var hydrographyTextSearch = {
        limit: 20,
        data: null,
        searchScore: function(index) {
            var h = gridIndexToHeight(index);
            var w = gridIndexToWidth(index);
            currentTile().getElevationCoordinate(h, w, coordLL);
            var x = lonPixel(coordUL.lon);
            var y = latPixel(coordUL.lat);

            var eachX = hydrographyTextSearch.data.eachX;
            var eachY = hydrographyTextSearch.data.eachY;

            var closestDistance = 1000;
            for (var i = 0; i < eachX.length; i++) {
                var distance = Math.abs(eachX[i] - x) + Math.abs(eachY[i] - y);
                closestDistance = Math.min(closestDistance, distance);
            }
            return closestDistance;
        }
    };

    function renderHydrographyText(data)
    {
        if (!data.name.length)
            return;

        var xTotal = 0, yTotal = 0;
        for (var i = 0; i < data.eachX.length; i++) {
            xTotal += data.eachX[i];
            yTotal += data.eachY[i];
        }
        var x = Math.round(xTotal / data.eachX.length);
        var y = Math.round(yTotal / data.eachY.length);

        hydrographyTextSearch.data = data;
        if (!tryRenderText(x, y, 0, data.name, hydrographyTextPixelHeight, hydrographyTextSearch)) {
            renderContext.lineWidth = 1;
            renderContext.fillStyle = 'rgb(0,0,0)';
            renderContext.fillText("FAILURE", x, y);
        }
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

            if (tile.hydrographyData) {
                hydrographyGraphicsDecoder.reset(tile.hydrographyData);
                hydrographyTextDecoder.reset(tile.hydrographyData);
            }
        }

        // Fill in the background color for each piece of the grid.
        for (; backgroundH < 255; backgroundH++) {
            if (stopRendering())
                return;
            for (var backgroundW = 0; backgroundW < 255; backgroundW++)
                drawBackground(backgroundH, backgroundW);
        }

        // Draw contour lines in each piece of the grid, and fill contourState
        // with information about where the major contour lines are.
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

                var majorIndex = "unknown";
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

                    if (coord.major) {
                        var index = computeMajorContourIndex(coord.elv);
                        if (majorIndex == "unknown")
                            majorIndex = index;
                        else if (majorIndex != index)
                            majorIndex = "invalid";
                    }

                    coordFreelist.push(coord, otherCoord);
                }
                contourState[gridIndex(contourH, contourW)] = (typeof majorIndex == "number") ? majorIndex : 0;

                contourPoints.length = 0;
            }
        }

        // Draw hydrography for the tile.
        while (!hydrographyGraphicsDecoder.finished()) {
            var data = loadHydrographyFeature(hydrographyGraphicsDecoder);
 
            if (data.tag == TAG_WATERBODY || data.tag == TAG_WATERBODY_INTERIOR)
                renderContext.fillStyle = waterFillStyle;

            if (data.tag != TAG_WATERBODY_INTERIOR) {
                renderContext.strokeStyle = waterStrokeStyle;
                renderContext.lineWidth = 3;
                var pieces = [];
                for (var i = 0; i < data.eachX.length - 1; i++) {
                    addGridPiecesInLine(pieces, data.eachX[i], data.eachY[i],
                                        data.eachX[i + 1], data.eachY[i + 1],
                                        renderContext.lineWidth);
                    for (var j = 0; j < pieces.length; j++) {
                        var index = pieces[j];
                        contourState[index] = majorContourIndexInUse;

                        // For debugging.
                        //drawBackground(gridIndexToHeight(index), gridIndexToWidth(index), true);
                    }
                    pieces.length = 0;
                }
            }

            renderContext.beginPath();
            renderContext.moveTo(data.eachX[0], data.eachY[0]);
            for (var i = 1; i < data.eachX.length; i++)
                renderContext.lineTo(data.eachX[i], data.eachY[i]);

            if (data.tag == TAG_WATERBODY || data.tag == TAG_WATERBODY_INTERIOR)
                renderContext.fill();

            if (data.tag != TAG_WATERBODY_INTERIOR)
                renderContext.stroke();

            if (stopRendering())
                return;
        }

        // Label hydrography features on the tile.
        renderContext.font = hydrographyTextPixelHeight + 'px ' + hydrographyTextFont;
        while (!hydrographyTextDecoder.finished()) {
            var data = loadHydrographyFeature(hydrographyTextDecoder);
            renderHydrographyText(data);
            if (stopRendering())
                return;
        }

        // Draw elevation text at major contour lines on the tile.
        renderContext.font = contourTextPixelHeight + 'px ' + contourTextFont;
        renderContext.textBaseline = 'bottom';
        for (; contourTextH < 255; contourTextH++) {
            if (stopRendering())
                return;
            for (var contourTextW = 0; contourTextW < 255; contourTextW++) {
                var majorIndex = contourState[gridIndex(contourTextH, contourTextW)];
                if (majorIndex <= majorContourIndexInUse)
                    continue;
                tile.getElevationCoordinate(contourTextH, contourTextW, coordLL);
                var cx = lonPixel(coordLL.lon + tileD / 512);
                var cy = latPixel(coordLL.lat + tileD / 512);
                var text = majorContourIndexText(majorIndex);
                if (!mayDrawContourText(cx, cy, text))
                    continue;

                contourTextSearch.majorContourIndex = majorIndex;
                tryRenderText(cx, cy, 0, text, contourTextPixelHeight, contourTextSearch);
            }
        }

        // Calculate alpha/shading information for each grid piece based on its
        // steepness and aspect.
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
                renderAlphas[gridIndex(fillAlphaH, fillAlphaW)] = alpha;
            }
        }

        // Draw shading for each grid piece, considering adjacent grid pieces
        // as well to smooth out the resulting shading.
        for (; drawAlphaH < 255; drawAlphaH++) {
            if (stopRendering())
                return;
            for (var drawAlphaW = 0; drawAlphaW < 255; drawAlphaW++) {
                var alpha = Math.max(renderAlphas[gridIndex(drawAlphaH, drawAlphaW)],
                                     renderAlphas[gridIndex(drawAlphaH, clamp(drawAlphaW-1,0,254))],
                                     renderAlphas[gridIndex(drawAlphaH, clamp(drawAlphaW+1,0,254))],
                                     renderAlphas[gridIndex(clamp(drawAlphaH-1,0,254), drawAlphaW)],
                                     renderAlphas[gridIndex(clamp(drawAlphaH+1,0,254), drawAlphaW)]);
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

        /*
        // Draw a border around the tile, for use while debugging.
        renderContext.lineWidth = 1;
        renderContext.strokeStyle = 'rgb(0,0,0)';
        renderContext.beginPath();
        renderContext.moveTo(0,0);
        renderContext.lineTo(renderedTileWidth, 0);
        renderContext.lineTo(renderedTileWidth, renderedTileHeight);
        renderContext.lineTo(0, renderedTileHeight);
        renderContext.lineTo(0,0);
        renderContext.stroke();
        */

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

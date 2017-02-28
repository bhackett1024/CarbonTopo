/* -*- indent-tabs-mode: nil; js-indent-level: 4; js-indent-level: 4 -*- */
/* Copyright 2015-2016 Brian Hackett. Released under the MIT license. */

"use strict";

// Routines related to rendering the point of view display.

function ViewAngle(yaw, pitch, radius)
{
    this.initialize(yaw, pitch, radius);
}

ViewAngle.prototype.copyFrom = function(other) {
    this.initialize(other.yaw, other.pitch, other.radius);
}

ViewAngle.prototype.initialize = function(yaw, pitch, radius) {
    this.yaw = yaw;
    this.pitch = pitch;
    this.radius = radius;
}

ViewAngle.prototype.radiansPerPixel = function(width) {
    return (2 / width) * this.radius;
}

function lineIntersectsTriangle(lineA, lineB, triangleA, triangleB, triangleC, result)
{
    var m00, m01, m02, m10, m11, m12, m20, m21, m22;
    var /*i00, i01, i02,*/ i10, i11, i12, i20, i21, i22;

    // If a line passing through two points intersects the triangle described
    // by three points at a single point, return true and set |result| to the
    // point of the intersection. Otherwise return false.
    //
    // This algorithm is based on https://en.wikipedia.org/wiki/Line-plane_intersection

    m00 = lineB.lon - lineA.lon;
    m01 = triangleB.lon - triangleA.lon;
    m02 = triangleC.lon - triangleA.lon;

    m10 = lineB.lat - lineA.lat;
    m11 = triangleB.lat - triangleA.lat;
    m12 = triangleC.lat - triangleA.lat;

    m20 = lineB.elv - lineA.elv;
    m21 = triangleB.elv - triangleA.elv;
    m22 = triangleC.elv - triangleA.elv;

    // Compute the inverted determinant of the matrix.
    var d = m00 * (m11 * m22 - m12 * m21)
          + m01 * (m12 * m20 - m10 * m22)
          + m02 * (m10 * m21 - m11 * m20);
    d = 1/d;

    // Invert the matrix just computed. If there is no inverse then the
    // inverted determinant and all entries in the inverted matrix will be
    // infinite and the tests we do at the end will miss.
    //i00 = d * (m11 * m22 - m12 * m21);
    i10 = d * (m12 * m20 - m10 * m22);
    i20 = d * (m10 * m21 - m11 * m20);
    //i01 = d * (m02 * m21 - m01 * m22);
    i11 = d * (m00 * m22 - m02 * m20);
    i21 = d * (m01 * m20 - m00 * m21);
    //i02 = d * (m01 * m12 - m02 * m11);
    i12 = d * (m02 * m10 - m00 * m12);
    i22 = d * (m00 * m11 - m01 * m10);

    var dot0 = lineB.lon - triangleA.lon;
    var dot1 = lineB.lat - triangleA.lat;
    var dot2 = lineB.elv - triangleA.elv;

    var res1 = i10 * dot0 + i11 * dot1 + i12 * dot2;
    var res2 = i20 * dot0 + i21 * dot1 + i22 * dot2;

    if (res1 >= 0 && res1 <= 1 && res2 >= 0 && res2 <= 1 && res1 + res2 <= 1) {
        result.initialize(triangleA.lat +
                          res1 * (triangleB.lat - triangleA.lat) +
                          res2 * (triangleC.lat - triangleA.lat),
                          triangleA.lon +
                          res1 * (triangleB.lon - triangleA.lon) +
                          res2 * (triangleC.lon - triangleA.lon),
                          triangleA.elv +
                          res1 * (triangleB.elv - triangleA.elv) +
                          res2 * (triangleC.elv - triangleA.elv));
        return true;
    }

    return false;
}

function newElevation(source, target, direction)
{
    return source.elv + (equals(direction.lon, 0)
                         ? (target.lat - source.lat) / direction.lat * direction.elv
                         : (target.lon - source.lon) / direction.lon * direction.elv);
}

var raytrace = (function() {
    var source = new Coordinate();
    var target = new Coordinate();

    var tempUL = new Coordinate();
    var tempUR = new Coordinate();
    var tempLL = new Coordinate();
    var tempLR = new Coordinate();
    var tempRes = new Coordinate();

    var deadStackEntries = null;
    for (var i = 0; i < 10; i++) {
        deadStackEntries = {
            leftD: 0,
            rightD: 0,
            topD: 0,
            bottomD: 0,
            elevationIndex: 0,
            exploredChildren: [ false, false, false, false ],
            prev: deadStackEntries
        };
    }

    function pushSearchStack(leftD, rightD, topD, bottomD, elevationIndex, searchStack) {
        var box = deadStackEntries;
        deadStackEntries = deadStackEntries.prev;

        box.leftD = leftD;
        box.rightD = rightD;
        box.topD = topD;
        box.bottomD = bottomD;
        box.elevationIndex = elevationIndex;
        for (var i = 0; i < 4; i++)
            box.exploredChildren[i] = false;
        box.prev = searchStack;
        return box;
    }

    function updateTargetBox(box, direction) {
        // Set |target| to the point where a ray from |source| leaves |box|.

        // Find the possible sides which the ray can hit on its way out.
        var lonTarget = (direction.lon < 0) ? box.leftD : box.rightD;
        var latTarget = (direction.lat < 0) ? box.bottomD : box.topD;

        // See if the ray hits the bottom or top of the box first.
        var lonIntersect = source.lon + (latTarget - source.lat) / direction.lat * direction.lon;
        if ((lonIntersect >= box.leftD || equals(lonIntersect, box.leftD)) &&
            (lonIntersect <= box.rightD || equals(lonIntersect, box.rightD)))
        {
            target.lon = lonIntersect;
            target.lat = latTarget;
        } else {
            var latIntersect = source.lat + (lonTarget - source.lon) / direction.lon * direction.lat;
            target.lon = lonTarget;
            target.lat = latIntersect;
        }

        target.elv = newElevation(source, target, direction);
    }

    function updateTargetCorners(tile, box, direction) {
        // A    B    C
        //
        //    1---2
        //    |   |
        // D  | N |  E
        //    |   |
        //    3---4
        //
        // F    G    H
        //
        // N represents the maximum height of any point within its quadrant,
        // and similarly for all the neighboring quadrants. Pick heights for
        // the corners that have the largest values possible while satisfying
        // this constraint: height(1) == min(A, B, D, N) and so forth. If N
        // is a local maximum then none of the corners will have its height.

        var height = elevationIndexToHeight(box.elevationIndex - numQuadrants);
        var width = elevationIndexToWidth(box.elevationIndex - numQuadrants);

        // For simplicity, adjacent quadrants are only considered when they are
        // in the same tile.
        var prevHeight = height ? height - 1 : height;
        var prevWidth = width ? width - 1 : width;
        var nextHeight = (height < 255) ? height + 1 : height;
        var nextWidth = (width < 255) ? width + 1 : width;

        var elevationN = tile.elevationData[box.elevationIndex];
        var elevationA = tile.elevationData[numQuadrants + elevationIndexFromHeightAndWidth(nextHeight, prevWidth)];
        var elevationB = tile.elevationData[numQuadrants + elevationIndexFromHeightAndWidth(nextHeight, width)];
        var elevationC = tile.elevationData[numQuadrants + elevationIndexFromHeightAndWidth(nextHeight, nextWidth)];
        var elevationD = tile.elevationData[numQuadrants + elevationIndexFromHeightAndWidth(height, prevWidth)];
        var elevationE = tile.elevationData[numQuadrants + elevationIndexFromHeightAndWidth(height, nextWidth)];
        var elevationF = tile.elevationData[numQuadrants + elevationIndexFromHeightAndWidth(prevHeight, prevWidth)];
        var elevationG = tile.elevationData[numQuadrants + elevationIndexFromHeightAndWidth(prevHeight, width)];
        var elevationH = tile.elevationData[numQuadrants + elevationIndexFromHeightAndWidth(prevHeight, nextWidth)];

        var elevationUL = Math.min(elevationN, elevationA, elevationB, elevationD);
        var elevationUR = Math.min(elevationN, elevationB, elevationC, elevationE);
        var elevationLL = Math.min(elevationN, elevationD, elevationF, elevationG);
        var elevationLR = Math.min(elevationN, elevationE, elevationG, elevationH);

        tempUL.initialize(box.topD, box.leftD, elevationUL);
        tempLR.initialize(box.bottomD, box.rightD, elevationLR);
        tempUR.initialize(box.topD, box.rightD, elevationUR);

        if (lineIntersectsTriangle(source, target, tempUL, tempLR, tempUR, tempRes)) {
            target.copyFrom(tempRes);
            return true;
        }

        tempLL.initialize(box.bottomD, box.leftD, elevationLL);

        if (lineIntersectsTriangle(source, target, tempUL, tempLR, tempLL, tempRes)) {
            target.copyFrom(tempRes);
            return true;
        }

        var minElevation = Math.min(elevationUL, elevationUR, elevationLL, elevationLR);

        if (source.elv <= minElevation) {
            target.copyFrom(source);
            return true;
        }

        if (target.elv <= minElevation) {
            return true;
        }

        return false;
    }

    function popSearchStack(box) {
        var prev = box.prev;
        box.prev = deadStackEntries;
        deadStackEntries = box;
        return prev;
    }

    function contains(box, coords) {
        return (coords.lon >= box.leftD || equals(coords.lon, box.leftD)) &&
               (coords.lon <= box.rightD || equals(coords.lon, box.rightD)) &&
               (coords.lat >= box.bottomD || equals(coords.lat, box.bottomD)) &&
               (coords.lat <= box.topD || equals(coords.lat, box.topD));
    }

    return function(coords, direction) {
        source.copyFrom(coords);

        var tile = findTile(source);
        var searchStack = pushSearchStack(tile.leftD, tile.leftD + tileD,
                                          tile.topD, tile.topD - tileD, 0, null);

        while (true) {
            // Set target to the point where the ray leaves the current bounding box.
            updateTargetBox(searchStack, direction);

            // Compute the minimum height of the ray within the bounding box.
            var minHeight = Math.min(source.elv, target.elv);

            var dim = searchStack.topD - searchStack.bottomD;

            var boxHeight = tile.elevationData[searchStack.elevationIndex];
            if (boxHeight >= minHeight) {
                // The ray might intersect the current bounding box.

                if (searchStack.elevationIndex >= numQuadrants) {
                    // This quadrant has no children. See if the ray has intersected the
                    // terrain anywhere within the quadrant.

                    if (updateTargetCorners(tile, searchStack, direction)) {
                        while (searchStack)
                            searchStack = popSearchStack(searchStack);
                        coords.copyFrom(target);
                        return true;
                    }
                } else {
                    // Look for a child of this quadrant which contains the source
                    // and hasn't been explored yet.
                    var checkQ0 = !searchStack.exploredChildren[0];
                    var checkQ1 = !searchStack.exploredChildren[1];
                    var checkQ2 = !searchStack.exploredChildren[2];
                    var checkQ3 = !searchStack.exploredChildren[3];

                    var lonMid = searchStack.leftD + dim / 2;
                    var latMid = searchStack.bottomD + dim / 2;

                    if (!equals(source.lon, lonMid)) {
                        if (source.lon < lonMid)
                            checkQ2 = checkQ3 = false;
                        else
                            checkQ0 = checkQ1 = false;
                    }
                    if (!equals(source.lat, latMid)) {
                        if (source.lat < latMid)
                            checkQ1 = checkQ3 = false;
                        else
                            checkQ0 = checkQ2 = false;
                    }

                    if (checkQ0) {
                        searchStack.exploredChildren[0] = true;
                        searchStack = pushSearchStack(searchStack.leftD, lonMid, latMid, searchStack.bottomD,
                                                      searchStack.elevationIndex * 4 + 1,
                                                      searchStack);
                        continue;
                    }
                    if (checkQ1) {
                        searchStack.exploredChildren[1] = true;
                        searchStack = pushSearchStack(searchStack.leftD, lonMid, searchStack.topD, latMid,
                                                      searchStack.elevationIndex * 4 + 2,
                                                      searchStack);
                        continue;
                    }
                    if (checkQ2) {
                        searchStack.exploredChildren[2] = true;
                        searchStack = pushSearchStack(lonMid, searchStack.rightD, latMid, searchStack.bottomD,
                                                      searchStack.elevationIndex * 4 + 3,
                                                      searchStack);
                        continue;
                    }
                    if (checkQ3) {
                        searchStack.exploredChildren[3] = true;
                        searchStack = pushSearchStack(lonMid, searchStack.rightD, searchStack.topD, latMid,
                                                      searchStack.elevationIndex * 4 + 4,
                                                      searchStack);
                        continue;
                    }

                    // All potential child quadrants have been explored, so fall through.
                }
            }

            // The ray never intersects the current bounding box.
            source.copyFrom(target);

            var left = equals(target.lon, searchStack.leftD);
            var right = equals(target.lon, searchStack.rightD);
            var top = equals(target.lat, searchStack.topD);
            var bottom = equals(target.lat, searchStack.bottomD);
            if (!left && !right && !top && !bottom)
                throw "Bad target";

            if (searchStack.elevationIndex == 0) {
                popSearchStack(searchStack);

                // The ray never intersects the current tile. Find the next
                // tile which it enters.
                if (left)
                    target.lon -= dim / 2;
                else if (right)
                    target.lon += dim / 2;
                else if (top)
                    target.lat += dim / 2;
                else
                    target.lat -= dim / 2;
                tile = findTile(target);
                if (tile.invalid || !tile.image)
                    return false;

                searchStack = pushSearchStack(tile.leftD, tile.leftD + tileD,
                                              tile.topD, tile.topD - tileD, 0, null);
                continue;
            }

            // Now that the source has been updated, look again in the outer quadrant.
            searchStack = popSearchStack(searchStack);
        }
    }
})();

function fillColorData(coords, color) {
    var tile = findTile(coords);

    if (!tile || !tile.image || !tile.image.width || !tile.image.height) {
        color.r = 255;
        color.g = 0;
        color.b = 0;
        return;
    }

    if (!tile.imageData) {
        var canvas = document.createElement('canvas');
        canvas.width = tile.image.width;
        canvas.height = tile.image.height;
        var context = canvas.getContext('2d');
        context.drawImage(tile.image, 0, 0);

        tile.imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    }

    var width = tile.imageData.width;
    var height = tile.imageData.height;

    var xoff = ((coords.lon - tile.leftD) / tileD * width) | 0;
    var yoff = ((tile.topD - coords.lat) / tileD * height) | 0;

    var i = 4 * (yoff * width + xoff);
    color.r = tile.imageData.data[i];
    color.g = tile.imageData.data[i + 1];
    color.b = tile.imageData.data[i + 2];
}

function distanceBetween(source, target, distances) {
    var lon = (source.lon - target.lon) * distances.lon;
    var lat = (source.lat - target.lat) * distances.lat;
    var elv = source.elv - target.elv;
    return Math.sqrt(lon*lon + lat*lat + elv*elv);
}

// Get the index in a canvas image data object of a pixel's data. Pixels are
// relative to the lower left corner.
function pixelIndex(imageData, x, y, offset)
{
    return 4 * ((imageData.height - 1 - y) * imageData.width + x) + offset;
}

// Set a dim x dim pixel block in a canvas image data object, relative to the
// lower left corner.
function setPixelBlock(imageData, dim, x, y, w, h, offset, value)
{
    for (var i = x; i < Math.min(x + dim, w); i++) {
        for (var j = y; j < Math.min(y + dim, h); j++)
            imageData.data[pixelIndex(imageData, i, j, offset)] = value;
    }
}

function setPixelBlockToSky(imageData, dim, x, y, w, h)
{
    setPixelBlock(imageData, dim, x, y, w, h, 0, 100);
    setPixelBlock(imageData, dim, x, y, w, h, 1, 150);
    setPixelBlock(imageData, dim, x, y, w, h, 2, 255);
    setPixelBlock(imageData, dim, x, y, w, h, 3, 255);
}

function isPixelSky(imageData, x, y)
{
    var index = pixelIndex(imageData, x, y, 0);
    return imageData.data[index] == 100 &&
           imageData.data[index + 1] == 150 &&
           imageData.data[index + 2] == 255;
}

function copyImageData(imageData, srcIndex, tgtIndex, numPixels)
{
    for (var i = 0; i < numPixels * 4; i++)
        imageData.data[tgtIndex + i] = imageData.data[srcIndex + i];
}

function copyImageDataBackwards(imageData, srcIndex, tgtIndex, numPixels)
{
    for (var i = numPixels * 4 - 1; i >= 0; i--)
        imageData.data[tgtIndex + i] = imageData.data[srcIndex + i];
}

function clearImageData(imageData, index, numPixels)
{
    for (var i = 0; i < numPixels * 4; i++)
        imageData.data[index + i] = 0;
}

function displaceImageData(imageData, displaceX, displaceY)
{
    var srcX = (displaceX >= 0) ? 0 : -displaceX;
    var tgtX = (displaceX >= 0) ? displaceX : 0;
    var numX = imageData.width - Math.abs(displaceX);

    if (displaceY == 0) {
        if (displaceX > 0) {
            for (var y = 0; y < imageData.height; y++) {
                var srcIndex = pixelIndex(imageData, srcX, y, 0);
                var tgtIndex = pixelIndex(imageData, tgtX, y, 0);
                copyImageDataBackwards(imageData, srcIndex, tgtIndex, numX);
            }
        } else {
            for (var y = 0; y < imageData.height; y++) {
                var srcIndex = pixelIndex(imageData, srcX, y, 0);
                var tgtIndex = pixelIndex(imageData, tgtX, y, 0);
                copyImageData(imageData, srcIndex, tgtIndex, numX);
            }
        }
    } else if (displaceY > 0) {
        for (var y = imageData.height - 1; y >= displaceY; y--) {
            var srcIndex = pixelIndex(imageData, srcX, y - displaceY, 0);
            var tgtIndex = pixelIndex(imageData, tgtX, y, 0);
            copyImageData(imageData, srcIndex, tgtIndex, numX);
        }
        clearImageData(imageData, pixelIndex(imageData, 0, displaceY, 0), displaceY * imageData.width);
    } else {
        for (var y = 0; y < imageData.height + displaceY; y++) {
            var srcIndex = pixelIndex(imageData, srcX, y - displaceY, 0);
            var tgtIndex = pixelIndex(imageData, tgtX, y, 0);
            copyImageData(imageData, srcIndex, tgtIndex, numX);
        }
        clearImageData(imageData, 0, -displaceY * imageData.width);
    }

    if (displaceX != 0) {
        for (var y = 0; y < imageData.height; y++) {
            var index = pixelIndex(imageData, (displaceX > 0) ? 0 : imageData.width + displaceX, y, 0);
            clearImageData(imageData, index, Math.abs(displaceX));
        }
    }
}

function DirtyRegion(x, y, w, h)
{
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;

    this.nextX = x;
    this.nextY = y;
    this.nextDim = 8;

    // Whether any parts of this region were painted prior to the last screen pan.
    this.displaced = false;
}

function updatePointView()
{
    if (!viewInfo)
        return;

    var startTime = new Date;

    var imageData = viewInfo.imageData;

    var direction = viewInfo.tmpDirection;
    var newCoords = viewInfo.tmpCoords;
    var color = viewInfo.tmpColor;

    var radiansPerPixel = viewInfo.view.radiansPerPixel(imageData.width);

    if (viewInfo.newView) {
        var displaceX = Math.round((viewInfo.newView.yaw - viewInfo.view.yaw) / radiansPerPixel);
        var displaceY = Math.round((viewInfo.view.pitch - viewInfo.newView.pitch) / radiansPerPixel);
        if (displaceX || displaceY) {
            displaceImageData(imageData, displaceX, displaceY);

            viewInfo.panLast = startTime;
            if (!viewInfo.panStart)
                viewInfo.panStart = startTime;

            for (var i = 0; i < viewInfo.dirty.length; i++) {
                var dirty = viewInfo.dirty[i];

                dirty.displaced = true;
                dirty.x = clamp(dirty.x + displaceX, 0, imageData.width - 1);
                dirty.y = clamp(dirty.y + displaceY, 0, imageData.height - 1);
                dirty.w = clamp(dirty.w + displaceX, 0, imageData.width - 1);
                dirty.h = clamp(dirty.h + displaceY, 0, imageData.height - 1);
                dirty.nextX = clamp(dirty.nextX + displaceX, 0, imageData.width - 1);
                dirty.nextY = clamp(dirty.nextY + displaceY, 0, imageData.height - 1);
            }

            viewInfo.leftDirty = clamp(viewInfo.leftDirty + displaceX, 0, imageData.width - 1);
            viewInfo.rightDirty = clamp(viewInfo.rightDirty - displaceX, 0, imageData.width - 1);
            viewInfo.bottomDirty = clamp(viewInfo.bottomDirty + displaceY, 0, imageData.height - 1);
            viewInfo.topDirty = clamp(viewInfo.topDirty - displaceY, 0, imageData.height - 1);
 
            viewInfo.view = viewInfo.newView;
        }
        viewInfo.newView = null;
    }

    if (viewInfo.panStart &&
        (startTime - viewInfo.panStart >= 250 ||
         startTime - viewInfo.panLast >= 125))
    {
        var topd = imageData.height - viewInfo.topDirty;
        var rightd = imageData.width - viewInfo.rightDirty;

        if (viewInfo.bottomDirty)
            viewInfo.dirty.push(new DirtyRegion(0, 0, imageData.width, viewInfo.bottomDirty + 2));
        if (viewInfo.topDirty)
            viewInfo.dirty.push(new DirtyRegion(0, topd - 1, imageData.width, imageData.height));
        if (viewInfo.leftDirty)
            viewInfo.dirty.push(new DirtyRegion(0, viewInfo.bottomDirty - 1, viewInfo.leftDirty + 2, topd + 2));
        if (viewInfo.rightDirty)
            viewInfo.dirty.push(new DirtyRegion(rightd - 1, viewInfo.bottomDirty - 1, imageData.width, topd + 2));

        viewInfo.leftDirty = 0;
        viewInfo.rightDirty = 0;
        viewInfo.bottomDirty = 0;
        viewInfo.topDirty = 0;
        viewInfo.panStart = null;
        viewInfo.panLast = null;
    }

    // Make sure we render at least one pixel every time we update the view.
    var firstPixel = true;

    outerLoop:
    while (viewInfo.dirty.length) {
        var besti = 0;
        for (var i = 0; i < viewInfo.dirty.length; i++) {
            if (viewInfo.dirty[i].nextDim > viewInfo.dirty[besti].nextDim)
                besti = i;
        }
        var dirty = viewInfo.dirty[besti];
        viewInfo.dirty[besti] = viewInfo.dirty[viewInfo.dirty.length - 1];
        viewInfo.dirty.pop();
        for (var dim = dirty.nextDim; dim >= 1; dim /= 2) {
            var i = dirty.nextX;
            dirty.nextX = dirty.x;
            for (; i < dirty.w; i += dim) {
                var distanceRadians = viewInfo.view.yaw + (imageData.width/2 - i) * radiansPerPixel;
                direction.lon = Math.cos(distanceRadians) * 1000 / viewInfo.distances.lon;
                direction.lat = Math.sin(distanceRadians) * 1000 / viewInfo.distances.lat;
                newCoords.copyFrom(viewInfo.coords);

                var j = dirty.nextY;
                dirty.nextY = dirty.y;

                heightLoop:
                for (; j < dirty.h; j += dim) {
                    if (dim != 8 && !dirty.displaced) {
                        if ((i & ((dim << 1) - 1)) == 0 && (j & ((dim << 1) - 1)) == 0) {
                            // This pixel was already rendered at a coarser dimension.
                            // If the pixel is sky then everything above it has
                            // already been rendered as sky.
                            if (isPixelSky(imageData, i, j))
                                break heightLoop;
                            continue;
                        }
                    }

                    if (firstPixel) {
                        firstPixel = false;
                    } else {
                        // Check if we have exceeded our time budget for this frame.
                        var timeDiff = new Date - startTime;
                        if (timeDiff >= 25) {
                            dirty.nextX = i;
                            dirty.nextY = j;
                            dirty.nextDim = dim;
                            viewInfo.dirty.push(dirty);
                            break outerLoop;
                        }
                    }

                    direction.elv = Math.sin(viewInfo.view.pitch + (j - imageData.height/2) * radiansPerPixel) * 1000;
                    newCoords.elv = newElevation(viewInfo.coords, newCoords, direction);

                    if (!raytrace(newCoords, direction)) {
                        // The ray did not intersect the terrain. None of the remaining
                        // pixels in this column will intersect the terrain, either.
                        for (; j < dirty.h; j += dim)
                            setPixelBlockToSky(imageData, dim, i, j, dirty.w, dirty.h);
                        break;
                    }

                    fillColorData(newCoords, color);

                    var distance = distanceBetween(viewInfo.coords, newCoords, viewInfo.distances);
                    var weight = clamp(1 - Math.pow(Math.E, -.0001 * distance), 0, .7);

                    var nr = 127 * weight + color.r * (1 - weight);
                    var ng = 127 * weight + color.g * (1 - weight);
                    var nb = 127 * weight + color.b * (1 - weight);

                    var v = 1; // (distance < 10000) ? (10000 - distance) / 10000 : .10;
                    setPixelBlock(imageData, dim, i, j, dirty.w, dirty.h, 0, nr | 0);
                    setPixelBlock(imageData, dim, i, j, dirty.w, dirty.h, 1, ng | 0);
                    setPixelBlock(imageData, dim, i, j, dirty.w, dirty.h, 2, nb | 0);
                    setPixelBlock(imageData, dim, i, j, dirty.w, dirty.h, 3, 255);
                }
            }
        }
    }

    viewInfo.ctx.putImageData(imageData, 0, 0);

    if (viewInfo.dirty.length || viewInfo.panStart)
        setNeedUpdateScene();
}

function drawView(coords, view)
{
    overheadViewCanvas.style.display = "none";
    pointViewCanvas.style.display = "inline";

    var width = window.innerWidth;
    var height = window.innerHeight;

    pointViewCanvas.width = width;
    pointViewCanvas.height = height;

    var ctx = pointViewCanvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.mozImageSmoothingEnabled = false;
    ctx.webkitImageSmoothingEnabled = false;
    ctx.msImageSmoothingEnabled = false;

    var imageData = ctx.createImageData(width, height);

    var newCoords = new Coordinate();
    newCoords.copyFrom(coords);

    viewInfo = {
        ctx: ctx,
        imageData: imageData,
        coords: newCoords,
        view: view,
        newView: null,
        distances: latlonDistances(newCoords.lat),

        // Dirty regions that are in the process of being rendered.
        dirty : [ new DirtyRegion(0, 0, width, height) ],

        // Any dirty regions on the borders of the canvas which have not been rendered yet.
        leftDirty: 0,
        rightDirty: 0,
        topDirty: 0,
        bottomDirty: 0,

        // The last time a pan started since any dirty region on the border was created.
        panStart: null,

        // The last time a pan occurred.
        panLast: null,

        tmpCoords: new Coordinate(),
        tmpDirection: new Coordinate(),
        tmpColor: {
            r: 0,
            g: 0,
            b: 0
        }
    };

    updatePointView();
}

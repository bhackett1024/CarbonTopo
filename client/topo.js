/* Copyright 2015-2016 Brian Hackett. Released under the MIT license. */

"use strict";

var overheadViewCanvas = document.getElementById("overheadViewCanvas");
var pointViewCanvas = document.getElementById("pointViewCanvas");

var minZoom = 1;
var maxZoom = 5;
var overheadView = new OverheadAngle(46.91, -121.75, 1);
var tileDirectory = "tiles";

// All tiles which are currently loaded.
var allTiles = {};

var tileD = 2.5 / 60;

function findTile(coords)
{
    var leftD = Math.floor(coords.lon / tileD) * tileD;
    var topD = Math.ceil(coords.lat / tileD) * tileD;
    var file = tileFile(tileDirectory, leftD, topD, ".zip");

    if (file in allTiles)
        return allTiles[file];

    var tile = {
        leftD: leftD,
        topD: topD,
        image: null,
        imageData: null,
        elevationBuffer: null,
        elevationData: null,
        invalid: false
    };

    allTiles[file] = tile;

    var xhr = new XMLHttpRequest();
    xhr.open('GET', file, true);
    xhr.responseType = 'arraybuffer';
    xhr.onload = function(e) {
        if (this.status != 200) {
            tile.invalid = true;
            return;
        }

        var zip = new JSZip();
        zip.load(this.response);

        tile.elevationBuffer = zip.file(".elv").asArrayBuffer();

        var jpegData = zip.file(".jpg").asUint8Array();
        var blob = new Blob( [ jpegData ], { type: "image/jpeg" } );
        var imageUrl = window.URL.createObjectURL(blob);

        tile.image = new Image();
        tile.image.src = imageUrl;

        setNeedUpdateScene();
    }
    try {
        xhr.send();
    } catch (e) {
        tile.invalid = true;
    }

    return tile;
}

var colorList = [
    { r: 0, g: 0, b: 0 },        // black
    { r: 255, g: 255, b: 255 },  // white
    { r: 200, g: 255, b: 255 },  // blue
    { r: 230, g: 255, b: 220 },  // green
    { r: 240, g: 150, b: 150 }   // brown
];

/*
function cleanupTile(tile)
{
    if (tile.cleaned || !tile.canvas)
        return;
    tile.cleaned = true;

    var oldImageData = tile.imageData;
    var width = tile.canvas.width;
    var height = tile.canvas.height;

    var context = tile.canvas.getContext('2d');
    var imageData = context.createImageData(width, height);

    for (var i = 0; i < width * height; i++) {
        var r = oldImageData.data[i * 4];
        var g = oldImageData.data[i * 4 + 1];
        var b = oldImageData.data[i * 4 + 2];
        var best = 0;
        var bestd = r + g + b;
        for (var j = 1; j < colorList.length; j++) {
            var color = colorList[j];
            var dist = Math.abs(r - color.r) + Math.abs(g - color.g) + Math.abs(b - color.b);
            if (dist < bestd) {
                best = j;
                bestd = dist;
            }
        }

        imageData.data[i * 4] = colorList[best].r;
        imageData.data[i * 4 + 1] = colorList[best].g;
        imageData.data[i * 4 + 2] = colorList[best].b;
        imageData.data[i * 4 + 3] = 255;
    }

    context.putImageData(imageData, 0, 0);
}
*/

function computeDegreesPerPixel(centerLat, zoomFactor)
{
    // With a zoom factor of 1, the display should be roughly 1:1 with the
    // underlying tile images. For now, bake in the behavior of tiler.js that
    // 2.5 minute tiles are all 2000 pixels high.
    var lat = zoomFactor * tileD / 2000;
    var distances = latlonDistances(centerLat);
    var lon = lat / (distances.lon / distances.lat);
    return new Coordinate(lat, lon);
}

// When the point of view display is active, this has information about the
// view. Otherwise, this is null.
var viewInfo = null;

function updateOverheadView() {
    if (viewInfo)
        return;

    var width = window.innerWidth;
    var height = window.innerHeight;

    overheadViewCanvas.width = width;
    overheadViewCanvas.height = height;

    // At any given time, an equirectangular projection is used to arrange all
    // displayed tiles. This is a simple projection that uses a constant amount
    // of space for a given delta in latitude or longitude, anywhere on the
    // projection. Using this is fine for small scale maps like the ones we are
    // interested in. Using the same spacing regardless of our location would
    // cause some areas to become grossly distorted, however, so we compute the
    // latitude and longitude scales based on the current center of the map.

    var degreesPerPixel = computeDegreesPerPixel(overheadView.centerLat, overheadView.zoom);

    var tileWidthP = tileD / degreesPerPixel.lon;
    var tileHeightP = tileD / degreesPerPixel.lat;

    var context = overheadViewCanvas.getContext('2d');
    context.fillStyle = "rgb(0,0,0)";
    context.fillRect(0, 0, width, height);

    context.fillStyle = "rgb(255,0,0)";

    var leftD = (overheadView.centerLon - degreesPerPixel.lon * width / 2);
    var rightD = (overheadView.centerLon + degreesPerPixel.lon * width / 2);
    var topD = (overheadView.centerLat + degreesPerPixel.lat * height / 2);
    var bottomD = (overheadView.centerLat - degreesPerPixel.lat * height / 2);

    var coords = new Coordinate();

    for (coords.lon = leftD; coords.lon < rightD + tileD; coords.lon += tileD) {
        for (coords.lat = bottomD; coords.lat < topD + tileD; coords.lat += tileD) {
            var tile = findTile(coords);

            var leftP = width / 2 + (tile.leftD - overheadView.centerLon) / degreesPerPixel.lon;
            var rightP = leftP + tileWidthP;
            var topP = height / 2 + (overheadView.centerLat - tile.topD) / degreesPerPixel.lat;
            var bottomP = topP + tileHeightP;

            leftP = Math.floor(leftP);
            rightP = Math.ceil(rightP);
            topP = Math.floor(topP);
            bottomP = Math.ceil(bottomP);

            if (tile.image) {
                /*
                  if (tileHeightP > 1500)
                  cleanupTile(tile);
                */
                context.drawImage(tile.image, leftP, topP, rightP - leftP, bottomP - topP);
            } else if (!tile.invalid) {
                context.fillRect(leftP, topP, rightP - leftP, bottomP - topP);
            }
        }
    }
}

function screenCoordinatesToLatlong(view, x, y) {
    // Transform the coordinates so they are relative to the center of the canvas.
    x -= window.innerWidth / 2;
    y = (window.innerHeight - y) - window.innerHeight / 2;

    var degreesPerPixel = computeDegreesPerPixel(view.centerLat, view.zoom);

    return new Coordinate(view.centerLat + y * degreesPerPixel.lat,
                          view.centerLon + x * degreesPerPixel.lon);
}

// The elevation data for a tile is laid out using increasingly fine grained
// elevation maxima which cover portions of the tile. The first entry in the
// elevation data is the maximum elevation for the entire tile. The following
// four entries describe the maximum elevations of each quadrant of the entire
// tile, the following 16 entries describe the maximum elevations of each
// quadrant of those quadrants, and so forth.
//
// Indexing of the first few layers is shown before; on the left is indexing
// relative to the start of the layer, on the right is absolute indexing.
//
// 0            0
//
// 1 3          2 4
// 0 2          1 3
//
// 5 7 13 15    10 12 18 20
// 4 6 12 14    9  11 17 19
// 1 3 9  11    6  8  14 16
// 0 2 8  10    5  7  13 15
//
// And so on down to a final layer of 256x256 entries which is not subdivided.
//
// This scheme is set up so that going from an entry in one layer |n| to one of
// its quadrants q (from [0,3]) is merely n*4+1+q.

var numQuadrants = 1 + 2*2 + 4*4 + 8*8 + 16*16 + 32*32 + 64*64 + 128*128;

// For an index relative to the final layer [0,256*256), compute its height
// in that layer's grid [0,255].
function elevationIndexToHeight(index) {
    var height = 0;
    for (var shift = 2; shift <= 16; shift += 2) {
        var q = (index & ((1 << shift) - 1)) >> (shift - 2);
        if (q == 1 || q == 3)
            height += 1 << ((shift >> 1) - 1);
    }
    return height;
}

// For an index relative to the final layer [0,256*256), compute its width
// in that layer's grid [0,255].
function elevationIndexToWidth(index) {
    var width = 0;
    for (var shift = 2; shift <= 16; shift += 2) {
        var q = (index & ((1 << shift) - 1)) >> (shift - 2);
        if (q >= 2)
            width += 1 << ((shift >> 1) - 1);
    }
    return width;
}

// Compute the inverse of elevationIndexToHeight/elevationIndexToWidth.
function elevationIndexFromHeightAndWidth(height, width) {
    var index = 0;
    for (var shift = 0; shift <= 7; shift++) {
        if ((height >> shift) & 1)
            index += 1 << (shift << 1);
        if ((width >> shift) & 1)
            index += 1 << ((shift << 1) + 1);
    }
    return index;
}

function computeElevationData(tile) {
    var last = 0;
    var index = 0;

    function decode() {
        var diff = 0;
        var shift = 0;
        while (true) {
            var byte = bufferContents[index++];
            if (byte != 0xff) {
                diff |= ((byte - 127) << shift);
                break;
            }
            byte = bufferContents[index++];
            diff |= (byte << shift);
            shift += 8;
        }

        last += diff;
        return last;
    }

    if (!tile.elevationBuffer)
        throw "Missing elevation buffer";

    var bufferContents = new Uint8Array(tile.elevationBuffer);
    tile.elevationData = new Uint16Array(numQuadrants + 256*256);

    for (var height = 0; height < 256; height++) {
        for (var width = 0; width < 256; width++) {
            var i = elevationIndexFromHeightAndWidth(height, width);
            tile.elevationData[numQuadrants + i] = decode();
        }
    }

    for (var i = numQuadrants - 1; i >= 0; i--) {
        tile.elevationData[i] =
            Math.max(tile.elevationData[i * 4 + 1],
                     tile.elevationData[i * 4 + 2],
                     tile.elevationData[i * 4 + 3],
                     tile.elevationData[i * 4 + 4]);
    }
}

function computeElevation(coords, tile)
{
    if (!tile) {
        tile = findTile(coords);
        if (!tile.elevationData)
            computeElevationData(tile);
    }

    var height = Math.round((coords.lat - (tile.topD - tileD)) / tileD * 255);
    var width = Math.round((coords.lon - tile.leftD) / tileD * 255);

    var index = elevationIndexFromHeightAndWidth(height, width);
    return tile.elevationData[numQuadrants + index];
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
        if (!tile.elevationData)
            computeElevationData(tile);

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
                if (!tile.elevationData)
                    computeElevationData(tile);

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

    /*
    if (displaceX != 0) {
        var index = pixelIndex(imageData, (displaceX > 0) ? 0 : imageData.width + displaceX, 0, 0);
        var stride = imageData.width * 4;
        for (var y = 0; y < imageData.height; y++, index += stride)
            clearImageData(imageData, index, Math.abs(displaceX));
    }
    */

    if (displaceX != 0) {
        for (var y = 0; y < imageData.height; y++) {
            var index = pixelIndex(imageData, (displaceX > 0) ? 0 : imageData.width + displaceX, y, 0);
            clearImageData(imageData, index, Math.abs(displaceX));
        }
    }
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

var requestedFrame = false;
function requestFrame() {
    if (!requestedFrame) {
        requestedFrame = true;
        requestAnimationFrame(animate);
    }
}

var needUpdateScene = true;
function setNeedUpdateScene() {
    if (!needUpdateScene) {
        needUpdateScene = true;
        requestFrame();
    }
}

function resizeEvent() {
    if (viewInfo)
        drawView(rmbCoords, viewInfo.view);
    setNeedUpdateScene();
}
window.addEventListener('resize', resizeEvent);

var rmbCoords = null;

function clickEvent(ev) {
    var coords = screenCoordinatesToLatlong(overheadView, ev.clientX, ev.clientY);
    var elevation = computeElevation(coords);
    var feetPerMeter = 3.28084;

    var color = {
        r:0,
        b:0,
        g:0
    };
    fillColorData(coords, color);

    console.log("EVENT " + coords.lon + " " + coords.lat + " ELEVATION " +
                Math.round(elevation * feetPerMeter) + " R " + color.r + " G " + color.g + " B " + color.b);
}
window.addEventListener('click', clickEvent);

function wheelEvent(ev) {
    if (!ev.deltaY)
        return;

    if (viewInfo) {
        var newRadius = clamp(viewInfo.view.radius * (1 + ev.deltaY / 50), 0.001, .5);
        if (newRadius != viewInfo.view.radius) {
            viewInfo.view.radius = newRadius;
            drawView(rmbCoords, viewInfo.view);
        }
    } else {
        var newZoomFactor = overheadView.zoom + ev.deltaY / 5;
        newZoomFactor = Math.max(newZoomFactor, minZoom);
        newZoomFactor = Math.min(newZoomFactor, maxZoom);

        var updatedView = new OverheadAngle();
        updatedView.copyFrom(overheadView);
        updatedView.zoom = newZoomFactor;

        // Adjust the center so that the location under the mouse will remain under
        // the mouse after zooming.
        var oldCoords = screenCoordinatesToLatlong(overheadView, ev.clientX, ev.clientY);
        var newCoords = screenCoordinatesToLatlong(updatedView, ev.clientX, ev.clientY);
        overheadView.centerLon += oldCoords.lon - newCoords.lon;
        overheadView.centerLat += oldCoords.lat - newCoords.lat;
        overheadView.zoom = newZoomFactor;
    }

    setNeedUpdateScene();
}
window.addEventListener('wheel', wheelEvent);

// Information about the screen when we started dragging.
var startDrag = null;

function mousedownEvent(ev) {
    if (ev.button == 2)
        rmbCoords = screenCoordinatesToLatlong(overheadView, ev.clientX, ev.clientY);

    startDrag = {
        x: ev.clientX,
        y: ev.clientY,
        overheadView: null,
        pointView: null
    };

    if (viewInfo) {
        startDrag.pointView = new ViewAngle();
        startDrag.pointView.copyFrom(viewInfo.view);
    } else {
        startDrag.overheadView = new OverheadAngle();
        startDrag.overheadView.copyFrom(overheadView);
    }
}
window.addEventListener('mousedown', mousedownEvent);

function mouseupEvent(ev) {
    startDrag = null;
}
window.addEventListener('mouseup', mouseupEvent);

function mousemoveEvent(ev) {
    if (ev.button != 0 || ev.buttons == 0 || !startDrag)
        return;

    // Adjust the current view so that the location under the mouse will remain
    // under the mouse after dragging.
    if (startDrag.overheadView) {
        var startCoords = screenCoordinatesToLatlong(startDrag.overheadView, startDrag.x, startDrag.y);
        var newCoords = screenCoordinatesToLatlong(overheadView, ev.clientX, ev.clientY);
        overheadView.centerLon += startCoords.lon - newCoords.lon;
        overheadView.centerLat += startCoords.lat - newCoords.lat;
    } else {
        var radiansPerPixel = startDrag.pointView.radiansPerPixel(viewInfo.imageData.width);
        var newView = new ViewAngle();
        newView.radius = startDrag.pointView.radius;
        newView.yaw = startDrag.pointView.yaw - (startDrag.x - ev.clientX) * radiansPerPixel;
        newView.pitch = clamp(startDrag.pointView.pitch - (startDrag.y - ev.clientY) * radiansPerPixel, -.75, .75);
        viewInfo.newView = newView;
    }

    setNeedUpdateScene();
}
window.addEventListener('mousemove', mousemoveEvent);

function drawViewCallback(key, options) {
    var elevation = computeElevation(rmbCoords);
    var feetPerMeter = 3.28084;
    console.log("RMB " + rmbCoords.lon + " " + rmbCoords.lat + " ELEVATION " +
                Math.round(elevation * feetPerMeter));

    rmbCoords.elv = elevation + 10;
    drawView(rmbCoords, new ViewAngle(0, 0, .5));
}

function drawViewVisibleCallback() {
    return !viewInfo;
}

function exitViewCallback(key, options) {
    overheadViewCanvas.style.display = "inline";
    pointViewCanvas.style.display = "none";
    viewInfo = null;
}

function exitViewVisibleCallback() {
    return !!viewInfo;
}

$(function(){
    $.contextMenu("destroy");
    $.contextMenu({
        selector: 'canvas', //'#renderer-canvas', 
        items: {
	    "view": { name: "Draw View", callback: drawViewCallback, visible: drawViewVisibleCallback },
	    "exit": { name: "Exit View", callback: exitViewCallback, visible: exitViewVisibleCallback }
        }
    });
});

var lastFrameTime = +(new Date);
animate();
function animate() {
    requestedFrame = false;

    var time = +(new Date);
    var timeDiff = time - lastFrameTime;
    lastFrameTime = time;

    if (needUpdateScene) {
        needUpdateScene = false;
        updateOverheadView();
        updatePointView();
    }
}

/* -*- indent-tabs-mode: nil; js-indent-level: 4; js-indent-level: 4 -*- */
/* Copyright 2015-2017 Brian Hackett. Released under the MIT license. */

"use strict";

// Routines related to elevation information.
//
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

    var pointData = new Uint16Array(256 * 256);

    var p = 0;
    for (var height = 0; height < 256; height++) {
        for (var width = 0; width < 256; width++, p++) {
            var i = elevationIndexFromHeightAndWidth(height, width);
            tile.elevationData[numQuadrants + i] = pointData[p] = decode();
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
    if (!tile)
        tile = findTile(coords);

    var height = Math.round((coords.lat - (tile.topD - tileD)) / tileD * 255);
    var width = Math.round((coords.lon - tile.leftD) / tileD * 255);

    var index = elevationIndexFromHeightAndWidth(height, width);
    return tile.elevationData[numQuadrants + index];
}

var renderedTileHeight = 1000;
var renderCanvas = null;
var renderContext = null;

function renderTileData(tile)
{
    var pointData = computeElevationData(tile);

    var distances = latlonDistances(tile.topD);
    var height = renderedTileHeight;
    var width = (height * (distances.lon / distances.lat)) | 0;

    if (!renderCanvas) {
        renderCanvas = document.createElement('canvas');
        renderContext = renderCanvas.getContext('2d', { alpha: false });
    }

    renderCanvas.height = height;
    renderCanvas.width = width;

    var imageData = renderContext.createImageData(width, height);
    var data = imageData.data;

    var floor = 5000;
    var ceiling = 13000;

    var what = 0;

    var p = 0;
    for (var h = 0; h < height; h++) {
        for (var w = 0; w < width; w++, p += 4) {
            var lat = tile.topD - tileD + ((height - h) / height * tileD);
            var lon = tile.leftD + (w / width * tileD);
            var coord = new Coordinate(lat, lon);

            var elevation = computeElevation(coord, tile) * 3.28084;
            var fraction = (clamp(elevation, floor, ceiling) - floor) / (ceiling - floor);

            data[p] = fraction * 256;
            data[p + 1] = 0;
            data[p + 2] = 0;
            data[p + 3] = 255;
        }
    }

    renderContext.putImageData(imageData, 0, 0);
    return renderCanvas.toDataURL();
}

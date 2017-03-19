/* -*- indent-tabs-mode: nil; js-indent-level: 4; js-indent-level: 4 -*- */
/* Copyright 2015-2017 Brian Hackett. Released under the MIT license. */

"use strict";

// Routines related to tiles and elevation information.
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

function Tile(leftD, topD)
{
    this.leftD = leftD;
    this.topD = topD;
    this.image = null;
    this.imageData = null;
    this.fillStyle = "rgb(0,0,0)";

    // Elevation tree as described above.
    this.elevationTree = null;

    // Elevation for the 256x256 points in the matrix, in row-major order
    // starting at the lower left corner.
    this.elevationData = null;
}

Tile.prototype.getElevationData = function(h, w) {
    return this.elevationData[h * 256 + w];
}

Tile.prototype.getElevationCoordinate = function(h, w, coords) {
    coords.lat = this.topD - tileD + (h / 255) * tileD;
    coords.lon = this.leftD + (w / 255) * tileD;
    coords.elv = this.getElevationData(h, w);
}

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

function computeElevationData(tile, elevationBuffer) {
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

    var bufferContents = new Uint8Array(elevationBuffer);
    tile.elevationData = new Uint16Array(256*256);
    tile.elevationTree = new Uint16Array(numQuadrants + 256*256);

    for (var h = 0; h < 256; h++) {
        for (var w = 0; w < 256; w++) {
            var i = elevationIndexFromHeightAndWidth(h, w);
            tile.elevationTree[numQuadrants + i] = tile.elevationData[h*256+w] = decode();
        }
    }

    for (var i = numQuadrants - 1; i >= 0; i--) {
        tile.elevationTree[i] =
            Math.max(tile.elevationTree[i * 4 + 1],
                     tile.elevationTree[i * 4 + 2],
                     tile.elevationTree[i * 4 + 3],
                     tile.elevationTree[i * 4 + 4]);
    }
}

function computeElevation(coords, tile)
{
    if (!tile)
        tile = findTile(coords);

    var h = Math.round((coords.lat - (tile.topD - tileD)) / tileD * 255);
    var w = Math.round((coords.lon - tile.leftD) / tileD * 255);
    return tile.getElevationData(h, w);
}

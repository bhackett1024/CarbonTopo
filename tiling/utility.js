/* Copyright 2015-2017 Brian Hackett. Released under the MIT license. */

// Functionality shared between different tile processors.

var tmpFile = "/tmp/tiler" + ((Math.random() * 1000000) | 0);
var tmpTxt = tmpFile + ".txt";

function parseDegrees(s)
{
    var arr = /(\d+)d([\d ]+)\'([\d\. ]+)\"([WNSE])/.exec(s);
    if (!arr) {
	if (!/[-]?\d+\.\d+/.test(s))
            throw "Could not parse degrees: " + s;
	return +s;
    }
    var abs = +arr[1] + (+arr[2] / 60) + (+arr[3] / (60 * 60));
    return (arr[4] == 'E' || arr[4] == 'N') ? abs : -abs;
}

function parseBoundary(sourceInfo)
{
    var upperLeft = /Upper Left.*?\(.*?\) \((.*?), (.*?)\)/.exec(sourceInfo)
                 || /Upper Left.*?\((.*?),[ ]*(.*?)\)/.exec(sourceInfo);
    var lowerRight = /Lower Right.*?\(.*?\) \((.*?), (.*?)\)/.exec(sourceInfo)
                  || /Lower Right.*?\((.*?),[ ]*(.*?)\)/.exec(sourceInfo);
    return {
        left: parseDegrees(upperLeft[1]),
        top: parseDegrees(upperLeft[2]),
        right: parseDegrees(lowerRight[1]),
        bottom: parseDegrees(lowerRight[2])
    };
}

function getTilePoint(leftD, bottomD, point)
{
    var h = Math.round((point.lat - bottomD) / tileD * 255);
    var w = Math.round((point.lon - leftD) / tileD * 255);
    return { h:h, w:w };
}

function TileIndex()
{
    this.tiles = {};
}

TileIndex.prototype.getTile = function(leftD, bottomD, initialize)
{
    var key = leftD + "::" + bottomD;
    if (key in this.tiles)
	return this.tiles[key];
    var tile = this.tiles[key] = { leftD: leftD, bottomD: bottomD, features: [] };
    initialize(tile);
    return tile;
}

TileIndex.prototype.getAllTiles = function()
{
    var res = [];
    for (key in this.tiles)
	res.push(this.tiles[key]);
    return res;
}

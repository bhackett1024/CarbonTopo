/* -*- indent-tabs-mode: nil; js-indent-level: 4; js-indent-level: 4 -*- */
/* Copyright 2015-2017 Brian Hackett. Released under the MIT license. */

"use strict";

///////////////////////////////////////////////////////////////////////////////
// Coordinates
///////////////////////////////////////////////////////////////////////////////

// Coordinate latitude/longitude are in degrees, elevations are in meters.
function Coordinate(lat, lon, elevation)
{
    this.initialize(lat, lon, elevation);
}

Coordinate.prototype.copyFrom = function(other) {
    this.initialize(other.lat, other.lon, other.elv);
}

Coordinate.prototype.initialize = function(lat, lon, elevation) {
    this.lat = lat || 0;
    this.lon = lon || 0;
    this.elv = elevation || 0;
}

Coordinate.prototype.interpolate = function(first, second, fraction) {
    this.lat = first.lat * fraction + second.lat * (1 - fraction);
    this.lon = first.lon * fraction + second.lon * (1 - fraction);
    this.elv = first.elv * fraction + second.elv * (1 - fraction);
}

Coordinate.displace = function(base, lat, lon) {
    return new Coordinate(base.lat + lat, base.lon + lon);
}

Coordinate.prototype.toString = function() {
    return "(" + this.lat + "," + this.lon + "," + this.elv + ")";
}

///////////////////////////////////////////////////////////////////////////////
// Binary Data
///////////////////////////////////////////////////////////////////////////////

function Encoder()
{
    this.data = [];
}

Encoder.prototype.toTypedArray = function()
{
    return new Uint8Array(this.data);
}

Encoder.prototype.writeByte = function(byte)
{
    this.data.push(byte);
}

Encoder.prototype.writeTypedArray = function(data)
{
    for (var i = 0; i < data.length; i++)
        this.writeByte(data[i]);
}

function Decoder(data)
{
    this.reset(data);
}

Decoder.prototype.reset = function(data)
{
    assert(!data || data instanceof Uint8Array);
    this.data = data;
    this.pos = 0;
}

Decoder.prototype.readByte = function()
{
    return this.data[this.pos++];
}

Decoder.prototype.finished = function()
{
    return !this.data || this.pos == this.data.length;
}

Encoder.prototype.writeNumber = function(number)
{
    assert(number === number | 0);

    while (true) {
        if (number <= 127 && number >= -127) {
            this.writeByte(127 + number);
            break;
        } else {
            this.writeByte(0xff);
            this.writeByte(number & 0xff);
            number >>= 8;
        }
    }
}

Decoder.prototype.readNumber = function()
{
    var number = 0;
    var shift = 0;
    while (true) {
        var byte = this.readByte();
        if (byte != 0xff) {
            number |= ((byte - 127) << shift);
            break;
        }
        byte = this.readByte();
        number |= (byte << shift);
        shift += 8;
    }
    return number;
}

Encoder.prototype.writeString = function(str)
{
    for (var i = 0; i < str.length; i++) {
        var code = str.charCodeAt(i);
        assert(code >= 1 && code <= 255);
        this.writeByte(code);
    }
    this.writeByte(0);
}

Decoder.prototype.readString = function()
{
    var str = "";
    while (true) {
        var code = this.readByte();
        if (!code)
            break;
        str += String.fromCharCode(code);
    }
    return str;
}

// Tags in encoded hydrography data.
var TAG_WATERBODY = 0;
var TAG_WATERBODY_INTERIOR = 1;
var TAG_WATERBODY_SHORELINE = 2;
var TAG_STREAM = 3;

///////////////////////////////////////////////////////////////////////////////
// Other Stuff
///////////////////////////////////////////////////////////////////////////////

function clamp(n, min, max)
{
    return Math.min(Math.max(n, min), max);
}

function degreesToRadians(degrees) {
    return degrees * Math.PI / 180;
}

function latlonDistances(latDegrees) {
    // Compute the distance of a degree of longitude or latitude in meters,
    // using the WGS 84 ellipsoid.
    var a = 6378137.0;
    var b = 6356752.3142;
    var e2 = (a*a - b*b) / (a*a);

    var latRadians = degreesToRadians(latDegrees);
    var cosLat = Math.cos(latRadians);
    var sinLat = Math.sin(latRadians);

    var lat =
        (Math.PI * a * (1 - e2))
      / (180 * Math.pow(1 - e2*sinLat*sinLat, 1.5));

    var lon =
        (Math.PI * a * cosLat)
      / (180 * Math.sqrt(1 - e2*sinLat*sinLat));

    return new Coordinate(lat, lon);
}

// All generated tiles are 2.5 minutes on each side.
var tileD = 2.5 / 60;

function tileFile(directory, leftD, topD, suffix) {
    var tileD = 2.5 / 60;
    var leftIndex = Math.abs(Math.round(leftD / tileD));
    var leftChar = leftD < 0 ? "W" : "E";
    var topIndex = Math.abs(Math.round(topD / tileD));
    var topChar = topD > 0 ? "N" : "S";
    return directory + "/" + leftIndex + leftChar + topIndex + topChar + suffix;
}

function equals(d0, d1) { return Math.abs(d0 - d1) <= .00000001; }
function lessThan(d0, d1) { return d0 < d1 && !equals(d0, d1); }
function lessThanOrEqual(d0, d1) { return d0 < d1 || equals(d0, d1); }
function rotateX(x, y, angle) { return x * Math.cos(angle) - y * Math.sin(angle); }
function rotateY(x, y, angle) { return y * Math.cos(angle) + x * Math.sin(angle); }

function assert(b)
{
    if (!b)
        throw new Error("Assertion Failed!");
}

var loggerCount = 0;
var loggerLimit = 10;

function logger(str)
{
    loggerCount++;
    if (loggerCount < loggerLimit)
        console.log(str);
    else if (loggerCount == loggerLimit)
        console.log("Logging limit reached...");
}

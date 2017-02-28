/* -*- indent-tabs-mode: nil; js-indent-level: 4; js-indent-level: 4 -*- */
/* Copyright 2015-2017 Brian Hackett. Released under the MIT license. */

"use strict";

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

Coordinate.prototype.toString = function() {
    return "(" + this.lat + "," + this.lon + "," + this.elv + ")";
}

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

function tileFile(directory, leftD, topD, suffix) {
    var tileD = 2.5 / 60;
    var leftIndex = Math.abs(Math.round(leftD / tileD));
    var leftChar = leftD < 0 ? "W" : "E";
    var topIndex = Math.abs(Math.round(topD / tileD));
    var topChar = topD > 0 ? "N" : "S";
    return directory + "/" + leftIndex + leftChar + topIndex + topChar + suffix;
}

function equals(d0, d1)
{
    return Math.abs(d0 - d1) <= .00000001;
}

function lessThan(d0, d1)
{
    return d0 < d1 && !equals(d0, d1);
}

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

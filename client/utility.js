/* Copyright 2015 Brian Hackett. Released under the MIT license. */

"use strict";

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

function OverheadAngle(centerLat, centerLon, zoom)
{
    this.initialize(centerLat, centerLon, zoom);
}

OverheadAngle.prototype.copyFrom = function(other) {
    this.initialize(other.centerLat, other.centerLon, other.zoom);
}

OverheadAngle.prototype.initialize = function(centerLat, centerLon, zoom) {
    this.centerLat = centerLat;
    this.centerLon = centerLon;
    this.zoom = zoom;
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

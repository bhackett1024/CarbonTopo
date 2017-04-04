/* -*- indent-tabs-mode: nil; js-indent-level: 4; js-indent-level: 4 -*- */
/* Copyright 2015-2017 Brian Hackett. Released under the MIT license. */

"use strict";

///////////////////////////////////////////////////////////////////////////////
// Constants
///////////////////////////////////////////////////////////////////////////////

var overheadViewCanvas = document.getElementById("overheadViewCanvas");
var pointViewCanvas = document.getElementById("pointViewCanvas");

var minZoom = 1;
var maxZoom = 5;

// Number of milliseconds to work at a time when rendering tile images or point views.
var renderingBudget = 25;

var tileDirectory = "tiles";

///////////////////////////////////////////////////////////////////////////////
// OverheadAngle
///////////////////////////////////////////////////////////////////////////////

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
    this.computeDegreesPerPixel();
}

OverheadAngle.prototype.computeDegreesPerPixel = function() {
    // At any given time, an equirectangular projection is used to arrange all
    // displayed tiles. This is a simple projection that uses a constant amount
    // of space for a given delta in latitude or longitude, anywhere on the
    // projection. Using this is fine for small scale maps like the ones we are
    // interested in. Using the same spacing regardless of our location would
    // cause some areas to become grossly distorted, however, so we compute the
    // latitude and longitude scales based on the current center of the map.
    //
    // With a zoom factor of 1, the display should be roughly 1:1 with the
    // rendered tile images.
    var lat = this.zoom * tileD / renderedTileHeight;
    var distances = latlonDistances(this.centerLat);
    var lon = lat / (distances.lon / distances.lat);
    this.degreesPerPixel = new Coordinate(lat, lon);
}

OverheadAngle.prototype.longitudePixel = function(lon) {
    return this.pixelWidth / 2 + (lon - this.centerLon) / this.degreesPerPixel.lon;
}

OverheadAngle.prototype.latitudePixel = function(lat) {
    return this.pixelHeight / 2 + (this.centerLat - lat) / this.degreesPerPixel.lat;
}

///////////////////////////////////////////////////////////////////////////////
// View State
///////////////////////////////////////////////////////////////////////////////

var overheadView = new OverheadAngle(40.57, -111.63, 1);

// All tiles which are currently loaded.
var allTiles = {};

// Coordinates for the current mouse position.
var mouseCoords = null;

// Coordinates for the mouse position at the last time no context menu was visible.
var mouseCoordsNoContextMenu = null;

// Coordinates for the last time the right mouse button was pressed.
var rmbCoords = null;

// Information about the screen when we started dragging.
var startDrag = null;

// When the point of view display is active, this has information about the
// view. Otherwise, this is null.
var viewInfo = null;

// When a path is being drawn (in the overhead view), this has information
// about the path. Otherwise, this is null.
var pathInfo = null;

// Any paths that have been completely drawn.
var completedPaths = [];

///////////////////////////////////////////////////////////////////////////////
// Other Stuff
///////////////////////////////////////////////////////////////////////////////

function rejectTile(reason)
{
    console.log(reason);
    tile.fillStyle = "rgb(255,0,0)";
}

function newTile(data)
{
    var tile = data.tile;
    computeElevationData(tile, data.elv);
    tile.hydrographyData = data.hyd ? new Uint8Array(data.hyd) : null;
    tile.featureData = data.ftr ? new Uint8Array(data.ftr) : null;

    renderTileData(tile, function(imageUrl) {
        tile.image = new Image();
        tile.image.src = imageUrl;
        tile.image.onload = function() {
            setNeedUpdateScene();
        }
    });
}

function loadTileZipData(data, zip, fileName)
{
    var file = zip.file(fileName);
    if (file) {
        data.pending++;
        file.async("arraybuffer").then(function(buffer) {
            data[fileName] = buffer;
            if (--data.pending == 0)
                newTile(data);
        }, (e) => rejectTile(data.tile, e));
    }
}

function findTile(coords)
{
    var leftD = Math.floor(coords.lon / tileD) * tileD;
    var topD = Math.ceil(coords.lat / tileD) * tileD;
    var file = tileFile(tileDirectory, leftD, topD, ".zip");

    if (file in allTiles)
        return allTiles[file];

    var tile = new Tile(leftD, topD);

    allTiles[file] = tile;

    var xhr = new XMLHttpRequest();
    xhr.open('GET', file, true);
    xhr.responseType = 'arraybuffer';
    xhr.onload = function(e) {
        if (this.status != 200) {
            rejectTile(tile, "Bad HTTP response: " + this.status);
            return;
        }

        tile.fillStyle = "rgb(0,0,255)";

        try {
            JSZip.loadAsync(this.response).then(function(zip) {
                var data = { tile: tile, pending: 0 };
                loadTileZipData(data, zip, "elv");
                loadTileZipData(data, zip, "hyd");
                loadTileZipData(data, zip, "ftr");
            }, (e) => { rejectTile(tile, e); });
        } catch (e) {
            rejectTile(tile, e);
        }
    }
    xhr.onerror = function() {
        tile.fillStyle = "rgb(127,127,127)";
    }
    try {
        xhr.send();
    } catch (e) {
        rejectTile(tile, e);
    }

    return tile;
}

function updateOverheadView()
{
    if (viewInfo)
        return;

    var width = overheadViewCanvas.width = overheadView.pixelWidth = window.innerWidth;
    var height = overheadViewCanvas.height = overheadView.pixelHeight = window.innerHeight;

    var context = overheadViewCanvas.getContext('2d');
    context.fillStyle = "rgb(0,0,0)";
    context.fillRect(0, 0, width, height);

    var leftD = (overheadView.centerLon - overheadView.degreesPerPixel.lon * width / 2);
    var rightD = (overheadView.centerLon + overheadView.degreesPerPixel.lon * width / 2);
    var topD = (overheadView.centerLat + overheadView.degreesPerPixel.lat * height / 2);
    var bottomD = (overheadView.centerLat - overheadView.degreesPerPixel.lat * height / 2);

    var coords = new Coordinate();

    for (coords.lon = leftD; coords.lon < rightD + tileD; coords.lon += tileD) {
        for (coords.lat = bottomD; coords.lat < topD + tileD; coords.lat += tileD) {
            var tile = findTile(coords);

            var leftP = Math.floor(overheadView.longitudePixel(tile.leftD));
            var rightP = Math.ceil(overheadView.longitudePixel(tile.leftD + tileD));
            var topP = Math.floor(overheadView.latitudePixel(tile.topD));
            var bottomP = Math.ceil(overheadView.latitudePixel(tile.topD - tileD));

            if (tile.image && tile.image.width && tile.image.height) {
                context.drawImage(tile.image, leftP, topP, rightP - leftP, bottomP - topP);
            } else {
                context.fillStyle = tile.fillStyle;
                context.fillRect(leftP, topP, rightP - leftP, bottomP - topP);
            }
        }
    }

    context.strokeStyle = "rgb(255,0,0)";
    context.lineWidth = 3;

    for (var i = 0; i < completedPaths.length; i++) {
        var path = completedPaths[i];
        for (var j = 0; j < path.length - 1; j++)
            drawPathSegment(context, path[j], path[j + 1]);
    }

    if (pathInfo) {
        for (var i = 0; i < pathInfo.length - 1; i++)
            drawPathSegment(context, pathInfo[i], pathInfo[i + 1]);
        drawPathSegment(context, pathInfo[pathInfo.length - 1], mouseCoordsNoContextMenu);
    }
}

function overheadViewDistanceFrom(tile)
{
    // Return the distance from the center of the overhead view to tile, in meters.
    var distances = latlonDistances(overheadView.centerLat);
    var latDistance = (tile.topD - tileD / 2 - overheadView.centerLat) * distances.lat;
    var lonDistance = (tile.leftD + tileD / 2 - overheadView.centerLon) * distances.lon;
    return Math.sqrt((latDistance * latDistance) + (lonDistance * lonDistance));
}

function drawPathSegment(context, src, dst)
{
    context.beginPath();
    context.moveTo(Math.round(overheadView.longitudePixel(src.lon)),
                   Math.round(overheadView.latitudePixel(src.lat)));
    context.lineTo(Math.round(overheadView.longitudePixel(dst.lon)),
                   Math.round(overheadView.latitudePixel(dst.lat)));
    context.stroke();
}

function screenCoordinatesToLatlong(view, x, y) {
    // Transform the coordinates so they are relative to the center of the canvas.
    x -= window.innerWidth / 2;
    y = (window.innerHeight - y) - window.innerHeight / 2;

    return new Coordinate(view.centerLat + y * view.degreesPerPixel.lat,
                          view.centerLon + x * view.degreesPerPixel.lon);
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

function clickEvent(ev) {
    /*
    var coords = screenCoordinatesToLatlong(overheadView, ev.clientX, ev.clientY);
    var elevation = computeElevation(coords);

    var color = {
        r:0,
        b:0,
        g:0
    };
    fillColorData(coords, color);

    console.log("EVENT " + coords.lon + " " + coords.lat + " ELEVATION " +
                Math.round(elevation * feetPerMeter) + " R " + color.r + " G " + color.g + " B " + color.b);
    */
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
        updatedView.computeDegreesPerPixel();

        // Adjust the center so that the location under the mouse will remain under
        // the mouse after zooming.
        var oldCoords = screenCoordinatesToLatlong(overheadView, ev.clientX, ev.clientY);
        var newCoords = screenCoordinatesToLatlong(updatedView, ev.clientX, ev.clientY);
        overheadView.centerLon += oldCoords.lon - newCoords.lon;
        overheadView.centerLat += oldCoords.lat - newCoords.lat;
        overheadView.zoom = newZoomFactor;
        overheadView.computeDegreesPerPixel();
    }

    setNeedUpdateScene();
}
window.addEventListener('wheel', wheelEvent);

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
    if (!viewInfo) {
        mouseCoords = screenCoordinatesToLatlong(overheadView, ev.clientX, ev.clientY);

        var visibleMenu = $('.context-menu-list').filter(':visible');
        if (!visibleMenu.length)
            mouseCoordsNoContextMenu = screenCoordinatesToLatlong(overheadView, ev.clientX, ev.clientY);
    }

    if (ev.button != 0 || ev.buttons == 0 || !startDrag) {
        if (pathInfo)
            setNeedUpdateScene();
        return;
    }

    // Adjust the current view so that the location under the mouse will remain
    // under the mouse after dragging.
    if (viewInfo) {
        var radiansPerPixel = startDrag.pointView.radiansPerPixel(viewInfo.imageData.width);
        var newView = new ViewAngle();
        newView.radius = startDrag.pointView.radius;
        newView.yaw = startDrag.pointView.yaw - (startDrag.x - ev.clientX) * radiansPerPixel;
        newView.pitch = clamp(startDrag.pointView.pitch - (startDrag.y - ev.clientY) * radiansPerPixel, -.75, .75);
        viewInfo.newView = newView;
    } else {
        var startCoords = screenCoordinatesToLatlong(startDrag.overheadView, startDrag.x, startDrag.y);
        overheadView.centerLon += startCoords.lon - mouseCoords.lon;
        overheadView.centerLat += startCoords.lat - mouseCoords.lat;
        overheadView.computeDegreesPerPixel();
    }

    setNeedUpdateScene();
}
window.addEventListener('mousemove', mousemoveEvent);

function drawViewCallback(key, options) {
    var elevation = computeElevation(rmbCoords);
    console.log("RMB " + rmbCoords.lon + " " + rmbCoords.lat + " ELEVATION " +
                Math.round(elevation * feetPerMeter));

    rmbCoords.elv = elevation + 10;
    drawView(rmbCoords, new ViewAngle(0, 0, .5));
}

function exitViewCallback(key, options) {
    overheadViewCanvas.style.display = "inline";
    pointViewCanvas.style.display = "none";
    viewInfo = null;
}

function newPathCallback(key, options) {
    pathInfo = [rmbCoords];
}

function addPointCallback(key, options) {
    mouseCoordsNoContextMenu = mouseCoords;
    pathInfo.push(rmbCoords);
    setNeedUpdateScene();
}

function removePointCallback(key, options) {
    mouseCoordsNoContextMenu = mouseCoords;
    if (pathInfo.length > 1)
        pathInfo.length--;
    else
        pathInfo = null;
    setNeedUpdateScene();
}

function exitPathCallback(key, options) {
    pathInfo.push(rmbCoords);
    completedPaths.push(pathInfo);
    pathInfo = null;
    setNeedUpdateScene();
}

function hasOverheadViewNoPath() {
    return !viewInfo && !pathInfo;
}

function hasPointView() {
    return !!viewInfo;
}

function hasOverheadViewWithPath() {
    return !!pathInfo;
}

$(function(){
    $.contextMenu("destroy");
    $.contextMenu({
        selector: 'canvas', //'#renderer-canvas', 
        items: {
            "view": { name: "Draw View", callback: drawViewCallback, visible: hasOverheadViewNoPath },
            "exitView": { name: "Exit View", callback: exitViewCallback, visible: hasPointView },
            "path": { name: "New Path", callback: newPathCallback, visible: hasOverheadViewNoPath },
            "point": { name: "Add Point", callback: addPointCallback, visible: hasOverheadViewWithPath },
            "removePoint": { name: "Remove Point", callback: removePointCallback, visible: hasOverheadViewWithPath },
            "exitPath": { name: "Finish Path", callback: exitPathCallback, visible: hasOverheadViewWithPath }
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

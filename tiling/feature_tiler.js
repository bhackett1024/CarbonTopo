/* -*- indent-tabs-mode: nil; js-indent-level: 4; js-indent-level: 4 -*- */
/* Copyright 2015-2017 Brian Hackett. Released under the MIT license. */

// Given one or more feature zips, populate a destination directory with
// feature information for each tile.

load('../client/utility.js');
load('utility.js');

if (scriptArgs.length == 0) {
    print("Usage: js feature_tiler.js featureDirectory src0.zip src1.zip ...");
    quit();
}

var destinationDirectory = scriptArgs[0];
os.system(`mkdir ${destinationDirectory} 2> /dev/null`);

function processZip(sourceZip)
{
    print("Processing Zip " + sourceZip);
    os.system(`unzip ${sourceZip} -d tmp 2> /dev/null > /dev/null`);

    os.system("ls tmp/*.txt > " + tmpTxt);
    var featureFiles = snarf(tmpTxt).split('\n');

    for (var i = 0; i < featureFiles.length; i++) {
        var file = featureFiles[i];
        if (/\.txt/.test(file))
            processFile(file);
    }
}

function schemaItem(schema, items, name)
{
    for (var i = 0; i < schema.length; i++) {
	if (schema[i] == name) {
	    assert(items[i]);
	    return items[i];
	}
    }
    assert(false);
}

function handleFeature(className)
{
    var whitelist = [
	"Arch",
	"Arroyo",
	"Bar",
	"Basin",
	"Bench",
	"Bend",
	"Cape",
	"Cliff",
	"Civil",
	"Crater",
	"Dam",
	"Falls",
	"Flat",
	"Gap",
	"Glacier",
	"Island",
	"Lava",
	"Levee",
	"Locale",
	"Military",
	"Mine",
	"Oilfield",
	"Pillar",
	"Plain",
	"Rapids",
	"Ridge",
	"Slope",
	"Summit",
	"Swamp",
	"Valley",
    ];
    for (var i = 0; i < whitelist.length; i++) {
	if (className == whitelist[i])
	    return true;
    }
    return false;
}

var tiles = new TileIndex();

function processFile(file)
{
    var lines = snarf(file).split('\n');
    assert(lines[lines.length - 1].length == 0);
    lines.pop();

    var schema = lines[0].split('|');
    for (var i = 1; i < lines.length; i++) {
	var items = lines[i].split('|');;
	var className = schemaItem(schema, items, "FEATURE_CLASS");
	if (handleFeature(className)) {
	    var name = schemaItem(schema, items, "FEATURE_NAME");
	    var lat = +schemaItem(schema, items, "PRIM_LAT_DEC");
	    var lon = +schemaItem(schema, items, "PRIM_LONG_DEC");
	    var leftD = getTileLeftD(lon);
	    var bottomD = getTileBottomD(lat);

	    var feature = { name: name, lat: lat, lon: lon };
	    var tile = tiles.getTile(leftD, bottomD, function(newTile) { newTile.features = {} });
	    if (!(className in tile.features))
		tile.features[className] = [];
	    tile.features[className].push(feature);
	}
    }
}

for (var i = 1; i < scriptArgs.length; i++) {
    try {
        processZip(scriptArgs[i]);
    } finally {
        os.system("rm -rf tmp");
    }
}

var allTiles = tiles.getAllTiles();
for (var i = 0; i < allTiles.length; i++) {
    var tile = allTiles[i];
    var dstFile = tileFile(destinationDirectory, tile.leftD, tile.bottomD + tileD, ".ftr");
    var output = new Encoder();

    for (var className in tile.features) {
	var features = tile.features[className];
	for (var j = 0; j < features.length; j++) {
	    var feature = features[j];
	    var point = getTilePoint(tile.leftD, tile.bottomD, new Coordinate(feature.lat, feature.lon));
	    output.writeString(className);
	    output.writeString(feature.name);
	    output.writeByte(point.h);
	    output.writeByte(point.w);
	}
    }

    os.file.writeTypedArrayToFile(dstFile, output.toTypedArray());
}

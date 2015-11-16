
CarbonTopo is, right now, a basic webapp demo, which takes tiled topographic maps, allows panning and zooming and terrain visualization (right click -> draw view).

To use the demo, download http://bhackett.org/site/tiles.tgz and extract to a folder containing the various files in /client, then load topo.html in a web browser (this has only been tested in Firefox, I don't know which other browsers will behave).  This file is provided for convenience, and has some terrain surrounding Mount Rainier (CarbonTopo is named for the Carbon glacier).  The scripts in /tiling were used to generate this file, and can convert USGS 24k GeoTiffs (http://ngmdb.usgs.gov/maps/Topoview/viewer) and 1/3 arc-second DEM elevation data (http://viewer.nationalmap.gov/basic/) into additional tiles for use by the webapp.

From here I want to port this code to a native iOS app, and build it out into a fully featured offline app for backcountry trip planning, navigation, terrain visualization, and so forth.  An android version should follow eventually.  In spring 2016 I'll put tiles online for the rest of the US (or at least the interesting parts of the western states).

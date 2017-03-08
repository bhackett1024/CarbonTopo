
CarbonTopo is, right now, a basic webapp demo, which takes elevation data, generates topographic maps on the fly, and allows panning, zooming and terrain visualization (right click -> draw view).  Other features are in flux so there is not yet documentation on everything that is supported.

Generating Data

All data used by CarbonTopo is provided for free by the US Geological Service (thanks!).  This section describes how to download USGS data and process it using scripts in the tiling subdirectory to generate tiles for use by Carbon Topo.  Eventually processed data will be available online but things are not at that stage yet.

1. To download elevation data, visit https://viewer.nationalmap.gov/basic/, select "Elevation Products (3DEP)", "1/3 arc-second DEM", and the ArcGrid file format.  Zoom in on the map, select 'Find Products', and download any 1x1 degree grids that are of interest.

2. Make a directory for tile data and, using a JS shell (SpiderMonkey-only at the moment, see [1]), run tiling/elevationTiler.js with that tiles directory and any ArcGrid zip files just downloaded.  This will populate the tiles directory with tile zip files.

3. The tile directory must be named 'tiles' and be in the same directory as the client scripts (i.e. 'client/tiles', relative to the project root) in order to be usable in a web browser.

[1] https://developer.mozilla.org/en-US/docs/Mozilla/Projects/SpiderMonkey/Build_Documentation

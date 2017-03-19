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

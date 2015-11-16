
// Functionality shared between different tile processors.

function parseDegrees(s) {
    var arr = /(\d+)d([\d ]+)\'([\d\. ]+)\"([WNSE])/.exec(s);
    if (!arr)
        throw "Could not parse degrees: " + s;
    var abs = +arr[1] + (+arr[2] / 60) + (+arr[3] / (60 * 60));
    return (arr[4] == 'E' || arr[4] == 'N') ? abs : -abs;
}

function parseBoundary(sourceInfo) {
    var upperLeft = /Upper Left.*?\(.*?\) \((.*?), (.*?)\)/.exec(sourceInfo);
    var lowerRight = /Lower Right.*?\(.*?\) \((.*?), (.*?)\)/.exec(sourceInfo);
    return {
        left: parseDegrees(upperLeft[1]),
        top: parseDegrees(upperLeft[2]),
        right: parseDegrees(lowerRight[1]),
        bottom: parseDegrees(lowerRight[2])
    };
}

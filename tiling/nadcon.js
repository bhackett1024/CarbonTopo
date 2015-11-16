/* Copyright 2015 Brian Hackett. Released under the MIT license. */

// NADCON is the transformation used for converting coordinates between NAD27
// and NAD83. Much of this is correcting for errors which accumulated during
// the initial surveys of the country, so instead of e.g. mapping points
// between two ellipsoids this conversion is hidden behind an interface that
// (I think) interpolates corrections between reference points. So this file
// just approximates NADCON by using the corrections from a grid of latitude
// and longitude points covering the continental US.
//
// The latitude/longitude adjustments below were generated by feeding the
// output of the following code fragment:
//
// for (var lat = latMin; lat <= latMax; lat += step) {
//    for (var lon = lonMin; lon <= lonMax; lon += step)
//        print(`${lat}.0 ${lon}.0`);
// }
//
// Into the NADCON conversion page at:
//
// http://www.ngs.noaa.gov/cgi-bin/nadcon.prl
//
// NADCON data disclaimer:
//
// http://www.ngs.noaa.gov/PC_PROD/disclaimer.shtml

var correctionNAD27toNAD83 = (function() {

    var latMin = 24;
    var latMax = 48;
    var lonMin = 66;
    var lonMax = 126;
    var step = 2;

    // NADCON Version 2.11 - NAD 83 datum values converted from NAD 27 datum values
    var nadconData = `
  24.000461787    65.998950045                                                  
  24.000451325    67.999027139                                                  
  24.000441217    69.999110167                                                  
  24.000431990    71.999203289                                                  
  24.000424658    73.999311292                                                  
  24.000420817    75.999437186                                                  
  24.000422550    77.999577401                                                  
  24.000432234    79.999714061                                                  
  24.000440571    81.999800271                                                  
  24.000424061    83.999817802                                                  
  24.000390348    85.999820785                                                  
  24.000363534    87.999838854                                                  
  24.000349378    89.999880409                                                  
  24.000349063    91.999944139                                                  
  24.000360571    94.000026286                                                  
  24.000375712    96.000116851                                                  
  24.000378054    98.000192098                                                  
  24.000357917   100.000231501                                                  
  24.000328659   102.000255494                                                  
  24.000300849   104.000279493                                                  
  24.000278976   106.000308711                                                  
  24.000264248   108.000347461                                                  
  24.000255091   110.000397940                                                  
  24.000248181   112.000457306                                                  
  24.000240765   114.000520165                                                  
  24.000232021   116.000582842                                                  
  24.000222494   118.000644667                                                  
  24.000212967   120.000706434                                                  
  24.000203905   122.000769434                                                  
  24.000195357   124.000834923                                                  
  24.000187061   126.000902888                                                  
  26.000423689    65.998997535                                                  
  26.000412713    67.999075703                                                  
  26.000401586    69.999160591                                                  
  26.000390563    71.999256398                                                  
  26.000380366    73.999367439                                                  
  26.000372284    75.999495252                                                  
  26.000367916    77.999633364                                                  
  26.000368028    79.999763061                                                  
  26.000375719    81.999817225                                                  
  26.000362713    83.999858976                                                  
  26.000336547    85.999887950                                                  
  26.000316689    87.999925578                                                  
  26.000306884    89.999979061                                                  
  26.000307454    92.000040292                                                  
  26.000322448    94.000113781                                                  
  26.000346229    96.000199469                                                  
  26.000357304    98.000281767                                                  
  26.000330921   100.000311509                                                  
  26.000299394   102.000338341                                                  
  26.000269000   104.000365741                                                  
  26.000244086   106.000391574                                                  
  26.000226736   108.000422782                                                  
  26.000215917   110.000465562                                                  
  26.000208549   112.000519578                                                  
  26.000201886   114.000580232                                                  
  26.000194280   116.000641666                                                  
  26.000185068   118.000700855                                                  
  26.000175147   120.000758469                                                  
  26.000165804   122.000816973                                                  
  26.000157348   124.000878680                                                  
  26.000149300   126.000944379                                                  
  28.000385399    65.999043577                                                  
  28.000373586    67.999122089                                                  
  28.000360893    69.999207408                                                  
  28.000347215    71.999303155                                                  
  28.000332981    73.999412321                                                  
  28.000319394    75.999533773                                                  
  28.000307637    77.999656393                                                  
  28.000296923    79.999758029                                                  
  28.000300624    81.999805340                                                  
  28.000282512    83.999865709                                                  
  28.000267622    85.999919846                                                  
  28.000259931    87.999978841                                                  
  28.000258580    90.000052668                                                  
  28.000255654    92.000107291                                                  
  28.000268762    94.000164161                                                  
  28.000291063    96.000240288                                                  
  28.000293671    98.000279028                                                  
  28.000279769   100.000334773                                                  
  28.000254185   102.000388335                                                  
  28.000227437   104.000436139                                                  
  28.000203835   106.000467667                                                  
  28.000186619   108.000497842                                                  
  28.000175319   110.000536838                                                  
  28.000167104   112.000587209                                                  
  28.000161194   114.000647662                                                  
  28.000155724   116.000709278                                                  
  28.000147202   118.000766152                                                  
  28.000136828   120.000819338                                                  
  28.000127305   122.000872325                                                  
  28.000119171   124.000928245                                                  
  28.000111588   126.000989007                                                  
  30.000346948    65.999088367                                                  
  30.000334153    67.999166698                                                  
  30.000319794    69.999251479                                                  
  30.000303475    71.999345567                                                  
  30.000285453    73.999450913                                                  
  30.000267858    75.999565677                                                  
  30.000255010    77.999678764                                                  
  30.000249049    79.999763337                                                  
  30.000239998    81.999826440                                                  
  30.000209929    83.999883193                                                  
  30.000207720    85.999936910                                                  
  30.000207995    87.999995127                                                  
  30.000202108    90.000069624                                                  
  30.000204411    92.000121635                                                  
  30.000213333    94.000175000                                                  
  30.000222272    96.000234652                                                  
  30.000214551    98.000284752                                                  
  30.000211262   100.000350166                                                  
  30.000193058   102.000406417                                                  
  30.000169217   104.000466599                                                  
  30.000154746   106.000513858                                                  
  30.000142082   108.000555945                                                  
  30.000132298   110.000595957                                                  
  30.000122072   112.000645894                                                  
  30.000116799   114.000711602                                                  
  30.000116031   116.000777007                                                  
  30.000107896   118.000832792                                                  
  30.000096664   120.000883477                                                  
  30.000087491   122.000932761                                                  
  30.000080480   124.000983342                                                  
  30.000073946   126.001038056                                                  
  32.000308424    65.999132257                                                  
  32.000294707    67.999210024                                                  
  32.000279081    69.999293631                                                  
  32.000261158    71.999385068                                                  
  32.000240769    73.999485374                                                  
  32.000219717    75.999593841                                                  
  32.000205418    77.999705902                                                  
  32.000205077    79.999809844                                                  
  32.000199435    81.999840531                                                  
  32.000171192    83.999899975                                                  
  32.000151889    85.999954270                                                  
  32.000151657    88.000011774                                                  
  32.000154865    90.000081881                                                  
  32.000159736    92.000133218                                                  
  32.000166508    94.000189844                                                  
  32.000160731    96.000243119                                                  
  32.000147270    98.000311326                                                  
  32.000144250   100.000371349                                                  
  32.000124113   102.000412547                                                  
  32.000125396   104.000481656                                                  
  32.000105512   106.000531862                                                  
  32.000094114   108.000590062                                                  
  32.000081925   110.000623001                                                  
  32.000073369   112.000682202                                                  
  32.000070081   114.000765616                                                  
  32.000078216   116.000833019                                                  
  32.000062600   118.000883736                                                  
  32.000053508   120.000937972                                                  
  32.000045577   122.000990309                                                  
  32.000041144   124.001039369                                                  
  32.000036359   126.001089276                                                  
  34.000270035    65.999175654                                                  
  34.000255566    67.999252466                                                  
  34.000239273    69.999334421                                                  
  34.000221631    71.999422679                                                  
  34.000202912    73.999516448                                                  
  34.000179559    75.999614069                                                  
  34.000173002    77.999711667                                                  
  34.000158789    79.999792970                                                  
  34.000128419    81.999840501                                                  
  34.000102383    83.999906406                                                  
  34.000097588    85.999971619                                                  
  34.000103438    88.000030314                                                  
  34.000113299    90.000089502                                                  
  34.000099841    92.000138870                                                  
  34.000114223    94.000190023                                                  
  34.000096893    96.000258604                                                  
  34.000096859    98.000314392                                                  
  34.000080266   100.000380671                                                  
  34.000082574   102.000454442                                                  
  34.000082527   104.000521082                                                  
  34.000068431   106.000549317                                                  
  34.000057424   108.000610546                                                  
  34.000046057   110.000660494                                                  
  34.000035482   112.000709172                                                  
  34.000022091   114.000774242                                                  
  34.000004444   116.000833056                                                  
  34.000011932   118.000899026                                                  
  34.000003999   120.000960695                                                  
  34.000002887   122.001036863                                                  
  34.000002376   124.001089186                                                  
  33.999998756   126.001137172                                                  
  36.000232253    65.999218790                                                  
  36.000217268    67.999293970                                                  
  36.000200374    69.999373517                                                  
  36.000183403    71.999458968                                                  
  36.000173198    73.999548298                                                  
  36.000157544    75.999640006                                                  
  36.000152991    77.999708561                                                  
  36.000136944    79.999761389                                                  
  36.000126389    81.999838056                                                  
  36.000081111    83.999910000                                                  
  36.000061012    85.999988778                                                  
  36.000060580    88.000033443                                                  
  36.000070833    90.000089444                                                  
  36.000071847    92.000150621                                                  
  36.000079291    94.000198826                                                  
  36.000095278    96.000273333                                                  
  36.000039116    98.000336074                                                  
  36.000043702   100.000398807                                                  
  36.000036318   102.000455359                                                  
  36.000034488   104.000527633                                                  
  36.000023611   106.000577778                                                  
  36.000016380   108.000619548                                                  
  36.000004226   110.000673566                                                  
  35.999983524   112.000720069                                                  
  35.999987076   114.000791461                                                  
  35.999966295   116.000854486                                                  
  35.999944585   118.000911311                                                  
  35.999953344   120.000967188                                                  
  35.999966596   122.001071968                                                  
  35.999965750   124.001125039                                                  
  35.999959321   126.001175020                                                  
  38.000195806    65.999261625                                                  
  38.000181092    67.999333981                                                  
  38.000163818    69.999408699                                                  
  38.000145634    71.999489328                                                  
  38.000128517    73.999576329                                                  
  38.000123499    75.999656528                                                  
  38.000140090    77.999720336                                                  
  38.000123979    79.999781862                                                  
  38.000100028    81.999849697                                                  
  38.000079622    83.999923127                                                  
  38.000073509    85.999964475                                                  
  38.000045647    88.000030512                                                  
  38.000052231    90.000110583                                                  
  38.000039824    92.000164713                                                  
  38.000031398    94.000218734                                                  
  38.000027844    96.000269732                                                  
  38.000011826    98.000332012                                                  
  38.000018608   100.000409858                                                  
  38.000012711   102.000459294                                                  
  38.000007867   104.000516186                                                  
  37.999999499   106.000573190                                                  
  37.999992341   108.000622675                                                  
  37.999987020   110.000687130                                                  
  37.999984184   112.000750235                                                  
  37.999961512   114.000806201                                                  
  37.999937059   116.000876433                                                  
  37.999930884   118.000940224                                                  
  37.999921509   120.001016345                                                  
  37.999921389   122.001072500                                                  
  37.999927439   124.001138783                                                  
  37.999916737   126.001200162                                                  
  40.000161142    65.999303966                                                  
  40.000148567    67.999372734                                                  
  40.000135526    69.999437872                                                  
  40.000112936    71.999511943                                                  
  40.000117770    73.999578239                                                  
  40.000102825    75.999673792                                                  
  40.000087300    77.999724329                                                  
  40.000073770    79.999774406                                                  
  40.000067335    81.999857662                                                  
  40.000059167    83.999935278                                                  
  40.000035833    85.999983889                                                  
  40.000034331    88.000035276                                                  
  40.000048479    90.000113922                                                  
  40.000041088    92.000173993                                                  
  40.000005384    94.000225766                                                  
  39.999999845    96.000277162                                                  
  40.000014110    98.000321069                                                  
  40.000005895   100.000405837                                                  
  39.999990311   102.000462366                                                  
  39.999984827   104.000505263                                                  
  39.999985968   106.000572818                                                  
  39.999972647   108.000633044                                                  
  39.999963626   110.000704839                                                  
  39.999951862   112.000776816                                                  
  39.999937808   114.000836253                                                  
  39.999925654   116.000896287                                                  
  39.999913964   118.000965634                                                  
  39.999904806   120.001035224                                                  
  39.999880384   122.001096707                                                  
  39.999866369   124.001138093                                                  
  39.999866429   126.001222412                                                  
  42.000127689    65.999344347                                                  
  42.000117168    67.999414011                                                  
  42.000103537    69.999467369                                                  
  42.000096944    71.999518611                                                  
  42.000091915    73.999582585                                                  
  42.000074996    75.999643431                                                  
  42.000066842    77.999725559                                                  
  42.000054698    79.999774104                                                  
  42.000034592    81.999865921                                                  
  42.000044331    83.999942439                                                  
  42.000045306    86.000009141                                                  
  42.000028617    88.000069257                                                  
  42.000026338    90.000124346                                                  
  41.999999445    92.000181406                                                  
  41.999982581    94.000231938                                                  
  41.999987805    96.000288924                                                  
  42.000007582    98.000342145                                                  
  42.000001530   100.000406954                                                  
  41.999982254   102.000461028                                                  
  41.999963726   104.000503427                                                  
  41.999966682   106.000566349                                                  
  41.999956711   108.000640529                                                  
  41.999949452   110.000706698                                                  
  41.999924633   112.000786940                                                  
  41.999915161   114.000848361                                                  
  41.999901762   116.000929626                                                  
  41.999892354   118.000985536                                                  
  41.999889722   120.001058611                                                  
  41.999867748   122.001119340                                                  
  41.999833331   124.001188880                                                  
  41.999838937   126.001257799                                                  
  44.000093599    65.999374966                                                  
  44.000086327    67.999445242                                                  
  44.000078356    69.999497104                                                  
  44.000066305    71.999531289                                                  
  44.000060806    73.999587998                                                  
  44.000058000    75.999647641                                                  
  44.000050629    77.999743311                                                  
  44.000041289    79.999819348                                                  
  44.000021401    81.999901572                                                  
  44.000020646    83.999993131                                                  
  44.000008508    86.000069664                                                  
  43.999992588    88.000095127                                                  
  43.999967442    90.000128252                                                  
  43.999962733    92.000158236                                                  
  43.999964815    94.000231372                                                  
  43.999966203    96.000298464                                                  
  43.999981718    98.000359580                                                  
  43.999988611   100.000398056                                                  
  43.999989168   102.000430011                                                  
  43.999979883   104.000485769                                                  
  43.999978218   106.000572918                                                  
  43.999956570   108.000651229                                                  
  43.999949411   110.000738553                                                  
  43.999910026   112.000808895                                                  
  43.999915553   114.000877107                                                  
  43.999893337   116.000952153                                                  
  43.999880512   118.001021916                                                  
  43.999861111   120.001090279                                                  
  43.999840749   122.001148662                                                  
  43.999844665   124.001226648                                                  
  43.999825653   126.001293775                                                  
  46.000065259    65.999402343                                                  
  46.000054441    67.999464071                                                  
  46.000033597    69.999512382                                                  
  46.000032509    71.999557731                                                  
  46.000024992    73.999645942                                                  
  46.000022401    75.999726210                                                  
  46.000017766    77.999786223                                                  
  46.000019885    79.999857341                                                  
  46.000024369    81.999926996                                                  
  46.000019192    84.000006305                                                  
  45.999977449    86.000124059                                                  
  45.999951152    88.000132171                                                  
  45.999948695    90.000158281                                                  
  45.999943721    92.000182829                                                  
  45.999964493    94.000262311                                                  
  45.999960000    96.000332222                                                  
  45.999968169    98.000380837                                                  
  45.999988859   100.000390881                                                  
  46.000002149   102.000425059                                                  
  46.000001263   104.000488445                                                  
  46.000001361   106.000556066                                                  
  45.999969473   108.000665252                                                  
  45.999944843   110.000743906                                                  
  45.999926613   112.000824460                                                  
  45.999920858   114.000915399                                                  
  45.999887512   116.000976570                                                  
  45.999861091   118.001050540                                                  
  45.999853761   120.001150663                                                  
  45.999835852   122.001196887                                                  
  45.999829290   124.001251748                                                  
  45.999806718   126.001328604                                                  
  48.000035566    65.999433985                                                  
  48.000033992    67.999485486                                                  
  48.000026241    69.999539289                                                  
  48.000003362    71.999608302                                                  
  47.999992066    73.999694862                                                  
  47.999984994    75.999776043                                                  
  47.999984531    77.999842638                                                  
  47.999990090    79.999902966                                                  
  47.999997138    81.999959462                                                  
  47.999993397    84.000017259                                                  
  47.999941457    86.000106556                                                  
  47.999882227    88.000083757                                                  
  47.999887004    90.000090369                                                  
  47.999902399    92.000140692                                                  
  47.999953884    94.000202930                                                  
  47.999963764    96.000307105                                                  
  47.999994102    98.000377509                                                  
  48.000003673   100.000409004                                                  
  48.000013098   102.000445317                                                  
  48.000020556   104.000487500                                                  
  48.000016709   106.000572366                                                  
  47.999996677   108.000678127                                                  
  47.999977048   110.000757368                                                  
  47.999960647   112.000849228                                                  
  47.999950563   114.000940297                                                  
  47.999924790   116.001008589                                                  
  47.999886268   118.001083394                                                  
  47.999861753   120.001183760                                                  
  47.999820794   122.001239604                                                  
  47.999806233   124.001314022                                                  
  47.999784951   126.001381106                                                  
`;

    var correctionTable = {};

    var entries = nadconData.split('\n');
    for (var i = 0; i < entries.length; i++) {
        if (arr = /([\d\.]+).*?([\d\.]+)/.exec(entries[i])) {
            var lat = Math.round(+arr[1]);
            var lon = Math.round(+arr[2]);
            correctionTable[lat + "_" + lon] = [+arr[1] - lat, +arr[2] - lon];
        }
    }

    function correction(lat, lon) {
        var key = lat + "_" + lon;
        assertEq(key in correctionTable, true);
        return correctionTable[key];
    }

    function interpolateCorrection(first, second, factor) {
        factor = clamp(factor, 0, 1);

        return [
            first[0] * factor + second[0] * (1 - factor),
            first[1] * factor + second[1] * (1 - factor)
        ];
    }

    return function(lat, lon) {
        // Adjust for the NADCON longitudes being degrees west rather than east
        // of the meridian.
        lon = -lon;

        // Perform a bilinear interpolation to approximate the conversion for
        // this point based on the conversions at the nearest four points on
        // the conversion grid.
        var gridLeft = clamp(Math.ceil(lon / step) * step, lonMin, lonMax);
        var gridTop = clamp(Math.ceil(lat / step) * step, latMin, latMax);
        var gridRight = clamp(Math.floor(lon / step) * step, lonMin, lonMax);
        var gridBottom = clamp(Math.floor(lat / step) * step, latMin, latMax);

        // Interpolate along the latitude axis, for both the left and right sides of the grid.
        var upperLeftCorrection = correction(gridTop, gridLeft);
        var lowerLeftCorrection = correction(gridBottom, gridLeft);
        var leftInterpolatedCorrection =
            interpolateCorrection(upperLeftCorrection, lowerLeftCorrection,
                                  (gridTop - lat) / step);
        var upperRightCorrection = correction(gridTop, gridRight);
        var lowerRightCorrection = correction(gridBottom, gridRight);
        var rightInterpolatedCorrection =
            interpolateCorrection(upperRightCorrection, lowerRightCorrection,
                                  (gridTop - lat) / step);

        // Interpolate along the longitude axis, using the interpolated corrections
        // we just computed.
        var finalCorrection =
            interpolateCorrection(leftInterpolatedCorrection, rightInterpolatedCorrection,
                                  (gridLeft - lon) / step);

        return {
            lat: finalCorrection[0],
            lon: -finalCorrection[1]  // Undo the longitude adjustment from earlier.
        };
    }
})();

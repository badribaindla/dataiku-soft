(function () {
    'use strict';

    var app = angular.module('dataiku.ml.core');

    app.factory('ContourPlotFactory', function () {
        // Most functions in this factory are copied/adapted from Plotly.js 1.54.7,
        // by Plotly, Inc, released under the MIT license
        // https://github.com/plotly/plotly.js/tree/v1.54.7

        // More precisely blocks with a link to https://github.com/plotly/plotly.js/blob/v1.54.7/...
        // are directly copied/slightly modified from the Plotly.js code, while others without
        // the link are custom.

        // List of blocks copied from Plotly.js:
        // - findEmpties
        // - interp2d
        // - setContours
        // - emptyPathinfo
        // - makeCrossings
        // - setConvert
        // - findAllPaths
        // - closeBoundaries
        // - svg paths smoothing
        // - contours drawing

        let contourPlotFactory = {
            drawContours: drawContours,
        };

        // ----------------------------- draw contour plot------------------------------------------

        /**
         * Draw the contour plot
         *
         * @param {d3 selection} svg : d3 selection of the plot that will contain the contour plot
         * @param {number[]} x : Array of x values
         * @param {number[]} y : Array of y values
         * @param {number[]} z : Array of z values
         * @param {boolean} xlog : true if x scale is logarithmic, false otherwise
         * @param {boolean} ylog : true if y scale is logarithmic, false otherwise
         * @param {boolean} zlog : true if z scale is logarithmic, false otherwise
         * @param {number} width : plot width
         * @param {number} height : plot height
         * @param {d3 scale} colorScale : d3 color scale
         * @param {number} nContours: number of contours to be computed
         */
        function drawContours(svg, x, y, z, xlog, ylog, zlog, width, height, colorScale, nContours) {
            if (xlog) {
                x = x.map(Math.log10);
            }
            if (ylog) {
                y = y.map(Math.log10);
            }
            if (zlog) {
                z = z.map(Math.log10);
            }

            // First convert x, y to sorted deduplicated arrays
            // and z to an interpolated grid
            let { xUnique, yUnique, zGrid } = interpolateGrid(x, y, z);

            // Compute contours
            let contours = setContours(Math.min(...z), Math.max(...z), nContours);

            let xaxis = {
                width: width,
                range: [Math.min(...xUnique), Math.max(...xUnique)],
                letter: 'x',
            };

            let yaxis = {
                height: height,
                range: [Math.min(...yUnique), Math.max(...yUnique)],
                letter: 'y',
            };

            // Create empty paths
            let pathinfo = emptyPathinfo(contours, xaxis, yaxis, xUnique, yUnique, zGrid, 1);
            // Make crossings
            makeCrossings(pathinfo);
            // Find all paths
            findAllPaths(pathinfo);

            // Compute perimeter
            let leftedge = c2p(xaxis)(xUnique[0], true);
            let rightedge = c2p(xaxis)(xUnique[xUnique.length - 1], true);
            let bottomedge = c2p(yaxis)(yUnique[0], true);
            let topedge = c2p(yaxis)(yUnique[yUnique.length - 1], true);
            let perimeter = [
                [leftedge, topedge],
                [rightedge, topedge],
                [rightedge, bottomedge],
                [leftedge, bottomedge],
            ];

            // Make black background
            makeBackground(svg, perimeter);

            // Make contour fills
            makeFills(svg, pathinfo, perimeter, colorScale);
        }

        // ----------------------------- interpolateGrid -------------------------------------------

        function interpolateGrid(x, y, z) {
            let xUnique = x
                    .concat()
                    .sort((a, b) => a - b)
                    .filter(function (el, i, a) {
                        return i === a.indexOf(el);
                    }),
                yUnique = y
                    .concat()
                    .sort((a, b) => a - b)
                    .filter(function (el, i, a) {
                        return i === a.indexOf(el);
                    }),
                zGrid = new Array(yUnique.length),
                xHash = {},
                yHash = {};

            for (let row = 0; row < zGrid.length; row++) {
                zGrid[row] = new Array(xUnique.length);
            }

            for (let idx = 0; idx < x.length; idx++) {
                xHash[x[idx]] = xHash[x[idx]] !== undefined ? xHash[x[idx]] : xUnique.indexOf(x[idx]);
                yHash[y[idx]] = yHash[y[idx]] !== undefined ? yHash[y[idx]] : yUnique.indexOf(y[idx]);

                let row = yHash[y[idx]],
                    col = xHash[x[idx]];

                zGrid[row][col] = z[idx];
            }

            let empties = findEmpties(zGrid);

            return {
                xUnique: xUnique,
                yUnique: yUnique,
                zGrid: interp2d(zGrid, empties),
            };
        }

        // ----------------------------- findEmpties -------------------------------------------
        // https://github.com/plotly/plotly.js/blob/v1.54.7/src/traces/heatmap/find_empties.js

        /* Return a list of empty points in 2D array z
         * each empty point z[i][j] gives an array [i, j, neighborCount]
         * neighborCount is the count of 4 nearest neighbors that DO exist
         * this is to give us an order of points to evaluate for interpolation.
         * if no neighbors exist, we iteratively look for neighbors that HAVE
         * neighbors, and add a fractional neighborCount
         */
        function findEmpties(z) {
            var empties = [];
            var neighborHash = {};
            var noNeighborList = [];
            var nextRow = z[0];
            var row = [];
            var blank = [0, 0, 0];
            var rowLength = z[0].length;
            var prevRow;
            var i;
            var j;
            var thisPt;
            var p;
            var neighborCount;
            var newNeighborHash;
            var foundNewNeighbors;

            for (i = 0; i < z.length; i++) {
                prevRow = row;
                row = nextRow;
                nextRow = z[i + 1] || [];
                for (j = 0; j < rowLength; j++) {
                    if (row[j] === undefined) {
                        neighborCount =
                            (row[j - 1] !== undefined ? 1 : 0) +
                            (row[j + 1] !== undefined ? 1 : 0) +
                            (prevRow[j] !== undefined ? 1 : 0) +
                            (nextRow[j] !== undefined ? 1 : 0);

                        if (neighborCount) {
                            // for this purpose, don't count off-the-edge points
                            // as undefined neighbors
                            if (i === 0) neighborCount++;
                            if (j === 0) neighborCount++;
                            if (i === z.length - 1) neighborCount++;
                            if (j === row.length - 1) neighborCount++;

                            // if all neighbors that could exist do, we don't
                            // need this for finding farther neighbors
                            if (neighborCount < 4) {
                                neighborHash[[i, j]] = [i, j, neighborCount];
                            }

                            empties.push([i, j, neighborCount]);
                        } else noNeighborList.push([i, j]);
                    }
                }
            }

            while (noNeighborList.length) {
                newNeighborHash = {};
                foundNewNeighbors = false;

                // look for cells that now have neighbors but didn't before
                for (p = noNeighborList.length - 1; p >= 0; p--) {
                    thisPt = noNeighborList[p];
                    i = thisPt[0];
                    j = thisPt[1];

                    neighborCount =
                        ((neighborHash[[i - 1, j]] || blank)[2] +
                            (neighborHash[[i + 1, j]] || blank)[2] +
                            (neighborHash[[i, j - 1]] || blank)[2] +
                            (neighborHash[[i, j + 1]] || blank)[2]) /
                        20;

                    if (neighborCount) {
                        newNeighborHash[thisPt] = [i, j, neighborCount];
                        noNeighborList.splice(p, 1);
                        foundNewNeighbors = true;
                    }
                }

                if (!foundNewNeighbors) {
                    throw 'findEmpties iterated with no new neighbors';
                }

                // put these new cells into the main neighbor list
                for (thisPt in newNeighborHash) {
                    neighborHash[thisPt] = newNeighborHash[thisPt];
                    empties.push(newNeighborHash[thisPt]);
                }
            }

            // sort the full list in descending order of neighbor count
            return empties.sort(function (a, b) {
                return b[2] - a[2];
            });
        }

        // ----------------------------- interp2d -------------------------------------------
        // https://github.com/plotly/plotly.js/blob/v1.54.7/src/traces/heatmap/interp2d.js

        var INTERPTHRESHOLD = 1e-2;
        var NEIGHBORSHIFTS = [
            [-1, 0],
            [1, 0],
            [0, -1],
            [0, 1],
        ];

        function correctionOvershoot(maxFractionalChange) {
            // start with less overshoot, until we know it's converging,
            // then ramp up the overshoot for faster convergence
            return 0.5 - 0.25 * Math.min(1, maxFractionalChange * 0.5);
        }

        /*
         * interp2d: Fill in missing data from a 2D array using an iterative
         *   poisson equation solver with zero-derivative BC at edges.
         *   Amazingly, this just amounts to repeatedly averaging all the existing
         *   nearest neighbors, at least if we don't take x/y scaling into account,
         *   which is the right approach here where x and y may not even have the
         *   same units.
         *
         * @param {array of arrays} z
         *      The 2D array to fill in. Will be mutated here. Assumed to already be
         *      cleaned, so all entries are numbers except gaps, which are `undefined`.
         * @param {array of arrays} emptyPoints
         *      Each entry [i, j, neighborCount] for empty points z[i][j] and the number
         *      of neighbors that are *not* missing. Assumed to be sorted from most to
         *      least neighbors, as produced by heatmap/find_empties.
         */
        function interp2d(z, emptyPoints) {
            var maxFractionalChange = 1;
            var i;

            // one pass to fill in a starting value for all the empties
            iterateInterp2d(z, emptyPoints);

            // we're don't need to iterate lone empties - remove them
            for (i = 0; i < emptyPoints.length; i++) {
                if (emptyPoints[i][2] < 4) break;
            }
            // but don't remove these points from the original array,
            // we'll use them for masking, so make a copy.
            emptyPoints = emptyPoints.slice(i);

            for (i = 0; i < 100 && maxFractionalChange > INTERPTHRESHOLD; i++) {
                maxFractionalChange = iterateInterp2d(z, emptyPoints, correctionOvershoot(maxFractionalChange));
            }

            return z;
        }

        function iterateInterp2d(z, emptyPoints, overshoot) {
            var maxFractionalChange = 0;
            var thisPt;
            var i;
            var j;
            var p;
            var q;
            var neighborShift;
            var neighborRow;
            var neighborVal;
            var neighborCount;
            var neighborSum;
            var initialVal;
            var minNeighbor;
            var maxNeighbor;

            for (p = 0; p < emptyPoints.length; p++) {
                thisPt = emptyPoints[p];
                i = thisPt[0];
                j = thisPt[1];
                initialVal = z[i][j];
                neighborSum = 0;
                neighborCount = 0;

                for (q = 0; q < 4; q++) {
                    neighborShift = NEIGHBORSHIFTS[q];
                    neighborRow = z[i + neighborShift[0]];
                    if (!neighborRow) continue;
                    neighborVal = neighborRow[j + neighborShift[1]];
                    if (neighborVal !== undefined) {
                        if (neighborSum === 0) {
                            minNeighbor = maxNeighbor = neighborVal;
                        } else {
                            minNeighbor = Math.min(minNeighbor, neighborVal);
                            maxNeighbor = Math.max(maxNeighbor, neighborVal);
                        }
                        neighborCount++;
                        neighborSum += neighborVal;
                    }
                }

                if (neighborCount === 0) {
                    throw 'iterateInterp2d order is wrong: no defined neighbors';
                }

                // this is the laplace equation interpolation:
                // each point is just the average of its neighbors
                // note that this ignores differential x/y scaling
                // which I think is the right approach, since we
                // don't know what that scaling means
                z[i][j] = neighborSum / neighborCount;

                if (initialVal === undefined) {
                    if (neighborCount < 4) maxFractionalChange = 1;
                } else {
                    // we can make large empty regions converge faster
                    // if we overshoot the change vs the previous value
                    z[i][j] = (1 + overshoot) * z[i][j] - overshoot * initialVal;

                    if (maxNeighbor > minNeighbor) {
                        maxFractionalChange = Math.max(
                            maxFractionalChange,
                            Math.abs(z[i][j] - initialVal) / (maxNeighbor - minNeighbor)
                        );
                    }
                }
            }

            return maxFractionalChange;
        }

        // ----------------------------- setContours ---------------------------------------------
        // https://github.com/plotly/plotly.js/blob/v1.54.7/src/traces/contour/set_contours.js

        function setContours(zmin, zmax, ncontours) {
            /**
             * return the smallest element from (sorted) array arrayIn that's bigger than val,
             * or (reverse) the largest element smaller than val
             * used to find the best tick given the minimum (non-rounded) tick
             * particularly useful for date/time where things are not powers of 10
             * binary search is probably overkill here...
             */
            function roundUp(val, arrayIn, reverse) {
                var low = 0;
                var high = arrayIn.length - 1;
                var mid;
                var c = 0;
                var dlow = reverse ? 0 : 1;
                var dhigh = reverse ? 1 : 0;
                var rounded = reverse ? Math.ceil : Math.floor;
                // c is just to avoid infinite loops if there's an error
                while (low < high && c++ < 100) {
                    mid = rounded((low + high) / 2);
                    if (arrayIn[mid] <= val) low = mid + dlow;
                    else high = mid - dhigh;
                }
                return arrayIn[low];
            }
            let roundBase10 = [2, 5, 10];
            let contours = {};
            let roughContourSize = (zmax - zmin) / ncontours;
            let base = Math.pow(10, Math.floor(Math.log(roughContourSize) / Math.LN10));
            contours.size = base * roundUp(roughContourSize / base, roundBase10);
            contours.start = zmin - contours.size;
            // move the end of the contours a little to prevent losing the last contour to rounding errors
            contours.end = zmax + contours.size / 1e6;

            // if you set a small ncontours, *and* the ends are exactly on zmin/zmax
            // there's an edge case where start > end now. Make sure there's at least
            // one meaningful contour, put it midway between the crossed values
            if (contours.start > contours.end) {
                contours.start = contours.end = (contours.start + contours.end) / 2;
            }

            return contours;
        }

        // ----------------------------- emptyPathinfo -------------------------------------------
        // https://github.com/plotly/plotly.js/blob/v1.54.7/src/traces/contour/empty_pathinfo.js
        function emptyPathinfo(contours, xaxis, yaxis, xUnique, yUnique, zGrid, smoothing) {
            setScale(xaxis);
            setScale(yaxis);

            var pathinfo = [];

            for (var ci = contours.start; ci < contours.end; ci += contours.size) {
                pathinfo.push({
                    level: ci,
                    // all the cells with nontrivial marching index
                    crossings: {},
                    // starting points on the edges of the lattice for each contour
                    starts: [],
                    // all unclosed paths (may have less items than starts,
                    // if a path is closed by rounding)
                    edgepaths: [],
                    // all closed paths
                    paths: [],
                    x: xUnique,
                    y: yUnique,
                    xaxis: xaxis,
                    yaxis: yaxis,
                    z: zGrid,
                    smoothing: smoothing,
                });

                if (pathinfo.length > 1000) {
                    // Too many contours, clipping at 1000
                    break;
                }
            }
            return pathinfo;
        }

        // ----------------------------- makeCrossings -------------------------------------------
        // https://github.com/plotly/plotly.js/blob/v1.54.7/src/traces/contour/make_crossings.js
        var constants = {
            // some constants to help with marching squares algorithm
            // where does the path start for each index?
            BOTTOMSTART: [1, 9, 13, 104, 713],
            TOPSTART: [4, 6, 7, 104, 713],
            LEFTSTART: [8, 12, 14, 208, 1114],
            RIGHTSTART: [2, 3, 11, 208, 1114],

            // which way [dx,dy] do we leave a given index?
            // saddles are already disambiguated
            NEWDELTA: [
                null,
                [-1, 0],
                [0, -1],
                [-1, 0],
                [1, 0],
                null,
                [0, -1],
                [-1, 0],
                [0, 1],
                [0, 1],
                null,
                [0, 1],
                [1, 0],
                [1, 0],
                [0, -1],
            ],

            // for each saddle, the first index here is used
            // for dx||dy<0, the second for dx||dy>0
            CHOOSESADDLE: {
                104: [4, 1],
                208: [2, 8],
                713: [7, 13],
                1114: [11, 14],
            },

            // after one index has been used for a saddle, which do we
            // substitute to be used up later?
            SADDLEREMAINDER: {
                1: 4,
                2: 8,
                4: 1,
                7: 13,
                8: 2,
                11: 14,
                13: 7,
                14: 11,
            },
        };

        // Calculate all the marching indices, for ALL levels at once.
        // since we want to be exhaustive we'll check for contour crossings
        // at every intersection, rather than just following a path
        // TODO: shorten the inner loop to only the relevant levels
        function makeCrossings(pathinfo) {
            var z = pathinfo[0].z;
            var m = z.length;
            var n = z[0].length; // we already made sure z isn't ragged in interp2d
            var twoWide = m === 2 || n === 2;
            var xi;
            var yi;
            var startIndices;
            var ystartIndices;
            var label;
            var corners;
            var mi;
            var pi;
            var i;

            for (yi = 0; yi < m - 1; yi++) {
                ystartIndices = [];
                if (yi === 0) ystartIndices = ystartIndices.concat(constants.BOTTOMSTART);
                if (yi === m - 2) ystartIndices = ystartIndices.concat(constants.TOPSTART);

                for (xi = 0; xi < n - 1; xi++) {
                    startIndices = ystartIndices.slice();
                    if (xi === 0) startIndices = startIndices.concat(constants.LEFTSTART);
                    if (xi === n - 2) startIndices = startIndices.concat(constants.RIGHTSTART);

                    label = xi + ',' + yi;
                    corners = [
                        [z[yi][xi], z[yi][xi + 1]],
                        [z[yi + 1][xi], z[yi + 1][xi + 1]],
                    ];
                    for (i = 0; i < pathinfo.length; i++) {
                        pi = pathinfo[i];
                        mi = getMarchingIndex(pi.level, corners);
                        if (!mi) continue;

                        pi.crossings[label] = mi;
                        if (startIndices.indexOf(mi) !== -1) {
                            pi.starts.push([xi, yi]);
                            if (twoWide && startIndices.indexOf(mi, startIndices.indexOf(mi) + 1) !== -1) {
                                // the same square has starts from opposite sides
                                // it's not possible to have starts on opposite edges
                                // of a corner, only a start and an end...
                                // but if the array is only two points wide (either way)
                                // you can have starts on opposite sides.
                                pi.starts.push([xi, yi]);
                            }
                        }
                    }
                }
            }
        }

        // modified marching squares algorithm,
        // so we disambiguate the saddle points from the start
        // and we ignore the cases with no crossings
        // the index I'm using is based on:
        // http://en.wikipedia.org/wiki/Marching_squares
        // except that the saddles bifurcate and I represent them
        // as the decimal combination of the two appropriate
        // non-saddle indices
        function getMarchingIndex(val, corners) {
            var mi =
                (corners[0][0] > val ? 0 : 1) +
                (corners[0][1] > val ? 0 : 2) +
                (corners[1][1] > val ? 0 : 4) +
                (corners[1][0] > val ? 0 : 8);
            if (mi === 5 || mi === 10) {
                var avg = (corners[0][0] + corners[0][1] + corners[1][0] + corners[1][1]) / 4;
                // two peaks with a big valley
                if (val > avg) return mi === 5 ? 713 : 1114;
                // two valleys with a big ridge
                return mi === 5 ? 104 : 208;
            }
            return mi === 15 ? 0 : mi;
        }

        //  ----------------------------------- setConvert ---------------------------------------
        // https://github.com/plotly/plotly.js/blob/v1.54.7/src/plots/cartesian/set_convert.js

        function c2p(axis) {
            function l2p(v) {
                return d3.round(axis._b + axis._m * v, 2);
            }

            return l2p;
        }

        function setScale(axis) {
            let rl0 = axis.range[0],
                rl1 = axis.range[1],
                axLetter = axis.letter;

            if (axLetter === 'y') {
                axis._m = axis.height / (rl0 - rl1);
                axis._b = -axis._m * rl1;
            } else {
                axis._m = axis.width / (rl1 - rl0);
                axis._b = -axis._m * rl0;
            }
        }

        // ----------------------------------- findAllPaths ---------------------------------------
        // https://github.com/plotly/plotly.js/blob/v1.54.7/src/traces/contour/find_all_paths.js

        function findAllPaths(pathinfo, xtol, ytol) {
            var cnt, startLoc, i, pi, j;

            // Default just passes these values through as they were before:
            xtol = xtol || 0.01;
            ytol = ytol || 0.01;

            for (i = 0; i < pathinfo.length; i++) {
                pi = pathinfo[i];

                for (j = 0; j < pi.starts.length; j++) {
                    startLoc = pi.starts[j];
                    makePath(pi, startLoc, 'edge', xtol, ytol);
                }

                cnt = 0;
                while (Object.keys(pi.crossings).length && cnt < 10000) {
                    cnt++;
                    startLoc = Object.keys(pi.crossings)[0].split(',').map(Number);
                    makePath(pi, startLoc, undefined, xtol, ytol);
                }
            }
        }

        function equalPts(pt1, pt2, xtol, ytol) {
            return Math.abs(pt1[0] - pt2[0]) < xtol && Math.abs(pt1[1] - pt2[1]) < ytol;
        }

        // distance in index units - uses the 3rd and 4th items in points
        function ptDist(pt1, pt2) {
            var dx = pt1[2] - pt2[2];
            var dy = pt1[3] - pt2[3];
            return Math.sqrt(dx * dx + dy * dy);
        }

        function makePath(pi, loc, edgeflag, xtol, ytol) {
            var locStr = loc.join(',');
            var mi = pi.crossings[locStr];
            var marchStep = getStartStep(mi, edgeflag, loc);
            // start by going backward a half step and finding the crossing point
            var pts = [getInterpPx(pi, loc, [-marchStep[0], -marchStep[1]])];
            var m = pi.z.length;
            var n = pi.z[0].length;
            var startLoc = loc.slice();
            var startStep = marchStep.slice();
            var cnt;

            // now follow the path
            for (cnt = 0; cnt < 10000; cnt++) {
                // just to avoid infinite loops
                if (mi > 20) {
                    mi = constants.CHOOSESADDLE[mi][(marchStep[0] || marchStep[1]) < 0 ? 0 : 1];
                    pi.crossings[locStr] = constants.SADDLEREMAINDER[mi];
                } else {
                    delete pi.crossings[locStr];
                }

                marchStep = constants.NEWDELTA[mi];
                if (!marchStep) {
                    break;
                }

                // find the crossing a half step forward, and then take the full step
                pts.push(getInterpPx(pi, loc, marchStep));
                loc[0] += marchStep[0];
                loc[1] += marchStep[1];
                locStr = loc.join(',');

                // don't include the same point multiple times
                if (equalPts(pts[pts.length - 1], pts[pts.length - 2], xtol, ytol)) pts.pop();

                var atEdge =
                    (marchStep[0] && (loc[0] < 0 || loc[0] > n - 2)) ||
                    (marchStep[1] && (loc[1] < 0 || loc[1] > m - 2));

                var closedLoop =
                    loc[0] === startLoc[0] &&
                    loc[1] === startLoc[1] &&
                    marchStep[0] === startStep[0] &&
                    marchStep[1] === startStep[1];

                // have we completed a loop, or reached an edge?
                if (closedLoop || (edgeflag && atEdge)) break;

                mi = pi.crossings[locStr];
            }

            var closedpath = equalPts(pts[0], pts[pts.length - 1], xtol, ytol);
            var totaldist = 0;
            var distThresholdFactor = 0.2 * pi.smoothing;
            var alldists = [];
            var cropstart = 0;
            var distgroup, cnt2, cnt3, newpt, ptcnt, ptavg, thisdist, i, j, edgepathi, edgepathj;

            /*
             * Check for points that are too close together (<1/5 the average dist
             * *in grid index units* (important for log axes and nonuniform grids),
             * less if less smoothed) and just take the center (or avg of center 2).
             * This cuts down on funny behavior when a point is very close to a
             * contour level.
             */
            for (cnt = 1; cnt < pts.length; cnt++) {
                thisdist = ptDist(pts[cnt], pts[cnt - 1]);
                totaldist += thisdist;
                alldists.push(thisdist);
            }

            var distThreshold = (totaldist / alldists.length) * distThresholdFactor;

            function getpt(i) {
                return pts[i % pts.length];
            }

            for (cnt = pts.length - 2; cnt >= cropstart; cnt--) {
                distgroup = alldists[cnt];
                if (distgroup < distThreshold) {
                    cnt3 = 0;
                    for (cnt2 = cnt - 1; cnt2 >= cropstart; cnt2--) {
                        if (distgroup + alldists[cnt2] < distThreshold) {
                            distgroup += alldists[cnt2];
                        } else break;
                    }

                    // closed path with close points wrapping around the boundary?
                    if (closedpath && cnt === pts.length - 2) {
                        for (cnt3 = 0; cnt3 < cnt2; cnt3++) {
                            if (distgroup + alldists[cnt3] < distThreshold) {
                                distgroup += alldists[cnt3];
                            } else break;
                        }
                    }
                    ptcnt = cnt - cnt2 + cnt3 + 1;
                    ptavg = Math.floor((cnt + cnt2 + cnt3 + 2) / 2);

                    // either endpoint included: keep the endpoint
                    if (!closedpath && cnt === pts.length - 2) newpt = pts[pts.length - 1];
                    else if (!closedpath && cnt2 === -1) newpt = pts[0];
                    // odd # of points - just take the central one
                    else if (ptcnt % 2) newpt = getpt(ptavg);
                    // even # of pts - average central two
                    else {
                        newpt = [
                            (getpt(ptavg)[0] + getpt(ptavg + 1)[0]) / 2,
                            (getpt(ptavg)[1] + getpt(ptavg + 1)[1]) / 2,
                        ];
                    }

                    pts.splice(cnt2 + 1, cnt - cnt2 + 1, newpt);
                    cnt = cnt2 + 1;
                    if (cnt3) cropstart = cnt3;
                    if (closedpath) {
                        if (cnt === pts.length - 2) pts[cnt3] = pts[pts.length - 1];
                        else if (cnt === 0) pts[pts.length - 1] = pts[0];
                    }
                }
            }
            pts.splice(0, cropstart);

            // done with the index parts - remove them so path generation works right
            // because it depends on only having [xpx, ypx]
            for (cnt = 0; cnt < pts.length; cnt++) pts[cnt].length = 2;

            // don't return single-point paths (ie all points were the same
            // so they got deleted?)
            if (pts.length < 2) return;
            else if (closedpath) {
                pts.pop();
                pi.paths.push(pts);
            } else {
                // edge path - does it start where an existing edge path ends, or vice versa?
                var merged = false;
                for (i = 0; i < pi.edgepaths.length; i++) {
                    edgepathi = pi.edgepaths[i];
                    if (!merged && equalPts(edgepathi[0], pts[pts.length - 1], xtol, ytol)) {
                        pts.pop();
                        merged = true;

                        // now does it ALSO meet the end of another (or the same) path?
                        var doublemerged = false;
                        for (j = 0; j < pi.edgepaths.length; j++) {
                            edgepathj = pi.edgepaths[j];
                            if (equalPts(edgepathj[edgepathj.length - 1], pts[0], xtol, ytol)) {
                                doublemerged = true;
                                pts.shift();
                                pi.edgepaths.splice(i, 1);
                                if (j === i) {
                                    // the path is now closed
                                    pi.paths.push(pts.concat(edgepathj));
                                } else {
                                    if (j > i) j--;
                                    pi.edgepaths[j] = edgepathj.concat(pts, edgepathi);
                                }
                                break;
                            }
                        }
                        if (!doublemerged) {
                            pi.edgepaths[i] = pts.concat(edgepathi);
                        }
                    }
                }
                for (i = 0; i < pi.edgepaths.length; i++) {
                    if (merged) break;
                    edgepathi = pi.edgepaths[i];
                    if (equalPts(edgepathi[edgepathi.length - 1], pts[0], xtol, ytol)) {
                        pts.shift();
                        pi.edgepaths[i] = edgepathi.concat(pts);
                        merged = true;
                    }
                }

                if (!merged) pi.edgepaths.push(pts);
            }
        }

        // special function to get the marching step of the
        // first point in the path (leading to loc)
        function getStartStep(mi, edgeflag, loc) {
            var dx = 0;
            var dy = 0;
            if (mi > 20 && edgeflag) {
                // these saddles start at +/- x
                if (mi === 208 || mi === 1114) {
                    // if we're starting at the left side, we must be going right
                    dx = loc[0] === 0 ? 1 : -1;
                } else {
                    // if we're starting at the bottom, we must be going up
                    dy = loc[1] === 0 ? 1 : -1;
                }
            } else if (constants.BOTTOMSTART.indexOf(mi) !== -1) dy = 1;
            else if (constants.LEFTSTART.indexOf(mi) !== -1) dx = 1;
            else if (constants.TOPSTART.indexOf(mi) !== -1) dy = -1;
            else dx = -1;
            return [dx, dy];
        }

        /*
         * Find the pixel coordinates of a particular crossing
         *
         * @param {object} pi: the pathinfo object at this level
         * @param {array} loc: the grid index [x, y] of the crossing
         * @param {array} step: the direction [dx, dy] we're moving on the grid
         *
         * @return {array} [xpx, ypx, xi, yi]: the first two are the pixel location,
         *   the next two are the interpolated grid indices, which we use for
         *   distance calculations to delete points that are too close together.
         *   This is important when the grid is nonuniform (and most dramatically when
         *   we're on log axes and include invalid (0 or negative) values.
         *   It's crucial to delete these extra two before turning an array of these
         *   points into a path, because those routines require length-2 points.
         */
        function getInterpPx(pi, loc, step) {
            var locx = loc[0] + Math.max(step[0], 0);
            var locy = loc[1] + Math.max(step[1], 0);
            var zxy = pi.z[locy][locx];
            var xa = pi.xaxis;
            var ya = pi.yaxis;

            if (step[1]) {
                var dx = (pi.level - zxy) / (pi.z[locy][locx + 1] - zxy);

                return [
                    c2p(xa)((1 - dx) * pi.x[locx] + dx * pi.x[locx + 1], true),
                    c2p(ya)(pi.y[locy], true),
                    locx + dx,
                    locy,
                ];
            } else {
                var dy = (pi.level - zxy) / (pi.z[locy + 1][locx] - zxy);
                return [
                    c2p(xa)(pi.x[locx], true),
                    c2p(ya)((1 - dy) * pi.y[locy] + dy * pi.y[locy + 1], true),
                    locx,
                    locy + dy,
                ];
            }
        }

        // ----------------------------------- closeBoundaries ---------------------------------------
        // https://github.com/plotly/plotly.js/blob/v1.54.7/src/traces/contour/close_boundaries.js

        function closeBoundaries(pathinfo) {
            var pi0 = pathinfo[0];
            var z = pi0.z;
            var i;

            var edgeVal2 = Math.min(z[0][0], z[0][1]);

            for (i = 0; i < pathinfo.length; i++) {
                var pi = pathinfo[i];
                pi.prefixBoundary =
                    !pi.edgepaths.length && (edgeVal2 > pi.level || (pi.starts.length && edgeVal2 === pi.level));
            }
        }

        // ----------------------------------- svg paths smoothing ---------------------------------------
        // https://github.com/plotly/plotly.js/blob/v1.54.7/src/components/drawing/index.js#L772

        // generalized Catmull-Rom splines, per
        // http://www.cemyuksel.com/research/catmullrom_param/catmullrom.pdf
        var CatmullRomExp = 0.5;
        function smoothopen(pts, smoothness) {
            if (pts.length < 3) {
                return 'M' + pts.join('L');
            }
            var path = 'M' + pts[0];
            var tangents = [];
            var i;
            for (i = 1; i < pts.length - 1; i++) {
                tangents.push(makeTangent(pts[i - 1], pts[i], pts[i + 1], smoothness));
            }
            path += 'Q' + tangents[0][0] + ' ' + pts[1];
            for (i = 2; i < pts.length - 1; i++) {
                path += 'C' + tangents[i - 2][1] + ' ' + tangents[i - 1][0] + ' ' + pts[i];
            }
            path += 'Q' + tangents[pts.length - 3][1] + ' ' + pts[pts.length - 1];
            return path;
        }

        function smoothclosed(pts, smoothness) {
            if (pts.length < 3) {
                return 'M' + pts.join('L') + 'Z';
            }
            var path = 'M' + pts[0];
            var pLast = pts.length - 1;
            var tangents = [makeTangent(pts[pLast], pts[0], pts[1], smoothness)];
            var i;
            for (i = 1; i < pLast; i++) {
                tangents.push(makeTangent(pts[i - 1], pts[i], pts[i + 1], smoothness));
            }
            tangents.push(makeTangent(pts[pLast - 1], pts[pLast], pts[0], smoothness));

            for (i = 1; i <= pLast; i++) {
                path += 'C' + tangents[i - 1][1] + ' ' + tangents[i][0] + ' ' + pts[i];
            }
            path += 'C' + tangents[pLast][1] + ' ' + tangents[0][0] + ' ' + pts[0] + 'Z';
            return path;
        }

        function makeTangent(prevpt, thispt, nextpt, smoothness) {
            var d1x = prevpt[0] - thispt[0];
            var d1y = prevpt[1] - thispt[1];
            var d2x = nextpt[0] - thispt[0];
            var d2y = nextpt[1] - thispt[1];
            var d1a = Math.pow(d1x * d1x + d1y * d1y, CatmullRomExp / 2);
            var d2a = Math.pow(d2x * d2x + d2y * d2y, CatmullRomExp / 2);
            var numx = (d2a * d2a * d1x - d1a * d1a * d2x) * smoothness;
            var numy = (d2a * d2a * d1y - d1a * d1a * d2y) * smoothness;
            var denom1 = 3 * d2a * (d1a + d2a);
            var denom2 = 3 * d1a * (d1a + d2a);
            return [
                [
                    d3.round(thispt[0] + (denom1 && numx / denom1), 2),
                    d3.round(thispt[1] + (denom1 && numy / denom1), 2),
                ],
                [
                    d3.round(thispt[0] - (denom2 && numx / denom2), 2),
                    d3.round(thispt[1] - (denom2 && numy / denom2), 2),
                ],
            ];
        }

        // ----------------------------------- contours drawing ---------------------------------------
        // https://github.com/plotly/plotly.js/blob/v1.54.7/src/traces/contour/plot.js

        /**
         * Append element to DOM only if not present.
         *
         * @param {d3 selection} parent : parent selection of the element in question
         * @param {string} nodeType : node type of element to append
         * @param {string} className (optional) : class name of element in question
         * @param {fn} enterFn (optional) : optional fn applied to entering elements only
         * @return {d3 selection} selection of new layer
         */
        function ensureSingle(parent, nodeType, className) {
            var sel = parent.select(nodeType + (className ? '.' + className : ''));
            if (sel.size()) return sel;

            var layer = parent.append(nodeType);
            if (className) layer.classed(className, true);

            return layer;
        }

        function makeBackground(plotgroup, perimeter) {
            var bggroup = ensureSingle(plotgroup, 'g', 'contourbg');

            var bgfill = bggroup.selectAll('path').data([0]);
            bgfill.enter().append('path');
            bgfill.exit().remove();
            bgfill.attr('d', 'M' + perimeter.join('L') + 'Z').style('stroke', 'none');
        }

        function makeFills(plotgroup, pathinfo, perimeter, colorScale) {
            var boundaryPath = 'M' + perimeter.join('L') + 'Z';

            closeBoundaries(pathinfo);

            var fillgroup = ensureSingle(plotgroup, 'g', 'contourfill');

            var fillitems = fillgroup.selectAll('path').data(pathinfo);
            fillitems.enter().append('path');
            fillitems.exit().remove();
            fillitems.each(function (pi) {
                // join all paths for this level together into a single path
                // first follow clockwise around the perimeter to close any open paths
                // if the whole perimeter is above this level, start with a path
                // enclosing the whole thing. With all that, the parity should mean
                // that we always fill everything above the contour, nothing below
                var fullpath = (pi.prefixBoundary ? boundaryPath : '') + joinAllPaths(pi, perimeter);

                if (!fullpath) {
                    d3.select(this).remove();
                } else {
                    d3.select(this)
                        .attr('d', fullpath)
                        .style('stroke', 'none')
                        .style('fill', function (d) {
                            return colorScale(d.level);
                        });
                }
            });

            // Add clipPath element to clip paths that could go outside of the box after
            // smoothing. This seemingly overcomplicated method can be replaced by:
            // fillgroup.style('clip-path', `path(${boundaryPath})`)
            // when chrome is compatible with defining the path in the CSS property
            // (already works in firefox)
            let clipPathUUID = window.crypto.getRandomValues(new Uint32Array(1))[0].toString(16);
            fillgroup.style('clip-path', `url(#${clipPathUUID})`)
                .append('clipPath')
                .attr('id', clipPathUUID)
                .append('path')
                .attr('d', boundaryPath);
        }

        function joinAllPaths(pi, perimeter) {
            var fullpath = '';
            var i = 0;
            var startsleft = pi.edgepaths.map(function (v, i) {
                return i;
            });
            var newloop = true;
            var endpt;
            var newendpt;
            var cnt;
            var nexti;
            var possiblei;
            var addpath;

            function istop(pt) {
                return Math.abs(pt[1] - perimeter[0][1]) < 0.01;
            }
            function isbottom(pt) {
                return Math.abs(pt[1] - perimeter[2][1]) < 0.01;
            }
            function isleft(pt) {
                return Math.abs(pt[0] - perimeter[0][0]) < 0.01;
            }
            function isright(pt) {
                return Math.abs(pt[0] - perimeter[2][0]) < 0.01;
            }

            while (startsleft.length) {
                addpath = smoothopen(pi.edgepaths[i], pi.smoothing);
                fullpath += newloop ? addpath : addpath.replace(/^M/, 'L');
                startsleft.splice(startsleft.indexOf(i), 1);
                endpt = pi.edgepaths[i][pi.edgepaths[i].length - 1];
                nexti = -1;

                // now loop through sides, moving our endpoint until we find a new start
                for (cnt = 0; cnt < 4; cnt++) {
                    // just to prevent infinite loops
                    if (!endpt || endpt.length < 2) {
                        break;
                    }

                    if (istop(endpt) && !isright(endpt)) newendpt = perimeter[1];
                    // right top
                    else if (isleft(endpt)) newendpt = perimeter[0];
                    // left top
                    else if (isbottom(endpt)) newendpt = perimeter[3];
                    // right bottom
                    else if (isright(endpt)) newendpt = perimeter[2]; // left bottom
                    else newendpt = []; // error case

                    for (possiblei = 0; possiblei < pi.edgepaths.length; possiblei++) {
                        var ptNew = pi.edgepaths[possiblei][0];
                        // is ptNew on the (horz. or vert.) segment from endpt to newendpt?
                        if (newendpt.length) {
                            if (Math.abs(endpt[0] - newendpt[0]) < 0.01) {
                                if (
                                    Math.abs(endpt[0] - ptNew[0]) < 0.01 &&
                                    (ptNew[1] - endpt[1]) * (newendpt[1] - ptNew[1]) >= 0
                                ) {
                                    newendpt = ptNew;
                                    nexti = possiblei;
                                }
                            } else if (Math.abs(endpt[1] - newendpt[1]) < 0.01) {
                                if (
                                    Math.abs(endpt[1] - ptNew[1]) < 0.01 &&
                                    (ptNew[0] - endpt[0]) * (newendpt[0] - ptNew[0]) >= 0
                                ) {
                                    newendpt = ptNew;
                                    nexti = possiblei;
                                }
                            }
                        }
                    }

                    endpt = newendpt;

                    if (nexti >= 0) break;
                    fullpath += 'L' + newendpt;
                }

                if (nexti === pi.edgepaths.length) {
                    break;
                }

                i = nexti;

                // if we closed back on a loop we already included,
                // close it and start a new loop
                newloop = startsleft.indexOf(i) === -1;
                if (newloop) {
                    i = startsleft[0];
                    fullpath += 'Z';
                }
            }

            // finally add the interior paths
            for (i = 0; i < pi.paths.length; i++) {
                fullpath += smoothclosed(pi.paths[i], pi.smoothing);
            }

            return fullpath;
        }

        return contourPlotFactory;
    });
})();

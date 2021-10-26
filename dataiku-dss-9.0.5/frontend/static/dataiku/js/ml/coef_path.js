(function(){
'use strict';

var app = angular.module('dataiku.ml.report');


app.controller("CoefficientPathController", function($scope, DataikuAPI, $stateParams){

    $scope.data = [];
    $scope.uiModel = {dataIndex: 0};

    DataikuAPI.ml.prediction.getCoefPath($stateParams.fullModelId || $scope.fullModelId).success(function(data) {
       if($.isEmptyObject(data)){
            $scope.noPathFound = true;
            return;
       }

       if(! $scope.isRegression()){
            $scope.data = [];
            for(var i = 0; i < $scope.modelData.classes.length; i++){
                $scope.data.push(data.path.map(function(a){ return a[i];}))
            }
            $scope.selectedClass = $scope.modelData.classes[0];
            $scope.classes = $scope.modelData.classes;
            $scope.uiModel.dataIndex = 0;
       } else {
            $scope.data = [data.path.map(function(a){ return a.map(function(x){ return x[0]; });})];
       }
       $scope.features = data.features;
       $scope.currentIndex = data.currentIndex;
    }).error(setErrorInScope.bind($scope));

});

app.directive("coefficientPath", function(){
    return {
        replace: true,
        templateUrl : '/templates/ml/prediction-model/coef_path_view.html',
        scope: {
            data: '=',
            features: '=',
            currentIndex: '='
        },
        link : function($scope, element, attrs) {

           $scope.slide = 300;
           $scope.windowParams = { displayHelp: true };
           $scope.hideHelp = function(){ $scope.windowParams.displayHelp = false; };
           var slideUnwatch = function(){
            //will be initialized later
           };

            $scope.$watch('data', function(){

            slideUnwatch();

            var width = 700;
            var height = 400;
            d3.select(element[0]).select("#coef-path-container").attr("width", width).attr("height", height);
            var graphSvg = d3.select(element[0]).select("#graph");

            /* Compute the x-axis values for the chart. These are the relative norm of the corresponding vector to plot. */
            var xValues = [];
            var norm = 0.0;
            for(var i = 0; i < $scope.data[0].length; i++){
                var t = $scope.data[$scope.data.length - 1][i];
                norm += t * t;
            }
            for(i = 0; i < $scope.data.length; i++){
                var normI = 0.0;
                for(var j = 0; j < $scope.data[i].length; j++){
                    t = $scope.data[i][j];
                    normI += t * t;
                }
                xValues.push(Math.sqrt(normI / norm));
            }

            /* Compute an index for the slider. This maps the index of the slider to the corresponding cutoff index */
            var sliderIndex = (function(){
                var index = [];
                var currentMapped = 0;
                for(var i = 0; i <= 299; i++){
                    var x = i * 1.0 / 300;
                    if(x > xValues[currentMapped]){
                        currentMapped++;
                    }
                    index.push(currentMapped);
                }
                index.push(xValues.length - 1);
                return index;
            })();

            var nCoef = function(x){
                var n = 0;
                for(var i = 0; i < x.length; i++){
                    if(Math.abs(x[i]) > 1e-6){
                        n++;
                    }
                }
                return n;
            }

            /* Compute the points (normalized 0 to 1) at which there is a coefficient switch */
            var cutoffs = (function(){
                var res = [];
                var cur = nCoef($scope.data[0]);
                for(var i = 1; i < xValues.length; i++){
                    var n = nCoef($scope.data[i]);
                    if(n != cur){
                        cur = n;
                        res.push(xValues[i]);
                    }
                }
                return res;
            })();

            var updateSlider = function(){
                $scope.selectedIndex = sliderIndex[$scope.slide];
                $scope.coefs = $scope.data[$scope.selectedIndex];
                $scope.nCoefs = nCoef($scope.coefs);
            }

            /* Transpose the data so we have series. Note : we might want to do this beforehand to avoid data duplication ?*/
            var series = [];
            for(i = 0; i < $scope.data[0].length; i++){
                var arr = [];
                for(j = 0; j < $scope.data.length; j++){
                    arr.push($scope.data[j][i]);
                }
                series.push(arr);
            }

            var maxY = d3.max($scope.data.map(function(a){ return d3.max(a); }));
            var minY = d3.min($scope.data.map(function(a){ return d3.min(a); }));
            var y = d3.scale.linear().domain([minY, maxY]).range([0, height]);
            var x = d3.scale.linear().domain([0,1]).range([0, width]);

            $scope.coefWidth = function(c){
                return 35 * Math.abs(c) / Math.max(Math.abs(maxY), Math.abs(minY));
            };

            $scope.coefIndex = [];
            for(i = 0; i < $scope.data[0].length; i++){
                $scope.coefIndex.push(i);
            }
            $scope.coefIndex.sort(function(i, j){
                var t = $scope.data.length - 1;
                return Math.abs($scope.data[t][j]) - Math.abs($scope.data[t][i]);
            });

            var index = [];
            for(i = 0; i < $scope.data.length; i++){
                index.push(i);
            }

            $scope.selectedFeature = null;

            $scope.colorScales = d3.scale.category10();

            $scope.featureTextColor = function(i){
                return $scope.selectedFeature == null || $scope.selectedFeature == i ? $scope.colorScales(i) : 'rgba(0,0,0,0.25)';
            }

            $scope.mouseoverCurve = function(i, apply){
                $scope.selectedFeature = i;
                graphSvg.selectAll("path")
                        .filter(function(d){ return !(d[0].fake) && d[0].feature != i;})
                        .attr('stroke-opacity', 0.25)
                        .attr('stroke', "black");
                if(apply){
                    $scope.$apply();
                }
            };

            $scope.mouseoutCurve = function(i, apply){
                $scope.selectedFeature = null;
                graphSvg.selectAll("path")
                        .filter(function(d){ return !(d[0].fake);})
                        .attr('stroke-opacity', 1.0)
                        .attr('stroke', function(d){ return d[0].color; });
                if(apply){
                    $scope.$apply();
                }
            };

            /**/
            var update = function(){
                graphSvg.selectAll('path').remove();
                graphSvg.selectAll('rect').remove();
                graphSvg.selectAll("line").remove();
                graphSvg.selectAll("polyline").remove();
                graphSvg.selectAll("text").remove();

                /*i: feature,
                    index: indices in the x-axis for which to paint,
                    color: color,
                    fake: is it just an overlay*/
                var paintCurve = function(i, index, color, fake){
                    var curve = graphSvg.append("path")
                                        .datum(index.map(function(d){ return {
                                                feature: i, ix: d, fake: fake, color: color};
                                        }))
                                        .attr("fill", "none")
                                        .attr("stroke", color)
                                        .attr("stroke-linejoin", "round")
                                        .attr("stroke-linecap", "round")
                                        .attr("stroke-width", fake ? 10 : 1.5)
                                        .attr("stroke-opacity", fake ? 0.0 : 1.0)
                                        .attr("d", d3.svg.line()
                                                       .x(function(d) { return x(xValues[d.ix]); })
                                                       .y(function(d) { return y(series[i][d.ix]); })
                                        );
                    if(fake){
                        curve.on("mouseover", function(d){
                            $scope.mouseoverCurve(d[0].feature, true);
                        })
                        .on("mouseout", function(d){
                            $scope.mouseoutCurve(d[0].feature, true);
                        });
                    }
                }

                var leftIndex = [];
                var rightIndex = [];
                for(var i = 0; i < $scope.data.length; i++){
                    if(i <= $scope.selectedIndex){
                        leftIndex.push(i);
                    }
                    if(i >= $scope.selectedIndex){
                        rightIndex.push(i);
                    }
                }

                /* create a rectangle to overlay the inactive coefficients */
                graphSvg.append("rect")
                        .attr("height", height)
                        .attr("width", (1.0 - xValues[$scope.selectedIndex]) * width)
                        .attr("x", xValues[$scope.selectedIndex] * width)
                        .attr("fill", "#eaeaea")
                        .attr("fill-opacity", "0.2");

                /* create vertical lines to show coefficient cutoffs */
                for(i = 0; i < cutoffs.length; i++){
                    graphSvg.append("line")
                        .attr("id", "sep-line")
                        .attr("stroke-dasharray", "5, 10")
                        .attr("x1", cutoffs[i] * width)
                        .attr("x2", cutoffs[i] * width)
                        .attr("y1", 0)
                        .attr("y2", height)
                        .attr("stroke", "#666666")
                        .attr("stroke-width", "0.3px");
                }

                /* create a polyline and text to track the current model */
                var paintRight = xValues[$scope.currentIndex] * width + 80 < width;
                var x1 = xValues[$scope.currentIndex] * width;
                var y1 = 0;
                var x2 = xValues[$scope.currentIndex] * width;
                var y2 = height + 30;
                var x3 = xValues[$scope.currentIndex] * width + (paintRight ? 40 : -40);
                var y3 = y2;
                var textX = xValues[$scope.currentIndex] * width + (paintRight ? 55 : -130);
                var textY = height + 35;
                graphSvg.append("polyline")
                        .attr("points", x1 + "," + y1 + " " + x2 + "," + y2 + " " + x3 + "," + y3)
                        .attr("stroke", "black")
                        .attr("stroke-dasharray", "8, 6")
                        .attr("stroke-width", $scope.currentIndex == $scope.selectedIndex ? "3px" : "1.5px")
                        .attr("fill", "none");
                graphSvg.append("text")
                        .text("Current model")
                        .attr("x", textX)
                        .attr("y", textY)
                        .attr("font-weight", $scope.currentIndex == $scope.selectedIndex ? "bold" : "regular");

                /* create a line to follow the current selected coefficients*/
                graphSvg.append("line")
                        .attr("id", "sep-line")
                        .attr("stroke-dasharray", "5, 10")
                        .attr("x1", xValues[$scope.selectedIndex] * width)
                        .attr("x2", xValues[$scope.selectedIndex] * width)
                        .attr("y1", 0)
                        .attr("y2", height)
                        .attr("stroke", $scope.selectedIndex == $scope.currentIndex ? "none" : "#666666")
                        .attr("stroke-width", "2.5px");

                /* paint the coefficient paths */
                for(i = 0; i < series.length; i++){
                    //we always paint a curve and then another transparent larger curve on top for mouse events.
                    //paint left section (active)
                    paintCurve(i, leftIndex, $scope.colorScales(i), false);
                    paintCurve(i, leftIndex, "black", true);
                    //paint inactive right section
                    paintCurve(i, rightIndex, d3.hcl($scope.colorScales(i)).brighter(3).rgb(), false);
                    paintCurve(i, rightIndex, "black", true);
                }

                /* paint the x axis */
                graphSvg.append("line")
                        .attr("x1", 0)
                        .attr("x2", width)
                        .attr("y1", y(0.0))
                        .attr("y2", y(0.0))
                        .attr("stroke", "black")
                        .attr("stroke-width", "1.5px");

            }

            updateSlider();
            update();

            slideUnwatch = $scope.$watch('slide', function(){
                var indexBefore = $scope.selectedIndex;
                updateSlider();
                if(indexBefore != $scope.selectedIndex){
                    update();
                }
            });

            });

        }
    };
});





})();
(function(){
    'use strict';

    angular.module('dataiku.charts')
        .factory('AnimatedChartsUtils', AnimatedChartsUtils)
        .directive('animatedChartSlider', animatedChartSlider);


    function AnimatedChartsUtils($interval) {
        var unwatchers = {}, intervals = {};

        return {
            /**
             * Setup chartHandler.animation (used by the animation widget) for the given chart
             * @param {$scope} chartHandler
             * @param {ChartTensorDataWrapper} chartData
             * @param {ChartDef} chartDef
             * @param {function} drawFrame: drawing callback
             */
            initAnimation: function(chartHandler, chartData, chartDef, drawFrame) {
                if (unwatchers[chartHandler.$id]) {
                    unwatchers[chartHandler.$id]();
                    delete unwatchers[chartHandler.$id];
                }

                if (intervals[chartHandler.$id]) {
                    $interval.cancel(intervals[chartHandler.$id]);
                    delete intervals[chartHandler.$id];
                }

                var animation = chartHandler.animation;

                animation.labelify = function(label) {
                    return label == '___dku_no_value___' ? 'No value' : label;
                };
                animation.labels = chartData.getAxisLabels('animation');

                animation.playing = false;
                if (animation.currentFrame > animation.labels.length) {
                    animation.currentFrame = 0;
                }

                animation.drawFrame = function(frameIdx) {
                    animation.currentFrame = frameIdx;
                };
                animation.chartData = chartData;

                animation.hasNext = function() {
                    return animation.currentFrame < animation.labels.length - 1;
                };

                animation.play = function () {
                    if (animation.playing) {
                        return;
                    }

                    if (animation.currentFrame === animation.labels.length-1) {
                        animation.currentFrame = 0;
                    }
                    animation.playing = true;
                    intervals[chartHandler.$id] = $interval(function() {
                        animation.drawFrame((animation.currentFrame+1)%animation.labels.length);
                        if (!chartDef.animationRepeat && !animation.hasNext()) {
                            animation.pause();
                        }
                    }, (chartDef.animationFrameDuration || 3000));
                };

                animation.dimension = chartDef.animationDimension[0];

                animation.pause = function () {
                    animation.playing = false;
                    $interval.cancel(intervals[chartHandler.$id]);
                };

                animation.drawFram = drawFrame;

                unwatchers[chartHandler.$id] = chartHandler.$watch("animation.currentFrame", function(nv) {
                    if (nv == null) return;
                    drawFrame(nv);
                });

                chartHandler.$watch("chart.def.animationFrameDuration", function(nv) {
                   if (!nv) return;
                   if (animation.playing) {
                       animation.pause();
                       animation.play();
                   }
                });
            }
        };
    }


    function animatedChartSlider(ChartDimension, ChartUADimension) {
        return {
            scope: {
                labels: '=',
                currentFrame: '=',
                dimension: '='
            },
            template: '<div class="horizontal-flex animated-chart-slider" style="align-items: center;">'
                        + '<div class="noflex">{{firstValue}}</div>'
                        + '<div class="progress flex">'
                        +   '<div class="current" style="left:{{cursorLeft}}%; width: {{cursorWidth}}%;" ng-mousedown="startSliding($event)" ng-mouseup="stopSliding()"></div>'
                        + '</div>'
                        + '<div class="noflex">{{lastValue}}</div>'
                    + '</div>',
            link: function($scope, $el) {

                var labelPositions;

                var findClosestIdx = function (x, arr) {
                    var indexArr = arr.map(function(k) { return Math.abs(k.center - x) });
                    var min = Math.min.apply(Math, indexArr);
                    return indexArr.indexOf(min);
                };

                $scope.$watch('labels', function(nv) {
                    if (!nv) return;

                    if (ChartDimension.isUnbinnedNumerical($scope.dimension)) {
                        $scope.firstValue = $scope.labels[0].sortValue;
                        $scope.lastValue = $scope.labels[$scope.labels.length-1].sortValue;
                        var scale = d3.scale.linear()
                            .domain([$scope.labels[0].sortValue, $scope.labels[$scope.labels.length-1].sortValue])
                            .range([0, 100]);
                        labelPositions = $scope.labels.map(function(label) {
                            return {
                                center: scale(label.sortValue),
                                start: scale(label.sortValue)-1,
                                width: 2
                            };
                        });
                    } else if (ChartDimension.isBinnedNumerical($scope.dimension)) {
                        $scope.firstValue = $scope.labels[0].min;
                        $scope.lastValue = $scope.labels[$scope.labels.length-1].max;
                        var linearScale = d3.scale.linear()
                            .domain([$scope.labels[0].min, $scope.labels[$scope.labels.length-1].max])
                            .range([0, 100]);
                        labelPositions = $scope.labels.map(function(label) {
                            return {
                                center: linearScale(label.sortValue),
                                start: linearScale(label.min),
                                width: linearScale(label.max) - linearScale(label.min)
                            };
                        });
                    } else if (ChartDimension.isAlphanumLike($scope.dimension) || ChartUADimension.isDiscreteDate($scope.dimension)) {
                        $scope.firstValue = null;
                        $scope.lastValue = null;
                        var ordinalScale = d3.scale.ordinal()
                            .domain($scope.labels.map(function(d,i) { return i; }))
                            .rangeBands([0, 100]);

                        labelPositions = $scope.labels.map(function(label, i) {
                            return {
                                start: ordinalScale(i),
                                width: ordinalScale.rangeBand(),
                                center: ordinalScale(i) + ordinalScale.rangeBand()/2
                            };
                        });
                    }

                    if ($scope.currentFrame !== null) {
                        $scope.cursorLeft = labelPositions[$scope.currentFrame].start;
                        $scope.cursorWidth = labelPositions[$scope.currentFrame].width;
                    }
                });

                var slideCursor = function($evt) {
                    $evt.preventDefault(); // useful to avoid selecting content while sliding
                    var sliderPosition = $el.offset().left;
                    var xPosition = ($evt.pageX - sliderPosition)/$el.width()*100;
                    $scope.$apply(function() {
                        $scope.currentFrame = findClosestIdx(xPosition, labelPositions);
                    });
                };

                $scope.startSliding = function($evt) {
                    $scope.sliding = true;
                    $(window).on('mouseup.chart-animation.' + $scope.$id, $scope.stopSliding);
                    $(window).on('mousemove.chart-animation' + $scope.$id, slideCursor);
                    $('body').css('cursor', 'move');
                };

                $scope.stopSliding = function() {
                    $scope.sliding = false;
                    $(window).off('mouseup.chart-animation.' + $scope.$id);
                    $(window).off('mousemove.chart-animation' + $scope.$id);
                    $('body').css('cursor', 'auto');
                };

                $scope.$watch('currentFrame', function(nv) {
                    if (nv == null) return;
                    $scope.cursorLeft = labelPositions[nv].start;
                    $scope.cursorWidth = labelPositions[nv].width;
                });
            }
        }
    }

})();
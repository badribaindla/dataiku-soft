(function() {
    'use strict';

    angular.module('dataiku.charts')
        .service("ChartColorScales", ChartColorScales)
        .service("ChartColorUtils", ChartColorUtils)
        .controller("EditCustomPaletteModalController", EditCustomPaletteModalController)
        .directive("palettePickerLogic", palettePickerLogic);

    /**
     * Colors scales creation logic
     */
    function ChartColorScales(ChartUtils, ChartUADimension, ChartDataUtils, StringNormalizer, ChartColorUtils) {

        var svc = {

            /**
             * Create a color scale
             * @param {ChartTensorDataWrapper} chartData
             * @param {ChartDef.java} chartDef
             * @param {AxisSpec} colorSpec
             * @param {$scope} chartHandler
             * @return {*}
             */
            createColorScale: function(chartData, chartDef, colorSpec, chartHandler) {
                if (!colorSpec) return null;

                var colorScale;
                switch (colorSpec.type) {
                    case 'DIMENSION':
                        colorScale = svc.discreteColorScale(chartDef, colorSpec.withRgba, ChartUtils.getColorMeaningInfo(colorSpec.dimension, chartHandler), chartData.getAxisLabels(colorSpec.name));
                        if (colorScale.domain) {
                            if (chartData.axesDef[colorSpec.name] != undefined) {
                                colorScale.domain(chartData.getAxisLabels(colorSpec.name).map(function(d,i) { return i; }));
                            } else {
                                colorScale.domain(chartDef.genericMeasures.map(function(d,i) { return i; }));
                            }
                        }
                        break;
                    case 'MEASURE':
                        if (!colorSpec.domain) {
                            if (colorSpec.measureIdx === undefined || colorSpec.measureIdx < 0) {
                                return null;
                            }
                            colorSpec.domain = ChartDataUtils.getMeasureExtent(chartData.data, colorSpec.measureIdx, true);
                        }

                        if (!colorSpec.values) {
                            if (colorSpec.measureIdx === undefined || colorSpec.measureIdx < 0) {
                                return null;
                            }
                            colorSpec.values = ChartDataUtils.getMeasureValues(chartData.data, colorSpec.measureIdx);
                        }

                        colorScale = svc.continuousColorScale(chartDef, colorSpec.domain[0], colorSpec.domain[1], colorSpec.values, !colorSpec.withRgba);
                        break;
                    case 'UNAGGREGATED':
                        if (!colorSpec.dimension) {
                            return null;
                        }
                        var extent = ChartDataUtils.getUnaggregatedAxisExtent(colorSpec.dimension, colorSpec.data, chartData.data.afterFilterRecords);
                        if (ChartUADimension.isTrueNumerical(colorSpec.dimension) || ChartUADimension.isDateRange(colorSpec.dimension)) {
                            colorScale = svc.continuousColorScale(chartDef, extent.min, extent.max, extent.values, !colorSpec.withRgba);
                            colorScale.isContinuous = true;
                        } else {
                            colorScale = svc.discreteColorScale(chartDef, colorSpec.withRgba, ChartUtils.getColorMeaningInfo(colorSpec.dimension, chartHandler), colorSpec.data.str.sortedMapping);
                            if (colorScale.domain) {
                                colorScale.domain(extent.values.map((v, i) => i));
                            }
                        }
                        break;
                    default:
                        throw new Error("Unknown scale type: " + colorSpec.type);
                }

                if (colorScale) {
                    colorScale.type = colorSpec.type;
                }

                return colorScale;
            },


            /**
             * Create a continuous color scale
             * @param {ChartDef.java} chartDef
             * @param {number} domainMin
             * @param {number} domainMax
             * @param {array} domainValues: values in the domain (not uniques, this is used to compute quantiles)
             * @param {boolean} noRgba: do not include the opacity setting in the color scale
             * @return {*}
             */
            continuousColorScale: function (chartDef, domainMin, domainMax, domainValues, noRgba) {

                var paletteList = chartDef.colorOptions.paletteType === 'DIVERGING' ? dkuColorPalettes.diverging : dkuColorPalettes.continuous;
                var p;

                if (chartDef.colorOptions.colorPalette === '__dku_custom__') {
                    p = chartDef.colorOptions.customPalette;
                } else {
                    p = paletteList.find(p => p.id === chartDef.colorOptions.colorPalette);

                    if (!p) {
                        chartDef.colorOptions.colorPalette = 'default';
                        p = paletteList.find(p => p.id === 'default');
                    }
                }

                // Custom interpolation function to take care of transparency
                function d3_interpolateRgbRound(a, b) {
                    var transparency = !isNaN(chartDef.colorOptions.transparency) ? chartDef.colorOptions.transparency : 1;
                    a = d3.rgb(a);
                    b = d3.rgb(b);
                    var ar = a.r,
                        ag = a.g,
                        ab = a.b,
                        br = b.r - ar,
                        bg = b.g - ag,
                        bb = b.b - ab;
                    return function (t) {
                        var tr = Math.round(ar + br * t);
                        var tg = Math.round(ag + bg * t);
                        var tb = Math.round(ab + bb * t);
                        if (!noRgba) {
                            return ["rgba(", tr, ",", tg, ",", tb, ",", transparency, ")"].join("");
                        } else {
                            return ["rgb(", tr, ",", tg, ",", tb, ")"].join("");
                        }
                    };
                }

                if (p.d3Scale) {
                    return p.d3Scale;
                }

                var innerScale;

                if (chartDef.colorOptions.quantizationMode !== 'QUANTILES') {
                    // We use an innerScale to implement the scale computation mode (linear, log, square, sqrt),
                    // that maps the values to a [0, 1] range that will be the input of the actual color scale

                    if (chartDef.colorOptions.ccScaleMode == "LOG") {
                        innerScale = d3.scale.log();
                        domainMin++;
                        domainMax++;
                        innerScale.mode = 'LOG';
                    } else if (chartDef.colorOptions.ccScaleMode == "SQRT") {
                        innerScale = d3.scale.sqrt();
                        innerScale.mode = 'SQRT';
                    } else if (chartDef.colorOptions.ccScaleMode == "SQUARE") {
                        innerScale = d3.scale.pow().exponent(2);
                        innerScale.mode = 'SQUARE';
                    } else {
                        innerScale = d3.scale.linear();
                        innerScale.mode = 'LINEAR';
                    }
                } else {
                    // No compute mode for quantiles quantization
                    innerScale = d3.scale.linear();
                    innerScale.mode = 'LINEAR';
                }

                switch (chartDef.colorOptions.paletteType) {
                    case 'DIVERGING':
                        var mid = chartDef.colorOptions.paletteMiddleValue || 0;
                        if (Math.abs(domainMax - mid) > Math.abs(domainMin - mid)) {
                            innerScale.domain([mid, domainMax]).range([0.5, 1]);
                        } else {
                            innerScale.domain([domainMin, mid]).range([0, 0.5]);
                        }
                        break;
                    case 'CONTINUOUS':
                    default:
                        if (p.fixedValues) {
                            var domain = [], range = [];
                            p.values.forEach(function(value, i) {
                                if (i > p.colors.length -1) {
                                    return;
                                }
                                if (value == null) {
                                    if (i == 0) {
                                        domain.push(domainMin);
                                        range.push(0);
                                    } else if (i == p.colors.length -1) {
                                        domain.push(domainMax);
                                        range.push(1);
                                    }
                                } else {
                                    domain.push(value);
                                    range.push(i/(p.colors.length-1));
                                }
                            });
                            innerScale.domain(domain).range(range);
                        } else {
                            innerScale.domain([domainMin, domainMax]).range([0, 1]);
                        }
                        break;
                }

                var outerScale;

                switch (chartDef.colorOptions.quantizationMode) {
                    case 'LINEAR':
                    case 'QUANTILES':
                        // Find step colors
                        var numSteps = chartDef.colorOptions.numQuantizeSteps;
                        var colors = p[numSteps] || p.colors; // Palettes can define special colors for a given number of steps (i.e. colorbrewer palettes)
                        var numColors = colors.length;

                        var linearScale = d3.scale.linear()
                            .domain(Array(numColors).fill().map(function(d,i) { return i/(numColors-1); }))
                            .range(colors)
                            .interpolate(d3_interpolateRgbRound);
                        var steps = Array(numSteps).fill().map(function(d, i) { return linearScale(i/(numSteps-1)); });

                        if (chartDef.colorOptions.quantizationMode === 'LINEAR') {
                            outerScale = d3.scale.quantize().domain([0, 1]).range(steps);
                        } else {
                            outerScale = d3.scale.quantile().domain(domainValues.map(innerScale)).range(steps);
                        }
                        break;

                    case 'NONE':
                    default:
                        outerScale = d3.scale.linear()
                            .domain(Array(p.colors.length).fill().map(function(d,i) { return i/(p.colors.length-1); }))
                            .range(p.colors)
                            .interpolate(d3_interpolateRgbRound);
                        break;

                }

                var ret = function(d) {
                    return outerScale(innerScale(d));
                };

                ret.outerScale = outerScale;
                ret.innerScale = innerScale;
                ret.quantizationMode = chartDef.colorOptions.quantizationMode;
                ret.diverging = chartDef.colorOptions.paletteType === 'DIVERGING';

                return ret;
            },

            /**
             * Create a discrete color scale
             * @param {ChartDef.java} chartDef
             * @param {boolean} withRgba
             * @param meaningInfo
             * @param colorLabels
             * @return {*}
             */
            discreteColorScale: function (chartDef, withRgba, meaningInfo, colorLabels) {
                var colors;
                if (!chartDef.colorOptions.colorPalette) chartDef.colorOptions.colorPalette = 'default';

                var p;
                if (chartDef.colorOptions.colorPalette == "__dku_meaning__") {
                    return svc.meaningColorScale(chartDef, withRgba, meaningInfo, colorLabels);
                } else if (chartDef.colorOptions.colorPalette === "__dku_custom__") {
                    p = chartDef.colorOptions.customPalette;
                } else {
                    p = window.dkuColorPalettes.discrete.find(p => p.id === chartDef.colorOptions.colorPalette);
                }

                if (!p) {
                    chartDef.colorOptions.colorPalette = "default";
                    p = window.dkuColorPalettes.discrete.find(p => p.id === chartDef.colorOptions.colorPalette);
                }
                if (p.d3Scale) {
                    return p.d3Scale;
                } else {
                    colors = p.colors;
                    if (withRgba && chartDef.colorOptions.transparency != 1) {
                        colors = colors.map(function (x) {
                            x = d3.rgb(x);
                            return "rgba(" + x.r + "," + x.g + "," + x.b + "," + chartDef.colorOptions.transparency + ")";
                        })
                    }
                    return d3.scale.ordinal().range(colors);
                }
            },

            meaningColorScale: function(chartDef, withRgba, meaningInfo, colorLabels) {
                var normalizer = StringNormalizer.get(meaningInfo.normalizationMode);
                var ret = function(idx) {
                    // TODO fixed fallback color? defined in the chart? in the meaning?
                    if (withRgba) {
                        return ChartColorUtils.toRgba(meaningInfo.colorMap[normalizer(colorLabels[idx].label)] || "grey", chartDef.colorOptions.transparency);
                    } else {
                        return meaningInfo.colorMap[normalizer(colorLabels[idx].label)] || "grey";
                    }
                };
                ret.domain = function(){
                    return Array.from(Array(colorLabels.length).keys())
                }
                return ret;
            }
        };

        /**
         * Create samples for colorpalettes
         */
        function createSamples() {
            $.each(window.dkuColorPalettes.continuous, function (idx, p) {
                var chartSpec, scale;
                chartSpec = {colorOptions: {colorPalette: p.id, transparency: 1}};
                if (!p.sample) {
                    scale = svc.continuousColorScale(chartSpec, 0, 100);
                    p.sample = $.map([0, 20, 40, 60, 80, 100], scale);
                }
            });
            $.each(window.dkuColorPalettes.discrete, function (idx, p) {
                var chartSpec, scale;
                chartSpec = {colorOptions: {colorPalette: p.id, transparency: 1}};
                if (!p.sample) {
                    scale = svc.discreteColorScale(chartSpec);
                    p.sample = $.map([0, 1, 2, 3, 4], scale);
                }
            });
        }

        createSamples();
        return svc;
    }

    /**
     * A set of helper functions for dealing with colors
     */
    function ChartColorUtils() {
        return {
            /**
             * Desaturate a color
             * @param {string} color
             * @return {d3.rgb} color
             */
            desaturate: function (color) {
                var col = d3.rgb(color);
                var mean = (col.r + col.g + col.b) / 5;
                mean = mean - (mean - 255) * 0.8;
                return d3.rgb(mean, mean, mean);
            },

            /**
             * Make a darker color. Supports rgba in input (but drops the a)
             * @param {string} color
             * @return {d3.rgb} color
             */
            darken : function(color) {
                var match, rgbColor;
                if (match = /^rgba\(([\d]+),([\d]+),([\d]+),([\d]+|[\d]*.[\d]+)\)/.exec(color)){
                    rgbColor = d3.rgb(match[1], match[2], match[3]);
                } else {
                    rgbColor = d3.rgb(color);
                }
                return rgbColor.hsl().darker().toString();
            },

            /**
             * Add transparency to a color
             * @param {string} color
             * @param {number} transparency
             * @returns {string} rgba color
             */
            toRgba: function (color, transparency) {
                color = d3.rgb(color);
                var r = color.r,
                    g = color.g,
                    b = color.b;
                transparency = !isNaN(transparency) ? transparency : 1;
                return ["rgba(", r, ",", g, ",", b, ",", transparency, ")"].join("");
            }
        };
    }

    function EditCustomPaletteModalController($scope, DataikuAPI, $filter, $state, StateUtils, FutureProgressModal, WT1) {
        $scope.uiState = {};
        $scope.exportOptions = {};

        $scope.init = function (palette, paletteType) {
            $scope.palette = angular.copy(palette);
            $scope.paletteType = paletteType;
        };

        $scope.save = function() {
            $scope.resolveModal($scope.palette);
        };

        $scope.$watch("palette.colors", function(nv) {
            if (nv && nv.length) {
                $scope.palette.values.length = Math.max($scope.palette.values.length, nv.length);
            }
        });

        $scope.removeColor = function(idx) {
            $scope.palette.colors.splice(idx, 1);
            $scope.palette.values.splice(idx, 1);
        };

        $scope.sortableOptions = {
            axis:'y',
            cursor: 'move',
            handle: '.sort-handle',
            containment: 'div.sorting-container',
            items:'> li'
        };

        $scope.codeMirrorOptions = {
            mode:"application/javascript",
            lineNumbers:false,
            readOnly: true,
            onLoad: function(instance) {
                instance.on('focus', function() {
                    instance.execCommand("selectAll");
                });
            }
        };

        var getJsSnippet = function(type, id, name, colors, values) {
            var clippedValues;
            if (values && values.length) {
                clippedValues = values.concat();
                clippedValues.length = colors.length;
            }

            return 'dkuColorPalettes.add' + $filter('capitalize')(type.toLowerCase()) + '({'
                + '\n    "id": ' + JSON.stringify(id) + ','
                + '\n    "name": ' + JSON.stringify(name) + ','
                + '\n    "category": "Plugin palettes",'
                + '\n    "colors": ' + JSON.stringify(colors)
                + (clippedValues ? (',\n    "values": ' + JSON.stringify(clippedValues)) : '')
                + '\n});'
        };

        $scope.updateSnippet = function() {
            $scope.jsSnippet = getJsSnippet($scope.paletteType, $scope.exportOptions.paletteId, $scope.exportOptions.paletteName, $scope.palette.colors, $scope.palette.values);
        };

        $scope.prepareExport = function() {
            $scope.updateSnippet();
            $scope.uiState.exporting = true;
        };

        $scope.export = function() {
            DataikuAPI.plugindev.create($scope.exportOptions.pluginId, 'EMPTY')
                .error(setErrorInScope.bind($scope))
                .success(function (data) {
                    FutureProgressModal.show($scope, data, "Creating plugin").then(function(result){
                        if (result) {
                            WT1.event("plugin-dev-create");
                            DataikuAPI.plugindev.createContent($scope.exportOptions.pluginId, '/js', true)
                                .error(setErrorInScope.bind($scope))
                                .success(function () {
                                    DataikuAPI.plugindev.createContent($scope.exportOptions.pluginId, '/js/palette.js', false)
                                        .error(setErrorInScope.bind($scope))
                                        .success(function () {
                                            DataikuAPI.plugindev.setContent($scope.exportOptions.pluginId, '/js/palette.js', $scope.jsSnippet)
                                            .error(setErrorInScope.bind($scope))
                                            .success(function () {
                                                $scope.dismiss();
                                                StateUtils.go.pluginDefinition($scope.exportOptions.pluginId);
                                            });
                                        });
                                });
                        }
                    });
                });
        };
    }

    function palettePickerLogic(CreateModalFromTemplate, $rootScope, ChartUtils, $timeout, UDMUtils) {

        var ret = {
            restrict: 'A',
            scope: true
        };
        ret.link = function ($scope, $element, attrs) {
            $scope.container = $scope.$eval(attrs.container);
            $scope.type = attrs.type;
            attrs.$observe('type', function(val) {
                $scope.type = val;
                update();

                // Quantization mode QUANTILES is not available for DIVERGING palettes
                if ($scope.type === 'DIVERGING' && $scope.container.quantizationMode === 'QUANTILES') {
                    $scope.container.quantizationMode = 'LINEAR';
                }
                $timeout(function() { $element.find('#quantization-mode-select').selectpicker('refresh'); });
            });

            $scope.$watch("container.colorPalette", function(nv, ov) {
                if (ov && nv === '__dku_custom__' && $scope.container.customPalette.colors.length === 0) {
                    var previousPalette = getPalettesForType($scope.type).find(d => d.id === ov);
                    if (previousPalette) {
                        $scope.container.customPalette.colors = angular.copy(previousPalette.colors);
                    }
                    $scope.editCustomPalette($scope.type);
                }
            });

            function fixDivergingLogMiddleValue() {
                if ($scope.container && ($scope.container.paletteMiddleValue || 0) <= 0 && $scope.container.paletteType == 'DIVERGING' && $scope.container.ccScaleMode == 'LOG') {
                    $scope.container.paletteMiddleValue = 1;
                }
            }

            $scope.$watch("container.paletteType", fixDivergingLogMiddleValue);
            $scope.$watch("container.ccScaleMode", fixDivergingLogMiddleValue);

            var colorCol;

            $scope.editCustomPalette = function(colorPaletteType) {
                // The custom palette modal can be open from a destoyable element like a contextualMenu 
                // if so the contextScope, containing the scope of the contextualMenu, is used as modal's parent scope
                const scope = $scope.$contextScope || $scope; 
                CreateModalFromTemplate("/templates/simple_report/config/edit-custom-palette-modal.html", scope, null, function(newScope) {
                    newScope.init($scope.chart.def.colorOptions.customPalette, colorPaletteType);
                }).then(function(palette) {
                    $scope.chart.def.colorOptions.customPalette = palette;
                });
            };

            $scope.$watch(function(scope) { return ChartUtils.getColorDimension(scope.chart.def); }, function() {
                var colorDim = ChartUtils.getColorDimension($scope.chart.def);

                if (colorDim && $scope.usableColumns) {
                    colorCol = $scope.usableColumns.find(c => c.column === colorDim.column);
                } else {
                    colorCol = null;
                }

                if (colorCol && colorCol.meaningInfo) {
                    $scope.colorMeaning = {
                        id: colorCol.meaningInfo.id,
                        label: UDMUtils.getLabel(colorCol.meaningInfo.id)
                    };
                } else {
                    $scope.colorMeaning = null;
                    if ($scope.chart.def.colorOptions.colorPalette === '__dku_meaning__') {
                        $scope.chart.def.colorOptions.colorPalette = 'default';
                    }
                }

                $timeout(function() {
                    $element.find(".palette-select").selectpicker('refresh');
                });
            }, true);

            $scope.editMeaning = function() {
                CreateModalFromTemplate("/templates/meanings/edit-udm.html", $rootScope, null, function(newScope){
                    newScope.initModal($scope.colorMeaning.id, function() {
                        if ($scope.fetchColumnsSummaryForCurrentChart) {
                            $scope.fetchColumnsSummaryForCurrentChart(true).then($scope.redraw);
                        } else {
                            $scope.fetchColumnsSummary().then($scope.redraw);
                        }
                    });
                })
            };

            $scope.getPaletteContent = function(palette) {
                if ($scope.type === 'discrete' || $scope.container.quantizationMode !== 'NONE') {
                    let html = '<div class="palette-picker-item-wrapper"><ul class="palette-picker-sample">';
                    (palette.sample || palette.colors).forEach(function (s) {
                        html += '<li style="background: ' + s + '">&nbsp;</li>';
                    });
                    html += '</ul>' + palette.name + '</div>';
                    return html;
                } else {
                    let html = '<div class="palette-picker-item-wrapper"><div class="palette-picker-sample continuous" style="background: linear-gradient(to right';
                    (palette.sample || palette.colors).forEach(function(s) {
                        html += ', ' + s;
                    });
                    html += '"></div>' + palette.name + '</div>';
                    return html;
                }
            };

            function getPalettesForType(type) {
                switch (type) {
                    case 'CONTINUOUS':
                        return window.dkuColorPalettes.continuous;
                    case 'DIVERGING':
                        return window.dkuColorPalettes.diverging;
                    case 'discrete':
                        return window.dkuColorPalettes.discrete;
                    case 'quantile':
                        return window.dkuColorPalettes.quantile;
                    default:
                        throw Error("Invalid palette type: " + type);
                }
            }

            /* Model management */
            var update = function () {
                var possiblePalettes = getPalettesForType($scope.type);

                $scope.categories = {};
                angular.forEach(possiblePalettes, function(palette) {
                    if ($scope.categories.hasOwnProperty(palette.category)) {
                        $scope.categories[palette.category].push(palette);
                    } else {
                        $scope.categories[palette.category] = [palette];
                    }
                });

                if ($scope.container.colorPalette === "__dku_custom__" || $scope.container.colorPalette === "__dku_meaning__") {
                    return;
                }

                $scope.currentlySelected = null;
                for (var i in possiblePalettes) {
                    if (possiblePalettes[i].id == $scope.container.colorPalette) {
                        $scope.currentlySelected = possiblePalettes[i];
                    }
                }
                if (!$scope.currentlySelected) {
                    $scope.currentlySelected = possiblePalettes[0];
                }
                $scope.container.colorPalette = $scope.currentlySelected.id;

                $timeout(function() {
                    $element.find(".palette-select").selectpicker('refresh');
                });
            };

            $scope.$watch("container", update, true);
            $scope.$watch("continuous", update);

            $scope.selectPalette = function (selected, $event) {
                $scope.container.colorPalette = selected.id;
                update();
                $event.stopPropagation();
            }
        };
        return ret;
    }

})();

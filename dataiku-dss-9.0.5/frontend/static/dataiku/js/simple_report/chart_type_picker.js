(function(){
'use strict';

var app = angular.module('dataiku.directives.simple_report');

app.factory("ChartIconUtils", function(WebAppsService) {
    var ret = {
        computeChartIcon: function (type, variant, isInAnalysis, webAppType) {
            if (!ret.typeAndVariantToImageMap) return "";
            if (typeof(type) !== 'undefined') {
                if (type == 'webapp') {
                    var loadedDesc = WebAppsService.getWebAppLoadedDesc(webAppType) || {};
                    return loadedDesc && loadedDesc.desc && loadedDesc.desc.meta && loadedDesc.desc.meta.icon ? loadedDesc.desc.meta.icon : 'icon-puzzle-piece';
                }
                var imageName = 'basic_graphs';
                if (typeof(variant) === 'undefined') {
                    variant = 'normal';
                }
                if (typeof(ret.typeAndVariantToImageMap[type]) !== 'undefined'
                    && typeof(ret.typeAndVariantToImageMap[type][variant]) !== 'undefined'
                    && typeof(ret.typeAndVariantToImageMap[type][variant]).icon !== 'undefined') {
                    imageName = ret.typeAndVariantToImageMap[type][variant].icon;
                }
                var uri = '/static/dataiku/images/charts/icons/';
                if (isInAnalysis) {
                    uri += 'Chart_Icon_Analysis_'
                } else {
                    uri += 'Chart_Icon_Dataset_'
                }
                return uri + imageName + '.svg';
            }
        },

        typeAndVariantToImageMap: {
            'grouped_columns': {
                'normal': {
                    'icon': 'histogram',
                    'preview': 'grouped_columns'
                }
            },
            'stacked_bars': {
                'normal': {
                    'icon': 'bar_graph',
                    'preview': 'bar_graph'
                },
                'stacked_100': {
                    'icon': 'bar_stacked_100',
                    'preview': 'bar_graph'
                }
            },
            'stacked_columns': {
                'normal': {
                    'icon': 'stacked_color',
                    'preview': 'stacked_columns'
                },
                'stacked_100': {
                    'icon': 'stacked_100',
                    'preview': 'stacked_columns'
                }
            },
            'multi_columns_lines': {
                'normal': {
                    'icon': 'column__lines',
                    'preview': 'column__lines'
                }
            },
            'lines': {
                'normal': {
                    'icon': 'lines',
                    'preview': 'lines'
                }
            },
            'stacked_area': {
                'normal': {
                    'icon': 'stacked_areas',
                    'preview': 'stacked_areas'
                },
                'stacked_100': {
                    'icon': 'stacked_areas_100',
                    'preview': 'stacked_areas_100'
                }
            },
            'pivot_table': {
                'normal': {
                    'icon': 'table',
                    'preview': 'table'
                },
                'colored': {
                    'icon': 'colored',
                    'preview': 'colored'
                }
            },
            'scatter': {
                'normal': {
                    'icon': 'scatter',
                    'preview': 'scatter'
                }
            },
            'grouped_xy': {
                'normal': {
                    'icon': 'grouped_scatter',
                    'preview': 'grouped_scatter'
                }
            },
            'binned_xy': {
                'normal': {
                    'icon': 'bubble',
                    'preview': 'bubble'
                },
                'binned_xy_rect': {
                    'icon': 'rectangles',
                    'preview': 'rectangles'
                },
                'binned_xy_hex': {
                    'icon': 'hexagons',
                    'preview': 'hexagons'
                }
            },
            'density_2d': {
                'normal': {
                    'icon': 'heatmap',
                    'preview': 'heatmap'
                }
            },
            'scatter_map': {
                'normal': {
                    'icon': 'scatter_map',
                    'preview': 'scatter_map'
                }
            },
            'density_heat_map': {
                'normal': {
                    'icon': 'density_heat_map',
                    'preview': 'density_heat_map'
                }
            },
            'geom_map': {
                'normal': {
                    'icon': 'geom_map',
                    'preview': 'geom_map'
                }
            },
            'admin_map': {
                'normal': {
                    'icon': 'administrative_map',
                    'preview': 'administrative_map'
                },
                'filled_map': {
                    'icon': 'administrative_map',
                    'preview': 'administrative_map'
                }
            },
            'grid_map': {
                'normal': {
                    'icon': 'grid_map',
                    'preview': 'grid_map'
                }
            },
            'boxplots': {
                'normal': {
                    'icon': 'box_plot',
                    'preview': 'box_plot'
                }
            },
            'pie': {
                'normal': {
                    'icon': 'pie',
                    'preview': 'pie'
                },
                'donut': {
                    'icon': 'donut',
                    'preview': 'donut'
                }
            },
            'lift': {
                'normal': {
                    'icon': 'diminishing_return_charts',
                    'preview': 'diminishing-reduction'
                }
            }
        }
    };

    return ret;
});

app.directive('chartTypePicker', function($window, $timeout, ChartIconUtils, $state, $stateParams, DataikuAPI) {
    return {
        restrict: 'AE',
        templateUrl: '/templates/simple_report/chart-type-picker.html',
        link: function($scope, element) {

            $scope.isInPredicted = $state.current.name.indexOf('predicted')!=-1;
            /*
             * Chart Type Picker Visibility
             */

            $scope.chartPickerVibility = {visible: false};

            $scope.chartFamilyToDisplay = {name: 'basic'};

            $scope.switchChartPicker = function() {
                if ($scope.chart == null) return; // no chart data, won't be able to set anything (UserTooHastyException :) )
                $scope.chartPickerVibility.visible = !$scope.chartPickerVibility.visible;
                if ($scope.chartPickerVibility.visible) {
                    $timeout(function() {
                        $($window).on('click', $scope.switchClickHandler);
                        $scope.chartFamilyToDisplay.name = $scope.getFamilyNameByChartType($scope.chart.def.type);
                    });
                } else {
                    $($window).off('click', $scope.switchClickHandler);
                }
            }

            $scope.switchClickHandler = function(e) {
                var clickedEl = e.target;
                if ($(clickedEl).closest('.chart-type-selection').length <= 0 && $scope.chartPickerVibility.visible) {
                    $scope.switchChartPicker();
                    $scope.$apply();
                }
            }

            /*
             * Tabs Navigation
             */

            $scope.displayTab = function(familyName) {
                $scope.chartFamilyToDisplay.name = familyName;
            }

            $scope.getFamilyNameByChartType = function(type) {
                for (name in $scope.familyToTypeMap) {
                    var currentFamily = $scope.familyToTypeMap[name];
                    if (currentFamily.indexOf(type)>-1) {
                        return name;
                    }
                }
            }

            $scope.isFamilyDisplayed = function(family) {
                return family == $scope.chartFamilyToDisplay.name;
            }

            /*
             * Selecting some chart type
             */

            $scope.selectChartType= function(type, variant, webAppType){
                $scope.switchChartPicker();
                $scope.setChartType(type, variant, webAppType);
            }

            $scope.isChartSelected = function(type, variant, webAppType) {
                if ($scope.chart == null) return false; // data not loaded, cannot tell is selected or not
                var selectedType =  $scope.chart.def.type;
                var selectedVariant = $scope.chart.def.variant;
                var selectedwebAppType = $scope.chart.def.webAppType;
                if (typeof(selectedVariant)==='undefined' && typeof(variant)!=='undefined') {
                    selectedVariant = 'normal';
                }
                if (type != 'webapp') {
                    webAppType = null;
                }
                return selectedType == type && selectedVariant == variant && selectedwebAppType == webAppType;
            }

            /*
             * Chart Type Icon Handling
             */

            $scope.computeChartIcone = function(type, variant, webAppType) {
                return ChartIconUtils.computeChartIcon(type, variant, $scope.isInAnalysis, webAppType);
            }
            if (!$scope.isInPredicted && !$scope.isInAnalysis) {
                DataikuAPI.explores.listPluginChartDescs($stateParams.projectKey)
                    .success(function (data) {
                        if (data.length > 0) {
                            $scope.webApps = {};
                        }
                        data.forEach(w => {
                            let pluginId = w.ownerPluginId;
                            $scope.webApps[pluginId] = $scope.webApps[pluginId] || [];
                            $scope.webApps[pluginId].push(w);
                        });
                    }).error(setErrorInScope.bind($scope));
            }
        }
    };
});

})();

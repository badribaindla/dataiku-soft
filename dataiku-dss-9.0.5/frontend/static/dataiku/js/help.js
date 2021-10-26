(function(){
'use strict';

var app = angular.module('dataiku.services.help', []);


/* ****************************************
 * Coachmarks system
 * ****************************************/

app.controller("CoachmarkController", function($scope, CoachmarksService){
	// In the scope: "seriesState"

    $scope.disableCoachmarks = function(){
        $scope.dismiss();
        CoachmarksService.globallyDisable($scope.seriesState);
    }

	// On State change = dismiss without saving that we advanced
});

app.directive("coachmarkHeader", function($filter, $timeout) {
    return {
        template : '<div class="title">' +
        '{{title}}'+
        // '<span class="close-btn" ng-click="hideCoachmark()" style="display: inline-block; float: right;">╳</span>' +
        '</div>',
        replace : true,
        link: function($scope, element, attrs) {
            $scope.title = attrs["title"];
        }
    }
});

app.directive("coachmarkFooterRegular", function($filter, $timeout) {
    return {
        template : '<div class="footer">' +
        'Disable tooltips from the help menu '+
        // '<img src="/static/dataiku/images/coachmarks/help-menu.png">'+
        '<i class="icon-dku-help" style="opacity: 1; color: rgb(43, 178, 173);"></i>'+
        '<i class="icon-dku-help" style="color: #212121"></i>'+
        // '<span class="close-btn" ng-click="hideCoachmark()" style="display: inline-block; float: right;">╳</span>' +
        '</div>',
        replace : true
    }
});

/**
 * Directive to disable/enable a serie of pulsars
 */
app.directive("coachmarkSerieSwitch", function(CoachmarksService, $timeout) {
    return {
        restrict: 'A',
        replace: true,
        link: function ($scope, element, attrs) {

            $scope.serieId = attrs['serieId'];

            $scope.serieEnabled = !CoachmarksService.isSerieDisabled($scope.serieId);
            $scope.switchOffSerie = function() {
                $timeout(function() {
                    $('.master-status__icon--help .icon-dku-help').removeAttr("style");
                    CoachmarksService.disableSerie($scope.serieId);
                }, 250);
            }

            $timeout(function(){
                if (window.cleanQuestionSignBtnTimeout) {
                    $timeout.cancel(window.cleanQuestionSignBtnTimeout);
                    cleanQuestionSignBtn();
                }
                $('.master-status__icon--help .icon-dku-help').css("opacity", 1);
                $('.master-status__icon--help .icon-dku-help').css("color", "#2BB2AD");
            });

            $scope.$on("$destroy", function(){
                $('.master-status__icon--help .icon-dku-help').css({"transition": "2000ms ease all", "transition-property": "opacity, color"});
                $('.master-status__icon--help .icon-dku-help').css("transition-delay", "1000ms");
                $('.master-status__icon--help .icon-dku-help').css("opacity", 0.7);
                $('.master-status__icon--help .icon-dku-help').css("color", "white");
                window.cleanQuestionSignBtnTimeout = $timeout(cleanQuestionSignBtn, 3050);
            });

            var cleanQuestionSignBtn = function() {
                $('.master-status__icon--help .icon-dku-help').removeAttr("style");
                delete window.cleanQuestionSignBtnTimeout;
            }
        }
    }
});

/**
 * Directive to display a pulsar. On hover, this pulsar will display a coachmark (ie: a big tooltip window)
 */
app.directive("coachmarkPulsar", function($timeout, $compile, CoachmarksService) {
    return {
        restrict: 'A',
        template : '<div class="coachmark-pulsar" ng-mouseenter="displayCoachmark()" ng-mouseleave="setAbovePulsarFalse()" ng-show="!step.noPulsar"></div>',
        replace: true,
        link : function($scope, element, attrs) {

            $scope.coarchmarkAppended = false;
            $scope.coachmarkWrapper = {}

            var appendCoachmark = function() {
                $scope.coachmarkWrapper.element = $('<div class="coachmark-wrapper" ng-mouseenter="setAboveCoachmark(true)" ng-mouseleave="setAboveCoachmark(false)" ng-show="coachmarkDisplayed.step == step"><div ng-include="step.templateUrl" onload="onCoachmarkLoad()" class="coachmark-sub-wrapper"></div></div>');
                $scope.coachmarkWrapper.scope = $scope.$new();
                $compile($scope.coachmarkWrapper.element)($scope.coachmarkWrapper.scope);
                $('.coachmark-container').append($scope.coachmarkWrapper.element);
                $scope.coarchmarkAppended = true;
                $scope.$on("$destroy", function() {
                    $scope.coachmarkWrapper.element.remove();
                })
            };

            $scope.onCoachmarkLoad = function() {
                $scope.coachmarkWrapper.element.css('visibility', 'hidden');
                if ($scope.step.coachmarkSizeCallback) {
                    $scope.step.coachmarkSizeCallback($scope.coachmarkWrapper.element, $scope.coachmarkWrapper.scope);
                }
                if ($scope.step.coachmarkPositionCallback) {
                    $scope.step.coachmarkPositionCallback(element, $scope.coachmarkWrapper.element, $scope.coachmarkWrapper.scope);
                } else {
                    CoachmarksService.positionning.smartCoachmarkPosition(element, $scope.coachmarkWrapper.element);
                }
                $scope.coachmarkWrapper.element.css('visibility', 'visible');
            }

            var uiState = {
                abovePulsar: false,
                aboveCoachmark: false
            };

            $scope.displayCoachmark = function() {
                //appending coachmark content if not previously done
                if (!$scope.coarchmarkAppended) {
                    appendCoachmark();
                }

                //registering this step as the one currently displayed
                $scope.coachmarkDisplayed.step = $scope.step;

                //undoing everything when coachmark get hidden
                var unregisterWatch = $scope.$watch("coachmarkDisplayed.step", function() {
                    if ($scope.coachmarkDisplayed.step != $scope.step) {

                        //since coachmark cannot be redisplayed (no UI to do so since no pulsar), we destroy the all directive
                        if ($scope.step.noPulsar) {
                            $timeout(function() {
                                $scope.$destroy();
                            });
                        }
                        //$watch returns a function to clear itself in angular
                        unregisterWatch();
                    }
                }, true);

                if (setAbovePulsarFalseTimeout) {
                    $timeout.cancel(setAbovePulsarFalseTimeout);
                }
                uiState.abovePulsar = true;
            };

            var setAbovePulsarFalseTimeout = null;
            $scope.setAbovePulsarFalse = function() {
                setAbovePulsarFalseTimeout = $timeout(function() {
                    uiState.abovePulsar = false;
                    if (!uiState.abovePulsar && ! uiState.aboveCoachmark) {
                        $scope.hideCoachmark();
                        //console.log("Hidding coachmark (from pulsar) " + $scope.step.templateUrl);
                    }
                }, 500);
                //console.log()
            };

            var setAboveCoachmarkFalseTimeout = null;
            $scope.setAboveCoachmark = function(isAbove) {
                if (isAbove) {
                    uiState.aboveCoachmark = true;
                    if (setAboveCoachmarkFalseTimeout) {
                        $timeout.cancel(setAboveCoachmarkFalseTimeout);
                    }
                } else {
                    setAboveCoachmarkFalseTimeout = $timeout(function() {
                        uiState.aboveCoachmark = false;
                        if (!uiState.abovePulsar && ! uiState.aboveCoachmark) {
                            $scope.hideCoachmark();
                            //console.log("Hidding coachmark (from coachmark) " + $scope.step.templateUrl);
                        }
                    }, 500);
                }
            };

            $scope.hideCoachmark = function() {
                if ($scope.coachmarkDisplayed.step == $scope.step) {
                    $scope.coachmarkDisplayed.step = null;
                }
            };

            if ($scope.step.autoDisplay) {
                $scope.displayCoachmark();
            }
            $timeout(function() {
                if ($scope.step.pulsarCallback) {
                    $scope.step.pulsarCallback(element, $scope);
                }
            }, 0);
        }
    }
});

/**
 * Directive to display a serie of coachmarks (coachmarks are grouped by series, there is roughly a serie of coachmarks per screen in the app)
 */
app.directive("coachmarkSerie", function(CoachmarksService, Logger, WT1, CreateModalFromTemplate) {
    return {
        restrict: 'A',
        link: function ($scope, element, attrs) {

            // Displaying Coachmarks Series
            var onCoachmarksStateChanged = function() {
                $scope.displayPulsars = CoachmarksService.canDisplaySerie($scope.serieId);
                if ($scope.displayPulsars) {
                    WT1.event("coachmark-series-start", { seriesId : $scope.serieId });
                    if (!CoachmarksService.isSerieAlreadyWatched($scope.serieId)) {
                        CoachmarksService.setAlreadyWatched($scope.serieId);
                    }
                }
            };

            // Computing extra steps
            var computeExtraStepsList = function() {
                $scope.extraSteps = [];
                if ($scope.extraSerieIds && $scope.extraSerieIds.length) {
                    $scope.extraSerieIds.forEach(function(id) {
                        $scope.extraSteps = $scope.extraSteps.concat(CoachmarksService.registry[id].steps);
                    });
                }
            };

            /*
             * Main
             */

            $scope.displayPulsars = false;
            $scope.serieAlreadyWatched = CoachmarksService.isSerieAlreadyWatched($scope.serieId);
            $scope.coachmarkDisplayed = {};
            $scope.serie = {
                id : $scope.serieId,
                def : CoachmarksService.registry[$scope.serieId]
            }
            $scope.$on("coachmarks-state-changed", onCoachmarksStateChanged);
            onCoachmarksStateChanged();

            $scope.$watch('extraSerieIds', computeExtraStepsList);
            computeExtraStepsList();

            // currentSerieId handling
            $scope.$watch('serieId', function () {
                CoachmarksService.setCurrentSerieId($scope.serieId);
            });
            $scope.$on("$destroy", function(){
                CoachmarksService.setCurrentSerieId(null);
            });

            if (!CoachmarksService.isCoachmarkEverSeen() && $scope.serieId == 'project-home') {
                CreateModalFromTemplate("/templates/coachmarks/coachmark-first-time-popin.html", $scope, null, function(newScope) {
                    newScope.setCoachmarkEverSeen = CoachmarksService.setCoachmarkEverSeen();
                });
            }
        }
    };
});

/**
 * Directive to append to the root element of the DOM a coachmarkSerie directive.
 * This enable to call a coachmarkSerie from any template without having to consider z-index issue
 */
app.directive("coachmarkSerieCaller", function($timeout, $http, $templateCache, $compile) {
    return {
        restrict: 'A',
        scope: {
            serieId: '=',
            extraSerieIds: '=?'
        },
        link: function ($scope, element, attrs) {
            $http.get("/templates/coachmarks/coachmark-serie.html", {cache: $templateCache}).then(function(response) {
                var newDOMElt = $(response.data);
                $('body').append(newDOMElt);
                $timeout(function () {
                    var newScope = $scope.$new();
                    $compile(newDOMElt)(newScope);
                    $scope.$on("$destroy", function(){
                        newDOMElt.remove();
                    });
                }, 1000);
            });
        }
    }
});

/**
 * A set of utilitaries to use coachmarks.
 * Also contains the list of existing coachmarks.
 */
app.factory("CoachmarksService", function(LocalStorage, WT1, ActivityIndicator, Logger, $rootScope){
	var svc = {};

	svc.registry = {};

    /*
     *  Local Storage Handling
     */

    function getPersistentState(){
        var state = LocalStorage.get("dss.coachmarks.state");

        if (!state){
            state = {}
        }
        if (!state.series) {
            state.series = {}
        }
        return state;
    }

    function setPersistentState(state){
        LocalStorage.set("dss.coachmarks.state", state);
        $rootScope.$broadcast("coachmarks-state-changed");
    }

    function setSeriePersistentState(id, attr, value){
        var pState = getPersistentState();

        if (!pState.series[id]) {
            pState.series[id] = {};
        }
        pState.series[id][attr] = value;
        setPersistentState(pState);
    }

    svc.setAlreadyWatched = function(id) {
        setSeriePersistentState(id, 'watched', true);
    };

    svc.disableSerie = function(id) {
        WT1.event("coachmark-series-disabled", { seriesId : id });
        setSeriePersistentState(id, 'disabled', true);
    };

    svc.enableSerie = function(id) {
        WT1.event("coachmark-series-enabled", { seriesId : id });
        setSeriePersistentState(id, 'disabled', false);
    };

    svc.disableAllSeries = function() {
        WT1.event("coachmark-global-disable", { wasAtSeries : svc.getCurrentSerieId()});
        var msg = "All helpers disabled";
        ActivityIndicator.info(msg, 5000);
        for (var serie in svc.registry) {
            svc.disableSerie(serie);
        }
    };

    svc.enableAllSeries = function() {
        WT1.event("coachmark-global-reenable");
        ActivityIndicator.info("All helpers are now enabled");
        for (var serie in svc.registry) {
            svc.enableSerie(serie);
        }
    };

    svc.isSerieDisabled = function(id){
        var seriesState = getPersistentState().series[id];
        if (!seriesState) return false;
        return seriesState.disabled == true;
    };

    svc.canDisplaySerie = function(id){
        return !svc.isSerieDisabled(id) && !svc.isCoachmarksHardDisabled();
    }

    svc.isSerieAlreadyWatched = function(id) {
        var seriesState = getPersistentState().series[id];
        if (!seriesState) return false;
        return seriesState.watched == true;
    };

    svc.isCoachmarkEverSeen = function() {
        return getPersistentState().everSawPulsar;
    }

    svc.setCoachmarkEverSeen = function() {
        var pState = getPersistentState();
        pState.everSawPulsar = true;
        setPersistentState(pState);
    }

    svc.isCoachmarksHardDisabled = function() {
        var pState = getPersistentState();
        return pState.hardDisabled;
    }

    /*
     *  Current Serie Handling
     */

    svc.setCurrentSerieId = function(id) {
        $rootScope.coachmarks = {
            serieId: id
        }
    };

    svc.getCurrentSerieId = function(id) {
        if ($rootScope.coachmarks) {
            return $rootScope.coachmarks.serieId;
        }
        return null;
    };

    /*
     *  Positionning
     */


    function positionToRightOfElt(elt, selector, fallbackTop, fallbackLeft, options) {
         var offset = {
            top: fallbackTop,
            left: fallbackLeft
        }
        var sel = $(selector);
        if (sel.length) {
            offset = sel.offset();
            offset.left += sel.outerWidth() + 10;
            if (options.maxLeft && offset.left > options.maxLeft) {
                offset.left = options.maxLeft;
            }
        } else {
            Logger.warn("Did not find selector", selector);
        }
        if (!options.topShift) {
            offset.top += options.topShift;
        }
        elt.css("left", offset.left + "px");
        elt.css("top", offset.top + "px");
    }

    function appendPulsarToElement(pulsarEl, pulsarScope, selector) {
        var pulsarElDetached = pulsarEl.detach();
        var sel = $(selector);
        if (sel.length) {
            var element = $(sel[0]);
            element.addClass('coachmark-pulsar-wrapper');
            element.append(pulsarElDetached);

            pulsarScope.$on("$destroy", function(){
                pulsarEl.remove();
                element.removeClass('coachmark-pulsar-wrapper');
            });
        } else {
            Logger.warn("Did not find selector", selector);
        }
    }

    function positionCoachmark(coachmarkElt, left, top) {
        coachmarkElt.css("left", left + "px");
        coachmarkElt.css("top", top + "px");
        coachmarkElt.css("right", "auto");
        coachmarkElt.css("bottom", "auto");
    }

    svc.positionning = {};

    svc.positionning.coachmarkToBottomLeftOfPulsar = function(pulsarElt, coachmarkElt) {
        var offset = pulsarElt.offset();
        var left = offset.left - coachmarkElt.width();
        var top = offset.top + pulsarElt.height();
        positionCoachmark(coachmarkElt, left, top);
    };

    svc.positionning.coachmarkToBottomRightOfPulsar = function(pulsarElt, coachmarkElt) {
        var offset = pulsarElt.offset();
        var left = offset.left + pulsarElt.width();
        var top = offset.top + pulsarElt.height();
        positionCoachmark(coachmarkElt, left, top);
    };

    svc.positionning.coachmarkToTopLeftOfPulsar = function(pulsarElt, coachmarkElt) {
        var offset = pulsarElt.offset();
        var left = offset.left - coachmarkElt.width();
        var top = offset.top - coachmarkElt.height();
        positionCoachmark(coachmarkElt, left, top);
    };

    svc.positionning.coachmarkToTopRightOfPulsar = function(pulsarElt, coachmarkElt) {
        var offset = pulsarElt.offset();
        var left = offset.left + pulsarElt.width();
        var top = offset.top - coachmarkElt.height();
        positionCoachmark(coachmarkElt, left, top);
    };

    svc.positionning.smartCoachmarkPosition = function (pulsarElt, coachmarkElt) {
        var pulsarOffset = pulsarElt.offset();
        var isLeft = pulsarOffset.left < window.innerWidth/2;
        var isTop = pulsarOffset.top < window.innerHeight/2;
        if (isLeft) {
            if (isTop) {
                svc.positionning.coachmarkToBottomRightOfPulsar(pulsarElt, coachmarkElt);
            } else {
                svc.positionning.coachmarkToTopRightOfPulsar(pulsarElt, coachmarkElt);
            }
        } else {
            if (isTop) {
                svc.positionning.coachmarkToBottomLeftOfPulsar(pulsarElt, coachmarkElt);
            } else {
                svc.positionning.coachmarkToTopLeftOfPulsar(pulsarElt, coachmarkElt);
            }
        }
    };

    svc.registry["shaker-hello"] = {
        steps : [
            {
                "templateUrl" : "/templates/coachmarks/shaker-hello/intro.html",
                pulsarCallback : function(elt, scope) {
                    appendPulsarToElement(elt, scope, '.leftPane');
                    elt.css("top", "29px");
                    elt.css("left", "25px");
                },
                coachmarkSizeCallback : function(elt, scope) {
                    elt.css("width", "420px");
                }
            },
            {
                "templateUrl" : "/templates/coachmarks/shaker-hello/column-header.html",
                pulsarCallback : function(elt, scope) {
                    appendPulsarToElement(elt, scope, '.filter.global-search');
                    elt.css("left", "0px");
                    elt.css("bottom", "-11px");
                },
                coachmarkSizeCallback : function(elt, scope) {
                    elt.css("width", "500px");
                }
            },
            {
                "templateUrl" : "/templates/coachmarks/shaker-hello/cell-click.html",
                pulsarCallback : function(elt, scope) {
                    appendPulsarToElement(elt, scope, '.filter.global-search');
                    elt.css("left", "50vw");
                    elt.css("bottom", "5px");
                },
                coachmarkSizeCallback : function(elt, scope) {
                    elt.css("width", "500px");
                }
            },
            // {
            //     templateUrl : "/templates/coachmarks/shaker-hello/select-content.html",
            //     pulsarCallback : function(elt, scope) {
            //         appendPulsarToElement(elt, scope, '.leftPane');
            //         elt.css("right", "-680px");
            //         elt.css("top", "85px");
            //     },
            //     coachmarkSizeCallback : function(elt, scope) {
            //         elt.css("width", "380px");
            //     }
            // },
            {
                "templateUrl" : "/templates/coachmarks/shaker-hello/processors-library.html",
                pulsarCallback : function(elt, scope) {
                    appendPulsarToElement(elt, scope, '.leftPane');
                    elt.css("top", "20%");
                    elt.css("right", "50%");
                },
                coachmarkSizeCallback : function(elt, scope) {
                    elt.css("width", "300px");
                    // elt.css("height", "160px");
                }
            }
        ]
    };

    // svc.registry["shaker-processors"] = {
    //     steps : [
    //         {
    //             templateUrl : "/templates/coachmarks/shaker-hello/processors-library.html",
    //             pulsarCallback : function(elt, scope) {
    //                 appendPulsarToElement(elt, scope, '.leftPane');
    //                 elt.css("top", "20%");
    //                 elt.css("right", "50%");
    //             },
    //             coachmarkSizeCallback : function(elt, scope) {
    //                 elt.css("width", "390px");
    //                 // elt.css("height", "160px");
    //             }
    //         }
    //     ]
    // }

    svc.registry["shaker-eye"] = {
        steps : [
            {
                "templateUrl" : "/templates/coachmarks/shaker-eye/eye.html",
                pulsarCallback : function(elt, scope) {
                    positionToRightOfElt(elt, ".eye-switch", 150, 400, { maxLeft : 500, topShift: -30});
                },
                coachmarkSizeCallback : function(elt, scope) {
                    elt.css("width", "500px");
                }
            }
        ]
    };

    svc.registry["shaker-run"] = {
        steps : [
            {
                "templateUrl" : "/templates/coachmarks/shaker-run/run-button.html",
                pulsarCallback : function(elt, scope) {
                    appendPulsarToElement(elt, scope, '.leftPane');
                    elt.css("bottom", "36px");
                    elt.css("left", "30%");
                },
                coachmarkSizeCallback : function(elt, scope) {
                    elt.css("width", "300px");
                    // elt.css("height", "160px");
                }
            }
        ]
    };

    svc.registry["analysis-deploy"] = {
        steps : [
            {
                "templateUrl" : "/templates/coachmarks/analysis-deploy/deploy-script.html",
                pulsarCallback : function(elt, scope) {
                    elt.css("top", "71px");
                    elt.css("right", "100px");
                },
                coachmarkSizeCallback : function(elt, scope) {
                    elt.css("width", "430px");
                }
            }
        ]
    };

    svc.registry["explore-hello"] = {
        steps : [
            {
                "templateUrl" : "/templates/coachmarks/explore-hello/dataset-sample.html",
                pulsarCallback : function(elt, scope) {
                    appendPulsarToElement(elt, scope, '#configure-sample-button');
                    elt.css("right", "-20px");
                    elt.css("bottom", "-2px");
                },
                coachmarkSizeCallback : function(elt, scope) {
                    elt.css("width", "380px");

                }
            },
            {
                "templateUrl" : "/templates/coachmarks/explore-hello/column-information.html",
                pulsarCallback : function(elt, scope) {
                    appendPulsarToElement(elt, scope, '.filter.global-search');
                    elt.css("left", "0px");
                    elt.css("bottom", "-11px");
                },
                coachmarkSizeCallback : function(elt, scope) {
                    elt.css("width", "500px");
                },
                autoDisplay: false,
                noPulsar: false,
            },
            {
                "templateUrl" : "/templates/coachmarks/explore-hello/lab.html",
                pulsarCallback : function(elt, scope) {
                    appendPulsarToElement(elt, scope, '#qa_generic_actions-dropdown');
                    elt.css("right", "56px");
                    elt.css("top", "24px");
                }
            },
        ]
    };


    svc.registry["dataset-tabs"] = {
        steps : [
            {
                "templateUrl" : "/templates/coachmarks/dataset-tabs/explore.html",
                pulsarCallback : function(elt, scope) {
                    appendPulsarToElement(elt, scope, '.tab');
                    elt.css("right", "-55px");
                    elt.css("bottom", "-10px");
                },
                coachmarkSizeCallback : function(elt, scope) {
                    elt.css("width", "380px");

                }
            },
            {
                "templateUrl" : "/templates/coachmarks/dataset-tabs/charts.html",
                pulsarCallback : function(elt, scope) {
                    // elt.css("width", "380px");
                    appendPulsarToElement(elt, scope, '.tab');
                    elt.css("right", "-130px");
                    elt.css("bottom", "-10px");
                },
                coachmarkSizeCallback : function(elt, scope) {
                    elt.css("width", "380px");

                }
            },
            {
                "templateUrl" : "/templates/coachmarks/dataset-tabs/status.html",
                pulsarCallback : function(elt, scope) {
                    // elt.css("width", "380px");
                    appendPulsarToElement(elt, scope, '.tab');
                    elt.css("right", "-200px");
                    elt.css("bottom", "-10px");
                },
                coachmarkSizeCallback : function(elt, scope) {
                    elt.css("width", "380px");

                }
            }
        ]
    };


    svc.registry["charts-hello"] = {
        steps : [
            {
                "templateUrl" : "/templates/coachmarks/charts-hello/drag-drop.html",
                pulsarCallback: function(elt, scope) {
                    // elt.css("width", "800px");
                    appendPulsarToElement(elt, scope, '.chart-param-bar');
                    elt.css("left", "-10px");
                    elt.css("top", "20%");
                    // elt.css("left", "calc(50% - 400px)");
                    // elt.css("top", "100px");
                },
                coachmarkSizeCallback: function(elt, scope) {
                    elt.css("width", "500px");
                },
                autoDisplay: false,
                noPulsar: false,
            },
            {
                "templateUrl" : "/templates/coachmarks/charts-hello/chart-options.html",
                pulsarCallback: function(elt, scope) {
                    // elt.css("width", "800px");
                    appendPulsarToElement(elt, scope, '.chart-param-bar');
                    elt.css("left", "-10px");
                    elt.css("top", "60%");
                    // elt.css("left", "calc(50% - 400px)");
                    // elt.css("top", "100px");
                },
                coachmarkSizeCallback: function(elt, scope) {
                    elt.css("width", "500px");
                },
                autoDisplay: false,
                noPulsar: false,
            },
            {
                "templateUrl" : "/templates/coachmarks/charts-hello/chart-types.html",
                pulsarCallback : function(elt, scope) {
                    positionToRightOfElt(elt, ".switch-chart-type-picker", 150, 400, { maxLeft : 500, topShift: -30});
                },
                coachmarkSizeCallback: function(elt, scope) {
                    elt.css("width", "600px");
                }
            }
        ]
    };

    svc.registry["charts-datasets"] = {
        steps : [
            {
                "templateUrl" : "/templates/coachmarks/charts-datasets/publish.html",
                pulsarCallback : function(elt, scope) {
                    appendPulsarToElement(elt, scope, '.share-bar');
                    elt.css("left", "50%");
                    elt.css("bottom", "5px");
                },
                coachmarkSizeCallback: function(elt, scope) {
                    elt.css("width", "380px");
                }
            },
            {
                "templateUrl" : "/templates/coachmarks/charts-datasets/engines.html",
                pulsarCallback : function(elt, scope) {
                    appendPulsarToElement(elt, scope, '.tab-sampling-engine');
                    elt.css("right", "30%");
                    elt.css("top", "15px");
                },
                coachmarkSizeCallback: function(elt, scope) {
                    elt.css("width", "380px");
                }
            }
        ]
    };

    svc.registry["status-metrics"] = {
        steps : [
            {
                "templateUrl" : "/templates/coachmarks/status-metrics/metrics.html",
                pulsarCallback : function(elt, scope) {
                    appendPulsarToElement(elt, scope, 'button.btn[displayed-metrics-selector]');
                    elt.css("right", "-15px");
                    elt.css("bottom", "-15px");
                },
                coachmarkSizeCallback: function(elt, scope) {
                    elt.css("width", "380px");
                }
            },
            {
                "templateUrl" : "/templates/coachmarks/status-metrics/checks-tab.html",
                pulsarCallback : function(elt, scope) {
                    appendPulsarToElement(elt, scope, '.checks-tab');
                    elt.css("left", "50%");
                    // elt.css("bottom", "-10px");
                },
                coachmarkSizeCallback: function(elt, scope) {
                    elt.css("width", "380px");
                }
            }
        ]
    };

    svc.registry["status-checks"] = {
        steps : [
            {
                "templateUrl" : "/templates/coachmarks/status-checks/checks.html",
                pulsarCallback : function(elt, scope) {
                    appendPulsarToElement(elt, scope, '.controls');
                    elt.css("right", "30%");
                    elt.css("bottom", "-15px");
                },
                coachmarkSizeCallback: function(elt, scope) {
                    elt.css("width", "380px");
                }
            }
        ]
    };

    svc.registry["model-hello"] = {
        steps : [
            {
                "templateUrl" : "/templates/coachmarks/model-hello/intro.html",
                pulsarCallback : function(elt, scope) {
                    appendPulsarToElement(elt, scope, '.object-breadcrumb');
                    elt.css("left", "50px");
                    elt.css("bottom", "-10px");
                },
                coachmarkSizeCallback: function(elt, scope) {
                    elt.css("width", "380px");
                }
            }
        ]
    };

    svc.registry["model-analysis"] = {
        steps : [
            {
                "templateUrl" : "/templates/coachmarks/model-analysis/deploy.html",
                pulsarCallback : function(elt, scope) {
                    elt.css("right", "10px");
                    elt.css("top", "90px");
                },
                coachmarkSizeCallback: function(elt, scope) {
                    elt.css("width", "380px");
                }
            },
            {
                "templateUrl" : "/templates/coachmarks/model-analysis/charts.html",
                pulsarCallback : function(elt, scope) {
                    appendPulsarToElement(elt, scope, '.tab-charts');
                    elt.css("left", "50%");
                    // elt.css("bottom", "-10px");
                },
                coachmarkSizeCallback: function(elt, scope) {
                    elt.css("width", "380px");
                }
            }
        ]
    };

    svc.registry["model-savedmodel"] = {
        steps : [
            {
                "templateUrl" : "/templates/coachmarks/model-savedmodel/origin-analysis.html",
                pulsarCallback : function(elt, scope) {
                    elt.css("right", "24px");
                    elt.css("top", "65px");                },
                coachmarkSizeCallback: function(elt, scope) {
                    elt.css("width", "380px");
                }
            },
            {
                "templateUrl" : "/templates/coachmarks/model-savedmodel/publish.html",
                pulsarCallback : function(elt, scope) {
                    elt.css("right", "210px");
                    elt.css("top", "65px");
                },
                coachmarkSizeCallback: function(elt, scope) {
                    elt.css("width", "380px");
                }
            }
        ]
    };

    svc.registry["project-home"] = {
        steps: [
            {
                "templateUrl" : "/templates/coachmarks/project-home/guide.html",
                pulsarCallback: function(elt, scope) {
                        appendPulsarToElement(elt, scope, '.master-nav__home');
                        elt.css("left", "10%");
                        elt.css("bottom", "-10px");
                }
            },
            {
				"templateUrl" : "/templates/coachmarks/project-home/settings.html",
				pulsarCallback: function(elt, scope) {
						appendPulsarToElement(elt, scope, '.home-settings-link');
						elt.css("left", "50%");
				},
                coachmarkSizeCallback: function(elt, scope) {
                    elt.css("width", "400px");
                }
			}
		]
    };

    return svc;
})
})();

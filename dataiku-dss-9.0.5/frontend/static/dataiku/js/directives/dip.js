(function() {
    'use strict';
    var app = angular.module('dataiku.directives.dip', ['dataiku.filters', 'dataiku.services', 'ui.keypress', 'dataiku.widgets.tageditfield']);

    app.directive("userPicture", function(Notification, $rootScope, UserImageUrl) {
        $rootScope.userPicturesHash= Math.random() * 200000 | 0;
        Notification.registerEvent("user-profile-picture-updated", function() {
            $rootScope.userPicturesHash = Math.random() * 200000 | 0;
        });
        return {
            template : "<div class=''></div>",
            replace : true,
            scope : {
                userPicture : '=',
                size : '@'
            },
            link : function(scope, element, attrs) {
                if (!scope.size) scope.size = 20;
                function update() {
                    var profileImageBaseUrl = UserImageUrl(scope.userPicture, scope.size);
                    element.addClass("avatar" + scope.size);
                    element.css("background-image", "url("+profileImageBaseUrl + ")");
                }
                scope.$watch("userPicture", function(nv, ov) {
                    if (!nv) return;
                    update();
                });
                $rootScope.$watch("userPicturesHash", function() {
                    update();
                })
            }
        };
    });

    app.directive("avatar", function() {
        return {
            template : '<a toggle="tooltip" title="{{displayName}}" href="{{ $state.href(\'profile.user\',{userLogin:login}) }}">'+
                            '<span user-picture="login" size="20" />'+
                        '</a>',
            replace : true,
            scope : {
                displayName : "=", login: "="
            }
        }
    });

    app.directive("closeTooltipsOnExit", function() {
        return {
            scope: false,
            link: function(scope, element, attrs) {
                function closeTooltips() {
                    $('.nvtooltip').remove(); // nvd3 tooltips (scatterplot)
                    $('.tooltip').remove();
                };
                scope.$watch(attrs.ngHide, function(nv) {if (nv) closeTooltips()});
                scope.$watch(attrs.ngShow, function(nv) {if (!nv) closeTooltips()});
                scope.$on('$destroy', closeTooltips);
            },
        }
    });

    app.directive('dkuBindHtmlUnsafe', ['$compile', function($compile) {
        return function(scope, element, attr) {
            element.addClass('ng-binding').data('$binding', attr.dkuBindHtmlUnsafe);
            scope.$watch(attr.dkuBindHtmlUnsafe, function dkuBindHtmlUnsafeWatchAction(value) {
                element.html(value);
                $compile(element.children())(scope);
            });
        };
    }]);

    app.directive('childFocus', function() {
        return {
            link: function(scope, elem, attrs) {
                var $elem = $(elem);
                $elem.find('input, label, select, option, button').each(
                    function(idx, item) {
                        $(item).focus(function () {
                            $elem.addClass('child-focus');
                        });
                        $(item).blur(function () {
                            $elem.removeClass('child-focus');
                        });
                    }
                );
            }
        };
    });

    app.directive('checkDatasetNameUnique', function(DataikuAPI, $stateParams) {
        return {
            require: 'ngModel',
            link: function(scope, elem, attrs, ngModel) {
                DataikuAPI.datasets.listNames($stateParams.projectKey).success(function(data) {
                    scope.unique_datasets_names = data;
                    /* Re-apply validation as soon as we get the list */
                    apply_validation(ngModel.$modelValue);
                });
                var initialValue = null, initialValueInitialized = false;
                function apply_validation(value) {
                    ngModel.$setValidity('datasetNameUnique', true);
                    // Implicitely trust the first value (== our own name)
                    if (initialValueInitialized == false && value != undefined && value != null && value.length > 0) {
                        initialValue = value;
                        initialValueInitialized = true;
                    }
                    // It is fake, but other check will get it.
                    if (value == null || value.length === 0) return value;
                    // We are back to our name, accept.
                    if (initialValueInitialized && value == initialValue) return value;

                    var valid = true;
                    if(scope.unique_datasets_names) {
                        for(var k in scope.unique_datasets_names) {
                            if(scope.unique_datasets_names[k].toLowerCase()==value.toLowerCase()) {
                                valid = false;
                            }
                        }
                    }

                    ngModel.$setValidity('datasetNameUnique', valid);
                    return value;
                }
                 //For DOM -> model validation
                ngModel.$parsers.unshift(apply_validation);

                //For model -> DOM validation
                ngModel.$formatters.unshift(function(value) {
                    apply_validation(value);
                    return value;
                });
            }
        };
    });

    app.directive('checkNewDatasetNameUnique', function(DataikuAPI, $stateParams) {
        return {
            require: 'ngModel',
            link: function(scope, elem, attrs, ngModel) {
                DataikuAPI.datasets.listNames($stateParams.projectKey).success(function(data) {
                    scope.unique_datasets_names = data;
                    /* Re-apply validation as soon as we get the list */
                    apply_validation(ngModel.$modelValue);
                });
                function apply_validation(value) {
                    ngModel.$setValidity('datasetNameUnique', true);
                    // It is fake, but other check will get it.
                    if (value == null || value.length === 0) return value;
                    var valid = true;
                    if(scope.unique_datasets_names) {
                        for(var k in scope.unique_datasets_names) {
                            if(scope.unique_datasets_names[k].toLowerCase()==value.toLowerCase()) {
                                valid = false;
                            }
                        }
                    }
                    ngModel.$setValidity('datasetNameUnique', valid);
                    return value;
                }
                //For DOM -> model validation
                ngModel.$parsers.unshift(apply_validation);

                //For model -> DOM validation
                ngModel.$formatters.unshift(function(value) {
                    apply_validation(value);
                    return value;
                });
            }
        };
    });

    app.directive('checkHiveHandlesDatasetName', function(DataikuAPI, $stateParams) {
        return {
            restrict: 'E',
            replace: true,
            template: "<span ng-hide='okForHive'><i class='icon-warning-sign'></i>&nbsp;A dataset for Hive/Impala can only contain alphanumeric characters and underscore</span>",
            scope: {
                datasetName : '=',
                datasetConnectionType : '=',
                connectionId: '=',          // when the connection list comes from a call to get-managed-dataset-options
                connectionConnection: '=',  // when the connection list comes from a call to list-managed-dataset-connections
                connectionList : '='        // when the type is not directly sent via datasetConnectionType
            },
            link: function(scope, elem, attrs, ngModel) {
            	// check for hdfs datasets, to warn when they won't work in hive because of their names. Other databases don't
            	// have this problem since the dataset is the table so you can't create one with an incorrect name
            	scope.okForHive = true;
            	var validate = function() {
                	scope.okForHive = true;
                	if (scope.datasetName == null || scope.datasetName.length == 0) return;
                	var selectedConnectionType = scope.datasetConnectionType;
                	if ( selectedConnectionType == null || selectedConnectionType.length == 0) {
                    	if (scope.connectionList != null && scope.connectionList.length > 0) {
                        	if (scope.connectionId != null && scope.connectionId.length > 0) {
                            	scope.connectionList.forEach(function(c) {
                            		if ( c.id == scope.connectionId) {
                            			selectedConnectionType = c.connectionType;
                            		}
                            	});
                        	}
                        	if (scope.connectionConnection != null && scope.connectionConnection.length > 0) {
                            	scope.connectionList.forEach(function(c) {
                            		if ( c.connection == scope.connectionConnection) {
                            			selectedConnectionType = c.type;
                            		}
                            	});
                        	}
                    	}
                	}
                	if (selectedConnectionType != 'HDFS') return; // here we're specifically focusing hive tables
                	scope.okForHive = /^[0-9a-zA-Z_]+$/.test(scope.datasetName);
            	};
                scope.$watch('datasetName', function() {validate();});
                scope.$watch('connectionId', function() {validate();});
                scope.$watch('connectionList', function() {validate();});
                scope.$watch('datasetConnectionType', function() {validate();});
                scope.$watch('connectionConnection', function() {validate();});
            }
        };
    });


    app.directive('checkNewManagedFolderLabelUnique', function(DataikuAPI, $stateParams) {
        return {
            require: 'ngModel',
            link: function(scope, elem, attrs, ngModel) {
                DataikuAPI.managedfolder.list($stateParams.projectKey).success(function(data) {
                    scope.unique_boxes_names = $.map(data, function(box) {
                        return box.name;
                    });
                    // Re-apply validation as soon as we get the list
                    apply_validation(ngModel.$modelValue);
                });
                function apply_validation(value) {
                    ngModel.$setValidity('boxNameUnique', true);
                    // It is fake, but other check will get it.
                    if (value == null || value.length === 0) return value;
                    var valid = true;
                    if(scope.unique_boxes_names) {
                        for(var k in scope.unique_boxes_names) {
                            if(scope.unique_boxes_names[k].toLowerCase()==value.toLowerCase()) {
                                valid = false;
                            }
                        }
                    }
                    ngModel.$setValidity('boxNameUnique', valid);
                    return value;
                }
                //For DOM -> model validation
                ngModel.$parsers.unshift(apply_validation);

                //For model -> DOM validation
                ngModel.$formatters.unshift(function(value) {
                    apply_validation(value);
                    return value;
                });
            }
        };
    });
    
    app.directive('checkNewModelEvaluationStoreLabelUnique', function(DataikuAPI, $stateParams) {
        return {
            require: 'ngModel',
            link: function(scope, elem, attrs, ngModel) {
                DataikuAPI.modelevaluationstores.list($stateParams.projectKey).success(function(data) {
                    scope.unique_evaluationStores_names = $.map(data, function(evaluationStore) {
                        return evaluationStore.name;
                    });
                    // Re-apply validation as soon as we get the list
                    apply_validation(ngModel.$modelValue);
                });
                function apply_validation(value) {
                    ngModel.$setValidity('evaluationStoreNameUnique', true);
                    // It is fake, but other check will get it.
                    if (value == null || value.length === 0) return value;
                    var valid = true;
                    if(scope.unique_evaluationStores_names) {
                        for(var k in scope.unique_evaluationStores_names) {
                            if(scope.unique_evaluationStores_names[k].toLowerCase()==value.toLowerCase()) {
                                valid = false;
                            }
                        }
                    }
                    ngModel.$setValidity('evaluationStoreNameUnique', valid);
                    return value;
                }
                //For DOM -> model validation
                ngModel.$parsers.unshift(apply_validation);

                //For model -> DOM validation
                ngModel.$formatters.unshift(function(value) {
                    apply_validation(value);
                    return value;
                });
            }
        };
    });

    app.service('clickRouter', function() {
        return {
            routeClickEvent: function (element, evt, clickableEmitterSelector, fullClickAttribute, mainClickAttributName, preventRecursionMarker, alsoPreventDefault, closestScope) {
                if(evt.originalEvent && evt.originalEvent.preventRecursionMarker === preventRecursionMarker) {
                    // Prevent event recursion : do not handle this event if we generated it!
                    return;
                }
                var sameElement = (evt.target == element[0]);
                var clickableEmitter = $(evt.target).closest(clickableEmitterSelector, closestScope).length > 0;
                var mainClickEl = fullClickAttribute ? element.find('[' + mainClickAttributName + '="' + fullClickAttribute + '"]') : element.find('['+ mainClickAttributName +']')
                const mainClickDisabled = evt.target.hasAttribute("disable-main-click");  // explicitely disable "main-click" behavior on element

                if(mainClickEl.is(evt.target) || mainClickDisabled) {
                    // The user clicked on the main click target already or the click has been explicitely disabled, so we don't need to do anything
                    // Especially useful for checkbox to avoid the double toggle effect
                    return;
                }

                if (( sameElement || !clickableEmitter ) && mainClickEl.length) {
                    // you cannot redispatch an existing event :(
                    var cloneEvent = document.createEvent('MouseEvents');
                    cloneEvent.preventRecursionMarker = preventRecursionMarker;
                    var e = evt.originalEvent;
                    cloneEvent.initMouseEvent(e.type, e.bubbles, e.cancelable, window, e.detail,
                        e.screenX, e.screenY, e.clientX, e.clientY, e.ctrlKey, e.altKey, e.shiftKey,
                        e.metaKey, e.button, e.relatedTarget);
                    mainClickEl[0].dispatchEvent(cloneEvent);
                    e.stopPropagation();
                    if (alsoPreventDefault) e.preventDefault(); // for right-click, because we don't want the browser contextual menu
                }
            }
        }
    });

// attrs: 'ignoreElement' allows to prevent click event redirection for one specific element, if needed
    app.directive('fullClick', function(clickRouter) {
        return {
            restrict: 'A',
            link: function(scope, element, attrs) {
                var preventRecursionMarker = {};

                element.on("click.fullclick", function(evt) {
                    if (scope.isClickable && !scope.isClickable()) {return false;}
                    if (!attrs.ignoreElement || !evt.target.matches(attrs.ignoreElement)) {
                        clickRouter.routeClickEvent(element, evt, 'a,button,[ng-click]', attrs.fullClick, 'main-click', preventRecursionMarker, false, attrs.containClick ? element[0] : undefined);
                    }
                });
                scope.$on("$destroy", function() {
                    element.off("click.fullclick");
                });
            }
        };
    });

    app.directive('fullRightClick', function(clickRouter) {
        return {
            restrict: 'A',
            link: function(scope, element, attrs) {
                var preventRecursionMarker = {};
                element.bind("contextmenu", function(evt) {
                    clickRouter.routeClickEvent(element, evt, '[ng-right-click]', attrs.fullRighClick, 'main-right-click', preventRecursionMarker, true);
                });
                scope.$on("$destroy", function() {
                    element.off("contextmenu");
                });
            }
        };
    });

    app.directive('stopPropagation', function() {
        return function(scope, element, attrs) {
            $(element).click(function(event) {
                event.stopPropagation();
            });
        }
    });

    app.directive('preventDefault', function() {
        return function(scope, element, attrs) {
            $(element).click(function(event) {
                event.preventDefault();
            });
        }
    });

    app.directive('autoFocus', function($timeout) {
        return {
            restrict: 'A',
            link: function(scope, element, attr) {
                attr.$observe('autoFocus', function() {
                    if ((attr.autoFocus === "true") || (attr.autoFocus === true) || (attr.autoFocus===undefined)) {
                        $timeout(function() {element.focus();}, 0);
                    }
                });
            }
        };
    });

     app.directive('autoFocusChild', function($timeout) {
        return {
            restrict: 'A',
            link: function(scope, element, attr) {
                attr.$observe('autoFocusChild', function() {
                    if ((attr.autoFocus === "true") || (attr.autoFocus === true) || (attr.autoFocus===undefined)) {
                        $timeout(function() {
                            element.find("button, input, select").focus();
                        }, 0);
                    }
                });
            }
        };
    });


    app.directive('dkuFrame', function () {
        return {
            restrict: 'E',
            require: '?ngModel',
            replace: true,
            transclude: true,
            template: '<iframe height="100%" detectIframeClicks width="100%" frameborder="0"></iframe>',
            link: function (scope, element, attrs) {
                element.attr('src', attrs.iframeSrc);
            }
        };
    });


    app.factory("ProgressStackMessageBuilder", function($filter) {
        // caution: you can have both hasResult == false and response.progress == null
        // => with a remote future (executed in the fek), there are some extra steps
        // at the end of the computation, where the backend will not have progress for
        return {
            getPercentage : function(progress) {
                var percentage = 0;
                var fractionOf = 100;
                if (progress && progress.states) {
                    angular.forEach(progress.states, function(state) {
                        if(state.target > -1) {
                            if (state.target > 0) {
                                fractionOf = fractionOf / (state.target + 1);
                                percentage += fractionOf * state.cur;
                            } else {
                                percentage += fractionOf;
                            }
                        }
                    });
                }
                return percentage;
            },
            buildFull : function(stack) { // called on trainInfo
                var stackMessage = null;
                if (stack && stack.length) {
                    var messageStack = [];
                    for (var i = 0; i < stack.length; i++) {
                        messageStack.push(stack[i].name)
                    }
                    return messageStack.join(": ");
                } else {
                    return "<span>Please wait...</span>";
                }
            },
            build : function(progress, includeAll) {
                function bytesToSize(bytes) {
                    var sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
                    if (bytes === 0) return '0 B';
                    var i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)), 10);
                    return Math.round(bytes / Math.pow(1024, i), 2) + ' ' + sizes[i];
                }
                function roundAfterTwoDecimals(number) {
                    return Math.round(parseFloat(number)*100)/100
                }
                function buildMessage(stackElt) {
                        var message = stackElt.name + " ";
                        switch(stackElt.unit) {
                            case "SIZE":
                                if (stackElt.target > 0) {
                                    message += "<small>(" + bytesToSize(stackElt.cur) + " / " + bytesToSize(stackElt.target) + ")</small>";
                                } else if (stackElt.cur > 0) {
                                    message +="<small>(" + bytesToSize(stackElt.cur) + ")</small>";
                                }
                                break;
                            default:
                                if (stackElt.target > 0) {
                                    message += "<small>(" + roundAfterTwoDecimals(stackElt.cur) + " / " + roundAfterTwoDecimals(stackElt.target) + ")</small>";
                                } else if (stackElt.cur > 0) {
                                    message +="<small>(" + roundAfterTwoDecimals(stackElt.cur) + ")</small>";
                                }
                                break;
                        }
                        return message;
                }
                var stackMessage = null;
                if (progress && progress.states && progress.states.length) {
                    var messageStack = [];
                    var lastStackElt = null;
                    for (var i = 0; i < progress.states.length; i++) {
                        if (i == progress.states.length-1 || progress.states[i].important || includeAll) {
                            var stackMessage = buildMessage(progress.states[i]);
                            lastStackElt = progress.states[i];
                            messageStack.push(stackMessage);
                        }
                    }
                    if (lastStackElt != null) {
                        var k = messageStack.length - 1;
                        var lastStackEltDuration = $filter('friendlyDurationShort')(lastStackElt.msSinceStart);
                        lastStackEltDuration = lastStackEltDuration.replace('<', '&lt;')
                        messageStack[k] = messageStack[k] + "<br /><small>Started " + lastStackEltDuration + " ago</small>";
                    }
                    return messageStack.join("<br />");
                } else {
                    return "<span>Please wait...</span>";
                }
            }
        };
    });

    app.directive('futureWaiting', function(DataikuAPI, ProgressStackMessageBuilder, $rootScope) {
        return {
            templateUrl : '/templates/future-waiting.html',
            scope: {
                response : '='
            },
            // IN scope : "response"
            link : function(scope, element, attrs) {
                scope.percentage = 0;
                scope.started = false;

                scope.$watch('response', function(nv, ov) {
                    if(nv && !nv.hasResult) {
                        scope.percentage = ProgressStackMessageBuilder.getPercentage(scope.response.progress);
                        scope.started = scope.response.progress && scope.response.progress.states && scope.response.progress.states.length;
                        scope.stackMessage = ProgressStackMessageBuilder.build(scope.response.progress);
                    }
                });

                scope.abort = function() {
                    if (scope.response && scope.response.jobId) {
                        DataikuAPI.futures.abort(scope.response.jobId).error(setErrorInScope.bind(scope));
                    }
                };
                $rootScope.$on("futureModalOpen", function() {
                	scope.futureModalOpen = true;
                });
                $rootScope.$on("futureModalClose", function() {
                	scope.futureModalOpen = false;
                });
            }
        };
    });

    function formatDoclinkRef(page) {
        if (page.length > 0 && page[0] == '/') {
            page = page.substring(1);
        }

        const anchorPos = page.indexOf('#');
        if (anchorPos >=0) {
            // add '.html' extension before anchor
            return page.substring(0, anchorPos) + '.html' + page.substring(anchorPos);
        } else {
            return page + '.html';
        }
    }

    app.directive('doclink', function($rootScope) {
        return {
            restrict : 'E',
            replace : 'true',
            template : '<a target="_blank" />',
            scope : {
                page: '@',
                title: '@',
                showIcon: '=?'
            },
            link : function($scope, element) {
                var page = $scope.page;
                element[0].href = $rootScope.versionDocRoot + formatDoclinkRef(page);
                let html = $scope.title;
                if (!!$scope.showIcon) {
                    html += ' <i class="icon-external-link"/>';
                }
                $(element[0]).html(html);
            }
        };
    });

    app.directive('docLink', function($rootScope) {
        return {
            restrict : 'EA',
            transclude:true,
            template : '<a target="_blank"><span ng-transclude /></a>',
            link : function($scope, element, attrs) {
                var page = attrs.docLink;
                element.find("a")[0].href = $rootScope.versionDocRoot + formatDoclinkRef(page);
            }
        };
    });

    app.directive('doclinkWrapper', function($rootScope) {
        return {
            restrict : 'EA',
            transclude:true,
            template : '<a target="_blank"><span ng-transclude /></a>',
            link : function($scope, element, attrs) {
                var page = attrs.page;
                element.find("a")[0].href = $rootScope.versionDocRoot + formatDoclinkRef(page);
            }
        };
    });

    app.directive('learnLink', function($rootScope) {
        return {
            restrict : 'A',
            transclude:true,
            template : '<a target="_blank"><span ng-transclude /></a>',
            link : function($scope, element, attrs) {
                var page = attrs.page;
                element.find("a")[0].href = $rootScope.learnRootUrl + page + ".html";
            }
        };
    });

    app.directive('academyLink', function($rootScope) {
        return {
            restrict : 'A',
            transclude:true,
            template : '<a target="_blank"><span ng-transclude /></a>',
            link : function($scope, element, attrs) {
                var page = attrs.page;
                element.find("a")[0].href = $rootScope.academyRootUrl + page;
            }
        };
    });

    app.directive('aboutPartitioningBox', function(CreateModalFromTemplate) {
        return {
            restrict : 'A',
            replace : 'true',
            template : '<a class="about-trigger"><i class="icon-question-sign" /></a>',
            link: function(scope, element, attrs) {
                var out = scope.$parent,
                    $elt = $(element);
                if (out.appConfig.communityEdition && !out.appConfig.licensing.ceEntrepriseTrial
                        && !attrs.skipCommunityPopup) {
                    $elt.on('click', function(e) {
                        CreateModalFromTemplate("/templates/profile/community-vs-enterprise-modal.html",
                            out, null, function(newScope) { newScope.lockedFeature = 'Partitioning is'; });
                        e.preventDefault();
                    });
                } else {
                    $elt.on('click', out.showAboutPartitioning);
                }
            }
        };
    });

    app.directive('selectedIndex', ['keypressHelper', '$parse','Debounce', function(keypressHelper, $parse,Debounce) {
        return {
            require: 'ngModel',
            restrict: 'A',
            scope: true,
            link: function(scope, element, attrs, ngModel) {

                var parsedSelectedIndexAttr = $parse(attrs.selectedIndex);

                var deselect = $parse(attrs.deselect);
                var inModal = $parse(attrs.inModal);
                scope.$watch(() => ngModel.$modelValue, () => {
                    const initialIndex = parseInt(attrs.initialIndex === undefined ? -1 : attrs.initialIndex, 10);
                    scope.selected = {
                        index: initialIndex,
                        item: initialIndex < 0 ? null : ngModel.$modelValue[initialIndex],
                        itemDelayed:null
                    };
                });
                scope.selectNext = function(e) {
                    e.preventDefault();
                    e.stopPropagation();

                    for (let index = scope.selected.index + 1; index < ngModel.$viewValue.length; index++) {
                        const nextIndex = Math.min(ngModel.$viewValue.length - 1, index);
                        if (ngModel.$viewValue[nextIndex].selectable === undefined || ngModel.$viewValue[nextIndex].selectable === true) {
                            scope.selectIndex(nextIndex);
                            return;
                        }
                    }
                };
                scope.selectPrevious = function(e) {
                    e.preventDefault();
                    e.stopPropagation();

                    for (let index = scope.selected.index - 1; index >= -1; index--) {
                        const nextIndex = Math.max(-1, index);
                        if (nextIndex === -1 || ngModel.$viewValue[nextIndex].selectable === undefined || ngModel.$viewValue[nextIndex].selectable === true) {
                            scope.selectIndex(nextIndex);
                            return;
                        }
                    }
                };
                scope.go = function(e) {
                    if(scope.selected.index >= 0) {
                        parsedSelectedIndexAttr(scope, {item:ngModel.$viewValue[scope.selected.index]});
                    }
                };

                scope.handleEnter = function(evt) {
                    if (["INPUT", "SELECT", "TEXTAREA", "BUTTON"].indexOf(evt.target.tagName) == -1) {
                        scope.go();
                    }
                }

                keypressHelper('keydown', scope, $(document), {
                    Keydown: "{'down': 'selectNext($event)','up': 'selectPrevious($event)','enter': 'handleEnter($event)'}"
                }, '', false, !inModal());

                var sd = Debounce().withDelay(50,500).withScope(scope);

                scope.selectIndex = function(index) {
                    var newItem = null;
                    if(scope.selected.index >= 0 && ngModel.$viewValue[scope.selected.index]) {
                        ngModel.$viewValue[scope.selected.index].selectedIndex = false;
                    }
                    if(index>=0 && ngModel.$viewValue[index]) {
                        newItem = ngModel.$viewValue[index];
                    }

                    if (deselect() && scope.selected.item === newItem) {
                        newItem = null;
                    }

                    // selected.item is the currently selected item
                    scope.selected.item = newItem;

                    // selected.confirmedItem is the currently selected item, defined with a little delay
                    scope.selected.confirmedItem = null;
                    sd.exec(function() {
                        scope.selected.confirmedItem = newItem;
                    });

                    scope.selected.index = index;
                    scope.$emit('selectedIndex', index);
                };
            }
        };
    }]);

    app.directive('editableChartInsightSummary', function($stateParams, $rootScope) {
        return {
            scope : true,
            link : function($scope, element, attrs) {
                $scope.$stateParams = $stateParams;
                $scope.editSummaryState = {};
                $scope.startEdit = function() {
                    $scope.editSummaryState.editSummary = true;
                    $scope.editSummaryState.description = $scope.insight.description;
                    $scope.editSummaryState.tags = angular.copy($scope.insight.tags);
                    clearSelection();
                }
                $scope.cancelEdit = function() {
                    $scope.editSummaryState.editSummary = false;
                }
                $scope.validateEdit = function() {
                    $scope.editSummaryState.editSummary = false;
                    $scope.insight.description = $scope.editSummaryState.description;
                    $scope.insight.tags = angular.copy($scope.editSummaryState.tags);
                    $rootScope.$broadcast("objectSummaryEdited");
                }
            }
        };
    });

    app.directive('foldable', function() {
        return {
            scope : true,
            link : function($scope, element, attrs) {
                if (attrs.foldable == "true") {
                    $scope.unfolded = true;
                }
                $scope.toggleFold = function() {
                    $scope.unfolded = !$scope.unfolded;
                };
            }
        };
    });


   app.directive('abortConfirmation', function() {
	   return {
		   restrict: 'AE',
           scope : {
               aborting:'=',
               abortFn : '=',
               abortParamsArr : '='
           },
           templateUrl: "/templates/profile/abort-confirmation.html",
		   link : function($scope, element, attrs) {

			   $scope.showConfirmationForm = function() {
				   $scope.aborting = true;
			   }

			   $scope.hideConfirmationForm = function() {
				   $scope.aborting = false;
			   }

			   $scope.abort = function() {
				   $scope.abortFn.apply(this, $scope.abortParamsArr);
			   }
		   }
	   }
   });

	/**
	 * directive to hold a multi-selection in a list.
     *
     * it takes parameters from the following attributes:
     *  - ng-model : the list on which the directive operates is passed as a ng-model on the same html element
     *               it can also be an object (its keys will then be added as '_name' attribute of the elements)
     *  - auto-select-first : if true, will start with the first element of the list selected
     *  - auto-focus-first : if true, will start with the first element of the list focused
     *  - select-click-behaviour
     *     if none, will focus the line
     *     if 'select-one', the selected object will be checked and others unselected
     *     if 'select-add', it will select the element (like meta + click)
     *  - double-select-unselects : if set, focusing a focused element will unset focus
     *  - keep-focus-on : if set, when clicking on a checkbox re-focus the element
	 *
	 * it adds a 'selection' object in the scope, with the following fields:
     *  - selectedObject : current selected object
     *  - keyboard : boolean controlling whether selection was made with keyboard
     *  - confirmedItem : equals selectedObject after a delay
	 *  - selectedObjects : current list of selected objects
	 *
     *  - all : everything is selected
	 *  - some : something (not everything) is selected
	 *  - none : nothing is selected
	 *  - single : 1 object exactly is selected
     *  - multiple : several objects are selected
     *  - filtered : not all items in list are displayed due to filters
     *  - loaded : everything is fully loaded
     *
	 *  - allObjects : list of all objects (selected or not)
     *  - filterQuery : text for the filter (used in a $filter('filter')(...) )
     *  - filterParams : Filtering parameters ({userQueryTargets:'name of the param for q search',
     *                   propertyRules: {dict for renaming special props}})
     *
     *  - customFilter : a custom filter specifing function(objects) {return filteredobjects}
     *  - customFilterWatch : name of a model to watch to trigger updateFilter
     *
     *  - orderQuery : string/list of strings for the order ( used in a $filter('orderBy')(...) )
     *  - orderReversed : boolean controlling the reversed state of the orderBy
	 *  - filteredObjects : list of visible objects, matching the filter
	 *  - filteredSelectedObjects : list of visible selected objects, matching the filter
     *
     * If you specify selection.partialProperty = 'Something' it will create (for each value available)
     *  - partial[values].all : every object matching object[partialProperty] = value is selected
     *  - partial[values].some : something (not everything) matching object[partialProperty] = value is selected
     * -> your need to regenselectionstate to register the param on first load
     *
	 * each object in the list gets 2 hidden fields:
	 *  - $idx : index in the original list
	 *  - $selected : flag indicated selection or not
	 *
	 * additionally, the following methods for manipulating the selection are added in the scope:
	 *  - checkBoxChanged(object, $event) : a mass selection checkbox is clicked on some object
	 *  - objectClicked(object, $event) : an object in the list is clicked (not on the mass selection checkbox)
     *  - removeObject(object) : removes an object from the list
     *  - removeSelected()) : remove the selected objects
	 *  - updateMassSelectionCheckbox() : to use in a ng-change on the checkbox linked to $scope.selection.all
     *  - updateOrderQuery(value) : sets orderQuery to value, toggling orderReversed if stays the same
	 */
	app.directive("filteredMultiSelectRows", function($filter, $timeout, Debounce, Throttle, Fn, CollectionFiltering, ActiveProjectKey, ActivateOldRightPanel) {
		return {
			scope : false,
			link : function($scope, element, attrs) {
                $scope.ActivateOldRightPanel = ActivateOldRightPanel;
                var filterWithPartialPropertyValue = function(objects, val) {
                    return objects.filter(function(o) {
                        return o[$scope.selection.partialProperty] === val;
                    });
                }

                var computePartialStates = function() {
                    var partialValues = $scope.selection.filteredObjects.map(function(m) {
                        return m[$scope.selection.partialProperty];
                    }).filter(function(value, index, self) {
                        return self.indexOf(value) === index;
                    });
                    var ssp = $scope.selection.partial;
                    partialValues.map(function(val) {
                        var partialFilteredSelectedObjects = filterWithPartialPropertyValue($scope.selection.filteredSelectedObjects, val);
                        var partialFilteredObjects = filterWithPartialPropertyValue($scope.selection.filteredObjects, val);
                        ssp[val] = {
                            all: partialFilteredSelectedObjects.length == partialFilteredObjects.length && partialFilteredObjects.length > 0,
                            some: partialFilteredSelectedObjects.length > 0 && partialFilteredSelectedObjects.length < partialFilteredObjects.length,
                            none: partialFilteredSelectedObjects.length == 0,
                        }
                    });

                }

                var sd = Debounce().withDelay(50,500).withScope($scope);
                var regenSelectionStateFromFlags = function() {
                    const ss = $scope.selection;

                    if (ss.rememberSelection) {
                        ss.allObjects.forEach(el => {
                            const comparator = getRememberSelectionComparator(el);
                            const selectedObjectIndex = ss.selectedObjects.findIndex(comparator);
                            el.$selected = selectedObjectIndex >= 0;
                            if (el.$selected) {
                                ss.selectedObjects[selectedObjectIndex] = el;
                            }
                        });
                    } else {
                        ss.selectedObjects = ss.allObjects.filter(function (o) {
                            return o.$selected;
                        });
                    }

                    if(!ss.filteredObjects) {
                        ss.filteredObjects = [];
                    }
                    ss.filteredSelectedObjects = ss.filteredObjects.filter(f => f.$selected);
                    // regen flags for the tri-state
                    ss.none = ss.filteredSelectedObjects.length === 0;
                    ss.single = ss.selectedObjects.length === 1 && ss.selectedObject!==null;
                    ss.multiple = ss.selectedObjects.filter($scope.isItemSelectablePredicate).length > 1;
                    ss.all = ss.filteredSelectedObjects.length === ss.filteredObjects.filter($scope.isItemSelectablePredicate).length && ss.filteredObjects.length > 0 && ss.filteredSelectedObjects.length > 0;
                    ss.some = ss.filteredSelectedObjects.length > 0 && ss.filteredSelectedObjects.length < ss.filteredObjects.filter($scope.isItemSelectablePredicate).length;
                    ss.filtered = ss.filteredObjects.length !== ss.allObjects.length;

                    if (ss.partialProperty) {computePartialStates();}
                    // enfore sanity of the selected selectedObject field
                    if (ss.selectedObject && ss.allObjects.indexOf(ss.selectedObject) < 0) {
                        //try and find matching object in the refreshed list corresponding to the currently selected object
                        // this crucial when using the Manage Tag modal via the Edit metadata screen, from a list of taggable objects.
                        const matchId = ss.selectedObject.id;
                        const matchingNewObj = ss.allObjects.find((obj) => {
                            return obj.id == matchId && obj.createdOn == ss.selectedObject.createdOn;
                        });
                        ss.selectedObject = matchingNewObj ? matchingNewObj : null;
                    }
                    sd.exec(function() {ss.confirmedItem = ss.selectedObject});
                };

                var updateSorted = function() {
                    if ($scope.selection.orderQuery && $scope.selection.orderQuery !== "" && !$.isEmptyObject($scope.selection.orderQuery)) {
                        $scope.selection.filteredObjects = $filter('orderBy')($scope.selection.filteredObjects, $scope.selection.orderQuery, $scope.selection.orderReversed);
                    }
                    regenSelectionStateFromFlags();
                };

			    var updateFilter = function() {
					$scope.selection.allObjects = $scope.$eval(attrs.ngModel);
    				if (!$scope.selection.allObjects) {
                        $scope.selection.allObjects = [];
                        $scope.selection.loaded = false;
                    } else {
                        $scope.selection.loaded = true;
                    }
                    if ($scope.selection.allObjects.constructor !== Array) {
                        $scope.selection.allObjects = $.map($scope.selection.allObjects, function(v,k) {v._name=k; return [v]});
                    }
                    $scope.selection.allObjects.forEach(function (c, i) {
                        c.$idx = i;
                    });
                    $scope.selection.filteredObjects = $scope.selection.allObjects;

					if ($scope.selection.filterQuery) {
                        $scope.selection.filteredObjects = CollectionFiltering.filter($scope.selection.filteredObjects, $scope.selection.filterQuery, $scope.selection.filterParams);
					}
                    if ($scope.selection.customFilter) {
                        $scope.selection.filteredObjects = $scope.selection.customFilter($scope.selection.filteredObjects);
                    }
                    updateSorted();
			    };

                var debouncedUpdateFilter = Throttle().withDelay(500).wrap(updateFilter);

                function setSelectedObject(newObject) {
                    if (newObject && newObject.$selected) {
                        $scope.selection.selectedObject = newObject;
                    } else {
                        $scope.selection.selectedObject = null;
                    }

                    // if this list is flagged as updating the ActiveProjectKey service,
                    // pass to the service the projectKey of the newly selected object, where it exists
                    if (attrs.updateActiveProjectKey) {
                        const projectKey = (!!newObject && newObject.projectKey) ? newObject.projectKey : undefined;
                        ActiveProjectKey.set(projectKey);
                    }
                }

                $scope.updateOrderQuery = function(value) {
                    var ss = $scope.selection;
                    if (ss.orderQuery === value) {
                        ss.orderReversed = !ss.orderReversed;
                    } else {
                        ss.orderReversed = false;
                        ss.orderQuery = value;
                    }
                }

                $scope.removeSelected = function() {
                    $scope.selection.selectedObjects.forEach($scope.removeObject);
                }
				$scope.removeObject = function(object) {
			        var idx = $scope.selection.allObjects.indexOf(object);
			        if (idx === -1) {
			            return;
			        }

			        $scope.selection.allObjects.splice(idx, 1);
			        updateFilter();
				};

                var clearNonEmptyKeys = function (obj) {
                    if ($.isPlainObject(obj)) {
                        for (var k in obj) {
                            obj[k] = clearNonEmptyKeys(obj[k]);
                        }
                        return obj;
                    } else if ($.isArray(obj)) {
                        return []
                    } else {
                        return "";
                    }
                };
                $scope.clearFilters = function () {
                    $scope.selection.filterQuery = clearNonEmptyKeys($scope.selection.filterQuery);
                    if ($scope.selection.inclusiveFilter) $scope.selection.inclusiveFilter = clearNonEmptyKeys($scope.selection.inclusiveFilter);
                };
                $scope.isEmptyFilter = function () {
                    return angular.equals($scope.selection.filterQuery, clearNonEmptyKeys(angular.copy($scope.selection.filterQuery))) &&
                        (!$scope.selection.inclusiveFilter || angular.equals($scope.selection.inclusiveFilter, clearNonEmptyKeys(angular.copy($scope.selection.inclusiveFilter))));
                };

                $scope.updateMassSelectionCheckbox = function (partialPropertyValue) {
                    var state, filteredObjects;
                    if (partialPropertyValue) {
                        filteredObjects = filterWithPartialPropertyValue($scope.selection.filteredObjects, partialPropertyValue)
                        state = $scope.selection.partial[partialPropertyValue].none;
                    } else {
                        filteredObjects = $scope.selection.filteredObjects;
                        state = $scope.selection.none;
                    }
                    filteredObjects.forEach(function (object) {
                        handleObjectSelection(object, state);
                    });
                    setSelectedObject(null);
                    regenSelectionStateFromFlags();
                    if (attrs.keepFocusOn) {
                        element.focus();
                    }
                };

                function handleObjectSelection(object, checked) {
                    if (!$scope.isItemSelectablePredicate(object)) {
                        return;
                    }

                    object.$selected = checked;
                    if ($scope.selection.rememberSelection) {
                        addOrRemoveRememberedObject(object);
                    }

                }

                function getRememberSelectionComparator(object) {
                    let comparator;
                    if (angular.isString($scope.selection.rememberSelectionComparator)) {
                        comparator = (el) => {
                            return el[$scope.selection.rememberSelectionComparator] === object[$scope.selection.rememberSelectionComparator];
                        };
                    } else if (angular.isFunction($scope.selection.rememberSelectionComparator)) {
                        comparator = (el) => {
                            return $scope.selection.rememberSelectionComparator(el, object);
                        };
                    } else {
                        comparator = (el) => {
                            return el === object;
                        };
                    }

                    return comparator;
                }

                function addOrRemoveRememberedObject(object) {
                    const comparator = getRememberSelectionComparator(object);
                    const rememberedElementIndex = $scope.selection.selectedObjects.findIndex(comparator);
                    if (object.$selected && rememberedElementIndex === -1) {
                        $scope.selection.selectedObjects.push(object);
                    } else if (!object.$selected && rememberedElementIndex !== -1) {
                        $scope.selection.selectedObjects.splice(rememberedElementIndex, 1);
                    }
                }

                var clickHappened = function(object, event, source, oldSelected) {
                    var idx = $scope.selection.filteredObjects.indexOf(object);
                    if ($scope.selection.rememberSelection) {
                        addOrRemoveRememberedObject(object);
                    }
                    if (idx === -1) {
                        return;
                    }

                    if (source == "checkbox") {
                        setSelectedObject(object);
                    } else if (event.ctrlKey || event.metaKey) {
                        handleObjectSelection(object, !oldSelected);
                    } else {
                        if (attrs.doubleSelectUnselects && $scope.selection.selectedObjects.length == 0 && $scope.selection.selectedObject === object) {
                            setSelectedObject(null);
                        }

                        if (source == "click") {
                            $scope.selection.filteredSelectedObjects.forEach(obj => handleObjectSelection(obj, false));
                            // If multiple objects are selected and we click on an object, unselect everything except the clicked one
                            const selected = $scope.selection.selectedObjects.length > 1 ? true : !oldSelected;
                            handleObjectSelection(object, selected);
                            setSelectedObject(object);
                        }
                    }

                    if (event.shiftKey && $scope.selection.selectedObjects.length > 0) {
                        // extend selection within the filtered objects
                        var firstSelected = $scope.selection.filteredObjects.indexOf($scope.selection.selectedObjects[0]);
                        var lastSelected = $scope.selection.filteredObjects.indexOf($scope.selection.selectedObjects[$scope.selection.selectedObjects.length -1]);
                        var newFirstSelected = Math.min(firstSelected, idx);
                        var newLastSelected = Math.max(lastSelected, idx);
                        $scope.selection.filteredObjects.forEach(function(o, i) {
                            handleObjectSelection(o, i >= newFirstSelected && i <= newLastSelected);
                        });
                    } else if (attrs.selectClickBehaviour && source === 'click') {
                        if (attrs.selectClickBehaviour === 'select-one') {
                            $scope.selection.selectedObjects.forEach(function(o) {
                                handleObjectSelection(o, false);
                            });
                            handleObjectSelection(object, true);
                        } else {
                            handleObjectSelection(object, !object.$selected);
                        }
                    }
                    regenSelectionStateFromFlags();

                    // If only one item remains selected in the list, select it for the right panel
                    if ($scope.selection.selectedObjects.length === 1 && !$scope.selection.selectedObject) {
                        $scope.selection.selectedObject = $scope.selection.selectedObjects[0];
                    }
                };

                $scope.checkBoxChanged = function(object,event) {
                    // in a timeout so that the checkbox doesn't get disconnected from its state
                    var oldSelected = object.$selected;
                    return $timeout(() => {
                        clickHappened(object, event, "checkbox", oldSelected);
                        if (attrs.keepFocusOn) {
                            element.focus();
                        }
                    });
                };
                $scope.objectClicked = function(object, event) {
                    /* Actually handles the click */
                    clickHappened(object, event, "click", object.$selected);
                    event.preventDefault();
                };
                $scope.regenSelectionStateFromFlags = regenSelectionStateFromFlags;
                $scope.updateSorted = updateSorted;

                var keyCodes = {
                    tab: 9,
                    pageup: 33,
                    pagedown: 34,
                    left: 37,
                    up: 38,
                    right: 39,
                    down: 40,
                    space: 32,
                };
                $scope.multiSelectKeydown = function(event, callFromFatTable) {
                    function setNewSelected(newObj) {
                        setSelectedObject(newObj);
                        sd.exec(function() {
                            $scope.selection.confirmedItem = $scope.selection.selectedObject;
                        });
                    }

                    function selectIfNotSelected(newObj) {
                        if (!newObj || newObj.$selected) {
                            return;
                        }
                        if (!event.shiftKey) {
                            $scope.selection.selectedObjects.forEach(o => handleObjectSelection(o, false));
                        }
                        newObj.$selected = true;
                        setNewSelected(newObj);
                    }

                    if ($(event.target).is('input:text')||$(event.target).is('textarea')) {
                        return;
                    }

                    var object = $scope.selection.selectedObject;
                    var idx = $scope.selection.filteredObjects.indexOf(object);
                    if (idx === -1) {return;}

                    if (event.keyCode === keyCodes.up) {
                        event.preventDefault();
                        if (idx > 0) {
                            for (let i = 1; i <= idx; i++) {
                                if ($scope.selection.filteredObjects[i].$selected) {
                                    selectIfNotSelected($scope.selection.filteredObjects[i-1]);
                                    break;
                                }
                            }
                        }
                    } else if (event.keyCode === keyCodes.down) {
                        event.preventDefault();
                        if (idx < $scope.selection.filteredObjects.length - 1) {
                            for (let i = $scope.selection.filteredObjects.length - 2; i >= idx; i--) {
                                if ($scope.selection.filteredObjects[i].$selected) {
                                    selectIfNotSelected($scope.selection.filteredObjects[i+1]);
                                    break;
                                }
                            }
                        }
                    }
                    if (callFromFatTable && (event.keyCode === keyCodes.up || event.keyCode === keyCodes.down)) {
                        $scope.$broadcast('scrollToLine', idx);
                    }
                    regenSelectionStateFromFlags();
                }

                function initSelection() {
                    if ($scope.selection === undefined) {$scope.selection={};}
                    $scope.selection.rememberSelection = attrs.rememberSelection !== undefined;
                    $scope.isItemSelectablePredicate = (el) => {
                        const passedFunction = $scope.$eval(attrs.isItemSelectablePredicate);
                        return passedFunction === undefined || angular.isFunction(passedFunction) && passedFunction(el) === true
                    };
                    if ($scope.selection.rememberSelection) {
                        $scope.selection.rememberSelectionComparator = $scope.$eval(attrs.rememberSelectionComparator);
                        $scope.selection.selectedObjects = [];
                    }
                    if ($scope.selection.orderQuery===undefined) {$scope.selection.orderQuery=[];}
                    if ($scope.selection.filterQuery===undefined) {$scope.selection.filterQuery={};}
                    if ($scope.selection.orderReversed===undefined) {$scope.selection.orderReversed=false;}
                    // fill with empty & wait for scope to refresh to continue
                    if ($scope.selection.allObjects===undefined) {$scope.selection.allObjects=[];}
                    if ($scope.selection.filteredObjects===undefined) {$scope.selection.filteredObjects=[];}
                    if ($scope.selection.filterParams===undefined) {$scope.selection.filterParams={};}
                    if ($scope.selection.partial === undefined) {$scope.selection.partial = {};}

                    if (attrs.updateActiveProjectKey) setSelectedObject(null);

                    $timeout(function () {
                        updateFilter();
                        if (attrs.autoSelectFirst && $scope.selection.allObjects.length > 0) {
                            $scope.selection.filteredObjects.forEach(function (o) {
                                handleObjectSelection(o, false);
                            });
                            setSelectedObject($scope.selection.filteredObjects[0]);
                            handleObjectSelection($scope.selection.filteredObjects[0], true);
                            regenSelectionStateFromFlags();
                        }
                        if (attrs.autoFocusFirst) {
                            $scope.selection.filteredObjects.forEach(function (o) {
                                handleObjectSelection(o, false);
                            });
                            setSelectedObject($scope.selection.filteredObjects[0]);
                            regenSelectionStateFromFlags();
                        }
                    });
                }
                initSelection();
                $scope.$watch('selection.filterQuery', debouncedUpdateFilter, true);
                if ($scope.selection.customFilterWatch) {
                    $scope.$watch($scope.selection.customFilterWatch, debouncedUpdateFilter, true);
                }
                $scope.$watch('selection.orderQuery', updateSorted, true);
                $scope.$watch('selection.orderReversed', updateSorted);

                // We can't deep watch all the objects of the list (very slow), so this event can be used to refresh list's ordering when an item was mutated
                $scope.$on('refresh-list', updateFilter);

                $scope.$watch(attrs.ngModel, updateFilter); // $watchCollection doesn't trigger on array reference changes
			    $scope.$watchCollection(attrs.ngModel, updateFilter); // to catch changes caused by adding/removing
			}
		};
	});

    app.directive("dkuFiltered", function(Fn, CollectionFiltering, $compile) {
        // small directive wrapping CollectionFiltering (magic around angular filter)
        // use <div dku-filtered="collectionToFilter"></div>
        // Defines a new scope with :
        //  * objects.all : list of all elements of collectionToFilter
        //  * objects.filterQuery : filterQuery to be passed to CollectionFiltering (see its doc)
        //  * objects.filterParams : filterParams to be passed to CollectionFiltering (see its doc)
        //  * objects.filtered : filtered elements of collectionToFilter
        return {
            scope : true,
            link : function($scope, element, attrs) {
                $scope.objects = {};
                var updateFilter = function() {
                    $scope.objects.filtered = CollectionFiltering.filter($scope.objects.all, $scope.objects.filterQuery, $scope.objects.filterParams);
                }
                var updateObjects = function(nv) {
                    $scope.objects.all = nv || [];
                    if ($scope.objects.all.constructor !== Array) {
                        $scope.objects.all = $.map($scope.objects.all, function(v,k) {v._name=k; return [v]});
                    }
                    updateFilter();
                };
                $scope.updateObjects = updateObjects;
                $scope.$watch(attrs.dkuFiltered, updateObjects, true);
                $scope.$watch('objects.filterQuery', updateFilter, true);
            }
        };
    });

    app.directive('activityIndicator', function() {
        return {
            restrict: 'E',
            scope : {
                activityIndicator : '='
            },
            templateUrl: "/templates/activity-indicator.html"
        }
    });

})();

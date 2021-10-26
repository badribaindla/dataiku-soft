(function(){
    "use strict";
    var app = angular.module('dataiku.charts');

    window.dkuDragType = (
        window.navigator.userAgent.indexOf("Trident") >= 0) ? "Text" :
            (window.navigator.userAgent.indexOf("Edge") >= 0 ? "text/plain" : "json");

    function setDragActive() {
        $(".chart-configuration-wrapper").addClass("drag-active");
    }
    function setDragInactive(){
        $(".chart-configuration-wrapper").removeClass("drag-active");
    }

    function addClassHereAndThere(element, clazz) {
        $(element).addClass(clazz);
        $(element).parent().parent().addClass(clazz);
    }

    function removeClassHereAndThere(element, clazz) {
        $(element).removeClass(clazz);
        $(element).parent().parent().removeClass(clazz);
    }

    app.directive("chartMultiDragDropZones", function($parse) {
        return {
            link : function($scope, element, attrs) {
                $scope.activeDragDrop = {};

                $scope.onDragEnd = function() {
                    // Unhide the moved element, as ng-repeat will reuse it
                    if($scope.activeDragDrop.draggedElementToHide) $scope.activeDragDrop.draggedElementToHide.show();
                    clear($scope.activeDragDrop);
                    setDragInactive();
                };

                element[0].addEventListener("dragend", function(e) {
                    $scope.$apply($scope.onDragEnd);
                });
            }
        };
    });

    app.directive("chartDragCopySource", function($parse) {
        return {
            link : function($scope, element, attrs) {
                var el = element[0];
                el.draggable = true;

                el.addEventListener('dragstart', function(e) {
                    $scope.$apply(function() {
                    $scope.activeDragDrop.active = true;
                    setDragActive();
                    $scope.activeDragDrop.data = $scope.$eval(attrs.chartDragCopySource);
                    });
                    e.dataTransfer.effectAllowed = "copy";
                    e.dataTransfer.setData(dkuDragType, JSON.stringify($scope.activeDragDrop.data));
                    // FIXME highlight droppable
                    this.classList.add('dragging');
                    return false;
                },false);

                el.addEventListener('dragend', function(e) {
                    this.classList.remove('dragging');
                    return false;
                },false);
            }
        };
    });


    app.directive("chartDragDropListItem", function($parse) {
        return {
            link : function($scope, element, attrs) {
                $(element).attr("draggable", "true");

                element[0].addEventListener('dragstart', function(e) {
                    var draggedElement = $(e.target);

                    $scope.$apply(function() {
                        $scope.activeDragDrop.active = true;
                        setDragActive();
                        $scope.activeDragDrop.moveFromList = $scope.$eval(attrs.chartDragDropListItem);
                        $scope.activeDragDrop.moveFromListIndex = draggedElement.index();
                        $scope.activeDragDrop.data = $scope.activeDragDrop.moveFromList[$scope.activeDragDrop.moveFromListIndex];
                        $scope.activeDragDrop.draggedElementToHide = draggedElement;
                    });

                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData(dkuDragType, JSON.stringify($scope.activeDragDrop.data));

                    this.classList.add('dragging');
                    return false;
                }, false);
            }
        };
    });

    app.directive("chartDragDropList", function($parse, Assert) {
        return {
            scope: true,
            link : function($scope, element, attrs) {
                var acceptFunc = function(data){
                    return {
                        accept: true,
                        message: 'Drop here'
                    };
                };
                if(attrs.acceptDrop) {
                    var parsed = $parse(attrs.acceptDrop);
                    acceptFunc = function(data){
                        return parsed($scope.$parent || $scope, {'data': data});
                    };
                }

                var placeholderPos = attrs.placeholderPos || "end";
                var placeholder = $('<li class="sortable-placeholder" />');
                var placeholderAttachedOnce = false;

                var onDragOverOrEnter = function(e) {
                    this.classList.add('over');
                    addClassHereAndThere(this, "over");

                    var dropLi = $(e.target).closest("li");

                    if($scope.activeDragDrop.draggedElementToHide) $scope.activeDragDrop.draggedElementToHide.hide();

                    // Do we accept this payload ?
                    var accepted = acceptFunc($scope.activeDragDrop.data);
                    if(accepted.accept){
                        e.dataTransfer.dropEffect = 'copyMove';

                        if (!dropLi.is("li") && $(e.target).is("ul")) {
                            $(e.target).append(placeholder);
                        } else if (dropLi.is("li")) {
                            $(dropLi)[placeholder.index() < dropLi.index() ? 'after' : 'before'](placeholder);
                        } else {
                        }

                        e.preventDefault();
                    } else {
                		$scope.$apply(function(){
                			$scope.validity.tempError = {};
                    		$scope.validity.tempError.type = 'MEASURE_REJECTED';
                        	$scope.validity.tempError.message = accepted.message;
                    	});
                    }
                };
                element[0].addEventListener('dragover', onDragOverOrEnter, false);
                element[0].addEventListener('dragenter', onDragOverOrEnter, false);

                element[0].addEventListener('dragleave', function(e) {
                    removeClassHereAndThere(this, "over");
            		$scope.$apply(function(){
                		delete $scope.validity.tempError;
                	});
                    return false;
                },false);

                // This is triggered as soon as a drag becomes active on the page
                // and highlights the drop zone if it's accepted
                $scope.$watch("activeDragDrop.active", function(nv, ov) {
                    if (nv) {
                        var accepted = acceptFunc($scope.activeDragDrop.data);
                        // element.attr('data-over-message', accepted.message);
                        if (accepted.accept) {
                            addClassHereAndThere(element, "drop-accepted");
                            window.setTimeout(function() {
                                if (placeholderPos == "end"){
                                    element.append(placeholder);
                                } else {
                                    element.prepend(placeholder);
                                }
                                placeholderAttachedOnce = true
                            }, 10);
                        } else {
                            addClassHereAndThere(element, "drop-rejected");
                        }
                    } else {
                        removeClassHereAndThere(element, "drop-accepted");
                        removeClassHereAndThere(element, "drop-rejected");

                        if (placeholderAttachedOnce) {
                            window.setTimeout(function() {placeholder.detach()}, 10);
                        }
                    }
                }, true);

                element[0].addEventListener('drop', function(e) {
                    Assert.trueish($scope.activeDragDrop.active, 'no active drag and drop');

                    // Stops some browsers from redirecting.
                    if (e.stopPropagation) e.stopPropagation();

                    removeClassHereAndThere(this, "over");

                    var data = JSON.parse(e.dataTransfer.getData(dkuDragType));

                    // At which index are we dropping ?
                    var dropIndex = $(e.target).index();

                    // call the passed drop function
                    $scope.$apply(function($scope) {
                        var targetList = $scope.$eval(attrs.chartDragDropList);
                        var newData = angular.copy($scope.activeDragDrop.data);
                        delete newData.$$hashKey;
                        newData.__justDragDropped = true;

                        if ($scope.activeDragDrop.moveFromList && $scope.activeDragDrop.moveFromList === targetList) {
                            var oldIdx = $scope.activeDragDrop.moveFromListIndex;

                            if (dropIndex > oldIdx && dropIndex > 0) {
                                dropIndex--;
                            }

                            targetList.splice(dropIndex, 0, targetList.splice(oldIdx, 1)[0]);

                        } else if ($scope.activeDragDrop.moveFromList) {
                            targetList.splice(dropIndex, 0, newData);
                            if ($scope.activeDragDrop.moveFromList) {
                                $scope.activeDragDrop.moveFromList.splice($scope.activeDragDrop.moveFromListIndex, 1);
                            }
                        } else {
                            targetList.splice(dropIndex, 0, newData);
                        }

                        // Force remove placeholder right now
                        removeClassHereAndThere(element, "drop-accepted");
                        removeClassHereAndThere(element, "drop-rejected");
                        placeholder.detach();

                        $scope.onDragEnd();

                        $scope.$emit("dragDropSuccess");
                    });
                    return false;
                },false);
            }
        };
    });


    /**
     * Mono-valued list drop zone. No placeholder since drop replaces
     */
    app.directive("chartDragDropListReplace", function($parse, Assert) {
        return {
            scope: true,
            link: function($scope, element, attrs) {
                var acceptFunc = function(data){
                    return {
                        accept: true,
                        message: 'Drop here'
                    };
                };
                if(attrs.acceptDrop) {
                    var parsed = $parse(attrs.acceptDrop);
                    acceptFunc = function(data){
                        return parsed($scope.$parent || $scope, {'data': data});
                    };
                }

                var onDragOverOrEnter = function(e) {
                    this.classList.add('over');
                    $(this).parent().parent().addClass("over");
                    var dropLi = $(e.target).closest("li");

                    if($scope.activeDragDrop.draggedElementToHide) $scope.activeDragDrop.draggedElementToHide.hide();

                    // Do we accept this payload ?
                    var accepted = acceptFunc($scope.activeDragDrop.data);
                    if(accepted.accept){
                        e.dataTransfer.dropEffect = 'copyMove';
                        e.preventDefault();
                    } else {
                		$scope.$apply(function(){
                			$scope.validity.tempError = {};
                    		$scope.validity.tempError.type = 'MEASURE_REJECTED';
                        	$scope.validity.tempError.message = accepted.message;
                    	});
                    }
                };
                element[0].addEventListener('dragover', onDragOverOrEnter, false);
                element[0].addEventListener('dragenter', onDragOverOrEnter, false);

                element[0].addEventListener('dragleave', function(e) {
                    this.classList.remove('over');
                    $(this).parent().parent().removeClass("over");
    	            $scope.$apply(function(){
    	            	delete $scope.validity.tempError;
                    });
                    return false;
                }, false);

                // This is triggered as soon as a drag becomes active on the page
                // and highlights the drop zone if it's accepted
                $scope.$watch("activeDragDrop.active", function(nv, ov) {
                    if (nv) {
                        var accepted = acceptFunc($scope.activeDragDrop.data);
                        // element.attr('data-over-message', accepted.message);
                        if (accepted.accept) {
                            addClassHereAndThere(element, "drop-accepted");
                        } else {
                            addClassHereAndThere(element, "drop-rejected");
                        }
                    } else {
                        removeClassHereAndThere(element, "drop-accepted");
                        removeClassHereAndThere(element, "drop-rejected");
                    }
                }, true);

                element[0].addEventListener('drop', function(e) {
                    Assert.trueish($scope.activeDragDrop.active, 'no active drag and drop');

                    // Stops some browsers from redirecting.
                    if (e.stopPropagation) e.stopPropagation();

                    this.classList.remove('over');
                    $(this).parent().parent().removeClass("over");

                    var data = JSON.parse(e.dataTransfer.getData(dkuDragType));

                    // At which index are we dropping ?
                    var dropIndex = $(e.target).index();

                    // call the passed drop function
                    $scope.$apply(function($scope) {
                        var targetList = $scope.$eval(attrs.chartDragDropListReplace);
                        var newData = angular.copy($scope.activeDragDrop.data);
                        delete newData.$$hashKey;
                        newData.__justDragDropped = true;

                        if ($scope.activeDragDrop.moveFromList && $scope.activeDragDrop.moveFromList === targetList) {
                            // DO nothing ...

                        } else if ($scope.activeDragDrop.moveFromList) {
                            targetList.splice(0, targetList.length);
                            targetList.push(newData);
                            $scope.activeDragDrop.moveFromList.splice($scope.activeDragDrop.moveFromListIndex, 1);
                        } else {
                            targetList.splice(0, targetList.length);
                            targetList.push(newData);
                        }

                        // Force remove placeholder right now
                        element.removeClass("drop-accepted");
                        element.removeClass("drop-rejected");
                        //placeholder.detach();

                        $scope.onDragEnd();

                        $scope.$emit("dragDropSuccess");
                    });
                    return false;
                },false);
            }
        };
    });
})();

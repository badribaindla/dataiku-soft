(function() {
'use strict';

const app = angular.module('dataiku.collab.timeline', []);


app.directive("objectTimelineWithPost", function(DataikuAPI) {
    return {
        templateUrl: '/templates/widgets/object-timeline-with-post.html',
        restrict: "A",
        scope: {
            objectType: '=',
            projectKey: '=',
            objectId: '=',
            initialTimeline: '=',
            initialFetch: '@',
            fetchTimelinePromiseFn: '=?'
        },
        link: function($scope) {
            $scope.refreshTimeline = function () {
                if ($scope.fetchTimelinePromiseFn) {
                    $scope.fetchTimelinePromiseFn().success(function (data) {
                        $scope.timeline = data;
                    }).error(setErrorInScope.bind($scope));
                } else {
                    DataikuAPI.timelines.getForObject($scope.projectKey, $scope.objectType, $scope.objectId).success(function (data) {
                        $scope.timeline = data;
                    }).error(setErrorInScope.bind($scope));
                }
            };
            $scope.$watch("initialTimeline", function(nv, ov) {
                if (nv) $scope.timeline = $scope.initialTimeline;
            });
            if ($scope.initialFetch) {
                $scope.refreshTimeline();
            }
        }
    }
});


app.service("TimelineItemUtils", function() {
    const svc = this;
    this.isAboutTags = function(evt) {
        return evt.details.addedTags || evt.details.removedTags;
    };
    this.isAboutTasks = function(evt) {
        return evt.details.totalTasks != null;
    };
    this.isAboutDescriptions = function(evt) {
        return evt.details.descriptionEdited || evt.details.shortDescEdited;
    };
    this.isAboutTagsOnly = function(evt) {
        return svc.isAboutTags(evt) && !svc.isAboutTasks(evt) && !svc.isAboutDescriptions(evt);
    };
    this.isAboutTasksOnly = function(evt) {
        return !svc.isAboutTags(evt) && svc.isAboutTasks(evt) && !svc.isAboutDescriptions(evt);
    };
    this.isMoreComplex = function(evt) {
        return !svc.isAboutTasksOnly(evt) && !svc.isAboutTagsOnly(evt)
    };
});


app.directive('timeline', function($filter, $state) {
    return {
        templateUrl: '/templates/timeline.html',
        scope: {
            timeline: '=timeline',
            context: '@',
            reverse: '@'
        },
        link: function(scope, element) {
            function humanReadableObjectType (objectType) {
                if (!objectType) return;
                switch(objectType) {
                case "MANAGED_FOLDER":
                    return "folder";
                case "SAVED_MODEL":
                    return "model";
                case "MODEL_EVALUATION_STORE":
                    return "evaluation store";
                case "LAMBDA_SERVICE":
                    return "API service";
                default:
                    return objectType.toLowerCase().replace('_', ' ');
                }
            }

            let maxItems = 15;

            function update() {
                if (!scope.timeline) {return}
                angular.forEach(scope.timeline.items, function(item) {
                    item.day = $filter('friendlyDate')(item.time);
                    item.humanReadableObjectType = humanReadableObjectType(item.objectType);
                    item.details = item.details || {};
                    item.details.objectDisplayName = item.details.objectDisplayName || item.objectId;
                });

                const displayedItems = scope.timeline.items ? scope.timeline.items.slice() : [];

                scope.orderedItems = $filter('orderBy')(displayedItems, (scope.reverse?'-time':'time'));
                scope.orderedItems = scope.orderedItems.slice(0, maxItems);

                /* Insert days separators */
                scope.orderedItemsWithDays = [];
                scope.orderedItems.forEach(function(x, i) {
                    if (i === 0) {
                        scope.orderedItemsWithDays.push({isSeparator: true, day : x.day});
                        scope.orderedItemsWithDays.push(x);
                    } else if (x.day === scope.orderedItems[i-1].day) {
                        scope.orderedItemsWithDays.push(x);
                    } else {
                        scope.orderedItemsWithDays.push({isSeparator: true, day : x.day});
                        scope.orderedItemsWithDays.push(x);
                    }
                });
            }

            scope.$state = $state;
            scope.$watch('timeline', function(nv, ov) {
                if(nv) update();
            });

            scope.scroll = function() {
                maxItems += 20;
                update();
            }
        }
    };
});


app.directive('timelineItem', function(TimelineItemUtils) {
    return {
        templateUrl: '/templates/timeline-item.html',
        link: function(scope) {
            scope.TimelineItemUtils = TimelineItemUtils;
        }
    };
});


app.directive('discussionMentionItem', function() {
    return {
        templateUrl: '/templates/discussion-mention-item.html',
    };
});

app.directive('discussionReplyItem', function() {
    return {
        templateUrl: '/templates/discussion-reply-item.html',
    };
});

app.directive('discussionCloseItem', function() {
    return {
        templateUrl: '/templates/discussion-close-item.html',
    };
});

app.directive('commitMentionItem', function() {
    return {
        templateUrl: '/templates/commit-mention-item.html',
    };
});


app.directive('timelineTaskItem', function(DataikuAPI) {
    return {
        templateUrl: '/templates/task-notification-item.html',
        link: function(scope) {
            scope.downloadExport = function(exportId) {
                downloadURL(DataikuAPI.exports.getDownloadURL(exportId));
            };
        }
    };
});


})();
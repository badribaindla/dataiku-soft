(function(){
'use strict';

var app = angular.module('dataiku.bundles.common',[]);

app.directive("bundleGitLog", function() {
    return {
        templateUrl : "/templates/bundles/common/bundle-git-log.html",
        scope : {
            changelog : '=',
            noCommitDiff: '=?'
        },
        link : function($scope, element, attrs) {
            var hasMore = true;

            $scope.showMore = function() {
                if (hasMore) {
                    $scope.logEntries = $scope.changelog.logEntries.slice(0, $scope.logEntries.length + 50);
                    hasMore = $scope.logEntries.length < $scope.changelog.logEntries.length;
                }
            };

            $scope.logEntries = $scope.changelog.logEntries.slice(0, 50);
        }
    }
});

app.directive("bundleGitDiff", function(DiffFormatter) {
    return {
        templateUrl : "/templates/bundles/common/bundle-git-diff.html",
        scope : {
            changelog : '='
        }
    }
});

app.directive("bundleConfigContent", function(FeatureFlagsService) {
    return {
        templateUrl : "/templates/bundles/common/bundle-config-content.html",
        scope : {
            configContent : '='
        },
        link : function($scope, element, attrs) {
            $scope.featureFlagEnabled = FeatureFlagsService.featureFlagEnabled;
        }
    }
});

app.directive("bundleNonEditableContent", function(FeatureFlagsService) {
    return {
        templateUrl : "/templates/bundles/common/non-editable-bundle-content.html",
        scope : {
            contentSummary : '='
        },
        link : function($scope, element, attrs) {
            $scope.featureFlagEnabled = FeatureFlagsService.featureFlagEnabled;
        }
    }
});

app.service("DiffFormatter", function($filter){
    var DiffFormatter = {
        formatChange : function(fileChange) {
            var html = '<div class="diff-file-change">';
            fileChange.c.forEach(function(line, idx){
                var s = fileChange.s[idx];
                // var escaped = $("<div>").text(line).html(); // jQuery version
                var escaped = $filter('escapeHtml')(line); // DSS version
                html += '<div class="l ' + s + '">';
                html += '<span class="n" value="' + idx + '"></span>';
                html += '<span class="c" value="' + escaped[0] + '">' + escaped.substring(1) + '</span>';
                html += '</div>';
            });
            return html;
        }
    }
    return DiffFormatter;
})

})();

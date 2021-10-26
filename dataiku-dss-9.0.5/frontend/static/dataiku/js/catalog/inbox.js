(function() {
'use strict';


const app = angular.module('dataiku.catalog');


const FACET_FIELDS_DISPLAY_NAMES = Object.freeze({
    'projectName': 'Project',
    'type_raw': 'Type',
    'numColumns': 'Columns',
    'usedIn': 'Used in',
    'user': 'Contributors',
    'storedAs': 'Stored as',
    'projectKey.raw': 'Project',
    'tag.raw': 'Tags',
    'catalog.raw': 'Database Catalog',
    'connection.raw': 'Connection',
    'schema.raw': 'Schema',
    'objectType': 'Object type',
    'closed': 'Status'
});


app.controller('DiscussionsInboxController', function($controller, $scope, $rootScope, DataikuAPI, TopNav, Notification) {

    function searchWrapper(...args) {
        return DataikuAPI.discussions.inbox.search.apply(this, args)
            .success(function(data) {
                $scope.unreadDiscussionFullIds = data.unreadDiscussionFullIds || [];
            }); // No need for error handling here, done in _CatalogControllerBase
    }
    $controller("_CatalogControllerBase", {$scope: $scope, searchEndpoint: searchWrapper});
    $controller('_InboxCatalogSupportController', {$scope});

    TopNav.setLocation(TopNav.DSS_HOME, "inbox", "items", null);

    $scope.inboxPage = true;

    const projectNames = {};
    $scope.users = {};
    $scope.tagMaps = {};
    $scope.unreadDiscussionFullIds = [];

    $scope.query.facets.closed = [0]; // By default, only show open discussions

    $scope.unread = function(item) {
        const fullId = item._source.projectKey+'.'+item._source.discussionId;
        return $scope.unreadDiscussionFullIds.includes(fullId);
    };

    DataikuAPI.taggableObjects.listAllTags()
        .success(function(data) {
            $scope.tagMaps = data;
        })
        .error(setErrorInScope.bind($scope));

    DataikuAPI.security.listUsers()
        .success(function(data) {
            angular.forEach(data, user => $scope.users[user.login] = user.displayName);
        })
        .error(setErrorInScope.bind($scope));

    DataikuAPI.projects.list()
        .success(function(data) {
            angular.forEach(data, project =>projectNames[project.projectKey] = project.name);
        })
        .error(setErrorInScope.bind($scope));

    const ackListenerDestroyer = Notification.registerEvent('discussion-ack', function(evtType, message) {
        if (message.user != $rootScope.appConfig.login) {
            return; // Only ack current user stuff
        }
        const index = $scope.unreadDiscussionFullIds.indexOf(message.projectKey + '.' + message.discussionId);
        if (index > -1) {
            $scope.unreadDiscussionFullIds.splice(index, 1);
        }
    });
    const replyListenerDestroyer = Notification.registerEvent('discussion-reply', function(evtType, message) {
        if (message.user == $rootScope.appConfig.login) {
            return; // Don't mark current user's messages as unread
        }
        const index = $scope.unreadDiscussionFullIds.indexOf(message.projectKey + '.' + message.discussionId);
        if (index == -1) {
            $scope.unreadDiscussionFullIds.push(message.projectKey + '.' + message.discussionId);
        }
    });

    $scope.$on('$destroy', function() {
        ackListenerDestroyer();
        replyListenerDestroyer();
    });
});


// Required stuff for catalog based UI compatibility
app.controller('_InboxCatalogSupportController', function($scope, $location, StateUtils, $filter) {
    $scope.hasNavigator = item => false;

    $scope.itemToIcon = item => 'icon-comments';

    $scope.isItemSelectable = item => false;

    $scope.getLink = function(item) {
        const src = item._source;
        const tor = {
            type: src.objectType.toUpperCase(),
            id: src.objectId,
            projectKey: src.projectKey
        };
        return StateUtils.href.taggableObject(tor, {discussionId: src.discussionId});
    };

    $scope.goToItem = function(item) {
        $location.path($scope.getLink(item));
    };

    $scope.sortBy = [
        {
            label: 'Last reply',
            value: item => item._source.lastReplyTime
        },
        {
            label: 'Read',
            value: item => $scope.unread(item)
        }
    ];
    $scope.sortOptions = {
        column: $scope.sortBy[0].value,
        reverse: true
    };

    $scope.formatFacetField = function(field) {
        return FACET_FIELDS_DISPLAY_NAMES[field] || $filter('capitalize')(field);
    };

    $scope.formatFacetValue = function(value, facet) {
        if (facet == 'closed') {
            return value ? 'Resolved discussions' : 'Opened discussions';
        }
        return value;
    };

    $scope.formatItemName = function(item, inList) {
        const src = item._source;
        // Comes from _source, encode HTML entities in order to display attributes like <stuff
        const topic = (item.highlight && item.highlight['discussions.topic']) ? item.highlight['discussions.topic'][0] : ($filter('escapeHtml')(((src.discussions && src.discussions.length && src.discussions[0].topic) ? src.discussions[0].topic : "Unnamed discussion")));
        const title = topic + " <small>on " + src.objectType.replace('_', ' ') + "</small> " + $filter('escapeHtml')(src.objectName);
        return title;
    };

    $scope.itemCount = function() {
        const hits = $scope.results && $scope.results.hits ? $scope.results.hits.total : 0;
        return '<strong>' + hits + '</strong> discussion' + (hits > 1 ? 's' : '');
    };

    $scope.selectInput = function() {
        $(".catalog-search-input").select();
    };
});

})();

(function() {
'use strict';

const app = angular.module('dataiku.collab.discussions', []);


app.controller('DiscussionsWidgetController', function($scope, $state, $location, $stateParams, $rootScope, $timeout, $filter, Assert, DataikuAPI, WT1, TopNav, Notification, Dialogs, ActivityIndicator, Debounce) {
    let currentItem;

    $scope.appConfig = $rootScope.appConfig;
    $scope.uiState = {};

    /**** UI ****/
    $scope.discussionWidgetPage = function() {
        if (!$scope.discussions) {
            return 'LIST'; //loading
        } else if ($scope.uiState.creatingNewConv) {
            return 'CREATION';
        } else if (!$scope.uiState.creatingNewConv && !$scope.uiState.selectedConv) {
            return 'LIST';
        } else {
            return 'DISCUSSION';
        }
    };

    $scope.onSearchBarEnter = function($event) {
        $event.target.blur();
    };

    $scope.getNewRepliesLabel = function() {
        if (!$scope.uiState.selectedConv) {
            return;
        }
        const newRepliesCount = $scope.getNumberOfNewReplies($scope.uiState.selectedConv, $scope.uiState.cachedUserReadTime || 0);
        return newRepliesCount + ' new repl' + (newRepliesCount > 1 ? 'ies' : 'y');
    };

    $scope.getNumberOfNewReplies = function(discussion, fromTime) {
        if (!discussion) {
            return;
        }
        return discussion.replies.filter(reply => reply.time > fromTime).length;
    };

    $scope.getDisabledReason = function() {
        if (!$scope.uiState.selectedConv && !($scope.uiState.newConvTopic || '').length) {
            return 'The topic cannot be empty!';
        }
        if (!$scope.uiState.selectedConv && ($scope.uiState.newConvTopic || '').length > 200) {
            return 'The topic cannot be longer than 200 characters!';
        }
        if (!($scope.uiState.newReply || '').length) {
            return 'The message cannot be empty!';
        }
        if (($scope.uiState.newReply || '').length > 10000) {
            return 'The message cannot be longer than 10000 characters!';
        }
        return 'Press Enter to insert a new line. And press Ctrl+Enter to send your message.';
    };

    $scope.viewNewReplies = function(scrollToNewReplies) {
        $scope.uiState.displayToastNewReplies = false;
        $scope.uiState.invalidateCachedUserReadTime = true;
        if (scrollToNewReplies) {
            $timeout(function() {
                const el = $('.discussions-widget-list-replies');
                const newReplies = $('.discussions-widget-newreplies');
                if (!newReplies || !el.get(0)) {
                    return;
                }
                const scrollPos = newReplies.length ? el.scrollTop() + newReplies.position().top : el.get(0).scrollHeight;
                el.scrollTop(scrollPos);
            }, 200);
        }

        if ($scope.uiState.selectedConv && (($scope.uiState.selectedConv.users[$rootScope.appConfig.login] || {}).lastReadTime || 0) <= $scope.uiState.selectedConv.lastReplyTime) {
            DataikuAPI.discussions.ack(currentItem.projectKey, currentItem.type, currentItem.id, $scope.uiState.selectedConv.id)
                .error(setErrorInScope.bind($scope));
        }
    };

    $scope.openDiscussion = function(discussion, userAction) {
        $scope.uiState.selectedConv = discussion;
        // handle new replies when discussion is opened
        if ($scope.uiState.selectedConv) {
            // refresh cached user read time when:
            // - flag invalidate is true
            // - action comes from user
            // - no new reply from other users (basically exclude same user replies)
            const newLastReadTime = (($scope.uiState.selectedConv.users[$rootScope.appConfig.login] || {}).lastReadTime || 0);
            const hasLastReadTimeChanged = newLastReadTime != $scope.uiState.cachedUserReadTime;
            const hasNoPeerNewReplies = !$scope.uiState.selectedConv.replies.filter(reply => reply.time > newLastReadTime && reply.author != $rootScope.appConfig.login).length;
            if ($scope.uiState.invalidateCachedUserReadTime || userAction || hasNoPeerNewReplies) {
                $scope.uiState.cachedUserReadTime = newLastReadTime;
                $scope.uiState.invalidateCachedUserReadTime = false;
            }
            // display "view new replies" when action does not comes from user and there are new replies from other users
            if (userAction || hasNoPeerNewReplies) {
                $scope.viewNewReplies(userAction || hasLastReadTimeChanged);
            } else {
                $scope.uiState.displayToastNewReplies = true;
                const convListWidget = $('.discussions-widget-list-replies');
                const newRepliesLine = $('.discussions-widget-newreplies');
                if (convListWidget.size() && newRepliesLine.size()) {
                    $scope.uiState.showToastNewReplies = newRepliesLine.offset().top > convListWidget.offset().top + convListWidget.height() - 30;
                }
            }
        }
    };

    $scope.resetInputs = function() {
        delete $scope.uiState.newConvTopic;
        delete $scope.uiState.newReply;
        delete $scope.uiState.editingTopic;
    };

    $scope.getDiscussionParticipants = function(discussion) {
        const MAX_PARTICIPANT_LIST_LENGTH = 30;
        let participantListLength = 0;
        const participants = [];
        const displayedParticipants = [];
        for (const login in discussion.users) {
            if (discussion.users[login].lastReplyTime > 0) {
                participants.push(discussion.users[login]);
            }
        }
        participants.sort((a, b) => b.lastReplyTime - a.lastReplyTime);
        for (let i = 0; i < participants.length; i++) {
            const escapedDisplayName = $filter('escapeHtml')(participants[i].displayName || 'Unknown user');
            if (participantListLength + escapedDisplayName.length + 2 <= MAX_PARTICIPANT_LIST_LENGTH) {
                displayedParticipants.push(escapedDisplayName);
                participantListLength += escapedDisplayName.length + 2;
            } else {
                break;
            }
        }
        const othersCount = participants.length - displayedParticipants.length;
        let participantsListStr = displayedParticipants.join('<small>, </small>');
        if (othersCount > 0) {
            if (displayedParticipants.length == 0) {
                participantsListStr += participants.length + '<small> participant' + (participants.length > 1 ? 's' : '') + '</small>';
            } else {
                const hiddenParticipantCount = participants.length - displayedParticipants.length;
                participantsListStr += '<small> and </small>' + hiddenParticipantCount + '<small> other' + (hiddenParticipantCount > 1 ? 's' : '') + '</small>';
            }
        }
        return participantsListStr;
    };

    $scope.getDiscussionParticipantsList = function(discussion) {
        const arr = [];
        angular.forEach(discussion.users, function(value, key) {
            arr.push(angular.extend(value, {login: key}));
        });
        arr.sort((a, b) => b.lastReplyTime - a.lastReplyTime);
        return arr;
    };

    $scope.scrollChanged = function(userAction) {
        $timeout(function() {
            const convListWidget = $('.discussions-widget-list-replies');
            const newRepliesLine = $('.discussions-widget-newreplies');
            if (convListWidget.size() && newRepliesLine.size()) {
                $scope.uiState.showToastNewReplies = newRepliesLine.offset().top > convListWidget.offset().top + convListWidget.height() - 30;
                if (userAction && !$scope.uiState.showToastNewReplies && $scope.uiState.displayToastNewReplies) {
                    $scope.viewNewReplies(false);
                }
            }
        });
    };

    /**** Actions ****/
    $scope.closeDiscussion = function(close) {
        if (!$scope.uiState.selectedConv) {
            return;
        }
        DataikuAPI.discussions.close(currentItem.projectKey, currentItem.type, currentItem.id, $scope.uiState.selectedConv.id, close)
            .success(function() {
                WT1.event("discussion-close", {close: close, state: $state.current.name});
                broadcastDiscussionCountChange();
            })
            .error(setErrorInScope.bind($scope));
    };

    $scope.editTopic = function() {
        if (!$scope.uiState.selectedConv || !$scope.uiState.newConvTopic) {
            return;
        }
        WT1.event("discussion-edit-topic", {state: $state.current.name});
        DataikuAPI.discussions.save(currentItem.projectKey, currentItem.type, currentItem.id, $scope.uiState.selectedConv.id, $scope.uiState.newConvTopic)
            .success(() => $scope.uiState.editingTopic = false)
            .error(setErrorInScope.bind($scope));
        $scope.resetInputs();
    };

    $scope.resetEditing = function() {
        delete $scope.uiState.replyEditing;
        delete $scope.uiState.replyEditedText;
    }

    $scope.editReply = function() {
        const validEditedText = ($scope.uiState.replyEditedText || '').length > 0 && ($scope.uiState.replyEditedText || '').length <= 10000;
        if (!$scope.uiState.selectedConv || !($scope.uiState.selectedConv.replies[$scope.uiState.replyEditing] || {}).id || !validEditedText) {
            return;
        }
        WT1.event("discussion-edit-reply", {state: $state.current.name});
        DataikuAPI.discussions.reply(currentItem.projectKey, currentItem.type, currentItem.id, $scope.uiState.selectedConv.id, $scope.uiState.replyEditedText, $scope.uiState.selectedConv.replies[$scope.uiState.replyEditing].id)
            .success(function() {
                $scope.resetEditing();
            })
            .error(setErrorInScope.bind($scope));
        $scope.resetInputs();
    };

    $scope.replyDiscussion = function() {
        const replyTopic = $scope.uiState.newConvTopic || '';
        const replyContent = $scope.uiState.newReply;
        if (!replyContent || (!replyTopic && !$scope.uiState.selectedConv)) {
            return;
        }
        WT1.event("discussion-reply", {
                state: $state.current.name,
                'number_of_discussions': $scope.discussions.length,
                'number_of_replies': $scope.discussions.map(c => c.replies.length).reduce((a,b) => a+b, 0)
        });
        if ($scope.uiState.selectedConv) {
            DataikuAPI.discussions.reply(currentItem.projectKey, currentItem.type, currentItem.id, $scope.uiState.selectedConv.id, replyContent, null)
                .error(setErrorInScope.bind($scope));
        } else {
            DataikuAPI.discussions.create(currentItem.projectKey, currentItem.type, currentItem.id, replyTopic, replyContent)
                .success(function(data) {
                    $scope.uiState.forceSelectedConvId = data.id;
                    broadcastDiscussionCountChange();
                })
                .error(setErrorInScope.bind($scope));
        }
        $scope.resetInputs();
        // ugly hack to remove tooltips
        $timeout(() => { $('body > .tooltip').remove(); });
    };

    $scope.deleteDiscussion = function() {
        if (!$scope.uiState.selectedConv) {
            return;
        }
        Dialogs.confirm($scope, 'Delete discussion', 'Warning: deleting ' + ($scope.uiState.selectedConv.topic ? ('discussion "' + $scope.uiState.selectedConv.topic + '"') : 'this discussion') + ' will erase permanently its whole content including all the replies. This operation is irreversible. Do you want to continue?').then(function() {
            DataikuAPI.discussions.delete(currentItem.projectKey, currentItem.type, currentItem.id, $scope.uiState.selectedConv.id)
                .success(function() {
                    WT1.event("discussion-delete", {state: $state.current.name});
                    delete $scope.uiState.selectedConv;
                    broadcastDiscussionCountChange();
                })
                .error(setErrorInScope.bind($scope));
        });
    };

    function getDiscussionById(id) {
        Assert.inScope($scope, 'discussions');
        return $scope.discussions.find(conv => conv.id == id) || null;
    }

    function refreshDiscussions() {
        const discussionIdFromStateParams = $stateParams.discussionId;
        if (discussionIdFromStateParams) {
            // Clear from stateParams so that it does not stick around if we move directly to another taggable object...
            $state.go('.', {'#': $location.hash(), discussionId: null}, {notify: false, location: 'replace'});
        }
        DataikuAPI.discussions.getForObject(currentItem.projectKey, currentItem.type, currentItem.id)
            .success(function(data) {
                $scope.discussions = data.discussions;
                if ($scope.discussions && $scope.discussions.length > 0 && !$scope.discussions.find(discu => discu.closedOn == 0)) {
                    $scope.uiState.showClosed = true;
                }
                const userActionWhenSingleDiscussion = $scope.discussionId && !$scope.uiState.selectedConv;
                if ($scope.discussionId) {
                    $scope.uiState.forceSelectedConvId = $scope.discussionId();
                }
                if ($scope.uiState.forceSelectedConvId) {
                    $scope.uiState.creatingNewConv = false;
                    $scope.uiState.selectedConv = getDiscussionById($scope.uiState.forceSelectedConvId);
                    delete $scope.uiState.forceSelectedConvId;
                }
                if ($scope.uiState.selectedConv) {
                    $scope.openDiscussion(getDiscussionById($scope.uiState.selectedConv.id), userActionWhenSingleDiscussion);
                } else if (discussionIdFromStateParams && !$scope.discussionId) {
                    const discussion = getDiscussionById(discussionIdFromStateParams);
                    if (discussion) {
                        $scope.openDiscussion(discussion, true);
                    } else {
                        ActivityIndicator.error("Discussion "+discussionIdFromStateParams+" not found");
                    }
                }
                $scope.scrollChanged(false);
            })
            .error(setErrorInScope.bind($scope));
    }

    function updateLastReadByUsers(evt, message) {
        if (!$scope.discussions) {
            return;
        }
        if (!message || !(message.details || {}).time || !message.user) {
            return;
        }
        const conv = $scope.discussions.find(conv => conv.id == message.discussionId);
        if (conv) {
            if (!conv.users[message.user]) {
                conv.users[message.user] = {
                    login: message.user,
                    displayName: message.details.userDisplayName
                };
            }
            conv.users[message.user].lastReadTime = message.details.time;
        }
    }

    function selectedItemUpdated() {
        const value = $scope.selectedItem();
        const hasSelectedItem = !!value;
        const hasSelectedItemChanged = hasSelectedItem && !angular.equals(currentItem, value);
        const hasSingleDiscussionChanged = $scope.discussionId && !angular.equals($scope.discussionId(), $scope.uiState.forceSelectedConvId);
        if (hasSelectedItem && (hasSelectedItemChanged || hasSingleDiscussionChanged)) {
            currentItem = value;
            $scope.uiState = {forceSelectedConvId: $scope.uiState.forceSelectedConvId || ($scope.uiState.selectedConv || {}).id};
            if (currentItem.projectKey && currentItem.type && currentItem.id) {
                refreshDiscussions();
            }
        }
    }

    function broadcastDiscussionCountChange() {
        if ($state.is("projects.project.flow")) {
            $rootScope.$broadcast('discussionCountChanged');
        }
    }

    /*** Init ***/
    if ($scope.watchObject && $scope.selectedItem) {
        // current item is defined through directive attribute
        let debounceFn = Debounce().withDelay(20, 200).withScope($scope).wrap(selectedItemUpdated);
        $scope.$watch('watchObject', debounceFn, true);
    } else {
        // current item is retrieved from TopNav
        currentItem = angular.copy(TopNav.getItem());
        currentItem.projectKey = $stateParams.projectKey;
        refreshDiscussions();
    }

    const replyListenerDestroyer = Notification.registerEvent('discussion-reply', refreshDiscussions);
    const deleteListenerDestroyer = Notification.registerEvent('discussion-delete', refreshDiscussions);
    const updateListenerDestroyer = Notification.registerEvent('discussion-update', refreshDiscussions);
    const closeListenerDestroyer = Notification.registerEvent('discussion-close', refreshDiscussions);
    const ackListenerDestroyer = Notification.registerEvent('discussion-ack', updateLastReadByUsers);

    $scope.$on('$destroy', function() {
        replyListenerDestroyer();
        deleteListenerDestroyer();
        updateListenerDestroyer();
        closeListenerDestroyer();
        ackListenerDestroyer();
    });

});


app.directive('discussionsWidget', function() {
    return {
        restrict: 'AE',
        templateUrl: '/templates/widgets/discussions-widget-content.html',
        scope: {
            selectedItem: '&',
            watchObject: '='
        }
    };
});


app.directive('discussionsWidgetSingle', function() {
    return {
        restrict: 'AE',
        templateUrl: '/templates/widgets/discussions-widget-single.html',
        scope: {
            selectedItem: '&',
            discussionId: '&',
            watchObject: '='
        }
    };
});


app.directive('discussionsButton', function($rootScope, $compile, $q, $templateCache, $http, $state, $stateParams, Assert, DataikuAPI, TopNav, Notification, Debounce) {
    return {
        restrict: 'AE',
        templateUrl: '/templates/widgets/discussions-widget-button.html',
        scope: {
            selectedItem: '&',
            watchObject: '='
        },
        replace: true,
        link: function($scope, element, attrs) {
            let currentItem;

            $scope.discussionCounts = null;

            $scope.uiState = {};
            $scope.uiState.loadRequested = false;
            $scope.uiState.displayed = false;
            $scope.uiState.maximized = false;

            $scope.titleForNumberOfDiscussions = function() {
                let title;
                const counts = $scope.discussionCounts;

                if (!counts) return; //Not ready
                if (counts.open) {
                    title = counts.open +
                        (counts.unread == counts.open && counts.unread > 0 ? ' unread' :'') +
                        ' discussion' +
                        (counts.open == 1 ? '' : 's');
                } else if (counts.total) {
                    title = 'No open discussion';
                } else {
                    title = 'No discussion';
                }
                let objectTypeName = $scope.uiState.currentObjectType.replace('_', ' ');
                if (objectTypeName == 'project') {
                    objectTypeName = "project's home page"; // let's not be confusing
                }
                title += ' on this ' + objectTypeName;

                if(counts.unread != counts.open && counts.unread > 0) {
                    title += ' (' + counts.unread + ' unread)';
                }
                return title;
            };

            function openDiscussionsWidget() {
                if (!$scope.uiState.loadRequested) {
                    loadWidget();
                }
                $scope.uiState.displayed = true;
                $scope.uiState.maximized = true;
            }

            $scope.closeDiscussionsWidget = function() {
                $scope.uiState.displayed = false;
            };

            $scope.toggleDiscussionsWidget = function() {
                if ($scope.uiState.displayed && $scope.uiState.maximized) {
                    $scope.closeDiscussionsWidget();
                } else {
                    openDiscussionsWidget();
                }
            };

            $scope.toggleMaximized = function() {
                $scope.uiState.maximized = !$scope.uiState.maximized;
            };

            function refreshCounts() {
                DataikuAPI.discussions.getCounts(currentItem.projectKey, currentItem.type, currentItem.id)
                    .success(function(data) {
                        $scope.discussionCounts = data;
                        if (!$scope.uiState.displayed && $scope.discussionCounts.unread > 0) {
                            if (!$scope.uiState.loadRequested) {
                                loadWidget();
                            }
                            $scope.uiState.displayed = true;
                            $scope.uiState.maximized = false;
                        }
                    })
                    .error(setErrorInScope.bind($scope));
            }

            function loadWidget() {
                Assert.trueish(!$scope.uiState.loadRequested, 'loadWidget called twice');
                $scope.uiState.loadRequested = true;
                const location = '/templates/widgets/discussions-widget-popover.html'
                $q.when($templateCache.get(location) || $http.get(location, {cache: true}))
                    .then(function(template) {
                        if (angular.isArray(template)) {
                            template = template[1];
                        } else if (angular.isObject(template)) {
                            template = template.data;
                        }
                        const widgetEl = $(template);
                        $compile(widgetEl)($scope);
                        $('.main-view').append(widgetEl);
                        $scope.$on('$destroy', function() {
                            widgetEl.remove();
                        });
                    });
            }

            function selectedItemUpdated() {
                const value = $scope.selectedItem();
                const hasSelectedItem = !!value;
                const hasSelectedItemChanged = hasSelectedItem && !angular.equals(currentItem, value);
                const hasSingleDiscussionChanged = $scope.discussionId && !angular.equals($scope.discussionId(), $scope.uiState.forceSelectedConvId);
                if (hasSelectedItem && (hasSelectedItemChanged || hasSingleDiscussionChanged)) {
                    currentItem = value;
                    $scope.uiState.currentObjectType = value.type.toLowerCase().replace('[^a-zA-Z]', ' ');
                    refreshCounts();
                }
            }

            if ($scope.watchObject && $scope.selectedItem) {
                // current item is defined through directive attribute
                let debounceFn = Debounce().withDelay(20, 200).withScope($scope).wrap(selectedItemUpdated);
                $scope.$watch('watchObject', debounceFn, true);
            } else {
                // current item is retrieved from TopNav
                currentItem = angular.copy(TopNav.getItem());
                currentItem.projectKey = $stateParams.projectKey;
                if (currentItem.type) {
                    $scope.uiState.currentObjectType = currentItem.type.toLowerCase().replace('[^a-zA-Z]', ' ');
                }
                refreshCounts();
            }

            const replyListenerDestroyer = Notification.registerEvent('discussion-reply', refreshCounts);
            const deleteListenerDestroyer = Notification.registerEvent('discussion-delete', refreshCounts);
            const closeListenerDestroyer = Notification.registerEvent('discussion-close', refreshCounts);
            const ackListenerDestroyer = Notification.registerEvent('discussion-ack', function(evtType, message) {
                if ($scope.discussionCounts && $scope.discussionCounts.unread && message.user == $rootScope.appConfig.login) {
                    refreshCounts()
                }
            });
            $scope.$on('$destroy', function() {
                replyListenerDestroyer();
                deleteListenerDestroyer();
                closeListenerDestroyer();
                ackListenerDestroyer();
            });

            if ($stateParams.discussionId) {
                openDiscussionsWidget();
            }
        }
    };
});


app.service('Discussions', function($rootScope, Notification, MessengerUtils, StateUtils, UserImageUrl) {
    function userAvatar(userLogin, size) {
        if (!userLogin)  return "";
        return '<img class="user-avatar" src="' + UserImageUrl(userLogin, size) + '" /> ';
    }

    function userLink(userLogin, innerHTML) {
        return '<a href="/profile/'+escape(userLogin)+'/" class="link-std">'+ innerHTML + '</a>';
    }

    function dssObjectLink(event, innerHTML) {
        const tor = {type: event.objectType, id: event.objectId, projectKey: event.projectKey};
        const link = StateUtils.href.taggableObject(tor, {moveToTargetProject: false, discussionId: event.discussionId});
        return '<a href="'+link+'" class="link-std">'+innerHTML+'</a>';
    }

    function discussionIsOpen(id) {
        const discussionScope = angular.element($('.discussions-widget-list-replies')).scope();
        return discussionScope && discussionScope.uiState && discussionScope.uiState.selectedConv.id == id;
    }

    const replyListenerDestroyer = Notification.registerEvent('discussion-reply',function(evt, message) {
        if (message.user == $rootScope.appConfig.login) {
            return; // Hopefully the user knows that they wrote
        }
        if (!message.newReply) {
            return; // A reply was edited, don't notify...
        }
        if (message.mentionedUsers && message.mentionedUsers.includes($rootScope.appConfig.login)) {
            return; // The current user is mentioned in this message, there will be a specific notification for that, don't duplicate
        }
        if (discussionIsOpen(message.discussionId)) {
            return;
        }

        MessengerUtils.post({
            message: userLink(message.user, sanitize(message.details.userDisplayName || message.user))
                + (message.creation ? " created a discussion on " : " added a reply on ")
                + dssObjectLink(message, sanitize(message.details.objectDisplayName))
                + ":"
                + '<span class="messenger-comment">'
                + sanitize(message.text.substr(0,400))
                + (message.text.length > 400 ? '[...]' : '')
                + '</span>'
                ,
            icon: userAvatar(message.user),
            hideAfter: 5,
            showCloseButton: true,
            id: message.user+'connected',
            type: 'no-severity'
        });
    });

    const mentionListenerDestroyer = Notification.registerEvent("discussion-mention", function(evt, message) {
        MessengerUtils.post({
            message: userLink(message.author, sanitize(message.details.authorDisplayName || message.author))
                + " mentioned you in a discussion on "
                + dssObjectLink(message, sanitize(message.details.objectDisplayName))
                + ":"
                + '<span class="messenger-comment">'
                + sanitize(message.message.substr(0,400))
                + (message.message.length > 400 ? '[...]' : '')
                + '</span>'
                ,
            icon: userAvatar(message.author),
            type: 'no-severity',
            showCloseButton: true
        });
    });

    const closeListenerDestroyer = Notification.registerEvent("discussion-close", function(evt, message) {
        if (message.user == $rootScope.appConfig.login) {
            return;
        }
        MessengerUtils.post({
            message: userLink(message.user, sanitize(message.details.userDisplayName || message.user))
                + " has " + (message.details.closed ? "resolved" : "reopened") + " a discussion on "
                + dssObjectLink(message, sanitize(message.details.objectDisplayName))
                ,
            icon: userAvatar(message.user),
            type: 'no-severity',
            showCloseButton: true
        });
    });

    $rootScope.$on('$destroy', function() {
        replyListenerDestroyer();
        mentionListenerDestroyer();
        closeListenerDestroyer();
    });
});


})();
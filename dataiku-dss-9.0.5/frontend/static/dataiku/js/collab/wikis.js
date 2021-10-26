(function() {
'use strict';

const app = angular.module('dataiku.collab.wikis', []);

app.constant('WIKI_TAXONOMY_KEY', 'dss.wiki.taxonomy');

app.service('WikiUtilsService', function () {
    const svc = this;

    svc.getParentId = function(id, node, taxonomy) {
        const children = node ? node.children : taxonomy;

        if (!children) {
            return null;
        }
        const nodeId = node ? node.id : '';
        for (const child of children) {
            if (child.id === id) {
                return nodeId;
            }
            const foundParent = svc.getParentId(id, child);
            if (foundParent) {
                return foundParent;
            }
        }
        return null;
    };

    svc.getArticleNodeById = function(articleId, node, taxonomy) {
        const children = node && node.children ? node.children : taxonomy;
        for (const child of children) {
            if (child.id === articleId) {
                return child;
            }
            const foundNode = svc.getArticleNodeById(articleId, child);
            if (foundNode) {
                return foundNode;
            }
        }
        return null;
    };

    svc.addArticlesToList = function(nodes, articlesIds) {
        nodes.forEach(function(node) {
            articlesIds.push(node.id);
            svc.addArticlesToList(node.children, articlesIds);
        });
    };

});

app.controller('WikiController', function($scope, $controller, $state, $q, TaggingService, $stateParams, $rootScope, $timeout, WT1, TopNav, Dialogs, CreateModalFromTemplate, DataikuAPI, _SummaryHelper, WikiUtilsService, ActiveProjectKey, TaggableObjectsService, LocalStorage, WIKI_TAXONOMY_KEY) {
    $controller('_WikiSearch', {$scope});

    TopNav.setLocation(TopNav.TOP_WIKI, 'wiki', TopNav.TABS_NONE, null);
    $scope.wikiScope = $scope; // Useful to set errors globally for example

    WT1.event("wiki-visit", {});

    $scope.newArticle = function(newArticleId, parentArticleId) {
        if (newArticleId) {
            $scope.newNotFoundArticle = {id: newArticleId};
        }
        CreateModalFromTemplate("/templates/wikis/new-article-modal.html", $scope, "NewArticleModalController", function(newScope) {
            if (angular.isDefined(parentArticleId)) {
                newScope.newArticle.parent = parentArticleId;
            }
        }).then(function(article) {
            WT1.event("article-create", {});
            $state.go('projects.project.wiki.article.edit', {articleId: article.id}, {reload: false});
            $scope.updateWiki().then(function() {
                // If it's the first article we don't need to scroll to it
                if (angular.isDefined($scope.wikiScope.treeViewHook)) {
                    // Waiting for the node corresponding to the new article to be propagated into the treeview directive
                    $timeout(() => $scope.wikiScope.treeViewHook.scrollToNodeFn(article.id));
                }
            });
        });
    };

    $scope.getParentId = function(id, node) {
        return WikiUtilsService.getParentId(id, node, $scope.wiki.taxonomy);
    };

    $scope.getArticleNodeById = function(articleId, node) {
        return  WikiUtilsService.getArticleNodeById(articleId, node, $scope.wiki.taxonomy);
    };

    function addArticlesToList(nodes) {
        return  WikiUtilsService.addArticlesToList(nodes, $scope.articlesIds);
    }

    function retrieveUnfoldedNodeIDs() {
        let savedStates = LocalStorage.get(WIKI_TAXONOMY_KEY);
        if (savedStates) {
            let unfoldedNodeIDs = savedStates[$stateParams.projectKey];
            if (unfoldedNodeIDs && unfoldedNodeIDs.length > 0) {
                $scope.wiki.unfoldedNodeIds = unfoldedNodeIDs;
            }   
        }
    }

    function retrieveNodeIdsHavingChildren(nodes) {
        nodes.forEach(function(node) {
            if (node.children.length > 0) {
                $scope.wiki.nodeIdsHavingChildren.push(node.id);
                retrieveNodeIdsHavingChildren(node.children);
            }
        });
    }
    
    function initTaxonomy() {
        $scope.wiki.unfoldedNodeIds = [];
        $scope.wiki.nodeIdsHavingChildren = [];
        retrieveUnfoldedNodeIDs();
        retrieveNodeIdsHavingChildren($scope.wiki.taxonomy);
        if (typeof($scope.initNodes) === "function") {
            $scope.initNodes($scope.wiki.taxonomy);
        }
    }

    $scope.getAllTagsForProject = function () {
        const deferred = $q.defer();
        deferred.resolve(TaggingService.getProjectTags());
        return getRewrappedPromise(deferred);
    }

    $scope.updateWiki = function() {
        return DataikuAPI.wikis.getWiki(ActiveProjectKey.get())
            .success(function(wikiSummary) {

                if (angular.isDefined($scope.wiki) && angular.isDefined($scope.wikiScope.saveFoldingState)) {
                    $scope.wikiScope.saveFoldingState();
                }

                $scope.wiki = wikiSummary.wiki;
                $scope.articleMapping = wikiSummary.articleMapping;
                $scope.wikiTimeline = wikiSummary.timeline;
                $scope.articlesIds = [];

                $scope.emptyWiki = !$scope.wiki.taxonomy || !$scope.wiki.taxonomy.length;
                if ($scope.emptyWiki) {
                    return;
                }

                initTaxonomy();
                addArticlesToList($scope.wiki.taxonomy)

                if ($state.current.name == 'projects.project.wiki') { // We are not on an article
                    const rootArticle = $scope.wiki.homeArticleId || $scope.wiki.taxonomy[0].id;
                    $state.go('projects.project.wiki.article.view', {articleId: rootArticle}, {reload: true, location: 'replace'});
                }
                if ($stateParams.articleId) {
                    $scope.articleNode = $scope.getArticleNodeById($stateParams.articleId);
                }
            })
            .error(setErrorInScope.bind($scope));
    };
    $timeout(() => $scope.updateWiki());

    $scope.startChangeArticleParent = function(articleId) {
        $scope.tempArticleID = articleId;
        CreateModalFromTemplate("/templates/wikis/change-article-parent-modal.html", $scope).then(function() {
            delete $scope.tempArticleID;
            $scope.updateWiki().then(_ => $timeout(_ => $scope.wikiScope.treeViewHook.scrollToNodeFn(articleId)));
        });
    };
    
    $scope.saveArticleLayout = function(layout) {
        if (['WIKI_ARTICLE', 'FOLDER'].indexOf(layout) == -1) {
            return;
        }
        WT1.event("article-save-layout", {layout: layout});
        let article = angular.extend({}, $scope.article, {layout: layout});
        return $scope.wikiScope.checkSaveArticle(article, $scope.uiState.editedPayload);
    };

    $scope.setHomeArticle = function(articleId) {
        WT1.event("wiki-set-home", {});
        DataikuAPI.wikis.setHomeArticle($stateParams.projectKey, articleId)
            .success(function() {
                $scope.updateWiki();
            })
            .error(setErrorInScope.bind($scope.wikiScope));
    };

    $scope.startCopyArticle = function(articleId) {
        $scope.copyArticle = {
            name: "Copy of " + $scope.articleMapping[articleId],
            parent: $scope.getParentId(articleId) || null,
            originalArticleId: articleId
        }
        function reallyStartCopy() {
            CreateModalFromTemplate("/templates/wikis/copy-article-modal.html", $scope, "CopyArticleModalController").then(function(article) {
                $state.go('projects.project.wiki.article.edit', {articleId: article.id}, {reload: false});
                $scope.updateWiki().then(function() {
                    // If it's the first article we don't need to scroll to it
                    if (angular.isDefined($scope.wikiScope.treeViewHook)) {
                        // Waiting for the node corresponding to the new article to be propagated into the treeview directive
                        $timeout(() => $scope.wikiScope.treeViewHook.scrollToNodeFn(article.id));
                    }
                });
            });
        }
        $scope.wikiScope.checkDirtiness(reallyStartCopy);
    };

    $scope.startRenameArticle = function(articleId) {
        $scope.tempArticleID = articleId;

        function reallyStartRenaming() {
            CreateModalFromTemplate("/templates/wikis/rename-article-modal.html", $scope).then(function(articleId) {
                delete $scope.tempArticleID;
                $scope.updateWiki();
                $state.go('projects.project.wiki.article.view', {articleId: articleId}, {reload: true});
            });
        }
        $scope.wikiScope.checkDirtiness(reallyStartRenaming);
    };

    $scope.deleteArticles = function(articles) {
        WT1.event("article-delete", {});
        return TaggableObjectsService.delete(articles.map(a => ({projectKey: a.projectKey, type: 'ARTICLE', id: a.id, displayName: $scope.articleMapping[a.id] || a.id})))
            .then(function(data) {
                WT1.event("article-delete", {number_of_articles: $scope.articlesIds && $scope.articlesIds.length});
                $scope.updateWiki();
                $state.go('projects.project.wiki', {projectKey: $stateParams.projectKey}, {reload: true});
            }, setErrorInScope2.bind($scope));
    };

    $scope.uiState = {};
    $scope.getObjectId = function() {
        return $scope.article && $scope.article.id;
    };
    $scope.objectType = 'ARTICLE';
    $scope.$watch('wiki.taxonomy', function(nv, ov) {
        if (nv && ov) {
            return DataikuAPI.wikis.editTaxonomy(ActiveProjectKey.get(), $scope.wikiScope.wiki)
                .error(setErrorInScope.bind($scope));
        }
    }, true);
    _SummaryHelper.addInterestsManagementBehaviour($scope);

    // Override star/watch to update the UI:
    const so = $scope.starObject;
    $scope.starObject = function(s) {
        so(s).then(function() {
            $scope.interest.starred = s;
        });
    };

    const wo = $scope.watchObject;
    $scope.watchObject = function(w) {
        wo(w).then(function() {
            $scope.interest.watching = w;
        });
    };
});


app.controller('ArticleController', function($controller, $scope, $location, $anchorScroll, $state, $stateParams, $filter, $timeout, WT1, SmartId, TopNav, DataikuAPI, TaggingService, CreateModalFromTemplate, TaggableObjectsService, Dialogs, ActiveProjectKey, DKUtils, StateUtils, FullScreenService, executeWithInstantDigest) {
    $scope.SmartId = SmartId;
    $scope.$state = $state;
    $scope.wikiScope.isLoaded = false;

    $scope.markdownCallback = function() {
        // Build the table of content from loaded DOM
        $scope.articleContents = [];
        const container = $('.wiki-article-content div[from-markdown], .wiki-article-preview-content div[from-markdown]');
        if (container.length > 0) {
            const headersIndexes = {};
            for (let i = 1; i <= 6; i++) {
                headersIndexes[i] = 0;
            }
            $(container[0])
                .find('.dku-header-anchor')
                .each(function(idx, headerTag) {
                    const aTag = $(headerTag).find('a[name]');
                    if (aTag.length > 0) {
                        const depth = Number($(headerTag).prop("tagName").substring(1));
                        headersIndexes[depth]++;
                        const indexes = [];
                        for (let i = 1; i <= depth; i++) {
                            indexes.push(headersIndexes[i]);
                        }
                        $scope.articleContents.push({anchor: aTag.attr('name'), label: headerTag.innerText, depth: depth - 1, indexes: indexes.join('.')});
                        for (let i = depth+1; i <= 6; i++) {
                            headersIndexes[i] = 0;
                        }
                    }
                }
            );
        }

        // Scroll to hash if existing
        $anchorScroll();
        $scope.wikiScope.isLoaded = true;
    };

    // Resetting the hash when leaving an article
    $scope.$on('$destroy', () => { $location.hash(''); });

    $scope.anchorLink = function(anchor) {
        return location.pathname + '#' + anchor;
    };

    $scope.startEditTags = function() {
        TaggingService.startApplyTagging([angular.extend({}, $scope.article, {type: 'ARTICLE', displayName: $scope.article.name})]).then(getSummary);
    };

    $scope.getAttachmentIcon = function(item) {
        if (item.attachmentType == 'DSS_OBJECT') {
            return $filter('subTypeToIcon')(item.subtype, item.taggableType) + ' ' + $filter('subTypeToColor')(item.subtype, item.taggableType);
        } else {
            return $filter('mimeTypeToIcon')(item.details.mimeType);
        }
    };

    $scope.wikiScope.editCustomFields = function() {
        if (!$scope.article) {
            return;
        }
        let oldCustomFields = angular.copy($scope.article.customFields);
        let modalScope = angular.extend($scope, {objectType: 'ARTICLE', objectName: $scope.article.id, objectCustomFields: $scope.article.customFields});
        CreateModalFromTemplate("/templates/taggable-objects/custom-fields-edit-modal.html", modalScope).then(function(customFields) {
            $scope.article.customFields = customFields;
            $scope.wikiScope.saveArticlePayload().then(null, function() {
                $scope.article.customFields = oldCustomFields;
            });
        });
    };

    $scope.$on("objectSummaryEdited", function() {
        $scope.wikiScope.checkSaveArticle($scope.article, $scope.articlePayload);
    });

    $scope.wikiScope.checkDirtiness = (cb) => {
        if (typeof cb != 'function') {
            throw Error("Callback is not a function");
        };
        if ($scope.isDirty()) {
            Dialogs.confirm($scope,
                    'Unsaved changes',
                    'There are unsaved changes that are about to be erased. Are you sure you want to continue?')
                .then(() => {
                    $scope.uiState.editedPayload = angular.copy($scope.articlePayload);
                    cb();
                });
        } else {
            cb();
        }
    };

    $scope.startExportArticle = function(articleId) {
        $scope.tempArticleID = articleId;

        function reallyStartExporting() {
            CreateModalFromTemplate("/templates/wikis/export-article-modal.html", $scope);
        }
        $scope.wikiScope.checkDirtiness(reallyStartExporting);
    };

    $scope.wikiScope.checkSaveArticle = function(article, payload, callback, commitMessage) {
        function saveAfterConflictCheck() {
            return DataikuAPI.wikis.saveArticle(article, payload, commitMessage)
                .success(function(data) {
                    setSummary(data);
                    if (typeof callback == 'function') {
                        callback(data);
                    }
                })
                .error(setErrorInScope.bind($scope.wikiScope));
        }
        return DataikuAPI.wikis.checkSaveConflict(article)
            .success(function(conflictResult) {
                if(!conflictResult.canBeSaved) {
                    Dialogs.openConflictDialog($scope, conflictResult)
                        .then(function(resolutionMethod) {
                            if (resolutionMethod == 'erase') {
                                return saveAfterConflictCheck();
                            } else if(resolutionMethod == 'ignore') {
                                DKUtils.reloadState();
                            }
                        });
                } else {
                    return saveAfterConflictCheck();
                }
            })
            .error(setErrorInScope.bind($scope.wikiScope));
    };

    $scope.wikiScope.saveArticlePayload = function(commitMessage, moveToView) {
        const savedPayload = $scope.wikiScope.uiState.editedPayload;
        let cb = function(data) {
            if (moveToView) {
                StateUtils.go.article(data.object.id);
            }
            try {
                window.marked(savedPayload, function(...args) {
                    if (args.length > 1 && args[0]) {
                        let usageReport = args[0];
                        usageReport._payloadLength = savedPayload.length;
                        usageReport._origin = 'article';
                        usageReport._origin_hash = data.object.id.dkuHashCode()
                        WT1.event("article-save", usageReport);
                    }
                });
            } catch (e) {
                Logger.error('Failed to compute markdown usage report', e);
            }
        };
        return $scope.wikiScope.checkSaveArticle($scope.article, savedPayload, cb, commitMessage);
    };

    function escapeLabel(label) {
        return label.replace(/\]/g, '\\]').replace(/\[/g, '\\[');
    }

    $scope.wikiScope.startAddAttachments = function() {
        $scope.wikiScope.checkDirtiness(() => { CreateModalFromTemplate("/templates/wikis/add-article-attachments-modal.html", $scope); });
    };

    $scope.wikiScope.deleteAttachment = function(index) {
        const reallyDeleteAttachment = () => {
            Dialogs.confirm($scope, 'Delete attachment','Are you sure you want to delete this attachment?').then(function() {
                $scope.article.attachments.splice(index, 1);
                WT1.event("article-remove-attachment", {number_of_attachments: $scope.article.attachments.length});

                return $scope.wikiScope.checkSaveArticle($scope.article, $scope.articlePayload);
            });
        };
        $scope.wikiScope.checkDirtiness(reallyDeleteAttachment);
    };

    $scope.wikiScope.insertImage = function(attachment) {
        WT1.event("article-insert-image", {});
        const cms = $('.wiki-article-edit-body-main .CodeMirror');
        if (!cms.length) {
            throw new Error('Cannot reach wiki article edition CodeMirror');
        }
        const cm = cms.get(0).CodeMirror;
        function fn(prevString) {
            const label = prevString || attachment.details.objectDisplayName;
            return `![${escapeLabel(label)}](${attachment.smartId})`;
        }
        cm.editorActions.replaceInEditor(fn, false, 'end');
    };

    $scope.wikiScope.insertFileLink = function(attachment) {
        WT1.event("article-insert-link", {});
        const cms = $('.wiki-article-edit-body-main .CodeMirror');
        if (!cms.length) {
            throw new Error('Cannot reach wiki article edition CodeMirror');
        }
        const cm = cms.get(0).CodeMirror;
        function fn(prevString) {
            const label = prevString || attachment.details.objectDisplayName;
            const filename = prevString || attachment.details.objectDisplayName.replace(/[^\w\-\_\.]+/g, '_');
            return `[${escapeLabel(label)}]{${filename}}(${attachment.smartId})`;
        }
        cm.editorActions.replaceInEditor(fn, false, 'end');
    };

    $scope.wikiScope.getUploadHref = function(attachment) {
        try {
            const ref = SmartId.resolve(attachment.smartId);
            let sanitizedFilename = attachment.details.objectDisplayName.replace(/(((\.)+)?\/)/g, "_"); // remove all slashes and dots located before slashes
            return `/dip/api/projects/wikis/get-uploaded-file/${sanitizedFilename}?projectKey=${ref.projectKey}&uploadId=${ref.id}`;
        } catch (e) {
            console.error('Failed to resolve uploadId'); // NOSONAR: OK to use console.
            return '';
        }
    };

    const articleDisplayModes =  {
        view: 'view',
        edit: 'edit'
    }

    $scope.wikiScope.getArticleDisplayMode = function () {
        return $state.current.name == 'projects.project.wiki.article.edit'? articleDisplayModes.edit : articleDisplayModes.view;
    }

    $scope.wikiScope.getArticleProjectKey = function() {
        return ActiveProjectKey.get();
    }

    $scope.getAttachmentViewTarget = function () {
        return '_blank';
    }


    $scope.wikiScope.isDirty = function() {
        return $scope.wikiScope.uiState.editedPayload != $scope.articlePayload;
    };
    const allowedTransitions = [
        'projects.project.wiki.article.view',
        'projects.project.wiki.article.edit',
        'projects.project.wiki.article.history'
    ];
    function allowedTransitionsFn(data) {
        return (data.toState && data.toParams && data.fromState && data.fromParams &&
            allowedTransitions.indexOf(data.fromState.name) >= 0 && allowedTransitions.indexOf(data.toState.name) >= 0 &&
            data.fromParams.projectKey == data.toParams.projectKey && data.fromParams.articleId == data.toParams.articleId);
    }
    checkChangesBeforeLeaving($scope, $scope.isDirty, null, allowedTransitionsFn);

    function setSummary(data) {
        $scope.wikiScope.article = data.object; // We set it in the global wiki scope to be able to use the main toolbar
        $scope.wikiScope.articlePayload = data.payload;
        $scope.wikiScope.timeline = data.timeline;
        $scope.wikiScope.interest = data.interest;
        $scope.wikiScope.articleEditionTags = {
            lastModifiedBy: data.lastModifiedBy,
            lastModifiedOn: data.lastModifiedOn,
            createdBy: data.createdBy,
            createdOn: data.createdOn
        };
        $scope.wikiScope.uiState.editedPayload = data.payload;

        if (!angular.equals(data, {})) {
            if ($stateParams.articleName !== data.object.name) {
                // Let's make our current URL accurate (and keep the current hash if present)
                $state.go('.', {articleId: data.object.id, articleName: data.object.name, '#': $location.$$hash}, {refresh: false, location: 'replace'});
            }

            TopNav.setPageTitle(data.object.name + " - Wiki");
        }

        TopNav.setItem(TopNav.ITEM_ARTICLE, $stateParams.articleId, $scope.article);

        if(!$scope.article) {
            return;
        }
        $scope.wikiScope.articleNode = $scope.getArticleNodeById($scope.article.id);
        $scope.wikiScope.articleNotFound = null;

        if ($scope.wikiScope.isFullScreen()) {
            $scope.wikiScope.article.layout = "WIKI_ARTICLE";
        }

        $timeout(() => { // wait for the page to load if the article is empty.
            $scope.wikiScope.isLoaded = $scope.wikiScope.isLoaded || !$scope.uiState.editedPayload;
        })
    }

    function getSummary() {
        resetErrorInScope($scope.wikiScope);
        setSummary({}); // empty current state

        const articleId = !$stateParams.articleId && !$stateParams.articleName ? $scope.wiki.homeArticleId : $stateParams.articleId ;
        if (!articleId) {
            $state.go("projects.project.wiki", {projectKey : ActiveProjectKey.get()}, {reload: true});
            return;
        }
        return DataikuAPI.wikis.getArticleSummary(ActiveProjectKey.get(), articleId)
            .success(setSummary)
            .error(function(data, status, headers) {
                if (status != 404) {
                    setErrorInScope.apply($scope.wikiScope, arguments);
                } else {
                    $scope.wikiScope.articleNotFound = $stateParams.articleName ? $stateParams.articleName : $stateParams.articleId;
                }
            });
    }
    getSummary();

    $scope.$watch(() => $state.current.name, function(nv) {
        $scope.wikiScope.isLoaded = false;
        if (nv == 'projects.project.wiki.article.edit') {
            $timeout(function() {
                $('.CodeMirror').each(function(idx, el) {
                    el.CodeMirror.refresh();
                    el.CodeMirror.focus();
                });
            });
        }
    });

    $scope.wikiScope.wikiExportToolBox = {
        checkLoading: function() {
            return !$scope.wikiScope.isLoaded;
        },
        goToArticle: function(articleId) {
            $scope.wikiScope.isLoaded = false;
            executeWithInstantDigest(_ => $location.url(StateUtils.href.article(articleId, $stateParams.projectKey)), $scope.wikiScope);
        }
    }

    $scope.wikiScope.isFullScreen = FullScreenService.isFullScreen;
});


app.controller('WikiTaxonomyController', function($scope, $stateParams, $state, $timeout, LocalStorage, WIKI_TAXONOMY_KEY, StateUtils, ActiveProjectKey, openDkuPopin) {
    $scope.uiState = {
        activeTaxonomyTab: 'articles'
    };

    $scope.nodeName = function(node) {
        return $scope.articleMapping[node.id];
    };

    $scope.scrollToNode = function(nodeId) {
        if (angular.isDefined(nodeId)) {
            // Clearing the search bar will load the taxonomy
            $scope.emptySearchBar();
            // The scrolling occurs on the taxonomy so we have to wait for it to load in the DOM before scrolling
            $timeout(() => $scope.wikiScope.treeViewHook.scrollToNodeFn(nodeId));
        }
    };

    $scope.emptySearchBar = function() {
        $scope.query.queryString = '';
    };

    $scope.openContextMenuSearch = function (item, $event) {
        if (!$scope.isProjectAnalystRW()) {
            return;
        }

        item.$rightClicked = true;
        let node = item._source;

        let template = `<ul class="dropdown-menu" ng-click="popupDismiss()">`;
        template += $scope.wikiScope.getRightClickMenuTemplate(node);
        template += `</ul>`;

        let isElsewhere = function (elt, e) {
            let result = $(e.target).parents('.dropdown-menu').length == 0;
            if (result) {
                delete item.$rightClicked;
            }
            return result;
        };

        $scope.popupDismiss = openDkuPopin($scope, $event, {template: template, isElsewhere: isElsewhere, popinPosition:'CLICK'});
    };

    $scope.onClick = function(node) {
        StateUtils.go.article(node.id, undefined, {articleName: $scope.nodeName(node)});
    };

    /*
        * Persisting folding state
        */

    // The following 2 event listeners detect any action that will let the user leave the wiki
    $scope.$on('$stateChangeStart', function (event, toState, toParams, fromState, fromParams) {
        if (!(toState.name.startsWith('projects.project.wiki') && toParams.projectKey == $stateParams.projectKey)) {
                $scope.wikiScope.saveFoldingState(); // When leaving the wiki through a state change 
        }
    });
    
    window.addEventListener("beforeunload", function() {
        $scope.wikiScope.saveFoldingState(); // When leaving the wiki by closing the tab/window, or manually changing the URL
    });

    $scope.wikiScope.saveFoldingState = function() {
        let newFoldingState = buildNewFoldingState();
        LocalStorage.set(WIKI_TAXONOMY_KEY, newFoldingState);
    }

    // Retrieve the last folding state and build a new one according to the current taxonomy
    function buildNewFoldingState() {
        let projectKey = ActiveProjectKey.get();
        let foldingState = LocalStorage.get(WIKI_TAXONOMY_KEY);

        if (!foldingState) {
            foldingState = {};
        }

        if (foldingState[projectKey]) {
            delete foldingState[projectKey];
        }

        let unfoldedNodeIDs = getUnfoldedNodeIDs();
        if (unfoldedNodeIDs.length > 0) {
            foldingState[projectKey] = unfoldedNodeIDs;
        }
        
        return foldingState;
    }

    function getUnfoldedNodeIDs(nodes = $scope.wiki.taxonomy) {
        let unfoldedNodeIDs = [];

        for (let i=0; i<nodes.length; i++) {
            if (nodes[i].children.length > 0 && !nodes[i].$reduced) {
                unfoldedNodeIDs.push(nodes[i].id);
            }

            let nodeIDs = getUnfoldedNodeIDs(nodes[i].children);
            if (nodeIDs && nodeIDs.length > 0) {
                unfoldedNodeIDs = unfoldedNodeIDs.concat(nodeIDs);
            }
        }

        return unfoldedNodeIDs;
    }

    /*
     * Exposed stuff to treeView directive
     */

    $scope.rightIconClass = function(node) {
        return false;
    };

    $scope.rightIconTitle = function(node) {
        return false;
    };

    $scope.iconClass = function(node) {
        return node.id == $scope.wiki.homeArticleId ? 'icon-home' : '';
    };

    $scope.iconTitle = function(node) {
        return node.id == $scope.wiki.homeArticleId ? 'This is the home page for the wiki' : '';
    };

    $scope.nodeClass = function(node) {
        return node.id == $stateParams.articleId ? 'tree-view-active-node' : '';
    };

    $scope.setUnfoldedNodeIdsFn = function(nodeIds) {
        $scope.wiki.unfoldedNodeIds = nodeIds;
    };

    $scope.getUnfoldedNodeIdsFn = function() {
        return $scope.wiki.unfoldedNodeIds;
    };

    $scope.getNodeIdsHavingChildrenFn = function() {
        return $scope.wiki.nodeIdsHavingChildren;
    };

    const EMPTY_FUNC = function() {}; //NOSONAR: Used to check when $scope.wikiScope.treeViewHook is overrided by the treeview directive

    $scope.wikiScope.treeViewHook = {
        scrollToNodeFn: EMPTY_FUNC,
        expandAllFn: EMPTY_FUNC,
        collapseAllFn: EMPTY_FUNC,
        getTaxonomyMassExpandCollapseStateFn: EMPTY_FUNC,
        setReduceFn: EMPTY_FUNC,
    }

    $scope.contextMenuFns = {
        startChangeArticleParent: $scope.wikiScope.startChangeArticleParent,
        setHomeArticle: $scope.wikiScope.setHomeArticle,
        startCopyArticle: $scope.wikiScope.startCopyArticle,
        startRenameArticle: $scope.wikiScope.startRenameArticle,
        deleteArticles: $scope.wikiScope.deleteArticles,
        startCreateChildArticle: parentNodeId => $scope.wikiScope.newArticle(null, parentNodeId)
    }

    $scope.wikiScope.getRightClickMenuTemplate = function(node) {
        let template =
        `<li>
            <a href="#" ng-click="contextMenuFns.startChangeArticleParent('`+node.id+`')">
                <i class="icon-level-up icon-fixed-width icon-flip-horizontal" /> Change parent article
            </a>
        </li>
        <li>
            <a href="#" ng-click="contextMenuFns.setHomeArticle('`+node.id+`');">
                <i class="icon-home icon-fixed-width" /> Set home article
            </a>
        </li>
        <li>
            <a href="#" ng-click="contextMenuFns.startCreateChildArticle('`+node.id+`');">
                <i class="icon-fixed-width icon-dku-plus" /> Create article from here
            </a>
        </li>
        <li>
            <a href="#" ng-click="activateSortable();">
                <i class="icon-resize-vertical icon-fixed-width" /> Move
            </a>
        </li>
        <li>
            <a href="#" ng-click="contextMenuFns.startCopyArticle('`+node.id+`')">
                <i class="icon-copy icon-fixed-width" /> Copy
            </a>
        </li>
        <li>
            <a href="#" ng-click="contextMenuFns.startRenameArticle('`+node.id+`')">
                <i class="icon-pencil icon-fixed-width" /> Rename
            </a>
        </li>
        <li>
            <a href="#" ng-click="contextMenuFns.deleteArticles([{projectKey:'`+$stateParams.projectKey+`', id:'`+node.id+`'}])">
                <span class="text-error">
                    <i class="icon-trash icon-fixed-width" /> Delete
                </span>
            </a>
        </li>`;
        return template;
    };

    /*
     * Initialization: Waiting for the treeview directive to override $scope.wikiScope.treeViewHook.setReduceFn
     */

    $scope.wikiScope.initNodes = function(nodes) {
        nodes.forEach(function(node) {
            let reduce = $scope.getUnfoldedNodeIdsFn().indexOf(node.id) == -1;
            $scope.wikiScope.treeViewHook.setReduceFn(node, reduce);

            if (node.children.length > 0) {
                $scope.wikiScope.initNodes(node.children);
            }
        });
    };

    let unwatch = $scope.$watch('wikiScope.treeViewHook.setReduceFn', function(nv, ov) {
        if (nv && typeof($scope.wikiScope.treeViewHook.setReduceFn)==="function" && $scope.wikiScope.treeViewHook.setReduceFn != EMPTY_FUNC) {
            $scope.wikiScope.initNodes($scope.wiki.taxonomy);
            $scope.wikiScope.treeViewHook.scrollToNodeFn($stateParams.articleId, 0);
            unwatch();
        }
    });
});


app.controller('NewArticleModalController', function($scope, $stateParams, WT1, DataikuAPI, ActiveProjectKey) {
    const parentArticleId = $stateParams.articleId ? $scope.getParentId($stateParams.articleId) : '';

    if (!$scope.newArticle) {
        $scope.newArticle = {};
    }
    $scope.newArticle.parent = parentArticleId;
    if ($scope.newNotFoundArticle && $scope.newNotFoundArticle.id) {
        $scope.newArticle.id = $scope.newNotFoundArticle.id;
        delete $scope.newNotFoundArticle.id;
    } else {
        delete $scope.newArticle.id;
    }

    $scope.alreadyExistingArticleNames = [".", ".."].concat(Object.values($scope.articleMapping));

    DataikuAPI.wikis.listTemplates().success(function(data) {
            $scope.availableTemplates = data.templates;
            $scope.newArticle.template = $scope.availableTemplates[0];
        }).error(setErrorInScope.bind($scope));

    $scope.create = function() {
        WT1.event("article-create", {number_of_articles: $scope.articlesIds && $scope.articlesIds.length, template: $scope.newArticle.template});

        return DataikuAPI.wikis.createArticle(ActiveProjectKey.get(), $scope.newArticle.id, $scope.newArticle.parent, $scope.newArticle.template)
            .success(function(article) {
                $scope.resolveModal(article);
            })
            .error(setErrorInScope.bind($scope));
    };
});


app.controller('AddArticleAttachmentsModalController', function($scope, $stateParams, $timeout, WT1, DataikuAPI, TAGGABLE_TYPES, SmartId, ActiveProjectKey, executeWithInstantDigest) {
    $scope.taggableTypes = TAGGABLE_TYPES;

    $scope.newAttachment = {
        projectKey: ActiveProjectKey.get()
    };

    $scope.modalNav = {
        tab: 'DSS_OBJECT'
    };

    $scope.uiState = {
        files: [],
        fileProperties: []
    };

    $scope.addAttachment = function() {
        const modifiedArticle = angular.copy($scope.article);
        if ($scope.newAttachment.taggableType == 'PROJECT') {
            $scope.newAttachment.id = $scope.newAttachment.projectKey;
        }
        const targetAttachment = {};
        targetAttachment.smartId = SmartId.fromTor($scope.newAttachment, $stateParams.projectKey);
        targetAttachment.taggableType = $scope.newAttachment.taggableType;
        targetAttachment.attachmentType = 'DSS_OBJECT';
        modifiedArticle.attachments = $scope.article.attachments.concat([targetAttachment]);
        WT1.event("article-add-attachment", {number_of_attachments: modifiedArticle.attachments.length, taggableType: targetAttachment.taggableType});

        return $scope.wikiScope.checkSaveArticle(modifiedArticle, $scope.articlePayload, () => $scope.resolveModal());
    };

    $scope.$watch('newAttachment.projectKey', function(nv) {
        if (!nv) return;
        DataikuAPI.taggableObjects.listAccessibleObjects(nv).then(function(resp) {
            const objList = resp.data;
            $scope.taggableTypesWithNoItems = TAGGABLE_TYPES.filter(t => t != 'PROJECT' && !objList.find(obj => obj.type == t));
        });
    });

    $scope.drop = function(files) {
        WT1.event("article-drop-files", {number_of_files: files.length});
        for (let i = 0; i < files.length; i++) {
            $scope.uiState.files.push(files[i]);
            $scope.uiState.fileProperties.push({
                path: files[i].name,
                length: files[i].size,
                progress: 0,
                uploaded: false
            });
        }
    };

    $scope.deleteFile = function(idx, e) {
        e.preventDefault();
        e.stopPropagation();
        $scope.uiState.files.splice(idx, 1);
        $scope.uiState.fileProperties.splice(idx, 1);
    };

    $scope.uploadFilesAfterDigest = function() {
        $timeout(function() {
            uploadFiles()
        });
    };

    function uploadFiles() {
        $scope.wikiScope.fileUploadProperties = $scope.uiState.fileProperties;

        for (let idx = 0; idx < $scope.uiState.files.length; ++idx) {
            uploadOneFile(idx);
        }
    }

    function uploadOneFile(idx) {
        const fileToUpload = $scope.uiState.files[idx];

        DataikuAPI.wikis.upload(ActiveProjectKey.get(), $stateParams.articleId, fileToUpload, function (e) {
            if (e.lengthComputable) {
                executeWithInstantDigest(() => {
                    $scope.wikiScope.fileUploadProperties[idx].progress = Math.round(e.loaded * 100 / e.total);
                }, $scope.wikiScope);
            }
        }).then(function (data) {
            $scope.wikiScope.article = angular.fromJson(data);
        }, setErrorInScope2.bind($scope.wikiScope)).finally(function () {
            $scope.wikiScope.fileUploadProperties[idx].uploaded = true;
        });

        $scope.dismiss();
    }
});


app.controller('RenameArticleModalController', function($scope, $stateParams, WT1, DataikuAPI) {
    DataikuAPI.wikis.getArticleSummary($stateParams.projectKey, $scope.tempArticleID).then(function (result) {
        $scope.modifiedArticle = result.data.object;
    }, setErrorInScope.bind($scope));

    $scope.alreadyExistingArticleNames = [".", ".."].concat(Object.values($scope.articleMapping));

    $scope.ok = function() {
        WT1.event("article-rename");
        return $scope.wikiScope.checkSaveArticle($scope.modifiedArticle, null, () => $scope.resolveModal($scope.article.id));
    };
});

app.controller('ExportArticleModalController', function($scope, $stateParams, DataikuAPI, FutureProgressModal, ActivityIndicator, WT1) {
    $scope.modalTitle = "Export: " + $stateParams.articleName;
    $scope.params = {
        exportType: 'ARTICLE_AND_CHILDREN',
        exportFormat: { paperSize: 'A4' },
        exportAttachments: false
    }

    $scope.doExportArticle = function() {
        const articleId = $scope.params.exportType === 'WHOLE_WIKI' ? null : $stateParams.articleId;
        const exportChildren = $scope.params.exportType === 'ARTICLE_AND_CHILDREN';
        DataikuAPI.wikis.exportArticle($stateParams.projectKey, articleId, $scope.params.exportFormat, exportChildren, $scope.params.exportAttachments)
            .error(setErrorInScope.bind($scope))
            .success(function (resp) {
                WT1.event("wiki-export", {export: $scope.params.exportType, exportAttachments: $scope.params.exportAttachments});
                FutureProgressModal.show($scope, resp, "Wiki export").then(function (result) {
                    if (result) { // undefined in case of abort
                        downloadURL(DataikuAPI.wikis.getExportURL(result.projectKey, result.exportId));
                        ActivityIndicator.success("Wiki export downloaded!", 5000);
                    } else {
                        ActivityIndicator.error("Wiki export failed", 5000);
                    }
                    $scope.resolveModal();
                });
            });
    }
});

app.directive('wikiExportForm', function(GRAPHIC_EXPORT_OPTIONS) {
    return {
        templateUrl: '/templates/wikis/wiki-export-form.html',
        scope: {
            params: '=',
            origin: '@',
        },
        link: function($scope) {
            $scope.paperSizeMapPage = GRAPHIC_EXPORT_OPTIONS.paperSizeMapPage;
            $scope.params.exportFormat.paperSize = 'A4';
        }
    }
});

app.controller('CopyArticleModalController', function($scope, $stateParams, WT1, DataikuAPI, ActiveProjectKey) {
    $scope.alreadyExistingArticleNames = [".", ".."].concat(Object.values($scope.articleMapping));

    const copyArticleName = $scope.copyArticle.name;
    var i = 0;
    while ($scope.alreadyExistingArticleNames.includes($scope.copyArticle.name)) {
        $scope.copyArticle.name = `${copyArticleName} ${++i}`;
    }

    $scope.ok = function() {
        return DataikuAPI.wikis.copyArticle($stateParams.projectKey, $scope.copyArticle.name, $scope.copyArticle.parent,  $scope.copyArticle.originalArticleId, !!$scope.withAttachments)
            .success(function(article) {
                $scope.resolveModal(article);
            }).error(setErrorInScope.bind($scope));
    };
});


app.controller('ChangeArticleParentModalController', function($scope, $stateParams, WT1, DataikuAPI, ActiveProjectKey) {
    function getFilteredArticleList(siblings, id) {
        let list = [];
        for (let i = 0; i < siblings.length; i++) {
            if (siblings[i].id != id) {
                list.push(siblings[i].id);
                list = list.concat(getFilteredArticleList(siblings[i].children || [], id));
            }
        }
        return list;
    }
    const parentArticleId = $scope.tempArticleID ? $scope.getParentId($scope.tempArticleID) : '';
    $scope.newParent = {id: parentArticleId, oldId: parentArticleId};
    $scope.filteredArticlesIds = $scope.tempArticleID ? getFilteredArticleList($scope.wiki.taxonomy || [], $scope.tempArticleID) : $scope.articlesIds;
    $scope.ok = function(parentId) {
        WT1.event("article-change-parent");
        return DataikuAPI.wikis.changeArticleParent(ActiveProjectKey.get(), $scope.tempArticleID, parentId)
            .success(function() {
                $scope.resolveModal();
            })
            .error(setErrorInScope.bind($scope));
    }
});


app.controller('_WikiSearch', function($scope, $stateParams, $controller, $q, DataikuAPI, ActiveProjectKey) {
    const facets = {
        "scope": ["dss"],
        "projectKey.raw": [ActiveProjectKey.get()],
        "_type":["article"]
    };
    function searchEndpoint(queryString) {
        if(!queryString) {
            $scope.results = null;
            return;
        }
        return DataikuAPI.catalog.search.call(this, queryString, facets)
            .success(function(results) {
                $scope.results = results;
            }); // No need for error handling here, done in _CatalogControllerBase
    }
    $controller("_CatalogControllerBase", {$scope, searchEndpoint});

    $scope.linkToCatalog = function() {
        return `/catalog/search/scope=dss&_type=Article&projectKey.raw=${ActiveProjectKey.get()}&q=${$scope.query.queryString}&_type=article`;
    };
});


app.directive('articleRightColumnSummary', function($controller, $stateParams, $state,
                                                   DataikuAPI, Dialogs, CreateModalFromTemplate, Logger, RecipeComputablesService) {
    return {
        templateUrl: '/templates/wikis/article-right-column-summary.html',

        link: function(scope, element, attrs) {

            $controller('_TaggableObjectsMassActions', {$scope: scope});
            $controller('_TaggableObjectsCapabilities', {$scope: scope});

            scope.refreshData = function() {
                DataikuAPI.wikis.getArticleSummary(scope.selection.selectedObject.projectKey, scope.selection.selectedObject.id).success(function(data){
                    scope.articleData = data;
                    scope.article = data.article;
                }).error(setErrorInScope.bind(scope));
            };

            scope.$watch("selection.selectedObject", function(nv, ov) {
                if (!nv) return;
                scope.articleData = {article: nv, timeline: {}}; // display temporary (incomplete) data
                if(scope.selection.confirmedItem != scope.selection.selectedObject) {
                    scope.article = null;
                }
                scope.articleHref =  $state.href('projects.project.wiki.article.view',
                    {projectKey: scope.selection.selectedObject.projectKey, articleId: scope.selection.selectedObject.id});
            });

            scope.$watch("selection.confirmedItem", function(nv, ov) {
                if (!nv) {
                    return;
                }
                scope.refreshData();
            });

        }
    }
});


})();

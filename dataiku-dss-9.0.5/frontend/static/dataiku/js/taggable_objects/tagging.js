(function() {
'use strict';

const app = angular.module('dataiku.taggableobjects');


app.service('TaggingService', function($rootScope, $stateParams, $timeout, $q, DataikuAPI, CreateModalFromTemplate, TaggableObjectsUtils) {
    const svc = this;
    let projectTags = {};
    let projectTagsList = undefined;
    let projectTagsUsageMap = undefined;
    let globalTagsCategories = undefined;
    let globalTags = {};


    var setList = function (tagsObj) {
        projectTagsList = [];

        Object.keys(tagsObj).forEach(function(tagTitle, index) {
            projectTagsList.push({'title': tagTitle,  color: tagsObj[tagTitle].color});
        });
        return svc.sortTagList(projectTagsList);
    }

    this.getTagWithUsage = function (tag, items) {
        tag.usage=0;
        items.forEach(i => {if (i.tags && i.tags.indexOf(tag.title)>=0) tag.usage++;});
        tag.initialState = tag.newState = (tag.usage==0 ? 0 : (tag.usage==items.length ? 2 : 1));
        return tag;
    }

    this.sortTagList = function(list) {
        return list.sort((a,b) => a.title.localeCompare(b.title));
    }

    this.getGlobalTags = function(objectType) {
        if (!objectType || objectType === 'TAGGABLE_OBJECT') {
            return globalTags;
        }
        const globalTagsForType = {};
        Object.keys(globalTags).forEach((key) => {
            if (svc.shouldGlobalTagApply(globalTags[key].appliesTo, objectType)) {
                globalTagsForType[key] = globalTags[key];
            }
        });
        return globalTagsForType;
    }

    this.fetchGlobalTags = function(forceFetch) {
        if (globalTagsCategories && !forceFetch) {
            return;
        }
        globalTagsCategories = globalTagsCategories || {};
        DataikuAPI.globalTags.getGlobalTagsInfo().success(function(data) {
            Object.keys(data.globalTags).forEach(function(k) {
                let category = data.globalTags[k].globalTagsCategory;
                Object.assign(data.globalTags[k], {appliesTo : data.globalTagsCategories[category]});
            });
            globalTagsCategories = data.globalTagsCategories;
            globalTags = data.globalTags;
        }).error(setErrorInScope.bind($rootScope));
    }

    this.setProjectTags = function(tags) {
        projectTags = fillTagsMap(tags);
        projectTagsList = undefined;
    };

    this.getProjectTags = function() {
        return projectTags;
    };

    this.getProjectTagsList = function(objectType) {
        if (projectTagsList==undefined) setList(Object.assign(this.getProjectTags(), globalTags));
        return projectTagsList;
    }

    this.getProjectTagsUsageMap = function () {
        const deferred = $q.defer();
        DataikuAPI.taggableObjects.listTagsUsage($stateParams.projectKey, {}, "nospinner").success(function(data) {
            projectTagsUsageMap = data;
            deferred.resolve(projectTagsUsageMap);
        });
        return deferred.promise;
    }

    this.startApplyTagging = function(selectedItems) {
        return CreateModalFromTemplate('/templates/apply-tags-modal.html', $rootScope, 'ApplyTaggingController', function(modalScope) {
            modalScope.selectedItems = selectedItems;
            modalScope.itemsType = TaggableObjectsUtils.getCommonType(selectedItems, it => it.type);
            modalScope.tagsSorted = svc.getTagsSorted([{...projectTags, ...globalTags}], t => svc.getTagWithUsage(t, selectedItems), modalScope.itemsType);
        });
    };

    this.applyTagging = function(request) {
        return DataikuAPI.taggableObjects.applyTagging($stateParams.projectKey, request)
            .success(function() {
                $rootScope.$broadcast('taggableObjectTagsChanged');
            }).error(setErrorInScope.bind($rootScope));
    };

    this.getTagColor = function(tag) {
        return globalTags[tag] ? globalTags[tag].color : projectTags[tag] ? projectTags[tag].color : svc.getDefaultColor(tag);
    };

    this.getGlobalTagCategory = function(tag, objectType) {
        if (globalTags[tag]) {
            let category = globalTags[tag].globalTagsCategory;
            if (objectType == "TAGGABLE_OBJECT" || svc.shouldGlobalTagApply(globalTagsCategories[category],objectType)) {
                return category;
            }
            return false;
        }
        return  null;
    };

    var pushTagsToList = function (tags, list) {
        Object.keys(tags).forEach(function(tagTitle, index) {
            const t = tags[tagTitle];
            const titleLower = tagTitle.toLowerCase();
            list.push({tag: t, title: tagTitle, titleLower: titleLower});
        });
    }

    this.shouldGlobalTagApply = function(appliesTo, objectType) {
        return objectType === "TAGGABLE_OBJECT" || appliesTo.includes(objectType);
    };

    this.getTagsSorted = function(tagLists, fTagMapper, itemsType) {
        const list = [];

        tagLists.forEach(l => pushTagsToList(l, list));

        const titleLookup = {};
        const filteredList = list.filter(it => (!it.tag.appliesTo || !itemsType || (itemsType && svc.shouldGlobalTagApply(it.tag.appliesTo, itemsType))));
        //sort global tags last and if both are global tags, sort by localeCompare
        let sortedList = filteredList.sort((a,b) => (!!a.tag.globalTagsCategory - !!b.tag.globalTagsCategory) || a.title.localeCompare(b.title));
        sortedList.forEach((item, index) => {
            titleLookup[item.titleLower] = index;
        });
        if (fTagMapper) sortedList = sortedList.map(fTagMapper)
        return {list: sortedList, titleLookup: titleLookup}
    }

    this.applyManageTagsChangesToTagList = function (tagsList, newAllTags, keepOrphans) { //rename any tags in-edit
        const newTags = [];
        tagsList.forEach( tag => {
            if (newAllTags[tag]) {
                if (newAllTags[tag].updatedTagName) {
                    newTags.push(newAllTags[tag].updatedTagName);
                }
                else {
                    newTags.push(tag);
                }
            }
            else if (keepOrphans) {
                newTags.push(tag);
            }
        })
        return newTags;
    }

    const COLORS = [
        "#1ac2ab",
        "#0f6d82",
        "#FFD83D",
        "#de1ea5",
        "#90a8b7",
        "#28aadd",
        "#00a55a",
        "#94be8e",
        "#d66b9b",
        "#77bec2",
        "#123883",
        "#a088bd"
    ];

    this.getDefaultColor = function(tag) {
        const hash = tag.split('').reduce(function(a,b) {a=((a<<5)-a)+b.charCodeAt(0);return a&a;},0); //NOSONAR a&a basically means floor, who cares if it is unclear here?
        return COLORS[Math.abs(hash) % 12];
    }

    function fillTagsMap(tags) {
        for (let tag in tags) {
            if (globalTags[tag]) { //update projectTags with globalTags informations
                tags[tag] = globalTags[tag];
            }
            if (!tags[tag].color) {
                tags[tag].color = svc.getDefaultColor(tag);
            }
            const col = d3.rgb(tags[tag].color);
            tags[tag].fadedColor = 'rgba('+col.r+','+col.g+','+col.b+', 0.35)';
        }
        return tags;
    }

    this.fillTagsMapFromArray = function(a) {
        const tagMap = {}
        a.map((tag) => tagMap[tag] = {});
        return fillTagsMap(tagMap);
    }

    function  argsForUpdateBcast(refreshFlowFilters, checkFilterQuery, updateGraphTags) {
        const args = {}
        args.refreshFlowFilters = refreshFlowFilters;
        args.checkFilterQuery = checkFilterQuery;
        args.updateGraphTags = updateGraphTags;
        return args;
    }

    this.bcastTagUpdate = function (minReloadReqd, updateGraphTags) {
        $rootScope.$broadcast('projectTagsUpdated', argsForUpdateBcast(!minReloadReqd, minReloadReqd, updateGraphTags));
    }

    this.update = function(minReloadReqd) {
        return DataikuAPI.taggableObjects.listTags($stateParams.projectKey).success(function(response) {
            svc.setProjectTags(response.tags);
            svc.bcastTagUpdate(minReloadReqd, false);
        });
    };

    this.saveToBackend = function(newTags) {
        return DataikuAPI.taggableObjects.setTags($stateParams.projectKey, newTags).success(function(response) {
            svc.setProjectTags(response.tags);
            svc.bcastTagUpdate(true, false);
        });
    };
});


app.filter('tagToColor', function(TaggingService) {
    return function(tag) {
        return TaggingService.getTagColor(tag);
    }
});

const TRISTATES = {
    OFF: 0,
    PART: 1,
    ON: 2,
    ROTATE: 3
}

app.controller('ApplyTaggingController', function($scope, WT1, TaggingService, CreateModalFromTemplate, $timeout) {
    /*  expect initialisation via TaggingService.startApplyTagging:
     *  scope.selectedItems, scope.itemsType, scope.tagsSorted
    */

    var pushOperation = function(operations, allTags, mode) {
        const reqdState = (mode=='ADD' ? TRISTATES.ON : TRISTATES.OFF);
        const tags = allTags.filter(t => t.newState!=t.initialState && t.newState==reqdState).map(t => t.title);
        if (tags.length > 0) {
            WT1.event("tagging-apply", {tags: tags.length, elements: $scope.selectedItems.length, add: (mode=='ADD')});
            operations.push({tags: tags, mode: mode});
        }
    }

    $scope.uiState = {newTag: ""};

    $scope.save = function() {
        const request = {elements: $scope.selectedItems, operations: [] };
        ['ADD', 'REMOVE'].forEach(mode => pushOperation(request.operations, $scope.tagsSorted.list, mode));

        if (request.operations.length > 0) {
            TaggingService.applyTagging(request)
            .success($scope.resolveModal)
            .error(setErrorInScope.bind($scope));
        }
        else {
            $scope.resolveModal();
        }

    }

    $scope.isChanged = function(tag) {
        return (tag.initialState != tag.newState);
    }

    $scope.createTagOnEnter = function(event) {
        if (event.which === 13) { // create tag when enter key is pressed
            $scope.onAddTag();
        }
    }

    $scope.usageText = function (tag) {
        switch (tag.newState) {
            case TRISTATES.OFF: return "-";
            case TRISTATES.PART: return tag.usage + "/" + $scope.selectedItems.length;
            case TRISTATES.ON: return $scope.selectedItems.length + "/" + $scope.selectedItems.length;
            default:
                break;
        }
    }

    $scope.hasTags = function() {
        return $scope.tagsSorted.filteredList.length > 0;
    }

    const addNewTagToList = function (title, newState, color) {
        $scope.tagsSorted.list.push({
            title: title,
            tag: {color: color ? color : TaggingService.getDefaultColor(title)},
            initialState: TRISTATES.OFF,
            newState: newState});

        $scope.tagsSorted.titleLookup[title.toLowerCase()] = "new";
    }

    const isNewlyAdded = function (title) {
        return $scope.tagsSorted.titleLookup[title.toLowerCase()] == "new"
    }

    $scope.onAddTag = function(){
        if ($scope.canCreateTag()) {
            addNewTagToList($scope.uiState.newTag, TRISTATES.ON);
            TaggingService.sortTagList($scope.tagsSorted.list);
            $scope.uiState.newTag = "";
        }
    };

    function filterTagListByInput(input = $scope.uiState.newTag) {
        if (!input) return $scope.tagsSorted.list;
        return $scope.tagsSorted.list.filter(tag => tag.title.toLowerCase().startsWith(input.toLowerCase()));
    };

    $scope.$watch('uiState.newTag', (nv) => {
        TaggingService.sortTagList($scope.tagsSorted.list);
        $scope.tagsSorted.filteredList = filterTagListByInput(nv);
    });

    $scope.canCreateTag = function() {
        const titleLower = $scope.uiState.newTag.toLowerCase();
        return titleLower && !$scope.tagsSorted.titleLookup.hasOwnProperty(titleLower);
    };

    $scope.rotateCheckbox = function(item) {
        item.newState = TRISTATES.ROTATE;
    }
});

app.directive('checkboxTristate', function () {
    return {
        template: `<input type="checkbox" name="{{id}}" id="{{id}}" ng-click="rotate()" aria-label="{{alabel}}" > `,
        scope: {
            triState: "=ngModel",  // 0=off 1=indeterminate 2=checked
            initialState: "=",
            id: "=",
            alabel: "="
        },
        link: function (scope, $element) {
            const chkbx = $element.children()[0];

            scope.onSet = function (newState) {
                scope.triState = newState;
                switch (newState) {
                    case TRISTATES.PART:  {
                        chkbx.checked = false;
                        chkbx.indeterminate = true;
                        break;
                    }
                    default: {
                        chkbx.checked = !!newState;
                        chkbx.indeterminate = false;
                        break;
                    }

                }
            }

            var incrementValue = function (v) {
                let newState = (v+1) % 3;
                if (newState==TRISTATES.PART && scope.initialState!=TRISTATES.PART) newState = TRISTATES.ON; //you can only return to indeterminate state
                return newState;
            }
            scope.rotate = function (event) {
                const newState = incrementValue(scope.triState);
                scope.onSet(newState);
            }

            scope.$watch("triState", function(nv, ov) {
                if (nv==TRISTATES.ROTATE) {
                    nv = incrementValue(ov);
                }
                scope.onSet(nv);
            });

            scope.onSet(scope.triState);
        }
    }
});

app.directive('addTagInput', function() {
    return {
        template: `<form class="common-styles-only tag-form noflex horizontal-flex" >
                        <input class="flex" type="text"
                        ng-model="newTag"
                        ng-class="{'has-error': !validator()}"
                        placeholder="Create new tag"
                        ng-keydown="onAddKeydown($event)"
                        aria-label="Create new tag" />

                    <button type="button"
                        class="btn btn--primary tags-settings-btn noflex"
                        ng-disabled="uiState.newTag.length == 0 || !validator()"
                        ng-click="addTag($event)">Add</button>
                </form>`,
        scope:   {
            newTag: '=ngModel',
            validator: '&',
            onAddTag: '&'
        },
        link: function (scope, $element){

            function eatEvent(e) {
                e.stopPropagation();
                e.preventDefault();
            }
            scope.onAddKeydown = function (e) {
                if (e.keyCode == 13) { // enter
                    scope.onAddTag();
                    eatEvent(e);
                }
            };

            scope.addTag = function(e) {
                if (scope.validator()) scope.onAddTag();
                eatEvent(e);
            }
        }
    }
});

app.directive('tagsList', function(Assert, CreateModalFromTemplate, TaggingService) {
    return {
        template: `<div class="tagsList">
            <ul class="tags vertical-flex">
                <li ng-repeat="tag in tags">
                    <span ng-if="isTagSelected(tag)" class="tag selected" ng-click="addTag(tag)" style="color:white; background-color:#{{tag.color.substring(1)}}" >
                        <span class="bullet" style="background-color:white;"> </span>
                        <span ui-global-tag="tag.title" object-type="objectType"/>
                    </span>
                    <span ng-if="!isTagSelected(tag)" class="tag" ng-click="addTag(tag)">
                        <span class="bullet" style="background-color:{{tag.color}};"> </span>
                        <span ui-global-tag="tag.title" object-type="objectType"/>
                    </span>
                </li>
                <li ng-if="noTagAvailable()">
                    <span class="tag disabled">No tag available</span>
                </li>
            </ul>
            <button class="btn btn--contained btn--tag-list" ng-click="manageTags()" ng-if="$parent.canWriteProject()">Manage tags</button>
        </div>`,
        scope: {
            selected: '=tagsListSelected',
            objectType: '='
        },
        link: function(scope, element) {
            scope.tags = TaggingService.getProjectTagsList(scope.objectType);
            Assert.trueish(scope.tags, 'no tags list');

            scope.noTagAvailable = function() {
                return scope.tags.length == 0;
            };

            scope.$on('projectTagsUpdated', function (e, args) {
                scope.tags = TaggingService.getProjectTagsList(objectType);
            });

            scope.isTagSelected = function(tag) {
                return scope.selected.indexOf(tag.title) > -1;
            }

            scope.manageTags = function() {
                CreateModalFromTemplate("/templates/widgets/edit-tags-modal.html", scope, null, function(modalScope) {
                    modalScope.tagsDirty = angular.copy(TaggingService.getProjectTags());

                    modalScope.save = function() {
                        scope.selected = TaggingService.applyManageTagsChangesToTagList(scope.selected, modalScope.tagsDirty);
                        TaggingService.saveToBackend(modalScope.tagsDirty)
                            .success(modalScope.resolveModal)
                            .error(setErrorInScope.bind(scope));
                    };
                    modalScope.cancel = function() {modalScope.dismiss();};
                });
            };

            scope.addTag = function(tag) {
                scope.$emit('tagSelectedInList', tag.title);
            };
        }
    };
});


app.directive('tagsListEditor', function($timeout, TaggingService){
    return {
        scope: {
            tags: '=tagsListEditor'
        },
        replace: true,

        template: `<div class="tags-settings vertical-flex h100" style="position:relative" >
        <div class="tag-edit-filter" ng-class="{'tag-edit-filter--focus': filterFocused}">
            <i class="icon-dku-search"></i>
            <input ng-model="uiState.newTag" name="tagEditorInput" type="search" ng-keydown="createTagOnEnter($event)" auto-focus="true" tabindex="0"
                ng-focus="filterFocused = true" ng-blur="filterFocused = false" autocomplete="off"
                placeholder="Filter tags or create a new tag" class="tag-edit-filter__input" aria-label="Selected tags"/>
        </div>
        <div ng-if="hasTag()" class="tag-help-text">
            <span class="tag-help-text__name">Tag name</span>
            <span ng-if="totalObjects > 0" class="tag-help-text__usage">Tag usage</span>
        </div>
        <div class="tags">
            <editable-list ng-if="hasTag()" ng-model="tagsSorted.list" class="tags" disable-create-on-enter="true" skip-to-next-focusable="true"
                transcope="{ uiState: uiState, canRenameTag: canRenameTag, updateTag: updateTag, onRemoveTag: onRemoveTag, onRestoreTag: onRestoreTag}"
                disable-remove="true" disable-add="true" full-width-list="true" has-divider="false">

                <div class="tag-row tag-row--editable-list horizontal-flex"
                    scroll-to-me="{{uiState.scrollToTagIdx==$index}}">

                    <div class="tag-row-item flex horizontal-flex">
                        <span class="tag-color noflex" style="background-color:{{it.tag.color}};" colorpicker colorpicker-with-input="true" ng-model="it.tag.color" aria-role="button" aria-label="Tag color">
                            <i class="icon-tint"></i>
                        </span>
                        <span ng-if="!it.tag.globalTagsCategory" class="tag-edit flex common-styles-only horizontal-flex">
                            <editable-list-input type="text" class="tag-input flex" ng-init="it.updatedTagName = it.tag.updatedTagName || it.title" ng-model="it.updatedTagName" on-key-up-callback="updateTag(it)" aria-label="Tag name" required="true" unique="true"/>
                        </span>
                        <span ng-if="it.tag.globalTagsCategory" class="tag-title flex">
                            <span ui-global-tag="it.tag.updatedTagName || it.title" object-type="'TAGGABLE_OBJECT'"></span>
                        </span>
                        <span ng-show="$parent.$parent.totalObjects > 0" class="tag-usage noflex">{{$parent.$parent.tagsUsage[it.title] || '-'}}</span>
                    </div>
                    <button ng-if="!it.tag.globalTagsCategory" class="noflex btn btn--text btn--danger btn--icon editable-list__delete m0" ng-click="onRemoveTag($event, it.title)"><i class="icon-trash"></i></button>
                    <i ng-if="it.tag.globalTagsCategory" class="noflex icon-info-sign" aria-role="button" aria-label="Restore tag: {{it.title}}"></i>
                </div>
            </editable-list>
            <div ng-if="canCreateTag()" class="tags">
                <div ng-if="canCreateTag()" class="tag-row horizontal-flex tags-settings__create" ng-click="onAddNewTag(e)" ng-keyup="$event.keyCode == 13 && onAddNewTag(e)" tabindex="0">
                    <i class="icon-plus flex-no-grow"></i>
                    <span class="flex">Create &laquo;{{uiState.newTag}}&raquo;</span>
                    <code class="dku-tiny-text-sb text-weak tags-settings__create-shortcut">enter</code>
                    <span class="return flex-no-grow tags-settings-btn mright4">&crarr;</span>
                </div>
            </div>
        </div>
        <div ng-if="!hasTag() && !canCreateTag()" class="noflex no-tag-yet"><p>No tags available</p></div>

    </div>`,

        link: function(scope, element, attrs){
            scope.uiState = {
                originalTagName: "",
                updatedTagName: "",
                editTagIdx : undefined,
                newTag: "",
                scrollToTagIdx : undefined
            };

            scope.totalObjects = 0;

            var ui = scope.uiState;

            var eatEvent = function(e) {
                if (e) {
                    e.stopPropagation();
                    e.preventDefault();
                }
            };

            scope.updateTag = function(item) {
                if (item.title === item.updatedTagName && !item.isEdited) {
                    return;
                }
                ui.originalTagName = item.title;
                ui.updatedTagName = item.updatedTagName || "";
                const tag = scope.tags[ui.originalTagName];
                tag.updatedTagName = ui.updatedTagName;
                tag.isEdited = true;
            }

            scope.createTagOnEnter = function(event) {
                if (event.which === 13) { // create tag when enter key is pressed
                    scope.onAddNewTag(event);
                }
            };

            scope.$watch('uiState.newTag', updateSortedTags);

            function filterTagsByInput(input) {
                const allTags = Object.assign({}, scope.tags, scope.globalTags);
                if (!input) {
                    return allTags;
                }
                const filteredTags = {};
                if (allTags) {
                    Object.keys(allTags).forEach((tagTitle) => {
                        const lowerTitle = tagTitle.toLowerCase();
                        if (lowerTitle.startsWith(input)) {
                            filteredTags[tagTitle] = allTags[tagTitle];
                        }
                    });
                }
                return filteredTags;
            }

            function updateSortedTags() {
                const input = ui.newTag.toLowerCase();
                const filteredTags = filterTagsByInput(input);
                scope.tagsSorted = TaggingService.getTagsSorted([filteredTags]);
            }

            var calcTagUsageForCurrentProject = function() {
                scope.tagsUsage = {};
                TaggingService.getProjectTagsUsageMap().then(usageMap => {
                    const tagsUsage = {};
                    scope.totalObjects = 0;
                    Object.keys(usageMap).forEach((objName) => {
                        scope.totalObjects++;
                        const tags = usageMap[objName];
                        tags.forEach(tagName => {
                            if (!tagsUsage[tagName]) tagsUsage[tagName]=0;
                            tagsUsage[tagName]++;
                        });
                    });
                    Object.keys(scope.tags).forEach(function(t) {
                       if (isNaN(tagsUsage[t])) tagsUsage[t] = 0;
                    });
                    scope.tagsUsage = angular.copy(tagsUsage);
                });
            };

            scope.$watch("tags", function(nv, ov) {
                if (!angular.equals(nv, ov)) {
                    getGlobalTags();
                    updateSortedTags();
                    calcTagUsageForCurrentProject();
                }
            });

            function getGlobalTags() {
                scope.globalTags = TaggingService.getGlobalTags();
                scope.$parent.hasGlobalTags = Object.keys(scope.globalTags).length > 0;
            };
            getGlobalTags();

            scope.onAddNewTag = function(e) {
                if (scope.canCreateTag()) {
                    scope.tags[ui.newTag] = {color: TaggingService.getDefaultColor(ui.newTag), usage:0, isNew: true};
                    updateSortedTags();
                    ui.scrollToTagIdx = scope.tagsSorted.titleLookup[ui.newTag.toLowerCase()];
                    ui.newTag = "";
                }
                updateSortedTags();
                eatEvent(e);
            };

            scope.canCreateTag = function() {
                const titleLower = ui.newTag.toLowerCase();
                return titleLower && !scope.tagsSorted.titleLookup.hasOwnProperty(titleLower);
            };

            scope.onRemoveTag = function(e, tag) {
                ui.updatedTagName = "";
                delete scope.tags[tag];
                updateSortedTags();
                eatEvent(e);
            };

            scope.canRenameTag = function() {
                const toLower = ui.updatedTagName.toLowerCase();
                if (ui.originalTagName.toLowerCase() == toLower) return true;
                return toLower && !scope.tagsSorted.titleLookup.hasOwnProperty(toLower);
            };

            scope.hasTag = function() {
                return !$.isEmptyObject(scope.tags) || !$.isEmptyObject(scope.globalTags);
            };

            updateSortedTags();
            calcTagUsageForCurrentProject();
            element.find('.tag-edit-filter__input').focus();
        }
    };
});

})();
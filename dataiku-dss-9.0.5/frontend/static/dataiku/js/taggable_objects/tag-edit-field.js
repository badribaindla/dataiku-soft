(function(){
    'use strict';

    const app = angular.module('dataiku.widgets.tageditfield', ['dataiku.services']);

    app.service('TagEditService', function(TaggingService) {
        const svc = this;
        let allTags = {};
        let filteredTags = {};
        let globalTagsCategory;
        let tags;

        this.setTags = function(tagsMap) {
            tags = tagsMap;
        };

        this.setActiveCategory = function(category) {
            globalTagsCategory = category;
            return globalTagsCategory;
        };

        this.unSelectedDropDownIdx = function () { // ensure the implicit select of the exact matching tags
            return filteredTags.isExactMatch &&
                    filteredTags.items.length && filteredTags.items[0].isMatch? 0 : undefined;
            }

        function adjustDropDownIndex(ui) {
            if (!isNaN(ui.dropDownIndex)) {
                if (filteredTags.length === 0) {
                    ui.dropDownIndex = undefined;
                }
                else if (ui.dropDownIndex > filteredTags.length - 1) {
                    ui.dropDownIndex = Math.max(filteredTags.length - 1, 0);
                }
            }

            if (isNaN(ui.dropDownIndex)) {
               ui.dropDownIndex = svc.unSelectedDropDownIdx(filteredTags);
            }
            return ui;
        }

        function flagSelectedItems() {
            if (!tags) return;

            Object.keys(allTags).forEach((tagTitle, index) => { allTags[tagTitle].selected = false; });

            tags.forEach((tagTitle) => {
                const tagDetails = allTags[tagTitle];
                if (tagDetails) {
                     tagDetails.selected = true;
                }
            });
            return allTags;
        }

        this.updateDropListOnTagChange = function(uiState, objectType) {
            allTags = flagSelectedItems(allTags);
            filteredTags = svc.filterTagListByInput(allTags, uiState.newTag, objectType);
            uiState = adjustDropDownIndex(filteredTags, uiState);
            return { allTags : allTags,
                    filteredTags : filteredTags,
                    uiState: uiState };
        };

        function isInputMatchingSelectedTag(input) {
            const inputLower = input.toLowerCase();
            return !tags || !tags.every(tagTitle => tagTitle.toLowerCase() != inputLower);
        }

        this.filterTagListByInput = function(allTagsMap, newTag, objectType) {
            allTags = allTagsMap;
            const list = [];
            const selectedList = [];
            const input = newTag.toLowerCase();
            const globalTagsCategories = [];
            const inputWithGlobalTagCat = globalTagsCategory ? `${globalTagsCategory.toLowerCase()}:${input}` : input;
            let isExactMatch = false;
            if (allTags) {
                Object.keys(allTags).forEach((tagTitle, index) => {
                    const tag = allTags[tagTitle];
                    if (!tag.lowerTitle) tag.lowerTitle = tagTitle.toLowerCase();

                    const isMatch = (input === tag.lowerTitle);
                    isExactMatch |= isMatch;
                    const shouldGlobalTagBeListed = !globalTagsCategory || (globalTagsCategory == tag.globalTagsCategory);

                    if (tag.selected && shouldGlobalTagBeListed
                            && (!input || tag.lowerTitle.startsWith(input) || tag.lowerTitle.startsWith(inputWithGlobalTagCat))) {
                        selectedList.push({ 'title': tagTitle,  color: tag.color, globalTagsCategory: tag.globalTagsCategory, match: isMatch });
                    }

                    if (!tag.selected && shouldGlobalTagBeListed
                            && (!input || tag.lowerTitle.startsWith(input) || tag.lowerTitle.startsWith(inputWithGlobalTagCat))) {
                        list.push({ 'title': tagTitle,  color: tag.color, globalTagsCategory: tag.globalTagsCategory, match: isMatch });
                    }
                        //only display add button for categories that have unselected global tags
                    if (!tag.selected && tag.globalTagsCategory && !globalTagsCategories.includes(tag.globalTagsCategory)
                            && TaggingService.shouldGlobalTagApply(tag.appliesTo, objectType)) {
                        globalTagsCategories.push(tag.globalTagsCategory);
                    }
                });
            }

            const isSelectedTag = isInputMatchingSelectedTag(input);
            const canCreateItem = (!!input && !isExactMatch && !isSelectedTag && !globalTagsCategory);

            filteredTags = { items: list.sort((a,b) => a.title.localeCompare(b.title)),
                            selectedItems: selectedList.sort((a,b) => a.title.localeCompare(b.title)),
                            createItem: canCreateItem ? newTag : undefined,
                            length: canCreateItem ? list.length + 1: list.length,
                            isExactMatch: isExactMatch,
                            isSelectedTag: isSelectedTag,
                            globalTagsCategories: globalTagsCategories};

            return filteredTags;
        }

        this.initUiState = function() {
            return {
                newTag: '', // text in the input field via ng-model
            };
        }
    });

    app.directive('tagField', function($timeout, $rootScope, CreateModalFromTemplate, TaggingService, TagEditService){
        return {
            templateUrl: "/templates/taggable-objects/tag-edit-field.html",
            restrict:'E',
            scope: {
                getAllTags: '&?',
                tags: '=ngModel',
                objectType: '=?',
                savedTags: '=?',
                isEditing: '=?',
                onStartEdit: '&?',
                onCancelEdit: '&?',
                onSaveEdit: '&?',
                editable: '=?',
                saveBtnText: '@?',
                manageLink: '='

            },
            link: function(scope, element, attrs){

                scope.allTags = {};

                if (typeof scope.editable == 'undefined') {
                    scope.editable = true;
                    scope.isEditing = false;
                }

                if (typeof scope.saveBtnText == 'undefined') {
                    scope.saveBtnText = "Save";
                }

                if (typeof scope.savedTags == 'undefined') {
                    scope.savedTags = angular.copy(scope.tags);
                }
                if (typeof scope.onStartEdit == 'undefined') { //if onStartEdit callback is missing, assume we are working in self-contained mode without callbacks
                    scope.onStartEdit = function() { 
                        setTagIdxToLastTag();
                        scope.isEditing = true;                      
                    }
                    scope.onCancelEdit  = function() {    
                        scope.tags = angular.copy(scope.savedTags);
                        scope.isEditing = false;   
                    } 
                    scope.onSaveEdit  = function() { 
                        if (scope.isEditing) {
                            scope.savedTags = angular.copy(scope.tags);  
                            scope.isEditing = false;
                        }
                    }  
                }

                if ($rootScope.activeProjectTagColor) {
                    scope.tagColor = $rootScope.activeProjectTagColor;
                } else {
                    scope.tagColor = function() {
                        return "#999";
                    }
                }

                scope.provideDropDown = (scope.getAllTags!=undefined);
                scope.allowManageTags = (scope.manageLink==undefined || scope.manageLink);

                scope.uiState = TagEditService.initUiState();

                function setTagIdxToLastTag() {
                    scope.uiState.tagIndex = scope.tags ? scope.tags.length - 1 : undefined;
                }

                function reInitTagIndex() {
                    if (scope.uiState.newTag) {
                        scope.uiState.tagIndex = undefined; //stop over-enthusiastic delete-key from deleting selected tags
                    }
                    else {
                        if (isNaN(scope.uiState.tagIndex)) {
                            $timeout(setTagIdxToLastTag,1200);
                        }
                    }
                }

                function updateDropListOnTagChange() {
                    if (!scope.provideDropDown) return;
                    const data = TagEditService.updateDropListOnTagChange(scope.uiState, scope.objectType);
                    scope.allTags = data.allTags;
                    scope.filteredTags = data.filteredTags;
                    scope.uiState = Object.assign(scope.uiState, data.uiState);
                    reInitTagIndex();
                };

                var getInput = () => element.find('.tag-editor-input');
                var setInputFocus = () => getInput().focus();

                function eatEvent(e) {
                    e.stopPropagation();
                    e.preventDefault();
                }

                function applyManageTagsChanges(existingList, newAllTags) { //rename any tags in-edit
                    const newTags = [];
                    existingList.forEach( tag => {
                        if (newAllTags[tag]) {
                            if (newAllTags[tag].updatedTagName) {
                                newTags.push(newAllTags[tag].updatedTagName);
                            }
                            else {
                                newTags.push(tag);
                            }
                        }
                        else if (!scope.allTags[tag]) {
                            newTags.push(tag); // a tag just typed into edit field, hence not in the newAllTags list
                        }

                    });

                    return newTags;
                 }

                function handleManageTagsComplete(newAllTags) {
                    if (newAllTags) {
                        scope.tags = applyManageTagsChanges(scope.tags, newAllTags);
                        scope.savedTags = applyManageTagsChanges(scope.savedTags, newAllTags);
                    }
                    setTagIdxToLastTag();
                    $timeout(setInputFocus, 100);
                }

                scope.cancelEdit = function(e) {
                    eatEvent(e);
                    scope.onCancelEdit();
                }

                scope.saveEdit = function(e) {
                    eatEvent(e);
                    scope.onSaveEdit();
                }

                scope.deleteTag = function(isBackspace, idx){
                    let index = idx;
                    if (index === null || index === undefined) index = scope.uiState.tagIndex;

                    if (!isNaN(index)) {
                        scope.tags.splice(index, 1); // remove tag at tagIndex
                        scope.uiState.tagIndex = Math.max(index - (isBackspace ? 1 : 0), 0);
                        setInputFocus();
                    }
                    updateDropListOnTagChange();
                };

                scope.isCreateTagSelected = function (idx) {
                    return (scope.filteredTags.createItem && idx == scope.filteredTags.length-1);
                }

                scope.scrollToInput = function (){
                    $timeout(() => {
                        const $div = getInput().parent();
                        if ($div.length>0)$div[0].scroll({top:0, left:10000, behavior: 'smooth'});
                    }, 10);
                }

                scope.dropListLeft = function(){
                    if (scope.elTags==undefined || !scope.elTags.width()) {
                        scope.elTags = $(element).find('.tags');
                        scope.elInput = $(element).find('.tag-editor-input');
                        scope.elDropList = $(element).find('.tag-pick-options');
                        scope.elOuter = $(element).find('.tag-edit-field');
                    }

                    let left = Math.max(scope.elTags.width() - scope.elInput.width(), 0);
                    left = Math.min(left, scope.elOuter.width() - scope.elDropList.width() - scope.elTags.position().left);
                    return left;
                }

                scope.addTag = function(idx){
                    let added = false;

                    if (!isNaN(idx)) {
                        if (scope.isCreateTagSelected(idx)) {
                            scope.tags.push(scope.filteredTags.createItem); // create new tag
                        }
                        else { //select tag in droplist
                            scope.tags.push(scope.filteredTags.items[idx].title);
                        }
                        added = true;
                        updateDropListOnTagChange();
                        scope.uiState.newTag = "";
                        setTagIdxToLastTag();

                        scope.scrollToInput();
                    }

                    return added;
                };

                scope.$watch('uiState.newTag', function(nv, ov) {
                    scope.filteredTags = TagEditService.filterTagListByInput(scope.allTags,  scope.uiState.newTag, scope.objectType);
                    reInitTagIndex();
                    scope.uiState.dropDownIndex =  TagEditService.unSelectedDropDownIdx();
                    if (nv!="") scope.uiState.tagIndex = undefined;
                });

                scope.$watch('tags', function(nv, ov) {
                    if (!nv) return;
                    if (!ov) setTagIdxToLastTag();
                    TagEditService.setTags(scope.tags);
                    updateDropListOnTagChange();
                });

                scope.$watch('allTags', function(nv, ov) {
                    scope.filteredTags = TagEditService.filterTagListByInput(scope.allTags,  scope.uiState.newTag, scope.objectType);
                    reInitTagIndex();
                    if (scope.tags) updateDropListOnTagChange(); //we need to do this when using Manage Tags but not on initialisation
                });

                scope.$on("tagFieldAddTag", function(event, callback) {
                    //this gets called in a circuitous fashion: onSave -> dip/validateEditTags -> $broadcast back here, with callback that needs to be called to
                    // end the 'editing' mode of the UI.
                    //nothing really happens in this now, as far as I can see.  AddTag is about individual tags, not saveds, while we just need to update the scope.tags array. think.... scope.addTag();
                    if (callback) callback();
                });

                scope.onSelectTag = function (e, idx) {
                    scope.uiState.tagIndex = idx;
                }

                scope.globalTags = TaggingService.getGlobalTags(scope.objectType);
                Object.assign(scope.allTags, scope.globalTags);

                scope.onStartTagEdit = function (e, category) {
                    TagEditService.initUiState();
                    scope.globalTagsCategory = TagEditService.setActiveCategory(category);
                    if (scope.getAllTags){
                        scope.provideDropDown = false;
                        scope.getAllTags().then((d) => {
                            scope.provideDropDown = true;
                            scope.allTags = Object.assign(d, scope.globalTags);
                        });
                    }
                    scope.onStartEdit();
                }

                scope.onDropdownClick = function (e, idx) {
                    eatEvent(e);

                    if (isNaN(idx)) return;
                    scope.addTag(idx);
                    setInputFocus();
                    scope.uiState.dropDownIndex = TagEditService.unSelectedDropDownIdx();
                }

                scope.onDropdownKeydown = function (e, idx) {
                    if (e.keyCode==13) { // enter key
                        scope.addTag(idx);
                        setInputFocus();
                        eatEvent(e);
                    }
                }

                scope.manageTags = function() {
                    CreateModalFromTemplate("/templates/widgets/edit-tags-modal.html", scope, null, function(modalScope) {
                        modalScope.tagsDirty = angular.copy(scope.allTags);

                        modalScope.save = function() {
                            handleManageTagsComplete(modalScope.tagsDirty);
                            TaggingService.saveToBackend(modalScope.tagsDirty)
                                .success(() => {
                                    if (scope.getAllTags) {
                                        scope.getAllTags().then(d => scope.allTags = d);
                                    }
                                    modalScope.resolveModal();
                                })

                                .error(setErrorInScope.bind(scope));
                        };

                        modalScope.cancel = function () {
                            handleManageTagsComplete();
                            modalScope.dismiss();
                        }
                    });
                };

                function onDownArrow(ui) {
                    if (isNaN(ui.dropDownIndex)) {
                        ui.dropDownIndex = 0;
                    }
                    else {
                        ui.dropDownIndex = Math.min(ui.dropDownIndex + 1, scope.filteredTags.length - 1);
                    }
                    return true;
                }

                function onUpArrow(ui) {
                    scope.uiState.dropDownIndex =  isNaN(ui.dropDownIndex) || ui.dropDownIndex <= 0 ? TagEditService.unSelectedDropDownIdx() : ui.dropDownIndex - 1;
                    return true;
                }

                function onLeftArrow(ui) {
                    let eventDone = true;
                    if(!isNaN(ui.tagIndex)) {
                        ui.tagIndex = Math.max(ui.tagIndex - 1, 0);

                    } else if(ui.newTag.length === 0){
                        ui.tagIndex = scope.tags.length - 1;
                    }
                    else {
                        eventDone = false;
                    }
                    return eventDone;
                }

                function onRightArrow(ui) {
                    let eventDone = false;
                    if(!isNaN(ui.tagIndex)){
                        ui.tagIndex = ui.tagIndex + 1;
                        if(ui.tagIndex >= scope.tags.length){
                            ui.tagIndex = scope.tags.length-1;
                            scope.scrollToInput()
                        }
                        eventDone = true;
                    }
                    return eventDone;
                }

                function onDeleteKey(ui) {
                    let eventDone = false;
                    if (ui.newTag.length == 0) {
                        scope.deleteTag(true);
                        eventDone = true;
                    }
                    return eventDone;
                }

                function onEnterKey(ui) {
                    let idx = ui.dropDownIndex;
                    const tags = scope.filteredTags;

                    if (isNaN(idx) && tags.createItem != undefined) idx = tags.length-1; // create new tag
                    if (isNaN(idx) && tags.items.length > 0 && tags.items[0].match) idx = 0; //exact match of existing item with input text
                    if (isNaN(idx) ) {
                        if (ui.newTag=="") scope.onSaveEdit();
                    }
                    else {
                        scope.addTag(idx);
                    }
                    return true;
                }

                scope.onInputKeydown = function (e) {

                    const ui = scope.uiState;
                    let eventDone = false;

                    switch (e.keyCode) {
                        case 40:
                            eventDone = onDownArrow(ui);
                            break;
                        case 38:
                             eventDone = onUpArrow(ui);
                            break;
                        case 37:
                            eventDone = onLeftArrow(ui)
                            break;
                        case 39:
                            eventDone = onRightArrow(ui)
                        break;
                        case  8:
                            eventDone = onDeleteKey(ui)
                            break;
                        case 13:
                            eventDone = onEnterKey(ui)
                            break;
                        default:

                            break;
                    }

                    if (eventDone) eatEvent(e);

                };

            }
        };
    });


    app.directive('tagEditPopover', function($timeout, $rootScope, CreateModalFromTemplate, TaggingService, TagEditService){
        return {
            templateUrl: "/templates/taggable-objects/tag-edit-popover.html",
            restrict:'E',
            scope: {
                tags: '=ngModel',
                getAllTags: '&?',
                objectType: '=?',
                manageLink: "=",
                noTagIcon: '<',
                editable: '=?',
                responsive: '=?'

            },
            link: function(scope, element, attrs) {

                scope.allTags = {};

                if (typeof scope.editable == 'undefined') {
                    scope.editable = true;
                }

                function onStartEdit() {
                    setTagIdxToLastTag();
                    scope.isEditing = true;
                }

                function onSaveEdit() {
                    scope.isEditing = false;
                    if (scope.edited) {
                        scope.$emit("objectSummaryEdited");
                        scope.edited = false;
                    }
                }

                if ($rootScope.activeProjectTagColor) {
                    scope.tagColor = $rootScope.activeProjectTagColor;
                } else {
                    scope.tagColor = TaggingService.getTagColor;
                }

                if (!scope.getAllTags) {
                    scope.tags.forEach((tag) => {
                        scope.allTags[tag] = { color: scope.tagColor(tag) };
                    });
                }

                function initUiState() {
                    scope.uiState = {
                        newTag: '', // text in the input field via ng-model
                    };
                }

                scope.allowManageTags = (scope.manageLink==undefined || scope.manageLink);

                initUiState();

                function setTagIdxToLastTag() {
                    scope.uiState.tagIndex = scope.tags ? scope.tags.length - 1 : undefined;
                }

                function reInitTagIndex() {
                    if (scope.uiState.newTag) {
                        scope.uiState.tagIndex = undefined; //stop over-enthusiastic delete-key from deleting selected tags
                    }
                    else {
                        if (isNaN(scope.uiState.tagIndex)) {
                            $timeout(setTagIdxToLastTag, 1200);
                        }
                    }
                }

                function updateDropListOnTagChange() {
                    TagEditService.setTags(scope.tags);
                    const data = TagEditService.updateDropListOnTagChange(scope.uiState, scope.objectType);
                    scope.allTags = data.allTags;
                    scope.filteredTags = data.filteredTags;
                    scope.uiState = Object.assign(scope.uiState, data.uiState);
                    reInitTagIndex();
                };

                var getInput = () => element.find('.tag-edit-filter__input');
                var setInputFocus = () => getInput().focus();

                function eatEvent(e) {
                    if (e) {
                        e.stopPropagation();
                        e.preventDefault();
                    }
                }

                function applyManageTagsChanges (existingList, newAllTags) { //rename any tags in-edit
                    const newTags = [];
                    existingList.forEach( tag => {
                        if (newAllTags[tag]) {
                            if (newAllTags[tag].updatedTagName) {
                                newTags.push(newAllTags[tag].updatedTagName);
                            }
                            else {
                                newTags.push(tag);
                            }
                        }
                        else if (!scope.allTags[tag]) {
                            newTags.push(tag); // a tag just typed into edit field, hence not in the newAllTags list
                        }

                    });

                    return newTags;
                 }

                function handleManageTagsComplete(newAllTags) {
                    if (newAllTags) {
                        scope.tags = applyManageTagsChanges(scope.tags, newAllTags);
                    }
                    setTagIdxToLastTag();
                    $timeout(setInputFocus, 100);
                }

                scope.saveEdit = function(e) {
                    $("html").off("click.tagEdit");
                    eatEvent(e);
                    onSaveEdit();

                }

                scope.deleteTag = function(isBackspace, index = scope.uiState.tagIndex, isSelected) {
                    if (!isNaN(index)) {
                        scope.tags.splice(index, 1); // remove tag at tagIndex
                        scope.uiState.tagIndex = Math.max(index - (isBackspace ? 1 : 0), 0);
                        setInputFocus();
                    }
                    updateDropListOnTagChange();
                    scope.edited = true;
                    if (isSelected) {
                        scope.saveEdit(isBackspace);
                    }
                };

                function isCreateTagSelected(idx) {
                    return (scope.filteredTags.createItem && idx == scope.filteredTags.length-1);
                }

                scope.addTag = function(idx) {
                    let added = false;

                    if (!isNaN(idx)) {
                        if (isCreateTagSelected(idx)) {
                            scope.tags.push(scope.filteredTags.createItem);
                            scope.allTags[scope.filteredTags.createItem] = { title: scope.filteredTags.createItem, color: TaggingService.getTagColor(scope.filteredTags.createItem) };
                        }
                        else { //select tag in droplist
                            scope.tags.push(scope.filteredTags.items[idx].title);
                        }
                        scope.edited = true;
                        added = true;
                        updateDropListOnTagChange();
                        scope.uiState.newTag = "";
                        setTagIdxToLastTag();
                    }

                    return added;
                };

                if (scope.editable) {
                    scope.$watch('uiState.newTag', function(nv, ov) {
                        scope.filteredTags = TagEditService.filterTagListByInput(scope.allTags, scope.uiState.newTag, scope.objectType);
                        reInitTagIndex();
                        scope.uiState.dropDownIndex =  TagEditService.unSelectedDropDownIdx();
                        if (nv !== "") {
                            scope.uiState.tagIndex = undefined;
                        }
                    });

                    scope.$watch('tags', function(nv, ov) {
                        if (!nv) return;
                        if (!ov) setTagIdxToLastTag();
                        TagEditService.setTags(scope.tags);
                        updateDropListOnTagChange();
                    });

                    scope.$watch('globalTagsCategory', function(nv, ov) {
                        if (nv == ov) return;
                        updateDropListOnTagChange();
                    })

                    scope.$watch('allTags', function(nv, ov) {
                        scope.filteredTags = TagEditService.filterTagListByInput(scope.allTags, scope.uiState.newTag, scope.objectType);
                        reInitTagIndex();
                        if (scope.tags) updateDropListOnTagChange(); //we need to do this when using Manage Tags but not on initialisation
                    });
                }

                function setAllTags() {
                    if (scope.getAllTags) {
                        scope.getAllTags().then((data) => {
                            scope.allTags = Object.assign(data, scope.globalTags);
                        });
                    }
                }
                setAllTags();
                scope.globalTags = TaggingService.getGlobalTags(scope.objectType);
                Object.assign(scope.allTags, scope.globalTags);

                scope.onStartTagEdit = function (e, category) {
                    if (!scope.editable || e.target.classList.contains("responsive-tags-list__tag-button")) {
                        return;
                    }
                    initUiState();
                    scope.globalTagsCategory = TagEditService.setActiveCategory(category);
                    setAllTags();
                    onStartEdit();
                    setInputFocus();
                    window.setTimeout(() => {
                        $("html").on("click.tagEdit", function(event) {
                            const filterTagPopover = function(node) {
                                return Array.prototype.indexOf.call(node.classList || [],'tag-edit-popover__popover') >= 0;
                            };
                            const filterManageTagsModal = function(node) {
                                return Array.prototype.indexOf.call(node.classList || [],'edit-tags-modal') >= 0 || Array.prototype.indexOf.call(node.classList || [],'modal-backdrop') >= 0;
                            };
                            const path = event.originalEvent && (event.originalEvent.path || (event.originalEvent.composedPath && event.originalEvent.composedPath()));
                            const isEventFromTagPopover = path && path.filter(filterTagPopover).length > 0;
                            const isEventFromManageTagsModal = path && path.filter(filterManageTagsModal).length > 0;
                            if (isEventFromTagPopover || isEventFromManageTagsModal) {
                                return;
                            }
                            scope.$apply(function() {
                                scope.saveEdit(event);
                            });
                        })
                    }, 0);
                }

                scope.onDropdownClick = function (e, idx, selected) {
                    eatEvent(e);

                    if (isNaN(idx)) return;
                    if (selected) {
                        const idxUnfilteredTags = scope.tags.indexOf(scope.filteredTags.selectedItems[idx].title);
                        scope.deleteTag(e, idxUnfilteredTags);
                    } else {
                        scope.addTag(idx);
                    }
                    setInputFocus();
                    scope.uiState.dropDownIndex = TagEditService.unSelectedDropDownIdx();
                }

                scope.onDropdownKeydown = function (e, idx) {
                    if (e.keyCode==13) { // enter key
                        if (idx < scope.filteredTags.selectedItems.length) {
                            const idxUnfilteredTags = scope.tags.indexOf(scope.filteredTags.selectedItems[idx].title);
                            scope.deleteTag(e, idxUnfilteredTags);
                        }
                        else {
                            scope.addTag(idx - scope.filteredTags.selectedItems.length);
                        }
                        setInputFocus();
                        eatEvent(e);
                    }
                }

                scope.manageTags = function() {
                    onSaveEdit();
                    CreateModalFromTemplate("/templates/widgets/edit-tags-modal.html", scope, null, (modalScope) => {
                        modalScope.tagsDirty = angular.copy(scope.allTags);

                        modalScope.save = function() {
                            handleManageTagsComplete(modalScope.tagsDirty);
                            TaggingService.saveToBackend(modalScope.tagsDirty)
                                .success(() => {
                                    if (scope.getAllTags) {
                                        scope.getAllTags().then(d => scope.allTags = d);
                                    }
                                    modalScope.resolveModal();
                                })

                                .error(setErrorInScope.bind(scope));
                        };

                        modalScope.cancel = function () {
                            handleManageTagsComplete();
                            modalScope.dismiss();
                        }
                    });
                };

                function onDownArrow(ui) {
                    ui.dropDownIndex = isNaN(ui.dropDownIndex) ? 0 : Math.min(ui.dropDownIndex + 1, scope.filteredTags.length + scope.filteredTags.selectedItems.length - 1);
                    return true;
                }

                function onUpArrow(ui) {
                    scope.uiState.dropDownIndex =  isNaN(ui.dropDownIndex) || ui.dropDownIndex <= 0 ? TagEditService.unSelectedDropDownIdx() : ui.dropDownIndex - 1;
                    return true;
                }

                function onDeleteKey(ui) {
                    let eventDone = false;
                    if (ui.newTag.length == 0) {
                        scope.deleteTag(true);
                        eventDone = true;
                    }
                    return eventDone;
                }

                function onEnterKey(ui) {
                    let idx = ui.dropDownIndex;
                    const tags = scope.filteredTags;

                    if (isNaN(idx) && tags.createItem != undefined) idx = tags.length - 1; // create new tag
                    if (isNaN(idx) && tags.items.length > 0 && tags.items[0].match) idx = 0; //exact match of existing item with input text
                    if (isNaN(idx) ) {
                        if (ui.newTag=="") scope.saveEdit();
                    }
                    else if (idx < scope.filteredTags.selectedItems.length) {
                        const idxUnfilteredTags = scope.tags.indexOf(scope.filteredTags.selectedItems[idx].title);
                        scope.deleteTag(false, idxUnfilteredTags);
                    }
                    else {
                        scope.addTag(idx - scope.filteredTags.selectedItems.length);
                    }
                    return true;
                }

                scope.onInputKeydown = function (e) {

                    const ui = scope.uiState;
                    let eventDone = false;

                    switch (e.keyCode) {
                        case 40:
                            eventDone = onDownArrow(ui);
                            break;
                        case 38:
                             eventDone = onUpArrow(ui);
                            break;
                        case 8:
                            eventDone = onDeleteKey(ui);
                            break;
                        case 13:
                            eventDone = onEnterKey(ui);
                            break;
                        default:
                            break;
                    }

                    if (eventDone) eatEvent(e);

                };

                let saveOnDestroy = scope.$on('$destroy', (e) => {
                    scope.saveEdit();
                });
            }
        };
    });

})();

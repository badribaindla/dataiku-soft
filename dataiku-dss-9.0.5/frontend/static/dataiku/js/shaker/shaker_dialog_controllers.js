(function() {
'use strict';

const app = angular.module('dataiku.shaker');


app.constant("NORMALIZATION_MODES", [
    ["EXACT", "Exact"],
    ["LOWERCASE", "Lowercase"],
    ["NORMALIZED", "Normalize (ignore accents)"]
]);


app.controller('ShakerCellValuePopupController', function($scope, Assert) {
    Assert.inScope($scope, 'cellValue');
    Assert.inScope($scope, 'column');

    if (["GeometryMeaning", "BagOfWordsMeaning", "JSONObjectMeaning", "JSONArrayMeaning"].indexOf($scope.column.selectedType.name) >= 0) {
        try {
            $scope.jsonValue = JSON.parse($scope.cellValue);

            $scope.jsonDetails = {}

            if ($scope.jsonValue.constructor === Array) {
                $scope.jsonDetails.type = "array";
                $scope.jsonDetails.length = $scope.jsonValue.length;
                $scope.jsonDetails.strLength = $scope.cellValue.length;
            } else if (typeof($scope.jsonValue) == "object") {
                $scope.jsonDetails.type = "object";
                $scope.jsonDetails.nbKeys = Object.keys($scope.jsonValue).length;
                $scope.jsonDetails.strLength = $scope.cellValue.length;
            }

            $scope.jsonEnabled = true;
        } catch (e){}
    }
});


app.controller('ShakerSelectColumnsController', function($scope, $filter, Assert) {
    Assert.inScope($scope, 'shaker');
    Assert.inScope($scope, 'table');

    if (!$scope.shaker.columnsSelection.list) {
        $scope.allColumnNames = angular.copy($scope.table.allColumnNames.map(function(x){ return { name : x, $selected : true } }));
    } else {
        $scope.allColumnNames = angular.copy($scope.shaker.columnsSelection.list.map(function(x){ return { name : x.name, $selected : x.d } }));
    }

    $scope.ok = function(selectedObjects){
        if ($scope.shaker.columnsSelection.mode == "ALL") {
            $scope.shaker.columnsSelection.list = null;
        } else {
            $scope.shaker.columnsSelection.list = angular.copy($scope.selection.allObjects.map(function(x){ return { name : x.name, d : x.$selected } }));
        }
        $scope.dismiss();
        $scope.autoSaveForceRefresh();
    }
});


app.controller('ShakerSelectSortController', function($scope, $filter, Assert) {
    Assert.inScope($scope, 'shaker');
    Assert.inScope($scope, 'table');

    $scope.uiState = {
        query : ''
    };

    $scope.choicesLeft = [];
    $scope.choicesMade = [];

    // init the 2 lists
    var sorted = {};
    ($scope.shaker.sorting || []).forEach(function(s) {
        $scope.choicesMade.push(angular.copy(s));
        sorted[s.column] = true;
    });
    $scope.table.headers.forEach(function(x) {
        if (!(sorted[x.name])) {
            $scope.choicesLeft.push({column:x.name, ascending:true});
        }
    });

    // utils
    $scope.hasSearch = function() {
        return $scope.uiState.query;
    };
    $scope.resetSearch = function() {
        $scope.uiState.query = null;
    };
    $scope.toggle = function(column) {
        column.ascending = !column.ascending;
    };


    // list operations
    $scope.removeAll = function() {
        $scope.choicesMade.forEach(function(c) {$scope.choicesLeft.push(c);});
        $scope.choicesMade = [];
    };
    $scope.add = function(column) {
        var i = $scope.choicesLeft.indexOf(column);
        if (i >= 0) {
            $scope.choicesLeft.splice(i, 1);
            $scope.choicesMade.push(column);
        }
    };
    $scope.remove = function(column) {
        var i = $scope.choicesMade.indexOf(column);
        if (i >= 0) {
            $scope.choicesMade.splice(i, 1);
            $scope.choicesLeft.push(column);
        }
    };

    $scope.ok = function(){
        $scope.shaker.sorting = angular.copy($scope.choicesMade);
        $scope.dismiss();
        $scope.autoSaveForceRefresh();
    }
});

app.controller('RegexBuilderController', function ($scope, $stateParams, DataikuAPI, FutureWatcher, SpinnerService, $filter, WT1) {
    $scope.uiState = {};
    $scope.customRegexError = "";
    $scope.firstSentence = "";
    $scope.sentences = [];
    $scope.selectionPositions = []; // changes when new selections or when new sentences
    $scope.selections = [];
    $scope.excludedSentences = [];
    $scope.patterns = [];
    $scope.columnName = "";
    $scope.onColumnNames = false;
    $scope.selectedPattern = null;
    $scope.wrapLines = false;
    $scope.warningMessage = "";
    $scope.lastRequestNumber = 0;
    const MULTI_OCCURRENCES_THRESHOLD = 0.1;

    $scope.createCustomPattern = function (regex) {
        return {
            oldRegex: regex || "",
            regex: regex || "",
            nbOK: -1,
            nbNOK: -1,
            extractions: [],
            errors: [],
        }
    };

    $scope.customPattern = $scope.createCustomPattern();

    $scope.removeNextStepsFromShaker = function (shaker, step) {
        const stepId = $scope.findStepId(step);
        if (typeof (stepId) !== 'undefined') {
            if (stepId.depth === 0) {
                shaker.steps = shaker.steps.slice(0, stepId.id);
            } else if (stepId.depth === 1) {
                shaker.steps[stepId.id].steps = shaker.steps[stepId.id].steps.slice(0, stepId.subId);
                shaker.steps = shaker.steps.slice(0, stepId.id + 1);
            }
        }
    };

    const findSelections = function (sentence, selections) {
        const foundSelections = [];
        for (const sel of selections) {
            if (sentence === sel.before + sel.selection + sel.after) {
                foundSelections.push({
                    start: sel.before.length,
                    end: sel.before.length + sel.selection.length,
                });
            }
        }
        return foundSelections;
    }

    const computeSelectionPositions = function (sentences, selections) {
        const selectionPositions = [];
        for (const sentence of sentences) {
            selectionPositions.push(findSelections(sentence, selections));
        }
        return selectionPositions;
    }

    const computeErrorPositionsOneRow = function (selectionPositions, extractionPositions, isExcluded) {
        extractionPositions = extractionPositions || [];
        if (isExcluded) {
            return extractionPositions;
        }
        if (selectionPositions.length == 0) {
            return [];
        }
        const errorPositions = [];
        for (const selection of selectionPositions) {
            if (!extractionPositions.some(extr => extr.start === selection.start && extr.end === selection.end)) {
                errorPositions.push(selection);
            }
        }
        for (const extraction of extractionPositions) {
            if (!selectionPositions.some(sel => sel.start === extraction.start && sel.end === extraction.end)) {
                errorPositions.push(extraction);
            }
        }
        return errorPositions;
    }

    $scope.computeErrorPositions = function (pattern) {
        const errorPositions = [];
        for (const [index, sentence] of $scope.sentences.entries()) {
            errorPositions.push(computeErrorPositionsOneRow($scope.selectionPositions[index], pattern.extractions[index], $scope.isUsedAsExclusion(sentence)));
        }
        return errorPositions;
    }

    $scope.selectPattern = function (pattern) {
        $scope.selectedPattern = pattern;
    }

    $scope.setDefaultSelectedPattern = function (onlyCustomComputed) {
        if (onlyCustomComputed) {
            if ($scope.selectedPattern.category !== 'userCustomPattern') {
                // if the custom pattern was not selected before , we should not force select it
                const selectedIndex = $scope.patterns.findIndex(p => p.regex == $scope.selectedPattern.regex);
                if (selectedIndex >= 0) {
                    $scope.selectPattern($scope.patterns[selectedIndex]);
                    return;
                }
            }
            $scope.selectPattern($scope.customPattern);
            return;
        }
        //select a default pattern
        if ($scope.patterns.length >= 1) {
            $scope.selectPattern($scope.patterns[0]);
        } else {
            $scope.selectPattern($scope.customPattern);
        }
    }

    $scope.filterRequestParameter = function () {
        return { "elements": $scope.buildFilterRequest() };
    }

    $scope.computePatterns = function (computeOnlyCustom) {
        $scope.lastRequestNumber++;
        const currentRequestNumber = $scope.lastRequestNumber;
        const shakerForQuery = $scope.shakerHooks.shakerForQuery();
        // Remove currently edited step and next steps from query
        if ($scope.editStep) {
            $scope.removeNextStepsFromShaker(shakerForQuery, $scope.editStep);
        }
        let selections = [];
        let excludedSentences = [];
        const customRegex = $scope.customPattern.regex;
        if (!computeOnlyCustom) {
            selections = $scope.selections;
            excludedSentences = $scope.excludedSentences;
        }
        DataikuAPI.shakers.smartExtractor($stateParams.projectKey, $scope.inputDatasetProjectKey, $scope.inputDatasetName, shakerForQuery, $scope.requestedSampleId,
            $scope.columnName,
            selections,
            excludedSentences,
            customRegex,
            $scope.onColumnNames,
            $scope.firstSentence,
            $scope.filterRequestParameter()
        ).success(function (initialResponse) {
            SpinnerService.lockOnPromise(FutureWatcher.watchJobId(initialResponse.jobId).success(function (data) {
                if (currentRequestNumber !== $scope.lastRequestNumber) return;
                if (!computeOnlyCustom) {
                    $scope.patterns = data.result.categories
                        .filter(c => c.name !== "userCustomPattern")
                        .map(c => c.propositions)
                        .flat();
                }
                $scope.customRegexError = data.result.customRegexError;
                const oldRegex = $scope.customPattern.regex
                const customPatternCategory = data.result.categories.find(c => c.name === "userCustomPattern");
                if (customPatternCategory && customPatternCategory.propositions.length >= 1) {
                    $scope.customPattern = customPatternCategory.propositions[0];
                }
                $scope.customPattern.oldRegex = oldRegex;
                $scope.sentences = data.result.sentences;
                $scope.selectionPositions = computeSelectionPositions($scope.sentences, $scope.selections);
                $scope.patterns = $scope.patterns.map(p => {
                    return {
                        ...p,
                        errors: $scope.computeErrorPositions(p),
                    }
                });
                $scope.customPattern.errors = $scope.computeErrorPositions($scope.customPattern)
                if (!$scope.customPattern) {
                    $scope.customPatterns = $scope.createCustomPattern();
                }
                $scope.setDefaultSelectedPattern(computeOnlyCustom);
            }));
        }).error(setErrorInScope.bind($scope));
    };

    $scope.addSelection = function (sentence, startOff, endOff) {
        if ($scope.isUsedAsExclusion(sentence)) {
            $scope.removeSentenceSelectionExcluded(sentence);
        }
        while (sentence[startOff] === " " && startOff <= sentence.length) {
            startOff++;
        }
        while (sentence[endOff - 1] === " " && endOff >= 0) {
            endOff--;
        }
        if (endOff <= startOff) {
            return;
        }
        const sel = {
            before: sentence.substring(0, startOff),
            selection: sentence.substring(startOff, endOff),
            after: sentence.substring(endOff),
        };
        if ($scope.isExistingSelection(sel)) return;
        $scope.selections.push(sel);
        $scope.computePatterns(false);
    };

    $scope.removeSelection = function (idx) {
        $scope.selections.splice(idx, 1);
        $scope.computePatterns(false);
    };

    $scope.removeSentenceSelectionExcluded = function (sentence) {
        $scope.selections = $scope.selections.filter(sel => sel.before + sel.selection + sel.after !== sentence);
        $scope.excludedSentences = $scope.excludedSentences.filter(excl => excl !== sentence);
    };

    $scope.ignoreErrors = function (sentence) {
        $scope.removeSentenceSelectionExcluded(sentence);
        $scope.computePatterns(false);
    };

    $scope.addExcludedSentence = function (sentence) {
        $scope.removeSentenceSelectionExcluded(sentence);
        $scope.excludedSentences.push(sentence);
        $scope.computePatterns(false);
    };

    $scope.removeExcludedSentence = function (idx) {
        $scope.excludedSentences.splice(idx, 1);
        $scope.computePatterns(false);
    };

    $scope.isExistingSelection = function (selection) {
        return $scope.selections.some(sel => sel.before === selection.before && sel.selection === selection.selection && sel.after === selection.after);
    };

    $scope.isUsedAsExclusion = function (sentence) {
        if ($scope.excludedSentences.includes(sentence)) {
            return true;
        }
        return false;
    };

    $scope.findStartOffset = function (nodes, selection) {
        //selection is not a string, it's a https://developer.mozilla.org/en-US/docs/Web/API/Selection
        //nodes are DOM elements
        let startOff = 0;
        for (const node of nodes) {
            if (node.nodeType == 1 && !selection.containsNode(node, true)) {
                startOff += node.textContent.length;
            }
            if (node.nodeType == 1 && selection.containsNode(node, true)) {
                // the selection is between anchorNode and focusNode, but they can either be at the begining or the end of the selection depending on the selection direction (to the right or to the left)
                const isAnchor = node.isSameNode(selection.anchorNode.parentElement);
                const isFocus = node.isSameNode(selection.focusNode.parentElement);
                if (isAnchor && isFocus) {
                    return startOff + Math.min(selection.anchorOffset, selection.focusOffset);
                }
                if (isAnchor) {
                    return startOff + selection.anchorOffset;
                }
                if (isFocus) {
                    return startOff + selection.focusOffset;
                }
            }
        }
    };

    $scope.isSingleNodeSelection = function (nodes, selection) {
        let containsAnchor = false;
        let containsFocus = false;
        for (const node of nodes) {
            if (node.isSameNode(selection.anchorNode.parentElement)) {
                containsAnchor = true;
            }
            if (node.isSameNode(selection.focusNode.parentElement)) {
                containsFocus = true;
            }
        }
        return containsAnchor && containsFocus;
    };

    $scope.onSelection = function (evt, sentence) {
        evt.stopPropagation();
        var userSelection;
        if (window.getSelection) {
            userSelection = window.getSelection();
        } else if (document.selection) {
            userSelection = document.selection.createRange();
        }
        const rowNodes = evt.currentTarget.childNodes;
        if (!$scope.isSingleNodeSelection(rowNodes, userSelection)) {
            return;
        }
        var selectedText = userSelection + "";
        if (userSelection.text) {
            selectedText = userSelection.text;
        }
        if (selectedText) {
            const startOff = $scope.findStartOffset(rowNodes, userSelection);
            $scope.addSelection(sentence, startOff, startOff + selectedText.length);
        }
    };

    $scope.onCustomRegexChange = function () {
        const pattern = $scope.customPattern;
        if (pattern.regex !== pattern.oldRegex) {
            $scope.computePatterns(true);
        }
    }

    $scope.getWT1Stats = function (action) {
        let stats = {};
        stats.action = action || '';
        stats.nbSelections = $scope.selections.length;
        if ($scope.selectedPattern != null) {
            stats.category = $scope.selectedPattern.category;
            stats.matchOK = $scope.selectedPattern.nbOK;
            stats.matchNOK = $scope.selectedPattern.nbNOK;
        }
        stats.calledFrom = $scope.calledFrom || '';
        return stats;
    };

    $scope.save = function () {
        const WT1stats = $scope.getWT1Stats("save")
        WT1.event("patternbuilder", WT1stats);
        if ($scope.selectedPattern != null) {
            if ($scope.deferred) {
                const extractingLines = $scope.selectedPattern.extractions.filter(extractions => extractions.length > 0).length;
                const multiExtractingLines = $scope.selectedPattern.extractions.filter(extractions => extractions.length > 1).length;
                let multiOccurenceRatio = 0;
                if (extractingLines >= 1) {
                    multiOccurenceRatio = multiExtractingLines / extractingLines;
                }
                const pattern = {
                    regex: $scope.selectedPattern.regex,
                    hasMultiOccurrences: multiOccurenceRatio > MULTI_OCCURRENCES_THRESHOLD,
                };
                $scope.deferred.resolve(pattern);
            }
        }
        $scope.dismiss();
    };

    $scope.cancel = function () {
        const WT1stats = $scope.getWT1Stats("cancel");
        WT1.event("patternbuilder", WT1stats);
        if ($scope.deferred) {
            $scope.deferred.reject();
        }
        $scope.dismiss();
    };

});

app.directive('overlapUnderlineHighlight', function () {
    const template = '<span ng-repeat="subSentence in subSentences"'
        + 'ng-class="{'
        + '\'overlap-underline-highlight--dark-green\': subSentence.darkGreen,'
        + '\'overlap-underline-highlight--light-green\': subSentence.lightGreen,'
        + '\'overlap-underline-highlight--error\': subSentence.error,'
        + '\'overlap-underline-highlight--crossed\': isCrossed}">'
        + '{{subSentence.value}}'
        + '</span>';
    return {
        template,
        restrict: 'AE',
        scope: {
            sentence: '=',
            isCrossed: '=',
            darkGreenOffsets: '=', // all offsets should look like [{start: 26, end: 41}, {start: 132, end: 138}]
            lightGreenOffsets: '=',
            errorOffsets: '=',
        },
        link: function (scope, element, attrs) {
            scope.$watch('[sentence, darkGreenOffsets, lightGreenOffsets, errorOffsets, isCrossed]', function (ov, nv) {
                const darkGreenOffsets = scope.darkGreenOffsets || [];
                const lightGreenOffsets = scope.lightGreenOffsets || [];
                const errorOffsets = scope.errorOffsets || [];
                scope.subSentences = [];
                let styleChangingIndexes = new Set([
                    0,
                    ...darkGreenOffsets.flatMap(o => [o.start, o.end]),
                    ...lightGreenOffsets.flatMap(o => [o.start, o.end]),
                    ...errorOffsets.flatMap(o => [o.start, o.end]),
                    scope.sentence.length,
                ]);
                const sortedIndexes = [...styleChangingIndexes].sort((a, b) => a - b);
                for (let i = 0; i < sortedIndexes.length - 1; i++) {
                    const start = sortedIndexes[i];
                    const end = sortedIndexes[i + 1];
                    let subsentence = {
                        value: scope.sentence.substring(start, end),
                        darkGreen: darkGreenOffsets.some(o => o.start <= start && o.end >= end),
                        lightGreen: lightGreenOffsets.some(o => o.start <= start && o.end >= end),
                        error: errorOffsets.some(o => o.start <= start && o.end >= end),
                    };
                    scope.subSentences.push(subsentence);
                };
            }, true)
        }
    }
});

app.controller('SmartDateController', function($scope, $stateParams, $timeout, DataikuAPI, WT1) {
    $scope.uiState = {
        customFormatInput: ""
    };

    $scope.removeNextStepsFromShaker = function(shaker, step) {
        const stepId = $scope.findStepId(step);
        if (typeof(stepId)!=='undefined') {
            if (stepId.depth == 0) {
                shaker.steps = shaker.steps.slice(0, stepId.id);
            } else if (stepId.depth == 1) {
                shaker.steps[stepId.id].steps = shaker.steps[stepId.id].steps.slice(0, stepId.subId);
                shaker.steps = shaker.steps.slice(0, stepId.id + 1);
            }
        }
    };

    $scope.setColumn  = function(name) {
        $scope.columnName = name;
        // Copy of the original shaker for the query
        const shakerForQuery = $scope.shakerHooks.shakerForQuery();
        // Remove currently edited step and next steps from query
        if ($scope.editStep) {
            $scope.removeNextStepsFromShaker(shakerForQuery, $scope.editStep);
        }

        DataikuAPI.shakers.smartDateGuess($stateParams.projectKey,
            $scope.inputDatasetProjectKey, $scope.inputDatasetName, shakerForQuery, $scope.requestedSampleId, $scope.columnName).success(function(data) {
            $scope.autodetected = data.formats;
            WT1.event("smartdate-guessed", {"nbGuessed" : $scope.autodetected.length});
            let detectedFormatIndex;
            for (const i in $scope.autodetected) {
                let fmt = $scope.autodetected[i];
                fmt.parsesPercentage = 100*fmt.nbOK/(fmt.nbOK + fmt.nbNOK + fmt.nbPartial);
                fmt.partialPercentage = 100*fmt.nbPartial/(fmt.nbOK + fmt.nbNOK + fmt.nbPartial);
                fmt.failsPercentage = 100 - fmt.parsesPercentage - fmt.partialPercentage;
                if ($scope.editFormat == fmt.format) {
                    detectedFormatIndex = i;
                }
            }

            let selectCustom = false
            if (!$scope.editFormat) {
                // New smart date or no format to edit => select first format if found
                if ($scope.autodetected.length > 0) {
                    $scope.selectFormat(0);
                } else { // select the custom format
                    selectCustom = true;
                }
            } else if (detectedFormatIndex >= 0) {
                // Found format in the guess list => select this one
                $scope.selectFormat(detectedFormatIndex);
            } else {
                selectCustom = true;
            }
            // need to validate the empty custom so that we can display examples (they come from backend and depend on the format)
            $scope.validateCustom(selectCustom);
        }).error(setErrorInScope.bind($scope));
    };

    WT1.event("smartdate-open");

    $scope.selectFormat = function(idx) {
        $scope.selectedFormat = $scope.autodetected[idx];
    };

    $scope.validateSeqId = 0;

    $scope.onCustomFormatClick = function() {
        $scope.selectedFormat = $scope.customFormat;
    };

    $scope.validateCustom = function(isSelected) {
        $scope.validateSeqId++;
        const seqId = $scope.validateSeqId;
        WT1.event("smartdate-validate-custom", {"format" : $scope.uiState.customFormatInput});
        // Get a copy of the current shaker for the query
        let shakerForQuery = $scope.shakerHooks.shakerForQuery();
        // Remove currently edited step and next steps from query
        if ($scope.editStep) {
            $scope.removeNextStepsFromShaker(shakerForQuery, $scope.editStep);
        }
        DataikuAPI.shakers.smartDateValidate($stateParams.projectKey,
                $scope.inputDatasetProjectKey, $scope.inputDatasetName, shakerForQuery, $scope.requestedSampleId,
                $scope.columnName, $scope.uiState.customFormatInput == null ? "" : $scope.uiState.customFormatInput).success(function(data) {
            if (seqId != $scope.validateSeqId) return;
            data.parsesPercentage = 100*data.nbOK/(data.nbOK + data.nbNOK + data.nbPartial);
            data.partialPercentage = 100*data.nbPartial/(data.nbOK + data.nbNOK + data.nbPartial);
            data.failsPercentage = 100 - data.parsesPercentage - data.partialPercentage;
            if (isSelected) {
                $scope.selectedFormat = data;
            }
            $scope.customFormat = data;
        }).error(setErrorInScope.bind($scope));
    };

    $scope.save = function() {
        if ($scope.selectedFormat != null && $scope.selectedFormat.validFormat) {
            WT1.event("smartdate-accept", {"format" : $scope.selectedFormat.format});
            if ($scope.deferred) {
                $scope.deferred.resolve($scope.selectedFormat.format);
            }
            $scope.dismiss();
        }
    };

    $scope.cancel = function() {
        if ($scope.deferred) {
            $scope.deferred.reject();
        }
        $scope.dismiss();
    };

    $scope.$watch("uiState.customFormatInput", function(ov, nv) {
        if (ov != nv) {
            $timeout(function () {$scope.validateCustom(true);}, 200);
        }
    });
});

app.controller('DateParserController', function($scope, $q, $element, WT1, CreateModalFromTemplate) {
    if (!$scope.step.params.formats) $scope.step.params.formats = [''];
    $scope.formatItemTemplate = {format: ''};
    $scope.formatItems = $scope.step.params.formats.map(function(f) { return {format: f}; });
    $scope.formatsChanged = function() {
        [].splice.apply($scope.step.params.formats,
            [0, $scope.step.params.formats.length].concat($scope.formatItems.map(function(fi) { return fi.format; })));
        $scope.checkAndRefresh();
    };
    $scope.validateFormatList = function(it, itemIndex) {
        if (!it || !it.format || it.format.length == 0) return false;
        for (var i in $scope.formatItems) {
            if ($scope.formatItems[i].format == it.format) return false;
        }
        return true;
    };
    $scope.showSmartDateTool = function() {
        return $scope.columns && $scope.step.params.columns && $scope.step.params.columns[0] && $scope.columns.indexOf($scope.step.params.columns[0]) >= 0;
    };
    $scope.openSmartDateTool = function() {
        if (!$scope.step.params.columns || !$scope.step.params.columns[0] || $scope.columns.indexOf($scope.step.params.columns[0]) == -1) return;
        
        WT1.event("shaker-parsedate-edit-smartdate");
        var deferred = $q.defer();
        CreateModalFromTemplate("/templates/shaker/smartdate-box.html", $scope, "SmartDateController",
            function(newScope) { newScope.$apply(function() {
                    newScope.deferred = deferred;
                    newScope.editStep = $scope.step;
                    newScope.editFormat = "";
                    newScope.setColumn($scope.step.params.columns[0]);
            }); }, "sd-modal");
        deferred.promise.then(function(newFormat) {
            if (!newFormat || newFormat.length == 0) return;
            // Checks if the new format is already present in the list and retrieve the old format index
            let isNewFormatThere, newFormatIdx;
            for (let i in $scope.formatItems) {
                if ($scope.formatItems[i].format == newFormat) {
                    isNewFormatThere = true;
                    newFormatIdx = i;
                    break;
                }
            }
            // Edit the new format if not present, otherwise focus on the existing input containing the new format
            if (!isNewFormatThere) {
                if ($scope.formatItems.length > 0) {
                    const lastItem = $scope.formatItems[$scope.formatItems.length - 1];
                    if (lastItem.format == '') {
                        $scope.formatItems.pop();
                    }
                }
                $scope.formatItems = [...$scope.formatItems, { format: newFormat }];
                newFormatIdx = $scope.formatItems.length - 1;
                $scope.formatsChanged();
            }
            setTimeout(() => {
                // element not yet created ion the dom when checking
                $element.find(".dateFormatInput")[newFormatIdx].focus();
            }, 100);
        });
    };
});

app.controller('RenameColumnController', function($scope) {
    $scope.setColumn  = function(name) {
        $scope.columnName = name;
        $scope.renameTarget = name;
    }

    $scope.save = function() {
        if($scope.columnName!=$scope.renameTarget) {
            $scope.addStepNoPreviewAndRefresh("ColumnRenamer", {
                renamings : [
                    {"from" : $scope.columnName, "to" : $scope.renameTarget}
                ]
            });
            $scope.mergeLastColumnRenamers();
        }
        $scope.dismiss();
    }
});

app.controller('MoveColumnController', function($scope) {
    $scope.setColumn = function(name) {
        $scope.columnName = name;
        // Remove the column we want to move from the list of reference columns.
        let index = $scope.referenceColumnList.indexOf(name);
        $scope.referenceColumnList.splice(index, 1);
    };

    $scope.save = function() {
        $scope.addStepNoPreviewAndRefresh("ColumnReorder", {
            appliesTo : "SINGLE_COLUMN",
            columns: [$scope.columnName],
            referenceColumn: $scope.referenceColumn,
            reorderAction: $scope.reorderAction.name
        });
        $scope.mergeLastColumnReorders();
        $scope.dismiss();
    };

    $scope.reorderActions = [
        { name: "AT_START", label: "at beginning", needReferenceColumn: false },
        { name: "AT_END", label: "at end", needReferenceColumn: false },
        { name: "BEFORE_COLUMN", label: "before", needReferenceColumn: true },
        { name: "AFTER_COLUMN", label: "after", needReferenceColumn: true }
    ];

    $scope.reorderAction = $scope.reorderActions[0];
    $scope.referenceColumnList = $scope.tableModel.allColumnNames.slice();
});

app.controller('FillEmptyWithValueController', function($scope, DataikuAPI, MonoFuture, $stateParams) {
    var monoFuture = MonoFuture($scope);
    function analysis(callback) {
        monoFuture.exec(
            DataikuAPI.shakers.multiColumnAnalysis(
                $stateParams.projectKey,
                $scope.inputDatasetProjectKey, $scope.inputDatasetName, $scope.inputStreamingEndpointId, $scope.shakerHooks.shakerForQuery(),
                $scope.requestedSampleId, $scope.columns, $scope.source)
        ).success(function(data) {
            if (data.hasResult) {
                callback(data.result);
            }
        }).error(setErrorInScope.bind($scope));
    }
    $scope.source = 'constant';
    $scope.isNumericOnly = false;
    $scope.setColumns = function(cols) {
        $scope.columns = cols;
        $scope.columnName = cols.length === 1 ? cols[0] : null;
    }
    $scope.save = function() {
        var fn = $scope.columns.length === 1 ? 'addStep' : 'addStepNoPreview';
        if ($scope.source === 'constant') {
            if ($scope.columns.length == 1) {
                $scope[fn]("FillEmptyWithValue", { appliesTo : "SINGLE_COLUMN", columns: $scope.columns, value: $scope.valueToFill });
            } else {
                $scope[fn]("FillEmptyWithValue", { appliesTo : "COLUMNS", columns: $scope.columns, value: $scope.valueToFill });
            }
            $scope.autoSaveForceRefresh();
            $scope.dismiss();
        } else {
            analysis(function(data) {
                for (var c in data) {
                    $scope[fn]("FillEmptyWithValue", { appliesTo : "SINGLE_COLUMN", columns: [c], value: data[c] });
                }
                $scope.autoSaveForceRefresh();
                $scope.dismiss();
            });
        }
    }
});


app.controller('MassRenameColumnsController', function($scope) {
    var edits = {
        prefix: function(c) { return $scope.prefix ? $scope.prefix + c : c; },
        suffix: function(c) { return $scope.suffix ? c + $scope.suffix : c; },
        regexp: function(c) { return $scope.regexp ?
                c.replace(new RegExp($scope.regexp, 'ig'), $scope.replace) : c; },
        lowercase : function(c){ return c.toLowerCase()},
        uppercase : function(c){ return c.toUpperCase()},
        normalizeSpecialChars : function(c) { return c.toLowerCase().replace( /[^A-Za-z0-9_]/g, "_")}
    };
    $scope.replace = '';
    $scope.setColumns = function(cols) {
        $scope.columns = cols;
        $scope.columnName = cols.length === 1 ? cols[0] : null;
    }
    $scope.edit = 'prefix';
    $scope.save = function() {
        var dirty = false,
            renamings = [];

        $scope.columns.forEach(function(c) {
            var c2 = edits[$scope.edit](c);
            if (c2 && c2 !== c) {
                dirty = true;
                renamings.push({ from : c, to : c2 });
            }
        });
        if (dirty) {
        	$scope.doRenameColumns(renamings);
        }
        $scope.dismiss();
    }
});


app.controller('MultiRangeController', function($scope) {
    $scope.setColumns = function(cols) {
        $scope.columns = cols;
        $scope.columnName = cols.length === 1 ? cols[0] : null;
    }

    $scope.keep = true;
    $scope.save = function() {
        $scope.addStepNoPreview("FilterOnNumericalRange", {
            appliesTo : "COLUMNS",
            columns: $scope.columns,
            min: $scope.min,
            max: $scope.max,
            action : $scope.keep ? "KEEP_ROW" : "REMOVE_ROW"
        });
        $scope.autoSaveForceRefresh();
        $scope.dismiss();
    }
});


app.controller('FindReplaceController', function($scope, NORMALIZATION_MODES) {
    $scope.$watch("step.params.matching", function(nv, ov) {
        if (nv && nv == 'FULL_STRING') {
            $scope.normalizationModes = NORMALIZATION_MODES;
        } else if (nv) {
            $scope.normalizationModes = NORMALIZATION_MODES.filter(function(mode) { return mode[0] !== 'NORMALIZED'; });
            if ($scope.step.params.normalization == "NORMALIZED") {
                $scope.step.params.normalization = "EXACT";
            }
        }
    })
});


app.controller('MeaningTranslateController', function($scope) {
    $scope.meanings = $scope.appConfig.meanings.categories
        .filter(function(cat) { return cat.label === "User-defined"; })[0]
        .meanings.filter(function(meaning) { return meaning.type === 'VALUES_MAPPING'; });
});


app.controller('CurrencySplitterController', function($scope) {
    $scope.$watch("step.params.inCol", function(nv, ov) {
        if (angular.isDefined(nv) && nv.length > 0 && $scope.step.isNew) {
          $scope.step.params.outColCurrencyCode = $scope.step.params.inCol + "_currency_code";
          $scope.step.params.outColAmount = $scope.step.params.inCol + "_amount";
        }
    }, true);

    /* TODO: This should rather be done by a "default values" section ... */
});


app.controller('ColumnSplitterController', function($scope) {
    $scope.$watch("step.params.inCol", function(nv, ov) {
        if (angular.isDefined(nv) && nv.length > 0 && $scope.step.isNew) {
            $scope.step.params.outColPrefix = $scope.step.params.inCol + "_";
        }
    }, true);

    /* TODO: This should rather be done by a "default values" section ... */
    $scope.$watch("step.params.limitOutput", function(nv, ov) {
        if ($scope.step.params.limitOutput && !$scope.step.params.limit) {
            $scope.step.params.limit = 1;
            $scope.step.params.startFrom = "beginning";
        }
    }, true);
});


app.controller('CurrencyConverterController', function($scope, DataikuAPI) {

    $scope.currencies = [
        ["AUD", "AUD"],
        ["BGN", "BGN"],
        ["BRL", "BRL"],
        ["CAD", "CAD"],
        ["CHF", "CHF"],
        ["CNY", "CNY"],
        ["CYP", "CYP"],
        ["CZK", "CZK"],
        ["DKK", "DKK"],
        ["EEK", "EEK"],
        ["EUR", "EUR"],
        ["GBP", "GBP"],
        ["HKD", "HKD"],
        ["HRK", "HRK"],
        ["HUF", "HUF"],
        ["IDR", "IDR"],
        ["INR", "INR"],
        ["ISK", "ISK"],
        ["JPY", "JPY"],
        ["KRW", "KRW"],
        ["LTL", "LTL"],
        ["LVL", "LVL"],
        ["MTL", "MTL"],
        ["MXN", "MXN"],
        ["MYR", "MYR"],
        ["NOK", "NOK"],
        ["NZD", "NZD"],
        ["PHP", "PHP"],
        ["PLN", "PLN"],
        ["ROL", "ROL"],
        ["RON", "RON"],
        ["RUB", "RUB"],
        ["SEK", "SEK"],
        ["SGD", "SGD"],
        ["SIT", "SIT"],
        ["SKK", "SKK"],
        ["THB", "THB"],
        ["TRL", "TRL"],
        ["TRY", "TRY"],
        ["USD", "USD"],
        ["ZAR", "ZAR"]
    ];

    $scope.dateInputs = [];
    DataikuAPI.shakers.getLastKnownCurrencyRateDate().success(function(data) {
        $scope.dateInputs = buildDateInputsList(data);
    }).error(function() {
        $scope.dateInputs = buildDateInputsList("unknown date");
    });

    function buildDateInputsList(lastKnownRateDate) {
        return [
            ["LATEST", "Last known rates (" + lastKnownRateDate + ")"],
            ["COLUMN", "From Column (Date)"],
            ["CUSTOM", "Custom input"]
        ];
    }

    function isColumnValid(col, meaning) {
        if(!$scope.table) return true;
        return $scope.table.headers.some(function(h) { return h.name === col && h.selectedType.name === meaning; });
    }

    $scope.$watch('step.params.inputColumn', function(nv, ov) {
        if (angular.isDefined(nv) && nv.length > 0 && $scope.step.isNew) {
            $scope.step.params.outputColumn = $scope.step.params.inputColumn + "_";
        }
    });

    $scope.$watch("step.params.refDateColumn", function(nv, ov) {
        $scope.dateColumnIsValid = isColumnValid(nv, "Date");
        if (nv != ov)
            $scope.processorForm.dateReferenceColumn.$setValidity('columnTypeInvalid', $scope.dateColumnIsValid);
    });

    $scope.$watch("step.params.refCurrencyColumn", function(nv, ov) {
        $scope.currencyColumnIsValid = isColumnValid(nv, "CurrencyMeaning");
        if (nv != ov)
            $scope.processorForm.currencyReferenceColumn.$setValidity('columnTypeInvalid', $scope.currencyColumnIsValid);
    });

    $scope.$watch("step.params.refDateCustom", function(nv, ov) {
        if (nv != ov) {
            var minDate = new Date("1999-01-04");
            /*
             * Date() constructor accepts yyyy or yyyy-MM or yyyy-MM-dd
             * We want to restrict user's entry to yyyy-MM-dd which explains
             * the Regex, checking XXXX-XX-XX, with X any number.
             * Date() constructor will check if it's a valid date
             * If it's not, then "date" will be false
             */
            var dateFormat = new RegExp("^[0-9]{4}(-[0-9]{2}){2}$").test(nv);
            var date = new Date(nv);
            $scope.processorForm.dateReferenceCustom.$setValidity('Date type invalid', dateFormat && date && date > minDate);
            $scope.outOfDateReference = (dateFormat && date && date < minDate);
        }
    });
});


app.controller('RegexpExtractorController', function($scope, $q, CreateModalFromTemplate) {
    $scope.validColumn = function() {
        return $scope.step.$stepState.change && $scope.step.$stepState.change.columnsBeforeStep.indexOf($scope.step.params.column) !== -1;
    };
    $scope.openSmartRegexBuilder = function() {
        let deferred = $q.defer();
        CreateModalFromTemplate("/templates/shaker/regexbuilder-box.html", $scope, "RegexBuilderController",
            function(newScope) {
                newScope.$apply(function() {
                    newScope.deferred = deferred;
                    newScope.columnName = $scope.step.params.column;
                    newScope.editStep = $scope.step;
                    newScope.calledFrom = "shaker_recipe-regexpextractor";
                    newScope.customPattern = newScope.createCustomPattern($scope.step.params.pattern);
                    newScope.computePatterns(false);
                });
                deferred.promise.then(function(newPattern) {
                    $scope.step.params.pattern = newPattern.regex;
                    $scope.step.params.extractAllOccurrences = newPattern.hasMultiOccurrences;
                    $scope.checkAndRefresh();
                });
            },
            "sd-modal");
    };
});

app.controller('MultiColumnByPrefixFoldController', function($scope, $q, CreateModalFromTemplate) {
    $scope.openSmartRegexBuilder = function() {
        var deferred = $q.defer();
        CreateModalFromTemplate("/templates/shaker/regexbuilder-box.html", $scope, "RegexBuilderController",
            function(newScope) {
                newScope.deferred = deferred;
                newScope.$apply(function() {
                    newScope.onColumnNames = true;
                    newScope.editStep = $scope.step;
                    newScope.calledFrom = "shaker_recipe-multi_column_by_prefix_fold";
                    newScope.customPattern = newScope.createCustomPattern($scope.step.params.columnNamePattern);
                    newScope.computePatterns(false);
                });
                deferred.promise.then(function(newPattern) {
                    let columnNamePattern = newPattern.regex;
                    if (!columnNamePattern.startsWith('.*?')) {
                        columnNamePattern = ".*?" + columnNamePattern;
                    }
                    if (!columnNamePattern.endsWith('.*')) {
                        columnNamePattern = columnNamePattern + ".*";
                    }
                    $scope.step.params.columnNamePattern = columnNamePattern;
                    $scope.checkAndRefresh();
                });
            },
            "sd-modal");
    };
});


app.controller('PythonUDFController', function(
       $scope, $timeout, $rootScope, $q, $stateParams,
       CreateModalFromTemplate, CreateCustomElementFromTemplate, DataikuAPI, ShakerPopupRegistry, CodeMirrorSettingService) {

    var pythonSourceCodes = {

"CELL_true": "\
# Modify the process function to fit your needs\n\
import pandas as pd\n\
def process(rows):\n\
    # In 'cell' mode, the process function must return\n\
    # a single Pandas Series for each block of rows,\n\
    # which will be affected to a new column.\n\
    # The 'rows' argument is a dictionary of columns in the\n\
    # block of rows, with values in the dictionary being\n\
    # Pandas Series, which additionally holds an 'index'\n\
    # field.\n\
    return pd.Series(len(rows), index=rows.index)\n"
,
"ROW_true": "\
# Modify the process function to fit your needs\n\
import pandas as pd\n\
def process(rows):\n\
    # In 'row' mode, the process function \n\
    # must return the full rows.\n\
    # The 'rows' argument is a dictionary of columns in the\n\
    # block of rows, with values in the dictionary being\n\
    # Pandas Series, which additionally holds an 'index'\n\
    # field.\n\
    # You may modify the 'rows' in place to\n\
    # keep the previous values of the row.\n\
    # Here, we simply add two new columns.\n\
    rows[\"rowLength\"] = pd.Series(len(rows), index=rows.index)\n\
    rows[\"static_value\"] = pd.Series(42, index=rows.index)\n\
    return rows\n"
,
"MULTI_ROWS_true": "\
# Modify the process function to fit your needs\n\
import numpy as np, pandas as pd\n\
def process(rows):\n\
    # In 'multi rows' mode, the process function\n\
    # must return an indexed dictionary of vectors,\n\
    # either built by modifying the 'rows' \n\
    # parameter, or by returning a pandas DataFrame.\n\
    # To get an input dataframe, use\n\
    # rows.get_dataframe([col_name1, ...])\n\
    input_index = rows.index\n\
    # the values in the output index indicate which\n\
    # row of the input is used as base for the \n\
    # output rows. -1 signals that the new row comes\n\
    # from a blank base\n\
    new_index = np.concatenate([input_index, -1 * np.ones(input_index.shape[0])])\n\
    rows.index = new_index\n\
    # input columns are passed as pandas Series\n\
    existing_column_name = rows.columns[0]\n\
    existing_column = rows[existing_column_name]\n\
    rows[existing_column_name] = pd.concat([existing_column, existing_column])\n\
    # new columns can be numpy arrays\n\
    rows[\"static_value\"] = 42 * np.ones(2 * input_index.shape[0])\n\
    # the index field of the 'rows' parameter\n\
    # is a numpy array\n\
    rows[\"index\"] = np.concatenate([input_index, input_index])\n\
    return rows"
,
"CELL_false": "\
# Modify the process function to fit your needs\n\
def process(row):\n\
    # In 'cell' mode, the process function must return\n\
    # a single cell value for each row,\n\
    # which will be affected to a new column.\n\
    # The 'row' argument is a dictionary of columns of the row\n\
    return len(row)\n"
,
"ROW_false": "\
# Modify the process function to fit your needs\n\
def process(row):\n\
    # In 'row' mode, the process function \n\
    # must return the full row.\n\
    # The 'row' argument is a dictionary of columns of the row\n\
    # You may modify the 'row' in place to\n\
    # keep the previous values of the row.\n\
    # Here, we simply add two new columns.\n\
    row[\"rowLength\"] = len(row)\n\
    row[\"static_value\"] = 42\n\
    return row\n"
,
"MULTI_ROWS_false": "\
# Modify the process function to fit your needs\n\
def process(row):\n\
    # In 'multi rows' mode, the process function\n\
    # must return an iterable list of rows.\n\
    ret = []\n\
    # Here we append a new row with only one column\n\
    newrow1 = { \"previous_row_length\" : len(row) }\n\
    ret.append(newrow1)\n\
    # We can also modify the original row and reappend it\n\
    row[\"i\"] = 3\n\
    ret.append(row)\n\
    \n\
    return ret"
}

    $scope.editorOptions = CodeMirrorSettingService.get('text/x-python', {onLoad: function(cm) {$scope.codeMirror = cm}});

    $scope.$watch("[step.params.mode,step.params.vectorize, step.params.useKernel]", function(nv, ov) {
        if (!nv) return;
        // put defaults if they're not here already
        if ($scope.step.params.vectorize == null) {
            $scope.step.params.vectorize = false;
        }
        if ($scope.step.params.vectorSize == null) {
            $scope.step.params.vectorSize = 256;
        }
        const oldVectorized = ov[1] && ov[2];
        const newVectorized = nv[1] && nv[2];
        const oldDefaultPythonSourceCode = pythonSourceCodes[ov[0] + '_' + oldVectorized];
        const newDefaultPythonSourceCode = pythonSourceCodes[nv[0] + '_' + newVectorized];

        let oldPythonSource = $scope.step.params.pythonSourceCode;

        /* If we have already some code but it was the example code of the previous mode,
        then override it */
        if (oldPythonSource == oldDefaultPythonSourceCode) {
            oldPythonSource = null;
        }

        if ( (!oldPythonSource) || oldPythonSource.trim().length == 0) {
            $scope.step.params.pythonSourceCode = newDefaultPythonSourceCode;
        }
    }, true);

    $scope.parentDismiss = function() {
    	$rootScope.$broadcast("dismissModalInternal_");
    	$scope.modalShown = false;
    }
    $scope.$on("dismissModals", $scope.parentDismiss);

    $scope.hooks= {
            ok : function(){
                throw Error("not implemented");
            },
		    apply : function(){
		        throw Error("not implemented");
		    }
        };

    $scope.editPythonSource = function() {
        if ($scope.modalShown) {
            $scope.parentDismiss();
        } else {
            ShakerPopupRegistry.dismissAllAndRegister($scope.parentDismiss);
            $scope.modalShown = true;
            CreateCustomElementFromTemplate("/templates/shaker/pythonedit-box.html", $scope, null, function(newScope) {
                var pythonSource = $scope.step.params.pythonSourceCode;
                var mode = $scope.step.params.mode;
                var vectorize = $scope.step.params.vectorize;
                newScope.modified = false;
                if ( (!pythonSource) || pythonSource.trim().length == 0) {
                    newScope.pythonSource = pythonSourceCodes[mode + '_' + vectorize];
                    newScope.modified = true;
                }
                else {
                    newScope.pythonSource = $scope.step.params.pythonSourceCode;
                }

                $scope.hooks.apply = function() {
                	if ( newScope.modified ) {
                		$scope.step.params.pythonSourceCode = newScope.pythonSource;
                		$scope.checkAndRefresh();
                	}
                };
                $scope.hooks.ok = function() {
                	$scope.hooks.apply();
                	$scope.parentDismiss();
                };

                newScope.checkSyntax = function(pythonCode) {
                	var stepPosition = $scope.findStepId($scope.step);
                	DataikuAPI.shakers.validateUdf($stateParams.projectKey, $scope.inputDatasetProjectKey, $scope.inputDatasetName, $scope.shakerHooks.shakerForQuery()
                			, $scope.requestedSampleId, pythonCode, stepPosition.id, stepPosition.subId || 0, stepPosition.depth).success(function(data) {
                				newScope.validationError = data;
                			}).error(setErrorInScope.bind($scope));
                };

                $scope.uiState = { codeSamplesSelectorVisible: false };
                var insertCode = function (codeToInsert) {
                 	//timeout to make sure of an angular safe apply
                  	$timeout(function() {
                   		$scope.codeMirror.replaceSelection(codeToInsert + '\n\n', "around");
                   	});
                   	$scope.codeMirror.focus();
                };
                $scope.insertCodeSnippet = function(snippet) {
                    insertCode(snippet.code);
                };
            } , $scope.customFormulaEdition.displayCustomFormula);
        }
    };
});

/**
 * Formula function hinter directive
 *  @param {string}     name        - Name of the function
 *  @param {boolean}    applied     - Is function applied to column
 *  @param {string}     arguments   - Argument list as string, separated by ","
 *  @param {string}     description - Function description
 *  @param {number}     left        - Absolute CSS position left
 *  @param {number}     top         - Absolute CSS position top
 *  @param {number}     cursor      - Cursor position in the current line
 *  @param {string}     line        - Line of code user actually typing into
 *  @param {number}     start       - Position of the function token in the code line
 */
app.directive('formulaFunctionHinter', function($compile) {
    return {
        template: ``,
        restrict :'E',
        scope : {
            name: "<",
            applied: "<",
            arguments: "<",
            description: "<",
            examples: "<",
            left: "<",
            top: "<",
            cursor: '<',
            line: '<',
            start: '<'
        },
        link: function($scope) {

            const removeAnchor = () => {
                const prevAnchor = document.getElementById('formula-function-hinter');
                if(prevAnchor) {
                    prevAnchor.parentNode.removeChild(prevAnchor);
                }
            }

            removeAnchor();
            $scope.$on('$destroy', removeAnchor);

            const formatExamples = function(name, examples) {
                if (!examples) {
                    return "";
                } 
                return examples.map((example) =>
                        `<div class="formula-tooltip__example">
                            <code>${name}(${example.args.join(", ")})</code> returns <code>${example.result}</code>
                        </div>`).join("");
            }

            // Element need to be placed at root level to avoid overflowing issue due to editor container
            $scope.htmlExamples = formatExamples($scope.name, $scope.examples);
            const body = angular.element(document.body);
            const anchor = angular.element(`
                <div class="formula-tooltip" id="formula-function-hinter" ng-style="getStyle()">
                    <strong>{{name}}</strong>(<span ng-bind-html="argsString"></span>)
                    <p class="formula-tooltip__description" ng-bind-html="description"></p>
                    <span ng-bind-html="htmlExamples"></span>
                </div>
            `);
            body.append(anchor);
            $compile(anchor)($scope);
            
            $scope.getStyle = () => ({
                top: $scope.top + 'px',
                left: $scope.left + 'px'
            });

            const getCurrentArgumentIndex = () => {
                let part = $scope.line.substr($scope.start);
                let pos = 0;
                let parentheses = 0;
                let brackets = 0;
                let quotes = 0;
                let sglQuotes = 0;
                let index = 0;
                while(pos + $scope.start < $scope.cursor) {
                    const char = part.substr(pos, 1);
                    if(char === '\\') {
                        // Escaping character, so we should also skip next one
                        pos += 2;
                        continue;
                    }
                    
                    if(char === ',' && parentheses === 0 && brackets === 0 && sglQuotes % 2 === 0 && quotes % 2 === 0) {
                        // We are not between parentheses or quotes, we can increment the count
                        index ++;
                    } else if(char === '(') {
                        parentheses ++;
                    } else if(char === ')') {
                        parentheses --;
                    } else if(char === '[') {
                        brackets ++;
                    } else if(char === ']') {
                        brackets --;
                    } else if(char === '"' && sglQuotes % 2 === 0) {
                        quotes ++;
                    } else if(char === "'" && quotes % 2 === 0) {
                        sglQuotes --;
                    }
                    pos ++;
                }
                return index;
            };

            $scope.argsString = '';

            $scope.$watch('[arguments,cursor,line,start]', () => {
                const index = getCurrentArgumentIndex();
                $scope.argsString = $scope.arguments.split(', ')
                    .filter((_, id) => id > 0 || !$scope.applied)
                    .map((arg, id) => id === index ? `<strong>${arg}</strong>` : arg)
                    .join(', ');
            });

            $scope.$watch('examples', nv => {
                $scope.htmlExamples = formatExamples($scope.name, nv);
            })
        }       
    };
});

/**
 * Grel formula editor
 *  @param {string}     expression          - Current formula expression
 *  @param {array}      columns             - Array of column objects, formatted as { name: string, type: string, meaning?: string, comment?: string }
 *  @param {object}     scope variables     - If set, this will replace the variables coming from API. Must be a key-value pair dictionnary.
 *  @param {function}   validator           - Function validating the expression
 *  @param {function}   onValidate          - Event fired after complete validation
 *  @param {function}   onExpressionChange  - Event fired when expression changes
 */
app.directive('grelEditor', function($timeout, $stateParams, DataikuAPI, CachedAPICalls, Debounce) {
    return {
        template: `<div class="editor-tooltip-anchor h100" on-smart-change="validateGRELExpression()">
                        <formula-function-hinter
                            ng-if="tooltip.shown"
                            description="tooltip.description"
                            applied="tooltip.applied"
                            left="tooltip.left"
                            top="tooltip.top"
                            arguments="tooltip.arguments"
                            name="tooltip.name"
                            examples="tooltip.examples"
                            line="tooltip.line"
                            cursor="tooltip.cursor"
                            start="tooltip.tokenStart" />
                        <textarea class="h100"></textarea>
                    </div>`,
        restrict :'E',
        replace: true,
        scope : {
            expression: "=",
            columns: "<",
            scopeVariables: "=?",
            validator: "<",
            onValidate: "<",
            onExpressionChange: "<"
        },
        link: function($scope, element) {

            $scope.tooltip = {
                shown: false,
                applied: false,
                left: 0,
                top: 0,
                arguments: '',
                description: '',
                examples: '',
                name: '',
                line: '',
                cursor: 0,
                tokenStart: 0
            }

            $scope.$watch('scopeVariables', () => {
                if($scope.scopeVariables && Object.keys($scope.scopeVariables).length > 0) {
                    const newVars = {};
                    Object.keys($scope.scopeVariables).forEach(key => {
                        newVars[`variables["${key}"]`] = { value: $scope.scopeVariables[key] };
                        newVars[`\${${key}}`] = { value: $scope.scopeVariables[key] };
                    });
                    $scope.variables = newVars;
                }
            });

            $scope.variables = [];
            DataikuAPI.admin.getGlobalVariables().success(data => {
                const newVars = {};
                Object.keys(data).forEach(key => {
                    newVars[`variables["${key}"]`] = { type: 'global', value: data[key] };
                    newVars[`\${${key}}`] = { type: 'global', value: data[key] };
                });
                $scope.variables = {
                    ...newVars,
                    ...$scope.variables,
                };
            });
            DataikuAPI.projects.variables.get($stateParams.projectKey).success((data) => {
                const newVars = {};
                Object.keys(data.local).forEach(key => {
                    newVars[`variables["${key}"]`] = { type: 'local', value: data.local[key] };
                    newVars[`\${${key}}`] = { type: 'local', value: data.local[key] };
                });
                Object.keys(data.standard).forEach(key => {
                    newVars[`variables["${key}"]`] = { type: 'standard', value: data.standard[key] };
                    newVars[`\${${key}}`] = { type: 'standard', value: data.standard[key] };
                });
                $scope.variables = {
                    ...newVars,
                    ...$scope.variables,
                };
            });

            let helpers = [];
            CachedAPICalls.customFormulasReference.success(data => helpers = data);

            const columnTypeMapping = {
                string: ['String', 'icon-dku-string', 'cm-string'],
                int: ['Integer', 'icon-dku-hexa_view', 'cm-number'],
                double: ['Double', 'icon-dku-hexa_view', 'cm-number'],
                float: ['Float', 'icon-dku-hexa_view', 'cm-number'],
                tinyint: ['Tiny int (8 bits)', 'icon-dku-hexa_view', 'cm-number'],
                smallint: ['Small int (16 bits)', 'icon-dku-hexa_view', 'cm-number'],
                bigint: ['Long int (64 bits)', 'icon-dku-hexa_view', 'cm-number'],
                boolean: ['Boolean', 'icon-dku-true-false', 'cm-bool'],
                date: ['Date', 'icon-calendar', 'cm-date'],
                geopoint: ['Geo Point', 'icon-dku-globe', 'cm-date'],
                geometry: ['Geometry/Geography', 'icon-dku-globe', 'cm-date'],
                array: ['Array', 'icon-dku-array', 'cm-date'],
                object: ['Complex object', 'icon-dku-object', 'cm-date'],
                map: ['Map', 'icon-dku-map', 'cm-date'],
                unspecified: ['', 'icon-dku-column', 'cm-table']
            };

            const getColumnNames = () => {
                return $scope.columns.map(c => c.name || c);
            };

            const helperScrollHandler = (e) => {
                const elems = document.getElementsByClassName('helper-display');
                for(let i = 0; i < elems.length; i++) {
                    elems[i].style.top = e.target.scrollTop + 'px';
                }
            };
        
            const hintRenderer = (hint, value, index) => {
                return (elt) => {
                    if(!hint || hint === '') {
                        return;
                    }

                    let icon = 'icon-dku-function cm-function';
        
                    const helperElement = document.createElement('div');
                    helperElement.className = 'helper-display';
    

                    const helper = helpers.find(h => h.name === hint);
                    const helperFooter = '<div class="helper-tip">Hit tab to complete<div style="float: right;">Hit esc to hide</div></div>';
                    if(helper) {
                        let htmlTitle = `<div class="helper-title"><strong>${helper.name}(${helper.params}) ${helper.returns || ''}</strong></div>`
                        let htmlDescription = `<div class="helper-description"><p>${helper.description}</p>`;
                        if (helper.examples) {
                            htmlDescription += helper.examples.map((example) =>
                                `<div class="helper-example">
                                        <code>${helper.name}(${example.args.join(", ")})</code> returns <code>${example.result}</code>
                                    </div>`).join("");
                        }
                        htmlDescription += "</div>";
                        helperElement.innerHTML = htmlTitle + htmlDescription + helperFooter;
                    } else if(Object.keys($scope.variables).includes(hint)) {
                        const value = typeof $scope.variables[hint].value === 'object' ?
                                        JSON.stringify($scope.variables[hint].value, null, 2) :
                                        $scope.variables[hint].value;
                        helperElement.innerHTML = `<div class="helper-title">`
                                                        + ($scope.variables[hint].type ? `Scope: <strong>${$scope.variables[hint].type}</strong><br />` : '')
                                                        + `Value: <strong>${value}</strong>`
                                                        + `</div>`
                                                        + helperFooter;
                        icon = 'icon-dku-variable cm-variable';
                    } else if(getColumnNames().includes(hint)) {
                        const col = $scope.columns.find(c => c.name === hint || c === hint);
                        const ref = columnTypeMapping[col && col.type ? col.type : 'unspecified'] || ['icon-dku-string', 'cm-default'];
                        if(col) {
                            helperElement.innerHTML = `<div class="helper-title">`
                                                        + (ref[0] ? `Type: <strong>${ref[0]}</strong>` : '')
                                                        + (col.meaning ? `<br />Meaning: <strong>${col.meaning}</strong>` : '')
                                                        + (col.comment ? `<p>${col.comment}</p>` : '<p class="text-weak">No description provided.</p>')
                                                        + `</div>`
                                                        + helperFooter;
                        }
                        icon = `${ref[1]} ${ref[2]}`;
                    }
        
                    elt.innerHTML = `<i class="${icon}"></i>&nbsp;<strong>${hint.substr(0, value.length)}</strong>${hint.substr(value.length)}`;
                    elt.appendChild(helperElement);
        
                    if(index === 0) {
                        elt.parentElement.id = "qa_formula_auto_complete";
                        elt.parentElement.removeEventListener('scroll', helperScrollHandler);
                        elt.parentElement.addEventListener('scroll', helperScrollHandler);
                    }
                }
            }
        
            const autoCompleteHandler = (hint) => {
                const isColumn = getColumnNames().includes(hint.text);
                const isFunction = !isColumn && !Object.keys($scope.variables).includes(hint.text);
                
                // When column has a complex name, the autocompletion should be wrapped inside val('')
                if (isColumn && !hint.text.match(/^[a-z0-9_]+$/i)) {
                    const doc = $scope.cm.getDoc();
                    const cursor = doc.getCursor();
                    const leftPart = cm.getLine(cursor.line).substr(0, cursor.ch - hint.text.length);
                    if(leftPart.endsWith('val(')) {
                        doc.setSelection({line: cursor.line, ch: cursor.ch - hint.text.length});
                        doc.replaceSelection('"');
                        doc.setSelection({line: cursor.line, ch: cursor.ch + 1 });
                        doc.replaceSelection('"');
                    } else if(leftPart.endsWith('val("') || leftPart.endsWith('val(\'')) {
                        doc.setSelection({line: cursor.line, ch: cursor.ch - hint.text.length});
                        doc.setSelection({line: cursor.line, ch: cursor.ch });
                    } else {
                        doc.setSelection({line: cursor.line, ch: cursor.ch - hint.text.length});
                        doc.replaceSelection('val("');
                        doc.setSelection({line: cursor.line, ch: cursor.ch + 5 });
                        doc.replaceSelection('")');
                    }
                }
                else if(isFunction) {
                    const doc = $scope.cm.getDoc();
                    const cursor = doc.getCursor();
                    const line = cm.getLine(cursor.line);
                    if (line.length < cursor.ch || line[cursor.ch] !== '(') {
                        doc.setSelection({ line: cursor.line, ch: cursor.ch });
                        doc.replaceSelection('()');
                    }
                    cursor.ch = cursor.ch + 1;
                    doc.setCursor(cursor);
                } else if (!isColumn && !isFunction && hint.text.endsWith('}')) {
                    const doc = $scope.cm.getDoc();
                    const cursor = doc.getCursor();
                    const nextChar = cm.getLine(cursor.line).substr(cursor.ch, 1);
                    if(nextChar === '}') {
                        doc.replaceRange('', { ...cursor }, { line: cursor.line, ch: cursor.ch + 1 });
                    }
                }

                $scope.validateGRELExpression();
            }

            const getLineQuoteState = (line, pos) => {
                let quoteOpened = false;
                let doubleQuoteOpened = false;
                for(let i = 0; i < pos - 1; i++) {
                    if(line[i] == "\\") {
                        i ++;
                    } else if(line[i] === "'" && !doubleQuoteOpened) {
                        quoteOpened = !quoteOpened;
                    } else if(line[i] === '"' && !quoteOpened) {
                        doubleQuoteOpened = !doubleQuoteOpened;
                    }
                }
                return { quoteOpened, doubleQuoteOpened };
            }

            const autoClosingPairs = {'(': ')', '"': '"', "'": "'", '[': ']', '{': '}'};
            const autoCloseCharacter = (cm, key, event) => {
                const doc = cm.getDoc();
                const cursor = doc.getCursor();
                const line = cm.getLine(cursor.line);
                const nextChar = line[cursor.ch];
                const selection = doc.getSelection();
        
                if(nextChar === key) {
                    doc.replaceRange('', { ...cursor }, { line: cursor.line, ch: cursor.ch + 1 });
                    return;
                }

                if(selection.length === 0 && (key === '"' || key === "'") && ![undefined, ']', ')', '}'].includes(nextChar)) {
                    return;
                }

                // Check if we are not currently inside a string definition
                const quoteStatus = getLineQuoteState(line, cursor.ch);
                if(!quoteStatus.doubleQuoteOpened && !quoteStatus.quoteOpened) {
                    if(selection.length > 0) {
                        const endCursor = doc.getCursor(false);
                        doc.replaceSelection(key + selection + autoClosingPairs[key]);
                        doc.setCursor({...endCursor, ch: endCursor.ch + 2});
                    } else {
                        doc.replaceSelection(key + autoClosingPairs[key]);
                        doc.setCursor({...cursor, ch: cursor.ch + 1});
                    }
                    event.preventDefault();
                    event.stopPropagation();
                }
            }
        
            const autoCloseCharacterRemover = (cm) => {
                const doc = cm.getDoc();
                const cursor = doc.getCursor();
                const line = cm.getLine(cursor.line);
                const deletedChar = line[cursor.ch -1];
                const nextChar = line[cursor.ch];
        
                // Check if we are not currently inside a string definition
                const quoteStatus = getLineQuoteState(line, cursor.ch);
                if(quoteStatus.doubleQuoteOpened || quoteStatus.quoteOpened) {
                    return;
                }
        
                if(autoClosingPairs[deletedChar] && autoClosingPairs[deletedChar] === nextChar) {
                    doc.replaceRange('', { ...cursor }, { line: cursor.line, ch: cursor.ch + 1 });
                }
            }

            const getTokenBeforeCursor = (cm) => {
                const cursor = cm.doc.getCursor();
                const tokens = cm.getLineTokens(cursor.line);
                let token = [];
                let parenthese = [];
                let isAppliedToColumn = false;
                for(let i = 0; i < tokens.length; i++) {
                    if(tokens[i].end < cursor.ch + 1) {
                        if(tokens[i].type === 'builtin') {
                            token.push(tokens[i]);
                            if(i > 0 && tokens[i-1].string === '.') {
                                isAppliedToColumn = true;
                            } else {
                                isAppliedToColumn = false;
                            }
                        } else if(tokens[i].string === '(') {
                            parenthese.push(tokens[i].end);
                        } else if(tokens[i].string === ')') {
                            token.pop();
                            parenthese.pop();
                        }
                    }
                }
                if(token.length > 0 && parenthese.length > token.length - 1) {
                    $scope.tooltip.tokenStart = parenthese[token.length - 1];
                    return {...token[token.length - 1], isAppliedToColumn };
                }
                return  null;
            };

            const editorOptions = {
                value: $scope.expression || "",
                mode:'text/grel',
                theme:'elegant',
                variables: getColumnNames,
                lineNumbers : false,
                lineWrapping : true,
                autofocus: true,
                hintOptions: {
                    hint: (editor) => {
                        const grelWordHints = CodeMirror.hint.grel($scope.cm, { columns: getColumnNames, variables: Object.keys($scope.variables), completeSingle: false });
                        const words = grelWordHints.list;

                        let cursor = editor.getCursor();
                        let curLine = editor.getLine(cursor.line);
                        let start = cursor.ch;
                        let end = start;
                        while (end < curLine.length && /[\w$]/.test(curLine.charAt(end))) ++end;
                        while (start && (/[\w\.$]/.test(curLine.charAt(start - 1)) || curLine.charAt(start - 1) == '{')) --start;
        
                        let curWord = start !== end ? curLine.slice(start, end) : '';
                        // The dot should only be considered a token separator when outside of the ${...} variable syntax
                        const firstDot = curWord.indexOf('.');
                        if(!curWord.startsWith('$') && firstDot > -1) {
                            curWord = curWord.substr(firstDot + 1);
                            start += firstDot + 1;
                        }

                        const list = (!curWord ? words : words.filter(word => {
                            return word.toLowerCase().startsWith(curWord.toLowerCase());
                        }))
                        list.sort((a, b) => {
                            const malusA = Object.keys($scope.variables).includes(a) ? 2 : getColumnNames().includes(a) ? 1 : 0;
                            const malusB = Object.keys($scope.variables).includes(b) ? 2 : getColumnNames().includes(b) ? 1 : 0;
                            if(malusA === malusB)
                                return a - b;
                            return malusA - malusB;
                         });
        
                        const data = {
                            list: list.map((item, index) => ({ text: item, render: hintRenderer(item, curWord, index)})),
                            from: CodeMirror.Pos(cursor.line, start),
                            to: CodeMirror.Pos(cursor.line, end)
                        };
                        CodeMirror.on(data, 'pick', autoCompleteHandler);
                            
                        return data;
                    },
                    completeSingle: false
                }
            };

            const prevCursor = { line: 0, ch: 0 };
            const textarea = element.find('textarea')[0];
            const cm = CodeMirror.fromTextArea(textarea, editorOptions);

            $scope.$watch('expression', (newValue, oldValue) => {
                const cursor = cm.doc.getCursor();
                cm.setValue(newValue || '');
                cm.setCursor(cursor);
            });

            $scope.cm = cm;
            cm.on("keydown", function(cm, evt) {
                if(evt.key === "Backspace") { // Backspace
                    autoCloseCharacterRemover(cm);
                }
                else if(Object.keys(autoClosingPairs).includes(evt.key)) {
                    autoCloseCharacter(cm, evt.key, evt);
                }
            });

            cm.on("keyup", function(cm, evt) {
                /* Ignore tab, esc, and navigation/arrow keys */
                if (evt.key === "Tab" || evt.key === 'Escape' || (evt.keyCode>= 33 && evt.keyCode <= 40)) {
                    if(evt.key === "Tab") {
                        // We force the expression validation on tab, as autocompletion does not trigger smart change
                        $scope.validateGRELExpression();
                    }
                    CodeMirror.signal(cm, "endCompletion", cm);
                }
                else if(evt.key !== "Enter") {
                    CodeMirror.commands.autocomplete(cm, null, {
                        columns: $scope.columns,
                        completeSingle: false
                    });
                }
            });

            cm.on('cursorActivity', () => {
                const parent = cm.getTextArea().closest('.editor-tooltip-anchor');
                if(!parent) {
                    return;
                }

                const coords = cm.cursorCoords();
                $scope.tooltip.left = coords.left;
                $scope.tooltip.top = coords.top + 16;
                $scope.tooltip.shown = false;

                const doc = cm.getDoc();
                const cursor = doc.getCursor();
                const token = getTokenBeforeCursor(cm);
                const leftPart = cm.getLine(cursor.line).substr(0, cursor.ch);
                if(token && !leftPart.endsWith('val("') && !leftPart.endsWith('val(\'')) {
                    const helper = helpers.find(h => h.name === token.string);
                    if(helper) {
                        $scope.tooltip.shown = true;
                        $scope.tooltip.name = helper.name;
                        $scope.tooltip.arguments = helper.params;
                        $scope.tooltip.description = helper.description;
                        $scope.tooltip.examples = helper.examples;
                        $scope.tooltip.line = cm.getLine(cursor.line);
                        $scope.tooltip.cursor = cursor.ch;
                        $scope.tooltip.applied = token.isAppliedToColumn;
                    }
                }

                // We do not want to auto display the autocomplete hinter if the user is just moving to the next line
                // Or if the completion has just ended
                if (cursor.line === prevCursor.line && cm.state.completionActive !== null) {
                    CodeMirror.commands.autocomplete(cm, null, {
                        columns: $scope.columns,
                        completeSingle: false
                    });
                }
                safeApply($scope);

                prevCursor.ch = cursor.ch;
                prevCursor.line = cursor.line;
            });

            const hasTokenOfType = (type) => {
                const lineCount = $scope.cm.lineCount();
                for(let i = 0; i < lineCount; i++) {
                    if($scope.cm.getLineTokens(i).find(t => t.type === type)) {
                        return true;
                    }
                }
                return false;
            };
        
            let errorMarker = null;
            const highlightOffset = (offset) => {
                let current = 0;
                const lineCount = $scope.cm.lineCount();
                for(let i = 0; i < lineCount; i++) {
                    const line = $scope.cm.doc.getLine(i);
                    if(current + line.length > offset) {
                        errorMarker = $scope.cm.doc.markText(
                            { line: i, ch: offset - current },
                            { line: i, ch: offset - current + 1 },
                            { className: 'error-hint', clearOnEnter: true }
                        );
                        return;
                    }
                    current += line.length + 1; // CrLf is counted as 1 offset
                }
            }
        
            $scope.validateGRELExpression = () => {
                const expr = cm.getValue();
                $scope.examples = null;
        
                const hasError = hasTokenOfType('error');
                if(hasError) {
                    if($scope.onValidate) {
                        $scope.onValidate({ valid: false, error: "it has some unknown tokens", data: [] });
                    }
                    return;
                }
        
                if($scope.validator) {
                    $scope.validator(expr).success((data) => {
                        if($scope.onValidate) {
                            $scope.onValidate({ valid: data.ok, error: data.message, data });
                        }
    
                        if(errorMarker != null) {
                            errorMarker.clear();
                        }
            
                        const matches = (data.message || '').match(/at offset (\d+)/i);
                        if(matches != null) {
                            highlightOffset(matches[1])
                        }
                    }).error(setErrorInScope.bind($scope));
                }
            };
            const debouncedValidateGrelExpression = Debounce().withDelay(0, 200).wrap($scope.validateGRELExpression);

            cm.on('change', () => {
                debouncedValidateGrelExpression();
                $scope.expression = cm.getValue();
                if($scope.onExpressionChange) {
                    $scope.onExpressionChange($scope.expression);
                }
            });
        }       
    };
});


app.controller('FormulaAwareProcessorController', function($scope, $stateParams, $rootScope, DataikuAPI,
               CreateCustomElementFromTemplate, ShakerPopupRegistry) {

    $scope.editing = {}
    $scope.columns = [];

    const canGetColumnDetails = () => {
        const stepPosition = $scope.shaker.steps.indexOf($scope.step);

        // If the current step is the last one or if it is in preview mode or if the steps after it are disabled.
        return $scope.shaker && $scope.shaker.steps && $scope.shaker.steps[$scope.shaker.steps.length - 1] === $scope.step 
            || $scope.step.preview === true
            || (!$scope.step.disabled && $scope.shaker.steps.slice(stepPosition + 1).every(step => step.disabled))
    } 

    const computeColumns = () => {
        if (canGetColumnDetails()) {
            $scope.columns = $scope.quickColumns.map(c => ({
                ...(c.recipeSchemaColumn ? c.recipeSchemaColumn.column : {}),
                name: c.name,
                meaning: c.meaningLabel || '',
                comment: c.comment || ''
            }));
        } else {
            $scope.columns = $scope.step.$stepState.change ? $scope.step.$stepState.change.columnsBeforeStep : [];
        }
    }

    const stopWatchingForColumnsCompute = $scope.$watch('[quickColumns, step.preview, shaker.steps]', () => {
        computeColumns();
    });

    $scope.expressionValidator = (expression) => {
    	const stepPosition = $scope.findStepId($scope.step);
        return DataikuAPI.shakers.validateExpression(
            $stateParams.projectKey,
            $scope.inputDatasetProjectKey,
            $scope.inputDatasetName,
            $scope.shakerHooks.shakerForQuery(),
            $scope.requestedSampleId,
            expression,
            "create",
            "__output__",
            stepPosition.id,
            stepPosition.subId || 0,
            stepPosition.depth);
    };

    $scope.fixupFormula = (expression) => {
        const stepPosition = $scope.findStepId($scope.step);
        return DataikuAPI.shakers.fixExpression(
            $stateParams.projectKey,
            $scope.inputDatasetProjectKey,
            $scope.inputDatasetName,
            $scope.shakerHooks.shakerForQuery(),
            $scope.requestedSampleId,
            expression,
            "create",
            "__output__",
            stepPosition.id,
            stepPosition.subId || 0,
            stepPosition.depth).then(data => {
                $scope.editing.expression = data.data
            }, setErrorInScope.bind($scope));
    }

    $scope.onValidate = (result) => {
        $scope.grelExpressionValid = result.valid;
        $scope.grelExpressionError = result.error;
        $scope.grelExpressionData = result.data;

        // If everything is empty, we should not render the preview
        if(result.data.table
            && result.data.table.colNames.length === 1
            && result.data.table.rows.filter(r => r.data[0] !== null).length < 1) {
            $scope.grelExpressionData.table = undefined;
        }
    };

    $scope.parentDismiss = function() {
        $rootScope.$broadcast("dismissModalInternal_");
        $scope.modalShown = false;
    }
    $scope.$on("dismissModals", $scope.parentDismiss);
    $scope.grelExpressionError = false;
    $scope.grelExpressionValid = false;

    $scope._edit = function(expression){
        if ($scope.modalShown) {
            $scope.parentDismiss();
        } else {
            ShakerPopupRegistry.dismissAllAndRegister($scope.parentDismiss);
            $scope.modalShown = true;
            CreateCustomElementFromTemplate("/templates/shaker/formula-editor.html", $scope, null, function(newScope) {
                $scope.editing.expression = expression;
            }, $scope.customFormulaEdition.displayCustomFormula);
        }
    }

    $scope.hooks= {
        ok : function(){
            throw Error("not implemented");
        }
    }

    $scope.$on("$destroy", stopWatchingForColumnsCompute);
});


app.controller('CreateColumnWithGRELController', function($scope, $controller) {
    $controller("FormulaAwareProcessorController", {$scope:$scope});

    if (angular.isUndefined($scope.step.params.column)) {
        $scope.step.params.column = "newcolumn_expression";
    }
    $scope.mode = "create";

    $scope.hooks.ok = function() {
        $scope.step.params.expression = $scope.editing.expression;
        $scope.editing.expression = null;
        $scope.checkAndRefresh();
        $scope.parentDismiss();
    }

    $scope.edit = function(){
        $scope._edit(angular.copy($scope.step.params.expression));
    }

    $scope.storageTypes = [
    	[null, 'None'],
        [{name:'foo', type:'string'}, 'String'],
        [{name:'foo', type:'int'}, 'Integer'],
        [{name:'foo', type:'double'}, 'Double'],
        [{name:'foo', type:'float'}, 'Float'],
        [{name:'foo', type:'tinyint'}, 'Tiny int (8 bits)'],
        [{name:'foo', type:'smallint'}, 'Small int (16 bits)'],
        [{name:'foo', type:'bigint'}, 'Long int (64 bits)'],
        [{name:'foo', type:'boolean'}, 'Boolean'],
        [{name:'foo', type:'date'}, 'Date'],
        [{name:'foo', type:'geopoint'}, "Geo Point"],
        [{name:'foo', type:'geometry'}, "Geometry/Geography"]
    ];

});

app.controller("CustomJythonProcessorController", function($scope, Assert, DataikuAPI, WT1, $stateParams, TopNav, PluginConfigUtils, Logger){
    $scope.loadedDesc = $scope.appConfig.customJythonProcessors.find(x => x.elementType == $scope.step.type);
    Assert.inScope($scope, 'loadedDesc');
    $scope.pluginDesc = $scope.appConfig.loadedPlugins.find(x => x.id == $scope.loadedDesc.ownerPluginId);
    Assert.inScope($scope, 'pluginDesc');

    // Make a copy to play with roles
    $scope.desc = angular.copy($scope.loadedDesc.desc);
    $scope.desc.params.forEach(function(param) {
        if (param.type == "COLUMNS" || param.type == "COLUMN") {
            param.columnRole = "main";
        }
    });

    if (!$scope.step.params) {
        $scope.step.params = {}
    }
    if (!$scope.step.params.customConfig){
        $scope.step.params.customConfig = {}
    }

    var getCurrentColumns = function() {
        // step info are loaded asynchronously
        if ($scope.step.$stepState.change) {
            return $scope.step.$stepState.change.columnsBeforeStep.map(colName => ({name: colName, type: 'STRING'}));
        } else {
            return [];
        }
    }

    $scope.columnsPerInputRole = {
        "main" : []
    };

    $scope.$watch("step", function(nv, ov) {
        if (nv && nv.$stepState) {
            $scope.columnsPerInputRole = {
                main: getCurrentColumns()
            };
        }
    }, true);

    PluginConfigUtils.setDefaultValues($scope.desc.params, $scope.step.params.customConfig);
});


app.controller('FilterOnCustomFormulaController', function($scope, $controller, $stateParams, $rootScope, DataikuAPI, CreateCustomElementFromTemplate, ShakerPopupRegistry) {
    $controller("FormulaAwareProcessorController", {$scope:$scope});

    $scope.hooks.ok = function() {
        $scope.step.params.expression = $scope.editing.expression;
        $scope.editing.expression = null;
        $scope.checkAndRefresh();
        $scope.parentDismiss();
    }

    $scope.edit = function(){
        $scope._edit(angular.copy($scope.step.params.expression));
    }
});


app.controller('ClearOnCustomFormulaController', function($scope, $controller, $stateParams, $rootScope,
               DataikuAPI, CreateCustomElementFromTemplate, ShakerPopupRegistry) {
    $controller("FormulaAwareProcessorController", {$scope:$scope});

    $scope.hooks.ok = function() {
        $scope.step.params.expression = $scope.editing.expression;
        $scope.editing.expression = null;
        $scope.checkAndRefresh();
        $scope.parentDismiss();
    }

    $scope.edit = function(){
        $scope._edit(angular.copy($scope.step.params.expression));
    }
});


app.controller('FlagOnCustomFormulaController', function($scope, $controller, $stateParams, $rootScope,
               DataikuAPI, CreateCustomElementFromTemplate, ShakerPopupRegistry) {
    $controller("FormulaAwareProcessorController", {$scope:$scope});

    $scope.hooks.ok = function() {
        $scope.step.params.expression = $scope.editing.expression;
        $scope.editing.expression = null;
        $scope.checkAndRefresh();
        $scope.parentDismiss();
    }

    $scope.edit = function(){
        $scope._edit(angular.copy($scope.step.params.expression));
    }
});


app.controller('FilterAndFlagProcessorController', function($scope) {
    // don't show the generic input for clearColumn if the processor already declares a parameter called clearColumn
    $scope.showClearColumn = !$scope.processor.params.some(function(param) { return param.name == 'clearColumn'; });

    $scope.onActionChange = function() {
        // if (['FLAG', 'KEEP_ROW'].indexOf($scope.step.params['action']) != -1) {
        //     $scope.step.params.appliesTo = 'SINGLE_COLUMN';
        //     $scope.$parent.$parent.$parent.appliesToDisabled = true;
        // } else {
        //     $scope.$parent.$parent.$parent.appliesToDisabled = false;
        // }

        $scope.checkAndRefresh();
    }

    if ($scope.processor.filterAndFlagMode == "FLAG") {
        $scope.step.params.action = "FLAG";
    }
});


app.controller('AppliesToProcessorController', function($scope) {
    $scope.clearEmptyColumns = function() {
        if ($scope.step.params.columns.length == 1 && $scope.step.params.columns[0] == '') {
            $scope.step.params.columns = [];
        }
    }
});


app.controller('ConfigureSamplingController', function($scope, DataikuAPI, $stateParams, $timeout,
               WT1, CreateModalFromTemplate, SamplingData, DatasetUtils) {
    $scope.getPartitionsList = function() {
        return DataikuAPI.datasets.listPartitionsWithName($scope.inputDatasetProjectKey, $scope.inputDatasetName)
            .error(setErrorInScope.bind($scope))
            .then(function(ret) { return ret.data; })
    };

    $scope.SamplingData = SamplingData;

    $scope.showFilterModal = function() {
        var newScope = $scope.$new();
        if ($scope.inputDatasetName) {
            DataikuAPI.datasets.get($scope.inputDatasetProjectKey, $scope.inputDatasetName, $stateParams.projectKey)
            .success(function(data){
                newScope.dataset = data;
                newScope.schema = data.schema;
                newScope.filter = $scope.shaker.explorationSampling.selection.filter;
                CreateModalFromTemplate('/templates/recipes/fragments/filter-modal.html', newScope);
            }).error(setErrorInScope.bind($scope));
        } else if ($scope.inputStreamingEndpointId) {
            DataikuAPI.streamingEndpoints.get($scope.inputDatasetProjectKey, $scope.inputStreamingEndpointId)
            .success(function(data){
                newScope.dataset = data;
                newScope.schema = data.schema;
                newScope.filter = $scope.shaker.explorationSampling.selection.filter;
                CreateModalFromTemplate('/templates/recipes/fragments/filter-modal.html', newScope);
            }).error(setErrorInScope.bind($scope));
        }
    };

    $scope.datasetIsSQL = function() {
        return $scope.dataset_types && $scope.dataset && $scope.dataset_types[$scope.dataset.type] && $scope.dataset_types[$scope.dataset.type].sql;
    };

    $scope.datasetIsSQLTable = function() {
        return $scope.datasetFullInfo && DatasetUtils.isSQLTable($scope.datasetFullInfo.dataset);
    };

    $scope.datasetSupportsReadOrdering = function() {
        return $scope.datasetFullInfo && DatasetUtils.supportsReadOrdering($scope.datasetFullInfo.dataset);
    };

    $scope.save = function() {
        $scope.shaker.explorationSampling._refreshTrigger++;
        $scope.forgetSample();
        $scope.autoSaveForceRefresh();
    };
});

app.controller('DateRangeShakerController', function($scope, $timeout, DataikuAPI, Debounce) {
    $scope.dateRelativeFilterPartsLabel = 'Year';
    $scope.dateRelativeFilterComputedStart = '-';
    $scope.dateRelativeFilterComputedEnd = '';
    $scope.displayed = { values: [] };
    $scope.valuesCount = 0;
    // Firefox always displays the milliseconds in the time picker, so give more space to the time picker
    $scope.timeInputStyle = { 'width': (navigator.userAgent.includes("Gecko/") ? '144px' : '104px') };

    if($scope.step.params.values) {
        $scope.displayed.values = [...$scope.step.params.values];
    }

    if ($scope.step.params.min) {
        // If date was written as UTC (old format), convert it to the corresponding time zone
        if ($scope.step.params.min.slice(-1).toUpperCase() === "Z") {
            $scope.step.params.min = formatDateToISOLocalDateTime(convertDateToTimezone(new Date($scope.step.params.min), $scope.step.params.timezone_id));
        }
        $scope.displayed.min = new Date($scope.step.params.min);
        $scope.displayed.min.setSeconds($scope.displayed.min.getSeconds(), 0);
    }

    if ($scope.step.params.max) {
        // If date was written as UTC (old format), convert it to the corresponding time zone
        if ($scope.step.params.max.slice(-1).toUpperCase() === "Z") {
            $scope.step.params.max = formatDateToISOLocalDateTime(convertDateToTimezone(new Date($scope.step.params.max), $scope.step.params.timezone_id));
        }
        $scope.displayed.max = new Date($scope.step.params.max);
        $scope.displayed.max.setSeconds($scope.displayed.max.getSeconds(), 0);
    }

    // This is a fix for firefox, not firing blur event if input cleared with cross icon
    $scope.updateBoundariesWithDelay = function(boundary) {
        setTimeout($scope.updateBoundaries, 200, boundary);
    }

    $scope.updateBoundaries = function(boundary) {
        if (boundary === 'min') {
            if ($scope.displayed.min) {
                $scope.step.params.min = formatDateToISOLocalDateTime($scope.displayed.min);
            } else {
                $scope.step.params.min = null;
            }
        } else if (boundary === 'max') {
            if ($scope.displayed.max) {
                $scope.step.params.max = formatDateToISOLocalDateTime($scope.displayed.max);
            } else {
                $scope.step.params.max = null;
            }
        }
        $scope.checkAndRefresh();
    };

    const computeRelativeDateIntervalDebounced = Debounce().withDelay(100,100).withScope($scope).wrap(function() {
        DataikuAPI.shakers.computeRelativeDateInterval({
            part: $scope.step.params.part,
            option: $scope.step.params.option,
            offset: $scope.step.params.option === 'NEXT' ? $scope.step.params.relativeMax : $scope.step.params.relativeMin
        }).success(function(interval) {
            $scope.dateRelativeFilterComputedStart = interval.start;
            $scope.dateRelativeFilterComputedEnd = interval.end;
        }).error(function() {
            $scope.dateRelativeFilterComputedStart = '-';
            $scope.dateRelativeFilterComputedEnd = '-';
        });
    });
    const refreshRelativeIntervalHint = function() {
        if ($scope.step.params.filterType === 'RELATIVE') {
            computeRelativeDateIntervalDebounced();
        }
    }

    $scope.$watchGroup(["step.params.filterType", "step.params.part", "step.params.option"], refreshRelativeIntervalHint);
    $scope.$watch("step.params.relativeMin", () => {
        if ($scope.step.params.option === 'LAST') {
            refreshRelativeIntervalHint();
        }
    });
    $scope.$watch("step.params.relativeMax", () => {
        if ($scope.step.params.option === 'NEXT') {
            refreshRelativeIntervalHint();
        }
    });

    $scope.$watch("displayed.values", function() {
        $scope.step.params.values = [...$scope.displayed.values];
    });

    $scope.$watch("step.params.timezone_id", $scope.updateBoundaries);

    $scope.$watch("step.params.filterType", function(nv) {
        if (nv === "RELATIVE" && $scope.step.params.part === "INDIVIDUAL") {
            $scope.step.params.part = "YEAR";
        }
    });

    $scope.$watch("step.params.part", function(nv) {
        $scope.dateRelativeFilterPartsLabel = {
            YEAR: "Year",
            QUARTER_OF_YEAR: "Quarter",
            MONTH_OF_YEAR: "Month",
            DAY_OF_MONTH: "Day",
            HOUR_OF_DAY: "Hour"
        }[nv];
    });
});

app.controller('UnfoldController', function($scope){

    $scope.overflowActions = [
        ["KEEP", "Keep all columns"],
        ["WARNING", "Add warnings"],
        ["ERROR", "Raise an error"],
        ["CLIP", "Clip further data"],
    ];

    $scope.overflowActionsDesc = [
        ["Will keep all the created columns. Warning, this may create a huge amount of columns and slow the whole computation."],
        ["Will raise warning during the computation but continues to process all the columns. It may create a huge amount of columns and slow the whole computation."],
        ["Will raise an error and make the computation fail as soon as the maximum number of created columns is exceeded."],
        ["Will silently drop the remaining columns when the maximum number of columns is reached."]
    ];

    $scope.modifyOverflowAction = function() {
        if ($scope.step.params.limit === 0) {
            $scope.step.params.overflowAction = "KEEP";
        }
    };

});

}());

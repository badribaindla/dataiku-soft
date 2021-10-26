(function(){
'use strict';


const app = angular.module('dataiku.datasets.directives', ['dataiku.filters', 'colorpicker.module', 'colorContrast']);


    app.directive('simpleTableContent', function(DataikuAPI, $filter) {
        return {
            scope : {
                "table" : "="
            },
            replace : true,
            link : function(scope, element) {
                /* Refresh of the table content itself */
                scope.$watch("table", function(nv, ov) {
                    dispatchCustomTimelineEvent('StartSimpleTableContentUpdate');
                    if (scope.table == null) return;
                    var table = scope.table;
                    var tableData = "";//<tbody>";

                    for (var rowIdx in table.rows) {
                        tableData += "<tr>";
                        for (var cellIdx in table.rows[rowIdx].cells) {
                            var cell = table.rows[rowIdx].cells[cellIdx];
                            tableData += '<td class="cell"';
                            if (!angular.isUndefined(cell.value) && cell.value.length > 40) {
                                tableData +=' title="' + sanitize(cell.value) + '"';
                            }

                            if (cell.validSt == 'E') { // Empty
                                 tableData += '><div class="cell empty">';
                             } else {
                                 tableData += '><div class="cell filled">';
                            }
                            tableData +=  angular.isUndefined(cell.value) ? '&nbsp;' : sanitize(cell.value);
                            tableData += "</div></td>";
                        }
                        tableData += "</tr>";
                    }
                    tableData += "";//</tbody>";
                    $(element).html(tableData);
                    dispatchCustomTimelineEvent('EndSimpleTableContentUpdate');
                });
            }
        };
    });


    app.directive('simpleColumnHeader', function() {
        return {
            restrict: 'E',
            replace: true,
            templateUrl: '/templates/datasets/simple_column_header.html',
            scope: {
                columnIndex : '=',
                column : '=',
                dataset : '='
            },
            link: function(scope, element, attrs){
                if (scope.columnIndex<0) return;

                scope.schema = {};
                scope.$watch("dataset.schema", function(nv, ov) {
                    if (!nv) return;
                    scope.schema = scope.dataset.schema.columns[scope.columnIndex];
                });

                scope.column.selectedType.totalCount = (scope.column.selectedType.nbOK + scope.column.selectedType.nbNOK + scope.column.selectedType.nbEmpty);
                scope.column.okPercentage = scope.column.selectedType.nbOK * 100 / scope.column.selectedType.totalCount;
                scope.column.emptyPercentage = scope.column.selectedType.nbEmpty * 100 / scope.column.selectedType.totalCount;
                scope.column.nonemptyPercentage = (scope.column.selectedType.totalCount - scope.column.selectedType.nbEmpty) * 100 / scope.column.selectedType.totalCount;
                scope.column.nokPercentage = scope.column.selectedType.nbNOK * 100 / scope.column.selectedType.totalCount;
            }
        };
    });


    app.directive('simpleDetectionPreviewTable', function(DataikuAPI, $filter) {
        return {
            scope : {
                "headers" : "=",
                "table" : "=",
                "dataset" : "=",
                "setSchemaUserModified" : '=',
                "schemaIsUserEditable" : "="
            },
            replace : true,
            templateUrl : '/templates/datasets/fragments/simple-detection-preview-table.html',
            link : function($scope, element) {
                $scope.$watch('table', function(nv) {
                    if ($scope.table == null) {
                        return;
                    }
                    $scope.columnCount = $scope.headers.length;
                    if ($scope.columnCount > 320) {
                        $scope.tooManyColumns = true;
                        var truncateRowOrHeader = function(a, midElement) {
                            var ret = [];
                            var getWithRealIndex = function(a, idx) {
                                var o = a[idx];
                                o.realIndex = idx;
                                return o;
                            };
                            for (var i=0;i<300;i++) {ret.push(getWithRealIndex(a, i));}
                            midElement.realIndex = -1;
                            ret.push(midElement);
                            for (var i=0;i<20;i++) {ret.push(getWithRealIndex(a, a.length - 20 + i));}
                            return ret;
                        };
                        // generate truncated table
                        $scope.displayedHeaders = truncateRowOrHeader($scope.headers, {name:'... ' + ($scope.headers.length - 320) + ' columns ...', selectedType:{}});
                        $scope.displayedTable = {
                                displayedRows : $scope.table.displayedRows, // keep stats
                                totalDeletedRows : $scope.table.totalDeletedRows,
                                totalEmptyCells : $scope.table.totalEmptyCells,
                                totalFullCells : $scope.table.totalFullCells,
                                totalKeptRows : $scope.table.totalKeptRows,
                                totalRows : $scope.table.totalRows,
                                headers : $scope.displayedHeaders,
                                rows : $scope.table.rows.map(function(row) {return {origRowIdx:row.origRowIdx, cells:truncateRowOrHeader(row.cells, {value:'...'})}})
                        };
                    } else {
                        $scope.tooManyColumns = false;
                        $scope.displayedTable = $scope.table;
                        $scope.displayedHeaders = $scope.headers;
                    }
                });
            }
        };
    });


    app.directive('schemaConsistencyStatus', function() {
        return {
            templateUrl: '/templates/datasets/schema-consistency-status.html',
            scope: {
                consistency: '=',
                overwriteSchema: '=',
                clearManagedDataset:  '=',
                checkConsistency: '=',
                discardConsistencyError: '=',
                managed: '=',
                schemaJustModified: '=',
                currentSchema: '='
            },
            link: function($scope) {
            }
        };
    });


    app.directive('simpleEditableColumnHeader', function() {
        return {
            restrict: 'E',
            replace: true,
            templateUrl: '/templates/datasets/simple_editable_column_header.html',
            scope: {
                column : '=',
                columnIndex : '=',
                setSchemaUserModified : '=',
                dataset : '='
            },
            link: function(scope, element, attrs){
                if ( scope.columnIndex < 0) return;

                scope.schema = {};
                scope.$watch("dataset.schema", function(nv, ov) {
                    scope.schema = scope.dataset.schema.columns[scope.columnIndex];
                });

                scope.column.selectedType.totalCount = (scope.column.selectedType.nbOK + scope.column.selectedType.nbNOK + scope.column.selectedType.nbEmpty);
                scope.column.okPercentage = scope.column.selectedType.nbOK * 100 / scope.column.selectedType.totalCount;
                scope.column.emptyPercentage = scope.column.selectedType.nbEmpty * 100 / scope.column.selectedType.totalCount;
                scope.column.nonemptyPercentage = (scope.column.selectedType.totalCount - scope.column.selectedType.nbEmpty) * 100 / scope.column.selectedType.totalCount;
                scope.column.nokPercentage = scope.column.selectedType.nbNOK * 100 / scope.column.selectedType.totalCount;
            }
        };
    });


    app.directive('excelSheets', function(Assert) {
        return {
            template: '<div>' +
                    '<ul>' +
                        '<li ng-repeat="sheet in sheets">' +
                            '<input type="checkbox" ng-model="sheet.isSelected" /> {{sheet.name}}' +
                        '</li>' +
                    '</ul>' +
                '</div>',
            restrict :'E',
            scope :true,
            link: function(scope, element, attrs) {
                function encodeSheets(sheetNames) {
                    return '*' + sheetNames.join('\n'); // Use '*' as first character to denote a list of sheet names.
                }
                function decodeSheets(str, meta) {
                    if (!angular.isDefined(str) || str == "") {
                        return [];
                    }
                    if (str.charAt(0) === '*') {
                        return str.substring(1).split("\n"); // List of sheet names
                    } else {
                        // List of sheet indexes (for compatibility)
                        return str.split(',').map(sheetIndex => meta["sheet." + sheetIndex + ".name"]);
                    }
                }
                scope.oldMeta = null;
                scope.$watch("detectionResults", function(ov, nv) {
                    if (scope.detectionResults == null) {
                        return;
                    }
                    Assert.trueish(scope.detectionResults.format, 'no detected format');
                    if (scope.detectionResults.format == null) {
                        return;
                    }

                    const meta = scope.detectionResults.format.metadata;
                    if (angular.equals(scope.oldMeta, meta)) {
                        return;
                    }
                    if (scope.oldMeta == null) {
                        scope.oldMeta = angular.copy(meta);
                    }
                    const selectedSheetNames = decodeSheets(scope.dataset.formatParams.sheets, meta);
                    if (meta && angular.isDefined(meta.nbSheets)) {
                        scope.sheets = [];
                        for (let i = 0; i < meta.nbSheets; i++) {
                            const sheetName = meta["sheet." + i + ".name"];
                            scope.sheets.push({"name": sheetName, "isSelected": selectedSheetNames.includes(sheetName)});
                        }
                    }
                }, true);

                scope.$watch("sheets", function(ov, nv) {
                    if (scope.sheets == null) {
                        return;
                    }
                    let selectedSheetNames = [];
                    for (let i in scope.sheets) {
                        const sheet = scope.sheets[i];
                        if (sheet.isSelected) {
                            selectedSheetNames.push(sheet.name);
                        }
                    }
                    scope.dataset.formatParams.sheets = encodeSheets(selectedSheetNames);
                    scope.onFormatParamsChanged();
                }, true);
            }
        };
    });


    app.directive('possibleXpaths', function(Assert) {
        return {
            template: '<div class="xpath-tree">'
                     +'   <div ng-repeat="elem in xpaths" ng-include="\'/templates/datasets/format-xml-xpath-group.html\'" />'
                     +'</div>',
            restrict: 'E',
            scope: true,
            link: function(scope, element, attrs) {
                scope.$watch("detectionResults", function(ov, nv) {
                    if (scope.detectionResults == null) {
                        return;
                    }
                    Assert.trueish(scope.detectionResults.format, 'no detected format');
                    if (scope.detectionResults.format == null) {
                        return;
                    }
                    // a new format detection was done, so the metadata *could* have changed
                    const meta = scope.detectionResults.format.metadata;
                    if (meta && angular.isDefined(meta.possibleXPaths)) {
                        // backend sends a flat list of elements with depth and counts, frontend need to prepare for display
                        function groupRecursively(elems, treeDepth) {
                            if (!elems || !elems.length) {
                                return [];
                            }
                            elems.sort((a,b) => a.depth - b.depth);
                            // take the top level for the next grouping session
                            const minDepth = elems[0].depth;
                            const groups = elems.filter(elem => elem.depth == minDepth);
                            groups.forEach(function(group) {
                                group.treeDepth = treeDepth;
                            });
                            // split the rest in groups
                            elems.forEach(function(elem) {
                                const parent = groups.filter(function(group) {
                                    return elem.xpath.length > group.xpath.length && elem.xpath.slice(0, group.xpath.length) == group.xpath;
                                });
                                if (parent.length == 0 || parent.length > 1) {
                                    return; // not supposed to happen, by construction of the xpaths
                                }
                                elem.xpathSuffix = elem.xpath.slice(parent[0].xpath.length);
                                parent[0].xpaths = parent[0].xpaths || [];
                                parent[0].xpaths.push(elem);
                            });
                            // recurse in the groups, as needed
                            groups.forEach(function(group) {
                                if (group.xpaths !== undefined && group.xpaths.length > 0) {
                                    group.xpaths = groupRecursively(group.xpaths, treeDepth + 1);
                                }
                            });
                            groups.sort((a,b) => b.count - a.count); // sort by decreasing count
                            return groups;
                        }

                        scope.xpaths = groupRecursively(JSON.parse(meta.possibleXPaths), 0);
                    }
                }, true);

                scope.selectXpath = function(xpath) {
                    if (scope.lastFocusedXpathFieldSetter != null) {
                        scope.lastFocusedXpathFieldSetter(xpath, scope.dataset.formatParams.rootPath);
                        // force the preview to refresh
                        scope.onFormatParamsChanged();
                    }
                };
            }
        };
    });


    app.directive('xpathField', function() {
    	return {
        	restrict:'A',
        	require:'^ngModel',
            scope: true,
            link : function(scope, element, attrs, ngModel) {
            	var xpathType = attrs['xpathField'];
               	element.on('focus', function() {
                        scope.xpathFieldGotFocus(function(value, rootElementXpath) {
            			// be smarter and make the xpath appropriate to where it's set
            			if (rootElementXpath != null) {
                			if ( xpathType == 'parent') {
                				// for nodes that we know are parents of the root element, only take the attributes
                				if (rootElementXpath.startsWith(value))
                					value = value + '/@*';
                			}
                			if ( xpathType == 'child') {
                				// for nodes that we know are children of the root element, make them relative
                				if (value.startsWith(rootElementXpath))
                					value = '.' + value.substring(rootElementXpath.length);
                			}
            			}
            			// set the new value in the field and render
                		ngModel.$setViewValue(value);
                		ngModel.$render();
            		});
            	});
            }
        };
    });

    app.directive('datasetPathInput', function($timeout) {
        return {
            restrict: 'E',
            replace: true,
            templateUrl: '/templates/datasets/dataset-path-input.html',
            scope: {
                title: '@',
                path: '=',
                browseFn: '=',
                validateFn: '=',
                connection: '@',
                changeNeedsConfirm: '='
            },
            link: function(scope, element, attrs){
                scope.changeConfirmed = false;

                // -- file selection

                scope.navObj = {selectedItems: []};
                scope.canBrowse = function(item) {
                    return true;
                };

                scope.canSelect = function(item) {
                    return true;
                };

                // -- browsing

                scope.onToggleBrowse = function() {
                    scope.browseActive = !scope.browseActive;
                    if (scope.browseActive) {
                        scope.path = scope.path || '/';
                        scope.navObj.browsePath = scope.path;
                    }
                };

                scope.onOKClick = function() {
                    if (scope.navObj.selectedItems.length == 0) {
                        scope.path = scope.navObj.browsePath;
                    } else {
                        scope.path = scope.navObj.selectedItems[0].fullPath;
                    }
                    scope.browseActive = false;
                    /* Evaluate in timeout so that the nw path is correctly propagated before triggering change handlers
                     * (else, issues with digest cycles) */
                    $timeout(function() {
                        scope.validateFn();
                    });
                };

                scope.onCancelClick = function() {
                    scope.browseActive = false;
                };

                scope.$watch("connection", function(nv,ov){
                    scope.browsePath = '/';
                    scope.onCancelClick();
                })
            }
        };
    });

    app.directive('folderPathInput', ($timeout, openDkuPopin) => {
        return {
            restrict: 'E',
            replace: true,
            templateUrl: '/templates/projects-list/folder-path-input.html',
            scope: {
                title: '@',
                path: '=',
                browseFn: '=',
                validateFn: '=',
                connection: '@',
                changeNeedsConfirm: '=',
                displayItemFn: '=?',
                canSelectFn: '=?',
                folder: '=?',
                showRootFolderPath: '=?',
                cantWriteContentVerb: '@',
                searchable: '@',
                inputId: '@',
                inputEnabled: '&?',
            },
            link: (scope, element, attrs) => {
                scope.searchable = attrs.searchable ? scope.$eval(scope.searchable) : false;
                scope.changeConfirmed = false;
                const targetElement = element[0].querySelector('.browse-path-dropdown');
                const template = $(targetElement).detach();

                // -- file selection

                scope.navObj = { selectedItems: [] };
                scope.canBrowse = () => true;

                scope.canSelect = item => scope.canSelectFn ? scope.canSelectFn(item) : false;

                scope.displayItem = item => scope.displayItemFn ? scope.displayItemFn(item) : item;

                scope.inputEnabled = scope.inputEnabled ? scope.inputEnabled : () => true;

                scope.currentFolder = scope.folder;

                // -- browsing

                scope.onToggleBrowse = (event) => {
                    scope.browseActive = !scope.browseActive;

                    const isElsewhere = (tooltipElement, event) => $(event.target).parents('.browse-path-dropdown').length === 0 && $(event.target).parents('.browse-path-input').length === 0;
                    const onDismiss = () => scope.browseActive = false;

                    scope.dismissPopin = openDkuPopin(scope, event, { popinPosition: 'SMART', arrow: false, doNotCompile: true, onDismiss, isElsewhere, template });
                    if (scope.browseActive) {
                        if (scope.folder) {
                            scope.navObj.browsePath = scope.folder.id;
                        } else {
                            scope.navObj.browsePath = scope.path;
                        }
                    }
                };

                scope.onOKClick = () => {
                    const selectedItems = scope.navObj.selectedItems;

                    if (scope.folder) {
                        scope.folder = scope.currentFolder;
                    }
                    scope.path = selectedItems.length === 1 ? selectedItems[0].fullPath : scope.navObj.browsePath;
                    if (scope.path === '/') {
                        scope.path = "";
                    }
                    scope.browseActive = false;
                    scope.dismissPopin();
                };

                scope.browseDoneFn = folder => {
                    // show / if folder is root
                    if (scope.showRootFolderPath && !folder.pathElts) {
                        folder.pathElts = '/';
                    }

                    scope.currentFolder = folder;
                };

                scope.onCancelClick = () => {
                    scope.browseActive = false;
                    scope.dismissPopin();
                };
            }
        };
    });

    // This directive is much more complex than it should, because it has very specific properties
    // to not break the existing UI.
    // For instance:
    // - The model object is updated in-place (except when it's not impossible)
    // - The model is not updated if it has not been modified by the user
    //   (auto fixup is not propagated until necessary)
    // - It internally synchronizes 3 states : the model, the tree view model, and the JSON
    //
    // Notice: it's probably the worst code I ever wrote!
    app.service('ColumnTypeConstants', function(CreateModalFromTemplate, ContextualMenu, $rootScope){
        var cst = {
    		types : [
                     {name:'tinyint',label:'tinyint (8 bit)'},
                     {name:'smallint',label:'smallint (16 bit)'},
                     {name:'int',label:'int'},
                     {name:'bigint',label:'bigint (64 bit)'},
                     {name:'float',label:'float'},
                     {name:'double',label:'double'},
                     {name:'boolean',label:'boolean'},
                     {name:'string',label:'string'},
                     {name:'date',label:'date'},
                     {name:'geopoint',label:'geo point'},
                     {name:'geometry',label:'geometry'},
                     {name:'array',label:'array<...>'},
                     {name:'map',label:'map<...>'},
                     {name:'object',label:'object<...>'}
                 ],
             COMPLEX_TYPES : {
                     array:    {icon: 'icon-list'},
                     map:      {icon: 'icon-th'},
                     object:   {icon: 'icon-list-alt'},
                     geopoint: {icon: 'icon-map-marker', primitive: true}
    		}
        };
        return cst;
    });


    app.directive('complexTypeSelector', function(CreateModalFromTemplate, ContextualMenu, $rootScope, ColumnTypeConstants){
        return {
            restrict:'E',
            scope: {
                'model':'='
            },
            templateUrl : '/templates/datasets/type-editor/widget.html',
            link : function(scope, element, attrs) {
                scope.types = ColumnTypeConstants.types;
            }
        };
    });


    app.directive('complexTypeEditor', function(CreateModalFromTemplate, ContextualMenu, $rootScope, ColumnTypeConstants){
        var COMPLEX_TYPES = ColumnTypeConstants.COMPLEX_TYPES, DEFAULT_ICON = 'icon-book';
        return {
            restrict:'E',
            scope: {
                'model':'=',
                'showCommentTab': '=',
                'hideCustomFields': '='
            },
            templateUrl : '/templates/datasets/type-editor/editor.html',
            link : function(scope, element, attrs) {
                scope.appConfig = $rootScope.appConfig;

                // Foreign change
                scope.$watch('model',function(nv) {
                    if(!nv) return;
                    var currentCopy = angular.copy(scope.current);
                    scope.current = deepInplaceCopy(scope.model, scope.current);
                    fixup(scope.current, currentCopy);
                },true);

                scope.editMode = 'comment';

                function fixup(col,applyShow) {
                    if(!col) return;
                    delete col.$$hashKey;
                    if(applyShow) {
                        col.show = applyShow.show;
                        col.editing = applyShow.editing;
                        col.renaming = applyShow.renaming;
                        col.configuring = applyShow.configuring;
                        if(!col.show) {
                            delete col.show;
                        }
                        if(!col.editing) {
                            delete col.editing;
                        }
                        if(!col.renaming) {
                            delete col.renaming;
                        }
                        if(!col.configuring) {
                            delete col.configuring;
                        }
                    } else {
                        delete col.show;
                        delete col.editing;
                        delete col.renaming;
                        delete col.configuring;
                        applyShow = {};
                    }
                    if(col.type=='map') {
                        if(!(col.mapValues instanceof Object) || col.mapValues instanceof Array) {
                            col.mapValues = {"name":"","type":"string"};
                        }
                        fixup(col.mapValues,applyShow.mapValues);
                        if(!(col.mapKeys instanceof Object) || col.mapKeys instanceof Array) {
                            col.mapKeys = {"name":"","type":"string"};
                        }
                        fixup(col.mapKeys,applyShow.mapKeys);
                        delete col.mapKeys.name;
                        delete col.mapValues.name;
                        delete col.arrayContent;
                        delete col.objectFields;
                        delete col.maxLength;
                    } else if(col.type=='array' || col.mapValues instanceof Array){
                        if(!(col.arrayContent instanceof Object) || col.arrayContent instanceof Array) {
                            col.arrayContent = {"name":"","type":"string"};
                        }
                        fixup(col.arrayContent,applyShow.arrayContent);
                        delete col.arrayContent.name;
                        delete col.mapKeys;
                        delete col.mapValues ;
                        delete col.objectFields;
                        delete col.maxLength;
                    } else if(col.type == 'object') {
                        if(!(col.objectFields instanceof Array)) {
                            col.objectFields = [];
                        }
                        var flds = (applyShow.objectFields instanceof Array)?applyShow.objectFields:[];
                        var existingNames = {};
                        for(var i = 0 ; i < col.objectFields.length ; i++) {
                            var current = col.objectFields[i];
                            var currentName = current?current.name:undefined;
                            if(currentName) {
                                existingNames[currentName] = true;
                            }
                        }
                        for(var i = 0 ; i < col.objectFields.length ; i++) {
                            fixup(col.objectFields[i],flds[i]);
                            if(!col.objectFields[i].name) {
                                var newName = 'field_'+(i+1);
                                var cnt = 1;
                                while(existingNames[newName]) {
                                    newName ='field_'+(i+1)+'_'+cnt;
                                    cnt++;
                                }
                                col.objectFields[i].name= newName;
                            }
                        }
                        delete col.mapKeys;
                        delete col.mapValues;
                        delete col.arrayContent;
                        delete col.maxLength;
                    } else {
                        if(!col.type) {
                            col.type = 'string';
                        }
                        if(col.type!='string') {
                            delete col.maxLength;
                        } else {
                            if(col.maxLength==undefined) {
                                col.maxLength = 1000;
                            }
                        }
                        delete col.mapKeys;
                        delete col.mapValues;
                        delete col.arrayContent;
                        delete col.objectFields;
                        delete col.show;
                    }
                }

                // This code is NOT generic... and miss a lot of corner cases
                // It's okay for this usage only
                function deepInplaceCopy(from,to) {
                    if(!to || !(to instanceof Object)) {
                        to = {};
                    }
                    for(var k in to) {
                        if(!from[k]) {
                            delete to[k];
                        }
                    }
                    for(var k in from) {

                        var objFrom = from[k];
                        var objTo = to[k];
                        if(objFrom instanceof Array && objTo instanceof Array) {

                            for(var i = 0 ; i < objFrom.length ; i++) {
                                var itemFrom = objFrom[i];
                                var itemTo = objTo[i];
                                if(typeof itemFrom == 'string' || typeof itemFrom == 'number' || typeof itemFrom == 'boolean') {
                                    objTo[i] = itemFrom;
                                } else if(!(itemFrom instanceof Array) && itemFrom instanceof Object && itemFrom
                                    && !(itemTo instanceof Array) && itemTo instanceof Object && itemTo) {
                                    objTo[i] = deepInplaceCopy(itemFrom,itemTo);
                                } else {
                                    objTo[i] = angular.copy(itemFrom);
                                }
                            }
                            objTo.length = objFrom.length;

                        } else if(!(objFrom instanceof Array) && !(objTo instanceof Array) &&
                                objFrom instanceof Object && objTo instanceof Object && objTo!=null && objFrom!=null) {
                            to[k] = deepInplaceCopy(objFrom,objTo);
                        } else {
                            to[k] = angular.copy(objFrom);
                        }
                    }
                    return to;
                }


                function isDifferent(a,b,isRoot) {
                    if((!a && b) || (a &&!b)) return true;
                    if(a.name!=b.name) return true;
                    if(a.type!=b.type) return true;
                    if(a.timestampNoTzAsDate!=b.timestampNoTzAsDate) return true;
                    if (a.meaning != b.meaning) return true;
                    if(isRoot && a.comment && b.comment && b.comment!=a.comment) return true;
                    if(isRoot) {
                        if (!a.customFields && b.customFields) return true;
                        if (a.customFields && !b.customFields) return true;
                        if (a.customFields && b.customFields) {
                            const aKeys = Object.keys(a.customFields);
                            const bKeys = Object.keys(b.customFields);
                            if (aKeys.length!=bKeys.length) return true;
                            for (let key in a.customFields) {
                                if (!b.customFields.hasOwnProperty(key)) return true;
                                if (a.customFields[key]!=b.customFields[key]) return true;
                            }
                        }
                    }
                    if(a.type == 'string') {
                        if(a.maxLength != b.maxLength) {
                            return true;
                        }
                    }
                    if(a.type=='map') {
                        if(isDifferent(a.mapKeys,b.mapKeys)) {
                            return true;
                        }
                        if(isDifferent(a.mapValues,b.mapValues)) {
                            return true;
                        }
                    }
                    if(a.type=='array') {
                        if(isDifferent(a.arrayContent,b.arrayContent)) {
                            return true;
                        }
                    }
                    if(a.type=='object') {
                        if(a.objectFields && !b.objectFields) return true;
                        if(!a.objectFields && b.objectFields) return true;
                        if(!a.objectFields && !b.objectFields) return false;
                        if(a.objectFields.length != b.objectFields.length) {
                            return true;
                        }
                        for(var i = 0 ; i < a.objectFields.length; i++) {
                             if(isDifferent(a.objectFields[i],b.objectFields[i])) {
                                return true;
                            }
                        }
                    }
                    return false;
                }


                scope.toggleEdit = function(elm,event) {
                   if(event) {
                       event.stopPropagation();
                   }
                   scope.disableEditing();
                   elm.editing = true;
                };

                scope.toggleRenaming = function(elm,event) {
                   if(event) {
                       event.stopPropagation();
                   }
                   scope.disableEditing();
                   elm.renaming = true;
                };

                scope.toggleConfiguring = function(elm,event) {
                    if(event) {
                       event.stopPropagation();
                    }
                    scope.disableEditing();
                    elm.configuring = true;
                };

                scope.disableEditing = function() {
                    function recurse(sc) {
                        if(!sc) return;
                        delete sc.editing;
                        delete sc.configuring;
                        delete sc.renaming;
                        if(sc.mapKeys) {
                            recurse(sc.mapKeys);
                        }
                        if(sc.mapValues) {
                            recurse(sc.mapValues);
                        }
                        if(sc.objectFields) {
                            for(var k in sc.objectFields) {
                                recurse(sc.objectFields[k]);
                            }
                        }
                        if(sc.arrayContent) {
                            recurse(sc.arrayContent);
                        }
                    };
                    recurse(scope.current);
                };

                scope.ui = {};

                scope.customFieldsMap = $rootScope.appConfig.customFieldsMap['COLUMN'];

                scope.types = ColumnTypeConstants.types;

                scope.getTypeLabel = function(type) {
                    for(var k in scope.types) {
                        if(scope.types[k].name==type) {
                            return scope.types[k].label;
                        }
                    }
                    return 'Unknown type';
                };

                // UI current is the textarea (and yes, we should change that incredibly confusing naming)
                scope.$watch('ui.current',function() {
                    if(!scope.ui.current) return;
                    fixup(scope.ui.current,undefined);
                    var currentCopy = angular.copy(scope.current);
                    scope.current = deepInplaceCopy(scope.ui.current,scope.current)
                    fixup(scope.current,currentCopy);
                },true);

                // Current is the tree-view (and yes, we should change that incredibly confusing naming)
                scope.$watch('current',function(current) {
                    if(!current) return;

                    // Fix errors, keep states
                    fixup(current,current);

                    // Cleanup "show" status in textarea
                    scope.ui.current = angular.copy(current);
                    fixup(scope.ui.current,undefined);

                    // And in the model
                    var fixedModel = angular.copy(scope.model);
                    fixup(fixedModel,undefined);
                    if(isDifferent(current,fixedModel,true)) {
                        var noShowCopy = angular.copy(current);
                        fixup(noShowCopy,undefined);
                        var oldHash = scope.model.$$hashKey; // keep the hash (for angular ngRepeat tracking? otherwise https://github.com/dataiku/dip/issues/4206 )
                        scope.model = deepInplaceCopy(noShowCopy,scope.model);
                        scope.model.$$hashKey = oldHash;
                    }

                },true);

                scope.isEditable = function(elm) {
                    return elm && (elm.type == 'string' || !scope.isPrimitiveType(elm.type));
                };

                scope.getIconForType = function(t) {
                    return t in COMPLEX_TYPES ? COMPLEX_TYPES[t].icon : DEFAULT_ICON;
                };

                scope.setEditMode = function(m) {
                    scope.editMode = m;
                };

                scope.isPrimitiveType = function(t) {
                    return !(t in COMPLEX_TYPES) || COMPLEX_TYPES[t].primitive;
                }
            }
        };
    });


app.directive('dataset', function(CreateModalFromTemplate){
    return {
        link: function(scope, element, attrs){
            scope.buildDataset = function(){
                CreateModalFromTemplate("/templates/datasets/build-dataset-modal.html", scope, "BuildDatasetController", null, "build-dataset-modal");
            };

        }
    };
});


app.controller("DatasetPageRightColumnActions", function($controller, $scope, $rootScope, $stateParams, DataikuAPI, ActiveProjectKey) {

    $controller('_TaggableObjectPageRightColumnActions', {$scope: $scope});

    $scope.selection = {
        selectedObject : {
            projectKey : ActiveProjectKey.get(),
            name : $stateParams.datasetName,
            id: $stateParams.datasetName,
            nodeType : 'LOCAL_DATASET',
            interest : {}, 
        },
        confirmedItem : {
            projectKey : ActiveProjectKey.get(),
            name : $stateParams.datasetName,
            nodeType : 'LOCAL_DATASET',
        }
    };

    function updateUserInterests() {
        DataikuAPI.interests.getForObject($rootScope.appConfig.login, "DATASET", ActiveProjectKey.get(), $stateParams.datasetName).success(function(data) {
            
            $scope.selection.selectedObject.interest.watching = data.watching;
            $scope.selection.selectedObject.interest.starred = data.starred;

        }).error(setErrorInScope.bind($scope));
    }

    updateUserInterests();
    const interestsListener = $rootScope.$on('userInterestsUpdated', updateUserInterests);
    $scope.$on("$destroy", interestsListener);
});


app.controller("ForeignDatasetPageRightColumnActions", function($controller, $scope, $stateParams, DatasetUtils, DataikuAPI, $rootScope, ActiveProjectKey) {

    $controller('_TaggableObjectPageRightColumnActions', {$scope: $scope});

    const loc = DatasetUtils.getLocFromFull($stateParams.datasetFullName);
    $scope.selection = {
        selectedObject : {
            projectKey : loc.projectKey,
            name : loc.name,
            id: loc.name,
            nodeType : 'FOREIGN_DATASET',
            interest : {}, 
        },
        confirmedItem : {
            projectKey : loc.projectKey,
            name : loc.name,
            nodeType : 'FOREIGN_DATASET',
        }
    }
});


app.controller("DatasetDetailsController", function($scope, $stateParams, DataikuAPI, FutureProgressModal, DatasetUtils, StateUtils, Dialogs, ActiveProjectKey) {
    $scope.StateUtils = StateUtils;
    $scope.isLocalDataset = function() {
        return $scope.data.dataset.projectKey == ActiveProjectKey.get();
    };

    $scope.isPartitioned = function() {
        return $scope.data
            && $scope.data.dataset
            && $scope.data.dataset.partitioning
            && $scope.data.dataset.partitioning.dimensions
            && $scope.data.dataset.partitioning.dimensions.length > 0;
    }

    this.DatasetUtils = DatasetUtils;

    $scope.refreshAndGetStatus = function(datasetData, computeRecords, forceRecompute) {
        DataikuAPI.datasets.getRefreshedSummaryStatus(ActiveProjectKey.get(), datasetData.dataset.name, computeRecords, forceRecompute).success(function(data) {
            FutureProgressModal.show($scope, data, "Refresh dataset status").then(function(result){
                datasetData.status = result;
                if (result) { // undefined in case of abort
                    Dialogs.infoMessagesDisplayOnly($scope, "Computation result", result.messages);
                }
            });
        }).error(setErrorInScope.bind($scope));
    };
});


app.directive('ellipsedList', [ '$window', '$timeout', function($window, $timeout){
    return {
        link: function($scope, element, attrs) {
            $scope.menuState = {
                useFullMoreActions: true,
                hideMoreActions: false,
            };
            $scope.hideMoreActions = function() {
                $scope.menuState.hideMoreActions = true;
                element.children('[label]').show();
            };
            var resizeMoreActions = function() {
                $scope.element = element;
                var elements = element.children('[label]');
                var lineElCount = Math.floor(element.width() / elements.width());
                $scope.menuState.useFullMoreActions = (lineElCount < elements.length);
                var splitPosition = $scope.menuState.useFullMoreActions ? lineElCount - 1 : lineElCount;
                elements.slice(splitPosition, elements.length).hide();
                elements.slice(0, splitPosition).show();
            };

            var handleElementResize = function() {
                const nv = element.width();
                if (ov != nv && !$scope.menuState.hideMoreActions && nv>0) {
                    ov = nv;
                    $timeout(resizeMoreActions);
                }
            }

            var ov = -1;

            angular.element($window).bind('resize', handleElementResize);

            $scope.$on("$destroy", function () {
                angular.element($window).unbind('resize', handleElementResize);
            });
    
    
            $scope.$watch('uiState.displayMoreActions', function(nv, ov){
                if($scope.menuState.hideMoreActions){
                    return;
                }
                if (!nv || (nv && ov)) {
                    element.addClass('ellipsed-list-loading');
                }
                if (nv) {
                    showMoreActions();
                }
            });

            var showMoreActions = function(){
                $scope.menuState.hideMoreActions = false;
                $timeout(function(){
                    resizeMoreActions();
                    element.removeClass('ellipsed-list-loading');
                },50);
            };
        }
    }
}]);


app.directive('datasetRightColumnSummary', function($controller, $stateParams, $state, $timeout,
        DataikuAPI, CreateModalFromTemplate, DatasetsService, GlobalProjectActions, QuickView, FlowGraphSelection, FlowGraph,
        TaggableObjectsUtils, ActiveProjectKey, AnyLoc, ActivityIndicator, DatasetCustomFieldsService, $rootScope, SelectablePluginsService){
    return {
        templateUrl: '/templates/datasets/right-column-summary.html',
        link: function($scope, element, attrs) {

            /* Auto save when summary is modified */
            $scope.$on("objectSummaryEdited", function() {
                DataikuAPI.datasets.save($scope.dataset.projectKey, $scope.dataset, { summaryOnly: true })
                    .success(() => ActivityIndicator.success("Saved"))
                    .error(setErrorInScope.bind($scope));
            });

            /* Save custom fields */
            $scope.$on('customFieldsSummaryEdited', function(event, customFields) {
                DatasetCustomFieldsService.saveCustomFields($scope.dataset, customFields);
            });


            $controller('_TaggableObjectsMassActions', { $scope });
            $controller('_TaggableObjectsCapabilities', { $scope });

            $scope.QuickView = QuickView;

            $scope.$stateParams = $stateParams;

            var enrichSelectedObject = function (selObj, dataset) {
                selObj.tags = dataset.tags; // for apply-tagging modal
            }

            $scope.$on('taggableObjectTagsChanged', () => $scope.refreshData());

            $scope.refreshData = function() {
                $scope.uiState.displayMoreActions = false;
                // From personal home page we want details of items in projects withouth having opened then

                const loc = AnyLoc.makeLoc($scope.selection.selectedObject.projectKey, $scope.selection.selectedObject.name);
                DataikuAPI.datasets.getFullInfo(ActiveProjectKey.get(), loc.projectKey, loc.localId).success(function(data) {
                     if (!$scope.selection.selectedObject
                        || loc.localId != data.dataset.name
                        || loc.projectKey != data.dataset.projectKey) {
                        return; //too late!
                    }

                    $scope.datasetFullInfo = data;
                    $scope.dataset = data.dataset;
                    $scope.usability = GlobalProjectActions.getAllStatusForDataset(data.dataset);
                    $scope.selectablePlugins = SelectablePluginsService.listSelectablePlugins({'DATASET' : 1});

                    enrichSelectedObject($scope.selection.selectedObject, $scope.dataset);

                    if (data.dataset.projectKey == ActiveProjectKey.get()) {
                        $scope.isLocalDataset = true;
                        $scope.dataset.smartName = data.dataset.name; // TODO: could be done in backend
                    } else {
                        $scope.isLocalDataset = false;
                        $scope.dataset.smartName = data.dataset.projectKey + "." + data.dataset.name;

                    }
                    $scope.uiState.displayMoreActions = true;
                    $scope.dataset.zone = ($scope.selection.selectedObject.usedByZones || [])[0] || $scope.selection.selectedObject.ownerZone;
                }).error(setErrorInScope.bind($scope));
            };

            $scope.getCommonZone = function () {
                return $scope.dataset.zone;
            };

            $scope.getSmartNames = function() {
                return [$scope.dataset.smartName];
            };

            $scope.$watch("selection.selectedObject",function(nv) {
                $scope.datasetFullInfo = {dataset: $scope.selection.selectedObject, timeline: {}}; // display temporary (incomplete) data
                if($scope.selection.selectedObject!=$scope.selection.confirmedItem) {
                    $scope.dataset = null;
                }
                if (!nv) return;
                $scope.datasetType = nv.datasetType || nv.type;
                if (nv.nodeType === 'FOREIGN_DATASET') {
                    $scope.datasetSmartName = nv.projectKey + '.' + nv.name;
                    $scope.datasetHref = $state.href('projects.project.foreigndatasets.dataset.explore',
                        {datasetFullName: $scope.datasetSmartName, projectKey: nv.projectKey});
                } else {
                    $scope.datasetSmartName = nv.name;
                    $scope.datasetHref = $state.href('projects.project.datasets.dataset.explore',
                        {datasetName: nv.name, projectKey: nv.projectKey});
                }
            });

            $scope.$watch("selection.confirmedItem", function(nv, ov) {
                if (!nv) return;
                if (!nv.projectKey) nv.projectKey = ActiveProjectKey.get();
                $scope.refreshData();
            });

            $scope.isAllDatasets = ( () => true ); // To reuse templates with multi-object right column

            $scope.buildDataset = function() {
                DataikuAPI.datasets.get($scope.selection.selectedObject.projectKey, $scope.selection.selectedObject.name, ActiveProjectKey.get())
                .success(function(dataset) {
                    CreateModalFromTemplate("/templates/datasets/build-dataset-modal.html", $scope, "BuildDatasetController", function(newScope) {
                        newScope.dataset = dataset;
                        newScope.jobStartRedirects = (attrs.jobStartRedirects !== undefined) ;
                    }, "build-dataset-modal");
                }).error(setErrorInScope.bind($scope));
            };

            $scope.createWebAppForDataset = function(loadedWebapp, roleTarget, roleValue) {
                let defaultWebappName = loadedWebapp.desc.meta.label + ' on ' + $scope.datasetSmartName;
                $scope.showCreateVisualWebAppModal(loadedWebapp, roleTarget, roleValue, defaultWebappName);
            };

            $scope.editCustomFields = function(editingTabIndex = 0) {
                if (!$scope.selection.selectedObject) {
                    return;
                }
                DataikuAPI.datasets.getSummary($scope.selection.selectedObject.projectKey, $scope.selection.selectedObject.name).success(function(data) {
                    const dataset = data.object;
                    const modalScope = angular.extend($scope, {objectType: 'DATASET', objectName: dataset.name, objectCustomFields: dataset.customFields, editingTabIndex});
                    CreateModalFromTemplate("/templates/taggable-objects/custom-fields-edit-modal.html", modalScope).then(function(customFields) {
                        DatasetCustomFieldsService.saveCustomFields(dataset, customFields);
                    });
                }).error(setErrorInScope.bind($scope));
            };

            $scope.anyPipelineTypeEnabled = function() {
                return $rootScope.projectSummary && ($rootScope.projectSummary.sparkPipelinesEnabled || $rootScope.projectSummary.sqlPipelinesEnabled);
            };

            function showVirtualizationAction(showDeactivate) {
                return function() {
                    const virtualized = !!$scope.selection.selectedObject.virtualizable;
                    return !$state.current.name.includes('explore')
                        && $scope.isProjectAnalystRW()
                        && $scope.isLocalDataset
                        && showDeactivate === virtualized;
                }
            }
            $scope.showAllowVirtualizationAction = showVirtualizationAction(false);
            $scope.showStopVirtualizationAction = showVirtualizationAction(true);


            $scope.zoomToOtherZoneNode = function(zoneId) {
                const otherNodeId = $scope.selection.selectedObject.id.replace(/zone__.+?__/, "zone__" + zoneId + "__");
                if ($stateParams.zoneId) {
                    $state.go('projects.project.flow', Object.assign({}, $stateParams, { zoneId: zoneId, id: graphVizUnescape(otherNodeId) }));
                    return;
                }
                else {
                    $scope.zoomGraph(otherNodeId);
                    FlowGraphSelection.clearSelection();
                    FlowGraphSelection.onItemClick($scope.nodesGraph.nodes[otherNodeId]);
                }
            }

            $scope.isDatasetZoneInput = function() {
                return ($scope.selection.selectedObject.usedByZones.length && $scope.selection.selectedObject.usedByZones[0] != $scope.selection.selectedObject.ownerZone);
            }
        }
    }
});

app.controller("ConnectionDetailsController", function ($scope, $stateParams, DataikuAPI, FutureProgressModal, ConnectionUtils, StateUtils,InfoMessagesModal) {
    $scope.StateUtils = StateUtils;
    $scope.noDescription = true;

    $scope.indexConnection = function () {
        $scope.$emit('indexConnectionEvent', $scope.data.name);
    };
    $scope.showMessages = function (messages) {
        InfoMessagesModal.showIfNeeded($scope, messages, "Indexing report");
    };
    $scope.isIndexable = function (connection) {
        return ConnectionUtils.isIndexable(connection);
    };
});

app.directive('connectionRightColumnSummary', function (DataikuAPI, $stateParams, CreateModalFromTemplate, DatasetsService, GlobalProjectActions, $state, QuickView, $timeout) {
    return {
        templateUrl: '/templates/admin/connections-right-column-summary.html',
        link: function (scope, element, attrs) {
            scope.$watch("selection.selectedObject", function (nv) {
                if (!nv) return;
                scope.connectionHref = $state.href('admin.connections.edit', {connectionName: nv.name});
            });

        }
    };
});

// Cta stands for Call To Action
// Service to return a function that will decide whether we should display the error or a nicer CTA to the user when the dataset can't load itelf (used in explore and charts)
app.service('DatasetErrorCta', function() {

    function requiresDatasetBuild(error) {
        return ['USER_CONFIG_DATASET', 'USER_CONFIG_OR_BUILD'].includes(error.fixability);
    }

    return {
        getupdateUiStateFunc: function (scope) {
            return function(error) {
                scope.uiDisplayState = {
                    showError: false,
                    showBeingBuilt: false,
                    showAboutToBeBuilt: false,
                    showBuildEmptyCTA: false,
                    showBuildFailCTA: false,
                    showUI: false
                }

                const dfi = scope.datasetFullInfo;
                const managed = (dfi && dfi.dataset && dfi.dataset.managed);
                const beingBuilt = (dfi && dfi.currentBuildState && dfi.currentBuildState.beingBuilt && dfi.currentBuildState.beingBuilt.length);
                const aboutToBeBuilt = (dfi && dfi.currentBuildState && dfi.currentBuildState.aboutToBeBuilt && dfi.currentBuildState.aboutToBeBuilt.length);
                const neverBuiltBuildable = (dfi && dfi.buildable && dfi.lastBuild === undefined)
                const buildable = (dfi && dfi.buildable);

                if (beingBuilt) {
                    scope.uiDisplayState.showBeingBuilt = !error || error.errorType != 'com.dataiku.dip.exceptions.UnauthorizedException';
                }
                if (!beingBuilt && aboutToBeBuilt) {
                    scope.uiDisplayState.showAboutToBeBuilt = !error || error.errorType != 'com.dataiku.dip.exceptions.UnauthorizedException';
                }

                if (error && managed && neverBuiltBuildable) {
                    /* If there is an error, but it is a managed-buildable-never-built-dataset, then don't display the error,
                     and display the CTA instead */
                    scope.uiDisplayState.showError = false;
                    scope.uiDisplayState.showBuildEmptyCTA = !beingBuilt && !aboutToBeBuilt;
                } else if (error && managed && buildable) {
                    /* If there is an error, and it is managed-buildable, but has ever been built, then display error
                     and CTA if error requires to build dataset */
                    scope.uiDisplayState.showError = true;
                    scope.uiDisplayState.showBuildFailCTA = !beingBuilt && !aboutToBeBuilt && requiresDatasetBuild(error);
                } else {
                    /* Just an error on a non-managed-buildable dataset: just display it */
                    scope.uiDisplayState.showError = true;
                }

                /* Table is shown if: no error */
                if (!error) {
                    scope.uiDisplayState.showUI = true;
                    scope.error = null;
                } else {
                    scope.error = error;
                }
            }
        }
    };
});

})();


document.addEventListener('StartSimpleTableContentUpdate', function() {});
document.addEventListener('EndSimpleTableContentUpdate', function() {});

function dispatchCustomTimelineEvent(type, details) {
    var event = new CustomEvent(type, details);
    document.dispatchEvent(event);
}

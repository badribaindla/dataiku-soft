(function(){
    'use strict';

    var app = angular.module('dataiku.shaker.table', ['dataiku.filters', 'platypus.utils']);


    app.service('ShakerTableModel', function() {

        return function(tableData, scope) {

            var PAGE_WIDTH = Math.pow(2,5);
            var PAGE_HEIGHT = Math.pow(2,6);

            var pageFromData = function(I,J,data) {
                return function(i,j)  {
                    var offset = (i-I)*data.nbCols + (j-J);
                    return {
                        content: data.content[offset],
                        status: data.status[offset],
                        colorBin : data.colorBin ? data.colorBin[offset] : null,
                        origRowIdx : data.origRowIdx[i-I],
                        rowId: i,
                        colId: j,
                    };
                };
            };

            var tableData = $.extend(
                new fattable.PagedAsyncTableModel(),
                tableData,
            {
                getHeader: function(j, cb) {
                    // Here we fork the scope for each header to append
                    // a new header property.
                    var newScope = scope.$new(false);
                    newScope.header = tableData.headers[j];
                    cb(newScope);
                }
            ,
                searchHeader: function(q) {
                    var q = q.toLowerCase();
                    var results = [];
                    for (var i = 0; i < tableData.headers.length; i++) {
                        var header = tableData.headers[i];
                        if (header.name.toLowerCase() == q) {
                            results.push(i);
                        }
                    }
                    for (var i = 0; i < tableData.headers.length; i++) {
                        var header = tableData.headers[i];
                        if ((header.name.toLowerCase().indexOf(q) != -1) && (results.indexOf(i) == -1) ) {
                            results.push(i);
                        }
                    }
                    return results;

                }
            ,
                hasHeader:  function() {
                    return true;  // we are synchronous for headers.
                }
            ,
                fetchCellPage: function(pageName, cb) {
                    var coords =  JSON.parse(pageName);
                    var I = coords[0];
                    var J = coords[1];
                    var nbRequestedRows = Math.min(this.totalKeptRows - I, PAGE_HEIGHT);
                    var nbRequestedCols = Math.min(this.headers.length - J, PAGE_WIDTH);
                    var promise = scope.getTableChunk(I, nbRequestedRows, J, nbRequestedCols);
                    promise.then(function(resp) {
                        var page = pageFromData(I,J,resp);
                        cb(page);
                    });
                }
            ,
                cellPageName: function(i,j) {
                    return JSON.stringify([i - (i & (PAGE_HEIGHT-1)), j - (j & (PAGE_WIDTH-1))]);
                }
            });

            // populate the page cache with the initial data.
            var initialPage = pageFromData(0,0, tableData.initialChunk);
            var initialPageName = tableData.cellPageName(0,0);
            tableData.pageCache.set(initialPageName, initialPage);
            tableData.PAGE_WIDTH = PAGE_WIDTH;
            tableData.PAGE_HEIGHT = PAGE_HEIGHT;
            return tableData;
        }
    });


    app.service('computeColumnWidths', function() {
        return function(sampleData, headers, minColumnWidth, hasAnyFilterOnColumn, columnWidthsByName, reset = false) {
            // Upper bounds for a cell/col containing only capital M: { header = 99, body = 95 }
            // Lower bound wih only small l: {header = 2.9, body = 2.6 }

            // Seems reasonable: 7 / 7.5
            const CELL_LETTER_WIDTH = 7;
            const HEADER_LETTER_WIDTH = 7.5;

            const CELL_MARGIN = 15;
            const HEADER_MARGIN = 15;
            const MAX_WIDTH = 300;
            const FILTER_FLAG_WIDTH = 20;

            let columnWidthsByIndex = [];
            const nbCols = headers.length;

            for (var colId = 0; colId < nbCols; colId++) {
                const header = headers[colId];
                const columnName = header.name;
                let columnWidth;

                if (!reset) {
                    columnWidth = columnWidthsByName[columnName];
                }

                if (!(Number.isInteger(columnWidth))) {
                    let cellColumnWidth =  Math.ceil(header.ncharsToShow * CELL_LETTER_WIDTH + CELL_MARGIN);
                    let colColumnWidth =  Math.ceil(header.name.length * HEADER_LETTER_WIDTH + HEADER_MARGIN);
                    columnWidth = Math.max(colColumnWidth, cellColumnWidth);
                    columnWidth = fattable.bound(columnWidth, minColumnWidth, MAX_WIDTH);
    
                    if ((hasAnyFilterOnColumn === undefined) || hasAnyFilterOnColumn(header.name)) {
                        columnWidth += FILTER_FLAG_WIDTH;
                    }

                    columnWidthsByName[columnName] = columnWidth;
                }

                columnWidthsByIndex.push(columnWidth);
            }
            return [ columnWidthsByIndex, columnWidthsByName ];
        };
    });

    app.directive('fattable', function(DataikuAPI, ShakerTableModel, computeColumnWidths, ContextualMenu, CreateModalFromDOMElement, CreateModalFromTemplate,
            $filter, $templateCache, $q, $http, $timeout, $compile,Debounce, ShakerProcessorsUtils, ShakerSuggestionsEngine, Logger, WT1, FatTouchableService, FatDraggableService, FatResizableService, ClipboardUtils) {

        // Fattable delegates filling cells / columns header
        // with content to this object.
        function ShakerTablePainter(scope) {

            return $.extend(new fattable.Painter(), {

                setupHeader: function(el) {
                    el.setAttribute("column-header", "header");
                    el.setAttribute("ng-class", "{'columnHeader': true, 'filtered': hasAnyFilterOnColumn(column.name)}");
                 }
            ,
                fillHeader: function(el, headerScope)  {
                    var $el = $(el);
                    this.destroyFormerHeaderScope(el);
                    el.scopeToDestroy = headerScope;
                    $el.empty();
                    $compile($el)(headerScope);
                }
            ,
                destroyFormerHeaderScope: function(el) {
                    if (el.scopeToDestroy !== undefined) {
                        el.scopeToDestroy.$destroy();
                        el.scopeToDestroy = undefined;
                    }
                }
            ,
                fillCellPending: function(el,cell) {
                    el.textContent = "Wait...";
                    el.className = "PENDING"
                }
            ,
                fillCell: function(el, cell)  {
                    const MAX_TITLE_LENGTH = 980;
                    const viewMoreContentLabel = '...\n\nShift + v to view complete cell value.';
                    el.dataset.rowId = cell.rowId;
                    el.dataset.colId = cell.colId;

                    el.title = cell.content && cell.content.length > MAX_TITLE_LENGTH ? cell.content.slice(0, MAX_TITLE_LENGTH) + viewMoreContentLabel : cell.content;

                    if (cell.colorBin !== null) {
                        el.className = cell.status + "-" + cell.colorBin + " " + ["even", "odd"][cell.rowId % 2];
                    } else {
                        el.className = cell.status + " " + ["even", "odd"][cell.rowId % 2];
                    }
                      if (scope.shakerState.lockedHighlighting.indexOf(cell.rowId) >=0) {
                        el.className += " FH";
                    }
                    if(!cell.content){
                        el.textContent = "";
                        return;
                    }

                    // highlight selections
                    var lastDisplayedRow = scope.shakerTable.firstVisibleRow + scope.shakerTable.nbRowsVisible;
                    el.textContent = cell.content.replace(/(\r\n|\n)/g, "¶");

                    if (scope.shaker.coloring && scope.shaker.coloring.highlightWhitespaces) {
                        $(el).html(sanitize(el.textContent)
                                .replace(/^(\s*)/, "<span class='ls'>$1</span>")
                                .replace(/(\s*)$/, "<span class='ts'>$1</span>")
                                .replace(/(\s\s+)/g, "<span class='ms'>$1</span>"));
                    }

                    el.appendChild(document.createElement('div'));
                }
            ,
                setupCell: function(el) {
                    el.oncontextmenu = function(evt) {
                        var row = el.dataset.rowId;
                        var col = el.dataset.colId;
                        scope.showCellPopup(el, row, col, evt);
                        return false;
                    };
                }
            ,
                cleanUpCell: function(cellDiv) {
                    $(cellDiv).remove();
                }
            ,
                cleanUpheader: function(headerDiv) {
                    this.destroyFormerHeaderScope(headerDiv);
                    $(headerDiv).remove();
                }
            });
        }

        return {
            restrict: 'A',
            scope: true,
            link: function(scope, element, attrs) {

                var currentMousePos;

                $(element).mousemove(function(evt) {
                    currentMousePos = {
                        x : evt.clientX,
                        y: evt.clientY
                    }
                });

                var tableDataExpr = attrs.fattableData;

                { // bind "c" to "scroll to column"

                    var shown = false;

                    //<input type="text" class="form-control" ng-model="selectedState" ng-options="state for state in states" placeholder="Enter state" bs-typeahead>
                    scope.openSearchBox = function() {
                        shown=true;
                        const newScope = scope.$new();
                        const controller = function() {
                            newScope.searchHeaderName = function(query) {
                                const columnIds = scope.tableModel.searchHeader(query);
                                return columnIds.map(i => scope.tableModel.headers[i].name);
                            }
                            newScope.move = function(query) {
                                const columnIds = scope.tableModel.searchHeader(query);
                                if (columnIds.length > 0) {
                                    const columnSelected = columnIds[0];
                                    scope.shakerTable.goTo(undefined, columnSelected);
                                }
                            }
                            $("body").addClass("fattable-searchbox-modal");
                            $("#fattable-search").focus();
                        };
                        CreateModalFromTemplate('/templates/shaker/search-column.html', newScope, controller, function(modalScope) {
                            $(".modal").one("hide", function() {
                                shown = false;
                                $("body").removeClass("fattable-searchbox-modal");
                            });
                            modalScope.onSubmit = function(e) {
                                modalScope.dismiss();
                            }
                            modalScope.$on('typeahead-updated', modalScope.onSubmit);
                        });
                    };

                    var $window = $(window);

                    var keyCodes = {
                        tab: 9,
                        pageup: 33,
                        pagedown: 34,
                        left: 37,
                        up: 38,
                        right: 39,
                        down: 40
                    };

                    Mousetrap.bind("c", function() {
                        if (!shown) {
                            scope.hideCellPopup();
                            scope.openSearchBox();
                        }
                    });

                    $window.on("keydown.fattable", function(e){
                        if (["INPUT", "SELECT", "TEXTAREA"].indexOf(e.target.tagName) == -1) {
                            var move = function(dx,dy) {
                                var scrollBar = scope.shakerTable.scroll;
                                var x = scrollBar.scrollLeft + dx;
                                var y = scrollBar.scrollTop + dy;
                                scrollBar.setScrollXY(x,y);
                            };

                            var smallJump = 20;
                            var bigJump = smallJump * 7;
                            switch(e.keyCode) {
                                case keyCodes.up:
                                    move(0, -smallJump);
                                    break;
                                case keyCodes.down:
                                    move(0, smallJump);
                                    break;
                                case keyCodes.left:
                                    move(-smallJump, 0);
                                    break;
                                case keyCodes.right:
                                    move(smallJump, 0);
                                    break;
                                case keyCodes.pagedown:
                                    move(0, bigJump);
                                    break;
                                case keyCodes.pageup:
                                    move(0, -bigJump);
                                    break;
                            }
                        }
                    });

                    scope.$on('scrollToColumn', function(e, columnName) {
                        var c = scope.tableModel.searchHeader(columnName)[0];
                        if (c >= 0) {
                            scope.shakerTable.goTo(undefined, c);
                        }
                    });

                    scope.$on('$destroy', function() {
                        $(window).off("keydown.fattable");
                    });

                }


                // binding cell click events.
                {
                    var $el = $(element);
                    var $currentSelectCell = null;
                    $el.off(".shakerTable");
                    var getRow = function($el) {
                        var rowId = $el[0].dataset.rowId;
                        return $el.siblings("[data-row-id='"+ rowId+ "']");
                    };

                    $el.on("mousedown.shakerTable", ".fattable-body-container > div > div", function(evt) {
                        // Prevent a bit selection of more than one cell.
                        if ($currentSelectCell != null) {
                            $currentSelectCell.parent().find(".selectable").removeClass("selectable");
                            $currentSelectCell.parent().removeClass("inselection");
                        }
                        $currentSelectCell = $(evt.target);
                        $currentSelectCell.addClass("selectable");
                        $currentSelectCell.parent().addClass("inselection");
                    });

                    $el.on("mouseup.shakerTable", ".fattable-body-container > div", function(evt) {
                        if (evt.button != 1 && !scope.shakerReadOnlyActions) {
                            if (!scope.isCellPopupVisible() ) {
                                var target = evt.target;
                                if ($currentSelectCell != null) {
                                    if ($currentSelectCell[0] == target) {
                                        var row = target.dataset.rowId;
                                        var col = target.dataset.colId;
                                        scope.showCellPopup(target, row, col, evt);
                                        // If the event bubbles up to body,
                                        // it will trigger hidePopup.
                                        evt.stopPropagation();
                                    }
                                }
                                $currentSelectCell = null;
                            }
                        }
                    });

                    $el.on("mouseenter.shakerTable", ".fattable-body-container > div > div", function(evt) {
                        getRow($(evt.target)).addClass('H');
                        scope.shakerState.hoverredRow = $(evt.target)[0].dataset.rowId;
                        scope.shakerState.hoverredCol = $(evt.target)[0].dataset.colId;
                    });

                    $el.on("mouseleave.shakerTable", ".fattable-body-container > div > div", function(evt) {
                        var $target = $(evt.target);
                        getRow($target).removeClass('H');
                        scope.shakerState.hoverredRow = null;
                        scope.shakerState.hoverredCol = null;
                    });
                }

                // setuping the cell popup.
                var popupContent = $('<div><div class="popover-content shaker-cell-popover"></div></div>');
                $("body").append(popupContent);

                var cvPopupContent = $('<div><div class="popover-content"></div></div>');
                $("body").append(cvPopupContent);

                var $doc = $(document);

                scope.isCellPopupVisible = function() {
                    return popupContent.css("display") != "none";
                };

                scope.hideCellPopup = function() {
                    var formerPopupScope = popupContent.find(".popover-content > div").first().scope();
                    if ((formerPopupScope != undefined) && (formerPopupScope !== scope)) {
                        formerPopupScope.$destroy();
                    }
                    $doc.unbind("click.shaker.cellPopup");
                    popupContent.css("display", "none");
                };

                scope.hideCVPopup = function(){
                    var formerPopupScope = cvPopupContent.find(".popover-content > div").first().scope();
                    if ((formerPopupScope != undefined) && (formerPopupScope !== scope)) {
                        formerPopupScope.$destroy();
                    }
                    cvPopupContent.css("display", "none");
                }

                scope.toggleRowHighlight = function(rowIdx) {
                    var arr = scope.shakerState.lockedHighlighting;
                    if (arr.indexOf(rowIdx) >=0){
                        arr.splice(arr.indexOf(rowIdx), 1);
                    } else {
                        arr.push(rowIdx);
                    }
                    scope.shakerTable.refreshAllContent(true);
                }

                scope.copyRowAsJSON = async function(rowIdx) {
                    function getColumnSchema(column) {
                        if (scope.shaker.origin === "DATASET_EXPLORE") {
                            return column.datasetSchemaColumn;
                        } else if (scope.shaker.origin === "PREPARE_RECIPE" && column.recipeSchemaColumn) {
                            return column.recipeSchemaColumn.column;
                        }
                    }

                    function getCellPromise(rowIdx, colIdx) {
                        return new Promise((resolve) => {
                            scope.tableModel.getCell(rowIdx, colIdx, resolve);
                        });
                    }

                    function smartCast(colType, colValue) {
                        switch (colType) {
                            case "tinyint":
                            case "smallint":
                            case "int":
                            case "bigint":
                                return Number.parseInt(colValue);
                            case "float":
                            case "double":
                                return Number.parseFloat(colValue);
                            default:
                                return colValue;
                            }
                    }

                    const colTypes = scope.table.headers.reduce((obj, column) => {
                        const colSchema = getColumnSchema(column);
                        obj[column.name] = colSchema ? colSchema.type : null;
                        return obj;
                      }, {});

                    const columnNames = scope.tableModel.allColumnNames;
                    const columnIndices = [...Array(columnNames.length).keys()];
                    const row = {};

                    await Promise.all(columnIndices.map(colIdx => getCellPromise(rowIdx, colIdx)))
                        .then((cells) => {
                            for (const [index, cell] of cells.entries()) {
                                const columnName = columnNames[index];
                                row[columnName] = smartCast(colTypes[columnName], cell.content);
                            }
                        });

                    ClipboardUtils.copyToClipboard(JSON.stringify(row, null, 2), `Row copied to clipboard.`);
                };

                Mousetrap.bind("shift+h", function(){
                    var rowIdx = scope.shakerState.hoverredRow;
                    if (!rowIdx) return;
                    rowIdx = parseInt(rowIdx);
                    scope.$apply(function(){
                        scope.toggleRowHighlight(rowIdx);
                    });
                }, 'keyup');

                 Mousetrap.bind("shift+v", function(){
                    var rowIdx = scope.shakerState.hoverredRow;
                    var colIdx = scope.shakerState.hoverredCol;
                    if (!rowIdx) return;
                    rowIdx = parseInt(rowIdx);
                    colIdx = parseInt(colIdx);
                    scope.$apply(function(){
                        scope.showCVCellPopup(rowIdx, colIdx);
                    });
                }, 'keyup');

                Mousetrap.bind("shift+j", function(){
                    var rowIdx = scope.shakerState.hoverredRow;
                    if (!rowIdx) return;
                    rowIdx = parseInt(rowIdx);
                    scope.$apply(function(){
                        scope.copyRowAsJSON(rowIdx);
                    });
                }, 'keyup');

                scope.$on('$destroy', function() {
                    scope.hideCellPopup();
                    scope.hideCVPopup();
                    $(document).off(".shaker");
                    popupContent.remove();
                    Mousetrap.unbind("shift+h");
                    Mousetrap.unbind("c");
                });

                scope.showCVCellPopup2 = function(cellValue, column, placement){
                    ContextualMenu.prototype.closeAny();
                    var templateUrl = "/templates/shaker/cell-value-popup.html";
                    $q.when($templateCache.get(templateUrl) || $http.get(templateUrl, {
                        cache: true
                    })).then(function(template) {
                        if(angular.isArray(template)) {
                            template = template[1];
                        } else if(angular.isObject(template)) {
                            template = template.data;
                        }
                        var newDOMElt = $('<div>');
                        newDOMElt.html(template);
                        $timeout(function() {
                            var newScope = scope.$new();
                            newScope.cellValue = cellValue;
                            newScope.column = column;
                            $compile(newDOMElt)(newScope);
                            cvPopupContent.find(".popover-content").empty().append(newDOMElt);
                            $timeout(function() {
                                // var placement = getPlacement2(elt, popupContent, evt);
                                cvPopupContent.css("display", "block");
                                cvPopupContent.css(placement.css);
                                var popupClassNames = "shaker-cell-popover popover ";
                                popupClassNames += placement.clazzes.join(" ");
                                cvPopupContent[0].className = popupClassNames;
                                cvPopupContent.on('click', function(e){
                                    if(! $(e.target).closest('a,input,button,select,textarea').length){
                                        e.stopPropagation();
                                    }
                                });
                            }, 0);
                        });
                    });
                }

                scope.showCVCellPopup = function(row, col) {
                    scope.tableModel.getCell(row, col, function(cellData) {
                        var placement = getPlacementForMouse({
                            top: currentMousePos.y,
                            left : currentMousePos.x
                        },
                         popupContent, currentMousePos.x, currentMousePos.y);
                        var cellValue = cellData.content;
                        scope.showCVCellPopup2(cellData.content, scope.table.headers[col], placement);
                    });
                }

                scope.showCellPopup = function(elt, row, col, evt) {
                    ContextualMenu.prototype.closeAny();

                    // TODO eventually get rid of this.
                    // terrible monkey patching
                    {
                        var parent = popupContent.parent();
                        if (popupContent.parent().length == 0) {
                            // why is not under body anymore!?
                            $("body").append(popupContent);
                            WT1.event("shaker-cell-popup-content-disappear");
                            Logger.error("POPUP CONTENT DISAPPEARED. MONKEY PATCH AT WORK");
                        }
                    }
                    // end of terrible monkey...


                    if (!scope.shakerWritable && !scope.shakerReadOnlyActions) return;
                    scope.tableModel.getCell(row, col, function(cellData) {
                        var cellValue = cellData.content;
                        var req = {
                            cellValue: cellValue,
                            type: "cell",
                            row: cellData.origRowIdx, // TODO probably not what we want here.
                            column: scope.table.headers[col].name,
                        };
                        var selection = getSelectionInElement(elt);
                        if (selection != null) {
                            req.type = "content";
                            $.extend(req, selection);
                        }

                        var templateUrl = "/templates/shaker/suggestions-popup.html";
                        $q.when($templateCache.get(templateUrl) || $http.get(templateUrl, {
                            cache: true
                        })).then(function(template) {
                            if(angular.isArray(template)) {
                                template = template[1];
                            } else if(angular.isObject(template)) {
                                template = template.data;
                            }
                            var newDOMElt = $('<div>');
                            newDOMElt.html(template);
                            $timeout(function() {
                                var newScope = scope.$new();
                                newScope.req = req;
                                var invalidCell = cellData.status.indexOf("I") == 0;
                                const appConfig = scope.appConfig || scope.$root.appConfig;
                                newScope.columnData = ShakerSuggestionsEngine.computeColumnSuggestions(scope.table.headers[col], CreateModalFromDOMElement, CreateModalFromTemplate, true, invalidCell, appConfig);
                                newScope.cellData = ShakerSuggestionsEngine.computeCellSuggestions(scope.table.headers[col], cellValue, cellData.status, CreateModalFromDOMElement, appConfig);
                                if(cellValue == null){
                                    cellValue = "";
                                }
                                if (newScope.shakerWritable && req.type == "content") {
                                    newScope.contentData = ShakerSuggestionsEngine.computeContentSuggestions(scope.table.headers[col], cellValue, req.content,
                                                cellData.status, CreateModalFromTemplate, req.startOffset, req.endOffset);
                                }
                                newScope.executeSuggestion = function(sugg) {
                                    sugg.action(scope);
                                };
                                newScope.showCellValue = function(){
                                    scope.showCVCellPopup2(cellValue, scope.table.headers[col], newScope.popupPlacement);
                                }

                                newScope.getStepDescription =function(a,b) {
                                    return ShakerProcessorsUtils.getStepDescription(null, a,b);
                                };
                                newScope.filter = function(val, matchingMode) {
                                    if(!val) {
                                        val = '';
                                    }
                                    var v = {};
                                    v[val] = true;
                                    scope.addColumnFilter(scope.table.headers[col].name, v, matchingMode,
                                        scope.table.headers[col].selectedType.name, scope.table.headers[col].isDouble);
                                };
                                $compile(newDOMElt)(newScope);
                                popupContent.find(".popover-content").empty().append(newDOMElt);
                                $timeout(function() {
                                    var placement = getPlacement2(elt, popupContent, evt);

                                    newScope.popupPlacement = placement;

                                    popupContent.css("display", "block");
                                    popupContent.css(placement.css);
                                    var popupClassNames = "shaker-cell-popover popover ";
                                    popupClassNames += placement.clazzes.join(" ");
                                    popupContent[0].className = popupClassNames;
                                    popupContent.on('click', function(e){
                                        if(! $(e.target).closest('a,input,button,select,textarea').length){
                                            e.stopPropagation();
                                        }
                                    });
                                }, 0);
                            });
                        });
                    });
                };

                scope.shakerTable = null;

                var ratioX = 0;
                var ratioY = 0;
                scope.setNewTable = function(tableData) {
                    if (scope.shakerTable) {
                        if (scope.shakerTable.scroll) {
                            ratioX = scope.shakerTable.scroll.scrollLeft / scope.shakerTable.W;
                            ratioY = scope.shakerTable.scroll.scrollTop  / scope.shakerTable.H;
                        } else {
                            // we're in the middle of refreshing, so use the last saved values of ratioX and ratioY
                            // and anyway scrollLeft and scrollTop haven't been regenerated yet
                        }
                        scope.shakerTable.cleanUp();
                    } else {
                        ratioX = 0;
                        ratioY = 0;
                    }
                    if (scope.tableScope) {
                        scope.tableScope.$destroy();
                        scope.shakerTable.onScroll = null;
                    }
                    scope.tableScope = scope.$new();
                    scope.tableModel = ShakerTableModel(tableData, scope.tableScope);

                    // Absolute minimum for "Decimal (FR format)"
                    var minColumnWidth = 100;
                    var headerHeight = 63;
                    /* Space for schema */
                    if (!scope.shaker.$headerOptions) {
                        if (scope.shaker.origin == "PREPARE_RECIPE" || scope.shaker.origin == "DATASET_EXPLORE") {
                            headerHeight += 19;
                        }
                        if (scope.shakerState.hasAnyComment) {
                            headerHeight += 15;
                        }
                        if (scope.shakerState.hasAnyCustomFields) {
                            headerHeight += 19;
                        }
                    } else {
                        headerHeight += scope.shakerState.hasAnyComment ? -4 : 3;

                        if (!scope.shaker.$headerOptions.showName) {
                            headerHeight -= scope.shakerState.hasAnyComment ? 28 : 34;
                        }

                        if (!scope.shaker.$headerOptions.showStorageType) {
                            headerHeight -= 19;
                        }

                        if (scope.shaker.$headerOptions.showMeaning) {
                            headerHeight += 19;
                        }

                        if (scope.shakerState.hasAnyComment && scope.shaker.$headerOptions.showDescription) {
                            headerHeight += 19;
                        }

                        if (scope.shakerState.hasAnyCustomFields && scope.shaker.$headerOptions.showCustomFields) {
                            headerHeight += 19;
                        }

                        if (!scope.shaker.$headerOptions.showProgressBar) {
                            headerHeight -= 11;
                        }

                        var unwatch = scope.$watch("shaker.$headerOptions", function(nv, ov) {
                            if (!nv || nv == ov) return;
                            unwatch();
                            scope.setNewTable(tableData);
                        }, true);
                    }

                    var ROW_HEIGHT = 27;

                    scope.shaker.columnWidthsByName = scope.shaker.columnWidthsByName || {};
                    [ tableData.columnWidthsByIndex, scope.shaker.columnWidthsByName ] = computeColumnWidths(scope.tableModel.initialChunk, scope.tableModel.headers, minColumnWidth, scope.hasAnyFilterOnColumn, scope.shaker.columnWidthsByName);

                    scope.shakerTable = fattable({
                        "container": element[0],
                        "model": scope.tableModel,
                        "nbRows": scope.tableModel.totalKeptRows,
                        "headerHeight": headerHeight,
                        "rowHeight":  ROW_HEIGHT,
                        "columnWidths": tableData.columnWidthsByIndex,
                        "painter": ShakerTablePainter(scope.tableScope),
                        "autoSetup": false
                    });

                    scope.shakerTable.onScroll = function(x,y) {
                        scope.hideCellPopup();
                        scope.hideCVPopup();
                    }

                    // we save the scroll state, as a ratio.
                    // we scroll back to the position we were at.
                    var newX = (scope.shakerTable.W *ratioX) | 0;
                    var newY = (scope.shakerTable.H *ratioY) | 0;


                    var leftTopCorner = scope.shakerTable.leftTopCornerFromXY(newX, newY);
                    var I = leftTopCorner[0];
                    var J = leftTopCorner[1];

                    var requested = 0;
                    var shakerTable = scope.shakerTable;
                    // A lib like async would have been nice here.
                    // only draw the table if all the
                    // pages are ready.
                    var everythingDone = function() {
                        if (requested == 0) {
                            // we check that the shaker has not
                            // been replaced.
                            if (shakerTable === scope.shakerTable) {
                                scope.shakerTable.setup();
                                scope.shakerTable.scroll.setScrollXY(newX, newY);
                                if (typeof scope.refreshTableDone === 'function') {
                                    scope.refreshTableDone();
                                }
                            }
                        }

                        if (isTouchDevice()) {
                            if (typeof(scope.unsetTouchable) === "function") {
                                scope.unsetTouchable();
                            }
                            scope.unsetTouchable = FatTouchableService.setTouchable(scope, element, scope.shakerTable);
                        }

                        if (attrs.fatDraggable !== undefined) {
                            scope.isDraggable = true;

                            // fatDraggable callback for placeholder shaping : use the whole table height instead of header only
                            scope.onPlaceholderUpdate = function(dimensions) {
                                let table = scope.shakerTable.container;
                                if (table) {
                                    dimensions.height = table.getBoundingClientRect().height;
                                }
                            };

                            FatDraggableService.setDraggable({
                                element: scope.shakerTable.container,
                                onDrop: scope.reorderColumnCallback,
                                onPlaceholderUpdate: scope.onPlaceholderUpdate,
                                scrollBar: scope.shakerTable.scroll,
                                classNamesToIgnore: ['icon-sort-by-attributes', 'sort-indication', 'pull-right', 'fat-resizable__handler']
                            })
                        }

                        if (attrs.fatResizable !== undefined) {
                            scope.isResizable = true;

                            let table = scope.shakerTable.container;
                            let barHeight;
                            if (table) {
                                barHeight = table.getBoundingClientRect().height;
                            }

                            FatResizableService.setResizable({
                                element: scope.shakerTable.container,
                                barHeight: barHeight,
                                onDrop: function(resizeData) {
                                    tableData.columnWidthsByIndex[resizeData.index] = resizeData.width;
                                    scope.shakerHooks.updateColumnWidth(resizeData.name, Math.round(resizeData.width));
                                }
                            })
                        }
                    }
                    for (var i=I; i<I+scope.shakerTable.nbRowsVisible; i+=scope.tableModel.PAGE_HEIGHT) {
                        for (var j=J; j<J+scope.shakerTable.nbColsVisible; j+=scope.tableModel.PAGE_WIDTH){
                            if (!scope.tableModel.hasCell(i,j)) {
                                requested += 1;
                                scope.tableModel.getCell(i,j, function() {
                                    requested -= 1;
                                    everythingDone();
                                });
                            }
                        }
                    }
                    everythingDone();
                }

                // we only resize at the end of the resizing.
                // == when the user has been idle for 200ms.
                var formerScrollLeft = 0;
                var formerScrollTop = 0;
                var debouncedResizingHandler = Debounce().withScope(scope).withDelay(200,200).wrap(function() {
                    if (scope.shakerTable !== null) {
                        // check whether we really need to resize the
                        // the table. See #1851
                        var widthChanged = (scope.shakerTable.w != scope.shakerTable.container.offsetWidth);
                        var heightChanged = (scope.shakerTable.h != scope.shakerTable.container.offsetHeight - scope.shakerTable.headerHeight);
                        if (widthChanged || heightChanged) {
                            scope.shakerTable.setup();
                            scope.shakerTable.scroll.setScrollXY(formerScrollLeft, formerScrollTop);
                        }
                    }
                });
                var wrappedDebouncedResizingHandler = function() {
                    if (scope.shakerTable && scope.shakerTable.scroll) {
                        var scrollBar = scope.shakerTable.scroll;
                        formerScrollLeft = scrollBar.scrollLeft;
                        formerScrollTop = scrollBar.scrollTop;
                    } else {
                        // a table is being refreshed, keep the last known values of the scroll position
                    }
                    debouncedResizingHandler();
                };

                scope.$on('scrollToLine', function(e, lineNum) {
                    var table = scope.shakerTable;
                    if (table && table.scroll) {
                        var nbRowsVisible = table.h / table.rowHeight; // we need the float value
                        var firstVisibleRow = table.scroll.scrollTop / table.rowHeight; // we need the float value
                        var x = table.scroll.scrollLeft;
                        if (lineNum == -1) {
                            var y = table.nbRows * table.rowHeight;
                            table.scroll.setScrollXY(x, y);
                        } else if (lineNum <= firstVisibleRow) {
                            var y = Math.max(lineNum, 0) * table.rowHeight;
                            table.scroll.setScrollXY(x,y);
                        } else if (lineNum >= firstVisibleRow + nbRowsVisible - 1) {
                            var y = (Math.min(lineNum, table.nbRows) + 1) * table.rowHeight - table.h;
                            table.scroll.setScrollXY(x,y);
                        }
                    }
                });

                scope.$on('reflow',wrappedDebouncedResizingHandler);
                $(window).on("resize.shakerTable",wrappedDebouncedResizingHandler);
                scope.$on('resize', wrappedDebouncedResizingHandler);

                $doc.bind("click.shakerTable", scope.hideCellPopup);
                $doc.bind("click.shakerTable", scope.hideCVPopup);
                scope.$on("$destroy", function() {
                    scope.$broadcast("shakerIsGettingDestroyed");
                    $(window).off('.shakerTable');
                    $doc.off('.shakerTable');
                    if (scope.shakerTable) scope.shakerTable.cleanUp();
                    if (scope.tableScope) {
                        scope.tableScope.$destroy();
                    }
                    /* I'm not 100% clear on why we need this but experimentally,
                     * this helps avoid some leaks ... */
                    scope.shakerTable = undefined;
                    scope.tableModel = undefined;
                });

                scope.$on("forcedShakerTableResizing", wrappedDebouncedResizingHandler);

                scope.$watch("shaker.coloring.highlightWhitespaces", function(nv){
                    if (nv === undefined) return;
                    scope.setNewTable(scope.$eval(tableDataExpr));
                });

                scope.$watch(tableDataExpr, function(tableData) {

                    var curScope = undefined;
                    scope.hideCellPopup();
                    scope.hideCVPopup();
                    if (tableData) {
                        scope.setNewTable(tableData);
                    }
                });

            }
        }
    });

    app.directive('columnHeader', function($controller, CreateModalFromDOMElement, CreateModalFromTemplate, ContextualMenu, $state, DataikuAPI, WT1, ShakerSuggestionsEngine) {
        return {
            restrict: 'A',
            replace: false,
            templateUrl: '/templates/shaker/column_header.html',
            scope: true,
            link: function(scope, element, attrs) {

                scope.$on("shakerIsGettingDestroyed", function(){
                    /* Since fattable does not use jQuery to remove its elements,
                     * we need to use jQuery ourselves to remove our children (and
                     * ourselves).
                     * Doing that will ensure that the jQuery data cache is cleared
                     * (it's only cleared when it's jQuery that removes the element)
                     * Without that, since Angular has used jQuery().data() to retrieve
                     * some stuff in the element, the jQuery data cache will always
                     * contain the scope and ultimately the element, leading to massive
                     * DOM leaks
                     */
                    element.empty();
                    element.remove();
                })

                scope.storageTypes = [
                    ['string', 'String'],
                    ['int', 'Integer'],
                    ['double', 'Double'],
                    ['float', 'Float'],
                    ['tinyint', 'Tiny int (8 bits)'],
                    ['smallint', 'Small int (16 bits)'],
                    ['bigint', 'Long int (64 bits)'],
                    ['boolean', 'Boolean'],
                    ['date', 'Date'],
                    ['geopoint', "Geo Point"],
                    ['geometry', "Geometry / Geography"],
                    ['array', "Array"],
                    ['object', "Complex object"],
                    ['map', "Map"]
                ];

                // We avoid using a simple bootstrap dropdown
                // because we want to avoid having the hidden menus
                // DOM polluting our DOM tree.

                scope.anyMenuShown = false;

                scope.menusState = {
                    name: false,
                    meaning: false,
                    type : false,
                    color : false
                }

                scope.menu = new ContextualMenu({
                    template: "/templates/shaker/column-header-contextual-menu.html",
                    cssClass : "column-header-dropdown-menu",
                    scope: scope,
                    contextual: false,
                     onOpen: function() {
                        scope.menusState.name = true;
                    },
                    onClose: function() {
                        scope.menusState.name = false;
                    }
                });

                scope.meaningMenu = new ContextualMenu({
                    template: "/templates/shaker/edit-meaning-contextual-menu.html",
                    cssClass : "column-header-meanings-menu",
                    scope: scope,
                    contextual: false,
                     onOpen: function() {
                        scope.menusState.meaning = true;
                    },
                    onClose: function() {
                        scope.menusState.meaning = false;
                    }
                });

                scope.datasetStorageTypeMenu = new ContextualMenu({
                    template: "/templates/shaker/edit-storagetype-contextual-menu.html",
                    cssClass : "column-header-types-menu",
                    scope: scope,
                    contextual: false,
                     onOpen: function() {
                        scope.menusState.type = true;
                    },
                    onClose: function() {
                        scope.menusState.type = false;
                    }
                });
                scope.colorMenu = new ContextualMenu({
                    template: "/templates/shaker/column-num-color-contextual-menu.html",
                    cssClass : "column-colors-menu",
                    scope: scope,
                    contextual: false,
                     onOpen: function() {
                        scope.menusState.color = true;
                    },
                    onClose: function() {
                        scope.menusState.color = false;
                    }
                });

                scope.toggleHeaderMenu = function() {

                    if (!scope.menusState.name) {
                         element.parent().append(element); //< do not remove this!
                        // It puts the element at the end, and put the menu
                        // over the siblings
                        // The former z-index machinery is broken by the use of css transform.
                        scope.menu.openAlignedWithElement(element.find(".name"), function() {}, true, true);
                    } else {
                        scope.menu.closeAny();
                    }
                };

                scope.toggleMeaningMenu = function() {
                    if (!scope.menusState.meaning) {
                        element.parent().append(element); //< do not remove this!
                        scope.meaningMenu.openAlignedWithElement(element.find(".meaning"), function() {}, true, true);
                    } else {
                        scope.meaningMenu.closeAny();
                    }
                };
                scope.toggleStorageTypeMenu = function() {
                    if (!scope.menusState.type) {
                        element.parent().append(element); //< do not remove this!
                        scope.datasetStorageTypeMenu.openAlignedWithElement(element.find(".storage-type"), function() {}, true, true);
                    } else {
                        scope.datasetStorageTypeMenu.closeAny();
                    }
                };
                 scope.toggleColorMenu = function() {
                    if (!scope.menusState.color) {
                        element.parent().append(element); //< do not remove this!
                        scope.colorMenu.openAlignedWithElement(element.find(".progress:visible"), function() {}, true, true);
                    } else {
                        scope.colorMenu.closeAny();
                    }
                };

                scope.column = scope.header;
                scope.columnIndex = scope.columns.indexOf(scope.column.name);

                scope.isType = function(x) {
                    return this.column.selectedType.name == x;
                };

                scope.possibleMeanings = $.map(scope.column.possibleTypes, function(t) {
                    return t.name;
                });


                    // scope.unprobableTypes = [];
                    // for (var tIdx in scope.types) {
                    //     if ($.inArray(scope.types[tIdx], scope.possibleTypes) == -1) {
                    //         scope.unprobableTypes.push(scope.types[tIdx]);
                    //     }
                    // }

                    // Column have changed, need to update layout -
                    // We only do it for the last column of the layout
                    if (scope.header && scope.table && scope.table.headers && scope.table.headers.length &&
                        scope.column  === scope.table.headers[scope.table.headers.length - 1]) {
                        scope.$emit('updateFixedTableColumns');
                    }
                // });

                if (scope.shakerWritable) {
                    var s = ShakerSuggestionsEngine.computeColumnSuggestions(scope.column, CreateModalFromDOMElement, CreateModalFromTemplate,
                                undefined, undefined, scope.appConfig);
                    scope.suggestions = s[0];
                    scope.moreSuggestions = s[1];
                } else {
                    scope.suggestions = [];
                }

                if (scope.isRecipe){
                    scope.setStorageType = function(newType) {
                        scope.recipeOutputSchema.columns[scope.column.name].column.type = newType;
                        scope.recipeOutputSchema.columns[scope.column.name].persistent = true;
                        scope.schemaDirtiness.dirty = true;
                    };
                }

                scope.executeSuggestion = function(sugg) {
                    sugg.action(scope);
                };
                scope.hasSuggestions = function() {
                    return Object.keys(scope.suggestions).length > 0;
                };
                scope.hasMoreSuggestions = function() {
                    return Object.keys(scope.moreSuggestions).length > 0;
                };

                scope.hasInvalidData = function() {
                    return scope.column.selectedType.nbNOK > 0;
                };
                scope.hasEmptyData = function() {
                    return scope.column.selectedType.nbEmpty > 0;
                };

                scope.setColumnMeaning = function(newMeaning) {
                    scope.shakerHooks.setColumnMeaning(scope.column, newMeaning);
                };

                scope.editColumnUDM = function(){
                    CreateModalFromTemplate("/templates/meanings/column-edit-udm.html", scope, null, function(newScope){
                        newScope.initModal(scope.column.name, scope.setColumnMeaning);
                    });
                }

                scope.setColumnStorageType = function(newType){
                    var schemaColumn = null;

                    if (scope.shaker.origin == "DATASET_EXPLORE") {
                        schemaColumn = scope.column.datasetSchemaColumn;
                    } else if (scope.shaker.origin == "PREPARE_RECIPE") {
                        if (scope.column.recipeSchemaColumn) {
                            schemaColumn = scope.column.recipeSchemaColumn.column;
                        } else {
                            return; // ghost column, added by a stray filter for ex
                        }
                    } else {
                        throw Error("Can't set storage type here origin=" + scope.shaker.origin);
                    }
                    var impact = scope.shakerHooks.getSetColumnStorageTypeImpact(scope.column, newType);
                    if (impact != null) {
                        var doSetStorageType = function(data) {
                            if (data.justDoIt) {
                                scope.shakerHooks.setColumnStorageType(scope.column, newType, null);
                            } else {
                                CreateModalFromTemplate("/templates/shaker/storage-type-change-warning-modal.html", scope, null, function(newScope){
                                    newScope.ok = function() {
                                        newScope.dismiss();
                                        scope.shakerHooks.setColumnStorageType(scope.column, newType, newScope.extraActions.filter(function(a) {return a.selected;}).map(function(a) {return a.id;}));
                                    };
                                    newScope.warnings = data.warnings;
                                    newScope.extraActions = data.extraActions;
                                });
                            }
                        };
                        if (impact.success) {
                            impact.success(doSetStorageType).error(setErrorInScope.bind(scope));
                        } else {
                            impact.then(doSetStorageType);
                        }
                    }
                }
                scope.editThisColumnDetails = function() {
                    var schemaColumn = null;

                    if (scope.shaker.origin == "DATASET_EXPLORE") {
                        schemaColumn = scope.column.datasetSchemaColumn;
                    } else if (scope.shaker.origin == "PREPARE_RECIPE") {
                        if (scope.column.recipeSchemaColumn) {
                            schemaColumn = scope.column.recipeSchemaColumn.column;
                        } else {
                            return; // ghost column, added by a stray filter for ex
                        }
                    } else {
                        schemaColumn = angular.extend({}, scope.shaker.analysisColumnData[scope.column.name], {name: scope.column.name});
                        if (!schemaColumn) {
                            schemaColumn = {name: scope.column.name}
                            scope.shaker.analysisColumnData[scope.column.name] = schemaColumn;
                        }
                    }
                    scope.editColumnDetails(schemaColumn);
                }

                scope.setFilterEmpty = function() {
                    scope.addValidityFilter(scope.column.name, scope.column.selectedType.name, "empty");
                };
                scope.setFilterOK = function() {
                    scope.addValidityFilter(scope.column.name, scope.column.selectedType.name, "ok");
                };
                scope.setFilterNOK = function() {
                    scope.addValidityFilter(scope.column.name, scope.column.selectedType.name, "nok");
                };

                scope.createColumnFilter = function() {
                    scope.addColumnFilter(scope.column.name, {}, 'full_string', scope.column.selectedType.name, scope.column.isDouble);
                }

                scope.deleteColumn = function() {
                    scope.addStepNoPreview("ColumnsSelector", {
                        "keep": false,
                        "appliesTo": "SINGLE_COLUMN",
                        "columns": [ scope.column.name ]
                    });
                    scope.mergeLastColumnDeleters();
                    scope.autoSaveForceRefresh();
                };

                scope.renameColumn = function() {
                    CreateModalFromDOMElement("#rename-column-box", scope, "RenameColumnController", function(newScope) {
                        newScope.setColumn(scope.column.name);
                    });
                };

                scope.datasetInsightLoaded = false;
                scope.callbackDatasetLoaded = function() {
                    if (typeof scope.refreshTableDone === 'function') {
                        scope.refreshTableDone();
                    }
                    scope.datasetInsightLoaded = true;
                }

                scope.moveColumn = function() {
                    CreateModalFromDOMElement("#move-column-box", scope, "MoveColumnController", function(newScope) {
                        newScope.setColumn(scope.column.name);
                    });
                };

                scope.createPredictionModelOnColumn = function(column, datasetName) {
                    if (scope.analysisCoreParams){ // In an analysis, we do not create a new analysis to create the ML task
                        $controller('AnalysisNewMLTaskController', { $scope: scope });
                    } else { // otherwise we create a new analysis
                        $controller('DatasetLabController', { $scope: scope});
                    }
                    scope.newPrediction(column, datasetName);
                };
            }
        };
    });


app.controller("ShakerEditColumnDetailsController", function($scope, $controller, DataikuAPI, $state, Debounce, $stateParams, categoricalPalette, ContextualMenu, CreateModalFromTemplate){
    $scope.column = null;

    $scope.uiState = {};

    $scope.setColumn = function(column) {
        $scope.column = column;
    }

    $scope.save = function() {
        if ($scope.column.customFields && Object.keys($scope.column.customFields).length == 0) {
            delete $scope.column.customFields;
        }
        $scope.shakerHooks.updateColumnDetails($scope.column);
        $scope.dismiss();
    };


    $scope.openMeaningMenu = function($event, column) {
            $scope.meaningMenu.openAtXY($event.pageX, $event.pageY);
            $scope.meaningColumn = column;
    };

    $scope.setColumnMeaning = function(meaningId) {
        $scope.meaningColumn.meaning = meaningId;
        $(".code-edit-schema-box").css("display", "block");
    };

    $scope.editColumnUDM = function() {
        CreateModalFromTemplate("/templates/meanings/column-edit-udm.html", $scope, null, function(newScope) {
            newScope.initModal($scope.meaningColumn.name, $scope.setColumnMeaning);
        });
    };

    $scope.meaningMenu = new ContextualMenu({
        template: "/templates/shaker/edit-meaning-contextual-menu.html",
        cssClass : "column-header-meanings-menu pull-right",
        scope: $scope,
        contextual: false,
        onOpen: function() {},
        onClose: function() {}
    });
});

})();

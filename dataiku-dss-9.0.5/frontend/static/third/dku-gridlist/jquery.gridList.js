/**
 * 
 */

// It does not try to register in a CommonJS environment since jQuery is not
// likely to run in those environments.
(function (factory) {
  if (typeof define === 'function' && define.amd) {
    // AMD. Register as an anonymous module.
    define(['jquery', 'gridlist'], factory);
  } else {
    factory(jQuery, GridList);
  }
}(function($, GridList) {

  var DraggableGridList = function(element, options, draggableOptions, resizableOptions) {
    this.options = $.extend({}, this.defaults, options);
    this.draggableOptions = $.extend(
      {}, this.draggableDefaults, draggableOptions);
    this.resizableOptions = $.extend(
    	      {}, this.resizableDefaults, resizableOptions);

    this.$element = $(element);
    this._init();
    this._bindEvents();
  };

  DraggableGridList.prototype = {

    defaults: {
      lanes: 5,
      direction: "horizontal",
      itemSelector: 'li[data-w]',
      widthHeightRatio: 1,
      readOnly: false
    },

    draggableDefaults: {
      zIndex: 2,
      scroll: false,
      containment: "parent"
    },
    
    resizableDefaults: {
    	ghost: false,
        handles: 'all'
    },

    destroy: function() {
      this._unbindEvents();
    },

    resize: function(lanes) {
      if (lanes) {
        this.options.lanes = lanes;
      }
      this._createGridSnapshot();
      this.gridList.resizeGrid(this.options.lanes);
      this._updateGridSnapshot();

      this.reflow();
    },
    
    positionPositionlessElements: function() {
	    this._createGridSnapshot();
	    this.gridList.positionPositionlessElements();
	    this._updateGridSnapshot();
	
	    this.reflow();
	  },

    resizeItem: function(element, size) {
      /**
       * Resize an item.
       *
       * @param {Object} size
       * @param {Number} [size.w]
       * @param {Number} [size.h}
       */
    	if (!this.options.readOnly) {
			this._createGridSnapshot();
			this.gridList.resizeItem(this._getItemByElement(element), size);
			this._updateGridSnapshot();
			this._updateWidestTallestItem();
			
			this.render();
    	}
    },

    moveAndResizeItem: function(element, item) {
      /**
       * Move and resize an item.
       *
       * @param {Object} item
       * @param {Number} [item.x]
       * @param {Number} [item.y]
       * @param {Number} [item.w]
       * @param {Number} [item.h}
       */
      if (!this.options.readOnly) {
        this.gridList.moveAndResizeItem(this._getItemByElement(element), item);
        this._updateWidestTallestItem();

        this.render();
      }
    },
    
    deleteItem: function(element) {
    	if (!this.options.readOnly) {
    		this._createGridSnapshot();
        	this.gridList.deleteItem(this._getItemByElement(element));
        	this._updateGridSnapshot();
        	this._updateWidestTallestItem();
        	
        	this.render();
    	}
    },
    
    addItem: function(element) {
    	if (!this.options.readOnly && !this._getItemByElement(element)) {
    		this._createGridSnapshot();
        	this.gridList.addItem(this._generateItemFromElement(element));
        	this._updateGridSnapshot();
        	this._updateWidestTallestItem();
        	this._makeElementDraggable(element);
        	this._makeElementResizable(element);
        	this._bindEventToElement(element);
        	this.render();
    	}
    },

    reflow: function() {
      this._calculateCellSize();
      this.render();
    },

    render: function() {
      this._applySizeToItems();
      this._applyPositionToItems();
    },

    _bindMethod: function(fn) {
      /**
       * Bind prototype method to instance scope (similar to CoffeeScript's fat
       * arrow)
       */
      var that = this;
      return function() {
        return fn.apply(that, arguments);
      };
    },

    _init: function() {
      // Read items and their meta data. Ignore other list elements (like the
      // position highlight)
      this.$items = this.$element.children(this.options.itemSelector);
      this.items = this._generateItemsFromDOM();
      this._updateWidestTallestItem();

      // Used to highlight a position an element will land on upon drop
      this.$positionHighlight = this.$element.find('.position-highlight').hide();

      this._initGridList();
      this.reflow();

      if (!this.options.readOnly) {
        // Init Draggable JQuery UI plugin for each of the list items
        // http://api.jqueryui.com/draggable/
        this._makeElementDraggable(this.$items);
        this._makeElementResizable(this.$items);
      }
    },
    
    _makeElementDraggable: function(element) {
    	element.draggable(this.draggableOptions);
    },
    
    _makeElementResizable: function(element) {
        //element.resizable({grid: cellWidth, ghost:true});
        element.resizable(this.resizableOptions);
    },
    
    _updateWidestTallestItem: function() {
    	this._widestItem = Math.max.apply(
			null, this.items.map(function(item) { return item.w; }));
    	this._tallestItem = Math.max.apply(
	        null, this.items.map(function(item) { return item.h; }));
	},

    _initGridList: function() {
      // Create instance of GridList (decoupled lib for handling the grid
      // positioning and sorting post-drag and dropping)
      this.gridList = new GridList(this.items, {
        lanes: this.options.lanes,
        direction: this.options.direction
      });
    },

    _bindEvents: function() {
      this._onStart = this._bindMethod(this._onStart);
      this._onDrag = this._bindMethod(this._onDrag);
      this._onStop = this._bindMethod(this._onStop);
      this._onResize = this._bindMethod(this._onResize);
      this._onResizeStop = this._bindMethod(this._onResizeStop);
      this._bindEventToElement(this.$items);
    },
    
    _bindEventToElement: function(element) {
    	element.on('dragstart', this._onStart);
        element.on('drag', this._onDrag);
        element.on('dragstop', this._onStop);
        element.on('resizestart', this._onStart);
        element.on('resize', this._onResize);
        element.on('resizestop', this._onResizeStop);
    },

    _unbindEvents: function() {
      this.$items.off('dragstart', this._onStart);
      this.$items.off('drag', this._onDrag);
      this.$items.off('dragstop', this._onStop);
      this.$items.off('resizestart', this._onStart);
      this.$items.off('resize', this._onResize);
      this.$items.off('resizestop', this._onResizeStop);
    },

    _onStart: function(event, ui) {
      // Create a deep copy of the items; we use them to revert the item
      // positions after each drag change, making an entire drag operation less
      // distructable
      this._createGridSnapshot();

      // Since dragging actually alters the grid, we need to establish the number
      // of cols (+1 extra) before the drag starts

      this._maxGridCols = 1000; //this.gridList.grid.length;
    },

    _onDrag: function(event, ui) {
      var item = this._getItemByElement(ui.helper),
          newPosition = this._snapItemPositionToGrid(item);

      // When using containment = 'parent', jQuery only computes the containment box on dragstart, because our parent can change size during drag, we need to update this every time
      item.$element.data('ui-draggable')._setContainment();

      if (this._dragPositionChanged(newPosition)) {
        this._previousDragPosition = newPosition;

        // Regenerate the grid with the positions from when the drag started
        GridList.cloneItems(this._items, this.items);
        this.gridList.generateGrid();

        // Since the items list is a deep copy, we need to fetch the item
        // corresponding to this drag action again
        item = this._getItemByElement(ui.helper);
        this.gridList.moveItemToPosition(item, newPosition);

        // Visually update item positions and highlight shape
        this._applyPositionToItems();
        this._highlightPositionForItem(item);
      }
    },

    _onStop: function(event, ui) {
      this._updateGridSnapshot();
      this._previousDragPosition = null;

      // HACK: jQuery.draggable removes this class after the dragstop callback,
      // and we need it removed before the drop, to re-enable CSS transitions
      $(ui.helper).removeClass('ui-draggable-dragging');

      this._applyPositionToItems();
      this._removePositionHighlight();
    },
    
    _onResize: function(event, ui) {
      event.stopPropagation();

      // Regenerate the grid with the positions from when the resize started
      GridList.cloneItems(this._items, this.items);
      this.gridList.generateGrid();
      
      var w = Math.round((ui.size.width+6)/this._cellWidth);
      var h = Math.round((ui.size.height+6)/this._cellWidth);
      var x = Math.round(ui.position.left/this._cellWidth);
      var y = Math.round(ui.position.top/this._cellWidth);

      // Handle cases when the minimum size has been reached
      if (w <= 0) {
        w = 1;
        if (ui.position.left > ui.originalPosition.left) {
          x = Math.floor((ui.position.left)/this._cellWidth);
        }
      }

      if (h <= 0) {
        h = 1;
        if (ui.position.top > ui.originalPosition.top) {
          y = Math.floor((ui.position.top)/this._cellWidth);
        }
      }

      var overflow = x+w - this.options.lanes;
      if (overflow > 0) {
        x -= overflow;
        if (x < 0) {
          w += x;
        }
      }

      this.moveAndResizeItem(ui.element, {
        w: w,
        h: h,
        x: Math.max(0, x),
        y: Math.max(0, y)
      });
    },
    
    _onResizeStop: function(event, ui) {
    	this._onResize(event, ui);
        this._updateGridSnapshot();
    },

    _generateItemsFromDOM: function() {
      /**
       * Generate the structure of items used by the GridList lib, using the DOM
       * data of the children of the targeted element. The items will have an
       * additional reference to the initial DOM element attached, in order to
       * trace back to it and re-render it once its properties are changed by the
       * GridList lib
       */
      
      var _this = this,
          items = [],
          item;
      
      this.$items.each(function(i, element) {
        items.push(_this._generateItemFromElement(element));
      });
      return items;
    },
    
    _generateItemFromElement: function(element) {
    	return {
            $element: $(element),
            x: parseInt($(element).attr('data-x')),
            y: parseInt($(element).attr('data-y')),
            w: parseInt($(element).attr('data-w')),
            h: parseInt($(element).attr('data-h')),
            id: ($(element).attr('data-id'))
          };
    },

    _getItemByElement: function(element) {
      // XXX: this could be optimized by storing the item reference inside the
      // meta data of the DOM element
      for (var i = 0; i < this.items.length; i++) {
        if (this.items[i].$element.is(element)) {
          return this.items[i];
        }
      }
    },

    _calculateCellSize: function() {
      if (this.options.direction === "horizontal") {
        this._cellHeight = Math.floor(this.$element.height() / this.options.lanes);
        this._cellWidth = this._cellHeight * this.options.widthHeightRatio;
      } else {
        this._cellWidth = Math.floor(this.$element.width() / this.options.lanes);
        this._cellHeight = this._cellWidth / this.options.widthHeightRatio;
      }
      if (this.options.heightToFontSizeRatio) {
        this._fontSize = this._cellHeight * this.options.heightToFontSizeRatio;
      }
    },

    _getItemWidth: function(item) {
      return item.w * this._cellWidth;
    },

    _getItemHeight: function(item) {
      return item.h * this._cellHeight;
    },

    _applySizeToItems: function() {
      for (var i = 0; i < this.items.length; i++) {
        this.items[i].$element.css({
          width: this._getItemWidth(this.items[i]),
          height: this._getItemHeight(this.items[i])
        });
      }
      if (this.options.heightToFontSizeRatio) {
        this.$items.css('font-size', this._fontSize);
      }
    },

    _applyPositionToItems: function() {
      // TODO: Implement group separators
      for (var i = 0; i < this.items.length; i++) {
        // Don't interfere with the positions of the dragged items
        if (this.items[i].move) {
          continue;
        }
        this.items[i].$element.css({
          left: this.items[i].x * this._cellWidth,
          top: this.items[i].y * this._cellHeight
        });
      }
      // Update the width of the entire grid container with enough room on the
      // right to allow dragging items to the end of the grid.
      if (this.options.direction === "horizontal") {
        this.$element.width(
          (this.gridList.grid.length + this._widestItem) * this._cellWidth);
      } else {
        this.$element.height(
          (this.gridList.grid.length + (this.options.readOnly ? 0 : this._tallestItem)) * this._cellHeight);
      }
    },

    _dragPositionChanged: function(newPosition) {
      if (!this._previousDragPosition) {
        return true;
      }
      return (newPosition[0] != this._previousDragPosition[0] ||
              newPosition[1] != this._previousDragPosition[1]);
    },

    _snapItemPositionToGrid: function(item) {
      var position = item.$element.position();

      position[0] -= this.$element.position().left;

      var col = Math.round(position.left / this._cellWidth),
          row = Math.round(position.top / this._cellHeight);

      // Keep item position within the grid and don't let the item create more
      // than one extra column
      col = Math.max(col, 0);
      row = Math.max(row, 0);

      if (this.options.direction === "horizontal") {
        col = Math.min(col, this._maxGridCols);
        row = Math.min(row, this.options.lanes - item.h);
      } else {
        col = Math.min(col, this.options.lanes - item.w);
        row = Math.min(row, this._maxGridCols);
      }

      return [col, row];
    },

    _highlightPositionForItem: function(item) {
      this.$positionHighlight.css({
        width: this._getItemWidth(item),
        height: this._getItemHeight(item),
        left: item.x * this._cellWidth,
        top: item.y * this._cellHeight
      }).show();
      if (this.options.heightToFontSizeRatio) {
        this.$positionHighlight.css('font-size', this._fontSize);
      }
    },

    _removePositionHighlight: function() {
      this.$positionHighlight.hide();
    },

    _createGridSnapshot: function() {
      this._items = GridList.cloneItems(this.items);
    },

    _updateGridSnapshot: function() {
      // Notify the user with the items that changed since the previous snapshot
      this._triggerOnChange();
      GridList.cloneItems(this.items, this._items);
    },

    _triggerOnChange: function() {
      if (typeof(this.options.onChange) != 'function') {
        return;
      }
      this.options.onChange.call(
        this, this.gridList.getChangedItems(this._items, '$element'));
    }
  };

  $.fn.gridList = function(options, draggableOptions, resizableOptions) {
    var instance,
        method,
        args;
    if (typeof(options) == 'string') {
      method = options;
      args =  Array.prototype.slice.call(arguments, 1);
    }
    this.each(function() {
      instance = $(this).data('_gridList');
      // The plugin call be called with no method on an existing GridList
      // instance to re-initialize it
      if (instance && !method) {
        instance.destroy();
        instance = null;
      }
      if (!instance) {
        instance = new DraggableGridList(this, options, draggableOptions, resizableOptions);
        $(this).data('_gridList', instance);
      }
      if (method) {
        instance[method].apply(instance, args);
      }
    });
    // Maintain jQuery chain
    return this;
  };

}));
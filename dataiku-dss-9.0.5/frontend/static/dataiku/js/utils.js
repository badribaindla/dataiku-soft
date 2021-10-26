const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const getDayLabels = (day) => {
    return [...WEEKDAYS][day];
}

//Array Remove - By John Resig (MIT Licensed)
Array.remove = function(array, from, to) {
	var rest = array.slice((to || from) + 1 || array.length);
	array.length = from < 0 ? array.length + from : from;
	return array.push.apply(array, rest);
};

Array.range = function(n) {
    return Array.from(Array(n).keys());
}

Array.dkuFindFn = function(array, predicate) {
    var i = 0;
    for (i = 0; i < array.length; i++) {
        if (predicate(array[i])) {
            return array[i];
        }
    }
    return null;
}

Array.move = function(array, fromIndex, toIndex) { 
    const elementToMove = array[fromIndex];
    array.splice(fromIndex, 1);
    array.splice(toIndex, 0, elementToMove);
};

// polyfill for missing funciton in Chrome >= 48
SVGElement.prototype.getTransformToElement = SVGElement.prototype.getTransformToElement || function(elem) {
    // see for ex https://github.com/cpettitt/dagre-d3/issues/202
    return elem.getScreenCTM().inverse().multiply(this.getScreenCTM());
}

// Polyfills for Object.values & entries for our old Selenium
Object.values = Object.values ? Object.values : function(obj) {
    var allowedTypes = ["[object String]", "[object Object]", "[object Array]", "[object Function]"];
    var objType = Object.prototype.toString.call(obj);

    if (obj === null || typeof obj === "undefined") {
        throw new TypeError("Cannot convert undefined or null to object");
    } else if (!~allowedTypes.indexOf(objType)) {
        return [];
    } else {
        var result = [];
        for (var prop in obj) {
            if (obj.hasOwnProperty(prop)) {
                result.push(obj[prop]);
            }
        }

        return result;
    }
};

Object.entries = Object.entries ? Object.entries : function(obj) {
    var allowedTypes = ["[object String]", "[object Object]", "[object Array]", "[object Function]"];
    var objType = Object.prototype.toString.call(obj);

    if (obj === null || typeof obj === "undefined") {
        throw new TypeError("Cannot convert undefined or null to object");
    } else if (!~allowedTypes.indexOf(objType)) {
        return [];
    } else {
        var result = [];
        for (var prop in obj) {
            if(obj.hasOwnProperty(prop)) {
                result.push([prop, obj[prop]]);
            }
        }

        return objType === "[object Array]" ? result : result.sort(function(a, b) { return a[1] - b[1]; });
    }
};

// http://stackoverflow.com/questions/6274339/how-can-i-shuffle-an-array-in-javascript
Array.dkuShuffle = function(array) {
    var counter = array.length, temp, index;

    // While there are elements in the array
    while (counter > 0) {
        // Pick a random index
        index = Math.floor(Math.random() * counter);

        // Decrease counter by 1
        counter--;

        // And swap the last element with it
        temp = array[counter];
        array[counter] = array[index];
        array[index] = temp;
    }

    return array;
}

Array.reshape2d = function(unrolled, len) {
	return unrolled.reduce(function(ret, v, i){
		if (i % len === 0) ret.push([]);
		ret[ret.length - 1].push(v);
		return ret;
	}, []);
};

const dkuEvents = {
    datasetsListChanged : "datasetsListChanged",
    datasetChanged : "datasetChanged"
};

function log10(x) {
    return Math.log(x) / Math.log(10);
}

function isInteger(x) {
    return Math.floor(x) == x;
}

function removeFirstFromArray(arr, el) {
    var idx = arr.indexOf(el);
    if (idx == -1) {
        return false;
    } else {
        arr.splice(idx, 1);
        return true;
    }
}

function regexLastIndexOf(ptn, str) {
    /* Same as lastIndexOf, but for regexp.
     * Returns -1 if not found.
     */
    var res = -1;
    var m = null;
    do {
        m = ptn.exec(str);
        if (m) {
            res = m.index;
        }
    } while (m);
    return res;
}

// http://stackoverflow.com/questions/4856717/javascript-equivalent-of-pythons-zip-function
function zip() {
    var args = [].slice.call(arguments);
    var shortest = args.length==0 ? [] : args.reduce(function(a,b){
        return a.length<b.length ? a : b
    });

    var ret = shortest.map(function(_,i){
        return args.map(function(array){return array[i]})
    });
    return ret;
}


function getSelectionInElement(elt) {
    /* Returns an object
     * { "startOffset": ..., "endOffset": ..., "content": ...}
     * describing the current selection in the element elt.
     *
     * Returns null if the selection spans on external
     * elements, or if there is no selections
     *
     */
    var selection = window.getSelection();
    if ( (!selection.type || selection.type == "Range") ) { //< Firefox does not support type
        let selRange = selection.getRangeAt(0);
        if (selRange.commonAncestorContainer.parentElement === elt) {
            let startOffset = selRange.startOffset;
            let endOffset = (selRange.endOffset == 0 ? selRange.startContainer.textContent.length: selRange.endOffset);
            if (endOffset - startOffset > 0) {
                // Request for suggestion related to the selection
                // as well.
                return {
                    "startOffset": startOffset,
                    "endOffset": endOffset,
                    "content": selRange.startContainer.textContent.substring(startOffset, endOffset)
                }
            }
        }
    }
    return null;
}

var resolveDatasetFullName = function(smartName, defaultProjectKey) {
    if (smartName.indexOf(".") > 0) {
        var chunks = smartName.split(".");
        return {projectKey: chunks[0], datasetName: chunks[1]}
    } else {
        return {projectKey: defaultProjectKey, datasetName: smartName};
    }
}

var resolveObjectSmartId = function(smartName, defaultProjectKey) {
    if (smartName && smartName.indexOf(".") > 0) {
        var chunks = smartName.split(".");
        return {projectKey: chunks[0], id: chunks[1]}
    } else {
        return {projectKey: defaultProjectKey, id: smartName};
    }
};

var createObjectSmartId = function(id, contextProjectKey) {
    if (smartName && smartName.indexOf(".") > 0) {
        var chunks = smartName.split(".");
        return {projectKey: chunks[0], id: chunks[1]}
    } else {
        return {projectKey: defaultProjectKey, id: smartName};
    }
};


function userFriendlyTransmogrify(base, listOfObjects, key, sep, prefixFirst) {
	sep = sep || " ";
    var cur = base + (prefixFirst ? (sep + 1) : '');
    var names = []
    for (var i = 0; i < listOfObjects.length; i++) {
        names.push(listOfObjects[i][key]);
    }
    i = 1;
    while (true) {
        if (names.indexOf(cur) < 0) {
            return cur
        }
        cur = base + sep + (++i)
    }
}

function contains(l, el) {
    return l.indexOf(el) >= 0;
}


function clearSelection() {
    if(document.selection && document.selection.empty) {
        document.selection.empty();
    } else if(window.getSelection) {
        var sel = window.getSelection();
        sel.removeAllRanges();
    }
}

function listDifference(left, right) {
    /* Returns the list of elements of left
     * that are not in right.
     * Order is retained. Multiplicity
     * is retained : 2 elements with value x in left
     * 1 element with value x in right results in 2-1=1
     * with value x.
     */
    if (!left) {
        return [];
    }
    var result = left.slice(0);
    for (var i=0; i<right.length; i++) {
        var it = right[i];
        var idx = result.indexOf(it);
        if (idx != -1) {
            result.splice(idx,1);
        }
    }
    return result;
}

//shallow copy list into dest
function listCopyContent(dest, list) {
    dest.splice(0, dest.length);
    $.extend(dest, list);
    return dest;
}

// removes all field of an object
function clear(obj) {
    for (var prop in obj) { if (obj.hasOwnProperty(prop)) { delete obj[prop]; } }
}

/* Replace all elements of the 'old' map by the elements of the 'new' map */
function mapCopyContent(oldMap, newMap) {
    clear(oldMap);
    for (var prop in newMap) {
        if (newMap.hasOwnProperty(prop)) {
            oldMap[prop] = newMap[prop];
        }
    }
}

/**
 * Fakes a click on a link.
 * Makes it possible to properly handle middle-click
 * left-click where a proper anchor element would
 * have been cumbersome.
 */
function fakeClickOnLink(url, evt) {
    var cloneEvent = document.createEvent('MouseEvents');
    var e = evt.originalEvent || evt;
    cloneEvent.initMouseEvent("click", e.bubbles, e.cancelable, window, e.detail,
    e.screenX, e.screenY, e.clientX, e.clientY, e.ctrlKey, e.altKey, e.shiftKey,
    e.metaKey, e.button, e.relatedTarget);
    var $fakeLink = $("<a>").attr("href", url);
    $("body").append($fakeLink);
    $fakeLink[0].dispatchEvent(cloneEvent);
    $fakeLink.remove();
}

function getCookie(ckie) {
    var i, chunks;
    var cookies = document.cookie.split('; ');
    for (i = 0; i < cookies.length; i++) {
        chunks = cookies[i].split('=');
        if (chunks[0] === ckie) {
            return decodeURIComponent(chunks[1]);
        }
    }
    return null;
}

function setCookie(name, value, lifeMinutes) {
    var ckie = name + '=' + encodeURIComponent(value) + "; ";
    var expr = new Date(new Date().getTime() + lifeMinutes * 60 * 1000);
    ckie += "expires=" + expr.toGMTString() + "; ";
    ckie += "path=/; ";
    //ckie += "domain=" + document.location.host + "; ";
    document.cookie = ckie;
}

// Find the closest ancestor with overflow
jQuery.fn.extend({
    overflowParent: function() {
        return this.map(function() {
            var overflowParent = this;
            while ( overflowParent && ( !jQuery.nodeName( overflowParent, "html" ) && jQuery.css( overflowParent, "overflow") === "visible" ) ) {
                overflowParent = $(overflowParent).parent()[0];
            }
            return overflowParent || document.documentElement;
        });
    }
});


// Like jQuery extend but recursively merge objects.
// At the moment. no distinction is made between objects and arrays.
function rextend(dest, ext) {
    for (var k in ext) {

        if (ext.hasOwnProperty(k)) {
            var v = ext[k];
            if ( dest.hasOwnProperty(k) && (typeof dest[k] == "object") && (typeof v == "object")) {
                rextend(dest[k], v);
            }
            else {
                dest[k] = v;
            }
        }
    }
    return dest;
}

// OS detection
if (navigator.appVersion.indexOf("Win")!=-1){
    $('html').addClass('windows');
}
if (navigator.appVersion.indexOf("Mac")!=-1){
    $('html').addClass('macos');
}
if (navigator.appVersion.indexOf("X11")!=-1){
    $('html').addClass('unix');
}
if (navigator.appVersion.indexOf("Linux")!=-1){
    $('html').addClass('linux');
}
if (!!window.chrome) {
    $('html').addClass("chrome");
}

var getPlacement = function(cell) {
    var height = $(document).height();
    var width = $(document).width();

    var offset = $(cell).offset();
    var position = {};

    var vert = 0.5 * height - offset.top;
    var horiz = 0.5 * width - offset.left;

    if (vert > 0) {
        // put it on the bottom
        position.top = offset.top + $(cell).height();
    } else {
        // put it on the top
        position.bottom = height - offset.top;
    }
    if (horiz > 0) {
        // put it on the right
        position.left = offset.left + ($(cell).width() / 2) - 15;
    } else {
        // put it on the left
        position.right = width - offset.left - ($(cell).width() / 2) - 20;
    }

    return position;
};

var getPlacement2 = function(cell, popup, evt) {
    var mouseX = evt.pageX;
    var mouseY = evt.pageY;
    return getPlacementForMouse($(cell).offset(), popup, mouseX, mouseY)
}
var getPlacementForMouse = function(cellOffset, popup, mouseX, mouseY) {
    var screenHeight = $(window).height();
    var screenWidth = $(window).width();

    var popupHeight = $(popup).height();
    var popupWidth = $(popup).width();

    var ret = { css : {}, clazzes : {} };

    var popupFitsOnRight = (mouseX + popupWidth + 15 < screenWidth);
    var popupFitsOnBottom = (mouseY + popupHeight + 15 < screenHeight);
    var popupFitsOnTop = (mouseY -  popupHeight - 15 > 0);

    if (popupFitsOnRight) {
        ret.css.left = mouseX + 5;
    } else {
        if (popupFitsOnTop || popupFitsOnBottom) {
            // Put it next to the mouse
            ret.css.left = mouseX - 5 - popupWidth;
        } else {
            // Popup will have to be put in the middle of the cell, so
            // Put it on the left of the cell so that content remains visible.
            ret.css.left = cellOffset.left - 5 - popupWidth;
        }
    }

    if (popupFitsOnBottom) {
        ret.css.top = mouseY + 5;
    } else if (popupFitsOnTop) {
        ret.css.top = mouseY - 5 - popupHeight;
    } else {
        ret.css.top = mouseY - popupHeight / 2;
        if (ret.css.top < 0) {
            ret.css.top = 0; // Best we can do ...
        }
    }

    if (popupFitsOnRight && popupFitsOnBottom) {
        ret.clazzes = ["leftTopPopover"];
    } else if (popupFitsOnRight && popupFitsOnTop) {
        ret.clazzes = ["leftBottomPopover"];
    } else if (popupFitsOnRight) {
        ret.clazzes = ["leftMidPopover"];
    } else if (popupFitsOnBottom) {
        ret.clazzes = ["rightTopPopover"];
    } else if (popupFitsOnTop) {
        ret.clazzes = ["rightBottomPopover"];
    } else {
        ret.clazzes = ["rightMidPopover"];
    }

    // console.info("popup " + popupWidth + "x" + popupHeight + " fitsOnRight=" + popupFitsOnRight
    //     + " fitsOnBot=" + popupFitsOnBottom + " mous=" + mouseX + "," + mouseY +
    //     "screen " + screenWidth + "X" + screenHeight + " --> ", ret);
    return ret;
};

// http://stackoverflow.com/questions/3749231
var downloadURL = function(url) {
    var hiddenIFrameID = 'hiddenDownloader',
        iframe = document.getElementById(hiddenIFrameID);
    if (iframe == null) {
        iframe = document.createElement('iframe');
        iframe.id = hiddenIFrameID;
        iframe.style.display = 'none';
        document.body.appendChild(iframe);
    }
    iframe.src = url;
};

var getPosition = function (el) {
    if (typeof el.getBoundingClientRect == 'function') {
        return el.getBoundingClientRect();
    }
    else {
        return $.extend({
            width: el.offsetWidth,
            height: el.offsetHeight,
        }, $(el).offset());
    }
};

function getDigestTime(scope, callback) {
    var before = new Date().getTime();
    scope.$$postDigest(function() {
        var now = new Date().getTime();
        callback(now-before);
    });
}

function safeApply(scope, fn) {
    var phase = scope.$root.$$phase;
    if(phase == '$apply' || phase == '$digest') {
        return scope.$eval(fn);
    } else {
        return scope.$apply(fn);
    }
}

// scope: current scope
// dirty: function that returns if the object is dirty
// msg: custom message to display
// allowedTransitions: either:
//                         - a list of target states names that are allowed even if the object is dirty
//                         - a function that get the state & params from origin and target
function checkChangesBeforeLeaving(scope, dirty, msg, allowedTransitions) {
    if (typeof dirty != 'function') {
        console.error("Dirtyness detection is not valid. typeof dirty = ", typeof dirty, dirty); /*@console*/  // NOSONAR: OK to use console.
    }
    window.dssHasDirtyThings = dirty;
    var msg = msg || 'You have unsaved changes, are you sure you want to leave ?';
    scope.$on('$stateChangeStart', function (event, toState, toParams, fromState, fromParams) {
        if (event.defaultPrevented) return;
        const data = {
            toState: toState,
            toParams: toParams,
            fromState: fromState,
            fromParams: fromParams
        };
        if (Array.isArray(allowedTransitions) && allowedTransitions.indexOf(toState.name) > -1) return;
        if (typeof allowedTransitions == 'function' && allowedTransitions(data)) return;
        var isDirty = false;
        try { // Don't keep the reference to the scope in dssHasDirtyThings, so never fail this check!
            isDirty = dirty(data);
        } catch (e) {
            console.error("Failed to check dirtiness"); /*@console*/  // NOSONAR: OK to use console.
        }
        if (isDirty) {
            if (!confirm(msg)) { // NOSONAR: Yes we want to display a pop-up
                event.preventDefault();
            }
        } else {
            window.dssHasDirtyThings = void 0; // Don't keep that reference!
        }
    });
}

function ensureVisible(element, parent) {
    parent = $(parent);
    element = $(element);
    if (!parent) parent = document.body;

    // only if not already visible
    var offsetWithinScroll = element[0].offsetTop - parent[0].offsetTop;
    if (offsetWithinScroll < parent.scrollTop()){
        // above
        parent.scrollTop(offsetWithinScroll);
    }
    if((offsetWithinScroll + element.outerHeight()) > (parent.scrollTop() + parent.height())){
        // under
        parent.scrollTop(offsetWithinScroll - parent.innerHeight() + element.outerHeight());
    }
}

function objectMatchesQuery(query, object) {
    var i, arr;
    for (var key in object) {
        if( typeof object[key] === 'object' ) {
            if (objectMatchesQuery(query, object[key])) {
                return true;
            }
        } else if (angular.isArray(object[key])) {
            arr = object[key];
            for (i = 0; i < arr.length; i++) {
                if (objectMatchesQuery(query, arr[i])) {
                    return true;
                }
            }
        } else if (query instanceof RegExp) {
            if (query.test(object[key])) {
                return true;
            }
        } else {
            if (("" + object[key]).toLowerCase().indexOf(query.toLowerCase()) >= 0) {
                return true;
            }
        }
    }
    return false;
}

function sanitize(value) {
    if(value!==null && value!==undefined) {
        return $("<div/>").text(value+'').html();
    }
    return value;
}

function arrayDedup(arr) {
    return arr.filter(function(v,i) { return arr.indexOf(v)==i; });
}

function arr2obj(arr) { // [ [k1, v1], [k2, v2, v2_2] ]  =>  {k1: v1, k2: [v2, v2_2]}
    return arr.reduce(function (o, v) { o[v[0]] = v.length === 2 ? v[1] : v.slice(1); return o; }, {});
}
function obj2arr(obj) { // ~reverse: {k1: v1, k2: [v2, v2_2]} => [ [k1, v1], [k2, [v2, v2_2]] ]
    return Object.keys(obj).map(function(k) { return [k, obj[k]]; });
}

/** MUST MATCH The Java function */
function graphVizEscape(str) {
    var out = '';
    for(var i = 0 ; str && i < str.length ; i++) {
        var c = str[i];
        if((c>='a'&&c<='z') || (c>='A'&&c<='Z') ||(c>='0'&&c<='9')) {
            out+=c;
        } else if(c=='_'){
            out += '__';
        } else {
            out+= '_'+c.charCodeAt(0)+'_';
        }
    }
    return out;
}

function graphVizUnescape(str) {
    let out = ''
    for (let i = 0; i < str.length; i++) {
        let c = str[i];
        if (c == '_') {
            let n = 0;
            let z = false;
            for (i++; i < str.length; i++) {
                c = str[i];
                if (c == '_') {
                    break;
                } else {
                    z = true;
                    n = 10 * n + (c - '0');
                }
            }
            if (z) {
                out += String.fromCharCode(n);
            } else {
                out += '_';
            }
        } else {
            out += c;
        }
    }
    return out;
}

function graphIdFor(type, id) {
    return graphVizEscape(`${type.toLowerCase().replace('_', '')}_${id}`);
}

function generateRandomId(len) {
    var out = ''
    for(var i = 0 ; i < len ; i++) {
        out += String.fromCharCode('a'.charCodeAt(0)+(Math.random()*26)|0)
    }
    return out;
}
function generateUniqueId() {
    return Math.random().toString(36).slice(2);
}
String.prototype.dkuHashCode = function(){
    var hash = 0, i, char, l;
    if (this.length == 0) return hash;
    for (i = 0, l = this.length; i < l; i++) {
        char  = this.charCodeAt(i);
        hash  = ((hash<<5)-hash)+char;
        hash |= 0; // Convert to 32bit integer
    }
    return hash;
};

function smartLogTailToHTML(data, compact){
    var html = "";
    for (var i = 0; i < data.lines.length; i++) {
        var line = data.lines[i];

        // OMG, the Y2.1K bug !
        if (compact && line.startsWith("[20")) {
            var afterDate = line.substring(25);
            var afterThread = afterDate.substring(afterDate.indexOf("]") + 1);
            line = line[0] + line.substring(12, 20) + "]" + afterThread;
        }
        line = line.replace(/</g, "&lt;");
        line = line.replace(/>/g, "&gt;");

        if (data.status[i] == 0) {
            html += '<span class="text-debug">' + line + '</span>';
        } else if (data.status[i] == 1) {
            html += line;
        } else if (data.status[i] == 2) {
            html += '<span class="text-warning">' + line + '</span>';
        } else if (data.status[i] == 3) {
            html += '<span class="text-error">' + line + '</span>';
        } else if (data.status[i] == 4) {
            html += '<span class="text-success">' + line + '</span>';
        }
        html += '\n';
    }
    return html
}

var isDifferentThanLongMaxValue = (function() {
	var minLong = -9223372036854776000; // equals to java's Long.MIN_VALUE rounded by js
	var maxLong = 9223372036854776000;	// equals to java's Long.MAX_VALUE rounded by js
	return function(n) {
		return n < maxLong && n > minLong;
	}
})();

function makeSVG(tag, attrs) {
    var el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (var k in attrs)
        el.setAttribute(k, attrs[k]);
    return el;
}

function dkuDeepCopy(src, filter) {
    if (angular.isArray(src)) {
        var arr = [];
        for (var i = 0; i < src.length; i++) {
            arr[i] = dkuDeepCopy(src[i], filter);
        }
        return arr;
    } else if (angular.isObject(src)) {
        var obj = {};
        angular.forEach(src, function(value, key) {
            if (filter(key)) {
                obj[key] = dkuDeepCopy(value, filter);
            }
        });
        return obj;
    } else {
        return angular.copy(src);
    }
}

function alphabeticalSort(s1, s2) {
    s1 = (s1 === undefined) ? "" : s1.toLowerCase();
    s2 = (s2 === undefined) ? "" : s2.toLowerCase();
    return s1 > s2 ? 1 : s1 == s2 ? 0 : -1; // sorting alphabetically means sorting decreasingly in js
}

function isTouchDevice() {
    return 'ontouchstart' in window;
}

/**
 * Converts all the special characters corresponding string representations into the corresponding character.
 * The special characters are:
 * <ul>
 *     <li>the tabulation character: <tt>\t</tt></li>
 *     <li>the unicode characters: e.g. <tt>\u0001</tt></li>
 * </ul>
 * @param {string} text The string to transform.
 * @returns {string} The transformed string with all special chars converted.
 */
function convertSpecialChars(text) {
    if (text == null) {
        return text;
    } else {
        const unicodeDigits = 4;
        const unicodePrefix = '\\u';
        const unicodeRegex = RegExp(`\\${unicodePrefix}[\\dA-F]\{${unicodeDigits}\}`, 'gi');
        return text
            .replace(/\\t/g, '\t')
            .replace(unicodeRegex, (match) =>
                String.fromCharCode(
                    parseInt(match.substring(unicodePrefix.length, unicodePrefix.length + unicodeDigits), 16)
                )
            );
    }
}

/**
  * Recursively transform a tree to a list
  * @param tree {object} - the input tree
  * @param transformer {function} - the function used to get the next sub-tree from the tree
  * @param list {array} - the list used to append the computed elements (usually empty list is provided)
  * @returns list {array} - the filled list
  */
function treeToList(tree, transformer, list=[]) {
    const nextTree = transformer(tree);
    list.unshift(tree);
    if (nextTree === undefined) {
        return list;
    } else {
        return treeToList(nextTree, transformer, list);
    }
}

/**
 * Searches a tree object for a specified value
 * https://stackoverflow.com/a/50590586/11907039
 * 
 * @param {*} tree {object} - the input tree
 * @param {*} value {any} - the value to search for
 * @param {*} key {key} - the key containing the value
 */
function searchTree(tree, value, key = 'id') {
    const stack = [tree];
    while (stack.length) {
        const node = stack.shift();
        if (node[key] === value) {
            return node;
        }
        node.children && stack.push(...node.children);
    }
    return null;
}

/**
 * Resolves the value of an object nested in a rootObject knowing its relative string keyPath. 
 * 
 * @example
 * 
 * const rootObject = { 
 *      id: 'my-plugin',
 *      storeDesc: {
 *          meta: {
 *              support: 'tier2'
*           }
*       }
 *  }
 * 
 * resolveValue(rootObject, 'storeDesc.meta.support');
 * // -> 'tier2'
 * 
 * @param {Object}  rootObject  - The object where we're looking for the value.
 * @param {String}  keyPath     - The string key where to find the value from rootObject.
 * @param {String}  separator   - (Optional) Character to use to split the keyPath.
 */
function resolveValue(rootObject, keyPath, separator='.') {
    const keys = keyPath.split(separator);
    const resolver = (previousObject, currentKey) => previousObject && previousObject[currentKey];
    return keys.reduce(resolver, rootObject);
}

function filterDollarKey(key) {
    return !key.startsWith('$');
}

/**
 * Compute the real width (in pixels) that a given text will take once rendered in DOM for the given font.
 */
function getTextWidth(text, font='12px Arial') {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    context.font = font;
    return context.measureText(text).width;
}

function moveItemInArray(array, firstIndex, secondIndex) {
    const temp = array[firstIndex];
    array[firstIndex] = array[secondIndex];
    array[secondIndex] = temp;
}

function makeFullModelEvalutionIdString(projectKey, mesId, runId) {
    return "ME-" + projectKey + "-" + mesId + "-" + runId;
}

function makeFullModelEvalutionIdStringFromObject(object) {
    if ( !("projectKey" in object) || !("id" in object) || !("runId" in object)
        || !("modelType" in object) || ("MODEL_EVALUATION" !== object.modelType) ) {
            throw new Error("Object " + object + " is not a FullModelEvaluationId");
    }
    return "ME-" + object.projectKey + "-" + object.id + "-" + object.runId;
}

function makeFullModelIdStringFromObject(object) {
    if ("DOCTOR_MODEL" === object.modelType) {
        if ( ("projectKey" in object) && ("smId" in object) && ("smVersionId" in object)
            && ("modelType" in object)) {
                return "S-" + object.projectKey + "-" + object.smId + "-" + object.smVersionId;
        } else if ( ("analysisProjectKey" in object) && ("analysisId" in object) &&
            ("mlTaskId" in object) && ("sessionId" in object) && ("preprocessingId" in object)
            && ("modelId" in object) ) {
                return "A-" + object.analysisProjectKey + "-" + object.analysisId + "-"
                + object.mlTaskId + "-" + object.sessionId + "-" + object.preprocessingId
                + "-" + object.modelId;
        }
    }
    throw new Error("Object " + object + " is not a FullModelId");
}

function makeFullModelIdStringFromEvaluation(evaluation) {
    if ("SAVED_MODEL" === evaluation.modelType) {
        const loc = resolveObjectSmartId(evaluation.modelParams.ref, evaluation.ref.projectKey)
        return "S-" + loc.projectKey + "-" + loc.id + "-" + evaluation.modelParams.versionId;
    } else {
        throw new Error("Not available for Model Evaluations without a backing DSS model");
    }
}

function makeModelLikeIDStringFromObject(object) {
    switch(object.modelType) {
        case "DOCTOR_MODEL":
            return makeFullModelIdStringFromObject(object);
        case "MODEL_EVALUATION":
            return makeFullModelEvalutionIdStringFromObject(object);
        default:
            throw new Error("Object " + object + " is of unhandled model-like type " + object.modelType);
    }
}

function urlWithProtocolAndHost() {
    return window.location.protocol + '//' + window.location.host;
}

function getRewrappedPromise(deferred) {
    // Ugly workaround. Angular 1.2 unwraps promises (don't understand why)
    // Except if the promise object has a $$v.
    // See https://github.com/angular/angular.js/commit/3a65822023119b71deab5e298c7ef2de204caa13
    // and https://github.com/angular-ui/bootstrap/issues/949
    deferred.promise.$$v = deferred.promise;
    return deferred.promise;
}

// ====== Date utils

/**
 * Convert an UTC date into its counterpart for the specified timezone.
 * Ex: convertDateToTimezone("2020-01-01T00:00:00.000Z", "America/New_York") will return "2020-12-31T19:00:00.000Z"
 */
function convertDateToTimezone(date, timezone) {
    const dateString = date.toLocaleString("en-US", { timeZone: timezone || 'UTC' });
    return new Date(dateString);
}

/**
 * Convert an date and a time zone to its UTC counterpart.
 * Ex: convertDateFromTimezone("2020-12-31T19:00:00.000Z", "America/New_York") will return "2020-01-01T00:00:00.000Z"
 */
function convertDateFromTimezone(date, timezone) {
    let offset = convertDateToTimezone(date, timezone).getTime() - date.getTime();
    let result = new Date(date.getTime() - offset);
    let checkDate = convertDateToTimezone(result, timezone);
    if (date.getTime() === checkDate.getTime()) {
        return result;
    } else {
        // DST bites us
        let dstOffset = date.getTime() - checkDate.getTime();
        return new Date(result.getTime() + dstOffset);
    }
}

/**
 * Format the supplied date using the date part of the ISO 8601 notation in local time zone (ex: "2020-01-10")
 */
function formatDateToISOLocalDate(date) {
    return `${date.getFullYear()}-${('0' + (date.getMonth() + 1)).slice(-2)}-${('0' + date.getDate()).slice(-2)}`;
}

/**
 * Format the supplied date using the time part of the ISO 8601 notation in local time zone (ex: "14:30:00.000")
 */
function formatDateToISOLocalTime(date) {
    return `${('0' + date.getHours()).slice(-2)}:${('0' + date.getMinutes()).slice(-2)}:${('0' + date.getSeconds()).slice(-2)}.${('000' + date.getMilliseconds()).slice(-3)}`;
}

/**
 * Format the supplied date time using ISO 8601 notation in local time zone (ex: "2020-01-10T14:30:00.000")
 */
function formatDateToISOLocalDateTime(date) {
    return formatDateToISOLocalDate(date) + "T" + formatDateToISOLocalTime(date);
}

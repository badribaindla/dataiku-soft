(function(){
    'use strict';

    var app = angular.module('dataiku.common.func', []);

    app.factory('Collections', function(Fn) {
        var Collections = {

            indexByField : function indexBy(list, field) {
                var ret = {}
                list.forEach(function(x) {
                    ret[x[field]] = x;
                })
                return ret;
            },

            // copy src into dest without dereference.
            // Use dest = updateNoDereference(dest, src) to avoid NPE
            updateNoDereference: function(dest, src) {
              if ($.isPlainObject(dest)) {
                var i;
                for (i in dest) {
                  if (src[i]) {
                    dest[i] = Collections.updateNoDereference(dest[i],src[i]);
                  } else if (!i.startsWith("$")) {
                    delete dest[i];
                  }
                }
                for (i in src) {
                  if (!dest[i]) {
                    dest[i] = src[i];
                  }
                }
                return dest;
              } else if ($.isArray(dest)) {
                for (i=dest.length-1; i>=0; i--) {
                  if (src[i]) {
                    dest[i] = Collections.updateNoDereference(dest[i],src[i]);
                  } else {
                    dest.splice(i,1);
                  }
                }
                for (i in src) {
                  if (!dest[i]) {
                    dest[i] = src[i];
                  }
                }
                return dest;
              } else {
                return src;
              }
            },
            // Do array : dest = src without dereference (equality based on dest[i][key] = src[i][key])
            updateArrayBasedOn: function(dest, src, key) {
                if (!dest) { return src }
                var srcDict = Collections.indexByField(src, key);
                for (var i = dest.length-1; i>= 0;i--) {
                    if (dest[i] && dest[i][key] && srcDict[dest[i][key]]) {
                      dest[i] = Collections.updateNoDereference(dest[i], srcDict[dest[i][key]]);
                    } else {
                      dest.splice(i,1);
                    }
                }
                var destKeys = dest.map(Fn.prop(key));
                src.forEach(function(o){
                  if (destKeys.indexOf(o[key]) === -1) {
                    dest.push(o);
                  }
                });
                return dest;
            },


        }
        return Collections;
    });

    app.factory('Fn', function() {

        function compose2(f1, f2) {
            return function() { return f2.call(this, f1.apply(this, arguments)); }
        };

        function cartesianProduct(arr)
        {
            return arr.reduce(function(a,b){
                return a.map(function(x){
                    return b.map(function(y){
                        return x.concat(y);
                    })
                }).reduce(function(a,b){ return a.concat(b) },[])
            }, [[]])
        }

        var Fn = {
            // constant functions & reducers /!\ use directly
            NOOP: function NOOP() {},
            SELF: function SELF(a) { return a; },
            INDEX: function INDEX(_, i) { return i; },  // for array utils
            LOG: function LOG(a) { /*@console*/ console.log(a); return a; }, // NOSONAR - by design
            DEBUG: function DEBUG(a) { debugger; return a; }, // NOSONAR - by design
            AND: function AND(a, b) { return a && b; },
            OR: function OR(a, b) { return a || b; },
            SUM: function SUM(a, b) { return a + b; },  // also works as string joiner
            MUL: function MUL(a, b) { return a * b; },
            MAX: function MAX(a, b) { return Math.max(a,b); },
            MIN: function MIN(a, b) { return Math.min(a,b); },
            CMP: function(a, b) { return a.valueOf() < b.valueOf() ? -1 : (a.valueOf() > b.valueOf() ? 1 : 0) },

            // composers
            not: function not(f) { return function() { return !f.apply(this, arguments); } },
            compose: function compose(f1) { return Array.prototype.slice.call(arguments, 1).reduce(compose2, f1); },
            args: function fnArgs(args, f) { return function() {
                for (var i in args) { if (typeof args[i] !== 'undefined') arguments[i] = args[i]; }
                return f.apply(this, arguments);
            }; },

            // arrays
            // cartesian product
            product: function() {
              return cartesianProduct(arguments);
            },
            // cartesian power
            pow: function(arr, p) {
              var res = [];
              for (var i=0;i<p;i+=1) {
                res.push(arr);
              }
              return cartesianProduct(res);
            },

            /* When this function is called with N arguments, it calls f with only the first argument */
            passFirstArg : function passFirstArg(f) {
                return function() {
                    return f(arguments[0]);
                }
            },

            // ready-made functors
            cst: function cst(a) { return function() { return a; }; },
            eq: function eq(to) { return function(o) { return to === o; }; },
            like: function like(to) { return function(o) { return to == o; }; },
            ofType: function ofType(t) { return function(o) { return typeof o === t; }; },
            unique: function unique() {
                var a = [], t = Fn.inArray(a);
                return function(o) { return !t(o) && a.push(o) && true; };
            },
            inArray: function inArray(arr) { return function(o) { return arr.indexOf(o) !== -1; } },
            regexp: function regexp(re) { return re.test.bind(re); },

            // extractors

            /**
             * Extracts a property from current element, optionally using deep access
             * @param name: the property to extract, or an array for deep access
             *  Fn.prop("a")(x) -> returns x["a"]
             *  Fn.prop(["a", "b"])(x) -> returns x["a"]["b"]
             *  Fn.prop([])(x) -> returns x
             */
            prop: function prop(name) {
                if (!Array.isArray(name))   { return (function(o) { return o[name]}); }
                else if (name.length === 0) { return Fn.SELF; }
                else                        { return Fn.compose.apply(null, name.map(Fn.prop)); }
            },
            /**
             * Extracts a property from current element using string-based deep access
             * @param name: a dotted expression denoting the property to extract
             *  Fn.propStr("a")(x) -> returns x["a"]
             *  Fn.propStr("a.b")(x) -> returns x["a"]["b"]
             *  Fn.propStr("")(x) -> returns x
             */
            propStr: function propStr(name) {
                if (name == null || name.length == 0) return Fn.prop([])
                return Fn.prop(name.split("."))
            },

            // setters
            /**
             * Sets a property from current element, optionally using deep access
             * @param name: the property to extract, or an array for deep access
             *  Fn.setProp(e, "a")(x) -> set x["a"] = e , returns x["a"]
             *  Fn.setProp(e, ["a", "b"])(x) -> sets x["a"]["b"] = e , returns x["a"]["b"]
             *  Fn.setProp(e, [])(x) -> return e , does nothing to x (you should use x = e)
             */
            setProp: function setProp(value, name) {
                if (!Array.isArray(name))   { return (function(o) { if(!o) return o ; o[name] = value ; return o[name] }); }
                else if (name.length === 0) { return (function(o) { return value; }); }
                else                        { return compose2.call(null,
                    Fn.compose.apply(null, name.slice(0,name.length-1).map(Fn.propSafe)) || Fn.SELF ,
                    Fn.setProp.call(null, value, name[name.length-1])
                ); }
            },
            propSafe: function propSafe(name) {
                if (!Array.isArray(name))   { return (function(o) { if(!o[name]) { o[name] = {} } ; return o[name] }); }
                else if (name.length === 0) { return Fn.SELF; }
                else                        { return Fn.compose.apply(null, name.map(Fn.propSafe)); }
            },
            propStrSafe: function propStr(name) {
                if (name == null || name.length == 0) return Fn.propSafe([])
                return Fn.propSafe(name.split("."))
            },
            /**
             * Sets a property from current element using string-based deep access
             * @param name: a dotted expression denoting the property to extract
             *  Fn.setPropStr(e, "a")(x) -> sets x["a"] = e
             *  Fn.setPropStr(e, "a.b")(x) -> sets x["a"]["b"] = e
             *  Fn.setPropStr(e, "")(x) -> return e , does nothing to x (you should use x = e)
             */
            setPropStr: function setPropStr(value, name) {
                if (name == null || name.length == 0) return Fn.setProp(value, [])
                return Fn.setProp(value, name.split("."))
            },


            /** Calls the identified method on the current element (cur.method())
              * @param m: function to call with the current element as @this
              *    or name of the method on the element (NOOP when does not exist).
              * @param args: additional arguments for the call (optional)
              */
            method: function method(m, args) { return function(o) {
                return (typeof m === 'function' ? m : (o[m] || Fn.NOOP)).apply(o, args || []);
            }; },
            assign: function assign(name, f) { return function(o) { o[name] = f.apply(this, arguments); return o; }; },
            from: function from(o, i) { i = i || 0; return (function() { return this[arguments[i]]; }).bind(o); },
            dict: function dict(o, def) { return function(a) {
                return a in o ? o[a] : typeof def ==='function' ? def(a) : def; }; 
            },

            // misc

            /**
             * Returns a function F that executes {@param fn} when F is called with a non-null
             * first argument
             */
            doIfNv : function doIf(fn) {
                return (function(nv) { if (nv !== null && nv !== undefined) fn(); });
            },

            getCustomTimeFormat() {
                var customTimeFormat = d3.time.format.multi([
                    [".%L", function(d) { return d.getMilliseconds(); }],
                    [":%S", function(d) { return d.getSeconds(); }],
                    ["%H:%M", function(d) { return d.getMinutes(); }],
                    ["%H:00", function(d) { return d.getHours(); }],
                    ["%a %d", function(d) { return d.getDay() && d.getDate() != 1; }],
                    ["%b %d", function(d) { return d.getDate() != 1; }],
                    ["%B", function(d) { return d.getMonth(); }],
                    ["%Y", function() { return true; }]
                ]);
                return customTimeFormat;
            }
        };

        Fn.neq = compose2(Fn.eq, Fn.not);

        return angular.extend(Fn.compose, Fn);
    });
})();


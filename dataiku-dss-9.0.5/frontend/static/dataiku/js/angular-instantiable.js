(function() {

    // Instantiable for Angular
    //
    // This patch adds the 'instantiable' object type to the Angular's framework. It is basically the same thing
    // as a factory, but it doesn't produce singletons. A new instance is created each time it is injected.
    // It unlocks the possibility to retrieve a dependency injection context (using DIContext) which is
    // different for each instance.
    //
    // The main use case of an instantiable is to create a logger who knows who requested it, in order to
    // automatically decorate messages.
    //
    // See the Logger in logging.js for usage example.
    //
    // Limitations :
    //
    // - It doesn't work for controllers declared as globally accessible functions. I've no idea how to implement
    //   that but it's not a good practice anyway!
    // - It doesn't work a directive's controller, inject it in the directive instead.
    // - It doesn't work with providers (should be easy to implemented... not implemented because not used in DSS).
    //
    // Implementation details :
    //
    // This feature is implemented by wrapping Angular's public module API. It doesn't depend on internal/private
    // implementation details. The $provide service is left unchanged & unpatched.

    'use strict';

    var oldAngularModule = angular.module;
    angular.module = function(serviceName) {

        var moduleInstance = oldAngularModule.apply(this,arguments);

        function injectContext(serviceName, objectName, depImpls) {
            var out = [];
            for(var i = 0 ; i < depImpls.length ; i++) {
                var dep = depImpls[i];
                if(typeof dep == 'function' && dep['_instantiable_marker_']) {
                    dep = dep({
                        serviceName:serviceName,
                        objectName:objectName
                    });
                }
                out.push(dep);
            }
            return out;
        }

        function createWrapper(serviceName, objectName, fn) {
            var depNames = angular.injector().annotate(fn);
            if(depNames.indexOf('DIContext')!=-1) {
                throw 'Error: DIContext can be injected in instantiables only!'
            }
            var impl = angular.isArray(fn)?fn[fn.length-1]:fn;
            var newDef = depNames.concat([function() {
                 return impl.apply(this, injectContext(serviceName,objectName,arguments));
            }]);
            return [objectName,newDef];
        }


        // Pre-wrap factories
        var oldFactory = moduleInstance.factory;
        moduleInstance.factory = function(objectName,fn) {
            oldFactory.apply(this, createWrapper(serviceName,objectName,fn));
            return moduleInstance;
        };

        // Pre-wrap directives
        var oldDirective = moduleInstance.directive;
        moduleInstance.directive = function(objectName,fn) {
            oldDirective.apply(this, createWrapper(serviceName,objectName,fn));
            return moduleInstance;
        };

        // Pre-wrap controllers
        var oldController = moduleInstance.controller;
        moduleInstance.controller = function(objectName,fn) {
            oldController.apply(this, createWrapper(serviceName,objectName,fn));
            return moduleInstance;
        };

        // Pre-wrap services
        var oldService = moduleInstance.service;
        moduleInstance.service = function(objectName,fn) {
            oldService.apply(this, createWrapper(serviceName,objectName,fn));
            return moduleInstance;
        };

        // TODO : put here code to handle providers

        moduleInstance.instantiable = function(objectName,fn) {

            var depNames = angular.injector().annotate(fn);
            var impl = angular.isArray(fn)?fn[fn.length-1]:fn;
            var preApplication = function() {
                var cnt = 0;
                var args = [];
                for(var i = 0 ; i < depNames.length ; i++) {
                    if(depNames[i] == 'DIContext') {
                        args.push(null);
                    } else {
                        args.push(arguments[cnt]);
                        cnt++;
                    }
                }
                var that = this;
                var ret = function(diContext) {
                    var fullArgs = [];
                    for(var i = 0 ; i < depNames.length ; i++) {
                        if(depNames[i] == 'DIContext') {
                            fullArgs.push(diContext);
                        } else {
                            fullArgs.push(args[i]);
                        }
                    }
                    return impl.apply(that,injectContext(serviceName, objectName, fullArgs));
                };
                ret['_instantiable_marker_'] = true;
                return ret;
            }

            oldFactory(objectName, depNames.filter(function(depName) {
                   return depName != 'DIContext';
            }).concat([function() {
                   return preApplication.apply(this,arguments);
            }]));

            return moduleInstance;
        };

        return moduleInstance;
    };

})();
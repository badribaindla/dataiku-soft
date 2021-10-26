(function(){
'use strict';

var app = angular.module('dataiku.widgets.futures', ['dataiku.services']);

/**
 * A simple helper to watch a future state.
 *
 *  - Does not auto-abort the future when going out of scope !
 *
 * call with FutureWatcher.watchJobId(jobId)
 */
app.service("FutureWatcher", function($q, DataikuAPI){

    function enrichPromise(deferred) {
        deferred.promise.success = function(fn) {
            deferred.promise.then(function(data) {
                fn(data.data, data.status, data.headers);
            });
            return deferred.promise;
        };

        deferred.promise.error = function(fn) {
            deferred.promise.then(null, function(data) {
                fn(data.data, data.status, data.headers);
            });
            return deferred.promise;
        };

        deferred.promise.update = function(fn) {
            deferred.promise.then(null, null,function(data) {
                fn(data.data, data.status, data.headers);
            });
            return deferred.promise;
        };
    }

    var FutureWatcher = {
        watchJobId : function(jobId) {
            var hasWaitedFor = 0;
            var delayBetweenCalls = 500;
            var deferred = $q.defer();
            enrichPromise(deferred);

            function refresh(){
                DataikuAPI.futures.getUpdate(jobId).success(function(data,status,headers) {
                    hasWaitedFor += delayBetweenCalls;
                    var kwargs = {data:data, status:status, headers:headers};
                    if (data.hasResult || data.unknown) {
                        deferred.resolve(kwargs);
                    } else {
                        if (hasWaitedFor > 300000) { // 5min
                            delayBetweenCalls = 10000;
                        } else if (hasWaitedFor > 120000) { // 2min
                            delayBetweenCalls = 3000;
                        } else if (hasWaitedFor > 30000) { // 30s
                            delayBetweenCalls = 1000;
                        }
                        deferred.notify(kwargs);
                        window.setTimeout(refresh, delayBetweenCalls);
                    }
                }).error(function(data, status, headers){
                    var kwargs = {data:data, status:status, headers:headers};
                    deferred.reject(kwargs);
                });
            }

            refresh();

            return deferred.promise;
        },
        watchPeekJobId : function(jobId) {
            var hasWaitedFor = 0;
            var delayBetweenCalls = 500;
            var deferred = $q.defer();
            enrichPromise(deferred);

            function refresh(){
                DataikuAPI.futures.peekUpdate(jobId).success(function(data,status,headers) {
                    hasWaitedFor += delayBetweenCalls;
                    var kwargs = {data:data, status:status, headers:headers};
                    if (data.hasResult || data.unknown) {
                        deferred.resolve(kwargs);
                    } else {
                        if (hasWaitedFor > 300000) { // 5min
                            delayBetweenCalls = 10000;
                        } else if (hasWaitedFor > 120000) { // 2min
                            delayBetweenCalls = 3000;
                        } else if (hasWaitedFor > 30000) { // 30s
                            delayBetweenCalls = 1000;
                        }
                        deferred.notify(kwargs);
                        window.setTimeout(refresh, delayBetweenCalls);
                    }
                }).error(function(data, status, headers){
                    var kwargs = {data:data, status:status, headers:headers};
                    deferred.reject(kwargs);
                });
            }
            refresh();
            return deferred.promise;
        }
    }
    return FutureWatcher;
});

app.service("FutureProgressModal", function(FutureWatcher, $q, CreateModalFromTemplate, ProgressStackMessageBuilder, DataikuAPI, $timeout){
    var FutureProgressModal = {
        // Returns a promise that resolves when the future is done but never rejects
        show : function(parentScope, initialResponse, modalTitle, afterCompileCallback, backdrop, keyboard, useDkuLoader) {

            var deferred = $q.defer();
            if ( initialResponse.hasResult ) {
                // Keep the last log if any
                if (angular.isObject(initialResponse.result) && initialResponse.log) {
                    initialResponse.result.futureLog = initialResponse.log;
                }
                deferred.resolve(initialResponse.result);
            } else {
                parentScope.useDkuLoader = useDkuLoader;
                CreateModalFromTemplate("/templates/widgets/future-progress-modal.html", parentScope, null, function(newScope) {
                    newScope.onFailure = function() {};
                    if (afterCompileCallback) {
                        afterCompileCallback(newScope);
                    }
                    newScope.futureResponse = initialResponse;
                    newScope.modalTitle = modalTitle;
                    newScope.percentage = 0;

                    newScope.abort = function () {
                        DataikuAPI.futures.abort(initialResponse.jobId).error(setErrorInScope.bind(newScope));
                    };
                    
                    FutureWatcher.watchJobId(initialResponse.jobId)
                    .success(function(data) {
                        newScope.finalResponse = data;
                        newScope.futureResponse = null;
                        newScope.dismiss();
                        if (angular.isObject(data.result) && data.log) {
                            data.result.futureLog = data.log;
                        }
                        deferred.resolve(data.result);
                    }).update(function(data){
                        newScope.percentage =  ProgressStackMessageBuilder.getPercentage(data.progress);
                        newScope.futureResponse = data;
                        newScope.stateLabels = ProgressStackMessageBuilder.build(newScope.futureResponse.progress, true);
                    }).error(function(data, status, headers) {
                        console.info(data)
                        // Remove the future response to remove progress bar / state
                        newScope.futureResponse = null;
                        // Keep the failure log
                        newScope.failureLog = data.logTail;
                        deferred.reject({data: data, status: status, headers: headers});
                        setErrorInScope.bind(newScope)(data, status, headers);
                    });
                }, undefined, backdrop, keyboard);
            }

            return deferred.promise;
        },

        /* Shows the modal only if the job is still running.
         * Does not take the job from the future service
         * The modal disappears automatically if the job succeeds.
         * Returns a promise that resolves when the future succeeds
         */
        showPeekOnlyIfRunning : function(parentScope, jobId, modalTitle){
            var newScope = parentScope.$new();
            var shown = false;
            var theModalScope = null;

            var deferred = $q.defer();

            function showIfNeeded(){
                if (!shown) {
                    shown = true;
                    CreateModalFromTemplate("/templates/widgets/future-progress-modal.html", newScope, null, function(modalScope){
                        theModalScope = modalScope;
                        modalScope.modalTitle = modalTitle;

                        newScope.abort = function() {
                            DataikuAPI.futures.abort(jobId)
                                .success(modalScope.dismiss)
                                .error(setErrorInScope.bind(modalScope));
                        };
                    });
                }
            }

            FutureWatcher.watchPeekJobId(jobId)
            .success(function(data) {
                newScope.futureResponse = null;
                if (theModalScope) theModalScope.dismiss();
                deferred.resolve();
            }).update(function(data){
                if (data.alive == false) {
                    if (theModalScope) theModalScope.dismiss();
                    deferred.resolve();
                } else {
                    showIfNeeded();
                    newScope.percentage =  ProgressStackMessageBuilder.getPercentage(data.progress);
                    newScope.futureResponse = data;
                    newScope.stateLabels = ProgressStackMessageBuilder.build(newScope.futureResponse.progress, true);
                }
            }).error(function(data, status, headers) {
                newScope.futureResponse = null;
                setErrorInScope.bind(newScope)(data, status, headers);
                deferred.reject({data: data, status: status, headers: headers});
            });

            return deferred.promise;
        },
        
        reopenableModal : function(parentScope, initialResponse, modalTitle) {
            var handle = {shown:false};
            var deferred = $q.defer();
            if ( initialResponse.hasResult ) {
                deferred.resolve(initialResponse.result);
            } else {
                var hooks = {};
                handle.open = function() {
                    if (handle.shown) return;
                    handle.shown = true;
                    CreateModalFromTemplate("/templates/widgets/future-progress-modal.html", parentScope, null, function(newScope){
                        if (hooks.isDone) {
                            // too slow to open
                            $timeout(function() {newScope.dismiss();}); // because dismiss() isn't even in the scope at this point
                            return;
                        }
                        newScope.futureResponse = initialResponse;
                        newScope.modalTitle = modalTitle;
                        newScope.percentage = 0;
                        
                        newScope.abort = function() {
                            DataikuAPI.futures.abort(initialResponse.jobId).error(setErrorInScope.bind(newScope));
                        }
                        // react to changes in the future state
                        hooks.update = function(data) {
                            newScope.percentage =  ProgressStackMessageBuilder.getPercentage(data.progress);
                            newScope.futureResponse = data;
                            newScope.stateLabels = ProgressStackMessageBuilder.build(newScope.futureResponse.progress, true);
                        };
                        hooks.success = function(data) {
                            newScope.finalResponse = data;
                            newScope.futureResponse = null;
                            newScope.dismiss();
                        };
                        hooks.error = function(data, status, headers) {
                            newScope.futureResponse = null;
                            setErrorInScope.bind(newScope)(data, status, headers);
                        };
                        newScope.$on("$destroy", function() {
                            // stop listening on the changes to the future
                            delete hooks.success;
                            delete hooks.update;
                            delete hooks.error;
                            handle.shown = false;
                        });
                    });
                };
                FutureWatcher.watchJobId(initialResponse.jobId)
                .success(function(data) {
                    hooks.isDone = true;
                    if (hooks.success) {
                        hooks.success(data);
                    }
                    deferred.resolve(data.result);
                }).update(function(data){
                    if (hooks.update) {
                        hooks.update(data);
                    }
                }).error(function(data, status, headers) {
                    hooks.isDone = true;
                    if (hooks.error) {
                        hooks.error(data, status, headers);
                    }
                    deferred.reject({data: data, status: status, headers: headers});
                });
            }
            handle.promise = deferred.promise; 
            return handle;
        }
    }
    return FutureProgressModal;
});



})();

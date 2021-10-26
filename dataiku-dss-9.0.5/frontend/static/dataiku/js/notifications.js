(function(){
'use strict';

const app = angular.module('dataiku.services');


    app.factory("Notification", [function() {

            var dispatcherTable = {};

            var backendEventHandler = null;

            var registerEvent = function(type,eventListener) {
                if(!type) return angular.noop;
                var listeners = dispatcherTable[type];
                if(!listeners) {
                    listeners = [];
                    dispatcherTable[type] = listeners;
                }
                var listenerWrapper = function(type, event) {
                    eventListener(type,event);
                }
                listeners.push(listenerWrapper);
                return function() {
                    var idx = listeners.indexOf(listenerWrapper);
                    if(idx != -1) {
                        listeners.splice(idx,1);
                    }
                };
            };

            var publishToBackend = function(type, event) {
                if(!event) {
                    event={};
                }
                if(backendEventHandler) {
                    backendEventHandler(type,event);
                }
            };

            var publishToFrontend = function(type, event) {
                if(!event) {
                    event={};
                }
                var listeners = dispatcherTable[type];
                if(listeners) {
                    for(var k in listeners) {
                        listeners[k](type,event);
                    }
                }
            };

            var broadcastToFrontends = function(loopBack) {
                return function(type,event) {
                    publishToBackend('ui-broadcast',{
                        nestedEvent : {
                            type : type,
                            event : event
                        },
                        loopBack : loopBack
                    });
                }
            };

            var setBackendEventHandler = function(handler) {
                backendEventHandler = handler;
            }

            return {
                // Register a new event listener. The event may be coming from the frontend (sent by NotificationService.$broadcast)
                // or from the backend.
                registerEvent: registerEvent,

                // Publish an event to the current frontend
                publishToFrontend : publishToFrontend,

                // Publish an event to the backend
                publishToBackend : publishToBackend,

                // Publish an event to all the frontends (including this one)
                broadcastToFrontends : broadcastToFrontends(true),

                // Publish an event to all the frontends (except this one)
                broadcastToOtherSessions : broadcastToFrontends(false),

                // Register the backend event handler (which is WebSocketService)
                // The purpose is to break the dependency cycle.
                _setBackendEventHandler : setBackendEventHandler

            };
    }]);

})();
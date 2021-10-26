(function() {
'use strict';

const app = angular.module('dataiku.services');


app.factory("WebSocketService", function($q, $rootScope, Notification, WT1, Logger, $$cookieReader) {

    const ERROR_CODE = Object.freeze({
        CONNECTION_LOST: 2,
        CONNECTION_FAILED: 3,
        CONNECTION_ESTABLISHED: 4
    });

    const PING_INTERVAL = 15000;
    const RECONNECT_TIMEOUT = 50000;
    const DEV_RECONNECT_TIMEOUT = 5000;

    // This ID identifies this browser session
    const sessionId = generateRandomId(10);
    // At a single point in time, only one websocket can be active
    const webSocketProtocol = window.location.protocol.indexOf("https") == 0 ? "wss" : "ws";
    const webSocketUrl = webSocketProtocol + "://" + window.location.host + "/dip/websocket?sessionId=" + sessionId;

    let webSocket = null;
    let reallyConnected = false;
    let everConnected = false;
    let hasFailed = false;

    // Store the event we want to send
    let eventQueue = [];

    function flushEventQueue() {
        if(reallyConnected && webSocket != null) {
             for(const k in eventQueue) {
                webSocket.send(JSON.stringify(eventQueue[k]));
             }
             eventQueue = [];
        }
    }

    function connect() {
        Logger.info("Attempting WS connection");

        if(webSocket != null) {
            return;
        }

        try {
            // Websockets can't have custom headers so we pass the XSRF token through the sub-protocols
            // Plus "dummy" that will get chosen by the server (mandated by WS protocol)
            const xsrfToken = $$cookieReader()[$rootScope.appConfig.xsrfCookieName];
            webSocket = new WebSocket(webSocketUrl, ["dummy", "xsrf-" + xsrfToken]);
        } catch (e) {
            console.error("WS error: " + e.message, e); /*@console*/  // NOSONAR: OK to use console.
            hasFailed = true;
            if(everConnected) {
                emitToFrontend("websocket-status-changed", {
                    code: ERROR_CODE.CONNECTION_LOST,
                    reason : "Unable to re-create a Websocket connection ("+e.message+")"
                });
            } else {
                emitToFrontend("websocket-status-changed", {
                    code: ERROR_CODE.CONNECTION_FAILED,
                    reason : "Could not create a Websocket connection ("+e.message+")"
                });
                WT1.event("websocket-failed", {reason:e.message});
            }
            return;
        }

        const thisWebSocket = webSocket;

        webSocket.onopen = function() {
            const pingMessage = {
                type: "ping",
                event: {
                    webSocketSessionId: sessionId
                }
            };
            if(thisWebSocket == webSocket) {
                thisWebSocket.send(JSON.stringify(pingMessage));
                const intervalId = setInterval(function() {
                    if(thisWebSocket == webSocket) {
                        thisWebSocket.send(JSON.stringify(pingMessage));
                    } else {
                        clearInterval(intervalId);
                    }
                }, PING_INTERVAL);
            }
        };

        webSocket.onmessage = function (evt) {
            $rootScope.$applyAsync(function() {
                if(!reallyConnected) {
                    emitToFrontend("websocket-status-changed", {
                        code: ERROR_CODE.CONNECTION_ESTABLISHED,
                        reason : "Connection established !"
                    });
                    reallyConnected = true;
                    everConnected = true;
                    flushEventQueue();
                }
                const notification = JSON.parse(evt.data);
                if (notification.type != "pong" && notification.type != "watch-triggered") {
                    Logger.debug("Message from WS: " + notification.type);
                }
                emitToFrontend(notification.type, notification.event);
            });
        };

        webSocket.onerror = function(evt) {
            hasFailed = true;
            console.warn("Websocket error", evt); /*@console*/ // NOSONAR: OK to use console.
        };

        webSocket.onclose = function(evt) {
            Logger.info("WS closed:" , evt);
            if ((evt instanceof CloseEvent) && (1001 === evt.code || 1011 === evt.code)) {
                // Unlike Chrome, Firefox calls onclose when it is closing a WS because
                // its tab is closing or the user is navigating away, which would cause the
                // "disconnected" overlay to appear before the new page is loaded.
                // See https://developer.mozilla.org/fr/docs/Web/API/CloseEvent
                Logger.info("Closing tab or navigating away. Not executing WS onclose [firefox].");
                return;
            }
            $rootScope.$apply(function() {
                webSocket = null;
                hasFailed = true;
                if(reallyConnected) {
                    emitToFrontend("websocket-status-changed", {
                        code: ERROR_CODE.CONNECTION_LOST,
                        reason : "You lost connection to the server",
                    });
                } else {
                    emitToFrontend("websocket-status-changed", {
                        code: everConnected?ERROR_CODE.CONNECTION_LOST:ERROR_CODE.CONNECTION_FAILED,
                        reason : "Websocket connection failed"
                    });
                    if(!everConnected) {
                        WT1.event("websocket-failed", {reason:'Connection closed'});
                    }
                }
                // after losing connection, the first re-connect attempt we try is instant
                const timeoutDelay = reallyConnected ? 0 : (window.devInstance ? DEV_RECONNECT_TIMEOUT : RECONNECT_TIMEOUT);
                reallyConnected = false;
                setTimeout(function() {
                    connect();
                }, timeoutDelay);
            });
        };
    }

    function broadcastToBackend(type,event) {
        const copied = angular.copy(event ? event : {});
        copied.webSocketSessionId = sessionId;
        eventQueue.push({
            type: type,
            event: copied
        });
        flushEventQueue();
    }

    function emitToFrontend(type,event) {
        Notification.publishToFrontend(type, event);
    }

    Notification._setBackendEventHandler(broadcastToBackend);

    return {
        // Connect the websocket, or force reconnect.
        connect : connect,
        // Returns true if the websocket is connected
        isConnected : function() {
            return reallyConnected;
        },
        // Returns true if the websocket is or has been connected in the past.
        hasEverConnected : function() {
            return everConnected;
        },
        // Returns true if the websocket has been available in the past,
        // or if it didn't fail yet.
        isAvailable : function() {
            return !hasFailed || everConnected;
        },
        getSessionId : function() {
            return sessionId;
        },
        // List of error codes
        ERROR_CODE : ERROR_CODE
    };

});


})();

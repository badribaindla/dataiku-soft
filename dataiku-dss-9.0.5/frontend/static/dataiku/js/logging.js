(function() {
'use strict';

const app = angular.module('dataiku.logger', []);


// This is an "instantiable" => it is NOT a singleton !
// DIContext contains some details related to the service who requested the logger instance.
app.instantiable('Logger', function(DIContext, LoggerProvider) {
    const fullname = getSimpleFullname(DIContext);
    return LoggerProvider.getLogger(fullname);
});


app.service('LoggerProvider',function($log, Notification, $injector) {
    const svc = this;

    function handleLog(type, namespace) {
        return function(...loggedObjects) {
            const timestamp = moment().utc().valueOf();
            const formattedDate = moment().format('HH:mm:ss.SSS');
            const formattedType = type.toUpperCase();

            // Print in console
            let prefix = '['+ formattedDate + ']';
            if(namespace) {
                prefix += ' [' + namespace + ']';
            }
            prefix += ' -';

            if (type == "debug" && loggedObjects && loggedObjects.length == 1) {
                $log.info("%c" + prefix + " " + loggedObjects[0], "color: #777");
            } else {
                const args = [prefix, ...loggedObjects];
                $log[type].apply($log, args);
            }

            if($injector.has('WebSocketService')) {
                if($injector.get("WebSocketService").isAvailable()) {
                    const stringifiedLoggedObjects = [];
                    // Websocket connection fails if the message is too big, so we truncate - #3821
                    // To work around the fact that might it be UTF8, we limit messages to 63K / 3
                    const MAX_LENGTH = 64000/3;
                    let remainingLen = MAX_LENGTH;

                    angular.forEach(loggedObjects,function(obj) {
                        let ret = '';
                        if(!obj) {
                            ret = ''+obj;
                        } else {
                            if(typeof obj == 'object') {
                                try {
                                    ret = JSON.stringify(obj);
                                } catch(e) {
                                    ret = ''+obj;
                                }
                            } else {
                                 ret = ''+obj;
                            }
                        }
                        if (ret.length > remainingLen) {
                            ret = "TRUNCATED: " + ret.substring(0, remainingLen);
                            console.warn("Truncated log message on Websocket (too long)"); /*@console*/ // NOSONAR: OK to use console.
                        }
                        remainingLen -= ret.length;
                        stringifiedLoggedObjects.push(ret)
                    });
                    try {
                        Notification.publishToBackend('log-event', {
                            messages: stringifiedLoggedObjects,
                            timestamp: timestamp,
                            type: formattedType,
                            namespace: namespace
                        });
                    } catch (e2) {
                        console.warn("Failed to send log event to backend", e2); /*@console*/ // NOSONAR: OK to use console.
                    }
                }
            }
        };
    };

    svc.getLogger = function(namespace) {
        return {
            log: handleLog("log", namespace),
            warn: handleLog("warn", namespace),
            debug: handleLog("debug", namespace),
            info: handleLog("info", namespace),
            error: handleLog("error", namespace)
        };
    };
});


/*
Instantialble assert:
    - throws an error if the condition is not met
    - opens the debugger if the console is open
    - prefixes the error message with the component
    - enriches the error with the component full name and adds a "js-assert" orign

This is useful in particular to easily track errors reported to Rollbar
*/
app.instantiable('Assert', function(DIContext, AssertProvider) {
    const namespace = getSimpleFullname(DIContext);
    return AssertProvider.getChecker(namespace);
});


app.service('AssertProvider',function() {
    const svc = this;

    function _fail(namespace, message) {
        debugger // NOSONAR (opens the debugger if the console is open)
        const prefix = namespace ? `[${namespace}] ` : '';
        throw new Error('[Assert]' + prefix + message);
    }

    function fail(namespace) {
        return function(message) {
            _fail(namespace, message);
        };
    }

    function trueish(namespace) {
        return function(condition, message) {
            if (!condition) {
                _fail(namespace, message);
            }
        };
    }

    function inScope(namespace) {
        return function(scope, attribute) {
            if (!resolveValue(scope, attribute)) {
                _fail(namespace, attribute + ' is not in scope');
            }
        };
    }

    svc.getChecker = function(namespace) {
        return {
            trueish: trueish(namespace),
            inScope: inScope(namespace),
            fail: fail(namespace)
        };
    };
});


// Utils for prefixing based on the angular component
function getSimpleModuleName(DIContext) {
    let sname = DIContext.serviceName;
    if (sname) {
        sname = sname.replace("dataiku.", "d.")
            .replace(".services", ".s")
            .replace(".directive", ".dir")
            .replace(".controllers", ".ctrl")
            .replace(".recipes", ".r")
            .replace(".savedmodels", ".sm")
            .replace(".managedfolder", ".mf")
            ;
    }
    return sname;
}

function getSimpleObjectName(DIContext) {
    let oname = DIContext.objectName;
    if (oname) {
        oname = oname.replace("APIXHRService", "API")
            .replace("Controller", "Ctrl");
    }
    return oname;
}

function getSimpleFullname(DIContext) {
    const sname = getSimpleModuleName(DIContext);
    const oname = getSimpleObjectName(DIContext);
    const fullname = sname + (sname ? '.' : '') + oname;
    return fullname;
}


const EXPECTED_EXCEPTIONS=[
    "Possibly unhandled rejection: dismissed modal"
];

app.factory('$exceptionHandler', function(Logger, ErrorReporting) {
    return function(exception, cause) {
        /* Swallow "expected exceptions", such as the one we do not catch when dismissing a modal */
        if (EXPECTED_EXCEPTIONS.includes(exception)) {
            return;
        }
        /* A string was thrown, so at least, use it as a message */
        if (exception !== undefined && exception.message === undefined) {
            console.warn("Got weird exception", exception, printStackTrace()); /*@console*/ // NOSONAR: OK to use console.
            exception = {
                stack: "no stack - string thrown ?",
                message: exception
            }
        }

        /* Send to console and frontend log */
        if (exception === undefined) {
            Logger.error("Caught undefined exception", printStackTrace());
        } else {

            const typename = ({}).toString.call(exception);
            /* Firefox specific error */
            if (typename == "[object Exception]") {
                console.info("Changing Firefox exception", exception); /*@console*/ // NOSONAR: OK to use console.
                let newMessage = exception.message ? exception.message : "No message";
                newMessage += " - FF modified";
                if (exception.name) newMessage += " - Name=" + exception.name;
                if (exception.result) newMessage += " - result=" + exception.result;

                let newException = new Error(newMessage);
                newException.stack = exception.stack;
                exception = newException;
            }

            Logger.error("Caught exception: " + exception,
                "\nStack: ", exception.stack,
                '\nCaused by : ', cause,
                '\nMessage :', exception.message);
        }
        /* Send to Rollbar (and WT1) */
        ErrorReporting.reportJSException(exception, cause);
    };
});


app.factory("ErrorReporting", function() {
    // Must not depend on rootScope else circular dependency

    function apiErrorToRollbarStackInfo(apiError) {
        return {
            name: apiError.errorType,
            message: apiError.message,
            stack: apiError.stackTrace == null ? null : apiError.stackTrace.map(function(x) {
                return {
                    "url": x.file,
                    "line": x.line,
                    "func": x.function
                }
            })
        };
    }

    function reportAPIError(apiError, customData) {
        /* We do that in several steps:
         *   - API error to Rollbar Stack info
         *   - Then rollbar payload from this stack info
         *   - Then we patch the payload exception with the original RSI
         *
         * This is to work around the fact that the Rollbar code in _buildPayload
         * always does some parsing on the message and transforms
         * "Dataset not found: foo" into foo.
         *
         * So we basically redo the buildPayload/enqueuePayload dance
         */
        if (window.devInstance) {
            return;
        }

        const stackInfo = apiErrorToRollbarStackInfo(apiError);
        const payload = Rollbar._buildPayload(new Date(), "error", null, stackInfo, customData);
        const callerArgs = ["error", null, stackInfo, customData];

        if (payload.data.body.trace && payload.data.body.trace.exception) {
            payload.data.body.trace.exception["class"] = apiError.errorType;
            payload.data.body.trace.exception["message"] = apiError.message;
        }
        Rollbar._enqueuePayload(payload, false, callerArgs);
    }

    function apiErrorToError(apiError) {
        const rollbarFakeErr = new Error();
        rollbarFakeErr._savedStackTrace = apiErrorToRollbarStackInfo(apiError);
        return rollbarFakeErr;
    }

    const svc = {
        reportJSException: function(exception, cause) {
            if (window.devInstance) {
                console.info("Dev instance, not reporting JS error"); /*@console*/ // NOSONAR: OK to use console.
                return;
            }
            if (window.dkuAppConfig && !window.dkuAppConfig.udr) {
                console.info("Reporting is disabled, not reporting JS error"); /*@console*/ // NOSONAR: OK to use console.
                return;
            }
            console.info("Reporting JS exception", exception); /* @console */ // NOSONAR: OK to use console.

            try {
                const customData = {
                    errorOrigin: "js-error"
                }
                if (cause) {
                    customData.causedBy = cause;
                }
                Rollbar.error(exception, customData);
            } catch (e) {
                console.warn("Rollbar failure", e); /*@console*/ // NOSONAR: OK to use console.
            }
            try {
                const params = {
                    type: "js-error",
                    message: exception.message,
                    stack: exception.stack
                };
                _wt1Q.push(["trackEvent", params]);
            } catch (e) {
                console.info("WT1 failure", e); /*@console*/ // NOSONAR: OK to use console.
            }
        },
        reportReflectedEvent: function(event) {
            if (window.devInstance) {
                console.info("Dev instance, not reporting reflected event"); /*@console*/ // NOSONAR: OK to use console.
                return;
            }
            if (window.dkuAppConfig && !window.dkuAppConfig.udr) {
                console.info("Reporting is disabled, not reporting reflected event"); /*@console*/ // NOSONAR: OK to use console.
                return;
            }
            try {
                // const customData = {
                //     errorOrigin: "reflected-event"
                // }
                if (event.exception) {
                    reportAPIError(event.exception, event.customData);
                } else {
                    Rollbar.error(event.message, event.customData);
                }
            } catch (e) {
                console.warn("Rollbar failure", e); /*@console*/ // NOSONAR: OK to use console.
            }
        },
        reportBackendAPIError: function(apiError) {
            if (window.devInstance) {
                console.info("Dev instance, not reporting API error"); /*@console*/ // NOSONAR: OK to use console.
                return;
            }
            if (window.dkuAppConfig && !window.dkuAppConfig.udr) {
                console.info("Reporting is disabled, not reporting API error"); /*@console*/ // NOSONAR: OK to use console.
                return;
            }
            if (apiError.httpCode == 0) {
                console.info("HTTP status 0 (network error), not reporting it", apiError); /*@console */ // NOSONAR: OK to use console.
                return;
            }
            if (apiError.httpCode == 502) {
                console.info("HTTP Gateway Error, not reporting it", apiError); /*@console */ // NOSONAR: OK to use console.
                return;
            }
            try {
                const customData = {
                    errorOrigin: "internal-api-error",
                    httpCode: apiError.httpCode
                };
                reportAPIError(apiError, customData);
            } catch (e) {
                console.warn("Rollbar failure", e); /*@console*/ // NOSONAR: OK to use console.
            }

            /* Report to WT1 */
            try {
                const params = {
                    type: "api-error",
                    httpCode: this.fatalAPIError.httpCode,
                    errorType: this.fatalAPIError.errorType,
                    message: this.fatalAPIError.message,
                    stack: this.fatalAPIError.details
                }
                _wt1Q.push(["trackEvent", params]);
            } catch (e) {
            }
        },
        configure: function() {
            if (window.devInstance) {
                window.DKUErrorReporting = svc;
                return;
            }

            const appConfig = window.dkuAppConfig;
            const dssVersion = appConfig.version && appConfig.version.product_version ? appConfig.version.product_version : "0.0.0-unknown";
            const payload = {
                person: {
                    id: appConfig.dipInstanceId,
                },
                client: {
                    javascript: {
                        source_map_enabled: true,
                        code_version: dssVersion
                    }
                },
                dssVersion: dssVersion,
                code_version: dssVersion
            };
            if (appConfig.licenseKind) {
                payload.dssLicenseKind = appConfig.licenseKind;
            } else {
                console.warn("No license kind in", appConfig); /* @console */ // NOSONAR: OK to use console.
            }
            if (appConfig.distrib) {
                payload.bkdDistrib = appConfig.distrib;
                payload.bkdDistribVersion = appConfig.distribVersion;
            }
            if (appConfig.registrationChannel) {
                payload.regChannel = appConfig.registrationChannel;
            }

            if (appConfig.login) {
                payload.dssUser = appConfig.login.dkuHashCode();
            }

            let env;
            if (window.devInstance || dssVersion.includes("doesnotmatter") || dssVersion.includes("dev")) {
                env = "dev-instance";
            } else if (dssVersion.includes("on-demand") || dssVersion.includes("daily")) {
                env = "test";
            } else if (dssVersion.includes("alpha") || dssVersion.includes("beta") || dssVersion.includes("rc")) {
                env = "pre-release";
            } else {
                env = "production";
            }

            if (window.dkuAppConfig && window.dkuAppConfig.udr) {
                console.info("Loading Rollbar code"); /*@console*/ // NOSONAR: OK to use console.
                var _rollbarConfig = {
                    accessToken: "9193daa4de9e4aa38aac29a46e7c0c86",
                    captureUncaught: true
                };
                !function(r){function o(e){if(t[e])return t[e].exports;var n=t[e]={exports:{},id:e,loaded:!1};return r[e].call(n.exports,n,n.exports,o),n.loaded=!0,n.exports}var t={};return o.m=r,o.c=t,o.p="",o(0)}([function(r,o,t){"use strict";var e=t(1).Rollbar,n=t(2);_rollbarConfig.rollbarJsUrl=_rollbarConfig.rollbarJsUrl||"https://d37gvrvc0wt4s1.cloudfront.net/js/v1.8/rollbar.min.js";var a=e.init(window,_rollbarConfig),i=n(a,_rollbarConfig);a.loadFull(window,document,!_rollbarConfig.async,_rollbarConfig,i)},function(r,o){"use strict";function t(r){return function(){try{return r.apply(this,arguments)}catch(o){try{console.error("[Rollbar]: Internal error",o)}catch(t){}}}}function e(r,o,t){window._rollbarWrappedError&&(t[4]||(t[4]=window._rollbarWrappedError),t[5]||(t[5]=window._rollbarWrappedError._rollbarContext),window._rollbarWrappedError=null),r.uncaughtError.apply(r,t),o&&o.apply(window,t)}function n(r){var o=function(){var o=Array.prototype.slice.call(arguments,0);e(r,r._rollbarOldOnError,o)};return o.belongsToShim=!0,o}function a(r){this.shimId=++s,this.notifier=null,this.parentShim=r,this._rollbarOldOnError=null}function i(r){var o=a;return t(function(){if(this.notifier)return this.notifier[r].apply(this.notifier,arguments);var t=this,e="scope"===r;e&&(t=new o(this));var n=Array.prototype.slice.call(arguments,0),a={shim:t,method:r,args:n,ts:new Date};return window._rollbarShimQueue.push(a),e?t:void 0})}function l(r,o){if(o.hasOwnProperty&&o.hasOwnProperty("addEventListener")){var t=o.addEventListener;o.addEventListener=function(o,e,n){t.call(this,o,r.wrap(e),n)};var e=o.removeEventListener;o.removeEventListener=function(r,o,t){e.call(this,r,o&&o._wrapped?o._wrapped:o,t)}}}var s=0;a.init=function(r,o){var e=o.globalAlias||"Rollbar";if("object"==typeof r[e])return r[e];r._rollbarShimQueue=[],r._rollbarWrappedError=null,o=o||{};var i=new a;return t(function(){if(i.configure(o),o.captureUncaught){i._rollbarOldOnError=r.onerror,r.onerror=n(i);var t,a,s="EventTarget,Window,Node,ApplicationCache,AudioTrackList,ChannelMergerNode,CryptoOperation,EventSource,FileReader,HTMLUnknownElement,IDBDatabase,IDBRequest,IDBTransaction,KeyOperation,MediaController,MessagePort,ModalWindow,Notification,SVGElementInstance,Screen,TextTrack,TextTrackCue,TextTrackList,WebSocket,WebSocketWorker,Worker,XMLHttpRequest,XMLHttpRequestEventTarget,XMLHttpRequestUpload".split(",");for(t=0;t<s.length;++t)a=s[t],r[a]&&r[a].prototype&&l(i,r[a].prototype)}return r[e]=i,i})()},a.prototype.loadFull=function(r,o,e,n,a){var i=function(){var o;if(void 0===r._rollbarPayloadQueue){var t,e,n,i;for(o=new Error("rollbar.js did not load");t=r._rollbarShimQueue.shift();)for(n=t.args,i=0;i<n.length;++i)if(e=n[i],"function"==typeof e){e(o);break}}"function"==typeof a&&a(o)},l=!1,s=o.createElement("script"),u=o.getElementsByTagName("script")[0],p=u.parentNode;s.crossOrigin="",s.src=n.rollbarJsUrl,s.async=!e,s.onload=s.onreadystatechange=t(function(){if(!(l||this.readyState&&"loaded"!==this.readyState&&"complete"!==this.readyState)){s.onload=s.onreadystatechange=null;try{p.removeChild(s)}catch(r){}l=!0,i()}}),p.insertBefore(s,u)},a.prototype.wrap=function(r,o){try{var t;if(t="function"==typeof o?o:function(){return o||{}},"function"!=typeof r)return r;if(r._isWrap)return r;if(!r._wrapped){r._wrapped=function(){try{return r.apply(this,arguments)}catch(o){throw o._rollbarContext=t()||{},o._rollbarContext._wrappedSource=r.toString(),window._rollbarWrappedError=o,o}},r._wrapped._isWrap=!0;for(var e in r)r.hasOwnProperty(e)&&(r._wrapped[e]=r[e])}return r._wrapped}catch(n){return r}};for(var u="log,debug,info,warn,warning,error,critical,global,configure,scope,uncaughtError".split(","),p=0;p<u.length;++p)a.prototype[u[p]]=i(u[p]);r.exports={Rollbar:a,_rollbarWindowOnError:e}},function(r,o){"use strict";r.exports=function(r,o){return function(t){if(!t&&!window._rollbarInitialized){var e=window.RollbarNotifier,n=o||{},a=n.globalAlias||"Rollbar",i=window.Rollbar.init(n,r);i._processShimQueue(window._rollbarShimQueue||[]),window[a]=i,window._rollbarInitialized=!0,e.processPayloads()}}}}]); // NOSONAR

                payload.environment = env;
                console.info("Configuring Rollbar: ", payload); /*@console*/ // NOSONAR: OK to use console.
                Rollbar.configure({
                    ignoredMessages: [
                        "NS_ERROR_NOT_CONNECTED:",
                        "ResizeObserver loop limit exceeded",
                        "ResizeObserver loop completed with undelivered notifications."
                    ],
                    payload: payload,
                    transform: function(payload) {
                        if (!payload || !payload.data || !payload.data.body || !payload.data.body.trace || !payload.data.body.trace.frames) return;
                        if (!payload.data.body.trace.extra || !payload.data.body.trace.extra.errorOrigin || payload.data.body.trace.extra.errorOrigin == "js-error") {
                            payload.data.body.trace.frames.forEach(function(frame) {
                                if (!frame.filename || typeof frame.filename != "string") return;
                                frame.filename = frame.filename.replace(urlWithProtocolAndHost(), "http://localhost:8082");
                            });
                        }
                    }
                });
            } else {
                console.info("Not loading Rollbar, error reporting disabled"); /*@console*/ // NOSONAR: OK to use console.
            }

            window.DKUErrorReporting = svc;
        }
    };
    return svc;
});

/*
WT1 is the service we use to send back usage statistics to Dataiku
*/
app.factory("WT1", function($rootScope, Logger) {
    let enabled = true;
    let configured = false;
    let unconfiguredCommands = [];

    window._wt1Q = [];

    // DSS Load identifier
    const DL_ID = (Math.random().toString(36)+'00000000000000000').slice(2, 12);

    return {
        configure: function() {
            const appConfig = $rootScope.appConfig;
            if (angular.isDefined(appConfig.dipInstanceId)) {
                _wt1Q.push(["setVisitorParam", "dipInstanceId", appConfig.dipInstanceId]);
            }
            if (appConfig.licenseKind) {
                _wt1Q.push(["setVisitorParam", "dssLicenseKind", appConfig.licenseKind]);
            } else {
                Logger.warn("No license kind in", appConfig);
            }
            if (appConfig.distrib) {
                _wt1Q.push(["setVisitorParam", "bkdDistrib", appConfig.distrib]);
                _wt1Q.push(["setVisitorParam", "bkdDistribVersion", appConfig.distribVersion]);
            }
            if (appConfig.registrationChannel) {
                _wt1Q.push(["setVisitorParam", "regChannel", appConfig.registrationChannel]);
            }
            _wt1Q.push(["setVisitorParam", "isAutomation", appConfig.isAutomation]);
            _wt1Q.push(["setVisitorParam", "dssVersion", appConfig.version && appConfig.version.product_version ? appConfig.version.product_version : "unknown"]);
            if (appConfig.login) {
                _wt1Q.push(["setSessionParam", "dssUser", appConfig.login.dkuHashCode()]);
                _wt1Q.push(["setVisitorParam", "vdssUser", appConfig.login.dkuHashCode()]);
            }
            if (!appConfig.udr || window.devInstance) {
                enabled = false;
            }
            configured = true;
            if (enabled) {
                for (const cmdIdx in unconfiguredCommands) {
                    _wt1Q.push(unconfiguredCommands[cmdIdx]);
                }
                /* Actually load track.js */
                (function() {
                    const script = document.createElement('script');
                    script.src = "//tracker.dataiku.com/js/track.js";
                    script.type = 'text/javascript';
                    script.async = "true";
                    const script0 = document.getElementsByTagName("script")[0];
                    script0.parentNode.insertBefore(script, script0);
                })();
            }
            // for non-angular stuff :/
            window.WT1SVC = this;
        },
        event: function(type, params) {
            if (window.devInstance) {
                const formattedDate = moment().format('HH:mm:ss.SSS');
                const prefix = '[' + formattedDate + ']';
                console.debug(prefix + " WT1: " + type, params); /*@console*/ // NOSONAR: OK to use console.
            }
            if (!enabled) {
                return;
            }
            if (angular.isUndefined(params)) {
                params = {};
            }
            params.type = type;
            if ($rootScope && $rootScope.appConfig && $rootScope.appConfig.login) {
                params.edssUser = $rootScope.appConfig.login.dkuHashCode();
            }

            if ($rootScope && $rootScope.appConfig && $rootScope.appConfig.hashedUserEmail) {
                params.hashedUserEmail = $rootScope.appConfig.hashedUserEmail;
            }
            if ($rootScope && $rootScope.appConfig && $rootScope.appConfig.userProfile) {
                params.userProfile = $rootScope.appConfig.userProfile.profile;
            }
            params.dlid = DL_ID;
            if (!configured) {
                // While it's not configured, we enqueue events
                // so that the session and visitor params are set
                // BEFORE we track the first state change event
                unconfiguredCommands.push(["trackEvent", params])
            } else {
                _wt1Q.push(["trackEvent", params]);
            }
        },
        setVisitorParam: function(key, value) {
            _wt1Q.push(["setVisitorParam", key, value]);
        },
        delVisitorParam: function(key) {
            _wt1Q.push(["delVisitorParam", key]);
        },
        setSessionParam: function(key, value) {
            _wt1Q.push(["setSessionParam", key, value]);
        },
        delSessionaram: function(key) {
            _wt1Q.push(["delSessionParam", key]);
        },
    };
});


app.directive("wt1ClickId", function(WT1) {
    return {
        restrict: 'A',
        link: function ($scope, element, attrs) {
            element.bind('click', function() {
                WT1.event("clicked-item", {"item-id": attrs.wt1ClickId});
            });
        }
    };
});
app.directive("wt1ClickEvent", function(WT1) {
    return {
        restrict: 'A',
        link: function ($scope, element, attrs) {
            element.bind('click', function() {
                WT1.event(attrs.wt1ClickEvent);
            });
        }
    };
});


app.factory("BackendReportsService", function($rootScope, $timeout, DataikuAPI, WT1, Logger, ErrorReporting) {
    $timeout(function() {
        if ($rootScope.appConfig && $rootScope.appConfig.loggedIn && $rootScope.appConfig.udr && !window.devInstance) {
            DataikuAPI.usage.popNextReport().success(function(data) {
                if (data.reportPublicId) {
                    Logger.info("sending report", data.reportType);
                    /* Something to send */
                    WT1SVC.event("v3-report", {
                        "reportType": data.reportType,
                        "reportId": data.reportPublicId,
                        "reportData": JSON.stringify(data.reportData)
                    });
                } else {
                    Logger.info("No report available");
                }
            });
        }

        if ($rootScope.appConfig && $rootScope.appConfig.loggedIn && $rootScope.appConfig.admin && $rootScope.appConfig.udr) {
            DataikuAPI.usage.popReflectedEvents().success(function(data) {
                data.events.forEach(function(evt) {
                    Logger.info("Reflecting event", evt);
                    if (evt.rollbarIt) {
                        ErrorReporting.reportReflectedEvent(evt);
                    }
                    WT1SVC.event("reflected-event", {
                        "reflectedEventData": JSON.stringify(evt)
                    });
                });
            });
        }

    }, 10000);
    return {
        //TODO this is actually not a service, it has no functionnality...
    };
});

})();



/// =================== Global ===================

window.WT1SVC = {
    event: function() {} // temporary before load
};

window.DKUErrorReporting = {
    reportBackendAPIError: function() {} // temporary before load
};


function setErrorInScope(data, status, headers, config, statusText, xhrStatus) {
    // Explicitely ignore JS errors by re-throwing
    // Allow using the function in catch() blocks like: .catch(setErrorInScope.bind($scope)) while having a clear stack trace
    // Whereas using .error(setErrorInScope.bind($scope)) expects `data` to be an http response
    if (data instanceof Error) {
        throw data;
    }

    if (status === undefined && headers === undefined) {
        status = data.status;
        headers = data.headers;
        data = data.data;
    }
    /* Put in bound scope */
    this.fatalAPIError = getErrorDetails(data, status, headers, statusText);
    this.fatalAPIError.html = getErrorHTMLFromDetails(this.fatalAPIError);

    /* Report to Rollbar */
    window.APIErrorLogger.error("API error", this.fatalAPIError);
    DKUErrorReporting.reportBackendAPIError(this.fatalAPIError);
}

function setErrorInScope2(payload) {
    setErrorInScope.call(this, JSON.parse(payload.response || '{}'), payload.status, h => payload.getResponseHeader(h));
}

function resetErrorInScope(scope) {
    if (scope.fatalAPIError) {
        scope.fatalAPIError.httpCode = null;
        scope.fatalAPIError.errorType = null;
    }
}

/* API error struct : {code, httpCode, message, details} */
function getErrorDetails(data, status, headers, statusText) {
    /* Network / HTTP error */
    if (data == null && status == -1) {
        return {
            httpCode: status,
            message: "Network error: " + (statusText === undefined ? "" : statusText),
            errorType: "XHRNetworkError"
        };
    }
    if (status == 413) {
        return {
            httpCode: status,
            message: data && data.message || 'No message',
            details: data && data.details || 'No details',
            errorType: "HTTPError413"
        };
    }

    if (data && data.$customMessage) {
        return {
            httpCode: status,
            code: 0,
            message: data.message || "Unknown error",
            details: data.details,
            errorType: data.errorType || "unknown"
        };
    }

    const ctype = headers("Content-type");
    if (ctype && ctype.startsWith("application/json") && data && data.errorType) {
        const apiError = data;
        apiError.httpCode = status;
        return apiError;
    } else {
        let errorType = "unknown";
        if (status == 502) {
            errorType = "Gateway error";
        }
        return {
            httpCode: status,
            code: 0,
            message: 'Unknown error',
            details: data && data.details || 'No details',
            errorType: errorType
        };
    }
}

function getErrorHTMLFromDetails(apiError) {
    let html = "<strong>Error " + apiError.code +": "+apiError.message +"</strong>";
    if (apiError.details) {
        html += "<pre>" + apiError.details +"</pre>";
    }
    return html;
}

function getErrorHTML(data, status, headers, statusText) {
    const apiError = getErrorDetails(data, status, headers, statusText);
    return getErrorHTMLFromDetails(apiError);
}

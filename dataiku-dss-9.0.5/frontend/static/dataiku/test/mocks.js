// Always put beforeEach(module("dataiku.mock")); last in tests

(function () {

    angular.module('dataiku.mock', [])

        .instantiable('Logger', function(LoggerProvider) {
            return LoggerProvider.getLogger();
        })

        .factory('LoggerProvider', function() {
            return {
                getLogger: function () {
                    var ret = {};
                    ['log', 'warn', 'debug', 'info', 'error'].forEach(function (v) {
                        ret[v] = function () {
                        };
                    });
                    return ret;
                }
            }
        })

        .factory('DataikuAPI', function() {
            return {};
        });

})();

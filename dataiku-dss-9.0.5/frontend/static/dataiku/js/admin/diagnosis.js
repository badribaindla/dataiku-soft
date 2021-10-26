(function(){
    'use strict';

    var services = angular.module('dataiku.services');

    services.factory('Diagnostics', function ($timeout, DataikuAPI, WT1, MessengerUtils) {
        function getLatest(success) {
            DataikuAPI.admin.diagnostics.getLatest().success(success);
        }
        function downLoadLatest () {
            var url = "/dip/api/admin/diagnostics/get-results";
            diagnosisDownloader.attr('src', url);
            $('body').append(diagnosisDownloader);
        }
        var diagnosisDownloader = $('<iframe>').attr('id', 'diagnosis-downloader');

        return {
            getLatest: getLatest, // only fetches metadata
            downLoadLatest: downLoadLatest
        };
    });

    services.factory('Logs', function(DataikuAPI) {

        function download(logFileName) {
            var url = "/dip/api/admin/logs/get-files?name=";
            if (logFileName) {
                url += logFileName;
            }
            logsDownloader.attr('src', url);
            $('body').append(logsDownloader);
        }

        function downloadDesignCodeEnv(envLang, envName, logName) {
            var url = "/dip/api/code-envs/design/stream-log?envLang=" + envLang + "&envName=" + encodeURIComponent(envName) + "&logName=" + encodeURIComponent(logName);
            logsDownloader.attr('src', url);
            $('body').append(logsDownloader);
        }

        function downloadAutomationCodeEnv(envLang, envName, logName) {
            var url = "/dip/api/code-envs/automation/stream-log?envLang=" + envLang + "&envName=" + encodeURIComponent(envName) + "&logName=" + encodeURIComponent(logName);
            logsDownloader.attr('src', url);
            $('body').append(logsDownloader);
        }

        function downloadCluster(clusterId, logName) {
            var url = "/dip/api/clusters/stream-log?clusterId=" + encodeURIComponent(clusterId) + "&logName=" + encodeURIComponent(logName);
            logsDownloader.attr('src', url);
            $('body').append(logsDownloader);
        }

        function downloadAll() {
            download(null)
        }

        function list() {
            return DataikuAPI.admin.logs.list();
        }

        function cat(logFileName) {
            return DataikuAPI.admin.logs.get(logFileName);
        }

        var logsDownloader = $('<iframe>').attr('id', 'logs-downloader');

        return {
            list: list,
            cat: cat,
            download: download,
            downloadAll: downloadAll,
            downloadDesignCodeEnv: downloadDesignCodeEnv,
            downloadAutomationCodeEnv: downloadAutomationCodeEnv,
            downloadCluster: downloadCluster
        };
    });
})();
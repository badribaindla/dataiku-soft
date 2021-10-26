(function(){
'use strict';


var app = angular.module('dataiku.report', []);

var reportsDownloader = $('<iframe>').attr('id', 'reports-downloader');

app.constant("RMARKDOWN_ALL_OUTPUT_FORMATS", [
    {name: 'HTML_NOTEBOOK', desc: 'HTML'},
    {name: 'PDF_DOCUMENT', desc: 'PDF'},

    {name: 'HTML_DOCUMENT', desc: 'HTML fixed layout'},
    {name: 'WORD_DOCUMENT', desc: 'Microsoft Word (docx)'},
    {name: 'ODT_DOCUMENT', desc: 'OpenDocument Text (odt)'},
    {name: 'RTF_DOCUMENT', desc: 'Rich Text Format (rtf)'},
    // {name: 'MD_DOCUMENT', desc: 'Markdown'},

    {name: 'IOSLIDES_PRESENTATION', desc: 'HTML presentation with ioslides'},
    {name: 'REVEALJS_PRESENTATION', desc: 'HTML presentation with reveal.js'},
    {name: 'SLIDY_PRESENTATION', desc: 'HTML W3C Slidy presentation'},
    {name: 'BEAMER_PRESENTATION', desc: 'PDF Beamer presentation'},

    {name: 'FLEX_DASHBOARD', desc: 'Flex dashboard'},
    {name: 'TUFTE_HANDOUT', desc: 'PDF Tufte style handout'},
    {name: 'TUFTE_HTML', desc: 'HTML Tufte style handout'},
    {name: 'TUFTE_BOOK', desc: 'PDF Tufte style book'},
    {name: 'HTML_VIGNETTE', desc: 'HTML vignette style'},
    // {name: 'GITHUB_DOCUMENT', desc: 'GitHub Flavored Markdown document'}
]);

app.constant("RMARKDOWN_PREVIEW_OUTPUT_FORMATS", [
    {name: 'HTML_NOTEBOOK', desc: 'HTML'},
    {name: 'PDF_DOCUMENT', desc: 'PDF'},

    {name: 'HTML_DOCUMENT', desc: 'HTML fixed layout'},
    // {name: 'IOSLIDES_PRESENTATION', desc: 'HTML presentation with ioslides'}, //seems buggy
    {name: 'REVEALJS_PRESENTATION', desc: 'HTML presentation with reveal.js'},
    {name: 'SLIDY_PRESENTATION', desc: 'HTML W3C Slidy presentation'},
    {name: 'BEAMER_PRESENTATION', desc: 'PDF Beamer presentation'},

    // {name: 'FLEX_DASHBOARD', desc: 'Flex dashboard'}, //seems buggy
    // {name: 'TUFTE_HANDOUT', desc: 'PDF Tufte style handout'},
    // {name: 'TUFTE_HTML', desc: 'HTML Tufte style handout'},
    // {name: 'TUFTE_BOOK', desc: 'PDF Tufte style book'},
    {name: 'HTML_VIGNETTE', desc: 'HTML vignette style'},
]);

app.controller("ReportsCommonController", function($scope, $rootScope, $state, $stateParams, $q, $controller, $sce, $window,
               TopNav, LoggerProvider, WT1, DataikuAPI, FutureWatcher, CreateModalFromTemplate, FutureProgressModal, ActivityIndicator, TAIL_STATUS) {

    $scope.hooks = $scope.hooks || {};

    $scope.copy = function(report, callBackFunc) {
        function showModal() {
            var newScope = $scope.$new();
            newScope.report = report;
            CreateModalFromTemplate("/templates/code-reports/copy-report-modal.html", newScope)
            .then(function() {
                if (typeof(callBackFunc) === 'function') callBackFunc();
            });
        }
        if ($scope.hooks.save) {
            $scope.saveReport().then(showModal, setErrorInScope.bind($scope));
        } else {
            showModal();
        }
    };

    $scope.publish = function(report) {
        WT1.event("report-publish", {reportId: $stateParams.id});

        DataikuAPI.reports.snapshots.create($scope.report.projectKey, $scope.report.id).success(function(data) {
            FutureProgressModal.show($scope, data, "Building report for publication...").then(function(result) {
                const insight = {
                    projectKey: $stateParams.projectKey,
                    type: 'report',
                    name: report.name,
                    params: {
                        reportSmartId: report.id,
                        loadLast: true,
                        viewFormat: $scope.report.params.viewFormat
                    }
                };

                CreateModalFromTemplate("/templates/dashboards/insights/create-and-pin-insight-modal.html", $scope, "CreateAndPinInsightModalController", function(newScope) {
                    newScope.init(insight);
                });
            });
        })
        .error(setErrorInScope.bind($scope));
    };

    $scope.createSnapshot = function() {
        DataikuAPI.reports.snapshots.create($scope.report.projectKey, $scope.report.id).success(function(data) {
            FutureProgressModal.show($scope, data, "Building report for snapshot...").then(function(result) {
                ActivityIndicator.success('Snapshot done', 3000);
            });
        })
        .error(setErrorInScope.bind($scope));
    };

    $scope.saveReportMetadata = function() {
        return DataikuAPI.reports.saveMetadata($scope.report)
        .success(function(resp) {
            ActivityIndicator.success("Saved!");
        })
        .error(setErrorInScope.bind($scope));
    };

    $scope.saveCustomFields = function(newCustomFields) {
        WT1.event('custom-fields-save', {objectType: 'REPORT'});
        let oldCustomFields = angular.copy($scope.report.customFields);
        $scope.report.customFields = newCustomFields;
        return $scope.saveReportMetadata().then(function() {
                $rootScope.$broadcast('customFieldsSaved', TopNav.getItem(), $scope.report.customFields);
            }, function() {
                $scope.report.customFields = oldCustomFields;
            });
    };

    $scope.editCustomFields = function() {
        if (!$scope.report) {
            return;
        }
        let modalScope = angular.extend($scope, {objectType: 'REPORT', objectName: $scope.report.name, objectCustomFields: $scope.report.customFields});
        CreateModalFromTemplate("/templates/taggable-objects/custom-fields-edit-modal.html", modalScope).then(function(customFields) {
            $scope.saveCustomFields(customFields);
        });
    };

    $scope.getViewURL = function(report) {
        report = report || $scope.report;
        var url = "/dip/api/reports/view?" + $.param({
            projectKey: report.projectKey,
            id: report.id,
            inEditMode : $state.current.name.endsWith(".edit")
        });
        return $sce.trustAsResourceUrl(url);
    };

    $scope.download = function(report, format) {
        report = report || $scope.report;
        var newScope = $scope.$new();
        newScope.report = report;
        CreateModalFromTemplate("/templates/code-reports/download-report-modal.html", newScope, "DownloadReportModalController", function(modalScope) {
            modalScope.handleDownload = function(initialResponse, options, reportsDownloader) {
                WT1.event("report-download", {format: options.format});
                modalScope.dismiss(); // dismiss modal 1
                FutureProgressModal.show($scope, initialResponse, "Preparing download").then(function(result) {
                     var url = "/dip/api/reports/download?" + $.param({
                        projectKey: report.projectKey,
                        id: report.id,
                        format: options.format
                    });

                    reportsDownloader.attr('src', url);
                    $('body').append(reportsDownloader);
                });
            };
        });
    };
});


app.controller("ReportsListController", function($scope, $controller, $stateParams, DataikuAPI, CreateModalFromTemplate, Dialogs,$state,$q, TopNav, Fn, $filter) {
    $controller('_TaggableObjectsListPageCommon', {$scope: $scope});
    $controller("ReportsCommonController", {$scope: $scope});

    $scope.listHeads = DataikuAPI.reports.listHeads;

    $scope.sortBy = [
        { value: 'name', label: 'Name' },
        { value: '-lastModifiedOn', label: 'Last modified' }
    ];

    $scope.selection = $.extend({
        filterQuery: {
            userQuery: '',
            tags: [],
            interest: {
                starred: '',
            },
        },
        filterParams: {
            userQueryTargets: ["name","tags"],
            propertyRules: {tag: "tags"},
        },
        orderQuery: "-lastModifiedOn",
        orderReversed: false,
    }, $scope.selection || {});

    $scope.sortCookieKey = 'reports';
    $scope.maxItems = 20;

    TopNav.setLocation(TopNav.TOP_NOTEBOOKS, 'reports', TopNav.TABS_NONE, null);
    TopNav.setNoItem();
    $scope.list() ;

    /* Specific actions */
    $scope.goToItem = function(data) {
        $state.go("projects.project.analyses.analysis.script", {projectKey : $stateParams.projectKey, analysisId : data.id});
    }

    $scope.createReport = function() {
        // For the time being only one available type of report
        var reportType = "RMARKDOWN";

        $scope.report = {
            type: reportType,
            name: reportType.toLowerCase() + ' report'
        };

        DataikuAPI.reports.listTemplates(reportType).success(function(data) {
            $scope.availableTemplates = data.templates;
            $scope.report.template = $scope.availableTemplates[0];
        }).error(setErrorInScope.bind($scope));

        CreateModalFromTemplate("/templates/code-reports/new-report-modal.html", $scope);
    };
});

app.controller("ReportPageRightColumnActions", async function($controller, $scope, $rootScope, $stateParams,GlobalProjectActions, ActiveProjectKey, DataikuAPI) {

    $controller('_TaggableObjectPageRightColumnActions', {$scope: $scope});

    $scope.reportFullInfo = (await DataikuAPI.reports.getFullInfo(ActiveProjectKey.get(), $stateParams.reportId)).data;
    $scope.report = $scope.reportFullInfo.report;
    $scope.report.interest = $scope.reportFullInfo.interest;
    $scope.report.nodeType = 'REPORT';

    $scope.selection = {
        selectedObject : $scope.report,
        confirmedItem : $scope.report
    };

    $scope.updateUserInterests = function() {
        DataikuAPI.interests.getForObject($rootScope.appConfig.login, "REPORT", ActiveProjectKey.get(), $scope.data.object.id)
            .success(function(data){
                $scope.selection.selectedObject.interest = data;
            })
            .error(setErrorInScope.bind($scope));
    }

    const interestsListener = $rootScope.$on('userInterestsUpdated', $scope.updateUserInterests);

    $scope.$on("$destroy", interestsListener);
});

app.directive('reportRightColumnSummary', function(DataikuAPI, $stateParams, $rootScope, GlobalProjectActions, QuickView, $controller, ActivityIndicator){
    return {
        templateUrl :'/templates/code-reports/right-column-summary.html',
        link : function($scope, element, attrs) {
            $controller("ReportsCommonController", {$scope: $scope});
            $controller('_TaggableObjectsMassActions', {$scope: $scope});
            $controller('_TaggableObjectsCapabilities', {$scope: $scope});

            $scope.QuickView = QuickView;

            /* Auto save when summary is modified */
            $scope.$on("objectSummaryEdited", function(){
                return DataikuAPI.reports.saveMetadata($scope.report).success(function(data) {
                    ActivityIndicator.success("Saved");
                }).error(setErrorInScope.bind($scope));
            });

            $scope.refreshData = function() {
                $scope.reportFullInfo = { report: $scope.selection.selectedObject }; // temporary incomplete data
                DataikuAPI.reports.getFullInfo($scope.selection.selectedObject.projectKey, $scope.selection.selectedObject.id).success(function(data) {
                    if (!$scope.selection.selectedObject
                        || $scope.selection.selectedObject.id != data.report.id
                        || $scope.selection.selectedObject.projectKey != data.report.projectKey) {
                        return; //too late!
                    }
                    $scope.reportFullInfo = data;
                    $scope.report = data.report;
                }).error(setErrorInScope.bind($scope));
            };

            $scope.$watch("selection.confirmedItem", function(nv, ov) {
                if (!nv) return;
                $scope.refreshData();
            });
        }
    }
});


app.controller("ReportSummaryController", function($scope, $rootScope, $stateParams, DataikuAPI, TopNav) {
    TopNav.setLocation(TopNav.TOP_NOTEBOOKS, 'reports', null, 'summary');

    $scope.$on("objectSummaryEdited", $scope.saveReportMetadata);

    $scope.$on('customFieldsSummaryEdited', function(event, customFields) {
        $scope.saveCustomFields(customFields);
    });
});


app.controller("ReportCoreController", function($scope, $controller, $state, $stateParams, $filter, $q,
               DataikuAPI, CreateModalFromTemplate, Dialogs, TopNav, Fn, WT1, ActivityIndicator,
               RMARKDOWN_PREVIEW_OUTPUT_FORMATS, RMARKDOWN_ALL_OUTPUT_FORMATS) {

    $controller("ReportsCommonController", {$scope: $scope});

    function getSummary() {
        return DataikuAPI.reports.getSummary($stateParams.projectKey, $stateParams.reportId).success(function(data) {
            $scope.report = data.object;
            $scope.hooks.script = data.script;
            $scope.timeline = data.timeline;
            $scope.interest = data.interest;
            $scope.backendState = data.backendState;
            $scope.backendRunning = !!(data.backendState && data.backendState.futureId && data.backendState.futureInfo && data.backendState.futureInfo.alive);
            $scope.hooks.origReport = angular.copy($scope.report);
            $scope.hooks.origScript = $scope.hooks.script;

            TopNav.setItem(TopNav.ITEM_REPORT, $stateParams.reportId, $scope.report);
            TopNav.setPageTitle($scope.report.name + " - Report");

            $scope.$watch("report.name", function(nv) {
                if (!nv) return;
                $state.go($state.current, {reportName: $filter('slugify')(nv)}, {location: true, inherit:true, notify:false, reload:false});
            });

        }).error(setErrorInScope.bind($scope));
    }

    getSummary().then(function() {
        TopNav.setItem(TopNav.ITEM_REPORT, $stateParams.reportId, $scope.report);
        TopNav.setPageTitle($scope.report.name + " - Report");

        $scope.$watch("report.name", function(nv) {
            if (!nv) return;
            $state.go($state.current, {reportName: $filter('slugify')(nv)}, {location: true, inherit:true, notify:false, reload:false});
        });
    });

    $scope.isDirty = function() {
        return !angular.equals($scope.report, $scope.hooks.origReport) || !angular.equals($scope.hooks.script, $scope.hooks.origScript);
    };

    $scope.saveReport = function(commitMessage) {
        return $scope.hooks.save(commitMessage);
    };

    $scope.saveReportMetadata = function() {
        WT1.event("report-save-metadata", {reportId: $stateParams.id, type: $scope.report.type});

        return DataikuAPI.reports.saveMetadata($scope.report)
            .error(setErrorInScope.bind($scope))
            .success(function(resp) {
                ActivityIndicator.success("Saved!");
                $scope.hooks.origReport = angular.copy($scope.report);
                $scope.hooks.origScript = $scope.hooks.script;
            });
    };

    // Formats available for in browser view
    $scope.viewFormats = RMARKDOWN_PREVIEW_OUTPUT_FORMATS;
    $scope.snapshotFormats = RMARKDOWN_ALL_OUTPUT_FORMATS;
});


app.controller("ReportViewController", function($scope, TopNav) {
    TopNav.setLocation(TopNav.TOP_NOTEBOOKS, 'reports', null, 'view');
});


app.controller("NewReportModalController", function($scope, $state, $stateParams, WT1, DataikuAPI) {
    $scope.create = function() {
        WT1.event("report-create", {});
        DataikuAPI.reports.create($stateParams.projectKey, $scope.report.name, $scope.report.template)
        .success(function(report) {
            $scope.resolveModal(report);
            $state.go("projects.project.reports.report.edit", {projectKey: $stateParams.projectKey, reportId: report.id});
        })
        .error(setErrorInScope.bind($scope));
    };
});


app.controller("CopyReportModalController", function($scope, $state, DataikuAPI, ActivityIndicator, StateUtils, WT1) {

    $scope.newReport = {
        name: "Copy of "+$scope.report.name
    };

    $scope.copyReport = function() {
        WT1.event("report-copy", {type: $scope.report.type});
        return DataikuAPI.reports.copy($scope.report.projectKey, $scope.report.id, $scope.newReport.name)
        .success(function(createdReport) {
            $scope.resolveModal(createdReport);
            var href = $state.href("projects.project.reports.report.edit", {projectKey: createdReport.projectKey, reportId: createdReport.id});

            ActivityIndicator.success(
                '<strong>'+$scope.report.name + '</strong> copied into <strong>' + createdReport.name + '</strong>, ' +
                '<a href="'+href+'">edit it now</a>.'
                , 5000);

            if ($scope.list) {
                $scope.list();
                $scope.selection.selectedObject = null;
            }
        })
        .error(setErrorInScope.bind($scope))
    };
});


app.controller("DownloadReportModalController", function($scope, $controller, DataikuAPI, CreateModalFromTemplate, FutureWatcher, ProgressStackMessageBuilder, RMARKDOWN_ALL_OUTPUT_FORMATS) {
    $scope.formats = RMARKDOWN_ALL_OUTPUT_FORMATS;

    $scope.options = {
        format: 'PDF_DOCUMENT'
    };

    $scope.downloadReport = function() {
        DataikuAPI.reports.prepareDownload($scope.report.projectKey, $scope.report.id, $scope.options.format)
        .success(function(initialResponse) {
            $scope.handleDownload(initialResponse, $scope.options, reportsDownloader);
        }).error(setErrorInScope.bind($scope));
    };
});


app.controller("ReportHistoryController", function($scope, TopNav) {
    TopNav.setLocation(TopNav.TOP_NOTEBOOKS, "report", null, "history");
});

})();
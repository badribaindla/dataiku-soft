(function() {
'use strict';

const app = angular.module('dataiku.lambda', []);


app.controller("LambdaServicesListController", function($scope, $controller, $stateParams, DataikuAPI, Dialogs, $state,
    TopNav, WT1, ActivityIndicator) {
    $controller('_TaggableObjectsListPageCommon', {$scope: $scope});

    TopNav.setNoItem();
    TopNav.setLocation(TopNav.TOP_MORE, "lambda", TopNav.TABS_NONE, null);

    $scope.sortBy = [
        {
            value: 'id',
            label: 'Id'
        },
        {
            value: 'name',
            label: 'Name'
        },
        {
            value: 'endpoints.length',
            label: 'Number of endpoints'
        }
    ];
    $scope.sortCookieKey = 'lambdaservices';
    $scope.selection = $.extend({
        filterQuery: {
            userQuery: '',
            tags: [],
            interest: {
                starred: '',
            },
        },
        filterParams: {
            userQueryTargets: ["id",'tags'],
            propertyRules: {tag:"tags"},
        },
        orderQuery: "name",
        orderReversed: false,
    }, $scope.selection || {});

    $scope.maxItems = 20;

    $scope.list = function() {
        DataikuAPI.lambda.services.listHeads($stateParams.projectKey).success(function(data) {
            $scope.listItems = data.items;
            $scope.restoreOriginalSelection();
        }).error(setErrorInScope.bind($scope));
    };
    $scope.list() ;

    $scope.goToItem = function(data) {
        $state.go("projects.project.lambdaservices.service.endpoints", {projectKey: $stateParams.projectKey, serviceId: data.id});
    }

    $scope.newService = function() {
        Dialogs.prompt($scope, "Create API service", "Unique service ID", "", { pattern: "[\\w-]+" })
            .then(function(id) {
                WT1.event('create-api-service');
                DataikuAPI.lambda.services.create($stateParams.projectKey, id)
                    .success(function() {
                        $state.go("projects.project.lambdaservices.service.endpoints", {projectKey: $stateParams.projectKey, serviceId: id});
                    }).error(setErrorInScope.bind($scope));
            });
    };

    $scope.customMassDeleteSelected = DataikuAPI.lambda.services.deleteMulti;

    $scope.$on("objectSummaryEdited", function() {
        return DataikuAPI.lambda.services.save($stateParams.projectKey, $scope.selection.selectedObject).success(
            function(data) {
                ActivityIndicator.success("Saved");
            }).error(setErrorInScope.bind($scope));
    });
});

app.directive('lambdaServiceRightColumnSummary', function(DataikuAPI, $stateParams){
    return {
        templateUrl :'/templates/lambda/right-column-summary.html',
        link: function(scope) {
            scope.refreshData = function(serviceId) {
                DataikuAPI.lambda.services.getSummary($stateParams.projectKey, serviceId)
                .success(function(summary) {
                    scope.serviceSummary = summary;
                }).error(setErrorInScope.bind(scope));
            };

            scope.$watch("selection.confirmedItem", function(nv) {
                if (!nv) return;
                scope.refreshData(nv.id);
            });
        }
    }
});

app.controller("LambdaServiceSummaryController", function($scope, $rootScope, $stateParams, DataikuAPI, TopNav) {
    TopNav.setLocation(TopNav.TOP_HOME, 'lambda', null, 'summary');

    $scope.$on("objectSummaryEdited", $scope.saveService);

    $scope.$on('customFieldsSummaryEdited', function(event, customFields) {
        $scope.saveCustomFields(customFields);
    });
});


app.controller("LambdaServiceBaseController", function($scope, $state, $stateParams, $q, DataikuAPI, TopNav, Logger, Dialogs, Fn, FutureProgressModal, CreateModalFromTemplate, $rootScope, WT1) {
    TopNav.setItem(TopNav.ITEM_LAMBDA_SERVICE, $stateParams.serviceId);

    let savedService; //for dirtyness detection
    function getSummary() {
        return DataikuAPI.lambda.services.getSummary($stateParams.projectKey, $stateParams.serviceId).success(function(data) {
            $scope.service = data.object;
            $scope.timeline = data.timeline;
            $scope.interest = data.interest;
            savedService = angular.copy($scope.service);

            TopNav.setItem(TopNav.ITEM_LAMBDA_SERVICE, $stateParams.serviceId, {name: $scope.service.name});
            TopNav.setPageTitle($scope.service.name + " - API Service");
        }).error(setErrorInScope.bind($scope));
    }

    getSummary().then(function() {
        DataikuAPI.lambda.devServer.getStatus().success(function(data) {
            $scope.lambdaDevServerStatus = data;
        });
    })

    $scope.serviceIsDirty = function() {
        return $scope.service && savedService && !angular.equals($scope.service, savedService);
    };

    $scope.saveServiceIfNeeded = function() {
        if ($scope.serviceIsDirty()) {
            return $scope.saveService();
        }
        return $q.when(null);
    };

    $scope.saveService = function() {
        return DataikuAPI.lambda.services.save($stateParams.projectKey, $scope.service).success(function(data) {
            // Update API keys, some may have been generated on save
            $scope.service.authRealm.queryKeys = data.authRealm.queryKeys;
            savedService = angular.copy($scope.service);
        }).error(setErrorInScope.bind($scope));
    };

    const allowedTransitions = [
        'projects.project.lambdaservices.service.summary',
        'projects.project.lambdaservices.service.endpoints',
        'projects.project.lambdaservices.service.packages',
        'projects.project.lambdaservices.service.config',
    ];
    checkChangesBeforeLeaving($scope, $scope.serviceIsDirty, null, allowedTransitions);

    // Suggest next non-existing name (preferably vX+1, else based on last package)
    $scope.suggestNextName = function(names) {
        if (!names || !names.length) return "v1";
        let matches = names.filter(Fn.regexp(/^v\d+$/i));
        let v;
        let last;
        if (matches.length) {
            v = parseInt(matches[0].substr(1)) + 1;
            while (matches.indexOf("v" + v) >= 0) v++;
            return "v" + v;
        }
        last = names.pop();
        matches = last.match(/(.*)(\d+)(\D*)$/); // rightmost digits
        if (matches) {
            v = parseInt(matches[2]) + 1
            while (names.indexOf(matches[1] + v + matches[3]) >= 0) v++;
            return matches[1] + v + matches[3];
        }
        return last + "2";
    };

    $scope.startPreparePackage = function() {
        Logger.info("Preparing package");

        $q.all([DataikuAPI.lambda.packages.list($stateParams.projectKey, $stateParams.serviceId), $scope.saveServiceIfNeeded()])
            .then(function(data) {
                const names = data[0].data.map(Fn.prop("id"));
                Dialogs.prompt($scope, "New API service version", "Version ID", $scope.suggestNextName(names), { pattern: "^(?!\\.)[\\w\\.-]+$" })
                    .then(function(id) {
                        $state.go("projects.project.lambdaservices.service.packages", {reload:true});

                        DataikuAPI.lambda.services.startPreparePackage($stateParams.projectKey, $stateParams.serviceId, id).success(function(data) {
                            FutureProgressModal.show($scope, data, "Build package").then(function(result) {
                                if (result && result.anyMessage) { // undefined in case of abort
                                    Dialogs.infoMessagesDisplayOnly($scope, "Build result", result, result.futureLog);
                                }
                                $scope.$broadcast("packageReady");
                            });
                        }).error(setErrorInScope.bind($scope));
                    });
            });
    };

    $scope.publishVersionOnDeployer = function(versionId, canChangeVersion) {
        if ($rootScope.appConfig.remoteDeployerMisconfigured) {
            Dialogs.ack($scope, 'Remote deployer not properly configured',
                'To push to a remote deployer, you must previously register it in the DSS instance settings (admin rights required)');
        } else {
            if (!versionId) {
                DataikuAPI.lambda.packages.list($stateParams.projectKey, $stateParams.serviceId)
                    .success(function(packages) {
                        $scope.publishVersionOnDeployer($scope.suggestNextName(packages.map(p => p.id)), true);
                    }).error(setErrorInScope.bind($scope));
            } else {
                $scope.saveService().then(function() {
                    CreateModalFromTemplate("/templates/lambda/publish-version-on-deployer-modal.html", $scope, "PublishVersionOnDeployerModalController", function(modalScope) {
                        modalScope.uploadParams = {canChangeVersion, versionId};
                    });
                });
            }
        }
    };

    $scope.deployToDevServer = function() {
        Logger.info("Deploying to dev server");
        let firstPromise = $q.when(null);
        if ($scope.serviceIsDirty()) {
            firstPromise = $scope.saveService();
        }
        return firstPromise.then(function() {
            const promise = DataikuAPI.lambda.services.deployDev($stateParams.projectKey, $stateParams.serviceId);
            promise.error(setErrorInScope.bind($scope));
            $scope.$broadcast("devServerDeploymentStarted", promise);

            promise.then(function(data) {
                DataikuAPI.lambda.devServer.getStatus().success(function(data) {
                    $scope.lambdaDevServerStatus = data;
                });
            });
            return promise;
        });
    };

    $scope.saveCustomFields = function(newCustomFields) {
        WT1.event('custom-fields-save', {objectType: 'LAMBDA_SERVICE'});
        let oldCustomFields = angular.copy($scope.service.customFields);
        $scope.service.customFields = newCustomFields;
        return $scope.saveService().then(function() {
                $rootScope.$broadcast('customFieldsSaved', TopNav.getItem(), $scope.service.customFields);
            }, function() {
                $scope.service.customFields = oldCustomFields;
            });
    };

    $scope.editCustomFields = function() {
        if (!$scope.service) {
            return;
        }
        let modalScope = angular.extend($scope, {objectType: 'LAMBDA_SERVICE', objectName: $scope.service.name, objectCustomFields: $scope.service.customFields});
        CreateModalFromTemplate("/templates/taggable-objects/custom-fields-edit-modal.html", modalScope).then(function(customFields) {
            $scope.saveCustomFields(customFields);
        });
    };
});


app.controller("LambdaServiceConfigController", function($stateParams, $scope, $state, DataikuAPI, TopNav, Dialogs, CreateModalFromTemplate, Fn) {
    TopNav.setLocation(TopNav.TOP_HOME, "lambda", TopNav.TABS_LAMBDA, "conf");

    function editApiKey(isNew, apiKey) {
        return CreateModalFromTemplate("/templates/lambda/api-key-modal.html", $scope, null, function(modalScope) {
            modalScope.apiKey = apiKey;
        });
    };

    $scope.editAPIKey = editApiKey.bind(null, false);
    $scope.newAPIKey = function() {
        const apiKey = {
            createdOn: Date.now(),
            createdBy: $scope.appConfig.login
        };
        editApiKey(true, apiKey).then(function(k) {
            $scope.service.authRealm.queryKeys.push(apiKey);
        });
    };
});


app.controller("LambdaServicePackagesController", function($stateParams, $scope, $state, DataikuAPI, TopNav, Dialogs, CreateModalFromTemplate) {
    TopNav.setLocation(TopNav.TOP_HOME, "lambda", TopNav.TABS_LAMBDA, "packages");

    function listPackages() {
        DataikuAPI.lambda.packages.list($stateParams.projectKey, $stateParams.serviceId)
            .success(function(packages) {
                $scope.packages = packages;
            }).error(setErrorInScope.bind($scope));
    }
    listPackages();
    $scope.$on("packageReady", listPackages);

    $scope.deletePackage = function(packageId) {
        Dialogs.confirmSimple($scope, "Are you sure you want to delete package <code>" + packageId + "</code>?")
            .then(function() {
                DataikuAPI.lambda.packages.delete($stateParams.projectKey, $stateParams.serviceId, packageId)
                    .success(listPackages)
                    .error(setErrorInScope.bind($scope));
            });
    };

    $scope.downloadPackage = function(packageId) {
        $('body').append(['<iframe src="/dip/api/lambda-services/package/download?projectKey=',
            encodeURIComponent($stateParams.projectKey),
            "&serviceId=", encodeURIComponent($stateParams.serviceId),
            "&packageId=", encodeURIComponent(packageId),
            '"></iframe>'
        ].join(''));
    };
});


app.controller('NewEndpointFromSavedModelModalController', function($scope, $stateParams, DataikuAPI, StateUtils, WT1) {
    DataikuAPI.lambda.services.list($stateParams.projectKey).success(function(lambdaServices) {
        $scope.lambdaServices = lambdaServices;
    }).error(setErrorInScope.bind($scope));

    $scope.createEndPoint = function() {
        WT1.event('add-model-api-endpoint');
        DataikuAPI.lambda.services.addEndpoint($stateParams.projectKey, $scope.service.id, $scope.service.create, $scope.ep)
            .success(function(service) {
                $scope.resolveModal();
                StateUtils.go.lambdaService(service.id, service.projectKey);
            })
            .error(setErrorInScope.bind($scope));
    };
});


app.controller('PublishVersionOnDeployerModalController', function($scope, $rootScope, $stateParams, $q, DataikuAPI, WT1, FutureProgressModal, ActivityIndicator, Dialogs, StringUtils) {
    $scope.publishedServiceIds = [];
    let suggestedServiceId;
    $scope.$watch('uploadParams.targetService.createServiceMessage', function(nv, ov) {
        if (nv) {
            $scope.uploadParams.targetService.serviceBasicInfo.id = suggestedServiceId;
        }
    });

    DataikuAPI.apideployer.client.listPublishedServices()
        .success(function(response) {
            $scope.publishedServices = response.filter(serviceStatus => serviceStatus.canWrite).sort((a, b) => a.serviceBasicInfo.name.localeCompare(b.serviceBasicInfo.name));
            suggestedServiceId = StringUtils.transmogrify($stateParams.serviceId,
                                                          $scope.publishedServices.map(_ => _.serviceBasicInfo.id),
                                                          (count, name) => `${name}-${count}`);
            $scope.publishedServices.unshift({createServiceMessage: "Create a new service...", packages: [], serviceBasicInfo: {id: suggestedServiceId}});
            $scope.publishedServiceIds = $scope.publishedServices.map(function(serviceStatus) {
                if (serviceStatus.createServiceMessage || (serviceStatus.serviceBasicInfo.id === serviceStatus.serviceBasicInfo.name)) return "";
                return serviceStatus.serviceBasicInfo.id;
            });
            $scope.uploadParams.targetService = $scope.publishedServices.find(service => service.serviceBasicInfo.id === $stateParams.serviceId);
            if (!$scope.uploadParams.targetService || $scope.uploadParams.targetService.packages.find(version => version.id === $scope.uploadParams.versionId)) {
                $scope.uploadParams.targetService = $scope.publishedServices[0];
            }
        })
        .error(setErrorInScope.bind($scope));

    $scope.ok = function() {
        function createAVersionIfNecessary() {
            if ($scope.uploadParams.canChangeVersion) {
                const deferred = $q.defer();
                DataikuAPI.lambda.services.startPreparePackage($stateParams.projectKey, $stateParams.serviceId, $scope.uploadParams.versionId).success(function(data) {
                    FutureProgressModal.show($scope, data, "Build package").then(function(result) {
                        if (result && result.anyMessage) { // undefined in case of abort
                            Dialogs.infoMessagesDisplayOnly($scope, "Build result", result, result.futureLog).then(function(){
                                $scope.resolveModal();
                            })
                        } else { 
                            $rootScope.$broadcast("packageReady");
                            deferred.resolve();
                        }
                    });
                }).error(setErrorInScope.bind($scope));
                return deferred.promise;
            } else {
                return $q.when(null);
            }
        }
        createAVersionIfNecessary().then(function() {
            DataikuAPI.lambda.packages.publishToAPIDeployer($scope.service.projectKey, $scope.service.id, $scope.uploadParams.versionId, $scope.uploadParams.targetService.serviceBasicInfo.id)
                .success(function() {
                    if ($rootScope.appConfig.deployerMode == 'LOCAL') {
                        ActivityIndicator.success(`Service published on API deployer! <a href="/api-deployer/services/${$scope.uploadParams.targetService.serviceBasicInfo.id}/?versions=${$scope.uploadParams.versionId}"  target="_blank">Open API deployer.</a>`, 5000);
                    } else if ($rootScope.appConfig.deployerURL) {
                        const deployerURL = $rootScope.appConfig.deployerURL + '/api-deployer/services/' + $scope.uploadParams.targetService.serviceBasicInfo.id + "/?versions=" + $scope.uploadParams.versionId;
                        ActivityIndicator.success(`Service published on API deployer! <a href="${deployerURL}" target="_blank">Open API deployer.</a>`, 5000);
                    }
                    $scope.resolveModal();
                    WT1.event('api-deployer-publish-to-deployer');
                })
                .error(setErrorInScope.bind($scope));
        });
    };
});


app.service("LambdaServicesService", function($rootScope, CreateModalFromTemplate) {
    this.newEndpointFromSavedModel = function(savedModelId, savedModelName) {
        CreateModalFromTemplate("/templates/lambda/new-endpoint-from-saved-model-modal.html", $rootScope, 'NewEndpointFromSavedModelModalController', function(modalScope) {
            modalScope.service = {
                create: true,
                id: null
            };

            modalScope.ep = {
                type: 'STD_PREDICTION',
                modelRef: savedModelId,
                useJava: true
            };

            modalScope.savedModelName = savedModelName;
        });
    };
});


})();

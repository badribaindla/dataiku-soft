(function () {
    'use strict';

    var app = angular.module('dataiku.connections', []);

    /* Base controller used both for ConnectionsList and hive indexing (as a lot of layout and actions are common) */
    app.controller("_ConnectionsListBaseController", function ($scope, TopNav, DataikuAPI, Dialogs, $timeout, $state, ConnectionUtils, CreateModalFromTemplate, FutureProgressModal) {
        $scope.noTags = true;
        $scope.noStar = true;
        $scope.noWatch = true;
        $scope.noDelete = false;
        $scope.canIndexConnections = true;
        $scope.canCreateConnection = $state.is('admin.connections.list');
        $scope.noDelete = !$state.is('admin.connections.list');
        $scope.selection = $.extend({
            filterQuery: {
                userQuery: '',
                tags: [],
                interest: {
                    starred: '',
                },
            },
            filterParams: {
                userQueryTargets: ["name", "type", "tags"],
                propertyRules: {"tag": "tags"}
            },
            orderQuery: "creationTag.lastModifiedOn",
            orderReversed: false,
        }, $scope.selection || {});
        $scope.sortBy = [
            {value: 'name', label: 'Name'},
            {value: 'type', label: 'Type'},
            {value: 'creationTag.lastModifiedOn', label: 'Creation date'}
        ];

        TopNav.setLocation(TopNav.DSS_HOME, "administration");
        let pollPromise;

        function processRunningJobsRequest(data) {
            let doRunningJobsRemain = false;

            $scope.listItems.forEach(conn => {
                if (conn.name in data) {
                    conn.indexingMetadata = data[conn.name];
                    if (conn.indexingMetadata.currentJobId) {
                        doRunningJobsRemain = true;
                    }
                } else if (conn.indexingMetadata && conn.metadata.currentJobId) {
                    delete conn.indexingMetadata.currentJobId;
                }
            });
            return doRunningJobsRemain;
        }

        $scope.pollRunningJobs = function () {
            $timeout.cancel(pollPromise);
            DataikuAPI.admin.connections.listRunningJobs().success(function (data) {
                let doRunningJobsRemain = processRunningJobsRequest(data);
                if (doRunningJobsRemain) {
                    pollPromise = $timeout(() => {
                        $scope.pollRunningJobs();
                    }, 5000);
                }
            });
        }

        $scope.isIndexable = connection => ConnectionUtils.isIndexable(connection);

        $scope.list = function () {
            var func = $state.is('admin.connections.hiveindexing') ? DataikuAPI.admin.connections.listHiveVirtual : DataikuAPI.admin.connections.list;
            func().success(function (data) {
                $scope.connections = data;
                $scope.listItems = $.map(data, function (v, k) {
                    return v;
                });
                $scope.canIndexAllConnections = $scope.listItems.length > 0;
                if ($scope.listItems.find(c => c.indexingMetadata && c.indexingMetadata.currentJobId)) {
                    $scope.pollRunningJobs();
                }
            }).error(setErrorInScope.bind($scope));
        };
        $scope.$on("$destroy", function () {
            pollPromise && $timeout.cancel(pollPromise);
        });

        $scope.$on("indexConnectionEvent", (event, connectionName) => {
            createIndexConnectionsModal([connectionName]);
        });

        $scope.list();

        $scope.deleteSelected = function (name) {
            var selectedConnectionsNames = $scope.selection.selectedObjects.map(function (c) {
                return c.name;
            });
            Dialogs.confirm($scope, 'Connection deletion', 'Are you sure you want to delete this connection ?').then(function () {
                DataikuAPI.admin.connections.delete(selectedConnectionsNames).success(function (data) {
                    $scope.list();
                }).error(setErrorInScope.bind($scope));
            });
        };

        let createIndexConnectionsModal = function (connectionNames) {
            const newScope = $scope.$new();
            newScope.selectedConnections = connectionNames;
            CreateModalFromTemplate("/templates/admin/index-connections-modal.html", newScope, 'IndexConnectionsModalController');
        };

        $scope.indexSelectedConnections = function () {
            createIndexConnectionsModal($scope.selection.selectedObjects.map(function (c) {
                return c.name;
            }));
        };

        $scope.isIndexationRunning = function () {
            return $scope.listItems && $scope.listItems.find(c => {
                    return c && c.indexingMetadata && c.indexingMetadata.currentJobId;
                });
        };

        $scope.abortIndexation = function () {
            DataikuAPI.admin.connections.abortIndexation()
                .success(function (data) {
                    processRunningJobsRequest(data);
                })
                .error(setErrorInScope.bind($scope));
        };

        $scope.indexAllConnections = function () {
            CreateModalFromTemplate("/templates/admin/index-connections-modal.html", $scope, 'IndexConnectionsModalController');
        };

    });

    app.controller("ConnectionsController", function ($scope, $controller, TopNav, DataikuAPI, Dialogs, $timeout, $stateParams, ConnectionUtils, CreateModalFromTemplate) {
        $controller("_ConnectionsListBaseController", { $scope: $scope });
    });

    app.controller("ConnectionsHiveIndexingController", function ($scope, $controller, TopNav, DataikuAPI, Dialogs, $timeout, $stateParams, ConnectionUtils, CreateModalFromTemplate) {
        $controller("_ConnectionsListBaseController", { $scope: $scope });
    });

    app.controller("IndexConnectionsModalController", function ($scope, $state, $stateParams, TopNav, DataikuAPI, $timeout, FutureProgressModal, Dialogs) {
        $scope.indexationMode = 'scan';
        $scope.loading = true;

        DataikuAPI.admin.connections.listProcessableConnections($scope.type, $scope.selectedConnections).success(function (response) {
            $timeout(() => {
                $scope.loading = false;
                $scope.processableConnections = response;
                $scope.$digest();
            })
        }).error(setErrorInScope.bind($scope));

        $scope.canStartIndexation = function () {
            return $scope.processableConnections && (
                    $scope.indexationMode === 'index' && $scope.processableConnections.indexableConnections.length ||
                    $scope.indexationMode === 'scan' && $scope.processableConnections.scannableConnections.length
                );
        };
        $scope.startIndexation = function () {
            let indexationFunction;
            let connectionsToProcess;

            if ($scope.indexationMode === 'index') {
                indexationFunction = DataikuAPI.admin.connections.index;
                connectionsToProcess = $scope.processableConnections.indexableConnections;
            } else if ($scope.indexationMode === 'scan') {
                indexationFunction = DataikuAPI.admin.connections.scan;
                connectionsToProcess = $scope.processableConnections.scannableConnections;
            }

            indexationFunction(connectionsToProcess).success(function (data) { // NOSONAR: OK this call is indeed a method call.
                var parentScope = $scope.$parent.$parent;
                $scope.pollRunningJobs();
                FutureProgressModal.show(parentScope, data, "Indexing", newScope => newScope.tellToCloseWindow = true).then(function(result){
                    if (result) {
                        Dialogs.infoMessagesDisplayOnly(parentScope, "Indexing result", result);
                    }
                });
                $scope.dismiss();
            }).error(setErrorInScope.bind($scope));
        };
    });

    app.controller("ConnectionController", function ($scope, $rootScope, $state, $stateParams, Assert, TopNav, DataikuAPI) {

        TopNav.setLocation(TopNav.DSS_HOME, "administration");

        $scope.connectionParamsForm = {};

        // Angular guys do not want to support the validation of an Angular input inside an AngularJS form, so handling validity through booleans.
        // See https://github.com/angular/angular/issues/9213.
        $scope.areAdvancedPropertiesInvalid = false;
        $scope.areAdvancedConnectionPropertiesInvalid = false;

        $scope.setAdvancedPropertiesValidity = function(isValid) {
            $scope.areAdvancedPropertiesInvalid = !isValid;
        }

        $scope.setAdvancedConnectionPropertiesValidity = function(isValid) {
            $scope.areAdvancedConnectionPropertiesInvalid = !isValid;
        }

        $scope.isConnectionParamsFormInvalid = function() {
            return $scope.connectionParamsForm.$invalid || $scope.areAdvancedPropertiesInvalid || $scope.areAdvancedConnectionPropertiesInvalid;
        }

        DataikuAPI.admin.connections.list().success(function (data) {
            $scope.connections = data;
        }).error(setErrorInScope.bind($scope));

        DataikuAPI.security.listGroups(false).success(function (data) {
            if (data) {
                data.sort();
            }
            $scope.allGroups = data;
        });

        function $canHaveProxy(connectionType) {
            return $scope.appConfig.hasGlobalProxy &&
                ['ElasticSearch', 'HTTP', 'FTP', 'EC2', 'GCS', 'Twitter', 'BigQuery'].indexOf(connectionType) >= 0;
        }

        $scope.isFsProviderizable = function (t) {
            return ['Filesystem', 'FTP', 'SSH', 'HDFS', 'Azure', 'GCS', 'EC2'].indexOf(t) >= 0;
        };

        Assert.trueish($stateParams.connectionName || $stateParams.type, "no $stateParams.connectionName and no $stateParams.type");
        if ($stateParams.connectionName) {
            $scope.creation = false;
            DataikuAPI.admin.connections.get($stateParams.connectionName).success(function (data) {
                savedConnection = angular.copy(data);
                $scope.connection = data;
                $scope.connection.$canHaveProxy = $canHaveProxy(data.type);
                $scope.loadDone = true;
            }).error(setErrorInScope.bind($scope));
        } else if ($stateParams.type) {
            $scope.creation = true;
            savedConnection = null;
            $scope.connection = {
                "type": $stateParams.type,
                "params": {
                    namingRule: {}
                },
                "credentialsMode": "GLOBAL",
                "allowWrite": true, "allowManagedDatasets": true,
                "allowMirror": ($stateParams.type == "Vertica" || $stateParams.type == "ElasticSearch"),
                "usableBy": "ALL",
                "$canHaveProxy": $canHaveProxy($stateParams.type),
                "useGlobalProxy": $stateParams.type == 'ElasticSearch' ? false : $canHaveProxy($stateParams.type)
            };

            /* Per connection defaults */
            if ($scope.connection.type == "BigQuery") {
                $scope.connection.params.properties = [
                    { "name": "Timeout", "value": 180, "secret": false }
                ]
                $scope.connection.params.credentialsMode = "KEYPAIR";
                $scope.connection.params.driverMode = "CUSTOM";
            } else if ($scope.connection.type == "Redshift") {
                $scope.connection.params.driverMode = "MANAGED_LEGACY_POSTGRESQL";
                $scope.connection.params.redshiftAuthenticationMode = "USER_PASSWORD";
            } else if ($scope.connection.type == "Greenplum") {
                $scope.connection.params.driverMode = "MANAGED_LEGACY_POSTGRESQL";
            } else if ($scope.connection.type == "PostgreSQL") {
                $scope.connection.params.driverMode = "MANAGED";
            } else if ($scope.connection.type == "Snowflake") {
                $scope.connection.params.driverMode = "MANAGED";
            } else if ($scope.connection.type == "Teradata") {
                $scope.connection.params.properties = [
                    { "name": "CHARSET", "value": "UTF8", "secret": false }
                ]
            } else if ($scope.connection.type == "SSH") {
                $scope.connection.params.port = 22;
            } else if ($scope.connection.type == "HDFS") {
                $scope.connection.params.hiveSynchronizationMode = 'KEEP_IN_SYNC';
            } else if ($scope.connection.type == "EC2") {
                $scope.connection.params.credentialsMode = "KEYPAIR";
            } else if ($scope.connection.type == "Synapse") {
                // The first option is here to keep compatibility with SQLServer. It should not be used.
                $scope.connection.params.azureDWH = true;
                $scope.connection.params.autocommitMode = true;
            } else if ($scope.connection.type == "GCS") {
                $scope.connection.params.credentialsMode = "KEYPAIR";
            }

            $scope.connection.allowManagedFolders = $scope.isFsProviderizable($scope.connection.type);
            $scope.loadDone = true;
        }
        $scope.customFieldsMap = $rootScope.appConfig.customFieldsMap["CONNECTION"];

        $scope.isConnectionNameUnique = function (v) {
            if (v == null) return true;
            if ($scope.connections == null) return true;
            return !$scope.connections.hasOwnProperty(v);
        };

        $scope.isConnectionNameValid = function () {
            return $scope.connection && $scope.connection.name && $scope.connection.name.length;
        };

        var savedConnection;
        $scope.connectionDirty = function () {
            return !angular.equals($scope.connection, savedConnection);
        };

        $scope.saveConnection = function () {
            if ($scope.isConnectionParamsFormInvalid()) {
                return;
            }
            DataikuAPI.admin.connections.save($scope.connection).success(function (data) {
                savedConnection = angular.copy($scope.connection);
                $state.transitionTo("admin.connections.edit", {connectionName: $scope.connection.name});
            }).error(setErrorInScope.bind($scope));
        };

        $scope.$watch('connection.allowWrite', function (a) {
            if (!a && $scope.connection) {
                $scope.connection.allowManagedDatasets = false;
                $scope.connection.allowManagedFolders = false;
            }
        });
    });

    app.controller("SQLConnectionController", function ($scope, $controller, DataikuAPI, $timeout, $rootScope, TopNav) {
        TopNav.setLocation(TopNav.DSS_HOME, "administration");

        if (!$scope.connection.params.properties) {
            $scope.connection.params.properties = [];
        }

        if ($scope.creation) {
            $scope.connection.params.namingRule.tableNameDatasetNamePrefix = "${projectKey}_";
        }

        if (!$scope.connection.params.dkuProperties) {
            $scope.connection.params.dkuProperties = [];
        }

        $scope.warnings = {
            noVariableInTable: false,
        };

        if (!$scope.connection.customBasicConnectionCredentialProviderParams) {
            $scope.connection.customBasicConnectionCredentialProviderParams = [];
        }

        $scope.checkForHttpInHostUrl = (host) => host && (host.startsWith('http://') || host.startsWith('https://'));

        $scope.$watch("connection.params", function (nv, ov) {
            $scope.warnings.noVariableInTable = false;
            // Snowflake doesn't support global Oauth yet ch63879
            if ($scope.connection.type=="Snowflake" && nv.authType=="OAUTH2_APP") {
                $scope.connection.credentialsMode = "PER_USER";
            }

            if (!nv) return;
            if (!$scope.connection.allowManagedDatasets) return;

            if ((!nv.namingRule.tableNameDatasetNamePrefix || nv.namingRule.tableNameDatasetNamePrefix.indexOf("${") == -1) &&
                (!nv.namingRule.tableNameDatasetNameSuffix || nv.namingRule.tableNameDatasetNameSuffix.indexOf("${") == -1) &&
                (!nv.namingRule.schemaName || nv.namingRule.schemaName.indexOf("${") == -1)) {
                $scope.warnings.noVariableInTable = true;
            }
        }, true);
        $scope.$watch("connection.credentialsMode", function (nv, ov) {
            // Snowflake doesn't support global Oauth yet ch63879
            if ($scope.connection.type=="Snowflake" && nv=="GLOBAL") {
                $scope.connection.params.authType = "PASSWORD";
            }
        });


        $scope.uiState = {};

        $scope.testConnection = function () {
            if (!$scope.connectionParamsForm || $scope.connectionParamsForm.$valid) {
                DataikuAPI.admin.connections.testSQL($scope.connection, null).success(function (data) {
                    $scope.testResult = data;
                }).error(setErrorInScope.bind($scope));
            }
        };

        $scope.$watch("connection", function (nv, ov) {
            if (nv != null) {
                if (!$scope.connection.params.properties) {
                    $scope.connection.params.properties = [];
                }
            }
        });

        $scope.warnAboutSearchPath = function () {
            if ($scope.connection.params.schemaSearchPath) {
                if ($scope.connection.params.namingRule.schemaName) {
                    return false;
                }
                if ($scope.connection.params.schemaSearchPath.indexOf(',public,') > 0) { // NOSONAR: OK to ignore 0 index.
                    return false;
                }
                if ($scope.connection.params.schemaSearchPath.endsWith(',public')) {
                    return false;
                }
                if ($scope.connection.params.schemaSearchPath.startsWith('public,')) {
                    return false;
                }
                if ($scope.connection.params.schemaSearchPath == 'public') {
                    return false;
                }
                return true;
            } else {
                // no schema search path => don't care
                return false;
            }
        };

         $scope.dialects = [
            {"value":"","label":"Default"},
            {"value":"MySQLDialect","label":"MySQL < 8.0"},
            {"value":"MySQL8Dialect","label":"MySQL >=8.0"},
            {"value":"PostgreSQLDialect","label":"PostgreSQL"},
            {"value":"OracleSQLDialect","label":"Oracle"},
            {"value":"SQLServerSQLDialect","label":"SQL Server"},
            {"value":"SynapseSQLDialect","label":"Azure Synapse"},
            {"value":"GreenplumSQLDialect","label":"Greenplum < 5.0"},
            {"value":"Greenplum5SQLDialect","label":"Greenplum >= 5.0"},
            {"value":"TeradataSQLDialect","label":"Teradata"},
            {"value":"VerticaSQLDialect","label":"Vertica"},
            {"value":"RedshiftSQLDialect","label":"Redshift"},
            {"value":"SybaseIQSQLDialect","label":"Sybase IQ"},
            {"value":"AsterDataSQLDialect","label":"Aster Data"},
            {"value":"NetezzaSQLDialect","label":"IBM Netezza"},
            {"value":"BigQuerySQLDialect","label":"Google BigQuery"},
            {"value":"SAPHANASQLDialect","label":"SAP HANA"},
            {"value":"ExasolSQLDialect","label":"Exasol"},
            {"value":"SnowflakeSQLDialect","label":"Snowflake"},
            {"value":"DB2SQLDialect","label":"IBM DB2"},
            {"value":"H2SQLDialect","label":"H2"},
            {"value":"ImpalaSQLDialect","label":"Impala"},
            {"value":"HiveSQLDialect","label":"Hive"},
            {"value":"PrestoSQLDialect","label":"Presto / Athena"},
            {"value":"SparkSQLDialect","label":"SparkSQL (via JDBC)"}
        ];
        if ($rootScope.featureFlagEnabled("kdbplus")) {
            $scope.dialects.push({"value":"KDBSQLDialect","label":"KDB+"});
        }
        $rootScope.appConfig.customDialects.forEach(function(d) {
            $scope.dialects.push({"value":d.dialectType, "label":d.desc.meta.label || d.id})
        });
    });

    app.controller("PostgreSQLConnectionController", function ($scope, $controller, DataikuAPI) {
        $controller('SQLConnectionController', {$scope: $scope});

        $scope.testConnection = function () {
            if (!$scope.connectionParamsForm || $scope.connectionParamsForm.$valid) {
                $scope.testing = true;
                DataikuAPI.admin.connections.testPostgreSQL($scope.connection).success(function (data) {
                    $scope.testing = false;
                    $scope.testResult = data;
                }).error(function (a, b, c) {
                    $scope.testing = false;
                    setErrorInScope.bind($scope)(a, b, c)
                });
            }
        }
    });

    app.controller("FilesystemConnectionController", function ($scope, $controller, TopNav) {
        TopNav.setLocation(TopNav.DSS_HOME, "administration");

        $scope.notTestable = true;

        if (!$scope.connection.params.dkuProperties) {
            $scope.connection.params.dkuProperties = [];
        }
    });

    app.controller("HDFSConnectionController", function ($scope, $controller, TopNav, $stateParams, DataikuAPI, FutureProgressModal, Dialogs) {
        TopNav.setLocation(TopNav.DSS_HOME, "administration");

        $scope.isExtraHadoopConfigurationInvalid = false;

        $scope.setExtraHadoopConfigurationValidity = function(isValid) {
            $scope.isExtraHadoopConfigurationInvalid = !isValid;
        }

        // Overriding Connection Common
        $scope.isConnectionParamsFormInvalid = function() {
            return $scope.connectionParamsForm.$invalid || $scope.isExtraHadoopConfigurationInvalid || $scope.areAdvancedConnectionPropertiesInvalid;
        }

        $scope.notTestable = true;

        if ($scope.creation) {
            $scope.connection.params.namingRule.hdfsPathDatasetNamePrefix = "${projectKey}/";
            $scope.connection.params.namingRule.tableNameDatasetNamePrefix = "${projectKey}_";
        }

        if (!$scope.connection.customBasicConnectionCredentialProviderParams) {
            $scope.connection.customBasicConnectionCredentialProviderParams = [];
        }

        if (!$scope.connection.params.dkuProperties) {
            $scope.connection.params.dkuProperties = [];
        }

        $scope.warnings = {
            noVariableInPath: false,
            noVariableInHive: false,
        };

        $scope.$watch("connection.params", function (nv, ov) {
            $scope.warnings.noVariableInPath = false;
            $scope.warnings.noVariableInHive = false;

            if (!nv) return;
            if (!$scope.connection.allowManagedDatasets) return;


            if ((!nv.namingRule.hdfsPathDatasetNamePrefix || nv.namingRule.hdfsPathDatasetNamePrefix.indexOf("${") == -1) &&
                (!nv.namingRule.hdfsPathDatasetNameSuffix || nv.namingRule.hdfsPathDatasetNameSuffix.indexOf("${") == -1)) {
                $scope.warnings.noVariableInPath = true;
            }

            if ((!nv.namingRule.tableNameDatasetNamePrefix || nv.namingRule.tableNameDatasetNamePrefix.indexOf("${") == -1) &&
                (!nv.namingRule.tableNameDatasetNameSuffix || nv.namingRule.tableNameDatasetNameSuffix.indexOf("${") == -1) &&
                (!nv.namingRule.hiveDatabaseName || nv.namingRule.hiveDatabaseName.indexOf("${") == -1)) {
                $scope.warnings.noVariableInHive = true;
            }
        }, true);

        $scope.resyncPermissions = function () {
            DataikuAPI.admin.connections.hdfs.resyncPermissions($stateParams.connectionName).success(function (data) {
                FutureProgressModal.show($scope, data, "Permissions update").then(function (result) {
                    Dialogs.infoMessagesDisplayOnly($scope, "Update result", result);
                })
            }).error(setErrorInScope.bind($scope));
        }

        $scope.resyncRootPermissions = function () {
            DataikuAPI.admin.connections.hdfs.resyncRootPermissions($stateParams.connectionName).success(function (data) {
                FutureProgressModal.show($scope, data, "Permissions update");
            }).error(setErrorInScope.bind($scope));
        }

        DataikuAPI.projects.list().success(function (data) {
            $scope.projectsList = data;
            if (data.length) {
                $scope.massImportTargetProjectKey = data[0].projectKey;
                $scope.massImportTargetProjectName = data[0].name;
            }
            $scope.$watch("massImportTargetProjectKey", function () {
                var filteredProjects = $scope.projectsList.filter(function (project) {
                    return project.projectKey == $scope.massImportTargetProjectKey;
                });
                if (filteredProjects && filteredProjects.length) {
                    $scope.massImportTargetProjectName = filteredProjects[0].name;
                } else {
                    $scope.massImportTargetProjectName = null;
                }
            })

        }).error(setErrorInScope.bind($scope));
    });


    app.controller("EC2ConnectionController", function ($scope, $controller, DataikuAPI, TopNav) {
        TopNav.setLocation(TopNav.DSS_HOME, "administration");

        $scope.testConnection = function () {
            if (!$scope.connectionParamsForm || $scope.connectionParamsForm.$valid) {
                $scope.testing = true;
                DataikuAPI.admin.connections.testEC2($scope.connection).success(function (data) {
                    $scope.testing = false;
                    $scope.testResult = data;
                }).error(function (a, b, c) {
                    $scope.testing = false;
                    setErrorInScope.bind($scope)(a, b, c)
                });
            }
        }

        if ($scope.creation) {
            $scope.connection.params["defaultManagedPath"] = "/dataiku";
        }
        if (!$scope.connection.params["hdfsInterface"]) {
            $scope.connection.params["hdfsInterface"] = "S3A";  // Default value
        }
        if (!$scope.connection.params.customAWSCredentialsProviderParams) {
            $scope.connection.params.customAWSCredentialsProviderParams = [];
        }
        if (!$scope.connection.customBasicConnectionCredentialProviderParams) {
            $scope.connection.customBasicConnectionCredentialProviderParams = [];
        }
        if (!$scope.connection.params.dkuProperties) {
            $scope.connection.params.dkuProperties = [];
        }
    });

    app.controller("GCSConnectionController", function ($scope, $controller, DataikuAPI, TopNav) {
        TopNav.setLocation(TopNav.DSS_HOME, "administration");

        $scope.testConnection = function () {
            if (!$scope.connectionParamsForm || $scope.connectionParamsForm.$valid) {
                $scope.testing = true;
                DataikuAPI.admin.connections.testGCS($scope.connection).success(function (data) {
                    $scope.testing = false;
                    $scope.testResult = data;
                }).error(function (a, b, c) {
                    $scope.testing = false;
                    setErrorInScope.bind($scope)(a, b, c)
                });
            }
        }

        if ($scope.creation) {
            $scope.connection.params["defaultManagedPath"] = "/dataiku";
        }

        if (!$scope.connection.params.dkuProperties) {
            $scope.connection.params.dkuProperties = [];
        }
    });

    app.controller("AzureConnectionController", function ($scope, $controller, DataikuAPI, TopNav) {
        TopNav.setLocation(TopNav.DSS_HOME, "administration");

        $scope.testConnection = function () {
            if (!$scope.connectionParamsForm || $scope.connectionParamsForm.$valid) {
                $scope.testing = true;
                DataikuAPI.admin.connections.testAzure($scope.connection).success(function (data) {
                    $scope.testing = false;
                    $scope.testResult = data;
                }).error(function (a, b, c) {
                    $scope.testing = false;
                    setErrorInScope.bind($scope)(a, b, c)
                });
            }
        }

        if ($scope.creation) {
            $scope.connection.params["defaultManagedPath"] = "/dataiku";
            $scope.connection.params["defaultManagedContainer"] = "dataiku";
            $scope.connection.params["useSSL"] = true;
            $scope.connection.params["authType"] = "SHARED_KEY";
        }

        if (!$scope.connection.params.dkuProperties) {
            $scope.connection.params.dkuProperties = [];
        }
    });


    app.controller("ElasticSearchConnectionController", function ($scope, $controller, DataikuAPI, TopNav) {
        TopNav.setLocation(TopNav.DSS_HOME, "administration");

        if ($scope.creation) {
            $scope.connection.params["host"] = "localhost";
            $scope.connection.params["port"] = 9200;
            $scope.connection.params["dialect"] = 'ES_LE_2';
            $scope.connection.params["connectionLimit"] = 8;
        }

        $scope.checkForHttpInHostUrl = (host) => host && (host.startsWith('http://') || host.startsWith('https://'));

        $scope.testConnection = function () {
            if (!$scope.connectionParamsForm || $scope.connectionParamsForm.$valid) {
                DataikuAPI.admin.connections.testElasticSearch($scope.connection, null).success(function (data) {
                    if (data.dialect && data.dialect !== $scope.connection.params.dialect) {
                        $scope.connection.params.dialect = data.dialect;
                        data.dialectChanged = true;
                    }
                    $scope.testResult = data;
                }).error(setErrorInScope.bind($scope));
            }
        };
    });

    app.controller("TwitterConnectionController", function ($scope, $controller, DataikuAPI, TopNav) {
        TopNav.setLocation(TopNav.DSS_HOME, "administration");

        $scope.connection.allowWrite = false;
        $scope.connection.allowManagedDatasets = false;
        $scope.connection.allowMirror = false;

        $scope.testConnection = function () {
            $scope.testing = true;
            DataikuAPI.admin.connections.testTwitter($scope.connection).success(function (data) {
                $scope.testResult = data;
            }).error(setErrorInScope.bind($scope))
                ["finally"](function () {
                $scope.testing = false;
            });
        }

        $scope.clearForm = function () {
            $scope.connection.params.api_key = "";
            $scope.connection.params.api_secret = "";
            $scope.connection.params.token_key = "";
            $scope.connection.params.token_secret = "";
            $scope.verified = false;
        }

        DataikuAPI.connections.getTwitterConfig().success(function (data) {
            var activeConnection = data.connection;
            $scope.isActive = ($scope.connection.name === activeConnection);
            $scope.isRunning = (data.running.length > 0);
        }).error(function () {
            setErrorInScope.bind($scope);
            $scope.isActive = false;
        });

        $scope.setActiveConnection = function (name) {
            DataikuAPI.admin.connections.setActiveTwitterConnection(name).success(function () {
                $scope.isActive = true;
            }).error(setErrorInScope.bind($scope));
        }

        DataikuAPI.connections.getNames('Twitter').success(function (data) {
            $scope.displaySetActive = (data.length > 1);
        }).error(setErrorInScope.bind($scope));
    });

    app.controller("KafkaConnectionController", function ($scope, $controller, DataikuAPI, TopNav, CodeMirrorSettingService) {
        TopNav.setLocation(TopNav.DSS_HOME, "administration");
        
        $scope.codeMirrorSettingService = CodeMirrorSettingService;
        
        $scope.securityModes = [
                                        {id:'NONE', label:'No security protocol'},
                                        {id:'KERBEROS', label:'Kerberos'},
                                        {id:'SASL', label:'Generic Sasl'},
                                        {id:'CUSTOM', label:'Custom (using properties)'}
                                    ];

        $scope.testConnection = function () {
            $scope.testing = true;
            $scope.testResult = null;
            DataikuAPI.admin.connections.testKafka($scope.connection).success(function (data) {
                $scope.testResult = data;
            }).error(
                setErrorInScope.bind($scope)
            ).finally(function () {
                $scope.testing = false;
            });
        };
        
        $scope.testKsql = function() {
            $scope.testingKsql = true;
            $scope.testKsqlResult = null;
            DataikuAPI.admin.connections.testKsql($scope.connection).success(function (data) {
                $scope.testKsqlResult = data;
            }).error(
                setErrorInScope.bind($scope)
            ).finally(function () {
                $scope.testingKsql = false;
            });
        };
    });

    app.controller("SQSConnectionController", function ($scope, DataikuAPI, TopNav) {
        TopNav.setLocation(TopNav.DSS_HOME, "administration");
        
        $scope.testConnection = function () {
            $scope.testing = true;
            $scope.testResult = null;
            DataikuAPI.admin.connections.testSQS($scope.connection).success(function (data) {
                $scope.testResult = data;
            }).error(
                setErrorInScope.bind($scope)
            ).finally(function () {
                $scope.testing = false;
            });
        }
    });


    app.controller("MongoDBConnectionController", function ($scope, $controller, DataikuAPI, TopNav) {
        TopNav.setLocation(TopNav.DSS_HOME, "administration");

        $scope.checkForHttpInHostUrl = (host) => host && (host.startsWith('http://') || host.startsWith('https://'));

        if ($scope.creation) {
            $scope.connection.params["useURI"] = false;
            $scope.connection.params["uri"] = "mongodb://HOST:27017/DB";
        }

        var sequenceId = 0;
        $scope.testConnection = function () {
            if (!$scope.connectionParamsForm || $scope.connectionParamsForm.$valid) {
                $scope.testing = true;
                $scope.testResult = null;
                DataikuAPI.admin.connections.testMongoDB($scope.connection, ++sequenceId).success(function (data) {
                    if (data.sequenceId != sequenceId) {
                        // Too late! Another call was triggered
                        return;
                    }
                    $scope.testing = false;
                    $scope.testResult = data;
                }).error(setErrorInScope.bind($scope));
            }
        };

        // TODO - test on arrival - connection form not valid soon enough ???
    });

    app.controller("DynamoDBConnectionController", function ($scope, $controller, DataikuAPI, TopNav) {
        TopNav.setLocation(TopNav.DSS_HOME, "administration");
        
        if ($scope.creation) {
            $scope.connection.params["regionOrEndpoint"] = "eu-west-3";
            $scope.connection.params["mode"] = "WEBSERVICE";
            $scope.connection.params["port"] = 8000;
            $scope.connection.params["hostname"] = "localhost";
            $scope.connection.params["rwCapacityMode"] = "ON_DEMAND";
            $scope.connection.params["readCapacity"] = 1;
            $scope.connection.params["writeCapacity"] = 1;
        }
        var sequenceId = 0;
        $scope.testConnection = function () {
            if (!$scope.connectionParamsForm || $scope.connectionParamsForm.$valid) {
                $scope.testing = true;
                $scope.testResult = null;
                DataikuAPI.admin.connections.testDynamoDB($scope.connection, ++sequenceId).success(function (data) {
                    if (data.sequenceId != sequenceId) {
                        // Too late! Another call was triggered
                        return;
                    }
                    $scope.testing = false;
                    $scope.testResult = data;
                }).error(setErrorInScope.bind($scope));
            }
        };
     });


    app.controller("CassandraConnectionController", function ($scope, $controller, DataikuAPI, TopNav) {
        TopNav.setLocation(TopNav.DSS_HOME, "administration");

        addDatasetUniquenessCheck($scope, DataikuAPI);

        $scope.checkForHttpInHostsUrl = (hosts) => hosts && hosts.split(',').some(host => host.startsWith('http://') || host.startsWith('https://'));

        $scope.testConnection = function () {
            if (!$scope.connectionParamsForm || $scope.connectionParamsForm.$valid) {
                $scope.testing = true;
                $scope.testResult = null;
                DataikuAPI.admin.connections.testCassandra($scope.connection).success(function (data) {
                    $scope.testing = false;
                    $scope.testResult = data;
                }).error(setErrorInScope.bind($scope));
            }
        };

        if (!$scope.connection.customBasicConnectionCredentialProviderParams) {
            $scope.connection.customBasicConnectionCredentialProviderParams = [];
        }

        // TODO - test on arrival
    });

    app.controller("FTPConnectionController", function ($scope, $controller, DataikuAPI, TopNav) {
        TopNav.setLocation(TopNav.DSS_HOME, "administration");

        if ($scope.creation) {
            $scope.connection.params.passive = true;
            $scope.connection.allowManagedDatasets = false;
        }
        $scope.connection.allowMirror = false;

        $scope.notTestable = true;

        if (!$scope.connection.params.dkuProperties) {
            $scope.connection.params.dkuProperties = [];
        }
    });

    app.controller("SSHConnectionController", function ($scope, $controller, DataikuAPI, TopNav) {
        TopNav.setLocation(TopNav.DSS_HOME, "administration");

        $scope.connection.allowMirror = false;
        $scope.notTestable = true;

        if ($scope.creation) {
            $scope.connection.allowManagedDatasets = false;
            $scope.connection.params["usePublicKey"] = false;
        }

        if (!$scope.connection.params.dkuProperties) {
            $scope.connection.params.dkuProperties = [];
        }
    });

}());

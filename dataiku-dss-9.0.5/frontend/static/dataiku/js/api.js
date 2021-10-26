(function() {
'use strict';

const app = angular.module('dataiku.services');

// To simplify the migration to ng1.6 which removes the .success and .error from $http
// we monkeypatch $http in this module with replacement versions of the missing functions
// Cqll addSuccessErrorToPromise to directly add these methods to any promise.
//
app.run (function initMonkeyPatchPromiseWithSuccessError($http) {
    app.addSuccessErrorToPromise = function (promise) {
        promise.success = function(callback) {
            promise.then( (resp) => {return callback(resp.data, resp.status, resp.headers, resp.config, resp.statusText, resp.xhrStatus)});
            return promise;
        };

        promise.error = function(callback) {
            promise.then(null, resp => callback(resp.data, resp.status, resp.headers, resp.config, resp.statusText, resp.xhrStatus));
            return promise;
        };
        return promise;
    }

    function monkeyPatchHttpGetForSuccessError() {
        const get = $http.get;
        $http.get = function () {
            let promise =  get.apply(this, arguments);
            const decoratedPromise =  app.addSuccessErrorToPromise(promise);
            return decoratedPromise;
        }
    }
    monkeyPatchHttpGetForSuccessError();
});

app.factory("DataikuCloudAPI", function(APIXHRService, $q, $rootScope) {
return {
    getWebConfig: function() {
        var deferred = $q.defer();
        $.ajax({
            url: "https://tracker.dataiku.com/public/globalId",
            jsonp: "fun",
            dataType: "jsonp",
            success: function(response) {
                deferred.resolve(response)
            }
        })
        return deferred.promise;
    },
    getNewWebConfig: function() {
        var deferred = $q.defer();
        $.ajax({
            url: "https://www.dataiku.com/api/get-config.php",
            jsonp: "callback",
            dataType: "jsonp",
            success: function(response) {
                deferred.resolve(response)
            }
        })
        return deferred.promise;
    },
    community: {
        register: function(firstName, lastName, company, persona, email,
                                     newsletter, wantEETrial, dssVersion, webVisitorId, webVisitorLocalId, webVisitorHSId, registrationChannel) {
            return APIXHRService("POST",
                $rootScope.appConfig.saasManagerURL + "/community/register-v5", {
                    firstName: firstName,
                    lastName: lastName,
                    company: company,
                    email: email,
                    persona: persona,
                    newsletter: newsletter,
                    wantEETrial: wantEETrial,
                    dssVersion: dssVersion,
                    webVisitorId: webVisitorId,
                    webVisitorLocalId: webVisitorLocalId,
                    webVisitorHSId: webVisitorHSId,
                    registrationChannel: registrationChannel
                }
            );
        },
        requestEETrial: function(instanceId, updatedEmailAddress) {
            return APIXHRService("POST",
                $rootScope.appConfig.saasManagerURL + "/community/request-ee-trial", {
                    instanceId: instanceId, updatedEmailAddress: updatedEmailAddress
                }
            );
        }
    }
}
});


app.factory("DataikuAPI", ["APIXHRService", '$q', '$rootScope', 'Logger', '$$cookieReader', function(APIXHRService, $q, $rootScope, Logger, $$cookieReader) {
    var API_PATH = '/dip/api/';
    var FIXTURES_PATH = '/fixtures/';
    var JUPYTER_API_PATH = '/jupyter/';

    var uploadFileRequest = function(requestUrl, formdataCustomizer, callback) {
        var url = API_PATH + requestUrl;

        // angular doesn't provide a way to get the progress event yet, we explicitly redo it
        var deferred = $q.defer();

        var xhr = new XMLHttpRequest();

        if (callback != null) {
            xhr.upload.addEventListener("progress", callback, false);
        }
        xhr.addEventListener("load", function(e) {
            var payload = e.target||e.srcElement;
            if(payload.status == 200) {
                deferred.resolve(payload.response);
            } else {
                deferred.reject(payload);
            }
            $rootScope.$apply();
        }, false);
        xhr.addEventListener("error", function(e) {
            var payload = e.target||e.srcElement;
            deferred.reject(payload);
            $rootScope.$apply();
        }, false);

        var start = new Date().getTime();
        Logger.debug("[S] POST_FILE " + requestUrl);

        var logDone = function(result) {
            var end = new Date().getTime();
            Logger.debug("[D] POST_FILE " + requestUrl + " (" + (end-start) +"ms)");
        };

        xhr.open("POST", url);
        xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');

        const xsrfToken = $$cookieReader()[$rootScope.appConfig.xsrfCookieName];
        xhr.setRequestHeader('X-XSRF-TOKEN', xsrfToken);

        var formdata = new FormData();
        formdataCustomizer(formdata);
        xhr.send(formdata);

        deferred.promise.then(logDone, logDone);
        return app.addSuccessErrorToPromise(deferred.promise);
    };

    var stripDollarKeys = function(key, value) {
        return key.startsWith("$") ? undefined : value;
    };

return {
debug: {

},
timezone: {
    list: function() {
        // Return the full java list of the avaiblable timezone
        return APIXHRService("GET", API_PATH + "timezones/list");
    },
    shortlist: function() {
        // Return a shortlist of the most interesting human readable timezone
        return APIXHRService("GET", API_PATH + "timezones/shortlist");
    }
},
usage: {
    popNextReport: function() {
        return APIXHRService("POST", API_PATH + "pop-next-report", null, 'nospinner');
    },
    popReflectedEvents: function() {
        return APIXHRService("POST", API_PATH + "pop-reflected-events", null, 'nospinner');
    }

},
registration: {
    initialRegisterCommunity: function(firstName, lastName, userEmail, instanceId, license) {
        return APIXHRService("POST", API_PATH + "registration/initial-register-community", {
            userFirstName: firstName, userLastName: lastName,
            userEmail: userEmail,
            instanceId: instanceId, license: JSON.stringify(license)
        });
    },
    initialRegisterLicensed: function(license) {
        return APIXHRService("POST", API_PATH + "registration/post-initial-register-licensed", {
            license: license
        });
    },
    setOfflineLicense: function(license) {
        return APIXHRService("POST", API_PATH + "registration/set-offline-license", {
            license: license
        });
    },
    renewExpiredLicense: function(license) {
        return APIXHRService("POST", API_PATH + "registration/renew-expired-license", {
            license: license
        });
    }
},
projects: {
    list: function() {
        return APIXHRService("GET", API_PATH + "projects/list");
    },
    listHeads: function(requiredPrivilege = null) {
        return APIXHRService("GET", API_PATH + "projects/list-heads", {requiredPrivilege});
    },
    listExtended: function(lightMode, nospinner) {
        return APIXHRService("GET", API_PATH + "projects/list-extended", {lightMode: lightMode}, nospinner ? "nospinner" : undefined);
    },
    getExtended: function(projectKey, lightMode, nospinner) {
        return APIXHRService("GET", API_PATH + "projects/get-extended", {projectKey: projectKey, lightMode: lightMode}, nospinner ? "nospinner" : undefined);
    },
    listPromotedWikis: function(withHomeArticle, nospinner){
      return APIXHRService("GET", API_PATH + "projects/wikis/list-promoted", {withHomeArticle:withHomeArticle}, nospinner ? "nospinner" : undefined);
    },
    getGraph: function(layoutEngine, projectFolderId, recursive) {
        return APIXHRService("GET", API_PATH + "flow/projects/get-graph-serialized", {layoutEngine: layoutEngine, projectFolderId: projectFolderId, recursive: recursive});
    },
    checkDeletability: function(projectKey) {
        return APIXHRService("GET", API_PATH + "projects/check-deletability", {projectKey: projectKey});
    },
    delete: function(projectKey, dropManagedData, dropManagedFoldersOutputOfRecipe) {
        return APIXHRService("POST", API_PATH + "projects/delete", {projectKey, dropManagedData, dropManagedFoldersOutputOfRecipe});
    },
    listAllKeys: function() {
        return APIXHRService("GET", API_PATH + "projects/list-all-keys");
    },
    listAllTags: function() {
        return APIXHRService("GET", API_PATH + "projects/list-all-tags");
    },
    getSummary: function(projectKey) {
        return APIXHRService("GET", API_PATH + "projects/get-summary", {projectKey: projectKey});
    },
    create: function(projectKey, name, projectFolderId) {
         return APIXHRService("POST", API_PATH + "projects/create", {projectKey: projectKey, name: name, projectFolderId: projectFolderId});
    },
    getSettings: function(projectKey) {
        return APIXHRService("GET", API_PATH + "projects/get-settings", {projectKey: projectKey});
    },
    getDashboardAuthorizations: function(projectKey) {
        return APIXHRService("GET", API_PATH + "projects/get-dashboard-authorizations", {projectKey: projectKey});
    },
    getExposedObjects: function(projectKey) {
        return APIXHRService("GET", API_PATH + "projects/get-exposed-objects", {projectKey: projectKey});
    },
    getEnrichedExposedObjects: function(projectKey) {
        return APIXHRService("GET", API_PATH + "projects/get-enriched-exposed-objects", {projectKey: projectKey});
    },
    saveExposedObjects: function(projectKey, exposedObjects) {
        return APIXHRService("POST", API_PATH + "projects/save-exposed-objects", {
            projectKey: projectKey,
            exposedObjects: JSON.stringify(exposedObjects, stripDollarKeys)
        });
    },
    addExposedObject: function(projectKey, type, objectId, targetProjectKey) {
        return APIXHRService("POST", API_PATH + "projects/add-exposed-object", {
            projectKey,
            type,
            objectId,
            targetProjectKey
        });
    },
    getObjectExposition: function(projectKey, objectType, objectId) {
        return APIXHRService("GET", API_PATH + "projects/get-object-exposition", {projectKey: projectKey, objectType: objectType, objectId: objectId});
    },
    getObjectsExpositions: function(items) {
        //POST because request might be big
        return APIXHRService("POST", API_PATH + "projects/get-objects-expositions", {
            items: JSON.stringify(items)
        });
    },
    saveObjectExposition: function(projectKey, objectType, objectId, objectExposition) {
        return APIXHRService("POST", API_PATH + "projects/save-object-exposition", {projectKey: projectKey, objectType: objectType, objectId: objectId, objectExposition: JSON.stringify(objectExposition) });
    },
    addObjectsExpositions: function(items, settings) {
        return APIXHRService("POST", API_PATH + "projects/add-objects-expositions", {
            items: JSON.stringify(items),
            settings: JSON.stringify(settings)
        });
    },
    unshare: function(items, targetProjectKey) {
        return APIXHRService("POST", API_PATH + "projects/unshare", {
            items: JSON.stringify(items),
            targetProjectKey: targetProjectKey
        });
    },
    addReaderAuthorizations: function(projectKey, readerAuthorizations) {
        return APIXHRService("POST", API_PATH + "projects/add-reader-authorizations", {projectKey: projectKey, readerAuthorizations: JSON.stringify(readerAuthorizations)});
    },
    saveDashboardAuthorizations: function(projectKey, dashboardAuthorizations) {
        return APIXHRService("POST", API_PATH + "projects/save-dashboard-authorizations", {projectKey: projectKey, dashboardAuthorizations: JSON.stringify(dashboardAuthorizations)});
    },
    getAdditionalDashboardUsers : function(projectKey) {
        return APIXHRService("GET", API_PATH + "projects/get-additional-dashboard-users", {projectKey: projectKey})
    },
    saveAdditionalDashboardUsers: function(projectKey, additionalDashboardUsers) {
        return APIXHRService("POST", API_PATH + "projects/save-additional-dashboard-users", {projectKey: projectKey, data: JSON.stringify(additionalDashboardUsers)});
    },
    saveSummary: function(projectKey, data) {
        return APIXHRService("POST", API_PATH + "projects/save-summary", {projectKey: projectKey, data: JSON.stringify(data)});
    },
    saveSettings: function(projectKey, data) {
        return APIXHRService("POST", API_PATH + "projects/save-settings", {projectKey: projectKey, data: JSON.stringify(data)});
    },
    savePermissions: function(projectKey, project){
      return APIXHRService("POST", API_PATH + "projects/save-permissions", {projectKey: projectKey, project: JSON.stringify(project)});
    },
    createTutorial: function(tutorialId, tutorialType, projectFolderId) {
        return APIXHRService("POST", API_PATH + "projects/create-tutorial", {id: tutorialId, type: tutorialType, projectFolderId: projectFolderId})
    },
    listTutorials: function() {
        return APIXHRService("GET", API_PATH + "tutorials/list");
    },
    startProjectExport: function(projectKey, exportOptions) {
        return APIXHRService("POST", API_PATH + "projects/start-export", {
            projectKey: projectKey,
            exportOptions: JSON.stringify(exportOptions)
        })
    },
    startProjectDuplication: function(projectKey, duplicateOptions) {
        return APIXHRService("POST", API_PATH + "projects/duplicate", {
            projectKey: projectKey,
            duplicateOptions: JSON.stringify(duplicateOptions)
        })
    },
    getProjectDatasets: function(projectKey){
        return APIXHRService("POST", API_PATH + "projects/export/prepare", {
            projectKey: projectKey
        })
    },
    getProjectExportURL: function(projectKey, exportId) {
        return API_PATH + "projects/download-export?projectKey=" + encodeURIComponent(projectKey)
        + '&exportId='+encodeURIComponent(exportId);
    },
    uploadForImport: function(file, callback) {
        return uploadFileRequest("projects/import/upload", function(formdata) {
            formdata.append("file", file);
        }, callback)
    },
    startImport: function(importId, importSettings) {
        return APIXHRService("POST", API_PATH + "projects/import/start", {
            importId: importId,
            importSettings: JSON.stringify(importSettings)
        })
    },
    prepareImport: function(importId, importSettings) {
        return APIXHRService("POST", API_PATH + "projects/import/prepare", {
            importId: importId,
            importSettings: JSON.stringify(importSettings)
        })
    },
    resyncHDFSDatasetPermissions : function(projectKey) {
        return APIXHRService("POST", API_PATH + "projects/admin/resync-hdfs-permissions", {
            projectKey: projectKey
        })
    },
    getAppManifest: function(projectKey) {
        return APIXHRService("GET", API_PATH + "projects/get-app-manifest", {
            projectKey: projectKey
        })
    },
    saveAppManifest: function(projectKey, appManifest) {
        return APIXHRService("POST", API_PATH + "projects/save-app-manifest", {
            projectKey: projectKey,
            appManifest: JSON.stringify(appManifest)
        })
    },
    getAppRemapping: function(projectKey) {
        return APIXHRService("GET", API_PATH + "projects/get-app-remapping", {
            projectKey: projectKey
        })
    },
    saveAppRemapping: function(projectKey, settings) {
        return APIXHRService("POST", API_PATH + "projects/save-app-remapping", {
            projectKey: projectKey,
            settings: JSON.stringify(settings)
        })
    },
    publicApi: {
        listProjectApiKeys: function(projectKey) {
            return APIXHRService("GET", API_PATH + "admin/publicapi/get-project-api-keys", {
                projectKey: projectKey
            });
        },
        createProjectApiKey: function(key) {
            return APIXHRService("POST", API_PATH + "admin/publicapi/create-project-api-key", {
                key: JSON.stringify(key)
            });
        },
        saveProjectApiKey: function(key) {
            return APIXHRService("POST", API_PATH + "admin/publicapi/save-project-api-key", {
                key: JSON.stringify(key)
            });
        },
        deleteProjectApiKey: function(projectKey, key) {
            return APIXHRService("POST", API_PATH + "admin/publicapi/delete-project-api-key", {
                projectKey: projectKey,
                key: key
            });
        }
    },
    variables: {
        get: function(projectKey) {
            return APIXHRService("GET", API_PATH + "projects/variables/get", {
                projectKey: projectKey
            })
        },
        save: function(projectKey, data) {
            return APIXHRService("POST", API_PATH + "projects/variables/save", {
                projectKey: projectKey,
                data: JSON.stringify(data)
            })
        }
    },
    design: {
        prepareBundleCreation: function(projectKey) {
            return APIXHRService("GET", API_PATH + "projects/design/prepare-bundle-creation", {
                projectKey: projectKey
            })
        },
        createBundle: function(projectKey, bundleId, preparationResult) {
            return APIXHRService("POST", API_PATH + "projects/design/create-bundle", {
                projectKey: projectKey,
                bundleId: bundleId,
                preparationResult: JSON.stringify(preparationResult)
            })
        },
        deleteBundle: function(projectKey, bundleId) {
            return APIXHRService("POST", API_PATH + "projects/design/delete-bundle", {
                projectKey: projectKey,
                bundleId: bundleId
            })
        },
        listBundles: function(projectKey) {
            return APIXHRService("GET", API_PATH + "projects/design/list-bundles", {
                projectKey: projectKey
            })
        },
        getBundleDetails: function(projectKey, bundleId) {
            return APIXHRService("GET", API_PATH + "projects/design/get-bundle-details", {
                projectKey: projectKey,
                bundleId: bundleId
            })
        },
        getBundleDownloadURL: function(projectKey, bundleId) {
            return API_PATH
                    +"projects/design/download-bundle?projectKey=" + encodeURIComponent(projectKey)
                    + '&bundleId='+ encodeURIComponent(bundleId);
        },
        getBundleExporterSettings: function(projectKey) {
            return APIXHRService("GET", API_PATH + "projects/design/get-bundle-exporter-settings", {
                projectKey: projectKey
            })
        },
        saveBundleExporterSettings: function(projectKey, settings) {
            return APIXHRService("POST", API_PATH + "projects/design/save-bundle-exporter-settings", {
                projectKey: projectKey, settings: JSON.stringify(settings)
            })
        },
        checkBundleReversion: function(projectKey, bundleId) {
            return APIXHRService("GET", API_PATH + "projects/design/check-bundle-reversion", {
                projectKey: projectKey, bundleId: bundleId
            })
        },
        revertBundle: function(projectKey, bundleId, importOptions) {
            return APIXHRService("POST", API_PATH + "projects/design/revert-bundle", {
                projectKey: projectKey, bundleId: bundleId, importOptions: JSON.stringify(importOptions)
            })
        },
        publishToDeployer: function(projectKey, bundleId, publishedProjectKey) {
            return APIXHRService("POST", API_PATH + "projects/design/publish-to-project-deployer", {
                projectKey, bundleId, publishedProjectKey
            });
        }
    },
    automation: {
        createWithInitialBundle: function(file, projectFolderId, projectKey) {
            return uploadFileRequest("projects/automation/create-with-initial-bundle", function(formdata) {
                formdata.append("file", file);
                formdata.append("projectFolderId", projectFolderId || "");
                formdata.append("projectKey", projectKey || "");
            }, null);
        },
        importBundle: function(projectKey, file) {
            return uploadFileRequest("projects/automation/import-bundle", function(formdata) {
                formdata.append("projectKey", projectKey);
                formdata.append("file", file);
            }, null);
        },
        listBundles: function(projectKey) {
            return APIXHRService("GET", API_PATH + "projects/automation/list-bundles", {
                projectKey: projectKey
            })
        },
        getBundleDetails: function(projectKey, bundleId) {
            return APIXHRService("GET", API_PATH + "projects/automation/get-bundle-details", {
                projectKey: projectKey, bundleId: bundleId
            })
        },
        checkBundleActivation: function(projectKey, bundleId) {
            return APIXHRService("GET", API_PATH + "projects/automation/check-bundle-activation", {
                projectKey: projectKey, bundleId: bundleId
            })
        },
        preloadBundle: function(projectKey, bundleId) {
            return APIXHRService("POST", API_PATH + "projects/automation/preload-bundle", {
                projectKey: projectKey, bundleId: bundleId
            })
        },
        activateBundle: function(projectKey, bundleId) {
            return APIXHRService("POST", API_PATH + "projects/automation/activate-bundle", {
                projectKey: projectKey, bundleId: bundleId
            })
        },
        getBundleActivationSettingsExt: function(projectKey) {
            return APIXHRService("GET", API_PATH + "projects/automation/get-activation-settings-ext", {
                projectKey: projectKey
            })
        },
        saveBundleActivationSettings: function(projectKey, settings) {
            return APIXHRService("POST", API_PATH + "projects/automation/save-activation-settings", {
                projectKey: projectKey, settings: JSON.stringify(settings)
            });
        },
        deleteBundle: function(projectKey, bundleId) {
            return APIXHRService("POST", API_PATH + "projects/automation/delete-bundle", {
                projectKey: projectKey, bundleId: bundleId
            })
        },
    },
    activity: {
        getActivitySummary: function(projectKey, timeSpan) {
            return APIXHRService("GET", API_PATH + "projects/activity/get-summary", {
                projectKey: projectKey, timeSpan: timeSpan
            })
        }
    },
    folderEdit: {
        listContents: function(projectKey, type) {
            return APIXHRService("GET", API_PATH + "projects/folder-edition/list-contents", {
                projectKey: projectKey, type: type
            });
        },
        getContent: function(projectKey, type, path, sendAnyway) {
            return APIXHRService("GET", API_PATH + "projects/folder-edition/get-content", {
                projectKey: projectKey, type: type, path: path, sendAnyway: sendAnyway
            });
        },
        setContent: function(projectKey, type, path, data) {
            return APIXHRService("POST", API_PATH + "projects/folder-edition/set-content", {
                projectKey: projectKey, type: type, path: path, data: data
            });
        },
        setContentMultiple: function(projectKey, type, contentMap) {
            return APIXHRService("POST", API_PATH + "projects/folder-edition/set-content-multiple", {
                projectKey: projectKey, type: type, contentMap: JSON.stringify(contentMap)
            });
        },
        createContent: function(projectKey, type, path, isFolder) {
            return APIXHRService("POST", API_PATH + "projects/folder-edition/create-content", {
                projectKey: projectKey, type: type, path: path, isFolder: isFolder
            });
        },
        deleteContent: function(projectKey, type, path) {
            return APIXHRService("POST", API_PATH + "projects/folder-edition/delete-content", {
                projectKey: projectKey, type: type, path: path
            });
        },
        decompressContent: function(projectKey, type, path) {
            return APIXHRService("POST", API_PATH + "projects/folder-edition/decompress-content", {
                projectKey: projectKey, type: type, path: path
            });
        },
        renameContent: function(projectKey, type, path, newName) {
            return APIXHRService("POST", API_PATH + "projects/folder-edition/rename-content", {
                projectKey: projectKey, type: type, path: path, newName: newName
            });
        },
        moveContent: function(projectKey, type, path, toPath) {
            return APIXHRService("POST", API_PATH + "projects/folder-edition/move-content", {
                projectKey: projectKey, type: type, path: path, toPath: toPath
            });
        },
        copyContent: function(projectKey, type, path) {
            return APIXHRService("POST", API_PATH + "projects/folder-edition/copy-content", {
                projectKey: projectKey, type: type, path: path
            });
        },
        uploadContent: function(projectKey, type, path, file, callback) {
            return uploadFileRequest("projects/folder-edition/upload-content", function(formdata) {
                formdata.append("projectKey", projectKey);
                formdata.append("type", type);
                formdata.append("path", path);
                formdata.append("file", file);
            }, callback);
        },
        checkUploadContent: function(projectKey, type, path, filePaths) {
            return APIXHRService("POST", API_PATH + "projects/folder-edition/check-upload-content", {
                projectKey: projectKey, type: type, path: path, filePaths: JSON.stringify(filePaths)
            });
        }
    },
    checkReaderAuthorizations: function(projectKey, readerAuthorizations) {
        return APIXHRService("GET", API_PATH + "projects/check-reader-authorizations", {
            projectKey: projectKey,
            readerAuthorizations: JSON.stringify(readerAuthorizations)
        });
    },
    listComputedMetrics: function(projectKey) {
        return APIXHRService("GET", API_PATH + "projects/list-computed-metrics", {
            projectKey: projectKey
        });
    },
    saveMetrics: function(projectKey, metrics, checks) {
        return APIXHRService("POST", API_PATH + "projects/save-metrics", {
            projectKey: projectKey,
            metricsData: JSON.stringify(metrics),
            checksData: JSON.stringify(checks)
        });
    },
    listAvailableMetrics: function(projectKey, folderId) {
        return APIXHRService("GET", API_PATH + "projects/list-available-metrics", {
            projectKey: projectKey,
            folderId: folderId
        });
    },
    getPreparedMetricHistory: function(projectKey, partitionId, metric, metricId) {
        return APIXHRService("GET", API_PATH + "projects/get-prepared-metric-history", {
            projectKey: projectKey,
            data: JSON.stringify(metric),
            metricId: metricId,
            partitionId: partitionId
        });
    },
    getPreparedMetricHistories: function(projectKey, displayedState) {
        return APIXHRService("POST", API_PATH + "projects/get-prepared-metric-histories", {
            projectKey: projectKey,
            data: JSON.stringify(displayedState || {})
        });
    },
    getCheckHistories: function(projectKey, displayedState) {
        return APIXHRService("POST", API_PATH + "projects/get-prepared-check-histories", {
            projectKey: projectKey,
            data: JSON.stringify(displayedState || {})
        });
    },
    listComputedChecks: function(projectKey) {
        return APIXHRService("GET", API_PATH + "projects/list-computed-checks", {
            projectKey: projectKey
        });
    },
    createMetricsDataset: function(projectKey, view, partition, filter) {
        return APIXHRService("GET", API_PATH + "datasets/create-metrics-dataset", {
            projectKey: projectKey,
            objectId: '',
            view: view,
            partition: partition,
            filter: filter
        });
    },
    clearMetrics: function(projectKey) {
        return APIXHRService("GET", API_PATH + "projects/clear-metrics", {
            projectKey: projectKey
        });
    },
    saveExternalMetricsValues: function(projectKey, metrics, types) {
        return APIXHRService("POST", API_PATH + "projects/save-external-metrics-values", {
            projectKey: projectKey,
            data: JSON.stringify(metrics),
            typesData: JSON.stringify(types || {})
        });
    },
    saveExternalChecksValues: function(projectKey, checks) {
        return APIXHRService("POST", API_PATH + "projects/save-external-checks-values", {
            projectKey: projectKey,
            data: JSON.stringify(checks)
        });
    },
    switchAppType: function(projectKey, appType, settings, manifest) {
        return APIXHRService("POST", API_PATH + "projects/switch-app-type", {
            projectKey: projectKey,
            appType: appType,
            settings: settings ? JSON.stringify(settings) : null,
            manifest: manifest ? JSON.stringify(manifest) : null
        });
    },
    createOrUpdatePlugin: function(projectKey, pluginId, appName) {
        return APIXHRService("POST", API_PATH + "projects/create-or-update-plugin", {
            projectKey: projectKey,
            pluginId: pluginId,
            appName: appName
        });
    },

    git: {
        pull: function(projectKey, remoteName, branchName) {
            return APIXHRService("GET", API_PATH + "projects/git/pull", {
                projectKey: projectKey,
                remoteName: remoteName,
                branchName: branchName
            });
        },
        fetch: function(projectKey, remoteName) {
            return APIXHRService("GET", API_PATH + "projects/git/fetch", {
                projectKey: projectKey,
                remoteName: remoteName
            });
        },
        push: function(projectKey, remoteName, branchName) {
            return APIXHRService("GET", API_PATH + "projects/git/push", {
                projectKey: projectKey,
                remoteName: remoteName,
                branchName: branchName
            });
        },
        resetToUpstream: function(projectKey, remoteName, branchName) {
            return APIXHRService("POST", API_PATH + "projects/git/reset-to-upstream", {
                projectKey: projectKey,
                remoteName: remoteName,
                branchName: branchName
            });
        },
        resetToHead: function(projectKey) {
            return APIXHRService("POST", API_PATH + "projects/git/reset-to-head", {
                projectKey: projectKey
            });
        },
        getFullStatus: function(projectKey) {
            return APIXHRService("GET", API_PATH + "projects/git/get-full-status", {
                projectKey: projectKey
            });
        },
        listBranches: function(projectKey) {
            return APIXHRService("GET", API_PATH + "projects/git/list-branches", {
                projectKey: projectKey
            });
        },
        deleteBranches: function(projectKey, /*String[]*/branchNames, deleteOptions) {
            return APIXHRService("GET", API_PATH + "projects/git/delete-branches", {
                projectKey: projectKey,
                branchNames: JSON.stringify(branchNames),
                remoteDelete: deleteOptions.remoteDelete,
                forceDelete: deleteOptions.forceDelete
            });
        },
        commit: function(projectKey, commitMessage) {
            return APIXHRService("GET", API_PATH + "projects/git/commit", {
                projectKey: projectKey,
                commitMessage: commitMessage
            });
        },
        prepareCommit: function(projectKey) {
            return APIXHRService("GET", API_PATH + "projects/git/prepare-commit", {
                projectKey: projectKey
            });
        },
        createBranch: function(projectKey, branchName, commitId) {
            return APIXHRService("GET", API_PATH + "projects/git/create-branch", {
                projectKey: projectKey,
                branchName: branchName,
                commitId: commitId
            });
        },
        switchBranch: function(projectKey, branchName, clearOutputDatasets) {
            return APIXHRService("GET", API_PATH + "projects/git/switch-branch", {
                projectKey: projectKey,
                branchName: branchName,
                clearOutputDatasets: clearOutputDatasets
            });
        },
        setRemote: function(projectKey, remoteName, remoteUrl) {
            return APIXHRService("GET", API_PATH + "projects/git/set-remote", {
                projectKey: projectKey,
                remoteName: remoteName,
                remoteUrl: remoteUrl
            });
        },
        removeRemote: function(projectKey, remoteName) {
            return APIXHRService("GET", API_PATH + "projects/git/rm-remote", {
                projectKey: projectKey,
                remoteName: remoteName
            });
        },
        listProjectsMatchingRemoteRepository: function(projectKey, branchName) {
            return APIXHRService("GET", API_PATH + "projects/git/list-projects-matching-remote-repository", {
                projectKey: projectKey,
                branchName: branchName
            });
        }
    }
},
projectFolders: {
    listRootContents: (lightMode) => APIXHRService("GET", `${API_PATH}project-folders/list-contents`, { lightMode }),
    listContents: (folderId, lightMode, maxLevel = -1, silent = false) => APIXHRService("GET",  `${API_PATH}project-folders/${folderId}/list-contents`, { lightMode, maxLevel }, silent === true ? 'nospinner' : undefined),
    create: (parentId, name) => APIXHRService("POST", `${API_PATH}project-folders/create`, { folderId: parentId, name }),
    moveItems: (destination, folderIds, projectKeys = null, projectParent = null) => APIXHRService("POST", `${API_PATH}project-folders/move-items`, { folderIds: JSON.stringify(folderIds), projectKeys: JSON.stringify(projectKeys), projectParent, destination }),
    delete: (folders, destination) => APIXHRService("POST", `${API_PATH}project-folders/delete`, { folderIds: JSON.stringify(folders), destination }),
    getSettings: (folderId) => APIXHRService("GET", `${API_PATH}project-folders/${folderId}/settings`),
    setSettings: (folderId, settings) => APIXHRService("PUT", `${API_PATH}project-folders/${folderId}/settings`, { projectFolderSettings: JSON.stringify(settings) }),
    getEffectiveReaders: (folderId) => APIXHRService("GET", `${API_PATH}project-folders/${folderId}/list-readers`),
    listExtended: silent => APIXHRService("GET", `${API_PATH}project-folders/`, {}, silent === true ? 'nospinner' : undefined),
},
globalfinder: {
    search: (query, limit = 10, contextualProjectKey) => APIXHRService("POST", `${API_PATH}search/`, { query, limit, contextualProjectKey}, 'nospinner'),
},
apps: {
    listTemplates: function(noSpinner) {
        return APIXHRService("GET", API_PATH + "apps/list-templates", {}, noSpinner ? "nospinner" : undefined);
    },
    listInstances: function() {
        return APIXHRService("GET", API_PATH + "apps/list-instances");
    },
    getTemplateSummary: function(appId) {
        return APIXHRService("GET", API_PATH + "apps/get-template-summary", {appId: appId});
    },
    getInstanceSummary: function(projectKey) {
        return APIXHRService("GET", API_PATH + "apps/get-instance-summary", {projectKey: projectKey});
    },
    instantiate: function(appId, targetProjectKey, targetProjectLabel) {
        return APIXHRService("POST", API_PATH + "apps/instantiate", {
            appId: appId,
            targetProjectKey:targetProjectKey,
            targetProjectLabel: targetProjectLabel
        })
    },
    createOrUpdateTestInstance: function(appId, fullUpdate) {
        return APIXHRService("POST", API_PATH + "apps/create-or-update-test-instance", {appId: appId, fullUpdate: fullUpdate});
    },
    getTestInstance: function(appId) {
        return APIXHRService("GET", API_PATH + "apps/get-test-instance", {appId: appId});
    },
    getAppRecipeUsability: function(recipeType) {
        return APIXHRService("GET", API_PATH + "apps/get-app-recipe-usability", {recipeType: recipeType});
    },
    checkInstancesDeletability: function(appId, projectKeys) {
        return APIXHRService("GET", API_PATH + "apps/check-instances-deletability", {appId:appId, projectKeys: JSON.stringify(projectKeys)});
    },
    deleteInstances: function(appId, projectKeys, dropManagedData, dropManagedFoldersOutputOfRecipe) {
        return APIXHRService("POST", API_PATH + "apps/delete-instances", {
            appId:appId,
            projectKeys: JSON.stringify(projectKeys),
            dropManagedData: dropManagedData,
            dropManagedFoldersOutputOfRecipe:dropManagedFoldersOutputOfRecipe
        });
    }
},
git: {
    getObjectLog: function(projectKey, objectType, objectId, since, count) {
        return APIXHRService("GET", API_PATH + "git/get-object-log", {
            projectKey: projectKey,
            objectType: objectType,
            objectId: objectId,
            since: since,
            count: count
        });
    },
    revertObjectToRevision: function(projectKey, objectType, objectId, hash) {
        return APIXHRService("POST", API_PATH + "git/revert-object-to-revision", {
            projectKey: projectKey,
            objectType: objectType,
            objectId: objectId,
            hash:hash
        });
    },
    revertProjectToRevision: function(projectKey, hash) {
        return APIXHRService("POST", API_PATH + "git/revert-project-to-revision", {
            projectKey: projectKey,
            hash:hash
        });
    },

    revertSingleCommit : function(projectKey, objectRef, hash) {
        return APIXHRService("POST", API_PATH + "git/revert-single-commit", {
            projectKey: projectKey,
            objectRef: objectRef,
            hash:hash
        });
    },

    prepareObjectCommit: function(projectKey, objectType, objectId) {
        return APIXHRService("GET", API_PATH + "git/prepare-object-commit", {
            projectKey: projectKey,
            objectType: objectType,
            objectId: objectId
        });
    },
    commitObject: function(projectKey, objectType, objectId, message) {
        return APIXHRService("POST", API_PATH + "git/commit-object", {
            projectKey: projectKey,
            objectType: objectType,
            objectId: objectId, message: message
        });
    },
    getCommitDiff: function(projectKey, objectRef, commitId) {
        return APIXHRService("GET", API_PATH + "git/get-commit-diff", {
            projectKey: projectKey,
            objectRef: objectRef,
            commitId: commitId
        });
    },
    getRevisionsDiff: function(projectKey, commitFrom, commitTo, objectRef) {
        return APIXHRService("GET", API_PATH + "git/get-revisions-diff", {
            projectKey: projectKey,
            commitFrom: commitFrom,
            commitTo: commitTo,
            objectRef: JSON.stringify(objectRef)
        });
    },
    listRemoteRefs: function(repository) {
        return APIXHRService("GET", API_PATH + "git/list-remote-references", {
            repository: repository
        });
    },
    listRemotes : function(projectKey) {
        return APIXHRService("GET", API_PATH + "git/list-remotes", {
            projectKey: projectKey
        })
    },
    addRemote : function(projectKey, name, url) {
        return APIXHRService("POST", API_PATH + "git/add-remote", {
            projectKey: projectKey,
            name: name,
            url: url
        })
    },
    removeRemote : function(projectKey, name) {
        return APIXHRService("POST", API_PATH + "git/remove-remote", {
            projectKey: projectKey,
            name: name
        })
    },
    setProjectGitRef: function(projectKey, gitRef, gitRefPath, addPythonPath) {
        return APIXHRService("POST", API_PATH + "git/set-project-git-ref", {
            projectKey: projectKey,
            gitReference: JSON.stringify(gitRef),
            gitReferencePath: gitRefPath,
            addPythonPath: addPythonPath
        });
    },
    rmProjectGitRef: function(projectKey, gitRefPath, deleteDirectory) {
        return APIXHRService("POST", API_PATH + "git/rm-project-git-ref", {
            projectKey: projectKey,
            gitReferencePath: gitRefPath,
            deleteDirectory: deleteDirectory
        });
    },
    pullProjectGitRef: function(projectKey, gitRefPath) {
        return APIXHRService("GET", API_PATH + "git/pull-project-git-ref", {
            projectKey: projectKey,
            gitReferencePath: gitRefPath
        });
    },
    getProjectExternalLibs: function(projectKey) {
        return APIXHRService("GET", API_PATH + "git/get-project-external-libraries", {
            projectKey: projectKey
        });
    },
    pullProjectGitRefs: function(projectKey) {
        return APIXHRService("GET", API_PATH + "git/pull-project-git-refs", {
            projectKey: projectKey
        });
    }
},
wikis : {
    getWiki: function(projectKey) {
        return APIXHRService("GET", API_PATH + "projects/wikis/get-wiki", {
            projectKey: projectKey
        });
    },
    getArticleSummary: function(projectKey, articleIdOrName) {
        return APIXHRService("GET", API_PATH + "projects/wikis/get-article-summary", {
            projectKey: projectKey,
            articleIdOrName: articleIdOrName
        });
    },
    getArticlePayload: function(projectKey, articleId) {
        return APIXHRService("GET", API_PATH + "projects/wikis/get-article-payload",  {
            projectKey: projectKey,
            articleId: articleId
        });
    },
    createArticle: function(projectKey, articleName, parent, templateDesc) {
        return APIXHRService("POST", API_PATH + "projects/wikis/create-article", {
            projectKey: projectKey,
            articleName: articleName,
            parent: parent,
            templateDesc: JSON.stringify(templateDesc)
        });
    },
    checkSaveConflict: function(article) {
        return APIXHRService("POST", API_PATH + "projects/wikis/check-save-article-conflict", {
            article: JSON.stringify(article)
        });
    },
    saveArticle: function(article, payload, commitMessage) {
        let articleRequest = {
            article: JSON.stringify(article),
            commitMessage: commitMessage
        };
        if (angular.isString(payload)) {
            articleRequest['payload'] = payload;
        }
        return APIXHRService("POST", API_PATH + "projects/wikis/save-article", articleRequest);
    },
    changeArticleParent: function(projectKey, id, parentId) {
        return APIXHRService("POST", API_PATH + "projects/wikis/change-article-parent", {
            projectKey: projectKey,
            id: id,
            parentId: parentId
        });
    },
    editTaxonomy: function(projectKey, wiki) {
        return APIXHRService("POST", API_PATH + "projects/wikis/edit-taxonomy", {
            projectKey: projectKey,
            wiki: JSON.stringify(wiki)
        });
    },
    setHomeArticle: function(projectKey, homeArticleId) {
        return APIXHRService("POST", API_PATH + "projects/wikis/set-home-article", {
            projectKey: projectKey,
            homeArticleId: homeArticleId
        });
    },
    renameArticle: function(projectKey, oldId, newId) {
        return APIXHRService("POST", API_PATH + "projects/wikis/rename-article", {
            projectKey: projectKey,
            oldId: oldId,
            newId: newId
        });
    },
    deleteArticle: function(projectKey, articleId, deleteChildren) {
        return APIXHRService("POST", API_PATH + "projects/wikis/delete-article", {
            projectKey: projectKey,
            articleId: articleId,
            deleteChildren: deleteChildren
        });
    },
    listTemplates: function() {
        return APIXHRService("GET", API_PATH + "projects/wikis/list-templates", {});
    },
    upload: function(projectKey, articleId, file, callback) {
        return uploadFileRequest("projects/wikis/upload", function(formdata) {
            formdata.append("projectKey", projectKey);
            formdata.append("articleId", articleId);
            formdata.append("file", file);
        }, callback);
    },
    copyArticle: function(projectKey, articleName, parent, originalArticleId, withAttachments) {
        return APIXHRService("POST", API_PATH + "projects/wikis/copy-article", {
            projectKey: projectKey,
            articleName: articleName,
            parent: parent,
            originalArticleId: originalArticleId,
            withAttachments: withAttachments
        });
    },
    exportArticle: function(projectKey, articleId, exportFormat, exportChildren, exportAttachments) {
        return APIXHRService("POST", API_PATH + "projects/wikis/export", {
            projectKey: projectKey,
            articleId: articleId,
            exportFormat: JSON.stringify(exportFormat),
            exportChildren: exportChildren,
            exportAttachments: exportAttachments
        });
    },
    getExportURL: function(projectKey, exportId) {
        return API_PATH + "projects/wikis/download-export?"
        + "projectKey=" + encodeURIComponent(projectKey)
        + "&exportId=" + encodeURIComponent(exportId);
    }
},
analysis: {
    listHeads: function(projectKey, withMLTasks) {
        return APIXHRService("GET", API_PATH + "analysis/list-heads", {
            projectKey: projectKey,
            withMLTasks: !!withMLTasks
        });
    },
    listOnDataset: function(projectKey, datasetSmartName, withMLTasks) {
        return APIXHRService("GET", API_PATH + "analysis/list-on-dataset", {
            projectKey: projectKey,
            datasetSmartName: datasetSmartName,
            withMLTasks: !!withMLTasks
        });
    },
    create: function(projectKey, inputDatasetSmartName, name) {
         return APIXHRService("POST", API_PATH + "analysis/create", {
            projectKey: projectKey,
            inputDatasetSmartName: inputDatasetSmartName,
            name: name
        });
    },
    createPredictionTemplate: function(projectKey, inputDatasetSmartName, analysisName, mlBackendType, mlBackendName, targetVariable, guessPolicy) {
         return APIXHRService("POST", API_PATH + "analysis/create-prediction-template", {
            projectKey: projectKey,
            inputDatasetSmartName: inputDatasetSmartName,
            analysisName: analysisName,
            mlBackendType: mlBackendType,
            mlBackendName: mlBackendName,
            targetVariable: targetVariable,
            guessPolicy: guessPolicy
        });
    },
    createClusteringTemplate: function(projectKey, inputDatasetSmartName, analysisName, mlBackendType, mlBackendName, guessPolicy) {
         return APIXHRService("POST", API_PATH + "analysis/create-clustering-template", {
            projectKey: projectKey,
            inputDatasetSmartName: inputDatasetSmartName,
            analysisName: analysisName,
            mlBackendType: mlBackendType,
            mlBackendName: mlBackendName,
            guessPolicy: guessPolicy
        });
    },
    duplicate: function(projectKey, analysisId) {
        return APIXHRService("POST", API_PATH + "analysis/duplicate", {projectKey: projectKey, analysisId: analysisId });
    },
    getCore: function(projectKey, analysisId) {
        return APIXHRService("GET", API_PATH + "analysis/get-core", {projectKey: projectKey, analysisId: analysisId });
    },
    getPostScriptSchema: function(projectKey, analysisId) {
        return APIXHRService("GET", API_PATH + "analysis/get-post-script-schema", {projectKey: projectKey, analysisId: analysisId});
    },
    getSummary: function(projectKey, analysisId, withMLTasksAndSavedModels) {
        return APIXHRService("GET", API_PATH + "analysis/get-summary", {
            projectKey: projectKey,
            analysisId: analysisId,
            withMLTasksAndSavedModels: !!withMLTasksAndSavedModels
        });
    },
    saveCore: function(data, saveInfo) {
        return APIXHRService("POST", API_PATH + "analysis/save-core", {data: JSON.stringify(data), saveInfo: JSON.stringify(saveInfo || {})});
    },
    listMLTasks: function(projectKey, analysisId) {
        return APIXHRService("GET", API_PATH + "analysis/list-mltasks", {projectKey: projectKey, analysisId: analysisId});
    },
    listSavedModels: function(projectKey, analysisId) {
        return APIXHRService("GET", API_PATH + "analysis/list-saved-models", { projectKey: projectKey, analysisId: analysisId });
    },
    addToFlow: function(projectKey, analysisId, createOutput, outputDatasetName, outputDatasetSettings, options) {
        return APIXHRService("POST", API_PATH + "analysis/add-to-flow/", {
                projectKey: projectKey,
                analysisId: analysisId,
                createOutput: createOutput,
                outputDatasetName: outputDatasetName,
                outputDatasetSettings: JSON.stringify(outputDatasetSettings),
                options: JSON.stringify(options)
            }
        );
    },
    exportProcessedData: function(projectKey, analysisId, params) {
        return APIXHRService("POST", API_PATH + "analysis/export-processed-data/", {
                projectKey: projectKey,
                analysisId: analysisId,
                params: JSON.stringify(params)
            }
        );
    },
    mlcommon: {
        stopGridSearch: function(fullModelIds) {
            return APIXHRService("POST", API_PATH + "analysis/mlcommon/stop-grid-search", {fullModelIds: fullModelIds });
        },
        stopGridSearchSession: function(projectKey, analysisId, mlTaskId, sessionId) {
            return APIXHRService("POST", API_PATH + "analysis/mlcommon/stop-grid-search-session", {projectKey: projectKey, analysisId: analysisId, mlTaskId: mlTaskId, sessionId: sessionId });
        },
        interruptPartitionedTraining: function (fullModelIds) {
            return APIXHRService("POST", API_PATH + "analysis/mlcommon/interrupt-partitioned-training", {fullModelIds: fullModelIds});
        },
        listBackends: function(projectKey, datasetSmartName, taskType) {
            return APIXHRService("POST", API_PATH + "analysis/mlcommon/list-backends", {projectKey: projectKey, datasetSmartName: datasetSmartName, taskType: taskType });
        },
        getDiagnosticsDefinition: function() {
            return APIXHRService("GET", API_PATH + "analysis/mlcommon/diagnostics-definition");
        },
        setModelMeta: function(fullModelId, data) {
            return APIXHRService("POST", API_PATH + "analysis/mlcommon/set-model-meta", {fullModelId: fullModelId, data: JSON.stringify(data)});
        },
        getCurrentSettings: function(projectKey, analysisId, mlTaskId) {
            return APIXHRService("POST", API_PATH + "analysis/mlcommon/get-current-settings", {
                projectKey: projectKey, analysisId: analysisId, mlTaskId: mlTaskId
            });
        },
        getLastPreprocessingStatus: function(projectKey, analysisId, mlTaskId) {
            return APIXHRService("GET", API_PATH + "analysis/mlcommon/get-last-preprocessing-status", {
                projectKey: projectKey, analysisId: analysisId, mlTaskId: mlTaskId
            });
        },
        forgetFeatureSelection: function(projectKey, analysisId, mlTaskId) {
            return APIXHRService("POST", API_PATH + "analysis/mlcommon/forget-feature-selection", {
                projectKey: projectKey, analysisId: analysisId, mlTaskId: mlTaskId
            });
        },
        trainAbort: function(projectKey, analysisId, mlTaskId) {
            return APIXHRService("POST", API_PATH + "analysis/mlcommon/train-abort", {
                projectKey: projectKey, analysisId: analysisId, mlTaskId: mlTaskId
            });
        },
        trainAbortPartial: function(projectKey, analysisId, mlTaskId, fullModelIds) {
            return APIXHRService("POST", API_PATH + "analysis/mlcommon/train-abort-partial", {
                projectKey: projectKey, analysisId: analysisId, mlTaskId: mlTaskId, fullModelIds: fullModelIds
            });
        },
        deleteMLTask: function(projectKey, analysisId, mlTaskId) {
            return APIXHRService("POST", API_PATH + "analysis/mlcommon/delete-mltask", {
                projectKey: projectKey, analysisId: analysisId, mlTaskId: mlTaskId
            });
        },
        copyFeatureSettings: function(projectKeyFrom, analysisIdFrom, mlTaskIdFrom, projectKeyTo, analysisIdTo, mlTaskIdTo) {
            return APIXHRService("POST", API_PATH + "analysis/mlcommon/copy-features-handling", {
               projectKeyFrom: projectKeyFrom, analysisIdFrom: analysisIdFrom, mlTaskIdFrom: mlTaskIdFrom,
               projectKeyTo: projectKeyTo, analysisIdTo: analysisIdTo, mlTaskIdTo: mlTaskIdTo
           });
        },
        revertScriptToSession: function(projectKey, analysisId, mlTaskId, sessionId) {
            return APIXHRService("POST", API_PATH + "analysis/mlcommon/revert-script-to-session", {
                projectKey:projectKey,
                analysisId:analysisId,
                mlTaskId:mlTaskId,
                sessionId:sessionId
            });
        }
    },
    /* Prediction ML Task */
    pml: {
        listPredictableColumns: function(projectKey, analysisId) {
            return APIXHRService("GET", API_PATH + "analysis/pml/list-predictable-columns", {projectKey: projectKey, analysisId: analysisId});
        },
        listGuessPolicies: function() {
            return APIXHRService("GET", API_PATH + "analysis/pml/list-guess-policies");
        },
        listCustomPythonAlgos: function(projectKey) {
            return APIXHRService("GET", API_PATH + "analysis/pml/list-custom-python-algos", {projectKey: projectKey});
        },
        createAndGuess: function(projectKey, analysisId, targetVariable, mlBackendType, mlBackendName, guessPolicy) {
            return APIXHRService("POST", API_PATH + "analysis/pml/create-and-guess", {
                projectKey: projectKey,
                analysisId: analysisId,
                targetVariable: targetVariable,
                mlBackendType: mlBackendType,
                mlBackendName: mlBackendName || '',
                guessPolicy: guessPolicy || 'DEFAULT'
            });
        },
        duplicate: function(projectKeyFrom, analysisIdFrom, mlTaskIdFrom, projectKeyTo, analysisIdTo, newTarget) {
            return APIXHRService("POST", API_PATH + "analysis/pml/duplicate", {
                projectKeyFrom,
                analysisIdFrom,
                mlTaskIdFrom,
                projectKeyTo,
                analysisIdTo,
                newTarget
            });
        },
        getModelSnippets: function(projectKey, analysisId, mlTaskId, fullModelIds, spinner) {
            return APIXHRService("GET", API_PATH + "analysis/pml/get-model-snippets", {
                projectKey: projectKey, analysisId: analysisId, mlTaskId: mlTaskId, fullModelIds: fullModelIds
            }, spinner ? undefined : "nospinner");
        },
        getPartitionedModelSnippets: function(fullModelId, spinner) {
            return APIXHRService("GET", API_PATH + "analysis/pml/get-partitioned-model-snippets", {
                fullModelId: fullModelId
            }, spinner ? undefined : "nospinner");
        },
        getTaskStatus: function(projectKey, analysisId, mlTaskId) {
            return APIXHRService("GET", API_PATH + "analysis/pml/get-mltask-status", {
                projectKey: projectKey, analysisId: analysisId, mlTaskId: mlTaskId
            }, "nospinner");
        },
        getUpdatedSettings: function(projectKey, analysisId, mlTaskId) {
            return APIXHRService("POST", API_PATH + "analysis/pml/get-updated-settings", {
                projectKey: projectKey, analysisId: analysisId, mlTaskId: mlTaskId
            });
        },
        getSessionTask: function(projectKey, analysisId, mlTaskId, sessionId) {
            return APIXHRService("POST", API_PATH + "analysis/pml/get-session-task", {
                projectKey: projectKey, analysisId: analysisId, mlTaskId: mlTaskId, sessionId: sessionId
            });
        },
        getPretrainEquivalentMLTask: function(fullModelId, usePostTrain) {
            return APIXHRService("POST", API_PATH + "analysis/pml/get-pretrain-equivalent-mltask", {
                fullModelId:fullModelId,
                usePostTrain: usePostTrain
            });
        },
        getPreTrainStatus: function(projectKey, analysisId, mlTaskId) {
            return APIXHRService("GET", API_PATH + "analysis/pml/get-pretrain-status", {
                projectKey: projectKey, analysisId: analysisId, mlTaskId: mlTaskId
            });
        },
        retrainStart: function(projectKey, analysisId, mlTaskId, sessionId, fullModelIds) {
            return APIXHRService("POST", API_PATH + "analysis/pml/retrain-start", {
                projectKey: projectKey, analysisId: analysisId, mlTaskId: mlTaskId, sessionId: sessionId, fullModelIds: fullModelIds
            });
        },
        trainStart: function(projectKey, analysisId, mlTaskId, userSessionName, userSessionDescription, forceRefresh) {
            return APIXHRService("POST", API_PATH + "analysis/pml/train-start", {
                projectKey: projectKey, analysisId: analysisId, mlTaskId: mlTaskId,
                userSessionName: userSessionName, userSessionDescription: userSessionDescription,
                forceRefresh: forceRefresh
            });
        },
        resumePartitionedTraining: function(projectKey, analysisId, mlTaskId, sessionId, fullModelIds) {
            return APIXHRService("POST", API_PATH + "analysis/pml/resume-partitioned-training", {
                projectKey: projectKey, analysisId: analysisId, mlTaskId: mlTaskId, sessionId: sessionId, fullModelIds: fullModelIds
            });
        },
        checkCanEnsemble: function(modelIds) {
            return APIXHRService("POST", API_PATH + "analysis/pml/check-can-ensemble", {
                modelIds: JSON.stringify(modelIds),
            });
        },
        createEnsemble: function(projectKey, analysisId, mlTaskId, modelIds, method) {
            return APIXHRService("POST", API_PATH + "analysis/pml/create-ensemble", {
                projectKey: projectKey,
                analysisId: analysisId,
                mlTaskId: mlTaskId,
                modelIds: JSON.stringify(modelIds),
                method: method
            });
        },
        saveSettings: function(projectKey, analysisId, mlTask) {
            return APIXHRService("POST", API_PATH + "analysis/pml/save-settings", {
                projectKey: projectKey, analysisId: analysisId, mlTask: JSON.stringify(mlTask)
            });
        },
        reguessWithTarget: function(projectKey, analysisId, mlTaskId, targetVariable, redetect) {
            return APIXHRService("POST", API_PATH + "analysis/pml/reguess-with-target", {
                projectKey: projectKey, analysisId: analysisId, mlTaskId: mlTaskId,
                targetVariable: targetVariable, redetect: redetect
            });
        },
        reguessWithType: function(projectKey, analysisId, mlTaskId, newType, redetect) {
            return APIXHRService("POST", API_PATH + "analysis/pml/reguess-with-type", {
                projectKey: projectKey, analysisId: analysisId, mlTaskId: mlTaskId,
                newType: newType, redetect: redetect
            });
        },
        changeGuessPolicy: function(projectKey, analysisId, mlTaskId, policyId) {
            return APIXHRService("POST", API_PATH + "analysis/pml/change-guess-policy", {
                projectKey: projectKey, analysisId: analysisId, mlTaskId: mlTaskId,
                newPolicyId: policyId
            });
        },
        saveCostMatrixWeights: function(fullModelId, data) {
          return APIXHRService("POST", API_PATH + "analysis/pml/save-costmatrix-weights", {
                fullModelId: fullModelId, data: JSON.stringify(data)
            });
        },
        deployTrain: function(fullModelId, trainDatasetSmartName, testDatasetSmartName, modelName, options) {
            return APIXHRService("POST", API_PATH + "analysis/pml/flow/deploy-train", {
                fullModelId: fullModelId,
                trainDatasetSmartName: trainDatasetSmartName,
                testDatasetSmartName: testDatasetSmartName,
                modelName: modelName,
                options: JSON.stringify(options)
            });
        },
        listRedeployableTrain: function(fullModelId) {
            return APIXHRService("POST", API_PATH + "analysis/pml/flow/list-redeployable-train", {fullModelId: fullModelId });
        },
        redeployTrain: function(fullModelId, recipeName, activate, options) {
            return APIXHRService("POST", API_PATH + "analysis/pml/flow/redeploy-train", {
                fullModelId: fullModelId,
                recipeName: recipeName,
                activate: !!activate,
                options: JSON.stringify(options)
            });
        },
        createNotebook: function(fullModelId, notebookTitle) {
            return APIXHRService("POST", API_PATH + "analysis/pml/create-notebook", {fullModelId: fullModelId, notebookTitle: notebookTitle});
        },
        validateArchitecture: function(payload, envSelection, projectKey) {
            return APIXHRService("POST", API_PATH + "analysis/pml/validate-keras-architecture", {
                payload : payload,
                envSelection : JSON.stringify(envSelection),
                projectKey : projectKey
            });
        },
        copyAlgorithmSettings: function(projectKeyFrom, analysisIdFrom, mlTaskIdFrom, projectKeyTo, analysisIdTo, mlTaskIdTo) {
            return APIXHRService("POST", API_PATH + "analysis/pml/copy-algorithm-settings", {
               projectKeyFrom: projectKeyFrom, analysisIdFrom: analysisIdFrom, mlTaskIdFrom: mlTaskIdFrom,
               projectKeyTo: projectKeyTo, analysisIdTo: analysisIdTo, mlTaskIdTo: mlTaskIdTo
           });
        }
    },
    /* Clustering MLTask */
    cml: {
        listGuessPolicies: function() {
            return APIXHRService("GET", API_PATH + "analysis/cml/list-guess-policies");
        },
        createAndGuess: function(projectKey, analysisId, mlBackendType, mlBackendName, guessPolicy) {
            return APIXHRService("POST", API_PATH + "analysis/cml/create-and-guess", {
                projectKey: projectKey,
                analysisId: analysisId,
                mlBackendType: mlBackendType,
                mlBackendName: mlBackendName || '',
                guessPolicy: guessPolicy || 'DEFAULT'
            });
        },
        duplicate: function(projectKeyFrom, analysisIdFrom, mlTaskIdFrom, projectKeyTo, analysisIdTo) {
            return APIXHRService("POST", API_PATH + "analysis/cml/duplicate", {
                projectKeyFrom,
                analysisIdFrom,
                mlTaskIdFrom,
                projectKeyTo,
                analysisIdTo
            });
        },
        getModelSnippets: function(projectKey, analysisId, mlTaskId, fullModelIds) {
            return APIXHRService("GET", API_PATH + "analysis/cml/get-model-snippets", {
                projectKey: projectKey, analysisId: analysisId, mlTaskId: mlTaskId, fullModelIds: fullModelIds
            }, "nospinner");
        },
        getTaskStatus: function(projectKey, analysisId, mlTaskId) {
            return APIXHRService("GET", API_PATH + "analysis/cml/get-mltask-status", {
                projectKey: projectKey, analysisId: analysisId, mlTaskId: mlTaskId
            }, "nospinner");
        },
        getUpdatedSettings: function(projectKey, analysisId, mlTaskId) {
            return APIXHRService("POST", API_PATH + "analysis/cml/get-updated-settings", {
                projectKey: projectKey, analysisId: analysisId, mlTaskId: mlTaskId
            });
        },
        getSessionTask: function(projectKey, analysisId, mlTaskId, sessionId) {
            return APIXHRService("POST", API_PATH + "analysis/cml/get-session-task", {
                projectKey: projectKey, analysisId: analysisId, mlTaskId: mlTaskId, sessionId: sessionId
            });
        },
        getPreTrainStatus: function(projectKey, analysisId, mlTaskId) {
            return APIXHRService("GET", API_PATH + "analysis/cml/get-pretrain-status", {
                projectKey: projectKey, analysisId: analysisId, mlTaskId: mlTaskId
            });
        },
        trainStart: function(projectKey, analysisId, mlTaskId, userSessionName, userSessionDescription, forceRefresh) {
            return APIXHRService("POST", API_PATH + "analysis/cml/train-start", {
                projectKey: projectKey, analysisId: analysisId, mlTaskId: mlTaskId,
                userSessionName: userSessionName, userSessionDescription: userSessionDescription,
                 forceRefresh: forceRefresh
            });
        },
        saveSettings: function(projectKey, analysisId, mlTask) {
            return APIXHRService("POST", API_PATH + "analysis/cml/save-settings", {
                projectKey: projectKey, analysisId: analysisId, mlTask: JSON.stringify(mlTask)
            });
        },
        reguess: function(projectKey, analysisId, mlTaskId) {
            return APIXHRService("POST", API_PATH + "analysis/cml/reguess", {
                projectKey: projectKey, analysisId: analysisId, mlTaskId: mlTaskId
            });
        },
        deployTrain: function(fullModelId, inputDatasetSmartName, modelName) {
            return APIXHRService("POST", API_PATH + "analysis/cml/flow/deploy-train", {
                fullModelId: fullModelId,
                inputDatasetSmartName: inputDatasetSmartName,
                modelName: modelName
            });
        },
        listRedeployableTrain: function(fullModelId) {
            return APIXHRService("POST", API_PATH + "analysis/cml/flow/list-redeployable-train", {fullModelId: fullModelId });
        },
        redeployTrain: function(fullModelId, recipeName, activate) {
            return APIXHRService("POST", API_PATH + "analysis/cml/flow/redeploy-train", {
                fullModelId: fullModelId, recipeName: recipeName, activate: !!activate
            });
        },
        deployCluster: function(fullModelId, inputDatasetSmartName, outputDatasetName, outputDatasetSettings) {
            return APIXHRService("POST", API_PATH + "analysis/cml/flow/deploy-cluster", {
                fullModelId: fullModelId,
                inputDatasetSmartName:inputDatasetSmartName,
                outputDatasetName:outputDatasetName,
                outputDatasetSettings: JSON.stringify(outputDatasetSettings)
            });
        },
        listRedeployableCluster: function(fullModelId) {
            return APIXHRService("POST", API_PATH + "analysis/cml/flow/list-redeployable-cluster", {fullModelId: fullModelId });
        },
        redeployCluster: function(fullModelId, recipeName) {
            return APIXHRService("POST", API_PATH + "analysis/cml/flow/redeploy-cluster", {
                fullModelId: fullModelId, recipeName: recipeName
            });
        },
        createNotebook: function(fullModelId, notebookTitle) {
            return APIXHRService("POST", API_PATH + "analysis/cml/create-notebook", {
                fullModelId: fullModelId, notebookTitle: notebookTitle
            })
        },
        copyAlgorithmSettings: function(projectKeyFrom, analysisIdFrom, mlTaskIdFrom, projectKeyTo, analysisIdTo, mlTaskIdTo) {
            return APIXHRService("POST", API_PATH + "analysis/cml/copy-algorithm-settings", {
               projectKeyFrom: projectKeyFrom, analysisIdFrom: analysisIdFrom, mlTaskIdFrom: mlTaskIdFrom,
               projectKeyTo: projectKeyTo, analysisIdTo: analysisIdTo, mlTaskIdTo: mlTaskIdTo
           });
        },
        changeGuessPolicy: function(projectKey, analysisId, mlTaskId, policyId) {
            return APIXHRService("POST", API_PATH + "analysis/cml/change-guess-policy", {
                projectKey: projectKey, analysisId: analysisId, mlTaskId: mlTaskId,
                newPolicyId: policyId
            });
        },
    },
    /* Predicted data (common to ML tasks) */
    predicted: {
        predictedRefreshTable: function(fullModelId, displayScript, allowCache, filters) {
            return APIXHRService("POST", API_PATH + "analysis/predicted/refresh-table", {
                fullModelId: fullModelId,
                displayScript: JSON.stringify(displayScript),
                allowCache: allowCache,
                filters: JSON.stringify(filters)
            })
        },
        predictedGetTableChunk: function(fullModelId, displayScript, firstRow, nbRows, firstCol, nbCols, filters) {
            return APIXHRService("POST", API_PATH + "analysis/predicted/get-table-chunk", {
                fullModelId: fullModelId,
                displayScript: JSON.stringify(displayScript),
                filters: JSON.stringify(filters),
                firstRow: firstRow,
                nbRows: nbRows,
                firstCol: firstCol,
                nbCols: nbCols
            })
        },
        chartsGetColumnsSummary: function(fullModelId) {
            return APIXHRService("GET", API_PATH + "analysis/predicted/charts-get-columns-summary", {
                fullModelId: fullModelId
            });
        },
        chartsGetPivotResponse: function(fullModelId, request, requestedSampleId) {
            return APIXHRService("POST", API_PATH + "analysis/predicted/charts-get-pivot-response", {
                fullModelId: fullModelId,
                request: JSON.stringify(request),
                requestedSampleId: requestedSampleId
            });
        },
        detailedColumnAnalysis: function(fullModelId, data, column, alphanumMaxResults) {
            return APIXHRService("POST", API_PATH + "analysis/predicted/detailed-column-analysis/", {
            	fullModelId: fullModelId,
                data: JSON.stringify(data),
                column: column,
                alphanumMaxResults: alphanumMaxResults
            });
        }
    }
},
ml: {
    prediction: {
        getModelDetails: function(fullModelId) {
            return APIXHRService("GET", API_PATH + "ml/prediction/get-model-details", {
                fullModelId: fullModelId
            });
        },
        getTreeSummary: function(fullModelId) {
            return APIXHRService("GET", API_PATH + "ml/prediction/get-tree-summary", {
                 fullModelId: fullModelId
             });
        },
        getEnsembleSummary: function(fullModelId) {
            return APIXHRService("GET", API_PATH + "ml/prediction/get-ensemble-summary", {
                 fullModelId: fullModelId
             });
        },
        getCoefPath: function(fullModelId) {
            return APIXHRService("GET", API_PATH + "ml/prediction/get-coef-path", {
                 fullModelId: fullModelId
             });
        },
        getPreparedInputSchema: function(recipe) {
            return APIXHRService("POST", API_PATH + "ml/prediction/get-prepared-input-schema", {
                 recipeData: JSON.stringify(recipe)
             });
        },
        getSql: function(recipe) {
            return APIXHRService("GET", API_PATH + "ml/prediction/export-sql?recipeData="+ JSON.stringify(recipe));
        },
        getScoringModelDownloadURL: function(format, exportId) {
            format = format.toLowerCase();
            return `${API_PATH}ml/prediction/get-export?format=${format}&exportId=${encodeURIComponent(exportId)}`;
        },
        createScoringModelFile: function(format, fullModelId, params) {
            fullModelId = encodeURIComponent(fullModelId);
            format = format.toLowerCase();
            if (!params) {
                params = "";
            }
            switch (format) {
                case "jar-fat":
                    format = "jar";
                    params += "&includeLibs=true";
                    break;
                case "jar-thin":
                    format = "jar";
                    params += "&includeLibs=false";
                    break;
            }
            const url = `${API_PATH}ml/prediction/export-${format}?fullModelId=${fullModelId}${params}`;
            return APIXHRService("GET", url);
        },
        docGenCustom: function(file, fullModelId, callback) {
            return uploadFileRequest("ml/prediction/render-custom", function(formdata) {
                formdata.append("file", file);
                formdata.append("fullModelId", fullModelId);
            }, callback);
        },
        docGenDefault: function(fullModelId) {
            return APIXHRService("POST", API_PATH + "ml/prediction/render-default" , {
                fullModelId: fullModelId
            });
        },
        getPreDocGenInfoMessages: function(fullModelId) {
            return APIXHRService("POST", API_PATH + "ml/prediction/get-pre-docgen-info-messages" , {
                fullModelId: fullModelId
            });
        },
        exportToSnowflakeFunction: function(connectionName, fullModelId, functionName) {
            return APIXHRService("POST", API_PATH + "ml/prediction/export-to-snowflake-function", {
                connectionName, fullModelId, functionName
            });
        },
        subpopulationComputationStart: function(fullModelId, features, computationParams) {
            return APIXHRService("POST", API_PATH + "ml/prediction/subpopulation-computation-start" , {
                fullModelId: fullModelId,
                features: JSON.stringify(features),
                computationParams: JSON.stringify(computationParams),
            });
        },
        pdpComputationStart: function(fullModelId, features, computationParams) {
            return APIXHRService("POST", API_PATH + "ml/prediction/pdp-computation-start" , {
                fullModelId: fullModelId,
                features: JSON.stringify(features),
                computationParams: JSON.stringify(computationParams),
            });
        },
        individualExplanationsComputationStart: function(fullModelId, computationParams) {
            return APIXHRService("POST", API_PATH + "ml/prediction/individual-explanations-computation-start" , {
                fullModelId: fullModelId,
                computationParams: JSON.stringify(computationParams),
            });
        },
        getIndividualExplanations: function(fullModelId) {
            return APIXHRService("GET", API_PATH + "ml/prediction/get-individual-explanations" , {
                fullModelId: fullModelId,
            });
        },
        getSubpopulation: function(fullModelId, features) {
            return APIXHRService("POST", API_PATH + "ml/prediction/get-subpopulation" , {
                fullModelId: fullModelId,
                features: JSON.stringify(features)
            });
        },
        getSubpopulationsInfo: function(fullModelId) {
            return APIXHRService("GET", API_PATH + "ml/prediction/get-subpopulations-info", {
                fullModelId: fullModelId
            });
        },
        getPartitionsPerf: function(fullModelId) {
            return APIXHRService("GET", API_PATH + "ml/prediction/get-partitions-perf" , {
                fullModelId: fullModelId
            });
        },
        getCollectorData: function(fullModelId) {
            return APIXHRService("GET", API_PATH + "ml/prediction/get-collector-data" , {
                fullModelId: fullModelId
            });
        },
        getColumnImportance: function(fullModelId) {
            return APIXHRService("GET", API_PATH + "ml/prediction/get-column-importance" , {
                fullModelId: fullModelId
            });
        },
        getSplitDesc: function(fullModelId) {
            return APIXHRService("GET", API_PATH + "ml/prediction/get-split-desc" , {
                fullModelId: fullModelId
            });
        },
        getInputDatasetSchema: function(fullModelId) {
            return APIXHRService("GET", API_PATH + "ml/prediction/get-input-dataset-schema" , { fullModelId });
        },
        getPreparationScript: function(fullModelId) {
            return APIXHRService("GET", API_PATH + "ml/prediction/get-preparation-script" , {
                fullModelId: fullModelId
            });
        },


    },
    clustering: {
        getModelDetails: function(fullModelId) {
            return APIXHRService("GET", API_PATH + "ml/clustering/get-model-details", {
                fullModelId: fullModelId
            });
        },
        getScatterPlot: function(projectKey, fullModelId, variable1, variable2) {
            return APIXHRService("GET", API_PATH + "ml/clustering/get-scatter-plot" , {
                projectKey: projectKey, fullModelId: fullModelId,
                variable1: variable1, variable2: variable2
            });
        },
        getClusterHierarchy: function(fullModelId) {
            return APIXHRService("GET", API_PATH + "ml/clustering/get-cluster-hierarchy" , {
                fullModelId: fullModelId
            });
        },
        getAnomalies: function(fullModelId) {
            return APIXHRService("GET", API_PATH + "ml/clustering/get-anomalies" , {
                fullModelId: fullModelId
            });
        },
        getPreparedInputSchema: function(recipe) {
            return APIXHRService("POST", API_PATH + "ml/clustering/get-prepared-input-schema", {
                 recipeData: JSON.stringify(recipe)
             });
        },
        rescore: function(fullModelId) {
            return APIXHRService("POST", API_PATH + "ml/clustering/rescore" , {
                fullModelId: fullModelId
            });
        }
    },
    saveModelUserMeta: function(fullModelId, data) {
        return APIXHRService("POST", API_PATH + "ml/save-model-user-meta", {
            fullModelId: fullModelId, data: JSON.stringify(data)
        });
    },
    deleteModels: function(list) {
        return APIXHRService("POST", API_PATH + "ml/delete-models", {
            list: JSON.stringify(list)
        });
    }
},
interactiveModel: {
    startBackend: function(fullModelId) {
        return APIXHRService("POST", API_PATH + "ml/interactive-model/start-backend" , {
            fullModelId: fullModelId
        });
    },
    backendStatus: function(fullModelId) {
        return APIXHRService("GET", API_PATH + "ml/interactive-model/backend-status" , {
            fullModelId: fullModelId
        }, 'nospinner');
    },
    computeScore: function(fullModelId, params, applyPreparationScript) {
        const computationParams = {
            fullModelId: fullModelId,
            params: JSON.stringify(params),
        };
        if (applyPreparationScript !== null) {
            computationParams.applyPreparationScript = applyPreparationScript;
        }
        return APIXHRService("POST", API_PATH + "ml/interactive-model/compute-score" , computationParams);
    },

    computeExplanations: function(fullModelId, params, method, nExplanations, applyPreparationScript) {
        const computationParams = {
            fullModelId: fullModelId,
            params: JSON.stringify(params),
            method,
            nExplanations,
        };
        if (applyPreparationScript !== null) {
            computationParams.applyPreparationScript = applyPreparationScript;
        }
        return APIXHRService("POST", API_PATH + "ml/interactive-model/compute-explanations" , computationParams);
    }

},
savedmodels: {
    get: function(projectKey, smartId) {
        return APIXHRService("GET", API_PATH + "savedmodels/get", {projectKey: projectKey, smartId: smartId});
    },
    getSummary: function(projectKey, id) {
        return APIXHRService("GET", API_PATH + "savedmodels/get-summary", {projectKey: projectKey, id: id});
    },
    getFullInfo: function(projectKey, id) {
        return APIXHRService("GET", API_PATH + "savedmodels/get-full-info", {projectKey: projectKey, id: id});
    },
    list: function(projectKey) {
        return APIXHRService("GET", API_PATH + "savedmodels/list", {projectKey: projectKey});
    },
    listWithAccessible: function(projectKey) {
        return APIXHRService("GET", API_PATH + "savedmodels/list-with-accessible/", {projectKey: projectKey});
    },
    save: function(data, saveInfo) {
        return APIXHRService("POST", API_PATH + "savedmodels/save", {
            data: JSON.stringify(data),
            saveInfo: JSON.stringify(saveInfo || {})
        });
    },
    prediction: {
        getStatus: function(projectKey, savedModelId) {
            return APIXHRService("GET", API_PATH + "savedmodels/prediction/get-status", {projectKey: projectKey, savedModelId: savedModelId });
        },
        deployScoring: function(projectKey, options) {
            return APIXHRService("POST", API_PATH + "savedmodels/prediction/deploy-scoring", {
                projectKey: projectKey, options: JSON.stringify(options)
            });
        },
        deployEvaluation: function(projectKey, options) {
            return APIXHRService("POST", API_PATH + "savedmodels/prediction/deploy-evaluation",{
                    projectKey:projectKey, options : JSON.stringify(options)
            });
        },
        deployStandaloneEvaluation: function(projectKey, options) {
            return APIXHRService("POST", API_PATH + "savedmodels/prediction/deploy-standalone-evaluation",{
                    projectKey:projectKey, options : JSON.stringify(options)
            });
        },
        setActive: function(projectKey, savedModelId, newActiveVersion) {
            return APIXHRService("POST", API_PATH + "savedmodels/prediction/set-active", {
                projectKey: projectKey,
                savedModelId: savedModelId,
                newActiveVersion: newActiveVersion
            });
        },
        deleteVersions: function(projectKey, savedModelId, versions) {
            return APIXHRService("POST", API_PATH + "savedmodels/prediction/delete-versions", {
                projectKey: projectKey,
                savedModelId: savedModelId,
                versions: JSON.stringify(versions)
            });
        }
    },
    clustering: {
        getStatus: function(projectKey, savedModelId) {
            return APIXHRService("GET", API_PATH + "savedmodels/clustering/get-status", {projectKey: projectKey, savedModelId: savedModelId});
        },
        deployScoring: function(projectKey, savedModelSmartName, inputDatasetSmartName, createOutput, outputDatasetSmartName, outputDatasetSettings) {
            return APIXHRService("POST", API_PATH + "savedmodels/clustering/deploy-scoring", {
                projectKey: projectKey,
                savedModelSmartName: savedModelSmartName,
                inputDatasetSmartName: inputDatasetSmartName,
                createOutput: createOutput,
                outputDatasetSmartName: outputDatasetSmartName,
                outputDatasetSettings: JSON.stringify(outputDatasetSettings)
            });
        },
        setActive: function(projectKey, savedModelId, newActiveVersion) {
            return APIXHRService("POST", API_PATH + "savedmodels/clustering/set-active", {
                projectKey: projectKey, savedModelId: savedModelId,
                newActiveVersion: newActiveVersion
            });
        },
        deleteVersions: function(projectKey, savedModelId, versions) {
            return APIXHRService("POST", API_PATH + "savedmodels/clustering/delete-versions", {
                projectKey: projectKey,
                savedModelId: savedModelId,
                versions: JSON.stringify(versions)
            });
        }
    },
    getPreparedMetricHistory: function(projectKey, modelId, metric, metricId) {
        return APIXHRService("GET", API_PATH + "savedmodels/get-prepared-metric-history", {
            projectKey: projectKey,
            modelId: modelId,
            data: JSON.stringify(metric),
            metricId: metricId
        });
    },
    getPreparedMetricHistories: function(projectKey, modelId, displayedState) {
        return APIXHRService("POST", API_PATH + "savedmodels/get-prepared-metric-histories", {
            projectKey: projectKey,
            modelId: modelId,
            data: JSON.stringify(displayedState || {})
        });
    },
    listComputedMetrics: function(projectKey, modelId) {
        return APIXHRService("GET", API_PATH + "savedmodels/list-computed-metrics", {
            projectKey: projectKey,
            modelId: modelId
        });
    },
    createMetricsDataset: function(projectKey, modelId, view, partition, filter) {
        return APIXHRService("GET", API_PATH + "datasets/create-metrics-dataset", {
            projectKey: projectKey,
            objectId: modelId,
            view: view,
            partition: partition,
            filter: filter
        });
    },
    getPreparedMetricPartitions: function(projectKey, modelId, displayedState) {
        return APIXHRService("POST", API_PATH + "savedmodels/get-prepared-metric-partitions", {
            projectKey: projectKey,
            modelId: modelId,
            data: JSON.stringify(displayedState || {})
        });
    },
    runChecks: function(projectKey, modelId) {
        return APIXHRService("GET", API_PATH + "savedmodels/run-checks", {
            projectKey: projectKey,
            modelId: modelId
        });
    },
    runCheck: function(projectKey, modelId, metricsChecks) {
        return APIXHRService("POST", API_PATH + "savedmodels/run-check", {
            projectKey: projectKey,
            modelId: modelId,
            data: JSON.stringify(metricsChecks)
        });
    },
    getCheckHistories: function(projectKey, modelId, displayedState) {
        return APIXHRService("POST", API_PATH + "savedmodels/get-prepared-check-histories", {
            projectKey: projectKey,
            modelId: modelId,
            data: JSON.stringify(displayedState || {})
        });
    },
    listComputedChecks: function(projectKey, modelId) {
        return APIXHRService("GET", API_PATH + "savedmodels/list-computed-checks", {
            projectKey: projectKey,
            modelId: modelId
        });
    },
    getHint: function(projectKey, modelId, probe) {
        return APIXHRService("POST", API_PATH + "savedmodels/get-hint", {
            projectKey: projectKey,
            modelId: modelId,
            data: JSON.stringify(probe)
        });
    },
    clearMetrics: function(projectKey, modelId, partition) {
        return APIXHRService("GET", API_PATH + "savedmodels/clear-metrics", {
            projectKey: projectKey,
            modelId: modelId,
            partition: partition
        });
    },
    getModelDocumentationExportURL: function(exportId) {
        return API_PATH + "savedmodels/model-documentation-export?exportId=" + encodeURIComponent(exportId);
    },
    guessTrainDeploy: function(projectKey, modelId) {
        return APIXHRService("GET", API_PATH + "savedmodels/guess-train-deploy", {
            projectKey: projectKey,
            modelId: modelId
        });
    }
},
modelevaluationstores: {
    get: function(projectKey, smartId) {
        return APIXHRService("GET", API_PATH + "modelevaluationstores/get", {projectKey: projectKey, smartId: smartId});
    },
    getSummary: function(projectKey, id) {
        return APIXHRService("GET", API_PATH + "modelevaluationstores/get-summary", {projectKey: projectKey, id: id});
    },
    getFullInfo: function(projectKey, id) {
        return APIXHRService("GET", API_PATH + "modelevaluationstores/get-full-info", {projectKey: projectKey, smartId: id});
    },
    list: function(projectKey) {
        return APIXHRService("GET", API_PATH + "modelevaluationstores/list", {projectKey: projectKey});
    },
    listEvaluations: function(projectKey, id) {
        return APIXHRService("GET", API_PATH + "modelevaluationstores/list-evaluations", {projectKey: projectKey, smartId: id});
    },
    deleteEvaluations: function(projectKey, id, evaluations) {
        return APIXHRService("POST", API_PATH + "modelevaluationstores/delete-evaluations", {projectKey: projectKey, smartId: id, evaluations:JSON.stringify(evaluations)});
    },
    getEvaluation: function(projectKey, id, runId) {
        return APIXHRService("GET", API_PATH + "modelevaluationstores/get-evaluation", {projectKey: projectKey, smartId: id, runId: runId});
    },
    listWithAccessible: function(projectKey) {
        return APIXHRService("GET", API_PATH + "modelevaluationstores/list-with-accessible/", {projectKey: projectKey});
    },
    save: function(data, saveInfo) {
        return APIXHRService("POST", API_PATH + "modelevaluationstores/save", {
            data: JSON.stringify(data),
            saveInfo: JSON.stringify(saveInfo || {})
        });
    }
},
modelevaluations: {
    get: function(fme) {
        return APIXHRService("GET", API_PATH + "modelevaluations/get", {
            fme: fme
        });
    },
    getFMIEvaluationInfo: function(contextProjectKey, fmi) {
        return APIXHRService("GET", API_PATH + "modelevaluations/get-fmi-evaluation-info", {
            fmi: fmi,
            contextProjectKey: contextProjectKey
        });
    },
    saveEvaluationUserMeta: function(fme, data) {
        return APIXHRService("POST", API_PATH + "modelevaluations/save-evaluation-user-meta", {
            fme: fme, data: JSON.stringify(data)
        });
    },
    saveEvaluationLabels: function(fme, labels) {
        return APIXHRService("POST", API_PATH + "modelevaluations/save-evaluation-labels", {
            fme: fme, labels: JSON.stringify(labels)
        });
    },
    listCompatibleReferencesForDrift: function(projectKey, currentId, matchLabels) {
        return APIXHRService("GET", API_PATH + "modelevaluations/list-compatible-references-for-drift", {
            projectKey, currentId, matchLabels
        });
    },
    getSubpopulationsInfo: function(fme) {
        return APIXHRService("GET", API_PATH + "modelevaluations/get-subpopulations-info", {
            fme: fme
        });
    },
    subpopulationComputationStart: function(fme, features, computationParams) {
        return APIXHRService("POST", API_PATH + "modelevaluations/subpopulation-computation-start" , {
            fme: fme,
            features: JSON.stringify(features),
            computationParams: JSON.stringify(computationParams),
        });
    },
    getSubpopulation: function(fme, features) {
        return APIXHRService("POST", API_PATH + "modelevaluations/get-subpopulation" , {
            fme: fme,
            features: JSON.stringify(features)
        });
    },
    pdpComputationStart: function(fme, features, computationParams) {
        return APIXHRService("POST", API_PATH + "modelevaluations/pdp-computation-start" , {
            fme: fme,
            features: JSON.stringify(features),
            computationParams: JSON.stringify(computationParams),
        });
    },
    individualExplanationsComputationStart: function(fme, computationParams) {
        return APIXHRService("POST", API_PATH + "modelevaluations/individual-explanations-computation-start" , {
            fme: fme,
            computationParams: JSON.stringify(computationParams),
        });
    },
    getIndividualExplanations: function(fme) {
        return APIXHRService("GET", API_PATH + "modelevaluations/get-individual-explanations" , {
            fme: fme
        });
    },
    computeDataDrift: function(projectKey, referenceId, currentId, params) {
        return APIXHRService("POST", API_PATH + "modelevaluations/compute-data-drift" , {
            referenceId: referenceId,
            currentId: currentId,
            projectKey: projectKey,
            params: JSON.stringify(params)
        });
    }
},
home: {
    projectSearch: function(projectKey, query, taggableType, serializedRecentKeys) {
        return APIXHRService("GET", API_PATH + "home/project-search", {
            projectKey: projectKey,
            query: query,
            taggableType: taggableType,
            serializedRecentKeys: serializedRecentKeys
        }, "nospinner");
    }
},
images: {
    uploadImage: function(projectKey, type, id, dataUrl) {
        return uploadFileRequest("image/set-image", function(formdata) {
            formdata.append("projectKey", projectKey);
            formdata.append("type", type);
            formdata.append("id", id);
            formdata.append("dataUrl", dataUrl);
        }, null);
    },
    removeImage: function(projectKey, type, id) {
        return APIXHRService("GET", API_PATH + "image/remove-image", {projectKey: projectKey, type: type, id: id}, "nospinner");
    }
},
notifications: {
    count: function() {
        return APIXHRService("GET", API_PATH + "notifications/count", {}, "nospinner");
    },
    get: function() {
        return APIXHRService("GET", API_PATH + "notifications/get", {});
    },
    ack: function(timestamp) {
        return APIXHRService("POST", API_PATH + "notifications/acknowledge", {timestamp: timestamp}, "nospinner" );
    }
},
timelines: {
    getForObject: function(projectKey, objectType, objectId, from, limit) {
        return APIXHRService("GET", API_PATH + "timelines/get-for-object", {
            projectKey: projectKey,
            objectType: objectType,
            objectId: objectId,
            from: from,
            limit: limit
        });
    },
    getForProject: function(projectKey, from, limit) {
        return APIXHRService("GET", API_PATH + "timelines/get-for-project", {projectKey: projectKey, from: from, limit: limit});
    }
},
discussions: {
    getCounts: function(projectKey, objectType, objectId) {
        return APIXHRService("GET", API_PATH + "discussions/get-discussion-counts", {
            projectKey: projectKey,
            objectType: objectType,
            objectId: objectId
        }, "nospinner");
    },
    getForObject: function(projectKey, objectType, objectId) {
        return APIXHRService("GET", API_PATH + "discussions/get-for-object", {
            projectKey: projectKey,
            objectType: objectType,
            objectId: objectId
        });
    },
    create: function(projectKey, objectType, objectId, topic, reply) {
        return APIXHRService("POST", API_PATH + "discussions/create", {
            projectKey: projectKey,
            objectType: objectType,
            objectId: objectId,
            topic: topic,
            reply: reply
        });
    },
    save: function(projectKey, objectType, objectId, discussionId, topic) {
        return APIXHRService("POST", API_PATH + "discussions/save", {
            projectKey: projectKey,
            objectType: objectType,
            objectId: objectId,
            discussionId: discussionId,
            topic: topic
        });
    },
    reply: function(projectKey, objectType, objectId, discussionId, content, replyId) {
        return APIXHRService("POST", API_PATH + "discussions/reply", {
            projectKey: projectKey,
            objectType: objectType,
            objectId: objectId,
            discussionId: discussionId,
            replyId: replyId,
            content: content
        });
    },
    ack: function(projectKey, objectType, objectId, discussionId) {
        return APIXHRService("POST", API_PATH + "discussions/ack", {
            projectKey: projectKey,
            objectType: objectType,
            objectId: objectId,
            discussionId: discussionId
        });
    },
    close: function(projectKey, objectType, objectId, discussionId, closed) {
        return APIXHRService("POST", API_PATH + "discussions/close", {
            projectKey: projectKey,
            objectType: objectType,
            objectId: objectId,
            discussionId: discussionId,
            closed: closed
        });
    },
    delete: function(projectKey, objectType, objectId, discussionId) {
        return APIXHRService("POST", API_PATH + "discussions/delete-discussion", {
            projectKey: projectKey,
            objectType: objectType,
            objectId: objectId,
            discussionId: discussionId
        });
    },
    inbox: {
        search: function (query, facets) {
            return APIXHRService("POST", API_PATH + "inbox/search", {
                query: query,
                facets: JSON.stringify(facets)
            });
        },
    }
},
interests: {
    getForObject: function(user, objectType, projectKey, objectId) {
        return APIXHRService("GET", API_PATH + "interests/get-interest-for-object", {
            user: user,
            objectType: objectType,
            projectKey: projectKey,
            objectId: objectId
        });
    },
    getUserInterests: function(user, offset, maxItems, filters, starsOnly, nospinner) {
        return APIXHRService("GET", API_PATH + "interests/get-user-interests", {
            user: user,
            offset: offset,
            maxItems: maxItems,
            filters: filters,
            starsOnly: starsOnly
        }, nospinner ? "nospinner" : undefined);
    },
    watch: function(items, watch) {
        return APIXHRService("POST", API_PATH + "interests/watch", {
            items: JSON.stringify(items),
            watch: watch
        });
    },
    star: function(items, star) {
        return APIXHRService("POST", API_PATH + "interests/star", {
            items: JSON.stringify(items),
            star: star
        });
    },
    listWatchingUsers: function(objectType, projectKey, objectId) {
        return APIXHRService("GET", API_PATH + "interests/list-watching-users", {
            objectType: objectType,
            projectKey: projectKey,
            objectId: objectId
        });
    },
    listUsersWithStar: function(objectType, projectKey, objectId) {
        return APIXHRService("GET", API_PATH + "interests/list-users-with-star", {
            objectType: objectType,
            projectKey: projectKey,
            objectId: objectId
        });
    }
},
magic: function(filter) {
    return APIXHRService("GET", API_PATH + "home/magic", {filter: filter});
},
getConfiguration: function() {
    return APIXHRService("GET", API_PATH + "get-configuration", {});
},
getHomeArticles: function(nospinner) {
    return APIXHRService("GET", API_PATH + "get-home-articles", undefined, nospinner ? "nospinner" : undefined);
},
running: {
    listPersonal: function() {
        return APIXHRService("GET", API_PATH + "running/list-personal", {});
    },
    listAll: function() {
        return APIXHRService("GET", API_PATH + "running/list-all");
    }
},
futures: {
    getUpdate: function(futureId) {
        return APIXHRService("GET", API_PATH + "futures/get-update", {futureId: futureId}, "nospinner");
    },
    peekUpdate: function(futureId) {
        return APIXHRService("GET", API_PATH + "futures/peek-update", {futureId: futureId}, "nospinner");
    },
    abort: function(futureId) {
        return APIXHRService("POST", API_PATH + "futures/abort", {futureId: futureId});
    },
    list: function() {
        return APIXHRService("GET", API_PATH + "futures/list");
    },
    listAll: function() {
        return APIXHRService("GET", API_PATH + "futures/list-all");
    },
    listScenarios: function() {
        return APIXHRService("GET", API_PATH + "futures/list-scenarios");
    },
    listAllScenarios: function() {
        return APIXHRService("GET", API_PATH + "futures/list-all-scenarios");
    }
},
login: function(login, password) {
    return APIXHRService("POST", API_PATH + "login", {
        login: login, password: password
    });
},
noLoginLogin: function() {
    return APIXHRService("POST", API_PATH + "no-login-login");
},
getSAMLRedirectURL : function(){
    return APIXHRService("POST", API_PATH + "get-saml-redirect-url");
},

logout: function() {
    return APIXHRService("POST", API_PATH + "logout");
},
apikeys: {
    setAuthorizedDatasets: function(apiKey, datasets) {
        return APIXHRService("POST", API_PATH + "apikeys/set-authorized-datasets", {apiKey: apiKey, datasets: JSON.stringify(datasets)});
    },
    getAuthorizedDatasets: function(apiKey) {
        return APIXHRService("GET", API_PATH + "apikeys/get-authorized-datasets", {apiKey: apiKey});
    }
},
security: {
    listUsers: function(projectKey) {
        return APIXHRService("GET", API_PATH + "security/list-users", {projectKey});
    },
    listConnectedUsers: function(projectKey) {
        return APIXHRService("GET", API_PATH + "security/list-connected-users", {projectKey});
    },
    listGroups: function(localOnly) {
        return APIXHRService("GET", API_PATH + "security/list-groups", {localOnly: localOnly});
    },
    listGroupsFull: function() {
        return APIXHRService("GET", API_PATH + "security/list-groups-full");
    },
    updateGroup: function(groupData) {
        return APIXHRService("POST", API_PATH + "security/update-group", {groupData: JSON.stringify(groupData)});
    },
    prepareUpdateGroup: function(groupData) {
        return APIXHRService("POST", API_PATH + "security/prepare-update-group", {groupData: JSON.stringify(groupData)});
    },
    createGroup: function(groupData) {
        return APIXHRService("POST", API_PATH + "security/create-group", {groupData: JSON.stringify(groupData)});
    },
    getGroup: function(groupName) {
        return APIXHRService("GET", API_PATH + "security/get-group", {groupName: groupName});
    },
    deleteGroup: function(groupName) {
        return APIXHRService("POST", API_PATH + "security/delete-group", {groupName: groupName});
    },
    prepareDeleteGroup: function(groupName) {
        return APIXHRService("POST", API_PATH + "security/prepare-delete-group", {groupName: groupName});
    },
    getAuthorizationMatrix: function() {
        return APIXHRService("GET", API_PATH + "security/get-authorization-matrix");
    },
    getAuditBuffer: function(includeAllCalls) {
        return APIXHRService("GET", API_PATH + "security/get-audit-buffer", {
            includeAllCalls: includeAllCalls
        });
    }
},
zones : {
    getFullInfo: function(projectKey, zoneId) {
        return APIXHRService("GET", API_PATH + "zones/get-full-info", { projectKey: projectKey, zoneId: zoneId });
    },
    get: function(projectKey, zoneId) {
        return APIXHRService("GET", API_PATH + "zones/get", { projectKey: projectKey, zoneId: zoneId });
    }
},
dashboards : {
    save: function(dashboardData, commitMessage) {
        return APIXHRService("POST", API_PATH + "dashboards/save", { dashboardData: JSON.stringify(dashboardData), commitMessage: commitMessage });
    },
    list: function(projectKey) {
        return APIXHRService("GET", API_PATH + "dashboards/list", { projectKey: projectKey });
    },
    listEditable: function(projectKey) {
    	return APIXHRService("GET", API_PATH + "dashboards/list-editable", {projectKey: projectKey});
    },
    listHeads: function(projectKey, tagFilter) {
        return APIXHRService("GET", API_PATH + "dashboards/list-heads", {projectKey: projectKey, tagFilter: tagFilter});
    },
    listSummaries: function(projectKey) {
        return APIXHRService("GET", API_PATH + "dashboards/list-summaries", {projectKey: projectKey});
    },
    get: function(projectKey, dashboardId) {
        return APIXHRService("GET", API_PATH + "dashboards/get", { projectKey: projectKey, dashboardId: dashboardId });
    },
    getFullInfo: function(projectKey, dashboardId) {
        return APIXHRService("GET", API_PATH + "dashboards/get-full-info", { projectKey: projectKey, dashboardId: dashboardId });
    },
    getSummary: function(projectKey, dashboardId) {
        return APIXHRService("GET", API_PATH + "dashboards/get-summary", { projectKey: projectKey, dashboardId: dashboardId });
    },
    copy: function(projectKey, dashboardId, name, deepCopy) {
        return APIXHRService("POST", API_PATH + "dashboards/copy", { projectKey: projectKey, dashboardId: dashboardId, name: name, deepCopy: deepCopy });
    },
    getEnrichedPage: function(projectKey, dashboardId, pageIdx) {
        return APIXHRService("GET", API_PATH + "dashboards/get-enriched-page", { projectKey: projectKey, dashboardId: dashboardId, pageIdx: pageIdx });
    },
    copyPage: function(projectKey, sourceDashboardId, page, targetedDashboardId, copyPageName, pointerMode) {
        return APIXHRService("POST", API_PATH + "dashboards/copy-page", {projectKey: projectKey, sourceDashboardId: sourceDashboardId, pageData: JSON.stringify(page), targetedDashboardId: targetedDashboardId, copyPageName: copyPageName, pointerMode: pointerMode});
    },
    makeListed: function(projectKey, dashboardIds, listed) {
    	return APIXHRService("POST", API_PATH + "dashboards/make-listed", { projectKey: projectKey, dashboardIds: JSON.stringify(dashboardIds), listed: listed });
    },
    getMissingReaderAuthorizations: function(projectKey, dashboardIds) {
        return APIXHRService("GET", API_PATH + "dashboards/get-missing-reader-authorizations", { projectKey: projectKey, dashboardIds: JSON.stringify(dashboardIds) });
    },
    export: function(projectKey, exportFormat, dashboards) {
        return APIXHRService("POST", API_PATH + "dashboards/export", { projectKey: projectKey, exportFormat: JSON.stringify(exportFormat), dashboards: JSON.stringify(dashboards) });
    },
    getExportURL: function(projectKey, exportId) {
        return API_PATH + "dashboards/download-export?"
        + "projectKey=" + encodeURIComponent(projectKey)
        + "&exportId=" + encodeURIComponent(exportId);
    },
    multiPin: function(projectKey, insightId, tileData, pinningOrdersData, pointerMode) {
    	return APIXHRService("POST", API_PATH + "dashboards/multi-pin", {
    	    projectKey: projectKey,
            insightId: insightId,
            tileData: JSON.stringify(tileData),
            pinningOrdersData: JSON.stringify(pinningOrdersData),
            pointerMode: pointerMode
    	});
    },
    insights: {
        save: function(insightData, commitMessage, payload) {
            return APIXHRService("POST", API_PATH + "dashboards/insights/save", { insightData: JSON.stringify(insightData), commitMessage: commitMessage, payload: payload });
        },
        createAndPin: function(projectKey, insightData, tileData, pinningOrdersData, payloads) {
            return APIXHRService("POST", API_PATH + "dashboards/insights/create-and-pin",
            {
                projectKey: projectKey,
                insightData: JSON.stringify(insightData),
                tileData: JSON.stringify(tileData),
                pinningOrdersData: JSON.stringify(pinningOrdersData),
                payloadsData: payloads?JSON.stringify(payloads):null
            });
        },
        list: function(projectKey) {
            return APIXHRService("GET", API_PATH + "dashboards/insights/list", { projectKey: projectKey });
        },
        listWithAccessState: function(projectKey) {
            return APIXHRService("GET", API_PATH + "dashboards/insights/list-with-access-state", { projectKey: projectKey });
        },
        listHeads: function(projectKey, tagFilter) {
            return APIXHRService("GET", API_PATH + "dashboards/insights/list-heads", {projectKey: projectKey, tagFilter: tagFilter});
        },
        get: function(projectKey, insightId) {
            return APIXHRService("GET", API_PATH + "dashboards/insights/get", { projectKey: projectKey, insightId: insightId });
        },
        getFullInfo: function(projectKey, insightId) {
            return APIXHRService("GET", API_PATH + "dashboards/insights/get-full-info", { projectKey: projectKey, insightId: insightId });
        },
        getWithPayload: function(projectKey, insightId) {
            return APIXHRService("GET", API_PATH + "dashboards/insights/get-with-payload", { projectKey: projectKey, insightId: insightId });
        },
        copy: function(projectKey, insightIds, names, dashboardId) {
            var requestParams = { projectKey: projectKey, insightIds: JSON.stringify(insightIds), names: JSON.stringify(names)};
            if (dashboardId) {
                requestParams.dashboardId = dashboardId
            }
            return APIXHRService("POST", API_PATH + "dashboards/insights/copy", requestParams);
        },
        makeListed: function(projectKey, insightIds, listed) {
        	return APIXHRService("POST", API_PATH + "dashboards/insights/make-listed", { projectKey: projectKey, insightIds: JSON.stringify(insightIds), listed: listed });
        },
        getMissingReaderAuthorizations: function(projectKey, insightIds) {
            return APIXHRService("GET", API_PATH + "dashboards/insights/get-missing-reader-authorizations", { projectKey: projectKey, insightIds: JSON.stringify(insightIds) });
        }
    }
},

webapps : {
    listTypes: function() {
        return APIXHRService("GET", API_PATH + "webapps/list-types", {});
    },
    save: function(webAppData, commitMessage, forceRestartBackend) {
        return APIXHRService("POST", API_PATH + "webapps/save", {
            webAppData: JSON.stringify(webAppData),
            commitMessage: commitMessage,
            forceRestartBackend: forceRestartBackend
        });
    },
    saveMetadata: function(webAppData) {
        return APIXHRService("POST", API_PATH + "webapps/save-metadata", {
            webAppData: JSON.stringify(webAppData)
        });
    },
    create: function(projectKey, name, type, templateDesc, config) {
        return APIXHRService("POST", API_PATH + "webapps/create", { projectKey: projectKey, name: name, type: type, templateDesc: JSON.stringify(templateDesc), config: JSON.stringify(config)});
    },
    copy: function(projectKey, webAppId, newWebAppName) {
        return APIXHRService("POST", API_PATH + "webapps/copy", {
            projectKey: projectKey,
            webAppId: webAppId,
            newWebAppName: newWebAppName
        });
    },
    listTemplates: function(type, language) {
        return APIXHRService("GET", API_PATH + "webapps/list-templates", { type: type });
    },
    list: function(projectKey) {
        return APIXHRService("GET", API_PATH + "webapps/list", { projectKey: projectKey });
    },
    listHeads: function(projectKey, tagFilter) {
        return APIXHRService("GET", API_PATH + "webapps/list-heads", {projectKey: projectKey, tagFilter: tagFilter});
    },
    getFullInfo: function(projectKey, webAppId) {
        return APIXHRService("GET", API_PATH + "webapps/get-full-info", { projectKey: projectKey, webAppId: webAppId });
    },
    getSummary: function(projectKey, webAppId) {
        return APIXHRService("GET", API_PATH + "webapps/get-summary", { projectKey: projectKey, webAppId: webAppId });
    },
    getPreviewAndState: function(webApp) {
        return APIXHRService("GET", API_PATH + "webapps/get-preview-and-state", {projectKey: webApp.projectKey, webAppId: webApp.id});
    },
    getPreviewURL: function(webApp) {
        return API_PATH + "webapps/preview?projectKey=" + webApp.projectKey + "&webAppId=" + webApp.id;
    },
    getBackendUrl: function(projectKey, webAppId, apiKey) {
        return APIXHRService("GET", API_PATH + "webapps/get-backend-url", {projectKey: projectKey, webAppId: webAppId, apiKey: apiKey});
    },
    getBackendState: function(webApp) {
        return APIXHRService("GET", API_PATH + "webapps/get-backend-state", {projectKey: webApp.projectKey, webAppId: webApp.id});
    },
    restartBackend: function(webApp) {
        return APIXHRService("POST", API_PATH + "webapps/restart-backend", {projectKey: webApp.projectKey, webAppId: webApp.id});
    },
    stopBackend: function(webApp) {
        return APIXHRService("POST", API_PATH + "webapps/stop-backend", {projectKey: webApp.projectKey, webAppId: webApp.id});
    },
    startTensorboard: function(projectKey, analysisId, taskId, sessionId ) {
        return APIXHRService("POST", API_PATH + "webapps/webapp-start-tensorboard", {projectKey: projectKey, analysisId: analysisId, taskId:taskId, sessionId: sessionId});
    },
    setDatasetPrivileges: function(projectKey, apiKey, data) {
        return APIXHRService("POST", API_PATH + "webapps/set-apikey-dataset-privileges", {
            projectKey: projectKey, apiKey: apiKey,
            data: JSON.stringify(data)
        })
    },
    getDatasetPrivileges: function(projectKey, apiKey) {
        return APIXHRService("POST", API_PATH + "webapps/get-apikey-dataset-privileges", {projectKey: projectKey, apiKey: apiKey})
    },
    listAllBackendsStates : function(){
        return APIXHRService("GET", API_PATH + "webapps/list-all-backends-states")
    },
    convertToCustom: function(projectKey, webappId, targetPluginId, newWebAppType, targetPluginMode) {
        return APIXHRService("GET", API_PATH + "webapps/convert-to-custom", {projectKey, webappId, targetPluginId, newWebAppType, targetPluginMode});
    },
    getOrCreatePluginSkin: function(projectKey, objectType, objectId, webAppType, webAppConfig, webAppId) {
        return APIXHRService("POST", API_PATH + "webapps/get-or-create-plugin-skin", {
            projectKey: projectKey,
            objectType: objectType,
            objectId: objectId,
            webAppType: webAppType,
            webAppConfig: JSON.stringify(webAppConfig),
            webAppId: webAppId
        });
    },
    getBackendLogURL: function(projectKey, webAppId) {
        return API_PATH + "webapps/backend-log?"
                 + "projectKey=" + encodeURIComponent(projectKey)
                 + "&webAppId=" + encodeURIComponent(webAppId);
    },
},
reports : {
    create: function(projectKey, name, templateDesc) {
        return APIXHRService("POST", API_PATH + "reports/create", {
            projectKey: projectKey,
            name: name,
            templateDesc: JSON.stringify(templateDesc)
        });
    },
    list: function(projectKey) {
        return APIXHRService("GET", API_PATH + "reports/list", { projectKey: projectKey });
    },
    listHeads: function(projectKey, tagFilter) {
        return APIXHRService("GET", API_PATH + "reports/list-heads", {
            projectKey: projectKey,
            tagFilter: tagFilter
        });
    },
    listTemplates: function(type) {
        return APIXHRService("GET", API_PATH + "reports/list-templates", { type: type });
    },
    getSummary: function(projectKey, id) {
        return APIXHRService("GET", API_PATH + "reports/get-summary", {
            projectKey: projectKey,
            id: id
        });
    },
    getFullInfo: function(projectKey, id) {
        return APIXHRService("GET", API_PATH + "reports/get-full-info", {
            projectKey: projectKey,
            id: id
        });
    },
    save: function(report, script, commitMessage) {
        return APIXHRService("POST", API_PATH + "reports/save", {
            reportData: JSON.stringify(report),
            script: script,
            commitMessage: commitMessage
        });
    },
    saveMetadata: function(report) {
        return APIXHRService("POST", API_PATH + "reports/save-metadata", {
            reportData: JSON.stringify(report)
        });
    },
    copy: function(projectKey, id, newName) {
        return APIXHRService("POST", API_PATH + "reports/copy", {
            projectKey: projectKey,
            id: id,
            newName: newName
        });
    },
    build: function(projectKey, id) {
        return APIXHRService("POST", API_PATH + "reports/build", {
            projectKey: projectKey,
            id: id
        });
    },
    prepareDownload: function(projectKey, id, format) {
        return APIXHRService("POST", API_PATH + "reports/prepare-download", {
            projectKey: projectKey,
            id: id,
            format: format
        });
    },
    getDownloadReportURL: function(projectKey, id, format) {
        return API_PATH + "reports/download?projectKey=" + encodeURIComponent(projectKey) + "&id=" + encodeURIComponent(id) + "&format=" + encodeURIComponent(format) ;
    },
    snapshots: { // Should mostly stay in sync with jupyterNotebooks.export
        create: function(projectKey, reportId) {
            return APIXHRService("POST", API_PATH + "reports/snapshots/create", {
                projectKey: projectKey,
                reportId: reportId
            });
        },
        list: function(projectKey, reportId) {
            return APIXHRService("GET", API_PATH + "reports/snapshots/list", {
                projectKey: projectKey,
                reportId: reportId
            });
        },
        listForAll: function(projectKey) {
            return APIXHRService("GET", API_PATH + "reports/snapshots/list-for-all", {
                projectKey: projectKey
            });
        },
        get: function(projectKey, id, timestamp) {
            return APIXHRService("GET", API_PATH + "reports/snapshots/get", {
                projectKey: projectKey,
                id: id,
                timestamp: timestamp
            });
        }
    }
},
runnables: {
    manualRun: function(projectKey, runnableType, params, adminParams) {
        return APIXHRService("POST", API_PATH + "runnables/manual-run", {
            projectKey: projectKey, runnableType: runnableType, params: JSON.stringify(params), adminParams: JSON.stringify(adminParams)
        });
    },
    clusterRun: function(clusterId, runnableType, params, adminParams) {
        return APIXHRService("POST", API_PATH + "runnables/cluster-run", {
            clusterId: clusterId, runnableType: runnableType, params: JSON.stringify(params), adminParams: JSON.stringify(adminParams)
        });
    },
    projectCreationRun: function(runnableType, params, projectFolderId) {
        return APIXHRService("POST", API_PATH + "runnables/project-creation-run", {
            runnableType: runnableType, params: JSON.stringify(params), projectFolderId: projectFolderId
        });
    },
    insightRun: function(projectKey, insightId) {
        return APIXHRService("GET", API_PATH + "runnables/insight-run", {
            projectKey: projectKey, insightId: insightId
        });
    },
    loadKeptFile: function(projectKey, runnableType, item, clusterId) {
        return APIXHRService("GET", API_PATH + "runnables/load-kept-file", {
            projectKey: projectKey,
            clusterId: clusterId,
            runnableType: runnableType,
            item: JSON.stringify(item)
        });
    },
    getDownloadURL: function(projectKey, runnableType, item, clusterId) {
        return API_PATH + "runnables/download-kept-file?"
                 + "projectKey=" + encodeURIComponent(projectKey)
                 + "&clusterId=" + encodeURIComponent(clusterId)
                 + "&runnableType=" + encodeURIComponent(runnableType)
                 + "&item=" + encodeURIComponent(JSON.stringify(item));
    },
    listAccessible: function(projectKey) {
        return APIXHRService("GET", API_PATH + "runnables/list-accessible", {
            projectKey: projectKey
        });
    }
},
scenarios: {
    list: function(projectKey) {
        return APIXHRService("GET", API_PATH + "scenarios/list", {
            projectKey: projectKey
        });
    },
    listAccessible: function(projectKey) {
        return APIXHRService("GET", API_PATH + "scenarios/list-accessible");
    },
    listHeads: function(projectKey) {
        return APIXHRService("GET", API_PATH + "scenarios/list-heads", {
            projectKey: projectKey
        });
    },
    listAllHeads: function() {
        return APIXHRService("GET", API_PATH + "scenarios/list-all-heads");
    },
    listAllReporters: function() {
        return APIXHRService("GET", API_PATH + "scenarios/list-all-reporters");
    },
    get: function(projectKey, scenarioId) {
        return APIXHRService("GET", API_PATH + "scenarios/get", {
            projectKey: projectKey,
            scenarioId: scenarioId
        });
    },
    getSummary: function(projectKey, scenarioId) {
        return APIXHRService("GET", API_PATH + "scenarios/get-summary", {
            projectKey: projectKey,
            scenarioId: scenarioId
        });
    },
	getScript: function(projectKey, scenarioId) {
		return APIXHRService("GET", API_PATH + "scenarios/get-script", {
			projectKey: projectKey,
			scenarioId: scenarioId
		});
	},
	manualRun: function(projectKey, smartScenarioId, params, waitForStart, waitForCompletion) {
		return APIXHRService("POST", API_PATH + "scenarios/manual-run", {
			projectKey: projectKey,
			smartScenarioId: smartScenarioId,
            params: JSON.stringify(params),
            waitForStart: waitForStart,
            waitForCompletion: waitForCompletion
		});
	},
	create: function(projectKey, data) {
		return APIXHRService("GET", API_PATH + "scenarios/create", {
			projectKey: projectKey,
			data: JSON.stringify(data)
		});
	},
	duplicate: function(projectKeyFrom,projectKeyTo,idFrom,idTo, name) {
        return APIXHRService("POST", API_PATH + "scenarios/duplicate", {
            projectKeyFrom: projectKeyFrom,
            projectKeyTo: projectKeyTo,
            idFrom: idFrom,
            idTo: idTo,
            name: name
        });
    },
    save: function(projectKey, data, scriptData, saveInfo) {
        return APIXHRService("POST", API_PATH + "scenarios/save", {
            projectKey: projectKey,
            data: JSON.stringify(data),
            scriptData: scriptData,
            saveInfo: JSON.stringify(saveInfo)
        });
    },
    saveNoParams: function(projectKey, data, saveInfo) {
        return APIXHRService("POST", API_PATH + "scenarios/save-no-params", {
            projectKey: projectKey,
            data: JSON.stringify(data),
            saveInfo: JSON.stringify(saveInfo)
        });
    },
    saveReporterState: function(projectKey, scenarioId, data, saveInfo) {
        return APIXHRService("POST", API_PATH + "scenarios/save-reporter-state", {
            projectKey: projectKey,
            scenarioId: scenarioId,
            data: JSON.stringify(data),
            saveInfo: JSON.stringify(saveInfo)
        });
    },
    deleteReporter: function(projectKey, scenarioId, data, saveInfo) {
        return APIXHRService("POST", API_PATH + "scenarios/delete-reporter", {
            projectKey: projectKey,
            scenarioId: scenarioId,
            data: JSON.stringify(data),
            saveInfo: JSON.stringify(saveInfo)
        });
    },
	getLastScenarioRuns: function(projectKey, smartScenarioId, withFullScenario, limit) {
		return APIXHRService("GET", API_PATH + "scenarios/get-last-scenario-runs", {
			projectKey: projectKey,
			smartScenarioId: smartScenarioId,
            withFullScenario: withFullScenario,
            limit: limit
		});
	},
	getScenarioRunDetails: function(projectKey, scenarioId, runId) {
		return APIXHRService("GET", API_PATH + "scenarios/get-scenario-run-details", {
			projectKey: projectKey,
			scenarioId: scenarioId,
			runId: runId
		});
	},
	getLastTriggerRuns: function(projectKey, scenarioId) {
		return APIXHRService("GET", API_PATH + "scenarios/get-last-trigger-runs", {
			projectKey: projectKey,
			scenarioId: scenarioId
		});
	},
	getScenarioReport: function(projectKey, scenarioId, fromDate, toDate) {
		return APIXHRService("GET", API_PATH + "scenarios/get-scenario-report", {
			projectKey: projectKey,
			scenarioId: scenarioId,
            fromDate: fromDate,
            toDate: toDate
		});
	},
    getProjetReport: function(projectKey, fromDate, toDate) {
        return APIXHRService("GET", API_PATH + "scenarios/get-project-report", {
            projectKey: projectKey,
            fromDate: fromDate,
            toDate: toDate
        });
    },
    getInstanceReport: function(fromDate, toDate) {
        return APIXHRService("GET", API_PATH + "scenarios/get-instance-report", {
            fromDate: fromDate,
            toDate: toDate
        });
    },
	getProjetActivities: function(projectKey, fromDate, toDate) {
		return APIXHRService("GET", API_PATH + "scenarios/get-project-activities", {
			projectKey: projectKey,
			fromDate: fromDate,
			toDate: toDate
		});
	},
    getOutcomes: function(fromDate, toDate, projectKey, scenarioId) {
        return APIXHRService("GET", API_PATH + "scenarios/get-outcomes", {
            projectKey: projectKey,
            scenarioId: scenarioId,
            fromDate: fromDate,
            toDate: toDate
        });
    },
    getOutcomesSummary: function(projectKey, fromDate, toDate) {
        return APIXHRService("GET", API_PATH + "scenarios/get-outcomes-summary", {
            projectKey: projectKey,
            fromDate: fromDate,
            toDate: toDate
        });
    },
    getOutcomesDetails: function(projectKey, scenarioId, date) {
        return APIXHRService("GET", API_PATH + "scenarios/get-outcomes-details", {
            projectKey: projectKey,
            scenarioId: scenarioId,
            date: date
        });
    },
    getRunDiagnosisURL: function(projectKey, scenarioId, runId) {
        return API_PATH + "scenarios/download-run-diagnosis?"
                 + "projectKey=" + encodeURIComponent(projectKey)
                 + "&scenarioId=" + encodeURIComponent(scenarioId)
                 + "&runId=" + encodeURIComponent(runId);
    },
    getRunLogURL: function(projectKey, scenarioId, runId) {
        return API_PATH + "scenarios/run-log?"
                 + "projectKey=" + encodeURIComponent(projectKey)
                 + "&scenarioId=" + encodeURIComponent(scenarioId)
                 + "&runId=" + encodeURIComponent(runId);
    },
    getStepRunLogURL: function(projectKey, scenarioId, runId, stepRunId) {
        return API_PATH + "scenarios/step-run-log?"
                 + "projectKey=" + encodeURIComponent(projectKey)
                 + "&scenarioId=" + encodeURIComponent(scenarioId)
                 + "&runId=" + encodeURIComponent(runId)
                 + "&stepRunId=" + encodeURIComponent(stepRunId);
    },
    listReportTemplates: function() {
        return APIXHRService("GET", API_PATH + "scenarios/list-report-templates", {
        });
    },
    loadKeptFile: function(projectKey, scenarioId, runId, stepName, item) {
        return APIXHRService("GET", API_PATH + "scenarios/load-kept-file", {
            projectKey: projectKey,
            scenarioId: scenarioId,
            runId: runId,
            stepName: stepName,
            item: JSON.stringify(item)
        });
    },
    getDownloadURL: function(projectKey, scenarioId, runId, stepName, item) {
        return API_PATH + "scenarios/download-kept-file?"
                 + "projectKey=" + encodeURIComponent(projectKey)
                 + "&scenarioId=" + encodeURIComponent(scenarioId)
                 + "&runId=" + encodeURIComponent(runId)
                 + "&stepName=" + encodeURIComponent(stepName)
                 + "&item=" + encodeURIComponent(JSON.stringify(item));
    },
    addToScenario: function(items, options) {
        return APIXHRService("POST", API_PATH + "scenarios/add-to-scenario", {
            items: JSON.stringify(items),
            options: JSON.stringify(options)
        });
    },
},
lambda: {
    services: {
        list: function(projectKey) {
            return APIXHRService("GET", API_PATH + "lambda-services/list", {
                projectKey: projectKey
            });
        },
        listHeads: function(projectKey) {
            return APIXHRService("GET", API_PATH + "lambda-services/list-heads", {
              projectKey
            });
        },
        getSummary: function(projectKey, id) {
            return APIXHRService("GET", API_PATH + "lambda-services/get-summary", {
                projectKey: projectKey,
                id: id
            });
        },
        deleteMulti: function(requests, contextProjectKey) {
            return APIXHRService("POST", API_PATH + "lambda-services/delete-multi/", {
                requests: JSON.stringify(requests),
                contextProjectKey: contextProjectKey
            });
        },
        create: function(projectKey, id) {
            return APIXHRService("POST", API_PATH + "lambda-services/create", {
                projectKey: projectKey,
                id: id
            });
        },
        save: function(projectKey, service) {
            return APIXHRService("POST", API_PATH + "lambda-services/save", {
                projectKey: projectKey,
                service: JSON.stringify(service)
            });
        },
        addEndpoint: function(projectKey, serviceId, createService, endpoint) {
            return APIXHRService("POST", API_PATH + "lambda-services/add-endpoint", {
                projectKey: projectKey,
                serviceId: serviceId,
                createService: createService,
                endpoint: angular.toJson(endpoint)
            });
        },
        startPreparePackage: function(projectKey, serviceId, packageId) {
            return APIXHRService("POST", API_PATH + "lambda-services/packages/start-prepare", {
                projectKey: projectKey,
                serviceId: serviceId,
                packageId: packageId
            });
        },
        deployDev: function(projectKey, id) {
            return APIXHRService("POST", API_PATH + "lambda-services/deploy-to-dev", {
                projectKey: projectKey,
                id: id
            });
        },
        playTestQueries: function(projectKey, serviceId, endpointId, testType, queries) {
            return APIXHRService("POST", API_PATH + "lambda-services/play-test-queries", {
                projectKey: projectKey,
                serviceId: serviceId,
                endpointId: endpointId,
                testType: testType,
                queries: JSON.stringify(queries)
            });
        },
        getSampleQueriesFromDataset: function(projectKey, datasetName, modelRef, batchSize=1, method="HEAD_SEQUENTIAL") {
            return APIXHRService("GET", API_PATH + "lambda-services/get-sample-queries", {
                projectKey: projectKey,
                datasetName: datasetName,
                modelRef: modelRef,
                batchSize: batchSize,
                method: method
            });
        }
    },
    packages: {
        list: function(projectKey, serviceId) {
            return APIXHRService("GET", API_PATH + "lambda-services/packages", {
                projectKey: projectKey,
                serviceId: serviceId
            });
        },
        delete: function(projectKey, serviceId, packageId) {
            return APIXHRService("POST", API_PATH + "lambda-services/package/delete", {
                projectKey: projectKey,
                serviceId: serviceId,
                packageId: packageId
            });
        },
        publishToAPIDeployer: function(projectKey, serviceId, packageId, publishedServiceId) {
            return APIXHRService("POST", API_PATH + "lambda-services/package/publish-to-api-deployer", {
                projectKey: projectKey,
                serviceId: serviceId,
                packageId: packageId,
                publishedServiceId: publishedServiceId
            });
        }
    },
    devServer: {
        getStatus: APIXHRService.bind(null, "GET",    API_PATH + "lambda-devserver"),
        start:     APIXHRService.bind(null, "POST",   API_PATH + "lambda-devserver"),
        stop:      APIXHRService.bind(null, "DELETE", API_PATH + "lambda-devserver")
    }
},
exports: {
    list: function() {
        return APIXHRService("GET", API_PATH + "exports/list", {},"nospinner");
    },
    remove: function(exportId) {
        return APIXHRService("POST", API_PATH + "exports/remove", {exportId: exportId});
    },
    getDownloadURL: function(exportId) {
        return API_PATH + "exports/download/?exportId=" + encodeURIComponent(exportId);
    },
    clear: function() {
        return APIXHRService("POST", API_PATH + "exports/clear");
    },
    create: function(name, params) {
        return APIXHRService("POST", API_PATH + "exports/create", {name: name, params: JSON.stringify(params)});
    },
    getOptions: function() {
        return APIXHRService("GET", API_PATH + "exports/get-export-options");
    },
    exportUIData: function(data, params) {
        return APIXHRService("POST", API_PATH + "exports/export-ui-data", {
            data: JSON.stringify(data),
            params: JSON.stringify(params)
        });
    }
},
notebooks: {
    listTemplates: function(type, language) {
        return APIXHRService("GET", API_PATH + "notebooks/list-templates", {
            type: type, language: language
        });
    }
},
sqlNotebooks: {
    abort: function(projectKey, notebookId, cellId, qid) {
        return APIXHRService("POST", API_PATH + "sql-notebooks/abort", {projectKey: projectKey, notebookId: notebookId, cellId: cellId, qid: qid});
    },
    clearHistory: function(projectKey, notebookId, cellId) {
        return APIXHRService("POST", API_PATH + "sql-notebooks/clear-history/", {
            projectKey: projectKey,
            notebookId: notebookId,
            cellId: cellId
        }, "nospinner");
    },
    computeFullCount: function(projectKey, notebookId, cellId, qid) {
        return APIXHRService("POST", API_PATH + "sql-notebooks/full-count/", {
            projectKey: projectKey,
            notebookId: notebookId,
            cellId: cellId,
            qid: qid
        }, "nospinner");
    },
    copy: function(projectKey, notebookId, newNotebookName) {
        return APIXHRService("POST", API_PATH + "sql-notebooks/copy/", {projectKey: projectKey, notebookId: notebookId, newNotebookName: newNotebookName});
    },
    create: function(projectKey, connection, name) {
        return APIXHRService("POST", API_PATH + "sql-notebooks/create/", {projectKey: projectKey, connection: connection, name: name});
    },
    exportResults: function(projectKey, notebookId, cellId, queryId, params) {
        return APIXHRService("POST", API_PATH + "sql-notebooks/export-results/", {
            projectKey: projectKey,
            notebookId: notebookId,
            cellId: cellId,
            qid: queryId,
            params: JSON.stringify(params)
        });
    },
    get: function(projectKey, id) {
        return APIXHRService("GET", API_PATH + "sql-notebooks/get/", {projectKey: projectKey, id: id});
    },
    getSummary: function(projectKey, id) {
        return APIXHRService("GET", API_PATH + "sql-notebooks/get-summary/", {projectKey: projectKey, id: id});
    },
    getHistory: function(projectKey, notebookId) {
        return APIXHRService("GET", API_PATH + "sql-notebooks/get-history/", {projectKey: projectKey, notebookId: notebookId});
    },
    getCellHistory: function(projectKey, notebookId, cellId) {
        return APIXHRService("GET", API_PATH + "sql-notebooks/get-cell-history/", {projectKey: projectKey, notebookId: notebookId, cellId: cellId});
    },
    getHistoryResult: function(projectKey, notebookId, qid) {
        return APIXHRService("POST", API_PATH + "sql-notebooks/get-history-result/", {
            projectKey: projectKey,
            notebookId: notebookId,
            qid: qid
        }, "nospinner");
    },
    createForDataset: function(projectKey, datasetSmartName, type, name) {
        return APIXHRService("POST", API_PATH + "sql-notebooks/create-for-dataset/", {
            projectKey: projectKey,
            datasetSmartName: datasetSmartName,
            type: type,
            name: name
        });
    },
    getProgress: function(projectKey, notebookId, cellId, qid) {
        return APIXHRService("POST", API_PATH + "sql-notebooks/get-progress", {
            projectKey: projectKey,
            notebookId: notebookId,
            cellId: cellId,
            qid: qid
        }, "nospinner");
    },
    listHeads: function(projectKey, tagFilter) {
        return APIXHRService("GET", API_PATH + "sql-notebooks/list-heads/", {projectKey: projectKey, tagFilter: tagFilter});
    },
    listConnections: function(projectKey) {
        return APIXHRService("GET", API_PATH + "sql-notebooks/list-connections/", {projectKey:projectKey});
    },
    removeQuery: function(projectKey, notebookId, cellId, qid) {
        return APIXHRService("POST", API_PATH + "sql-notebooks/remove-query/", {projectKey: projectKey, notebookId: notebookId, cellId: cellId, qid: qid});
    },
    run: function(projectKey, notebookId, cellId, query, fullCount) {
        return APIXHRService("POST", API_PATH + "sql-notebooks/run/", {
            projectKey: projectKey,
            notebookId: notebookId,
            cellId: cellId,
            queryData: JSON.stringify(query),
            fullCount: fullCount
        }, "nospinner");
    },
    getExecutionPlan: function(projectKey, query) {
        return APIXHRService("POST", API_PATH + "sql-notebooks/get-execution-plan", {
            projectKey: projectKey,
            queryData: JSON.stringify(query)
        });
    },
    save: function(notebook) {
        return APIXHRService("POST", API_PATH + "sql-notebooks/save/", {notebook: angular.toJson(notebook)}, "nospinner");
    },
    testStreamedExport: function(projectKey, notebookId, cellId, qid) {
        return APIXHRService("POST", API_PATH + "sql-notebooks/test-streamed-export/", {
            projectKey: projectKey,
            notebookId: notebookId,
            cellId: cellId,
            qid: qid
        });
    }
},
explores: {
    getScript: function(projectKey, datasetSmartName) {
        return APIXHRService("GET", API_PATH + "explores/get-script", {projectKey: projectKey, datasetSmartName: datasetSmartName});
    },
    saveScript: function(projectKey, datasetSmartName, script) {
        return APIXHRService("POST", API_PATH + "explores/save-script", {
            projectKey: projectKey, datasetSmartName: datasetSmartName,
            script: angular.toJson(script)
        });
    },
    getCaptureScript: function(projectKey, streamingEndpointId) {
        return APIXHRService("GET", API_PATH + "explores/get-capture-script", {projectKey: projectKey, streamingEndpointId: streamingEndpointId});
    },
    saveCaptureScript: function(projectKey, streamingEndpointId, script) {
        return APIXHRService("POST", API_PATH + "explores/save-capture-script", {
            projectKey: projectKey, streamingEndpointId: streamingEndpointId,
            script: angular.toJson(script)
        });
    },
    get: function(projectKey, datasetSmartName) {
        return APIXHRService("GET", API_PATH + "explores/get", {projectKey: projectKey, datasetSmartName: datasetSmartName});
    },
    save: function(projectKey, datasetSmartName, data) {
        return APIXHRService("POST", API_PATH + "explores/save", {
            projectKey: projectKey, datasetSmartName: datasetSmartName,
            data: angular.toJson(data)
        });
    },
    setExploreOnSinglePartition: function(projectKey, datasetName, partitionId) {
         return APIXHRService("POST", API_PATH + "explores/set-explore-on-single-partition/", {
            projectKey: projectKey,
            datasetName: datasetName,
            partitionId: partitionId
        });
    },
    setColumnMeaning: function(projectKey, datasetName, columnName, meaning) {
        return APIXHRService("POST", API_PATH + "explores/set-column-meaning/", {
            projectKey: projectKey,
            datasetName: datasetName,
            columnName: columnName,
            meaning: meaning
        });
    },
    setColumnsMeanings: function(data) {
        return APIXHRService("POST", API_PATH + "explores/set-columns-meanings/", {data: JSON.stringify(data)});
    },
    setColumnStorageType: function(projectKey, datasetName, columnName, storageType, actionIds) {
        return APIXHRService("POST", API_PATH + "explores/set-column-storage-type/", {
            projectKey: projectKey, datasetName: datasetName,
            columnName: columnName, storageType: storageType, actionIds: JSON.stringify(actionIds)
        });
    },
    getSetColumnStorageTypeImpact: function(projectKey, datasetName, columnName, storageType) {
        return APIXHRService("POST", API_PATH + "explores/get-set-column-storage-type-impact/", {
            projectKey: projectKey, datasetName: datasetName,
            columnName: columnName, storageType: storageType
        });
    },
    updateColumn: function(projectKey, datasetName, column) {
        return APIXHRService("POST", API_PATH + "explores/update-column", {
            projectKey: projectKey, datasetName: datasetName,
            column: JSON.stringify(column)
        });
    },
    listPluginChartDescs: function(projectKey) {
        return APIXHRService("GET", API_PATH + "explores/list-plugin-chart-descs", {
            projectKey: projectKey
        });
    },
    getOrCreatePluginChart: function(projectKey, datasetSmartName, chartDef, webAppId) {
        return APIXHRService("POST", API_PATH + "explores/get-or-create-plugin-chart", {
            projectKey: projectKey,
            datasetSmartName: datasetSmartName,
            webAppId: webAppId,
            chartDef: JSON.stringify(chartDef)
        });
    },
    getChartEngines: function(dataset, script, chartDef) {
        return APIXHRService("GET", API_PATH + "explores/get-chart-engines", {projectKey: dataset.projectKey, datasetName: dataset.name, script: JSON.stringify(script), chartDef: JSON.stringify(chartDef)});
    },
},
shakers: {
    multiColumnAnalysis: function(contextProjectKey, projectKey, datasetName, streamingEndpointId, data, requestedSampleId, columns, compute, histogram) {
        return APIXHRService("POST", API_PATH + "shaker/multi-column-analysis/", {
            contextProjectKey: contextProjectKey,
            projectKey: projectKey,
            datasetName: datasetName,
            streamingEndpointId: streamingEndpointId,
            data: JSON.stringify(data),
            requestedSampleId: requestedSampleId,
            columns: columns,
            compute: compute,
            histogram: histogram || 1
        });
    },
	multiColumnFullAnalysis: function(contextProjectKey, projectKey, datasetName, data, fullSamplePartitionId, columns) {
		return APIXHRService("POST", API_PATH + "shaker/multi-column-full-analysis/", {
            contextProjectKey: contextProjectKey,
			projectKey: projectKey,
			datasetName: datasetName,
			data: JSON.stringify(data),
			fullSamplePartitionId: fullSamplePartitionId,
			columns: columns
		});
	},
    detailedColumnAnalysis: function(contextProjectKey, projectKey, datasetName, data, requestedSampleId, column, alphanumMaxResults, fullSamplePartitionId, withFullSampleStatistics) {
        return APIXHRService("POST", API_PATH + "shaker/detailed-column-analysis/", {
            contextProjectKey: contextProjectKey,
            projectKey: projectKey,
            datasetName: datasetName,
            data: JSON.stringify(data),
            requestedSampleId: requestedSampleId,
            column: column,
            alphanumMaxResults : alphanumMaxResults,
            fullSamplePartitionId : fullSamplePartitionId,
            withFullSampleStatistics: withFullSampleStatistics
        });
    },
    detailedStreamingColumnAnalysis: function(contextProjectKey, projectKey, streamingEndpointId, data, requestedSampleId, column, alphanumMaxResults, fullSamplePartitionId, withFullSampleStatistics) {
        // same call, different parameters
        return APIXHRService("POST", API_PATH + "shaker/detailed-column-analysis/", {
            contextProjectKey: contextProjectKey,
            projectKey: projectKey,
            streamingEndpointId: streamingEndpointId,
            data: JSON.stringify(data),
            requestedSampleId: requestedSampleId,
            column: column,
            alphanumMaxResults : alphanumMaxResults,
            fullSamplePartitionId : fullSamplePartitionId,
            withFullSampleStatistics: withFullSampleStatistics
        });
    },
    textAnalysis: function(contextProjectKey, projectKey, datasetName, data, requestedSampleId, column, simplificationParameters) {
        return APIXHRService("POST", API_PATH + "shaker/text-analysis/", {
            contextProjectKey: contextProjectKey,
            projectKey: projectKey,
            datasetName: datasetName,
            data: JSON.stringify(data),
            requestedSampleId: requestedSampleId,
            column: column,
            simplificationParameters: JSON.stringify(simplificationParameters)
        });
    },
    smartExtractor: function(contextProjectKey, projectKey, datasetName, data, requestedSampleId, column, selections, excluded, customRegex, onColumnNames, firstSentence, filters) {
        return APIXHRService("POST", API_PATH + "shaker/smart-extractor/", {
            contextProjectKey: contextProjectKey,
            projectKey: projectKey,
            datasetName: datasetName,
            data : JSON.stringify(data),
            requestedSampleId: requestedSampleId,
            column: column,
            selections: JSON.stringify(selections),
            excluded: JSON.stringify(excluded),
            customRegex: customRegex || "",
            onColumnNames: JSON.stringify(onColumnNames),
            firstString: firstSentence,
            filters: JSON.stringify(filters)
        });
    },
    smartDateGuess: function(contextProjectKey, projectKey, datasetName, data, requestedSampleId, column) {
        return APIXHRService("POST", API_PATH + "shaker/smart-date-guess/", {
            contextProjectKey: contextProjectKey,
            projectKey: projectKey,
            datasetName: datasetName,
            data : JSON.stringify(data),
            requestedSampleId: requestedSampleId,
            column: column
        });
    },
    smartDateValidate: function(contextProjectKey, projectKey, datasetName, data, requestedSampleId, column, format) {
        return APIXHRService("POST", API_PATH + "shaker/smart-date-validate/", {
            contextProjectKey: contextProjectKey,
            projectKey: projectKey,
            datasetName: datasetName,
            data: JSON.stringify(data),
            requestedSampleId: requestedSampleId,
            column: column,
            format: format
        });
    },
    suggestionPreview: function(contextProjectKey, projectKey, datasetName, data, requestedSampleId, column, regex) {
        return APIXHRService("POST", API_PATH + "shaker/suggestion-preview/", {
            contextProjectKey: contextProjectKey,
            projectKey: projectKey,
            datasetName: datasetName,
            data: JSON.stringify(data),
            requestedSampleId: requestedSampleId,
            column: column,
            regex: regex
        });
    },
    refreshTable: function(contextProjectKey, projectKey, datasetName, data, requestedSampleId, allowCache, filters, recipeSchema) {
        return APIXHRService("POST", API_PATH + "shaker/refresh-table/", {
            contextProjectKey: contextProjectKey,
            projectKey: projectKey,
            datasetName: datasetName,
            data : JSON.stringify(data),
            requestedSampleId: requestedSampleId,
            allowCache: allowCache,
            filters: JSON.stringify(filters),
            recipeSchema: recipeSchema == null ? null : JSON.stringify(recipeSchema)
        });
    },
    refreshCapture: function(contextProjectKey, projectKey, streamingEndpointId, data, requestedSampleId, allowCache, filters, recipeSchema) {
        return APIXHRService("POST", API_PATH + "shaker/refresh-capture/", {
            contextProjectKey: contextProjectKey,
            projectKey: projectKey,
            streamingEndpointId: streamingEndpointId,
            data : JSON.stringify(data),
            requestedSampleId: requestedSampleId,
            allowCache: allowCache,
            filters: JSON.stringify(filters),
            recipeSchema: recipeSchema == null ? null : JSON.stringify(recipeSchema)
        });
    },
    getClusters: function(contextProjectKey, projectKey, datasetName, data, requestedSampleId, column, setBased, radius, timeOut, blockSize) {
        return APIXHRService("POST", API_PATH + "shaker/get-clusters/", {
            contextProjectKey: contextProjectKey,
            projectKey: projectKey,
            datasetName: datasetName,
            data : JSON.stringify(data),
            requestedSampleId: requestedSampleId,
            column: column,
            setBased: setBased,
            radius: radius,
            timeOut: timeOut,
            blockSize: blockSize
        });
    },
    getTableChunk: function(contextProjectKey, projectKey, datasetName, data, requestedSampleId, firstRow, nbRows, firstCol, nbCols, filters) {
        return APIXHRService("POST", API_PATH + "shaker/get-table-chunk/", {
            contextProjectKey: contextProjectKey,
            projectKey: projectKey,
            datasetName: datasetName,
            data : JSON.stringify(data),
            requestedSampleId: requestedSampleId,
            firstRow: firstRow,
            nbRows: nbRows,
            firstCol: firstCol,
            nbCols: nbCols,
            filters: JSON.stringify(filters)
        });
    },
    getCaptureChunk: function(contextProjectKey, projectKey, streamingEndpointId, data, requestedSampleId, firstRow, nbRows, firstCol, nbCols, filters) {
        return APIXHRService("POST", API_PATH + "shaker/get-capture-chunk/", {
            contextProjectKey: contextProjectKey,
            projectKey: projectKey,
            streamingEndpointId: streamingEndpointId,
            data : JSON.stringify(data),
            requestedSampleId: requestedSampleId,
            firstRow: firstRow,
            nbRows: nbRows,
            firstCol: firstCol,
            nbCols: nbCols,
            filters: JSON.stringify(filters)
        });
    },
    validateExpression: function(projectKey, datasetProjectKey, datasetName, data,
                                 requestedSampleId, expression, mode, column, stepId, subStepId, stepDepth) {
        return APIXHRService("POST", API_PATH + "shaker/validate-expression", {
            projectKey: projectKey,
            datasetProjectKey: datasetProjectKey,
            datasetName: datasetName,
            data: JSON.stringify(data),
            requestedSampleId:requestedSampleId,
            expression:expression,
            mode:mode,
            column:column,
            stepId: stepId,
            subStepId: subStepId,
            stepDepth: stepDepth
        });
    },
    fixExpression: function(projectKey, datasetProjectKey, datasetName, data,
        requestedSampleId, expression, mode, column, stepId, subStepId, stepDepth) {
        return APIXHRService("POST", API_PATH + "shaker/fix-expression", {
        projectKey: projectKey,
        datasetProjectKey: datasetProjectKey,
        datasetName: datasetName,
        data: JSON.stringify(data),
        requestedSampleId:requestedSampleId,
        expression:expression,
        mode:mode,
        column:column,
        stepId: stepId,
        subStepId: subStepId,
        stepDepth: stepDepth
        });
        },
    validateUdf: function(projectKey, datasetProjectKey, datasetName, data, requestedSampleId, expression, stepId, subStepId, stepDepth) {
        return APIXHRService("POST", API_PATH + "shaker/validate-udf", {
            projectKey: projectKey,
            datasetProjectKey: datasetProjectKey,
            datasetName: datasetName,
            data: JSON.stringify(data),
            requestedSampleId:requestedSampleId,
            udf:expression,
            stepId: stepId,
            subStepId: subStepId,
            stepDepth: stepDepth
        });
    },
    randomizeColors: function() {
        return APIXHRService("POST", API_PATH + "shaker/randomize-colors");
    },
    computeRelativeDateInterval: function(params) {
        return APIXHRService("POST", API_PATH + "shaker/compute-relative-date-interval", {
            params: JSON.stringify(params)
        });
    },
    /* Static data for the Shaker */
    getProcessorsLibrary: function() {
        return APIXHRService("GET", API_PATH + "shaker/get-processors-library/", {});
    },
    getCustomFormulasReference: function() {
        return APIXHRService("GET", API_PATH + "shaker/get-expression-syntax");
    },
    listCustomFormulasFunctions: function() {
        return APIXHRService("GET", API_PATH + "shaker/list-custom-formulas-functions");
    },
    charts: {
        getColumnsSummary: function(projectKey, dataSpec) {
            return APIXHRService("POST", API_PATH + "shaker/charts/get-columns-summary", {
                projectKey:projectKey,
                dataSpec: JSON.stringify(dataSpec)
            });
        },
        exportToExcel: function(chartDef, pivotResponse, animationFrameIdx) {
            var params = {
                chartDef:JSON.stringify(chartDef),
                pivotResponse: JSON.stringify(pivotResponse)
            };

            if (animationFrameIdx !== undefined) {
                params.animationFrameIdx = animationFrameIdx;
            }

            return APIXHRService("POST", API_PATH + "shaker/charts/excel-export", params);
        },
        downloadExcelUrl: function(id) {
            return API_PATH + "shaker/charts/excel-download/?id=" + encodeURIComponent(id);
        },
        getPivotResponse: function(projectKey, dataSpec, request, requestedSampleId) {
            return APIXHRService("POST", API_PATH + "shaker/charts/get-pivot-response", {
                projectKey: projectKey,
                dataSpec : JSON.stringify(dataSpec),
                request: JSON.stringify(request),
                requestedSampleId: requestedSampleId
            });
        }
    },
    getCorrelationResponse: function(shakerId, data, requestedSampleId) {
         return APIXHRService("POST", API_PATH + "shaker/charts/get-correlation-response", {
            shakerId: shakerId,
            data: JSON.stringify(data),
            requestedSampleId: requestedSampleId
        });
    },
    getLastKnownCurrencyRateDate: function() {
        return APIXHRService("GET", API_PATH + "shaker/get-last-known-currency-rate-date");
    }
},
connections: {
   getNames: function(type) {
        return APIXHRService("GET", API_PATH + "connections/get-names/", {type: type});
   },
   getTypeAndNames: function (connectionType) {
        return APIXHRService("GET", API_PATH + "connections/get-type-and-names", { connectionType: connectionType });
   },
   getHiveNames: function(projectKey) {
       return APIXHRService("GET", API_PATH + "connections/get-hive-names/", {projectKey:projectKey});
   },
   listUsages: function(projectKey) {
        return APIXHRService("GET", API_PATH + "connections/list-usages", {projectKey: projectKey});
   },
   listSQLTables: function(connectionName, projectKey) {
        return APIXHRService("GET", API_PATH + "connections/list-sql-tables", {connectionName:connectionName, projectKey:projectKey});
   },
   listSQLTablesFromProject: function(connectionName, projectKey) {
        return APIXHRService("GET", API_PATH + "connections/list-sql-tables-from-project", {connectionName:connectionName, projectKey:projectKey});
   },
   listSQLFields: function(name, tables, projectKey) {
       var x = {tables: tables};
        return APIXHRService("POST", API_PATH + "connections/list-sql-fields", {name:name, tables: JSON.stringify(x), projectKey:projectKey});
   },
   getSQLTableMapping: function(connection) {
       return APIXHRService("GET", API_PATH + "connections/get-sql-table-mapping", {connection:connection});
   },
   getTwitterConfig: function() {
       return APIXHRService("GET", API_PATH + "connections/get-twitter-config");
   },
   getFSLike: function() {
        // TODO TODO FIXME TODO TODO
        return APIXHRService("GET", API_PATH + "connections/get-names/", {type: "Filesystem"});
   },
    countIndexedAndUnindexed: function (data) {
        return APIXHRService("GET", API_PATH + "/connections/count-indexed-and-unindexed");
    },
    listMassImportSources: function(projectKey) {
        return APIXHRService("GET", API_PATH + "connections/list-mass-import-sources", {projectKey: projectKey});
    },
    listSQLMassImportSchemas: function(connectionName, projectKey) {
        return APIXHRService("GET", API_PATH + "connections/list-sql-mass-import-schemas", {connectionName: connectionName, projectKey:projectKey});
    },
    listSQLMassImportSchemasWithCatalogs: function(connectionName, projectKey) {
        return APIXHRService("GET", API_PATH + "connections/list-sql-mass-import-schemas-with-catalogs", {connectionName: connectionName, projectKey:projectKey});
    },
    listSQLMassImportTables: function (connectionName, sourceCatalog, sourceSchema, projectKey) {
        return APIXHRService("GET", API_PATH + "connections/list-sql-mass-import-tables", {
            connectionName: connectionName, sourceCatalog: sourceCatalog, sourceSchema: sourceSchema, projectKey:projectKey
        });
    },
    listHiveMassImportTables: function (connectionName, projectKey) {
        return APIXHRService("GET", API_PATH + "connections/list-hive-mass-import-tables", {
            connectionName: connectionName, projectKey: projectKey
        });
    },
    getTableImportCandidatesFromExplorer: function (workflowType, tables, projectKey, targetHDFSConnection) {
        return APIXHRService("POST", API_PATH + "connections/get-table-import-candidates-from-explorer", {
            workflowType: workflowType,
            tables: JSON.stringify(tables),
            projectKey: projectKey,
            targetHDFSConnection: targetHDFSConnection
        });
    },
    getTableImportCandidatesFromKeys: function (tables, projectKey, targetConnection) {
        return APIXHRService("POST", API_PATH + "connections/get-table-import-candidates-from-keys", {
            tables: JSON.stringify(tables),
            projectKey: projectKey,
            targetConnection:targetConnection
        });
    },
    massImportTableCandidates: function (projectKey, sqlTableCandidates, hiveTableCandidates, zoneId) {
        return APIXHRService("POST", API_PATH + "connections/mass-import-candidates", {
            projectKey: projectKey,
            sqlTableCandidates: JSON.stringify(sqlTableCandidates),
            hiveTableCandidates: JSON.stringify(hiveTableCandidates),
            zoneId
        });
    },

   /* Alation "embedded catalog chooser" integration */
   getTableImportCandidatesFromAlationMCC: function(projectKey, alationSelection) {
        return APIXHRService("POST", API_PATH + "connections/get-table-import-candidates-from-alation-mcc", {
            projectKey: projectKey,
            alationSelection: JSON.stringify(alationSelection)
        })
   },

   /* Alation "open in" integration" */
   registerAlationOpener : function(alationAPIToken) {
        return APIXHRService("POST", API_PATH + "connections/register-alation-opener", {
            alationAPIToken : alationAPIToken
        })
   },
   getAlationOpenInfo: function(alationOpenId) {
        return APIXHRService("POST", API_PATH + "connections/get-alation-open-info", {
            alationOpenId: alationOpenId
        })
   }
},

managedfolder: {
    list: function(projectKey) {
        return APIXHRService("GET", API_PATH + "managedfolder/list/", {projectKey: projectKey})
    },
    listWithAccessible: function(projectKey) {
        return APIXHRService("GET", API_PATH + "managedfolder/list-with-accessible/", {projectKey: projectKey});
    },
    get: function(contextProjectKey, projectKey, id) {
        return APIXHRService("GET", API_PATH + "managedfolder/get/", {contextProjectKey: contextProjectKey, projectKey: projectKey, id: id})
    },
    getSummary: function(projectKey, id) {
        return APIXHRService("GET", API_PATH + "managedfolder/get-summary/", {projectKey: projectKey, id: id})
    },
    getForInsight: function(contextProjectKey, projectKey, smartId) {
        return APIXHRService("GET", API_PATH + "managedfolder/get-for-insight/", {contextProjectKey: contextProjectKey, projectKey: projectKey, smartId: smartId})
    },
    getWithStatus: function(projectKey, id) {
        return APIXHRService("GET", API_PATH + "managedfolder/get-with-status/", {projectKey: projectKey, id: id})
    },
    getFullInfo: function(contextProjectKey, projectKey, id) {
        return APIXHRService("GET", API_PATH + "managedfolder/get-full-info/", {contextProjectKey: contextProjectKey, projectKey: projectKey, id: id})
    },
    testPartitioning: function(odb) {
        return APIXHRService("POST", API_PATH + "managedfolder/test-partitioning", {data: JSON.stringify(odb)});
    },
    detectPartitioning: function(odb) {
        return APIXHRService("POST", API_PATH + "managedfolder/detect-partitioning", {data: JSON.stringify(odb)});
    },
    browse: function(projectKey, folderId, path) {
        return APIXHRService("GET", API_PATH + "managedfolder/browse", {projectKey: projectKey, folderId: folderId, path: path})
    },
    listFS: function(projectKey, smartId) {
        return APIXHRService("GET", API_PATH + "managedfolder/list-fs", {projectKey: projectKey, smartId: smartId})
    },
    listPartitionFS: function(projectKey, smartId, partition) {
        return APIXHRService("GET", API_PATH + "managedfolder/list-partition-fs", {projectKey: projectKey, smartId: smartId, partition: partition})
    },
    listPartitionsWithName: function(projectKey, folderId) {
        return APIXHRService("POST", API_PATH + "managedfolder/list-partitions-with-name/", {
            projectKey: projectKey, folderId: folderId
        });
    },
    save: function(data, saveInfo) {
        return APIXHRService("POST", API_PATH + "managedfolder/save", {data: JSON.stringify(data), saveInfo: JSON.stringify(saveInfo || {})})
    },
    deleteItems: function(projectKey, odbId, itemPaths) {
        return APIXHRService("POST", API_PATH + "managedfolder/delete-items", {
            projectKey: projectKey, odbId: odbId, itemPaths: JSON.stringify(itemPaths)
        })
    },
    renameItem: function(projectKey, odbId, itemPath, isDirectory, newName) {
        return APIXHRService("GET", API_PATH + "managedfolder/rename-item", {
            projectKey: projectKey, odbId: odbId, itemPath: itemPath, newName: newName, isDirectory: isDirectory
        })
    },
    moveItems: function(projectKey, odbId, items) {
        return APIXHRService("GET", API_PATH + "managedfolder/move-items", {
            projectKey: projectKey, odbId: odbId, items: JSON.stringify(items)
        })
    },
    clearPartitions: function(projectKey, odbId, partitions) {
        return APIXHRService("POST", API_PATH + "managedfolder/clear-partitions/", {
            projectKey:projectKey,
            odbId:odbId,
            partitions:JSON.stringify(partitions)
        });
    },
    setExploreOnSinglePartition: function(projectKey, folderId, partitionId) {
        return APIXHRService("POST", API_PATH + "managedfolder/set-explore-on-single-partition/", {
           projectKey: projectKey,
           folderId: folderId,
           partitionId: partitionId
       });
    },
    saveSampling: function(projectKey, folderId, data) {
        return APIXHRService("GET", API_PATH + "managedfolder/save-sampling", {
            projectKey: projectKey,
            folderId: folderId,
            data: JSON.stringify(data)
        });
    },
    uploadItem: function(projectKey, odbId, path, file, forceUpload, callback) {
        return uploadFileRequest("managedfolder/upload-item", function(formdata) {
            formdata.append("projectKey", projectKey);
            formdata.append("odbId", odbId);
            formdata.append("file", file);
            formdata.append("path", path);
            formdata.append("forceUpload", forceUpload);
        }, callback);
    },
    createSubFolder: function(projectKey, folderId, path) {
        return APIXHRService("POST", API_PATH + "managedfolder/create-sub-folder", {
            projectKey: projectKey,
            folderId: folderId,
            path: path
        });
    },
    getDownloadItemURL: function(contextProjectKey, projectKey, obdId, path) {
        return API_PATH + "managedfolder/download-item/?contextProjectKey=" + encodeURIComponent(contextProjectKey)
            + "&projectKey=" + encodeURIComponent(projectKey)
            + "&obdId=" + encodeURIComponent(obdId)
            + "&path=" + encodeURIComponent(path) ;
    },
    getDownloadFolderURL: function(contextProjectKey, projectKey, obdId, path) {
        return API_PATH + "managedfolder/download-folder/?contextProjectKey=" + encodeURIComponent(contextProjectKey) + "&projectKey=" + encodeURIComponent(projectKey) + "&obdId=" + encodeURIComponent(obdId) + "&path=" + encodeURIComponent(path) ;
    },
    getItemInfo: function(projectKey, smartId, itemPath) {
        return APIXHRService("GET", API_PATH + "managedfolder/get-item-info", {
            projectKey: projectKey, smartId: smartId, itemPath: itemPath
        })
    },
    previewItem: function(contextProjectKey, projectKey, smartId, itemPath) {
        return APIXHRService("GET", API_PATH + "managedfolder/preview-item", {
            contextProjectKey: contextProjectKey, projectKey: projectKey, smartId: smartId, itemPath: itemPath
        })
    },
    decompressItem: function(projectKey, odbId, itemPath) {
        return APIXHRService("GET", API_PATH + "managedfolder/decompress-item", {
            projectKey: projectKey, odbId: odbId, itemPath: itemPath
        })
    },
    listAvailableMetrics: function(projectKey, folderId) {
        return APIXHRService("GET", API_PATH + "managedfolder/list-available-metrics", {
            projectKey: projectKey,
            folderId: folderId
        });
    },
    saveMetrics: function(projectKey, folderId, metrics, checks) {
        return APIXHRService("POST", API_PATH + "managedfolder/save-metrics", {
            projectKey: projectKey,
            folderId: folderId,
            metricsData: JSON.stringify(metrics),
            checksData: JSON.stringify(checks)
        });
    },
    computeMetrics: function(projectKey, folderId, partitionId, allPartitions) {
        return APIXHRService("GET", API_PATH + "managedfolder/compute-metrics", {
            projectKey: projectKey,
            folderId: folderId,
            partitionId: partitionId,
            allPartitions: allPartitions
        });
    },
    computePlan: function(projectKey, folderId, metrics) {
        return APIXHRService("POST", API_PATH + "managedfolder/compute-plan", {
            projectKey: projectKey,
            folderId: folderId,
            metricsData: JSON.stringify(metrics)
        });
    },
    getPreparedMetricHistory: function(projectKey, folderId, partitionId, metric, metricId) {
        return APIXHRService("GET", API_PATH + "managedfolder/get-prepared-metric-history", {
            projectKey: projectKey,
            folderId: folderId,
            data: JSON.stringify(metric),
            metricId: metricId,
            partitionId: partitionId
        });
    },
    getPreparedMetricHistories: function(projectKey, folderId, displayedState) {
        return APIXHRService("POST", API_PATH + "managedfolder/get-prepared-metric-histories", {
            projectKey: projectKey,
            folderId: folderId,
            data: JSON.stringify(displayedState || {})
        });
    },
    getPreparedMetricPartitions: function(projectKey, folderId, displayedState) {
        return APIXHRService("POST", API_PATH + "managedfolder/get-prepared-metric-partitions", {
            projectKey: projectKey,
            folderId: folderId,
            data: JSON.stringify(displayedState || {})
        });
    },
    getPartitionListMetric: function(projectKey, folderId ) {
        return APIXHRService("GET", API_PATH + "managedfolder/get-partition-list-metric", {
            projectKey: projectKey,
            folderId: folderId
        });
    },
    refreshPartitionListMetric: function(projectKey, folderId ) {
        return APIXHRService("GET", API_PATH + "managedfolder/refresh-partition-list-metric", {
            projectKey: projectKey,
            folderId: folderId
        });
    },
    listComputedMetrics: function(projectKey, folderId) {
        return APIXHRService("GET", API_PATH + "managedfolder/list-computed-metrics", {
            projectKey: projectKey,
            folderId: folderId
        });
    },
    computeProbe: function(projectKey, folderId, partitionId, allPartitions, metrics) {
        return APIXHRService("POST", API_PATH + "managedfolder/compute-probe", {
            projectKey: projectKey,
            folderId: folderId,
            partitionId: partitionId,
            allPartitions: allPartitions,
            data: JSON.stringify(metrics)
        });
    },
    runChecks: function(projectKey, folderId, partitionId, allPartitions) {
        return APIXHRService("GET", API_PATH + "managedfolder/run-checks", {
            projectKey: projectKey,
            folderId: folderId,
            partitionId: partitionId,
            allPartitions: allPartitions
        });
    },
    runCheck: function(projectKey, folderId, partitionId, allPartitions, metricsChecks) {
        return APIXHRService("POST", API_PATH + "managedfolder/run-check", {
            projectKey: projectKey,
            folderId: folderId,
            partitionId: partitionId,
            allPartitions: allPartitions,
            data: JSON.stringify(metricsChecks)
        });
    },
    createMetricsDataset: function(projectKey, folderId, view, partition, filter) {
        return APIXHRService("GET", API_PATH + "datasets/create-metrics-dataset", {
            projectKey: projectKey,
            objectId: folderId,
            view: view,
            partition: partition,
            filter: filter
        });
    },
    getCheckHistories: function(projectKey, folderId, displayedState) {
        return APIXHRService("POST", API_PATH + "managedfolder/get-prepared-check-histories", {
            projectKey: projectKey,
            folderId: folderId,
            data: JSON.stringify(displayedState || {})
        });
    },
    listComputedChecks: function(projectKey, folderId) {
        return APIXHRService("GET", API_PATH + "managedfolder/list-computed-checks", {
            projectKey: projectKey,
            folderId: folderId
        });
    },
    getHint: function(projectKey, folderId, probe) {
        return APIXHRService("POST", API_PATH + "managedfolder/get-hint", {
            projectKey: projectKey,
            folderId: folderId,
            data: JSON.stringify(probe)
        });
    },
    clearMetrics: function(projectKey, folderId) {
        return APIXHRService("GET", API_PATH + "managedfolder/clear-metrics", {
            projectKey: projectKey,
            folderId: folderId
        });
    }
},
fsproviders: {
    testConnection: function(type, params, projectKey, contextVars, listBuckets) {
        return APIXHRService("POST", API_PATH + "fsproviders/test-connection/", {
            type:type,
            params:JSON.stringify(params),
            projectKey:projectKey,
            contextVars:JSON.stringify(contextVars),
            listBuckets:listBuckets
        });
    },
    browse: function(type, params, projectKey, contextVars, path) {
        return APIXHRService("POST", API_PATH + "fsproviders/fs-browse/", {
            type:type,
            params:JSON.stringify(params),
            projectKey:projectKey,
            contextVars:JSON.stringify(contextVars),
            path:path
        });
    },
    listFiles: function(type, params, projectKey, contextVars, selectionRules, selectedOnly) {
        return APIXHRService("POST", API_PATH + "fsproviders/list-files/", {
            type:type,
            params:JSON.stringify(params),
            projectKey:projectKey,
            contextVars:JSON.stringify(contextVars),
            selectionRules:JSON.stringify(selectionRules),
            selectedOnly:selectedOnly
        });
    }
},
taggableObjects: {
    countAccessibleObjects: function(projectKey) {
        return APIXHRService("GET", API_PATH + "taggable-objects/count-accessible-objects", {
            projectKey: projectKey
        });
    },
    listAccessibleObjects: function(projectKey, type, mode) {
        return APIXHRService("GET", API_PATH + "taggable-objects/list-accessible-objects", {
            projectKey: projectKey,
            type: type,
            mode: mode
        });
    },
    listTags: function(projectKey) {
        return APIXHRService("GET", API_PATH + "taggable-objects/list-tags", {projectKey: projectKey});
    },
    listAllTags: function() {
        return APIXHRService("GET", API_PATH + "taggable-objects/list-all-tags");
    },
    listTagsUsage: function(projectKey, options, spinnerMode) {
        return APIXHRService("GET", API_PATH + "taggable-objects/list-tags-usage", {
            projectKey: projectKey,
            options: JSON.stringify(options)
        }, spinnerMode);
    },
    setTags: function(projectKey, tags) {
        return APIXHRService("POST", API_PATH + "taggable-objects/set-tags", {
            projectKey: projectKey,
            data: JSON.stringify({tags: tags})
        });
    },
    applyTagging: function(projectKey, request)  {
        return APIXHRService("POST", API_PATH + "taggable-objects/apply-tagging/", {
            projectKey: projectKey,
            request: JSON.stringify(request)
        });
    },
    clear: function(requests) {
        return APIXHRService("POST", API_PATH + "taggable-objects/clear/", {
            requests: JSON.stringify(requests)
        });
    },
    checkDeletedObjects: function (requests) {
        return APIXHRService("POST", API_PATH + "taggable-objects/check-deleted-objects/", {
            requests: JSON.stringify(requests)
        });
    },
    computeDeletionImpact: function(request, contextProjectKey) {
        //POST because requests might be large
        return APIXHRService("POST", API_PATH + "taggable-objects/compute-deletion-impact/", {
            request: JSON.stringify(request),
            contextProjectKey: contextProjectKey
        });
    },
    delete: function(request, contextProjectKey) {
        return APIXHRService("POST", API_PATH + "taggable-objects/delete/", {
            request: JSON.stringify(request),
            contextProjectKey: contextProjectKey
        });
    },
    setShortDesc: function(taggableObject, shortDesc) {
        return APIXHRService("POST", API_PATH + "taggable-objects/set-short-desc/", {
            taggableObject: JSON.stringify(taggableObject),
            shortDesc: shortDesc
        });
    },
    getMetadata: function(taggableObject) {
        return APIXHRService("GET", API_PATH + "taggable-objects/get-metadata/", {
            taggableObject: JSON.stringify(taggableObject)
        });
    },
    setMetaData: function(taggableObject, request) {
        return APIXHRService("POST", API_PATH + "taggable-objects/set-metadata/", {
            taggableObject: JSON.stringify(taggableObject),
            request: JSON.stringify(request)
        });
    },

},
datasets: {
    /* CRUD stuff */
    rename: function(projectKey, oldName, newName) {
        return APIXHRService("POST", API_PATH + "datasets/rename/", {projectKey: projectKey, oldName: oldName, newName: newName});
    },
    list: function(projectKey) {
        return APIXHRService("GET", API_PATH + "datasets/list/", {projectKey: projectKey});
    },
    listWithAccessible: function(projectKey) {
        return APIXHRService("GET", API_PATH + "datasets/list-with-accessible/", {projectKey: projectKey});
    },
    listNames: function(projectKey) {
        return APIXHRService("GET", API_PATH + "datasets/list-names/", {projectKey: projectKey});
    },
    listHeaders: function(projectKey) {
        return APIXHRService("GET", API_PATH + "datasets/list-headers/", {projectKey: projectKey});
    },
    // Takes into account Tags Filter
    listHeads: function(projectKey, tagFilter, withStatus) {
        return APIXHRService("GET", API_PATH + "datasets/list-heads/", {projectKey: projectKey, tagFilter: tagFilter, withStatus: withStatus});
    },
    listCreatableDatasetTypes: function(projectKey) {
        return APIXHRService("GET", API_PATH + "datasets/list-creatable-dataset-types/", { projectKey });
    },
    create: function(projectKey, data, zoneId) {
        return APIXHRService("POST", API_PATH + "datasets/create/", {projectKey: projectKey, data:JSON.stringify(data), zoneId});
    },
    checkNameSafety: function(projectKey, datasetName, data) {
        return APIXHRService("POST", API_PATH + "datasets/check-name-safety/", {
            projectKey: projectKey,
            datasetName: datasetName,
            data: JSON.stringify(data)
        });
    },
    checkSaveConflict: function(projectKey, data) {
        return APIXHRService("POST", API_PATH + "datasets/check-save-conflict/", {projectKey: projectKey, data:JSON.stringify(data)});
    },
    save: function(projectKey, data, saveInfo) {
        return APIXHRService("POST", API_PATH + "datasets/save/", {projectKey: projectKey, data:JSON.stringify(data), saveInfo:JSON.stringify(saveInfo)});
    },
    saveWithRecipesFixup: function(projectKey, data, saveInfo, forceRecipesFixup) {
        return APIXHRService("POST", API_PATH + "datasets/save-with-recipes-fixup", {
            projectKey: projectKey,
            data:JSON.stringify(data),
            saveInfo:JSON.stringify(saveInfo),
            forceRecipesFixup:forceRecipesFixup
        });
    },
    exportDS: function(contextProjectKey, projectKey, name, exportParams) {
        return APIXHRService("POST", API_PATH + "datasets/export/", {contextProjectKey:contextProjectKey, projectKey: projectKey, name: name, params: JSON.stringify(exportParams)});
    },
    get: function(projectKey, name, contextProjectKey) {
        return APIXHRService("GET", API_PATH + "datasets/get/", {projectKey: projectKey, name: name, contextProjectKey: contextProjectKey});
    },
    getForExport: function(projectKey, name, contextProjectKey) {
        return APIXHRService("GET", API_PATH + "datasets/get-for-export/", {projectKey: projectKey, name: name, contextProjectKey: contextProjectKey});
    },
    getWithMetricsStatus: function(projectKey, name) {
        return APIXHRService("GET", API_PATH + "datasets/get-with-metrics-status/", {projectKey: projectKey, name: name});
    },
    getSummary: function(projectKey, name) {
        return APIXHRService("GET", API_PATH + "datasets/get-summary/", {projectKey: projectKey, name: name});
    },
    computeRenamingImpact: function(projectKey, name, newName) {
        return APIXHRService("GET", API_PATH + "datasets/compute-renaming-impact/", {projectKey: projectKey, name: name, newName: newName});
    },
    controlTwitterStreaming: function(projectKey, name, start) {
        return APIXHRService("POST", API_PATH + "datasets/control-twitter-streaming/", {projectKey: projectKey, name: name, start: start});
    },
    getTwitterStatus: function(projectKey, name) {
        return APIXHRService("GET", API_PATH + "datasets/get-twitter-status/", {projectKey: projectKey, name: name});
    },
    clearPartitions: function(projectKey, datasetName, partitions) {
        return APIXHRService("POST", API_PATH + "datasets/clear-partitions/", {
            projectKey:projectKey,
            datasetName:datasetName,
            partitions:JSON.stringify(partitions)
        });
    },
    /* Autodetection stuff */
    testAndDetectFormat: function(projectKey, data, detectPossibleFormats, inferStorageTypes) {
        return APIXHRService("POST", API_PATH + "datasets/test-and-detect-format/", {
            projectKey: projectKey,
            data: JSON.stringify(data),
            detectPossibleFormats: detectPossibleFormats,
            inferStorageTypes: inferStorageTypes
        });
    },
    detect_format: function(projectKey, data, inferStorageTypes) {
        return APIXHRService("POST", API_PATH + "datasets/test-and-detect-format/", {
            projectKey: projectKey,
            data: JSON.stringify(data),
            detectPossibleFormats: true,
            inferStorageTypes: inferStorageTypes
        });
    },
    preview: function(projectKey, data, inferStorageTypes) {
        return APIXHRService("POST", API_PATH + "datasets/test-and-detect-format/", {
            projectKey: projectKey,
            data:JSON.stringify(data),
            detectPossibleFormats:false,
            inferStorageTypes: inferStorageTypes
        });
    },
    detectOneFormat: function(projectKey, data, format) {
        return APIXHRService("POST", API_PATH + "datasets/detect-one-format/", {
            projectKey: projectKey,
            data:JSON.stringify(data), format:format
        });
    },
    testFilePartitioning: function(dataset) {
        return APIXHRService("POST", API_PATH + "datasets/test-file-partitioning", {data: JSON.stringify(dataset)});
    },
    testGeneralPartitioning: function(dataset) {
        return APIXHRService("POST", API_PATH + "datasets/test-general-partitioning", {data: JSON.stringify(dataset)});
    },
    detectFilePartitioning: function(dataset) {
        return APIXHRService("POST", API_PATH + "datasets/detect-file-partitioning", {data: JSON.stringify(dataset)});
    },
    listPartitions: function(data) {
        return APIXHRService("POST", API_PATH + "datasets/list-partitions/", {data: JSON.stringify(data)});
    },
    listPartitionsWithName: function(projectKey, datasetName) {
        return APIXHRService("POST", API_PATH + "datasets/list-partitions-with-name/", {
            projectKey: projectKey, datasetName: datasetName
        });
    },
    synchronizeHiveMetastore: function(datasets) {
        return APIXHRService("POST", API_PATH + "datasets/synchronize-hive-metastore", {datasets: JSON.stringify(datasets)});
    },
    synchronizeOneHiveMetastore: function(datasetRef, datasetParams) {
        return APIXHRService("POST", API_PATH + "datasets/synchronize-one-hive-metastore", {ref: JSON.stringify(datasetRef), params: JSON.stringify(datasetParams)});
    },
    updateFromHive : function(projectKey, name) {
        return APIXHRService("POST", API_PATH + "datasets/update-from-hive", {
            projectKey : projectKey, name:name
        });
    },
    checkHiveSync : function(projectKey, name) {
        return APIXHRService("POST", API_PATH + "datasets/check-hive-sync", {
            projectKey : projectKey, name:name
        }, "nospinner");
    },
    /* auto stuff (done backend-side) */
    autoUpdateFormat: function(projectKey, data, detectPossibleFormats, inferStorageTypes) {
        return APIXHRService("POST", API_PATH + "datasets/auto-update-format/", {
            projectKey: projectKey,
            data: JSON.stringify(data),
            detectPossibleFormats: detectPossibleFormats,
            inferStorageTypes: inferStorageTypes
        });
    },
    autoUpdateSQLSchema: function(projectKey, data) {
        return APIXHRService("POST", API_PATH + "datasets/auto-update-sql-schema/", {
            projectKey: projectKey,
            data: JSON.stringify(data)
        });
    },
    /* TODO: Move to a proper API path */
    newManagedDataset: function(projectKey, name, settings) {
        return APIXHRService("POST", API_PATH + "flow/recipes/new-managed-dataset", {
            projectKey: projectKey, name: name,
            settings: JSON.stringify(settings)
        });
    },
    newManagedFolder: function(projectKey, name, settings) {
        return APIXHRService("POST", API_PATH + "flow/recipes/new-managed-folder", {
            projectKey: projectKey, name: name,
            settings: JSON.stringify(settings)
        });
    },
    newModelEvaluationStore: function(projectKey, name, settings) {
        return APIXHRService("POST", API_PATH + "flow/recipes/new-model-evaluation-store", {
            projectKey: projectKey, name: name,
            settings: JSON.stringify(settings)
        });
    },
    newStreamingEndpoint: function(projectKey, name, settings) {
        return APIXHRService("POST", API_PATH + "flow/recipes/new-streaming-endpoint", {
            projectKey: projectKey, name: name,
            settings: JSON.stringify(settings)
        });
    },
    listManagedDatasetConnections: function() {
        return APIXHRService("GET", API_PATH + "flow/recipes/list-managed-dataset-connections");
    },
    listManagedUploadableConnections: function(projectKey) {
        return APIXHRService("GET", API_PATH + "flow/recipes/list-managed-uploadable-connections",{
            projectKey:projectKey
        });
    },
    getManagedDatasetOptions: function(recipeData, role) {
        return APIXHRService("POST", API_PATH + "flow/recipes/get-managed-dataset-options", {
            recipeData: JSON.stringify(recipeData), role: role
        });
    },
    getManagedDatasetOptionsNoContext: function(projectKey) {
        return APIXHRService("GET", API_PATH + "flow/recipes/get-managed-dataset-options-no-context", { projectKey: projectKey });
    },
    getManagedFolderOptions: function(recipeData, role) {
        return APIXHRService("POST", API_PATH + "flow/recipes/get-managed-folder-options", {
            recipeData: JSON.stringify(recipeData), role: role
        });
    },
    getManagedFolderOptionsNoContext: function(projectKey) {
        return APIXHRService("GET", API_PATH + "flow/recipes/get-managed-folder-options-no-context", { projectKey: projectKey });
    },
    getModelEvaluationStoreOptions: function(recipeData, role) {
        return APIXHRService("POST", API_PATH + "flow/recipes/get-model-evaluation-store-options", {
            recipeData: JSON.stringify(recipeData), role: role
        });
    },
    getModelEvaluationStoreOptionsNoContext: function(projectKey) {
        return APIXHRService("GET", API_PATH + "flow/recipes/get-model-evaluation-store-options-no-context", { projectKey: projectKey });
    },
    getStreamingEndpointOptions: function(recipeData, role) {
        return APIXHRService("POST", API_PATH + "flow/recipes/get-streaming-endpoint-options", {
            recipeData: JSON.stringify(recipeData), role: role
        });
    },
    getStreamingEndpointOptionsNoContext: function(projectKey) {
        return APIXHRService("GET", API_PATH + "flow/recipes/get-streaming-endpoint-options-no-context", { projectKey: projectKey });
    },
    listRemoteDatasetConnections: function() {
        return APIXHRService("GET", API_PATH + "flow/recipes/list-remote-dataset-connections");
    },
    listFSProviderTypes: function(withNonWritable) {
        return APIXHRService("GET", API_PATH + "flow/recipes/list-fs-providers", {withNonWritable : withNonWritable});
    },
    listAllUsable: function(projectKey) {
        return APIXHRService("GET", API_PATH + "datasets/list-all-usable",  {projectKey:projectKey});
    },
    getForTimeRange: function(projectKey, name, computeRecords, runChecks, forceRefresh, rangeStart, rangeEnd) {
        return APIXHRService("GET", API_PATH + "datasets/get-status-for-time-range/", {
            projectKey: projectKey,
            name: name,
            computeRecords: computeRecords,
            runChecks: runChecks,
            forceRefresh: forceRefresh,
            rangeStart: rangeStart,
            rangeEnd: rangeEnd
        });
    },
    getFullStatus: function(projectKey, name, computeRecords, runChecks, forceRefresh) {
        return APIXHRService("GET", API_PATH + "datasets/get-full-status/", {
            projectKey: projectKey,
            name: name,
            computeRecords: computeRecords,
            runChecks: runChecks,
            forceRefresh: forceRefresh
        });
    },
    getHead: function(contextProjectKey, projectKey, name) {
        return APIXHRService("GET", API_PATH + "datasets/get-head", {contextProjectKey: contextProjectKey, projectKey: projectKey, name: name});
    },
    getFullInfo: function(contextProjectKey, projectKey, name) {
        return APIXHRService("GET", API_PATH + "datasets/get-full-info", {contextProjectKey: contextProjectKey, projectKey: projectKey, name: name});
    },
    /** Futures */
    //TODO @flow deprecated
    getRefreshedSummaryStatus: function(projectKey, datasetName, computeRecords, forceRecompute) {
        return APIXHRService("POST", API_PATH + "datasets/get-refreshed-summary-status", {
            projectKey: projectKey,
            datasetName:datasetName,
            computeRecords:computeRecords,
            forceRecompute: forceRecompute
        });
    },
    refreshSummaries: function(datasets, computeRecords, forceRecompute) {
        return APIXHRService("POST", API_PATH + "datasets/refresh-summaries", {
            datasets: JSON.stringify(datasets),
            computeRecords: computeRecords,
            forceRecompute: forceRecompute
        });
    },
    markAsBuilt: function(datasets) {
        return APIXHRService("POST", API_PATH + "datasets/mark-as-built", {
            datasets: JSON.stringify(datasets)
        });
    },
    testSchemaConsistency: function(data) {
        return APIXHRService("POST", API_PATH + "datasets/test-schema-consistency", {
            data: JSON.stringify(data)
        });
    },
    testSchemaConsistencyOnAllFiles: function(data) {
        return APIXHRService("POST", API_PATH + "datasets/test-schema-consistency-on-all-files", {
            data: JSON.stringify(data)
        });
    },
    listNotebooks: function(projectKey, datasetSmartName) {
        return APIXHRService("POST", API_PATH + "datasets/list-notebooks", {
            projectKey: projectKey, datasetSmartName: datasetSmartName
        });
    },
    setVirtualizable: function(items, virtualizable) {
        return APIXHRService("POST", API_PATH + "datasets/set-virtualizable", {
            items: JSON.stringify(items),
            virtualizable: virtualizable
        });
    },
    setAutoCountOfRecords: function(items, autoCountOfRecords) {
        return APIXHRService("POST", API_PATH + "datasets/set-auto-count-of-records", {
            items: JSON.stringify(items),
            autoCountOfRecords: autoCountOfRecords
        });
    },
    managedSQL: {
        test: function(projectKey, dataset, maxSamples, connectionOnly) {
            return APIXHRService("POST", API_PATH + "datasets/managed-sql/test/", {projectKey: projectKey, data: JSON.stringify(dataset),
                    maxSamples: maxSamples, connectionOnly: connectionOnly });
        },
        createTable: function(projectKey, dataset) {
            return APIXHRService("POST", API_PATH + "datasets/managed-sql/create-table/", {projectKey: projectKey, data: JSON.stringify(dataset)});
        },
        dropTable: function(projectKey, dataset) {
            return APIXHRService("POST", API_PATH + "datasets/managed-sql/drop-table/", {projectKey: projectKey, data: JSON.stringify(dataset)});
        }
    },
    externalSQL: {
        test: function(projectKey, dataset, maxSamples, listTables, testTableOrQuery) {
            return APIXHRService("POST", API_PATH + "datasets/external-sql/test/", {
                projectKey: projectKey,
                data: JSON.stringify(dataset),
                maxSamples: maxSamples,
                listTables: listTables,
                testTableOrQuery: testTableOrQuery
            });
        },
        listPartitions: function(projectKey, dataset) {
            return APIXHRService("POST", API_PATH + "datasets/external-sql/list-partitions/", {projectKey: projectKey, data: JSON.stringify(dataset)});
        }
    },
    elasticsearch: {
        test: function(projectKey, dataset, connectionOnly) {
            return APIXHRService("POST", API_PATH + "datasets/elasticsearch/test", {
                projectKey: projectKey,
                data: JSON.stringify(dataset),
                connectionOnly: connectionOnly
            });
        }
    },
    mongoDB: {
    	test: function(projectKey, dataset, connectionOnly, inferStorageTypes) {
            return APIXHRService("POST", API_PATH + "datasets/mongodb/test", {projectKey: projectKey, data: JSON.stringify(dataset),
                connectionOnly: connectionOnly,
                inferStorageTypes: inferStorageTypes == null ? false : inferStorageTypes });
    	},
    	createCollection: function(dataset) {
    		return APIXHRService("POST", API_PATH + "datasets/mongodb/create-collection", {data: JSON.stringify(dataset) });
    	},
    	deleteCollection: function(dataset) {
            return APIXHRService("POST", API_PATH + "datasets/mongodb/delete-collection", {data: JSON.stringify(dataset) });
    	}
    },
    dynamoDB: {
        	test: function(projectKey, dataset, connectionOnly, inferStorageTypes, listTables) {
                return APIXHRService("POST", API_PATH + "datasets/dynamodb/test", {projectKey: projectKey, data: JSON.stringify(dataset),
                    connectionOnly: connectionOnly,
                    listTables: listTables,
                    inferStorageTypes: inferStorageTypes == null ? false : inferStorageTypes });
        	},
        	createTable: function(dataset) {
        		return APIXHRService("POST", API_PATH + "datasets/dynamodb/create-table", {data: JSON.stringify(dataset) });
        	},
        	deleteTable: function(dataset) {
                return APIXHRService("POST", API_PATH + "datasets/dynamodb/delete-table", {data: JSON.stringify(dataset) });
        	},
        	updateIndex: function(dataset) {
                    		return APIXHRService("POST", API_PATH + "datasets/dynamodb/update-index", {data: JSON.stringify(dataset) });
            }
    },
    cassandra: {
    	test: function(projectKey, dataset, connectionOnly) {
            return APIXHRService("POST", API_PATH + "datasets/cassandra/test", {projectKey: projectKey, data: JSON.stringify(dataset),
                connectionOnly: connectionOnly });
    	},
    	createTable: function(dataset) {
    		return APIXHRService("POST", API_PATH + "datasets/cassandra/create-table", {data: JSON.stringify(dataset) });
    	},
    	dropTable: function(dataset) {
    		return APIXHRService("POST", API_PATH + "datasets/cassandra/drop-table", {data: JSON.stringify(dataset) });
    	}
    },
    editable: {
        getData: function(projectKey, dataset) {
            return APIXHRService("GET", API_PATH + "datasets/editable/get", {
                projectKey: projectKey,
                dataset: dataset
            });
        },
        save: function(projectKey, dataset, data) {
            return APIXHRService("POST", API_PATH + "datasets/editable/save", {
                projectKey: projectKey,
                dataset: dataset,
                data: data
            });
        },
        import: function(projectKey, dataset, data) {
            return APIXHRService("POST", API_PATH + "datasets/editable/import", {
                projectKey: projectKey,
                dataset: dataset, data: data
            });
        },
        test: function(projectKey, dataset) {
            return APIXHRService("POST", API_PATH + "datasets/editable/test", {
                projectKey: projectKey,
                dataset: dataset
            });
        }
    },
    customDataset: {
        test: function(projectKey, dataset, showPreview) {
            return APIXHRService("POST", API_PATH + "datasets/custom-dataset/test", {
                projectKey: projectKey,
                dataset: JSON.stringify(dataset),
                showPreview: showPreview
            })
        }
    },
    jobsdb: {
        test: function(projectKey, dataset) {
            return APIXHRService("POST", API_PATH + "datasets/jobsdb/test/", {projectKey: projectKey, data: JSON.stringify(dataset)});
        }
    },
    statsdb: {
        test: function(projectKey, dataset) {
            return APIXHRService("POST", API_PATH + "datasets/statsdb/test/", {projectKey: projectKey, data: JSON.stringify(dataset)});
        }
    },
    /* Static data */
    get_common_charsets: function() {
        return APIXHRService("GET", API_PATH + "datasets/get-common-charsets/", {});
    },
    get_types: function() {
        return APIXHRService("GET", API_PATH + "datasets/get-types/", {});
    },
    get_format_types: function() {
        return APIXHRService("GET", API_PATH + "datasets/get-format-types/", {});
    },
    /* OpenStreetMap specific */
    osm: {
        get_data_files: function() {
            return APIXHRService("GET", API_PATH + "datasets/osm/get-data-files", {});
        }
    },
    upload: {
        /* Returns {id: uploadBoxId } */
        createUploadBox: function() {
            return APIXHRService("POST", API_PATH + "datasets/upload/create-upload-box", {});
        },
        /* This method should only be called in case of premature abort.
         * In case of normal dataset creation, the upload box is automatically purged */
        deleteUploadBox: function(uploadBoxId) {
            return APIXHRService("POST", API_PATH + "datasets/upload/delete-upload-box");
        },
        createDataset: function(projectKey, datasetName, uploadBoxId) {
            return APIXHRService("POST", API_PATH + "datasets/upload/create-dataset", {
                projectKey: projectKey,
                datasetName:datasetName,
                uploadBoxId: uploadBoxId
            });
        },
        /* Returns [ {path, length}] */
        listFiles: function(projectKey, datasetName) {
            return APIXHRService("GET", API_PATH + "datasets/upload/list-files", {projectKey: projectKey, datasetName:datasetName});
        },
        /* Returns [ {path, length}] */
        addFileToDataset: function(projectKey, file, dataset, callback) {
            return uploadFileRequest("datasets/upload/add-file", function(formdata) {
                formdata.append("projectKey", projectKey);
                formdata.append("file", file);
                formdata.append('dataset', JSON.stringify(dataset));
            }, callback);
        },
        removeFile: function(projectKey, dataset, path) {
            return APIXHRService("POST", API_PATH + "datasets/upload/remove-file", {
                projectKey: projectKey,
                dataset:JSON.stringify(dataset),
                fileName:path
            });
        }
    },
    getRequirements: function(projectKey, datasetType) {
        return APIXHRService("GET", API_PATH + "datasets/get-requirements", {
            projectKey:projectKey,
            datasetType:datasetType
        });
    },
    listAvailableMetrics: function(projectKey, datasetName) {
        return APIXHRService("GET", API_PATH + "datasets/list-available-metrics", {
            projectKey: projectKey,
            datasetName: datasetName
        });
    },
    saveMetrics: function(projectKey, datasetName, metrics, checks) {
        return APIXHRService("POST", API_PATH + "datasets/save-metrics", {
            projectKey: projectKey,
            datasetName: datasetName,
            metricsData: JSON.stringify(metrics),
            checksData: JSON.stringify(checks)
        });
    },
    computeMetrics: function(projectKey, datasetName, partitionId, allPartitions) {
        return APIXHRService("GET", API_PATH + "datasets/compute-metrics", {
            projectKey: projectKey,
            datasetName: datasetName,
            partitionId: partitionId,
            allPartitions: allPartitions
        });
    },
	computeColumnMetrics : function(projectKey, datasetName, columnName, partitionId, allPartitions) {
		return APIXHRService("GET", API_PATH + "datasets/compute-column-metrics",{
			projectKey : projectKey,
			datasetName : datasetName,
			columnName : columnName,
			partitionId : partitionId,
			allPartitions: allPartitions
		});
	},
	computeDetailedColumnMetrics : function(projectKey, datasetName, columnName, statisticsConfig, partitionId, forceRefresh) {
		return APIXHRService("GET", API_PATH + "datasets/compute-detailed-column-metrics",{
			projectKey : projectKey,
			datasetName : datasetName,
			columnName : columnName,
			statisticsConfig : JSON.stringify(statisticsConfig),
			partitionId : partitionId,
			forceRefresh : forceRefresh
		});
	},
    computePlan: function(projectKey, datasetName, metrics) {
        return APIXHRService("POST", API_PATH + "datasets/compute-plan", {
            projectKey: projectKey,
            datasetName: datasetName,
            metricsData: JSON.stringify(metrics)
        });
    },
    computeProbe: function(projectKey, datasetName, partitionId, allPartitions, metrics) {
        return APIXHRService("POST", API_PATH + "datasets/compute-probe", {
            projectKey: projectKey,
            datasetName: datasetName,
            partitionId: partitionId,
            allPartitions: allPartitions,
            data: JSON.stringify(metrics)
        });
    },
    runChecks: function(projectKey, datasetName, partitionId, allPartitions) {
        return APIXHRService("GET", API_PATH + "datasets/run-checks", {
            projectKey: projectKey,
            datasetName: datasetName,
            partitionId: partitionId,
            allPartitions: allPartitions
        });
    },
    runCheck: function(projectKey, datasetName, partitionId, allPartitions, metricsChecks) {
        return APIXHRService("POST", API_PATH + "datasets/run-check", {
            projectKey: projectKey,
            datasetName: datasetName,
            partitionId: partitionId,
            allPartitions: allPartitions,
            data: JSON.stringify(metricsChecks)
        });
    },
    getPreparedMetricHistory: function(projectKey, datasetName, partitionId, metric, metricId) {
        return APIXHRService("GET", API_PATH + "datasets/get-prepared-metric-history", {
            projectKey: projectKey,
            datasetName: datasetName,
            partitionId: partitionId,
            data: JSON.stringify(metric),
            metricId: metricId
        });
    },
    getPreparedMetricHistories: function(projectKey, datasetName, displayedState) {
        return APIXHRService("POST", API_PATH + "datasets/get-prepared-metric-histories", {
            projectKey: projectKey,
            datasetName: datasetName,
            data: JSON.stringify(displayedState || {})
        });
    },
    getPreparedMetricPartitions: function(projectKey, datasetName, displayedState) {
        return APIXHRService("POST", API_PATH + "datasets/get-prepared-metric-partitions", {
            projectKey: projectKey,
            datasetName: datasetName,
            data: JSON.stringify(displayedState || {})
        });
    },
	getPreparedMetricColumns : function(projectKey, datasetName, displayedState) {
		return APIXHRService("POST", API_PATH + "datasets/get-prepared-metric-columns",{
			projectKey : projectKey,
			datasetName : datasetName,
			data : JSON.stringify(displayedState || {})
    	});
	},
    listComputedMetrics: function(projectKey, datasetName) {
        return APIXHRService("GET", API_PATH + "datasets/list-computed-metrics", {
            projectKey: projectKey,
            datasetName: datasetName
        });
    },
    getPartitionListMetric: function(projectKey, datasetName ) {
        return APIXHRService("GET", API_PATH + "datasets/get-partition-list-metric", {
            projectKey: projectKey,
            datasetName: datasetName
        });
    },
    refreshPartitionListMetric: function(projectKey, datasetName ) {
        return APIXHRService("GET", API_PATH + "datasets/refresh-partition-list-metric", {
            projectKey: projectKey,
            datasetName: datasetName
        });
    },
    createMetricsDataset: function(projectKey, datasetName, view, partition, filter) {
        return APIXHRService("GET", API_PATH + "datasets/create-metrics-dataset", {
            projectKey: projectKey,
            objectId: datasetName,
            view: view,
            partition: partition,
            filter: filter
        });
    },
    getCachedNbRecords: function(projectKey, datasetName) {
        return APIXHRService("GET", API_PATH + "datasets/get-cached-nb-records", {
            projectKey: projectKey,
            datasetName: datasetName
        });
    },
    updateNbRecords: function(projectKey, datasetName, recomputeAll) {
        return APIXHRService("GET", API_PATH + "datasets/update-nb-records", {
            projectKey: projectKey,
            datasetName: datasetName,
            recomputeAll: recomputeAll
        });
    },
    getCheckHistories: function(projectKey, datasetName, displayedState) {
        return APIXHRService("POST", API_PATH + "datasets/get-prepared-check-histories", {
            projectKey: projectKey,
            datasetName: datasetName,
            data: JSON.stringify(displayedState || {})
        });
    },
    listComputedChecks: function(projectKey, datasetName) {
        return APIXHRService("GET", API_PATH + "datasets/list-computed-checks", {
            projectKey: projectKey,
            datasetName: datasetName
        });
    },
    getHint: function(projectKey, datasetName, probe) {
        return APIXHRService("POST", API_PATH + "datasets/get-hint", {
            projectKey: projectKey,
            datasetName: datasetName,
            data: JSON.stringify(probe)
        });
    },
    clearMetrics: function(projectKey, datasetName, partition) {
        return APIXHRService("GET", API_PATH + "datasets/clear-metrics", {
            projectKey: projectKey,
            datasetName: datasetName,
            partition: partition
        });
    },
    getFullSampleStatisticsConfig : function(contextProjectKey, projectKey, datasetName) {
    	return APIXHRService("GET", API_PATH + "datasets/get-full-sample-statistics-config",{
            contextProjectKey: contextProjectKey,
    		projectKey : projectKey,
        	datasetName : datasetName
        });
	}
},
jupyterNotebooks: {
    get: function(projectKey, notebookName, kernelName) {
        if (kernelName) {
            return APIXHRService("GET", "/jupyter/api/contents/" + projectKey + "/" + notebookName + ".ipynb?kernel_name=" + kernelName);
        } else {
            return APIXHRService("GET", "/jupyter/api/contents/" + projectKey + "/" + notebookName + ".ipynb");
        }
    },
    getNotebook: function(projectKey, notebookName, kernelName) {
        return APIXHRService("GET", API_PATH + "jupyter/get-notebook", {projectKey:projectKey, name:notebookName, kernelName:kernelName});
    },
    createOnDataset: function(projectKey, datasetSmartName, language) {
        return APIXHRService("POST", API_PATH + "jupyter/new-dataset-notebook", {
            projectKey: projectKey,
            datasetSmartName: datasetSmartName,
            language: language
        });
    },
    create: function(projectKey, language) {
        return APIXHRService("POST", API_PATH + "jupyter/new-notebook", {
            projectKey: projectKey,
            language: language
        });
    },
    unload: function(session_id) {
        return APIXHRService("DELETE", JUPYTER_API_PATH + "api/sessions/" + session_id, {
        });
    },
    listHeads: function(projectKey, tagFilter) {
        return APIXHRService("GET", API_PATH + "jupyter/list-heads", {projectKey: projectKey, tagFilter: tagFilter});
    },
    listAccessible: function() {
        return APIXHRService("GET", API_PATH + "jupyter/list-accessible-notebooks");
    },
    listAll: function() {
        return APIXHRService("GET", API_PATH + "jupyter/list-all-notebooks");
    },
    mapNotebooksToExports: function(projectKey) {
        return APIXHRService("GET", API_PATH + "jupyter/map-notebook-exports", {projectKey: projectKey});
    },
    newNotebookWithTemplate: function(projectKey, baseName, templateDesc, codeEnv, containerConf) {
        return APIXHRService("POST", API_PATH + "jupyter/new-notebook-with-template", {
            projectKey: projectKey,
            baseName: baseName,
            templateDesc: JSON.stringify(templateDesc),
            codeEnv:codeEnv,
            containerConf:containerConf
        });
    },
    newNotebookFromFile: function(projectKey, baseName, language, datasetSmartName, file) {
        return uploadFileRequest('jupyter/new-notebook-from-file', formdata => {
            formdata.append('projectKey', projectKey);
            formdata.append('baseName', baseName);
            formdata.append('language', language);
            if (datasetSmartName) {
                formdata.append('datasetSmartName', datasetSmartName);
            }
            formdata.append('file', file);
        }, null);
    },
    newNotebookForDataset: function(projectKey, baseName, datasetSmartName, templateDesc, codeEnv, containerConf) {
        return APIXHRService("POST", API_PATH + "jupyter/new-notebook-for-dataset", {
            projectKey: projectKey,
            baseName: baseName,
            datasetSmartName: datasetSmartName,
            templateDesc: JSON.stringify(templateDesc),
            codeEnv:codeEnv,
            containerConf:containerConf
        });
    },
    createRecipeFromNotebook: function(projectKey, notebook, recipe) {
        return APIXHRService("POST", API_PATH + "jupyter/create-recipe-from-notebook", {
            projectKey: projectKey,
            notebook: notebook,
            recipe: JSON.stringify(recipe)
        });
    },
    saveBackToRecipe: function(projectKey, notebook) {
        return APIXHRService("POST", API_PATH + "jupyter/save-back-to-recipe", {
            projectKey: projectKey,
            notebook: notebook
        });
    },
    export: { // Should mostly stay in sync with reports.snapshots
        create: function(projectKey, notebookSmartName, execute) {
	    	return APIXHRService("POST", API_PATH + "jupyter/export/create", {
	            projectKey: projectKey,
	            notebookSmartName: notebookSmartName,
                execute: !!execute
	        });
    	},
    	get: function(projectKey, notebookSmartName, timestamp) {
    		return APIXHRService("GET", API_PATH + "jupyter/export/get", {
	            projectKey: projectKey,
	            notebookSmartName: notebookSmartName,
	            timestamp: timestamp
	        });
    	},
    	getLast: function(projectKey, notebookSmartName) {
    		return APIXHRService("GET", API_PATH + "jupyter/export/get-last", {
	            projectKey: projectKey,
	            notebookSmartName: notebookSmartName
	        });
    	},
        list: function(projectKey, notebookSmartName, withContent) {
    		return APIXHRService("GET", API_PATH + "jupyter/export/list", {
	            projectKey: projectKey,
	            notebookSmartName: notebookSmartName,
	            withContent: withContent
	        });
    	}
    },
    git: {
        listRemoteNotebooks: function(repository, ref) {
            return APIXHRService("GET", API_PATH + "jupyter/git/list-remote-notebooks", {repository, ref});
        },
        importNotebooks: function(projectKey, repository, ref, notebooks) {
            return APIXHRService("POST", API_PATH + "jupyter/git/import-remote-notebooks", {projectKey, repository, ref, notebooks: JSON.stringify(notebooks)});
        },
        getConflictingNotebooks: function(projectKey, notebooks, checkPull = false) {
            return APIXHRService("GET", API_PATH + "jupyter/git/get-conflicting-notebooks", {projectKey, checkPull, notebooks: JSON.stringify(notebooks)});
        },
        pushNotebooksToGit: function(projectKey, notebooks, message) {
            return APIXHRService("POST", API_PATH + "jupyter/git/push-remote-notebooks", {projectKey, message, notebooksWithHash: JSON.stringify(notebooks.map(n => ({notebookName: n.notebookName, remoteHashFileDuringConflict: n.remoteHashFileDuringConflict})))});
        },
        pullNotebooks: function(projectKey, notebooks) {
            return APIXHRService("POST", API_PATH + "jupyter/git/pull-remote-notebooks", {projectKey, notebooks: JSON.stringify(notebooks)});
        },
        editReference: function(projectKey, notebook, gitReference) {
            return APIXHRService("POST", API_PATH + "jupyter/git/edit-reference", {projectKey, notebook, reference: JSON.stringify(gitReference)});
        },
        unlinkReference: function(projectKey, notebook) {
            return APIXHRService("POST", API_PATH + "jupyter/git/unlink-reference", {projectKey, notebook});
        },
    }
},
continuousActivities: {
    start : function(projectKey, recipeId, loopParams) {
        return APIXHRService("POST", API_PATH + "continuous-activities/start", {projectKey: projectKey, recipeId:recipeId, loopParams:JSON.stringify(loopParams)});
    },
    stop : function(projectKey, recipeId) {
        return APIXHRService("POST", API_PATH + "continuous-activities/stop", {projectKey: projectKey, recipeId:recipeId});
    },
    listProjectStates: function(projectKey) {
        return APIXHRService("GET", API_PATH + "continuous-activities/list-project-states", {projectKey: projectKey});
    },
    getState: function(projectKey, continuousActivityId) {
        return APIXHRService("GET", API_PATH + "continuous-activities/get-state", {
            projectKey: projectKey, continuousActivityId: continuousActivityId
        }, 'nospinner');
    },
    getStates: function(projectKey) {
        return APIXHRService("GET", API_PATH + "continuous-activities/get-states", {
            projectKey: projectKey
        });
    },
    getFullInfo: function(projectKey, continuousActivityId) {
        return APIXHRService("GET", API_PATH + "continuous-activities/get-full-info", {
            projectKey: projectKey, continuousActivityId: continuousActivityId
        });
    },
    listLastRuns : function(projectKey, continuousActivityId) {
        return APIXHRService("GET", API_PATH + "continuous-activities/list-last-runs", {
            projectKey: projectKey, continuousActivityId: continuousActivityId
        });
    },
    listRunLastAttempts: function(projectKey, continuousActivityId, runId) {
        return APIXHRService("GET", API_PATH + "continuous-activities/list-run-last-attempts", {
            projectKey: projectKey, continuousActivityId: continuousActivityId,
            runId: runId,
        });
    },
    smartTailAttemptLog: function(projectKey, continuousActivityId, runId, attemptId) {
        return APIXHRService("GET", API_PATH + "continuous-activities/smart-tail-attempt-log", {
            projectKey: projectKey, continuousActivityId: continuousActivityId,
            runId: runId, attemptId: attemptId
        });
    },
    getGlobalStatus : function(){
        return APIXHRService("GET", API_PATH + "continuous-activities/get-global-status")
    },
    getDownloadURL: function(projectKey, continuousActivityId, runId, attemptId) {
        return API_PATH + "continuous-activities/cat-attempt-log?"
                 + "projectKey=" + encodeURIComponent(projectKey)
                 + "&continuousActivityId=" + encodeURIComponent(continuousActivityId)
                 + "&runId=" + encodeURIComponent(runId)
                 + "&attemptId=" + encodeURIComponent(attemptId);
    },
},
streamingEndpoints:  {
    listHeads: function(projectKey) {
        return APIXHRService("GET", API_PATH + "streaming-endpoints/list", {projectKey:projectKey})
    },
    listNames: function(projectKey) {
        return APIXHRService("GET", API_PATH + "streaming-endpoints/list-names/", {projectKey: projectKey});
    },
    create:function(projectKey, streamingEndpoint) {
      return APIXHRService("POST", API_PATH + "streaming-endpoints/create", {
            projectKey:projectKey,
            streamingEndpoint: JSON.stringify(streamingEndpoint
        )})
    },
    get: function(projectKey, id) {
        return APIXHRService("GET", API_PATH + "streaming-endpoints/get", {projectKey:projectKey, id:id})
    },
    save: function(projectKey, streamingEndpoint, saveInfo) {
        return APIXHRService("POST", API_PATH + "streaming-endpoints/save", {
            projectKey:projectKey,
            streamingEndpoint: JSON.stringify(streamingEndpoint),
            saveInfo:JSON.stringify(saveInfo)
        })
    },
    getFullInfo: function(projectKey, id) {
        return APIXHRService("GET", API_PATH + "streaming-endpoints/get-full-info", {projectKey:projectKey, id:id})
    },
    collectSample: function(projectKey, streamingEndpoint, limit, timeout, inferStorageTypes) {
        return APIXHRService("GET", API_PATH + "streaming-endpoints/collect-sample", {projectKey:projectKey, streamingEndpoint:JSON.stringify(streamingEndpoint), limit:limit, timeout:timeout, inferStorageTypes:inferStorageTypes})
    },
    testKafka: function(projectKey, streamingEndpoint) {
        return APIXHRService("POST", API_PATH + "streaming-endpoints/test-kafka", {projectKey:projectKey, streamingEndpoint:JSON.stringify(streamingEndpoint)})
    },
    testSQS: function(projectKey, streamingEndpoint) {
        return APIXHRService("POST", API_PATH + "streaming-endpoints/test-sqs", {projectKey:projectKey, streamingEndpoint:JSON.stringify(streamingEndpoint)})
    },
    testHttpSSE: function(projectKey, streamingEndpoint) {
        return APIXHRService("POST", API_PATH + "streaming-endpoints/test-httpsse", {projectKey:projectKey, streamingEndpoint:JSON.stringify(streamingEndpoint)})
    },
    syncKsql: function(projectKey, streamingEndpointId, terminateQueries) {
        return APIXHRService("POST", API_PATH + "streaming-endpoints/sync-ksql", {projectKey:projectKey, streamingEndpointId:streamingEndpointId, terminateQueries:terminateQueries || false})
    },
    fetchKafkaSchema: function(projectKey, streamingEndpoint) {
        return APIXHRService("POST", API_PATH + "streaming-endpoints/fetch-kafka-schema", {projectKey:projectKey, streamingEndpoint:JSON.stringify(streamingEndpoint)})
    }
},
flow: {
    zones: {
        create: (projectKey, name, color) => {
            return APIXHRService("POST", API_PATH + "flow/create-zone", { projectKey, name, color});
        },
        moveItems: (projectKey, zoneId, movingItems) => {
            return APIXHRService("POST", API_PATH + "flow/move-to-zone", { projectKey, zoneId, movingItems: JSON.stringify(movingItems)});
        },
        shareItems: (projectKey, zoneId, sharingItems) => {
            return APIXHRService("POST", API_PATH + "flow/share-to-zone", { projectKey, zoneId, sharingItems: JSON.stringify(sharingItems)});
        },
        unshareItems: (projectKey, zoneIds, sharingItems) => {
            return APIXHRService("POST", API_PATH + "flow/unshare-to-zone", { projectKey, zoneIds: JSON.stringify(zoneIds), sharingItems: JSON.stringify(sharingItems)});
        },
        list: projectKey => {
            return APIXHRService("GET", API_PATH + "flow/zones", { projectKey });
        },
        edit: (projectKey, id, name, color) => {
            return APIXHRService("POST", API_PATH + "flow/edit-zone", { projectKey, zoneId: id, newName: name, newColor: color});
        },
        delete: (projectKey, id) => {
            return APIXHRService("POST", `${API_PATH}flow/zones/${id}/delete`, { projectKey });
        },
        getZoneId: (projectKey, item) => {
            return APIXHRService("POST", `${API_PATH}flow/retrieve-zone-item`, { projectKey, item: JSON.stringify(item) });
        }
    },
    jobs: {
        /* ********** Status ************ */
        listLastJobs: function(projectKey, nb) {
            return APIXHRService("GET", API_PATH + "flow/jobs/list-last-jobs", {projectKey: projectKey, nb:nb});
        },
        listRunningJobs: function() {
            return APIXHRService("GET", API_PATH + "flow/jobs/list-running-jobs");
        },
        listAllRunningJobs: function() {
            return APIXHRService("GET", API_PATH + "flow/jobs/list-all-running-jobs");
        },
        getJobStatus: function(projectKey, jobId) {
            return APIXHRService("GET", API_PATH + "flow/jobs/get-job-status", {
                projectKey: projectKey,
                jobId: jobId,
            });
        },
        fetchYarnLogs: function(projectKey, jobId) {
            return APIXHRService("GET", API_PATH + "flow/jobs/fetch-yarn-logs", {
                projectKey: projectKey,
                jobId: jobId,
            });
        },
        getJobGraphURL: function(projectKey, jobId, type) {
            return API_PATH + "flow/jobs/get-job-graph?jobId=" + jobId + "&projectKey=" + projectKey+ "&type=" + type;
        },
        getJobGraphData: function(projectKey, jobId, type) {
            return APIXHRService("GET", API_PATH +  "flow/jobs/get-job-graph?jobId=" + jobId + "&projectKey=" + projectKey+ "&type=" + type);
        },
        tailJobLog: function(projectKey, jobId) {
            return APIXHRService("GET", API_PATH + "flow/jobs/tail-job-log", {
                projectKey: projectKey,
                jobId: jobId,
            });
        },
        getJobDiagnosisURL: function(projectKey, jobId) {
            return API_PATH + "flow/jobs/download-job-diagnosis?"
                     + "projectKey=" + encodeURIComponent(projectKey)
                     + "&jobId=" + encodeURIComponent(jobId);
        },
        smartTailActivityLog: function(projectKey, jobId, activityId, nbLines) {
            return APIXHRService("GET", API_PATH + "flow/jobs/smart-tail-activity-log", {
                projectKey: projectKey,
                jobId: jobId, activityId: activityId, nbLines: nbLines
            });
        },

        /* ************* Execution *********** */
        startPreview: function(data) {
            return APIXHRService("POST", API_PATH + "flow/jobs/start-preview/", {
                data: JSON.stringify(data)
            });
        },
        getPreviewResult: function(jobProjectKey, jobId) {
            return APIXHRService("GET", API_PATH + "flow/jobs/get-preview-result", {
                jobProjectKey: jobProjectKey,
                jobId: jobId
            });
        },
        validateRunFully: function(jobProjectKey, jobId, skippedActivityIds) {
            return APIXHRService("POST", API_PATH + "flow/jobs/validate-run-fully", {
                jobProjectKey: jobProjectKey,
                jobId: jobId,
                skippedActivityIds: JSON.stringify(skippedActivityIds)
            });
        },
        start: function(data) {
            return APIXHRService("POST", API_PATH + "flow/jobs/start/", {
                data: JSON.stringify(data)
            });
        },
        abort: function(jobProjectKey, jobId) {
            return APIXHRService("POST", API_PATH + "flow/jobs/abort/", {
                jobProjectKey: jobProjectKey,
                jobId: jobId
            });
        },
        retry: function(jobProjectKey, jobId) {
            return APIXHRService("POST", API_PATH + "flow/jobs/retry/", {
                jobProjectKey: jobProjectKey,
                jobId: jobId
            });
        },
        /* ***************** List handling *************** */
        clearLogsWithFilter: function(jobProjectKey, filter) {
            return  APIXHRService("POST", API_PATH + "flow/jobs/clear-logs-with-filter/", {
                jobProjectKey: jobProjectKey,
                filter:filter
            });
        },
        clearLogs: function(jobProjectKey, jobId) {
            return  APIXHRService("POST", API_PATH + "flow/jobs/clear-logs/", {
                jobProjectKey: jobProjectKey,
                jobId:jobId
            });
        }
    },
    status: {
        getDailyPartitionedDatasets: function() {
            return APIXHRService("GET", API_PATH + "flow/status/get-daily-partitioned-datasets");
        },
        initMultiStatusOperation: function() {
            return APIXHRService("GET", API_PATH + "flow/status/init-multi-status-operation");
        },
        getDatasetPartitionStatusMulti: function(operationId, dataset, partition) {
            return APIXHRService("GET", API_PATH + "flow/status/get-dataset-partition-status-multi", {
                operationId: operationId,
                dataset:dataset,
                partition:partition
            });
        }
    },
    snippets: {
    	getSnippets: function(snippetType, categories) {
            return APIXHRService("GET", API_PATH + "flow/snippets/get", {snippetType: snippetType, categories: categories.join(",")});
    	},
    	saveSnippet: function(snippetAsString, snippetType, category) {
            return APIXHRService("POST", API_PATH + "flow/snippets/save", {data: snippetAsString, snippetType: snippetType, category: category});
    	},
    	deleteSnippet: function(snippetId, snippetType) {
            return APIXHRService("POST", API_PATH + "flow/snippets/delete", {snippetId: snippetId, snippetType: snippetType});
    	}
    },
    refactoring: {
        startChangeConnections: function(projectKey, items) {
            // POST because request might be big
            return APIXHRService("POST", API_PATH + "flow/refactoring/start-change-connections", {
                projectKey: projectKey,
                items: JSON.stringify(items)
            });
        },
        testChangeConnections: function(projectKey, items, options) {
            return APIXHRService("POST", API_PATH + "flow/refactoring/test-change-connections", {
                projectKey: projectKey,
                items: JSON.stringify(items),
                options: JSON.stringify(options)
            });
        },
        changeConnections: function(projectKey, items, options) {
            return APIXHRService("POST", API_PATH + "flow/refactoring/change-connections", {
                projectKey: projectKey,
                items: JSON.stringify(items),
                options: JSON.stringify(options)
            });
        },
        startCopySubFlow: function(items) {
            // POST because request might be big
            return APIXHRService("POST", API_PATH + "flow/refactoring/start-copy-subflow", {
                items: JSON.stringify(items)
            });
        },
        testCopySubFlow: function(items, options, contextProjectKey) {
            // POST because request might be big
            return APIXHRService("POST", API_PATH + "flow/refactoring/test-copy-subflow", {
                items: JSON.stringify(items),
                options: JSON.stringify(options),
                contextProjectKey: contextProjectKey
            });
        },
        copySubFlow: function(items, options, contextProjectKey) {
            return APIXHRService("POST", API_PATH + "flow/refactoring/copy-subflow", {
                items: JSON.stringify(items),
                options: JSON.stringify(options),
                contextProjectKey: contextProjectKey
            });
        }
    },
    tools: {
        start: function(projectKey, type, data) {
            return APIXHRService("POST", API_PATH + "flow/tools/start", {
                projectKey: projectKey,
                type: type,
                data: JSON.stringify(data)
            });
        },
        stop: function(projectKey, toolId) {
            return APIXHRService("POST", API_PATH + "flow/tools/stop", {
                projectKey: projectKey,
                toolId: toolId
            });
        },
        getSessions: function(projectKey) {
            return APIXHRService("GET", API_PATH + "flow/tools/get-sessions", {
                projectKey: projectKey
            });
        },
        setActive: function(projectKey, toolId) {
            return APIXHRService("POST", API_PATH + "flow/tools/set-active", {
                projectKey: projectKey,
                toolId: toolId
            });
        },
        setDefaultActive: function(projectKey) {
            return APIXHRService("POST", API_PATH + "flow/tools/set-default-active", {
                projectKey: projectKey
            });
        },
        getState: function(projectKey, tool, options, spinnerMode) {
            return APIXHRService("GET", API_PATH + "flow/tools/get-state", {
                projectKey: projectKey,
                tool: tool,
                options: JSON.stringify(options)
            }, spinnerMode);
        },
        setFocused: function(projectKey, focused, mode) {
            return APIXHRService("POST", API_PATH + "flow/tools/set-focused", {
                projectKey: projectKey,
                focused: JSON.stringify(focused),
                mode : mode
            }, 'nospinner');
        },
        startUpdate: function(projectKey, tool, updateOptions) {
            return APIXHRService("POST", API_PATH + "flow/tools/start-update", {
                projectKey: projectKey,
                tool: tool,
                updateOptions: JSON.stringify(updateOptions)
            });
        },
        propagateSchema: {
            markRecipeAsOKForced: function(projectKey, recipeName) {
                return APIXHRService("POST", API_PATH + "flow/tools/propagate-schema/mark-recipe-as-ok-forced", {
                    projectKey: projectKey,
                    recipeName: recipeName
                });
            },
            markRecipeAsOKAfterUpdate: function(projectKey, recipeName) {
                return APIXHRService("POST", API_PATH + "flow/tools/propagate-schema/mark-recipe-as-ok-after-update", {
                    projectKey: projectKey,
                    recipeName: recipeName
                });
            },
            markDatasetAsBeingRebuilt: function(projectKey, datasetName) {
                return APIXHRService("POST", API_PATH + "flow/tools/propagate-schema/mark-dataset-as-being-rebuilt", {
                    projectKey: projectKey,
                    datasetName: datasetName
                });
            },
            runAutomatically: function(projectKey, datasetName, rebuild, recipeUpdateOptions, excludedRecipes, partitionByDim, partitionByComputable, markAsOkRecipes) {
                return APIXHRService("POST", API_PATH + "flow/tools/propagate-schema/run-automatically", {
                    projectKey: projectKey,
                    datasetName: datasetName,
                    rebuild: rebuild,
                    recipeUpdateOptions: JSON.stringify(recipeUpdateOptions),
                    partitionByDim: JSON.stringify(partitionByDim),
                    partitionByComputable: JSON.stringify(partitionByComputable),
                    excludedRecipes: JSON.stringify(excludedRecipes),
                    markAsOkRecipes: JSON.stringify(markAsOkRecipes)
                });
            }
        },
        checkConsistency: {
            markAsOK: function(projectKey, nodeIds) {
                return APIXHRService("POST", API_PATH + "flow/tools/check-consistency/mark-as-ok", {
                    projectKey: projectKey,
                    nodeIds: JSON.stringify(nodeIds)
                });
            },
            recheck: function(projectKey, nodeIds) {
                return APIXHRService("POST", API_PATH + "flow/tools/check-consistency/recheck", {
                    projectKey: projectKey,
                    nodeIds: JSON.stringify(nodeIds)
                });
            }
        }
    },
    recipes: {
        getTypesDescriptors: function(recipeData, role) {
            return APIXHRService("GET", API_PATH + "flow/recipes/get-types-descriptors");
        },
        list: function(projectKey) {
            return APIXHRService("GET", API_PATH + "flow/recipes/list", {projectKey: projectKey});
        },
        listHeads: function(projectKey, tagFilter) {
            return APIXHRService("GET", API_PATH + "flow/recipes/list-heads", {projectKey: projectKey, tagFilter: tagFilter});
        },
        getWithInlineScript: function(projectKey, name) {
            return APIXHRService("GET", API_PATH + "flow/recipes/get-with-inline-script", {
                projectKey: projectKey, name:name
            });
        },
        getFullInfo: function(projectKey, name) {
            return APIXHRService("GET", API_PATH + "flow/recipes/get-full-info", {
                projectKey: projectKey, name:name
            });
        },
        save: function(projectKey, recipe, scriptData, commitMessage) {
            return APIXHRService("POST", API_PATH + "flow/recipes/save", {
                projectKey: projectKey,
                recipe:JSON.stringify(recipe),
                scriptData: scriptData,
                commitMessage: commitMessage
            });
        },
        rename: function(projectKey, origName, newName) {
            return APIXHRService("POST", API_PATH + "flow/recipes/rename", {
                projectKey: projectKey, origName: origName, newName: newName
            });
        },
        getShakerSaveImpact: function(projectKey, recipe, shaker, outputSchema) {
            return APIXHRService("POST", API_PATH + "flow/recipes/get-shaker-save-impact", {
                projectKey: projectKey,
                recipe:JSON.stringify(recipe),
                shaker: JSON.stringify(shaker),
                outputSchema: JSON.stringify(outputSchema)
            });
        },
        checkSaveConflict: function(projectKey, name, recipe) {
            return APIXHRService("POST", API_PATH + "flow/recipes/check-save-conflict", {
                projectKey: projectKey,
                name:name,
                recipe:JSON.stringify(recipe)
            });
        },
        getComputableSaveImpact: function(projectKey, recipeData, payloadData) {
            return APIXHRService("POST", API_PATH + "flow/recipes/get-computable-save-impact", {
                projectKey: projectKey, recipe: JSON.stringify(recipeData),
                payload: payloadData
            })
        },
        getComputableSaveImpacts: function(projectKey, recipesData, payloadsData) {
            return APIXHRService("POST", API_PATH + "flow/recipes/get-computable-save-impacts", {
                projectKey: projectKey,
                recipes: JSON.stringify(recipesData),
                payloads: JSON.stringify(payloadsData)
            })
        },
        saveOutputSchema: function(projectKey, computableType, computableId, newSchema, dropAndRecreate, synchronizeMetastore, extraOptions) {
            return APIXHRService("POST", API_PATH + "flow/recipes/save-output-schema", {
                projectKey: projectKey, computableType: computableType, computableId: computableId,
                newSchema: JSON.stringify(newSchema),
                dropAndRecreate: dropAndRecreate,
                synchronizeMetastore: synchronizeMetastore,
                extraOptions: extraOptions == null ? null : JSON.stringify(extraOptions)
            })
        },
        get: function(projectKey, name) {
            return APIXHRService("GET", API_PATH + "flow/recipes/get", {projectKey: projectKey, name:name});
        },
        checkNotebookEdition: function(projectKey, name) {
            return APIXHRService("GET", API_PATH + "flow/recipes/check-notebook-edition", {projectKey:projectKey, name:name});
        },
        editInNotebook: function(projectKey, name, codeEnvSelection, containerSelection) {
            return APIXHRService("POST", API_PATH + "flow/recipes/edit-in-notebook", {projectKey:projectKey, name:name, codeEnvSelection:(codeEnvSelection ? JSON.stringify(codeEnvSelection) : null), containerSelection:(containerSelection ? JSON.stringify(containerSelection) : null)});
        },
        getGraph: function(projectKey, tagFilter, withSvg, drawZones, zoneId, collapsedZones) {
            return APIXHRService("GET", API_PATH + "flow/recipes/get-graph-serialized", {projectKey: projectKey, tagFilter: tagFilter, withSvg: withSvg, drawZones: drawZones, zoneId: zoneId, collapsedZones: JSON.stringify(collapsedZones)});
        },
        getHiveCompatibilityStatus: function() {
            return APIXHRService("GET", API_PATH + "flow/recipes/get-hive-compatibility-status");
        },
        basicResyncSchema: function(projectKey, recipe) {
            return APIXHRService("POST", API_PATH + "flow/recipes/basic-resync-schema", {
                projectKey: projectKey, recipeData: JSON.stringify(recipe)
            });
        },
        basicDropSchema: function(projectKey, recipe) {
            return APIXHRService("POST", API_PATH + "flow/recipes/basic-drop-schema", {
                projectKey: projectKey, recipeData: JSON.stringify(recipe)
            });
        },
        /* Get the schema update result for a single recipe.
         * This is the call used when you are NOT editing the recipe.
         */
        getSchemaUpdateResult: function(projectKey, recipeName) {
            return APIXHRService("GET", API_PATH + "flow/recipes/get-schema-update-result", {
                projectKey:projectKey,
                recipeName:recipeName
            });
        },
        getRequirements: function(projectKey, recipeType) {
            return APIXHRService("GET", API_PATH + "flow/recipes/get-requirements", {
                projectKey:projectKey,
                recipeType:recipeType
            });
        },
        getIOChangeResult: function(projectKey, recipeAndPayloadBefore, recipeAndPayloadAfter) {
            return APIXHRService("POST", API_PATH + "flow/recipes/get-io-change-result", {
                projectKey: projectKey,
                recipeAndPayloadBefore : JSON.stringify(recipeAndPayloadBefore),
                recipeAndPayloadAfter : JSON.stringify(recipeAndPayloadAfter)
            });
        },
        getInsertableFragments: function(projectKey, recipe) {
            return APIXHRService("POST", API_PATH + "flow/recipes/get-insertable-fragments", {
                projectKey: projectKey,
                recipe : JSON.stringify(recipe)
            });
        },
        massActions: {
            startSetImpalaWriteMode(recipes, runInStreamMode) {
                // POST because query might be big
                return APIXHRService("POST", API_PATH + "flow/recipes/mass-actions/start-set-impala-write-mode", {
                    recipes: JSON.stringify(recipes)
                });
            },
            setImpalaWriteMode(recipes, runInStreamMode) {
                return APIXHRService("POST", API_PATH + "flow/recipes/mass-actions/set-impala-write-mode", {
                    recipes: JSON.stringify(recipes),
                    runInStreamMode: runInStreamMode
                });
            },
            startSetHiveEngine(recipes) {
                // POST because query might be big
                return APIXHRService("POST", API_PATH + "flow/recipes/mass-actions/start-set-hive-engine", {
                    recipes: JSON.stringify(recipes)
                });
            },
            setHiveEngine(recipes, executionEngine) {
                return APIXHRService("POST", API_PATH + "flow/recipes/mass-actions/set-hive-engine", {
                    recipes: JSON.stringify(recipes),
                    executionEngine: executionEngine
                });
            },
            startSetSparkEngine(recipes) {
                // POST because query might be big
                return APIXHRService("POST", API_PATH + "flow/recipes/mass-actions/start-set-spark-engine", {
                    recipes: JSON.stringify(recipes)
                });
            },
            setSparkEngine(recipes, executionEngine) {
                return APIXHRService("POST", API_PATH + "flow/recipes/mass-actions/set-spark-engine", {
                    recipes: JSON.stringify(recipes),
                    executionEngine: executionEngine
                });
            },
            startSetSparkConfig(recipes, sparkConfig) {
                // POST because query might be big
                return APIXHRService("POST", API_PATH + "flow/recipes/mass-actions/start-set-spark-config", {
                    recipes: JSON.stringify(recipes),
                    sparkConfig: JSON.stringify(sparkConfig)
                });
            },
            setSparkConfig(recipes, sparkConfig) {
                return APIXHRService("POST", API_PATH + "flow/recipes/mass-actions/set-spark-config", {
                    recipes: JSON.stringify(recipes),
                    sparkConfig: JSON.stringify(sparkConfig)
                });
            },
            startSetPipelineability(recipes, pipelineType) {
                // POST because query might be big
                return APIXHRService("POST", API_PATH + "flow/recipes/mass-actions/start-set-pipelineability", {
                    recipes: JSON.stringify(recipes),
                    pipelineType: pipelineType
                });
            },
            setPipelineability(recipes, pipelineType, allowStart, allowMerge) {
                return APIXHRService("POST", API_PATH + "flow/recipes/mass-actions/set-pipelineability", {
                    recipes: JSON.stringify(recipes),
                    pipelineType: pipelineType,
                    allowStart: allowStart,
                    allowMerge: allowMerge
                });
            },
            testConvertToImpala(recipes, checkRecipesRunOnImpala) {
                // POST because query might be big
                return APIXHRService("POST", API_PATH + "flow/recipes/mass-actions/test-convert-to-impala", {
                    recipes: JSON.stringify(recipes),
                    checkRecipesRunOnImpala: checkRecipesRunOnImpala
                });
            },
            convertToImpala(recipes, checkRecipesRunOnImpala) {
                return APIXHRService("POST", API_PATH + "flow/recipes/mass-actions/convert-to-impala", {
                    recipes: JSON.stringify(recipes),
                    checkRecipesRunOnImpala: checkRecipesRunOnImpala
                });
            },
            testConvertToHive(recipes, checkRecipesRunOnHive) {
                // POST because query might be big
                return APIXHRService("POST", API_PATH + "flow/recipes/mass-actions/test-convert-to-hive", {
                    recipes: JSON.stringify(recipes),
                    checkRecipesRunOnHive: checkRecipesRunOnHive
                });
            },
            convertToHive(recipes, checkRecipesRunOnHive) {
                return APIXHRService("POST", API_PATH + "flow/recipes/mass-actions/convert-to-hive", {
                    recipes: JSON.stringify(recipes),
                    checkRecipesRunOnHive: checkRecipesRunOnHive
                });
            },
            startChangeEngines(recipes) {
                // POST because query might be big
                return APIXHRService("POST", API_PATH + "flow/recipes/mass-actions/start-change-engines", {
                    recipes: JSON.stringify(recipes)
                });
            },
            testChangeEngines(recipes, engine) {
                // POST because query might be big
                return APIXHRService("POST", API_PATH + "flow/recipes/mass-actions/test-change-engines", {
                    recipes: JSON.stringify(recipes),
                    engine: engine
                });
            },
            changeEngines(recipes, engine) {
                return APIXHRService("POST", API_PATH + "flow/recipes/mass-actions/change-engines", {
                    recipes: JSON.stringify(recipes),
                    engine: engine
                });
            },
            changeCodeEnv(recipes, envSelection) {
                return APIXHRService("POST", API_PATH + "flow/recipes/mass-actions/change-code-env", {
                    recipes: JSON.stringify(recipes),
                    envSelection: JSON.stringify(envSelection)
                });
            }
        },
        visual: {
            convert: function(projectKey, recipe, payload, target) {
                return APIXHRService("POST", API_PATH + "flow/recipes/visual/convert", {
                    projectKey: projectKey, recipeData: JSON.stringify(recipe),
                    payload: payload, target: target
                });
            },
            convertSamplingRecipeToSplitRecipe: function(projectKey, recipe, secondOutputDataset) {
                return APIXHRService("POST", API_PATH + "flow/recipes/visual/convert-sampling-to-split", {
                    projectKey: projectKey,
                    recipeName: recipe.name,
                    secondOutputDataset: secondOutputDataset
                });
            },
            testInputReplacement: function (projectKey, recipe, payload, inputIndex, newInputName) {
            return APIXHRService("POST", API_PATH + "flow/recipes/visual/test-input-replacement", {
                    projectKey: projectKey,
                    recipeData: JSON.stringify(recipe),
                    payloadData: payload,
                    inputIndex: inputIndex,
                    newInputName: newInputName
                });
            }
        },
        download: {
            checkDownloadURL: function(projectKey, url) {
                return APIXHRService("POST", API_PATH + "recipes/download/check-url", { url: url, projectKey: projectKey });
            },
            checkDownloadSource: function(projectKey, recipe, source, partitionId) {
            return APIXHRService("POST", API_PATH + "recipes/download/check-source", {
                    recipe: JSON.stringify(recipe),
                    source: JSON.stringify(source),
                    projectKey: projectKey,
                    partitionId: partitionId
                });
            }
        },
        filter: {
            validateExpression: function(expression, schemaData, projectKey) {
            return APIXHRService("POST", API_PATH + "recipes/validate-expression", {
                    schemaData: schemaData,
                    expression: expression,
                    projectKey: projectKey
                }, "nospinner");
            },
            validateAst: function(ast, projectKey) {
            return APIXHRService("POST", API_PATH + "recipes/validate-ast", {
                    astData: JSON.stringify(ast),
                    projectKey: projectKey
                }, "nospinner");
            }
        },
        join: {
            getSuggestions: function(projectKey, recipe, payload) {
            return APIXHRService("POST", API_PATH + "flow/recipes/join/get-suggestions", {
                    projectKey: projectKey,
                    recipeData: JSON.stringify(recipe),
                    payloadData: payload
                });
            }
        },
        fuzzyjoin: {
            getSuggestions: function(projectKey, recipe, payload) {
            return APIXHRService("POST", API_PATH + "flow/recipes/fuzzyjoin/get-suggestions", {
                    projectKey: projectKey,
                    recipeData: JSON.stringify(recipe),
                    payloadData: payload
                });
            }
        },
        pig: {
            check: function(projectKey, recipe, scriptData, targetPartition) {
            return APIXHRService("POST", API_PATH + "flow/recipes/pig/check", {
                    projectKey: projectKey, recipeData: JSON.stringify(recipe),
                    scriptData: scriptData, targetPartition: targetPartition
                });
            }
        },
        shell: {
            check: function(projectKey, recipe, scriptData, targetPartition) {
            return APIXHRService("POST", API_PATH + "flow/recipes/shell/check", {
                    projectKey: projectKey, recipeData: JSON.stringify(recipe),
                    scriptData: scriptData, targetPartition: targetPartition
                });
            }
        },
        scala: {
            checkSyntax: function(projectKey, recipe, scriptData, targetPartition) {
            return APIXHRService("POST", API_PATH + "flow/recipes/scala/check-syntax", {
                    projectKey: projectKey, recipeData: JSON.stringify(recipe),
                    scriptData: scriptData, targetPartition: targetPartition
                });
            },
            convertToCustom: function(targetPluginId, targetPluginMode, scriptData, recipeFolder, recipeSerialized) {
            return APIXHRService("POST", API_PATH + "flow/recipes/scala/convert-to-custom", {
                    targetPluginId: targetPluginId,
                    targetPluginMode: targetPluginMode,
                    scriptData: scriptData,
                    recipeFolder: recipeFolder,
                    codeMode: recipeSerialized.params.codeMode
                });
            }
        },
        python: {
            checkSyntax: function(projectKey, recipe, scriptData, targetPartition) {
            return APIXHRService("POST", API_PATH + "flow/recipes/python/check-syntax", {
                    projectKey: projectKey, recipeData: JSON.stringify(recipe),
                    scriptData: scriptData, targetPartition: targetPartition
                });
            },
            convertToCustom: function(targetPluginId, targetPluginMode, scriptData, recipeFolder, recipe) {
            return APIXHRService("POST", API_PATH + "flow/recipes/python/convert-to-custom", {
                    targetPluginId: targetPluginId,
                    targetPluginMode: targetPluginMode,
                    recipeData: JSON.stringify(recipe),
                    scriptData: scriptData,
                    recipeFolder: recipeFolder
                });
            }
        },
        hive: {
            checkImpalaConvertibility: function(projectKey, recipe, scriptData, targetPartition) {
            return APIXHRService("POST", API_PATH + "flow/recipes/hive/check-impala-convertibility", {
                    projectKey: projectKey, recipeData: JSON.stringify(recipe),
                    scriptData: scriptData, targetPartition: targetPartition
                });
            }
        },
        impala: {
            validate: function(projectKey, recipe, scriptData, targetPartition) {
            return APIXHRService("POST", API_PATH + "flow/recipes/impala/validate", {
                    projectKey: projectKey, recipeData: JSON.stringify(recipe),
                    scriptData: scriptData, targetPartition: targetPartition
                });
            },
            getExecutionPlan: function(projectKey, recipe, scriptData, targetPartition) {
            return APIXHRService("POST", API_PATH + "flow/recipes/impala/get-execution-plan", {
                    projectKey: projectKey,
                    recipe: JSON.stringify(recipe),
                    script: scriptData,
                    targetPartition: targetPartition
                });
            },
            run: function(projectKey, recipe, scriptData, targetPartition) {
            return APIXHRService("POST", API_PATH + "flow/recipes/impala/run", {
                    projectKey: projectKey, recipe: JSON.stringify(recipe),
                    script: scriptData, targetPartition: targetPartition
                });
            },
            checkFullSqlAvailability: function(projectKey, recipe) {
            return APIXHRService("POST", API_PATH + "flow/recipes/impala/check-full-sql-availability", {
                    projectKey: projectKey, recipeData: JSON.stringify(recipe)
                });
            }
        },
        sqlScript: {
            validate: function(projectKey, recipe, scriptData, targetPartition) {
            return APIXHRService("POST", API_PATH + "flow/recipes/sql-script/validate", {
                    projectKey: projectKey, recipe: JSON.stringify(recipe),
                    script: scriptData, targetPartition: targetPartition
                });
            }
        },
        sqlQuery: {
            //TODO merge validate/get execution plan?
            validate: function(projectKey, recipe, scriptData, targetPartition) {
            return APIXHRService("POST", API_PATH + "flow/recipes/sql-query/validate", {
                    projectKey: projectKey, recipe: JSON.stringify(recipe),
                    script: scriptData, targetPartition: targetPartition
                });
            },
            getExecutionPlan: function(projectKey, recipe, scriptData, targetPartition) {
            return APIXHRService("POST", API_PATH + "flow/recipes/sql-query/get-execution-plan", {
                    projectKey: projectKey,
                    recipe: JSON.stringify(recipe),
                    script: scriptData,
                    targetPartition: targetPartition
                });
            },
            run: function(projectKey, recipe, scriptData, targetPartition) {
            return APIXHRService("POST", API_PATH + "flow/recipes/sql-query/run", {
                    projectKey: projectKey, recipe: JSON.stringify(recipe),
                    script: scriptData, targetPartition: targetPartition
                });
            }
        },
        sparkSql: {
            //TODO merge validate/get execution plan?
            validate: function(projectKey, recipe, scriptData, targetPartition) {
            return APIXHRService("POST", API_PATH + "flow/recipes/sparksql-query/validate", {
                    projectKey: projectKey, recipe: JSON.stringify(recipe),
                    query: scriptData, targetPartition: targetPartition
                });
            },
        },
        r: {
             validate: function(projectKey, recipe, scriptData, targetPartition) {
            return APIXHRService("POST", API_PATH + "flow/recipes/r/validate", {
                    projectKey: projectKey, recipeData: JSON.stringify(recipe),
                    scriptData: scriptData, targetPartition: targetPartition
                });
            },
            convertToCustom: function(targetPluginId, targetPluginMode, scriptData, recipeFolder) {
            return APIXHRService("POST", API_PATH + "flow/recipes/r/convert-to-custom", {
                    targetPluginId: targetPluginId,
                    targetPluginMode: targetPluginMode,
                    scriptData: scriptData,
                    recipeFolder: recipeFolder
                });
            }
        },
        pyspark: {
            convertToCustom: function(targetPluginId, targetPluginMode, scriptData, recipeFolder) {
            return APIXHRService("POST", API_PATH + "flow/recipes/pyspark/convert-to-custom", {
                    targetPluginId: targetPluginId,
                    targetPluginMode: targetPluginMode,
                    scriptData: scriptData,
                    recipeFolder: recipeFolder
                });
            }
        },
        pivot: {
            getDatasetModalities: function(projectKey, datasetSmartName, pivot) {
                return APIXHRService("POST", API_PATH + "flow/recipes/pivot/get-dataset-modalities", {
                    projectKey : projectKey,
                    datasetSmartName : datasetSmartName,
                    pivot : JSON.stringify(pivot)
                });
            }
        },
        generic: {
            create: function(recipe, creationSettings) {
                return APIXHRService("POST", API_PATH + "flow/recipes/generic/create", {
                    recipeData : JSON.stringify(recipe),
                    creationSettingsData: JSON.stringify(creationSettings)
                });
            },
            copy: function(projectKey, sourceProjectKey, sourceRecipeName, copySettings) {
                return APIXHRService("POST", API_PATH + "flow/recipes/generic/copy", {
                    projectKey: projectKey,
                    sourceProjectKey: sourceProjectKey,
                    sourceRecipeName : sourceRecipeName,
                    copySettingsData: JSON.stringify(copySettings)
                });
            },
            getStatus : function(recipe, payload, sequenceId, request) {
                return APIXHRService("POST", API_PATH + "flow/recipes/generic/get-status", {
                    recipeData: JSON.stringify(recipe),
                    payloadData: payload,
                    sequenceId: sequenceId,
                    requestData : JSON.stringify(request)
                }, "nospinner");
            },
            getStatusWithSpinner: function(recipe, payload, sequenceId, request) {
                return APIXHRService("POST", API_PATH + "flow/recipes/generic/get-status", {
                    recipeData: JSON.stringify(recipe),
                    payloadData: payload,
                    sequenceId: sequenceId,
                    requestData : JSON.stringify(request)
                });
            },
            validate: function(projectKey, recipe) {
            return APIXHRService("POST", API_PATH + "flow/recipes/generic/validate", {
                    projectKey: projectKey, recipe: JSON.stringify(recipe)
                });
            },
            pdepTest: function(recipe, pdepInputRef, pdep) {
                return APIXHRService("POST", API_PATH + "flow/recipes/pdep-test", {
                    recipeData: JSON.stringify(recipe),
                    pdepInputRef : pdepInputRef,
                    pdepData: JSON.stringify(pdep)
                });
            },
            getVariables: function(projectKey) {
                return APIXHRService("GET", API_PATH + "flow/recipes/generic/get-variables", {
                    projectKey: projectKey
                });
            }
        }
    },
    listUsableComputables: function(projectKey, filter) {
        return APIXHRService("GET", API_PATH + "flow/list-usable-computable", {
            projectKey: projectKey,
            filter: JSON.stringify(filter)
        });
    },
    listDownstreamComputables: function(projectKey, from) {
        return APIXHRService("GET", API_PATH + "flow/list-downstream-computable",
            angular.extend({projectKey: projectKey}, from)
        );
    },
    getComputables: function(taggableObjectRefs) {
        // POST because query might be big
        return APIXHRService("POST", API_PATH + "flow/get-computables", {
            items: JSON.stringify(taggableObjectRefs)
        });
    },
    getObjectContext: function(projectKey, objectType, objectId) {
        return APIXHRService("GET", API_PATH + "flow/get-object-context", {
            projectKey: projectKey,
            objectType: objectType,
            objectId: objectId
        }, "nospinner");
    },
    applyFlowFilter: function(projectKey, filter, drawZones, zoneId, collapsedZones) {
        return APIXHRService("GET", API_PATH + "flow/apply-flow-filtering", {projectKey: projectKey, filter: filter, drawZones: drawZones, zoneId: zoneId, collapsedZones: JSON.stringify(collapsedZones)});
    },
    loadFlowFilterSettings: function(projectKey, zoneId, collapsedZones) {
        return APIXHRService("GET", API_PATH + "flow/load-flow-filter-settings", {projectKey: projectKey, zoneId: zoneId, collapsedZones: JSON.stringify(collapsedZones)});
    },
    saveProjectFlowFilter: function(projectKey, filter, drawZones, zoneId, collapsedZones) {
        return APIXHRService("POST", API_PATH + "flow/save-project-flow-filter", {projectKey: projectKey, filter: JSON.stringify(filter), drawZones: drawZones, zoneId: zoneId, collapsedZones: JSON.stringify(collapsedZones)});
    },
    activateFlowFilter: function(projectKey, id, drawZones, zoneId, collapsedZones) {
        return APIXHRService("POST", API_PATH + "flow/activate-flow-filter", {projectKey: projectKey, id: id, drawZones: drawZones, zoneId: zoneId, collapsedZones: JSON.stringify(collapsedZones)});
    },
    enableFlowFiltering: function(projectKey, enable, collapsedZones) {
        return APIXHRService("POST", API_PATH + "flow/enable-flow-filter", {projectKey: projectKey, enable: enable, collapsedZones: JSON.stringify(collapsedZones)});
    },
    deleteFlowFilter: function(projectKey, id, drawZones, zoneId, collapsedZones) {
        return APIXHRService("POST", API_PATH + "flow/delete-flow-filter", {projectKey: projectKey, id: id, drawZones: drawZones, zoneId: zoneId, collapsedZones: JSON.stringify(collapsedZones)});
    },
    revertDirtyFilter: function(projectKey, id, drawZones, zoneId, collapsedZones) {
        return APIXHRService("POST", API_PATH + "flow/revert-dirty-filter", {projectKey: projectKey, id: id, drawZones: drawZones, zoneId: zoneId, collapsedZones: JSON.stringify(collapsedZones)});
    },
    export: function(projectKey, exportFormat) {
        return APIXHRService("POST", API_PATH + "flow/export", { projectKey: projectKey, exportFormat: JSON.stringify(exportFormat) });
    },
    getExportURL: function(projectKey, exportId) {
        return API_PATH + "flow/download-export?"
            + "projectKey=" + encodeURIComponent(projectKey)
            + "&exportId=" + encodeURIComponent(exportId);
    }
},
profile: {
    get: function(login) {
        if(login) {
            return APIXHRService("GET", API_PATH + "/profile/get", {login:login});
        } else {
            return APIXHRService("GET", API_PATH + "/profile/get");
        }
    },
    achievements: function(login) {
        return APIXHRService("GET", API_PATH + "/profile/achievements", {login:login});
    },
    setNPSSettings: function(action) {
        return APIXHRService("POST", API_PATH + "/myprofile/update-nps-settings" , { action: action });
    },
    edit: function(user) {
        return APIXHRService("POST", API_PATH + "/myprofile/edit" , {user: JSON.stringify(user)});
    },
    uploadPicture: function(file) {
        var url = API_PATH + "myprofile/upload-picture";

        // angular doesn't provide a way to get the progress event yet, we explicitly redo it
        var deferred = $q.defer();

        var xhr = new XMLHttpRequest();

        xhr.addEventListener("load", function(e) {
            deferred.resolve((e.target||e.srcElement).response);
            $rootScope.$apply();
        }, false);
        xhr.addEventListener("error", function(e) {deferred.reject(e);$rootScope.$apply();}, false);

        xhr.open("POST", url);
        xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');

        var formdata = new FormData();
        formdata.append("file", file);
        xhr.send(formdata);

        return deferred.promise;
    },
    setUserSettings: function(userSettings) {
    	return APIXHRService("POST", API_PATH + "/myprofile/set-user-settings" , {userSettingsAsString: JSON.stringify(userSettings)});
    },
    listPersonalAPIKeys: function(){
        return APIXHRService("GET", API_PATH + "/publicapi/list-personal-api-keys");
    },
    createPersonalAPIKey : function(){
        return APIXHRService("POST", API_PATH + "/publicapi/create-personal-api-key");
    },
    deletePersonalAPIKey: function(key) {
        return APIXHRService("POST", API_PATH + "/publicapi/delete-personal-api-key",{
            key:key
        });
    },
    listConnectionCredentials : function(){
        return APIXHRService("GET", API_PATH + "/myprofile/list-connection-credentials");
    },
    setBasicConnectionCredential : function(connection, user, password){
        return APIXHRService("POST", API_PATH + "/myprofile/set-basic-connection-credential",{
            connection: connection,
            user: user,
            password: password
        });
    },
    connectionCredentials: {
        azureOAuthDeviceCodeDanceStep1: function(connection) {
            return APIXHRService("POST", API_PATH + "myprofile/connection-credentials/azure-oauth-devicecode-dance-step1",{
                connection: connection
            });
        },
        azureOAuthDeviceCodeDanceStep2: function(connection, deviceCode) {
            return APIXHRService("POST", API_PATH + "myprofile/connection-credentials/azure-oauth-devicecode-dance-step2",{
                connection: connection,
                deviceCode: JSON.stringify(deviceCode)
            });
        },
        getOAuth2AuthorizationEndpoint: function(dssUrl, userCurrentState, connection) {
            return APIXHRService("POST", API_PATH + "myprofile/connection-credentials/oauth2-authorization-endpoint", {
                dssUrl: dssUrl,
                userCurrentState: userCurrentState,
                connection: connection
            });
        }
    },
    pluginCredentials: {
        setBasicCredential : function(pluginId, paramSetId, presetId, paramName, user, password){
            return APIXHRService("POST", API_PATH + "/myprofile/plugin-credentials/set-basic-credential", {
                pluginId: pluginId,
                paramSetId: paramSetId,
                presetId: presetId,
                paramName: paramName,
                user: user,
                password: password
            });
        },
        getOAuth2AuthorizationEndpoint: function(dssUrl, userCurrentState, pluginId, paramSetId, presetId, paramName) {
            return APIXHRService("GET", API_PATH + "myprofile/plugin-credentials/oauth2-authorization-endpoint", {
                dssUrl: dssUrl,
                userCurrentState: userCurrentState,
                pluginId: pluginId,
                paramSetId: paramSetId,
                presetId: presetId,
                paramName: paramName
            });
        }
    }
},
globalTags: {
    getGlobalTagsInfo: function() {
        return APIXHRService("GET", API_PATH + "global-tags/get-global-tags-info");
    }
},
variables: {
    expandExpr: function(projectKey, expr) {
         return APIXHRService("GET", API_PATH + "/variables/expand-expr", {
            projectKey: projectKey, expr: expr
         });
    }
},
integrations: {
    listChannelsForIntegrationType: function(integrationType) {
        return APIXHRService("GET", API_PATH + "/integrations/list-available-channels-for-integration-type", {
            integrationType: integrationType
        })
    }
},
codeenvs: {
    list: function(envLang) {
        return APIXHRService("GET", API_PATH + "code-envs/list",{ envLang: envLang })
    },
    listNames: function(envLang) {
        return APIXHRService("GET", API_PATH + "code-envs/list-names",{ envLang: envLang })
    },
    listNamesWithDefault: function(envLang, projectKey) {
        return APIXHRService("GET", API_PATH + "code-envs/list-names-with-default",{ envLang: envLang, projectKey:projectKey })
    },
    listWithVisualMlPackages: function(projectKey) {
        return APIXHRService("GET", API_PATH + "code-envs/list-python-with-visual-ml-packages", {projectKey: projectKey})
    },
    listForPlugins: function(pluginId) {
        return APIXHRService("GET", API_PATH + "code-envs/plugin/list",{ pluginId: pluginId })
    },
    createForPlugin: function(pluginId, desc) {
        return APIXHRService("GET", API_PATH + "code-envs/plugin/create",{ pluginId: pluginId, desc: JSON.stringify(desc) })
    },
    updateForPlugin: function(pluginId, envName) {
        return APIXHRService("GET", API_PATH + "code-envs/plugin/update",{ pluginId: pluginId, envName: envName })
    },
    listUsages: function(projectKey) {
        return APIXHRService("GET", API_PATH + "code-envs/list-usages",{ projectKey: projectKey })
    }
},
containers: {
    listNames: function() {
        return APIXHRService("GET", API_PATH + "containers/list-names");
    },
    listSparkNames: function() {
        return APIXHRService("GET", API_PATH + "containers/list-spark-names");
    },
    listNamesWithDefault: function(projectKey, type) {
        return APIXHRService("GET", API_PATH + "containers/list-names-with-default", { projectKey, type })
    },
    getConfigInfo: function(projectKey, exposableKind, expositionUsageContext, containerSelection, inlineContainerConfig) {
        return APIXHRService("POST", API_PATH + "containers/get-config-info", {
            projectKey:projectKey,
            exposableKind:exposableKind,
            expositionUsageContext: expositionUsageContext,
            containerSelection:JSON.stringify(containerSelection),
            inlineContainerConfig: JSON.stringify(inlineContainerConfig)
        })
    },
    getExpositions: function(containerType, exposableKind, expositionUsageContext) {
        return APIXHRService("GET", API_PATH + "containers/get-expositions", {
            containerType: containerType,
            exposableKind: exposableKind,
            expositionUsageContext: expositionUsageContext
        })
    },
},
admin: {
    getInstanceInfo: function() {
        return APIXHRService("GET", API_PATH + "/admin/get-instance-info");
    },
    containerExec: {
        pushBaseImages: function(){
            return APIXHRService("POST", API_PATH + "/admin/container-exec/push-base-images")
        },
        installJupyterSupport: function() {
            return APIXHRService("POST", API_PATH + "/admin/container-exec/install-jupyter-support")
        },
        removeJupyterSupport: function() {
            return APIXHRService("POST", API_PATH + "/admin/container-exec/remove-jupyter-support")
        },
        testConf: function(data, clusterDefinedConfig, clusterId, executionConfigsGenericOverrides) {
            return APIXHRService("POST", API_PATH + "/admin/container-exec/test-conf", {data: JSON.stringify(data), clusterDefinedConfig: clusterDefinedConfig || false, clusterId: clusterId, genericOverridesData: JSON.stringify(executionConfigsGenericOverrides)})
        },
        applyK8SPolicies: function(data, clusterDefinedConfig, clusterId, executionConfigsGenericOverrides) {
            return APIXHRService("POST", API_PATH + "/admin/container-exec/apply-kubernetes-policies", {})
        }
    },
    connections: {
        list: function () {
            return APIXHRService("GET", API_PATH + "/admin/connections/list");
        },
        listHiveVirtual: function(){
            return APIXHRService("GET", API_PATH + "/admin/connections/list-hive-virtual");
        },
        listRunningJobs: function () {
            return APIXHRService("GET", API_PATH + "/admin/connections/metadata", null, "nospinner");
        },
        get: function (name) {
            return APIXHRService("GET", API_PATH + "/admin/connections/get", {name: name});
        },
        save: function (data) {
            return APIXHRService("POST", API_PATH + "/admin/connections/save", {data: JSON.stringify(data)});
        },
        listProcessableConnections: function (type, selectedConnections) {
            return APIXHRService("GET", API_PATH + "/admin/connections/list-indexable-connections", {
                type: type,
                selectedConnections: selectedConnections
            });
        },
        index: function (data) {
            return APIXHRService("POST", API_PATH + "/admin/connections/index", {data: JSON.stringify(data)});
        },
        scan: function (data) {
            return APIXHRService("POST", API_PATH + "/admin/connections/scan", {data: JSON.stringify(data)});
        },
        abortIndexation: function (data) {
            return APIXHRService("GET", API_PATH + "/admin/connections/abort-indexation");
        },
        delete: function (data) {
            return APIXHRService("POST", API_PATH + "/admin/connections/delete", {data: JSON.stringify(data)});
        },
        testSQL: function(data, massImportTargetProjectKey) {
            return APIXHRService("POST", API_PATH + "admin/connections/test-sql", {
                data: JSON.stringify(data),
                massImportTargetProjectKey: massImportTargetProjectKey
            });
        },
        testPostgreSQL: function(data) {
            return APIXHRService("POST", API_PATH + "admin/connections/test-postgresql", {data: JSON.stringify(data)});
        },
        testEC2: function(data) {
            return APIXHRService("POST", API_PATH + "admin/connections/test-ec2", {data: JSON.stringify(data)});
        },
        testGCS: function(data) {
            return APIXHRService("POST", API_PATH + "admin/connections/test-gcs", {data: JSON.stringify(data)});
        },
        testAzure: function(data) {
            return APIXHRService("POST", API_PATH + "admin/connections/test-azure", {data: JSON.stringify(data)});
        },
        testMongoDB: function(data, sequenceId) {
            return APIXHRService("POST", API_PATH + "admin/connections/test-mongodb", {data: JSON.stringify(data), sequenceId: sequenceId});
        },
        testDynamoDB: function(data, sequenceId) {
            return APIXHRService("POST", API_PATH + "admin/connections/test-dynamodb", {data: JSON.stringify(data), sequenceId: sequenceId});
        },
        testCassandra: function(data) {
            return APIXHRService("POST", API_PATH + "admin/connections/test-cassandra", {data: JSON.stringify(data)});
        },
        testTwitter: function(data) {
            return APIXHRService("POST", API_PATH + "admin/connections/test-twitter", {data: JSON.stringify(data)});
        },
        testKafka: function(data) {
            return APIXHRService("POST", API_PATH + "admin/connections/test-kafka", {data: JSON.stringify(data)});
        },
        testKsql: function(data) {
            return APIXHRService("POST", API_PATH + "admin/connections/test-ksql", {data: JSON.stringify(data)});
        },
        testSQS: function(data) {
            return APIXHRService("POST", API_PATH + "admin/connections/test-sqs", {data: JSON.stringify(data)});
        },
        testElasticSearch: function(data) {
            return APIXHRService("POST", API_PATH + "admin/connections/test-elasticsearch", {data: JSON.stringify(data)});
        },
        setActiveTwitterConnection: function(name) {
           return APIXHRService("POST", API_PATH + "admin/connections/set-active-twitter-connection", {name:name});
        },

        hdfs : {
            resyncPermissions : function(connectionName) {
                return APIXHRService("POST", API_PATH + "admin/connections/hdfs/resync-permissions", {
                    connectionName : connectionName
                });
            },
            resyncRootPermissions : function(connectionName) {
                return APIXHRService("POST", API_PATH + "admin/connections/hdfs/resync-root-permissions", {
                    connectionName : connectionName
                });
            }

        }
    },
    integrationChannels: {
        list: function() {
            return APIXHRService("GET", API_PATH + "/admin/integration-channels/list");
        },
        saveAll: function(data) {
            return APIXHRService("POST", API_PATH + "/admin/integration-channels/save-all" , {data: JSON.stringify(data)});
        }
    },
    logs: {
        list: function() {
           return APIXHRService("GET", API_PATH + "admin/logs/list");
        },
        get: function(name) {
           return APIXHRService("GET", API_PATH + "admin/logs/get-content", {name: name});
        },
    },
    diagnostics: {
        getLatest: function() {
           return APIXHRService("GET", API_PATH + "admin/diagnostics/get-latest-diagnosis");
        },
        run: function(options) {
           return APIXHRService("POST", API_PATH + "admin/diagnostics/run", {options: JSON.stringify(options)});
        },
        getResults: function(id) {
           return APIXHRService("GET", API_PATH + "admin/diagnostics/get-results", {id: id});
        },
    },
    globalTags: {
        updateGlobalTags: function(data) {
            return APIXHRService("POST", API_PATH + "admin/global-tags/update-global-tags", {data: JSON.stringify(data)});
        }
    },
    users:{
        list: function() {
            return APIXHRService("GET", API_PATH + "admin/users/list");
        },
        get: function(login) {
            return APIXHRService("GET", API_PATH + "admin/users/get", {login: login});
        },
        update: function(usr) {
            return APIXHRService("POST", API_PATH + "admin/users/edit", {user: JSON.stringify(usr)});
        },
        prepareUpdate: function(usr) {
            return APIXHRService("POST", API_PATH + "admin/users/prepare-edit", {user: JSON.stringify(usr)});
        },
        create : function(usr) {
            return APIXHRService("POST", API_PATH + "admin/users/create", {user: JSON.stringify(usr)});
        },
        delete: function(logins) {
            return APIXHRService("POST", API_PATH + "admin/users/delete", {logins: JSON.stringify(logins)});
        },
        enableOrDisable: function(logins, enable) {
            return APIXHRService("POST", API_PATH + "admin/users/enable-or-disable", {logins: JSON.stringify(logins), enable: enable});
        },
        prepareDelete: function(logins) {
            return APIXHRService("POST", API_PATH + "admin/users/prepare-delete", {logins: JSON.stringify(logins)});
        },
        prepareDisable: function(logins) {
            return APIXHRService("POST", API_PATH + "admin/users/prepare-disable", {logins: JSON.stringify(logins)});
        },
        assignUsersGroups: function(logins, groupsToAdd, groupsToRemove) {
            return APIXHRService("POST", API_PATH + "admin/users/assign-groups", {groupsToAdd: JSON.stringify(groupsToAdd), groupsToRemove: JSON.stringify(groupsToRemove), logins: JSON.stringify(logins)});
        },
        prepareAssignUsersGroups: function(logins, groupsToAdd, groupsToRemove) {
            return APIXHRService("POST", API_PATH + "admin/users/prepare-assign-groups", {groupsToAdd: JSON.stringify(groupsToAdd), groupsToRemove: JSON.stringify(groupsToRemove), logins: JSON.stringify(logins)});
        }
    },
    publicApi: {
        listGlobalKeys: function() {
            return APIXHRService("GET", API_PATH + "admin/publicapi/get-global-keys");
        },
        createGlobalKey: function(key) {
            return APIXHRService("POST", API_PATH + "admin/publicapi/create-global-key", {
                key: JSON.stringify(key)
            });
        },
        saveGlobalKey: function(key) {
            return APIXHRService("POST", API_PATH + "admin/publicapi/save-global-key", {
                key: JSON.stringify(key)
            });
        },
        getGlobalKey: function(keyId) {
            return APIXHRService("POST", API_PATH + "admin/publicapi/get-global-key", {
                keyId: keyId
            });
        },
        deleteGlobalKey: function(key) {
            return APIXHRService("POST", API_PATH + "admin/publicapi/delete-global-key", {
                key: key
            });
        },
        listPersonalKeys : function(){
            return APIXHRService("GET", API_PATH + "admin/publicapi/list-personal-api-keys");
        },
        deletePersonalKey : function(key){
            return APIXHRService("GET", API_PATH + "admin/publicapi/delete-personal-api-key",{
                key : key
            });
        }
    },
    scheduledTasks: {
        getStatus: function() {
            return APIXHRService("GET", API_PATH + "admin/scheduled-tasks/get-status", {
            });
        },
        fire: function(jobGroup, jobName) {
            return APIXHRService("POST", API_PATH + "admin/scheduled-tasks/fire", {
                jobGroup: jobGroup, jobName: jobName
            });
        }
    },
    codeenvs: {
        design: {
            list: function(){
                return APIXHRService("GET", API_PATH + "code-envs/design/list")
            },
            listNames: function(envLang) {
        	    return APIXHRService("GET", API_PATH + "code-envs/design/list-names",{ envLang: envLang })
        	},
            create: function(envLang, envSpec) {
                return APIXHRService("POST", API_PATH + "code-envs/design/create", {
                    envLang: envLang, envSpec: JSON.stringify(envSpec)
                });
            },
            get : function(envLang, envName){
                return APIXHRService("POST", API_PATH + "code-envs/design/get", {
                    envLang: envLang, envName: envName
                });
            },
            listLogs : function(envLang, envName){
                return APIXHRService("POST", API_PATH + "code-envs/design/list-logs", {
                    envLang: envLang, envName: envName
                });
            },
            getLog : function(envLang, envName, logName){
                return APIXHRService("POST", API_PATH + "code-envs/design/get-log", {
                    envLang: envLang, envName: envName, logName: logName
                });
            },
            streamLog : function(envLang, envName, logName){
                return APIXHRService("GET", API_PATH + "code-envs/design/stream-log", {
                    envLang: envLang, envName: envName, logName: logName
                });
            },
            save: function(envLang, envName, data) {
                return APIXHRService("POST", API_PATH + "code-envs/design/save", {
                    envLang: envLang, envName: envName, data: JSON.stringify(data)
                });
            },
            listUsages : function(envLang, envName){
                return APIXHRService("POST", API_PATH + "code-envs/design/list-usages", {
                    envLang: envLang, envName: envName
                });
            },
            delete : function(envLang, envName){
                return APIXHRService("POST", API_PATH + "code-envs/design/delete", {
                    envLang: envLang, envName: envName
                });
            },
            update: function(envLang, envName, updateSettings) {
                return APIXHRService("POST", API_PATH + "code-envs/design/update", {
                    envLang: envLang, envName: envName, updateSettings: JSON.stringify(updateSettings)
                });
            },
            fetchNonManagedEnvDetails: function(envLang, envName) {
                return APIXHRService("GET", API_PATH + "code-envs/design/fetch-non-managed-env-details", {
                    envLang: envLang, envName: envName
                });
            },
            installJupyterSupport: function(envLang, envName) {
                return APIXHRService("GET", API_PATH + "code-envs/design/install-jupyter-support", {
                    envLang: envLang, envName: envName
                });
            },
            removeJupyterSupport: function(envLang, envName) {
                return APIXHRService("GET", API_PATH + "code-envs/design/remove-jupyter-support", {
                    envLang: envLang, envName: envName
                });
            },
            getExportURL: function(envLang, envName) {
                return API_PATH + "code-envs/design/export?"
                         + "envLang=" + encodeURIComponent(envLang)
                         + "&envName=" + encodeURIComponent(envName);
            },
            getDiagnosticURL: function(envLang, envName) {
                return API_PATH + "code-envs/design/download-diagnostic?"
                         + "envLang=" + encodeURIComponent(envLang)
                         + "&envName=" + encodeURIComponent(envName);
            },
            import: function(file) {
                return uploadFileRequest("code-envs/design/import", function(formdata) {
                    formdata.append("file", file);
                }, null);
            }
        },
        automation: {
            list: function(){
                return APIXHRService("GET", API_PATH + "code-envs/automation/list")
            },
            create: function(envLang, envSpec) {
                 return APIXHRService("POST", API_PATH + "code-envs/automation/create", {
                    envLang: envLang, envSpec:JSON.stringify(envSpec)
                });
            },
            get: function(envLang, envName) {
                return APIXHRService("POST", API_PATH + "code-envs/automation/get", {
                    envLang: envLang, envName: envName
                });
            },
            getVersion: function(envLang, envName, versionId) {
                return APIXHRService("POST", API_PATH + "code-envs/automation/get-version", {
                    envLang: envLang, envName: envName, versionId: versionId
                });
            },
            save: function(envLang, envName, data) {
                return APIXHRService("POST", API_PATH + "code-envs/automation/save", {
                    envLang: envLang, envName: envName, data: JSON.stringify(data)
                });
            },
            saveVersion: function(envLang, envName, versionId, data) {
                return APIXHRService("POST", API_PATH + "code-envs/automation/save-version", {
                    envLang: envLang, envName: envName, versionId: versionId, data: JSON.stringify(data)
                });
            },
            listLogs : function(envLang, envName){
                return APIXHRService("POST", API_PATH + "code-envs/automation/list-logs", {
                    envLang: envLang, envName: envName
                });
            },
            getLog : function(envLang, envName, logName){
                return APIXHRService("POST", API_PATH + "code-envs/automation/get-log", {
                    envLang: envLang, envName: envName, logName: logName
                });
            },
            streamLog : function(envLang, envName, logName){
                return APIXHRService("GET", API_PATH + "code-envs/automation/stream-log", {
                    envLang: envLang, envName: envName, logName: logName
                });
            },
            listUsages : function(envLang, envName){
                return APIXHRService("POST", API_PATH + "code-envs/automation/list-usages", {
                    envLang: envLang, envName: envName
                });
            },
            delete : function(envLang, envName){
                return APIXHRService("POST", API_PATH + "code-envs/automation/delete", {
                    envLang: envLang, envName: envName
                });
            },
            update: function(envLang, envName, updateSettings) {
                return APIXHRService("POST", API_PATH + "code-envs/automation/update", {
                    envLang: envLang, envName: envName, updateSettings: JSON.stringify(updateSettings)
                });
            },
            fetchNonManagedEnvDetails: function(envLang, envName) {
                return APIXHRService("GET", API_PATH + "code-envs/automation/fetch-non-managed-env-details", {
                    envLang: envLang, envName: envName
                });
            },
            installJupyterSupport: function(envLang, envName, versionId) {
                return APIXHRService("GET", API_PATH + "code-envs/automation/install-jupyter-support", {
                    envLang: envLang, envName: envName, versionId: versionId
                });
            },
            removeJupyterSupport: function(envLang, envName, versionId) {
                return APIXHRService("GET", API_PATH + "code-envs/automation/remove-jupyter-support", {
                    envLang: envLang, envName: envName, versionId: versionId
                });
            },
            import: function(file) {
                return uploadFileRequest("code-envs/automation/import", function(formdata) {
                    formdata.append("file", file);
                }, null);
            },
            importVersion: function(file, envLang, envName) {
                return uploadFileRequest("code-envs/automation/import-version", function(formdata) {
                    formdata.append("envName", envName);
                    formdata.append("envLang", envLang);
                    formdata.append("file", file);
                }, null);
            },
            getDiagnosticURL: function(envLang, envName) {
                return API_PATH + "code-envs/automation/download-diagnostic?"
                         + "envLang=" + encodeURIComponent(envLang)
                         + "&envName=" + encodeURIComponent(envName);
            }
        },
        setRemoteSparkSupport: function(envLang, envName, remoteKernelType, active) {
            return APIXHRService("POST", API_PATH + "code-envs/set-remote-kernel-support", {
                envLang: envLang, envName: envName, remoteKernelType:remoteKernelType, active:active
            })
        }
    },
    monitoring: {
        getGlobalUsageSummary: function() {
            return APIXHRService("GET", API_PATH + "admin/monitoring/get-global-usage-summary", {
            });
        },
        getConnectionTasksHistory: function(connectionId) {
            return APIXHRService("GET", API_PATH + "admin/monitoring/ct/get-history", {
                connectionId: connectionId
            });
        },
        connectionData: {
            get: function(connectionId) {
            return APIXHRService("GET", API_PATH + "admin/monitoring/cd/get", {
                    connectionId: connectionId
                });
            },
            getForProject: function(connectionId, projectKey) {
            return APIXHRService("GET", API_PATH + "admin/monitoring/cd/get-for-project", {
                    connectionId: connectionId, projectKey: projectKey
                });
            },
            updateForProject: function(connectionId, projectKey, computeRecords, forceRecompute) {
            return APIXHRService("POST", API_PATH + "admin/monitoring/cd/update-for-project", {
                    connectionId: connectionId, projectKey: projectKey,
                    computeRecords: computeRecords, forceRecompute: forceRecompute
                });
            },
            updateForDataset: function(projectKey, datasetName, computeRecords, forceRecompute) {
            return APIXHRService("POST", API_PATH + "admin/monitoring/cd/update-for-dataset", {
                    projectKey: projectKey, datasetName: datasetName,
                    computeRecords: computeRecords, forceRecompute: forceRecompute
                });
            }
        },
        getProjectsIntegrations: function() {
            return APIXHRService("GET", API_PATH + "admin/monitoring/get-projects-integrations", {
            });
        },
        saveProjectIntegration: function(projectKey, data) {
            return APIXHRService("POST", API_PATH + "admin/monitoring/save-project-integration", {
                projectKey: projectKey,
                data: JSON.stringify(data)
            });
        },
        deleteProjectIntegration: function(projectKey, data) {
            return APIXHRService("POST", API_PATH + "admin/monitoring/delete-project-integration", {
                projectKey: projectKey,
                data: JSON.stringify(data)
            });
        },
    },
    clusters:{
        list: function() {
            return APIXHRService("GET", API_PATH + "clusters/list");
        },
        listAccessible: function(architecture) {
            return APIXHRService("GET", API_PATH + "clusters/list-accessible", {architecture: architecture});
        },
        get: function(clusterId) {
            return APIXHRService("GET", API_PATH + "clusters/get", {id: clusterId});
        },
        getStatus: function(clusterId) {
            return APIXHRService("GET", API_PATH + "clusters/get-status", {id: clusterId});
        },
        save: function(cluster) {
            return APIXHRService("POST", API_PATH + "clusters/save", {data: JSON.stringify(cluster)});
        },
        create : function(cluster) {
            return APIXHRService("POST", API_PATH + "clusters/create", {data: JSON.stringify(cluster)});
        },
        delete: function(clusterId) {
            return APIXHRService("POST", API_PATH + "clusters/delete", {id: clusterId});
        },
        start: function(clusterId) {
            return APIXHRService("POST", API_PATH + "clusters/start", {id: clusterId});
        },
        stop: function(clusterId, terminate) {
            return APIXHRService("POST", API_PATH + "clusters/stop", {id: clusterId, terminate: terminate});
        },
        markStopped: function(clusterId) {
            return APIXHRService("POST", API_PATH + "clusters/mark-stopped", {id: clusterId});
        },
        listLogs : function(clusterId){
            return APIXHRService("POST", API_PATH + "clusters/list-logs", {
            	clusterId: clusterId
            });
        },
        getLog : function(clusterId, logName){
            return APIXHRService("POST", API_PATH + "clusters/get-log", {
            	clusterId: clusterId, logName: logName
            });
        },
        streamLog : function(clusterId, logName){
            return APIXHRService("GET", API_PATH + "clusters/stream-log", {
            	clusterId: clusterId, logName: logName
            });
        },
        getDiagnosisURL: function(clusterId) {
            return API_PATH + "clusters/download-diagnosis?"
                     + "clusterId=" + encodeURIComponent(clusterId);
        },
        abortKernel : function(prefix, kernelId) {
            return APIXHRService("POST", API_PATH + "clusters/abort-kernel", {
                kernelId: kernelId, prefix: prefix
            });
        },
        preloadYarnClusterFiles : function(yarnClusterSettings) {
            return APIXHRService("POST", API_PATH + "clusters/preload-yarn-cluster-files", {
                yarnClusterSettings: JSON.stringify(yarnClusterSettings)
            });
        },
        testLivy : function(clusterId, livySettings) {
            return APIXHRService("POST", API_PATH + "clusters/test-livy", {
                clusterId : clusterId,
                livySettings: JSON.stringify(livySettings)
            });
        }
    },
    getGeneralSettings: function() {
        return APIXHRService("GET", API_PATH + "admin/get-general-settings");
    },
    getGlobalVariables: function() {
        return APIXHRService("GET", API_PATH + "admin/get-global-variables");
    },
    saveGlobalVariables: function(data) {
        return APIXHRService("POST", API_PATH + "admin/save-global-variables", {data: JSON.stringify(data)});
    },
    saveGeneralSettings: function(data) {
        return APIXHRService("POST", API_PATH + "admin/save-general-settings", {data: JSON.stringify(data)});
    },
    invalidateConfigCache: function(path) {
        return APIXHRService("POST", API_PATH + "admin/invalidate-config-cache", {path});
    },
    testLdapSettings: function(data) {
        return APIXHRService("POST", API_PATH + "admin/test-ldap-settings", {data: JSON.stringify(data)});
    },
    testLdapGetUserDetails: function(data) {
        return APIXHRService("POST", API_PATH + "admin/test-ldap-get-user-details", {data: JSON.stringify(data)});
    },
    executeVariablesUpdate: function() {
        return APIXHRService("POST", API_PATH + "admin/execute-variables-update");
    },
    getLimitsStatus: function() {
        return APIXHRService("GET", API_PATH + "admin/get-limits-status");
    },
    getThemes: function() {
        return APIXHRService("GET", API_PATH + "admin/get-themes");
    },
    folderEdit: {
        listContents: function(type) {
            return APIXHRService("GET", API_PATH + "admin/folder-edition/list-contents", {
                type: type
            });
        },
        getContent: function(type, path, sendAnyway) {
            return APIXHRService("GET", API_PATH + "admin/folder-edition/get-content", {
                type: type, path: path, sendAnyway: sendAnyway
            });
        },
        setContent: function(type, path, data) {
            return APIXHRService("POST", API_PATH + "admin/folder-edition/set-content", {
                type: type, path: path, data: data
            });
        },
        setContentMultiple: function(type, contentMap) {
            return APIXHRService("POST", API_PATH + "admin/folder-edition/set-content-multiple", {
                type: type, contentMap: JSON.stringify(contentMap)
            });
        },
        createContent: function(type, path, isFolder) {
            return APIXHRService("POST", API_PATH + "admin/folder-edition/create-content", {
                type: type, path: path, isFolder: isFolder
            });
        },
        deleteContent: function(type, path) {
            return APIXHRService("POST", API_PATH + "admin/folder-edition/delete-content", {
                type: type, path: path
            });
        },
        decompressContent: function(type, path) {
            return APIXHRService("POST", API_PATH + "admin/folder-edition/decompress-content", {
                type: type, path: path
            });
        },
        renameContent: function(type, path, newName) {
            return APIXHRService("POST", API_PATH + "admin/folder-edition/rename-content", {
                type: type, path: path, newName: newName
            });
        },
        moveContent: function(type, path, toPath) {
            return APIXHRService("POST", API_PATH + "admin/folder-edition/move-content", {
                type: type, path: path, toPath: toPath
            });
        },
        copyContent: function(type, path) {
            return APIXHRService("POST", API_PATH + "admin/folder-edition/copy-content", {
                type: type, path: path
            });
        },
        uploadContent: function(type, path, file, callback) {
            return uploadFileRequest("admin/folder-edition/upload-content", function(formdata) {
                formdata.append("type", type);
                formdata.append("path", path);
                formdata.append("file", file);
            }, callback);
        },
        checkUploadContent: function(type, path, filePaths) {
            return APIXHRService("POST", API_PATH + "admin/folder-edition/check-upload-content", {
                type: type, path: path, filePaths: JSON.stringify(filePaths)
            });
        }
    }
},
plugins: {
    get: function(pluginId, projectKey) {
        return APIXHRService("GET", API_PATH + "plugins/get", {
            pluginId: pluginId,
            projectKey: projectKey
        });
    },
    list: function(forceFetch) {
        return APIXHRService("GET", API_PATH + "plugins/list", {forceFetch: forceFetch});
    },
    listPluginsWithPresets: function() {
        return APIXHRService("GET", API_PATH + "plugins/list-plugins-with-presets");
    },
    install: function(pluginId, update) {
    	return APIXHRService("GET", API_PATH + "plugins/install-from-store", {pluginId: pluginId, update: update});
    },
    triggerRestart: function(pluginId, update) {
    	return APIXHRService("GET", API_PATH + "plugins/trigger-restart");
    },
    uploadPlugin: function(file, isUpdate) {
        return uploadFileRequest("plugins/upload", function(formdata) {
            formdata.append("file", file);
            formdata.append("isUpdate", isUpdate);
        }, null);
    },
    clonePlugin: function(uri, checkout, path, isUpdate) {
        return APIXHRService("POST", API_PATH + "plugins/clone", {
            repository: uri,
            checkout: checkout,
            path: path,
            isUpdate: isUpdate
        });
    },
    moveToDev: function(pluginId) {
        return APIXHRService("POST", API_PATH + "plugins/move-to-dev", {
            pluginId: pluginId
        });
    },
    useCodeEnv: function(pluginId, envName) {
        return APIXHRService("POST", API_PATH + "plugins/use-code-env", {
            pluginId: pluginId, envName: envName
        });
    },
    saveSettings: function(pluginId, projectKey, settings) {
    	return APIXHRService("POST", API_PATH + "plugins/save-settings", {
            pluginId: pluginId,
            projectKey: projectKey,
            data: JSON.stringify(settings)
        });
    },
    installRequirements: function(pluginId, type, envName) {
    	return APIXHRService("GET", API_PATH + "plugins/install-requirements", {pluginId: pluginId, type: type, envName: envName});
    },
    callPythonDo: function(sessionId, pluginId, componentId, config, payload, recipeConfig, projectKey, clusterId, part) {
        return APIXHRService("POST", API_PATH + "plugins/call-python-do", {
    		sessionId: sessionId,
    		pluginId: pluginId,
            componentId: componentId,
            projectKey: projectKey,
            clusterId: clusterId,
    		config: JSON.stringify(config),
    		payload: (payload != null ? JSON.stringify(payload) : null),
    		recipeConfig: (recipeConfig != null ? JSON.stringify(recipeConfig) : null),
    		part: part
    	});
    },
    listAccessiblePresets: function(pluginId, projectKey, elementId) {
        return APIXHRService("GET", API_PATH + "plugins/list-accessible-presets", {pluginId: pluginId, projectKey: projectKey, elementId: elementId});
    },
    getUsages: function(pluginId, projectKey) {
        return APIXHRService("GET", API_PATH + "plugins/get-usages", {pluginId: pluginId, projectKey: projectKey});
    },
    prepareDelete: function(pluginId) {
        return APIXHRService("GET", API_PATH + "plugins/prepare-delete", {pluginId: pluginId});
    },
    delete: function(pluginId, force = false) {
        return APIXHRService("GET", API_PATH + "plugins/delete", {pluginId: pluginId, force: force});
    }
},
plugindev: {
    git: {
        getLog: function(pluginId, since, count) {
            return APIXHRService("GET", API_PATH + "plugins-git/git-log", {
                pluginId: pluginId,
                since: since,
                count: count
            });
        },
        pull: function(pluginId, remoteName, branchName) {
            return APIXHRService("GET", API_PATH + "plugins-git/git-pull", {
                pluginId: pluginId,
                remoteName: remoteName,
                branchName: branchName
            });
        },
        fetch: function(pluginId, remoteName) {
            return APIXHRService("GET", API_PATH + "plugins-git/git-fetch", {
                pluginId: pluginId,
                remoteName: remoteName
            });
        },
        push: function(pluginId, remoteName, branchName) {
            return APIXHRService("GET", API_PATH + "plugins-git/git-push", {
                pluginId: pluginId,
                remoteName: remoteName,
                branchName: branchName
            });
        },
        resetToUpstream: function(pluginId, remoteName, branchName) {
            return APIXHRService("POST", API_PATH + "plugins-git/git-reset-to-upstream", {
                pluginId: pluginId,
                remoteName: remoteName,
                branchName: branchName
            });
        },
        resetToHead: function(pluginId) {
            return APIXHRService("POST", API_PATH + "plugins-git/git-reset-to-head", {
                pluginId: pluginId
            });
        },
        getFullStatus: function(pluginId) {
            return APIXHRService("GET", API_PATH + "plugins-git/git-full-status", {
                pluginId: pluginId
            });
        },
        listBranches: function(pluginId) {
            return APIXHRService("GET", API_PATH + "plugins-git/git-list-branches", {
                pluginId: pluginId
            });
        },
        commit: function(pluginId, commitMessage) {
            return APIXHRService("GET", API_PATH + "plugins-git/commit", {
                pluginId: pluginId,
                commitMessage: commitMessage
            });
        },
        prepareCommit: function(pluginId) {
            return APIXHRService("GET", API_PATH + "plugins-git/prepare-commit", {
                pluginId: pluginId
            });
        },
        createBranch: function(pluginId, branchName, commitId) {
            return APIXHRService("GET", API_PATH + "plugins-git/git-create-branch", {
                pluginId: pluginId,
                branchName: branchName,
                commitId: commitId
            });
        },
        switchBranch: function(pluginId, branchName, creation) {
            return APIXHRService("GET", API_PATH + "plugins-git/git-switch-branch", {
                pluginId: pluginId,
                branchName: branchName
            });
        },
        deleteBranches: function(pluginId, /*String[]*/branchNames, deleteOptions) {
            return APIXHRService("GET", API_PATH + "plugins-git/git-delete-branches", {
                pluginId: pluginId,
                branchNames: JSON.stringify(branchNames),
                remoteDelete: deleteOptions.remoteDelete,
                forceDelete: deleteOptions.forceDelete
            });
        },
        setRemote: function(pluginId, remoteName, remoteUrl) {
            return APIXHRService("GET", API_PATH + "plugins-git/git-set-remote", {
                pluginId: pluginId,
                remoteName: remoteName,
                remoteUrl: remoteUrl
            });
        },
        removeRemote: function(pluginId, remoteName) {
            return APIXHRService("GET", API_PATH + "plugins-git/git-rm-remote", {
                pluginId: pluginId,
                remoteName: remoteName
            });
        },
        getCommitDiff: function(pluginId, commitId) {
            return APIXHRService("GET", API_PATH + "plugins-git/get-commit-diff", {
                pluginId: pluginId,
                commitId: commitId
            });
        },
        getRevisionsDiff: function(pluginId, commitFrom, commitTo) {
            return APIXHRService("GET", API_PATH + "plugins-git/get-revisions-diff", {
                pluginId: pluginId,
                commitFrom: commitFrom,
                commitTo: commitTo
            });
        },
        revertPluginToRevision: function(pluginId, hash) {
            return APIXHRService("GET", API_PATH + "plugins-git/revert-plugin-to-revision", {
                pluginId: pluginId,
                hash: hash
            });
        },
        revertSingleCommit: function(pluginId, hash) {
            return APIXHRService("GET", API_PATH + "plugins-git/revert-single-commit", {
                pluginId: pluginId,
                hash: hash
            });
        },
    },
    reloadAll: function() {
        return APIXHRService("GET", API_PATH + "plugins/dev/reload-all");
    },
    list: function() {
       return APIXHRService("GET", API_PATH + "plugins/dev/list");
    },
    get: function(pluginId) {
        return APIXHRService("GET", API_PATH + "plugins/dev/get", {
            pluginId: pluginId
        });
    },
    create: function(pluginId, bootstrapMode, gitRepository, gitCheckout, gitPath) {
        return APIXHRService("POST", API_PATH + "plugins/dev/create", {
            pluginId: pluginId,
            bootstrapMode: bootstrapMode,
            gitRepository: gitRepository,
            gitCheckout: gitCheckout,
            gitPath: gitPath
        });
    },
    reload: function(pluginId) {
        return APIXHRService("POST", API_PATH + "plugins/dev/reload", {
            pluginId: pluginId
        });
    },
    addPythonDataset: function(pluginId, datasetId) {
        return  APIXHRService("POST", API_PATH + "plugins/dev/add-python-dataset", {
            pluginId: pluginId,
            datasetId: datasetId
        });
    },
    addJavaDataset: function(pluginId, datasetId, classNameForPlugin) {
        return  APIXHRService("POST", API_PATH + "plugins/dev/add-java-dataset", {
            pluginId: pluginId,
            datasetId: datasetId,
            className: classNameForPlugin
        });
    },
    addJavaRecipe: function(pluginId, recipeId, classNameForPlugin) {
        return  APIXHRService("POST", API_PATH + "plugins/dev/add-java-recipe", {
            pluginId: pluginId,
            recipeId: recipeId,
            className: classNameForPlugin
        });
    },
    addJavaDialect: function(pluginId, dialectId, classNameForPlugin) {
        return  APIXHRService("POST", API_PATH + "plugins/dev/add-java-dialect", {
            pluginId: pluginId,
            dialectId: dialectId,
            className: classNameForPlugin
        });
    },
    addJavaExposition: function(pluginId, expositionId, classNameForPlugin) {
        return  APIXHRService("POST", API_PATH + "plugins/dev/add-java-exposition", {
            pluginId: pluginId,
            expositionId: expositionId,
            className: classNameForPlugin
        });
    },
    addJythonProcessor: function(pluginId, stepId) {
        return  APIXHRService("POST", API_PATH + "plugins/dev/add-jython-processor", {
            pluginId: pluginId,
            stepId: stepId
        });
    },
    addPythonFormat: function(pluginId, formatId) {
        return  APIXHRService("POST", API_PATH + "plugins/dev/add-python-format", {
            pluginId: pluginId,
            formatId: formatId
        });
    },
    addJavaFormat: function(pluginId, formatId, classNameForPlugin) {
        return  APIXHRService("POST", API_PATH + "plugins/dev/add-java-format", {
            pluginId: pluginId,
            formatId: formatId,
            className: classNameForPlugin
        });
    },
    addPythonProbe: function(pluginId, probeId) {
        return  APIXHRService("POST", API_PATH + "plugins/dev/add-python-probe", {
            pluginId: pluginId,
            probeId: probeId
        });
    },
    addPythonExporter: function(pluginId, exporterId) {
        return  APIXHRService("POST", API_PATH + "plugins/dev/add-python-exporter", {
            pluginId: pluginId,
            exporterId: exporterId
        });
    },
    addJavaExporter: function(pluginId, exporterId, classNameForPlugin) {
        return  APIXHRService("POST", API_PATH + "plugins/dev/add-java-exporter", {
            pluginId: pluginId,
            exporterId: exporterId,
            className: classNameForPlugin
        });
    },
    addPythonCheck: function(pluginId, checkId) {
        return  APIXHRService("POST", API_PATH + "plugins/dev/add-python-check", {
            pluginId: pluginId,
            checkId: checkId
        });
    },
    addCustomFields: function(pluginId, customFieldsId) {
        return  APIXHRService("POST", API_PATH + "plugins/dev/add-custom-fields", {
            pluginId: pluginId,
            customFieldsId: customFieldsId
        });
    },
    addJavaPolicyHooks: function(pluginId, policyHooksId, classNameForPlugin) {
        return  APIXHRService("POST", API_PATH + "plugins/dev/add-java-policy-hooks", {
            pluginId: pluginId,
            policyHooksId: policyHooksId,
            className: classNameForPlugin
        });
    },
    addSqlProbe: function(pluginId, probeId) {
        return  APIXHRService("POST", API_PATH + "plugins/dev/add-sql-probe", {
            pluginId: pluginId,
            probeId: probeId
        });
    },
    addPredictionPythonAlgorithm: function(pluginId, algoId) {
        return  APIXHRService("POST", API_PATH + "plugins/dev/add-python-prediction-algorithm", {
            pluginId, algoId
        });
    },
    addStandardWebAppTemplate: function(pluginId, webAppId) {
        return  APIXHRService("POST", API_PATH + "plugins/dev/add-standard-webapp-template", {
            pluginId: pluginId,
            webAppId: webAppId
        });
    },
    addBokehWebAppTemplate: function(pluginId, webAppId) {
        return  APIXHRService("POST", API_PATH + "plugins/dev/add-bokeh-webapp-template", {
            pluginId: pluginId,
            webAppId: webAppId
        });
    },
    addDashWebAppTemplate: function(pluginId, webAppId) {
        return  APIXHRService("POST", API_PATH + "plugins/dev/add-dash-webapp-template", {
            pluginId: pluginId,
            webAppId: webAppId
        });
    },
    addShinyWebAppTemplate: function(pluginId, webAppId) {
        return  APIXHRService("POST", API_PATH + "plugins/dev/add-shiny-webapp-template", {
            pluginId: pluginId,
            webAppId: webAppId
        });
    },
    addRMarkdownReportTemplate: function(pluginId, reportId) {
        return  APIXHRService("POST", API_PATH + "plugins/dev/add-rmarkdown-report-template", {
            pluginId: pluginId,
            reportId: reportId
        });
    },
    addNotebookTemplate: function(type, language, preBuilt, pluginId, notebookId) {
        return  APIXHRService("POST", API_PATH + "plugins/dev/add-notebook-template", {
            pluginId: pluginId,
            notebookId: notebookId,
            type:type,
            language : language,
            preBuilt : preBuilt
        });
    },
    addPythonCluster: function(pluginId, clusterId) {
        return  APIXHRService("POST", API_PATH + "plugins/dev/add-python-cluster", {
            pluginId: pluginId,
            clusterId: clusterId
        });
    },
    addPythonStep: function(pluginId, stepId) {
        return  APIXHRService("POST", API_PATH + "plugins/dev/add-python-step", {
            pluginId: pluginId,
            stepId: stepId
        });
    },
    addPythonTrigger: function(pluginId, triggerId) {
        return  APIXHRService("POST", API_PATH + "plugins/dev/add-python-trigger", {
            pluginId: pluginId,
            triggerId: triggerId
        });
    },
    addPythonRunnable: function(pluginId, runnableId) {
        return  APIXHRService("POST", API_PATH + "plugins/dev/add-python-runnable", {
            pluginId: pluginId,
            runnableId: runnableId
        });
    },
    addJavaRunnable: function(pluginId, runnableId, classNameForPlugin) {
        return  APIXHRService("POST", API_PATH + "plugins/dev/add-java-runnable", {
            pluginId: pluginId,
            runnableId: runnableId,
            className : classNameForPlugin
        });
    },
    addCustomCodeRecipe: function(pluginId, customCodeRecipeId) {
        return  APIXHRService("POST", API_PATH + "plugins/dev/add-custom-code-recipe", {
            pluginId: pluginId,
            customCodeRecipeId: customCodeRecipeId
        });
    },
    addPythonFSProvider: function(pluginId, fsProviderId) {
        return  APIXHRService("POST", API_PATH + "plugins/dev/add-python-fs-provider", {
            pluginId: pluginId,
            fsProviderId: fsProviderId
        });
    },
    addJavaFSProvider: function(pluginId, fsProviderId, classNameForPlugin) {
        return  APIXHRService("POST", API_PATH + "plugins/dev/add-java-fs-provider", {
            pluginId: pluginId,
            fsProviderId: fsProviderId,
            className : classNameForPlugin
        });
    },
    addPythonCodeEnv: function(pluginId, unused, unused2, forceConda) {
        return  APIXHRService("POST", API_PATH + "plugins/dev/add-python-code-env", {
            pluginId: pluginId,
            forceConda: forceConda
        });
    },
    addRCodeEnv: function(pluginId, unused, unused2, forceConda) {
        return  APIXHRService("POST", API_PATH + "plugins/dev/add-r-code-env", {
            pluginId: pluginId,
            forceConda: forceConda
        });
    },
    addParameterSet: function(pluginId, parameterSetId) {
        return  APIXHRService("POST", API_PATH + "plugins/dev/add-parameter-set", {
            pluginId: pluginId,
            parameterSetId: parameterSetId
        });
    },
    listContents: function(pluginId) {
        return APIXHRService("GET", API_PATH + "plugins/dev/list-contents", {
            pluginId: pluginId
        });
    },
    getContent: function(pluginId, path, sendAnyway) {
        return APIXHRService("GET", API_PATH + "plugins/dev/get-content", {
            pluginId: pluginId, path: path, sendAnyway: sendAnyway
        });
    },
    setContent: function(pluginId, path, data) {
        return APIXHRService("POST", API_PATH + "plugins/dev/set-content", {
            pluginId: pluginId, path: path, data: data
        });
    },
    validate: function(pluginId, contentMap) {
        return APIXHRService("POST", API_PATH + "plugins/dev/validate", {
            pluginId: pluginId, contentMap: JSON.stringify(contentMap)
        });
    },
    setContentMultiple: function(pluginId, contentMap) {
        return APIXHRService("POST", API_PATH + "plugins/dev/set-content-multiple", {
            pluginId: pluginId, contentMap: JSON.stringify(contentMap)
        });
    },
    createContent: function(pluginId, path, isFolder) {
        return APIXHRService("POST", API_PATH + "plugins/dev/create-content", {
            pluginId: pluginId, path: path, isFolder: isFolder
        });
    },
    deleteContent: function(pluginId, path) {
        return APIXHRService("POST", API_PATH + "plugins/dev/delete-content", {
            pluginId: pluginId, path: path
        });
    },
    decompressContent: function(pluginId, path) {
        return APIXHRService("POST", API_PATH + "plugins/dev/decompress-content", {
            pluginId: pluginId, path: path
        });
    },
    renameContent: function(pluginId, path, newName) {
        return APIXHRService("POST", API_PATH + "plugins/dev/rename-content", {
            pluginId: pluginId, path: path, newName: newName
        });
    },
    moveContent: function(pluginId, path, toPath) {
        return APIXHRService("POST", API_PATH + "plugins/dev/move-content", {
            pluginId: pluginId, path: path, toPath: toPath
        });
    },
    copyContent: function(pluginId, path) {
        return APIXHRService("POST", API_PATH + "plugins/dev/copy-content", {
            pluginId: pluginId, path: path
        });
    },
    uploadContent: function(pluginId, path, file, callback) {
        return uploadFileRequest("plugins/dev/upload-content", function(formdata) {
            formdata.append("pluginId", pluginId);
            formdata.append("path", path);
            formdata.append("file", file);
        }, callback);
    },
    checkUploadContent: function(pluginId, path, filePaths) {
        return APIXHRService("POST", API_PATH + "plugins/dev/check-upload-content", {
            pluginId: pluginId, path: path, filePaths: JSON.stringify(filePaths)
        });
    },
    useCodeEnv: function(pluginId, envName) {
        return APIXHRService("POST", API_PATH + "plugins/dev/use-code-env", {
            pluginId: pluginId, envName: envName
        });
    },
    updateCodeEnv: function(pluginId) {
        return APIXHRService("POST", API_PATH + "plugins/dev/update-code-env", {
            pluginId: pluginId
        });
    },
    setActiveRemote: function(pluginId, remoteName) {
        return APIXHRService("POST", API_PATH + "plugins/dev/set-active-remote", {
            pluginId: pluginId,
            remoteName: remoteName
        });
    },
    removeCodeEnv: function(pluginId) {
        return APIXHRService("GET", API_PATH + "plugins/dev/remove-code-env", {
            pluginId: pluginId
        });
    },
},
metrics: {
    getComputedMetricWithHistory: function(projectKey, objectType, objectSmartName, partitionId, metricId) {
        return APIXHRService("GET", API_PATH + "metrics/get-computed-metric-with-history", {
            projectKey: projectKey,
            objectType: objectType,
            objectSmartName: objectSmartName,
            partitionId: partitionId,
            metricId: metricId
        });
    }
},
catalog: {
    search: function (query, facets, nospinner) {
        return APIXHRService("POST", API_PATH + "catalog/search", {
            query: query,
            facets: JSON.stringify(facets)
        }, nospinner ? "nospinner" : undefined);
    },
    searchColumns: function (query, facets) {
        return APIXHRService("POST", API_PATH + "catalog/search", {
            query: query,
            facets: JSON.stringify($.extend({}, facets, {scope: ['dss-column']}))
        })
    },
    searchMeanings: function (query, facets) {
        return APIXHRService("POST", API_PATH + "catalog/search", {
            query: query,
            facets: JSON.stringify($.extend({}, facets, {scope: ['meanings']})),
            type: "meanings"
        })
    },
    flush: function () {
        return APIXHRService("GET", API_PATH + "catalog/flush");
    },
    listDashboards: function () {
        return APIXHRService("GET", API_PATH + "catalog/list-dashboards");
    }
},
externalTable: {
    summary: function (tableKey) {
        return APIXHRService("POST", API_PATH + "external-table/get-summary", tableKey);
    },
    sample: function (tableKey) {
        return APIXHRService("POST", API_PATH + "external-table/preview", tableKey);
    },
    save: function (tableKey, dssMetadata) {
        return APIXHRService("POST", API_PATH + "external-table/save-metadata", $.extend({}, tableKey, {
            dssMetadata: JSON.stringify(dssMetadata)
        }))
    }
},
meanings: {
    listUDM: function() {
        return APIXHRService("GET", API_PATH + "meanings/udm/list-with-state");
    },
    saveUDM: function(userDefinedMeaning) {
        return  APIXHRService("POST", API_PATH + "meanings/udm/save", {
            userDefinedMeaning: JSON.stringify(userDefinedMeaning)
        });
    },
    createUDM: function(userDefinedMeaning) {
        return  APIXHRService("POST", API_PATH + "meanings/udm/create", {
            userDefinedMeaning: JSON.stringify(userDefinedMeaning)
        });
    },
    deleteUDM: function(id) {
        return  APIXHRService("POST", API_PATH + "meanings/udm/delete", {
            id: id
        });
    },
    prepareDeleteUDM: function(id) {
        return  APIXHRService("POST", API_PATH + "meanings/udm/prepare-delete", {
            id: id
        });
    },
    getUDM: function(id) {
        return  APIXHRService("GET", API_PATH + "meanings/udm/get", {
            id: id
        });
    }
},
internal: {
    debugKillBackend: function() {
        return APIXHRService("POST", API_PATH + "debugging/kill-backend")
    },
    debugGetBackendStacks: function() {
        return APIXHRService("GET", API_PATH + "debugging/dump-backend-stacks")
    },
    restartAllHTMLBackends: function() {
        return APIXHRService("GET", API_PATH + "debugging/restart-all-html-backends");
    },
    runScenarioTriggers:  function() {
        return APIXHRService("GET", API_PATH + "debugging/run-scenario-triggers");
    },
    fakeScenarioRun: function(projectKey, scenarioId, date, outcome) {
        return APIXHRService("POST", API_PATH + "debugging/run-fake-scenario", {
            projectKey: projectKey,
            scenarioId: scenarioId,
            date: date,
            outcome: outcome
        });
    },
    fakeFuture: function(projectKey, payloadClassName, payloadMethodName, randomUser) {
        return APIXHRService("POST", API_PATH + "debugging/run-fake-future", {
            projectKey: projectKey,
            payloadClassName: payloadClassName,
            payloadMethodName: payloadMethodName,
            randomUser: randomUser
        });
    },
    sendOfflineQueues: function() {
        return APIXHRService("GET", API_PATH + "debugging/send-offline-queues");
    },
    sendDigests: function() {
        return APIXHRService("GET", API_PATH + "debugging/send-digests");
    },
    buildUsageSummaryReports: function() {
        return APIXHRService("GET", API_PATH + "debugging/build-usage-summary-reports");
    },
    getTriggerQueueingInfo: function() {
        return APIXHRService("GET", API_PATH + "debugging/get-trigger-queueing-info");
    },
    fail: function(fail) {
        return APIXHRService("GET", API_PATH + "debugging/slow-fail", {fail});
    },
    resyncProjectFolders: () => {
        return APIXHRService("GET", API_PATH + "debugging/resync-project-folders");
    },
    clearScenarioReportsCaches: function() {
        return APIXHRService("POST", API_PATH + "debugging/clear-scenario-report-caches")
    }
},
apideployer: {
    globalLightStatus: function() {
        return APIXHRService("GET", API_PATH + "api-deployer/global-light-status", null);
    },
    client: {
        listPublishedServices: function() {
            return APIXHRService("GET", API_PATH + "api-deployer/client/published-api-services/list-light-status");
        },
        listDeployments: function() {
            return APIXHRService("GET", API_PATH + "api-deployer/client/deployments/list-light-status");
        }
    },
    publishedAPIServices: {
        listBasicInfo: function() {
            return APIXHRService("GET", API_PATH + "api-deployer/published-api-services/list-basic-info");
        },
        listLightStatus: function() {
            return APIXHRService("GET", API_PATH + "api-deployer/published-api-services/list-light-status");
        },
        getLightStatus: function(serviceId) {
            return APIXHRService("GET", API_PATH + "api-deployer/published-api-services/get-light-status", {
                serviceId: serviceId
            });
        },
        getSettings: function(serviceId) {
            return APIXHRService("GET", API_PATH + "api-deployer/published-api-services/get-settings", {
                serviceId: serviceId
            });
        },
        create: function(serviceId, label) {
            return APIXHRService("POST", API_PATH + "api-deployer/published-api-services/create", {
                serviceId: serviceId,
                label: label
            });
        },
        save: function(service) {
            return APIXHRService("POST", API_PATH + "api-deployer/published-api-services/save", {
                service: angular.toJson(service)
            });
        },
        delete: function(serviceId) {
            return APIXHRService("POST", API_PATH + "api-deployer/published-api-services/delete", {
                serviceId: serviceId
            });
        },
        publishVersion: function(serviceId, file, callback) {
            return uploadFileRequest("api-deployer/versions/publish", function(formdata) {
                formdata.append("serviceId", serviceId);
                formdata.append("file", file);
            }, callback);
        },
        deletePackage: function(serviceId, versionId) {
            return APIXHRService("POST", API_PATH + "api-deployer/versions/delete", {
                serviceId: serviceId,
                versionId: versionId
            });
        }
    },
    infras: {
        listBasicInfo: function() {
            return APIXHRService("GET", API_PATH + "api-deployer/infras/list-basic-info");
        },
        listLightStatus: function() {
            return APIXHRService("GET", API_PATH + "api-deployer/infras/list-light-status");
        },
        getLightStatus: function(infraId) {
            return APIXHRService("GET", API_PATH + "api-deployer/infras/get-light-status", {
                infraId: infraId
            });
        },
        getSettings: function(infraId) {
            return APIXHRService("GET", API_PATH + "api-deployer/infras/get-settings", {
                infraId: infraId
            });
        },
        create: function(infra) {
            return APIXHRService("POST", API_PATH + "api-deployer/infras/create", {
                infraId: infra.id,
                stage: infra.stage,
                type: infra.type
            });
        },
        save: function(infra) {
            return APIXHRService("POST", API_PATH + "api-deployer/infras/save", {
                infra: JSON.stringify(infra)
            });
        },
        delete: function(infraId) {
            return APIXHRService("POST", API_PATH + "api-deployer/infras/delete", {
                infraId: infraId
            });
        }
    },
    deployments: {
        listTags: function() {
            return APIXHRService("GET", API_PATH + "api-deployer/deployments/list-tags");
        },
        listBasicInfo: function() {
            return APIXHRService("GET", API_PATH + "api-deployer/deployments/list-basic-info");
        },
        listLightStatus: function() {
            return APIXHRService("GET", API_PATH + "api-deployer/deployments/list-light-status");
        },
        getLightStatus: function(deploymentId) {
            return APIXHRService("GET", API_PATH + "api-deployer/deployments/get-light-status", {
                deploymentId: deploymentId
            });
        },
        getSettings: function(deploymentId) {
            return APIXHRService("GET", API_PATH + "api-deployer/deployments/get-settings", {
                deploymentId: deploymentId
            });
        },
        create: function(deploymentId, publishedServiceId, infraId, version) {
            return APIXHRService("POST", API_PATH + "api-deployer/deployments/create", {
                deploymentId: deploymentId,
                publishedServiceId: publishedServiceId,
                infraId: infraId,
                version: version
            })
        },
        save: function(deployment) {
            return APIXHRService("POST", API_PATH + "api-deployer/deployments/save", {
                deployment: JSON.stringify(deployment)
            });
        },
        copy: function(deploymentId, newDeploymentId, newInfraId) {
            return APIXHRService("POST", API_PATH + "api-deployer/deployments/copy", {
                deploymentId: deploymentId,
                newDeploymentId: newDeploymentId,
                newInfraId: newInfraId
            });
        },
        switchVersion: function(deploymentId, versionId) {
            return APIXHRService("POST", API_PATH + "api-deployer/deployments/switch-version", {
                deploymentId: deploymentId,
                versionId: versionId
            });
        },
        delete: function(deploymentId) {
            return APIXHRService("POST", API_PATH + "api-deployer/deployments/delete", {
                deploymentId: deploymentId
            });
        },
        getHeavyStatus : function(deploymentId, withTestQueries) {
            return APIXHRService("GET", API_PATH + "api-deployer/deployments/get-heavy-status", {
                deploymentId: deploymentId, withTestQueries: withTestQueries
            }, "nospinner");
        },
        executeSyncK8S : function(deploymentId )  {
            return APIXHRService("POST", API_PATH + "api-deployer/deployments/execute-sync-k8s", {
                deploymentId: deploymentId
            });
        },
        prepareSyncStatic : function(deploymentId)  {
            return APIXHRService("POST", API_PATH + "api-deployer/deployments/prepare-sync-static", {
                deploymentId: deploymentId
            });
        },
        executeSyncStatic : function(deploymentId, forceRefresh)  {
            return APIXHRService("POST", API_PATH + "api-deployer/deployments/execute-sync-static", {
                deploymentId: deploymentId,
                forceRefresh: forceRefresh
            });
        },
        getChartData : function(deploymentId, endpointId, chartType, timeRange) {
            return APIXHRService("GET", API_PATH + "api-deployer/deployments/carbonapi-chart", {
                deploymentId:deploymentId,
                endpointId : endpointId,
                chartType : chartType,
                timeRange: timeRange,
                format: "json"
            }, "nospinner");
        },
        chartURL : function(deploymentId, endpointId, chartType, timeRange, format) {
            return API_PATH + `api-deployer/deployments/carbonapi-chart?deploymentId=${deploymentId}&endpointId=${endpointId}&chartType=${chartType}&timeRange=${timeRange}&format=${format}`;
        },
        runTestQuery: function(deploymentId, endpointId, testQueries, unsavedTestQueries) {
            return APIXHRService("POST", API_PATH + "api-deployer/deployments/run-test-queries", {
                deploymentId:deploymentId,
                endpointId: endpointId,
                testQueries: JSON.stringify(testQueries),
                unsavedTestQueries: JSON.stringify(unsavedTestQueries)
            });
        }
    }
},
help: {
    search: (q, params = {}, key="AIzaSyAI-tob6ERG-Pz-kYxPc8s6BNNa6Fl1M-A", cx="718d55b8e3d8705a6") => {
        return APIXHRService("GET", 'https://www.googleapis.com/customsearch/v1/siterestrict', Object.assign({key, cx, q}, params), 'nospinner');
    }
},
projectdeployer: {
    globalLightStatus: function() {
        return APIXHRService("GET", API_PATH + "project-deployer/global-light-status", null);
    },
    client: {
        listPublishedProjects: function() {
            return APIXHRService("GET", API_PATH + "project-deployer/client/published-projects/list-light-status");
        },
        listDeployments: function() {
            return APIXHRService("GET", API_PATH + "project-deployer/client/deployments/list-light-status");
        }
    },
    publishedProjects: {
        listBasicInfo: function() {
            return APIXHRService("GET", API_PATH + "project-deployer/published-projects/list-basic-info");
        },
        listLightStatus: function() {
            return APIXHRService("GET", API_PATH + "project-deployer/published-projects/list-light-status");
        },
        getLightStatus: function(projectKey) {
            return APIXHRService("GET", API_PATH + "project-deployer/published-projects/get-light-status", {
                projectKey: projectKey
            });
        },
        getSettings: function(projectKey) {
            return APIXHRService("GET", API_PATH + "project-deployer/published-projects/get-settings", {
                projectKey: projectKey
            });
        },
        create: function(projectKey, label) {
            return APIXHRService("POST", API_PATH + "project-deployer/published-projects/create", {
                projectKey: projectKey,
                label: label
            });
        },
        save: function(project) {
            return APIXHRService("POST", API_PATH + "project-deployer/published-projects/save", {
                project: angular.toJson(project)
            });
        },
        delete: function(projectKey) {
            return APIXHRService("POST", API_PATH + "project-deployer/published-projects/delete", {
                projectKey: projectKey
            });
        },
        uploadBundle: function(projectKey, file, callback) {
            return uploadFileRequest("project-deployer/bundles/upload", function(formdata) {
                formdata.append("projectKey", projectKey ? projectKey : "");
                formdata.append("file", file);
            }, callback);
        },
        getBundleDetails: function(projectKey, bundleId) {
            return APIXHRService("GET", API_PATH + "project-deployer/bundles/get-details", {
                projectKey: projectKey,
                bundleId: bundleId
            });
        },
        getBundleDetailsExtended: function(projectKey, bundleId) {
            return APIXHRService("GET", API_PATH + "project-deployer/bundles/get-details-extended", {
                projectKey: projectKey,
                bundleId: bundleId
            });
        },
        deleteBundle: function(projectKey, bundleId) {
            return APIXHRService("POST", API_PATH + "project-deployer/bundles/delete", {
                projectKey: projectKey,
                bundleId: bundleId
            });
        }
    },
    infras: {
        checkStatus: function(infraId) {
            return APIXHRService("GET", API_PATH + "project-deployer/infras/check-status", {infraId: infraId}, "nospinner");
        },
        listBasicInfo: function() {
            return APIXHRService("GET", API_PATH + "project-deployer/infras/list-basic-info");
        },
        listLightStatus: function() {
            return APIXHRService("GET", API_PATH + "project-deployer/infras/list-light-status");
        },
        getLightStatus: function(infraId) {
            return APIXHRService("GET", API_PATH + "project-deployer/infras/get-light-status", {
                infraId: infraId
            });
        },
        getSettings: function(infraId) {
            return APIXHRService("GET", API_PATH + "project-deployer/infras/get-settings", {
                infraId: infraId
            });
        },
        create: function(infra) {
            return APIXHRService("POST", API_PATH + "project-deployer/infras/create", {
                infraId: infra.id,
                stage: infra.stage,
                automationNodeUrl: infra.automationNodeUrl,
                apiKey: infra.apiKey
            });
        },
        save: function(infra) {
            return APIXHRService("POST", API_PATH + "project-deployer/infras/save", {
                infra: JSON.stringify(infra)
            });
        },
        delete: function(infraId) {
            return APIXHRService("POST", API_PATH + "project-deployer/infras/delete", {
                infraId: infraId
            });
        },
        getProjectKeys: function(infraId) {
            return APIXHRService("GET", API_PATH + "project-deployer/infras/get-project-keys", {
                infraId: infraId
            });
        },
        getProjectFolderHierarchy: function(infraId) {
            return APIXHRService("GET", API_PATH + "project-deployer/infras/project-folder-hierarchy", {
                infraId: infraId
            });
        }
    },
    deployments: {
        listTags: function() {
            return APIXHRService("GET", API_PATH + "project-deployer/deployments/list-tags");
        },
        listBasicInfo: function() {
            return APIXHRService("GET", API_PATH + "project-deployer/deployments/list-basic-info");
        },
        listLightStatus: function() {
            return APIXHRService("GET", API_PATH + "project-deployer/deployments/list-light-status");
        },
        getLightStatus: function(deploymentId) {
            return APIXHRService("GET", API_PATH + "project-deployer/deployments/get-light-status", {
                deploymentId: deploymentId
            });
        },
        getSettings: function(deploymentId) {
            return APIXHRService("GET", API_PATH + "project-deployer/deployments/get-settings", {
                deploymentId: deploymentId
            });
        },
        create: function(deploymentId, publishedProjectKey, infraId, bundleId, deployedProjectKey, projectFolderId) {
            return APIXHRService("POST", API_PATH + "project-deployer/deployments/create", {
                deploymentId: deploymentId,
                publishedProjectKey: publishedProjectKey,
                infraId: infraId,
                bundleId: bundleId,
                deployedProjectKey: deployedProjectKey,
                projectFolderId: projectFolderId
            })
        },
        save: function(deployment) {
            return APIXHRService("POST", API_PATH + "project-deployer/deployments/save", {
                deployment: JSON.stringify(deployment)
            });
        },
        copy: function(deploymentId, newDeploymentId, newInfraId, newDeployedProjectKey, newProjectFolderId) {
            return APIXHRService("POST", API_PATH + "project-deployer/deployments/copy", {
                deploymentId: deploymentId,
                newDeploymentId: newDeploymentId,
                newInfraId: newInfraId,
                newDeployedProjectKey: newDeployedProjectKey,
                newProjectFolderId: newProjectFolderId
            });
        },
        switchBundle: function(deploymentId, bundleId) {
            return APIXHRService("POST", API_PATH + "project-deployer/deployments/switch-bundle", {
                deploymentId: deploymentId,
                bundleId: bundleId
            });
        },
        delete: function(deploymentId) {
            return APIXHRService("POST", API_PATH + "project-deployer/deployments/delete", {
                deploymentId: deploymentId
            });
        },
        getHeavyStatus : function(deploymentId) {
            return APIXHRService("GET", API_PATH + "project-deployer/deployments/get-heavy-status", {
                deploymentId: deploymentId
            }, "nospinner");
        },
        listHeavyStatus: function(infraId) {
            return APIXHRService("GET", API_PATH + "project-deployer/deployments/list-heavy-status", {
                infraId
            }, "nospinner");
        },
        scenarioLastRuns : function(deploymentId, fromDate, toDate)  {
            return APIXHRService("POST", API_PATH + "project-deployer/deployments/scenario-runs-in-date-range", {
                deploymentId: deploymentId,
                fromDate: fromDate,
                toDate: toDate
            });
        },
        prepareSync : function(deploymentId)  {
            return APIXHRService("POST", API_PATH + "project-deployer/deployments/prepare-sync", {
                deploymentId: deploymentId
            });
        },
        startPreload : function(deploymentId)  {
            return APIXHRService("POST", API_PATH + "project-deployer/deployments/start-preload", {
                deploymentId: deploymentId
            });
        },
        activateCheck : function(deploymentId)  {
            return APIXHRService("POST", API_PATH + "project-deployer/deployments/activate-check", {
                deploymentId: deploymentId
            });
        },
        startActivate : function(deploymentId)  {
            return APIXHRService("POST", API_PATH + "project-deployer/deployments/start-activate", {
                deploymentId: deploymentId
            });
        }
    }
}
};
}]);

})();

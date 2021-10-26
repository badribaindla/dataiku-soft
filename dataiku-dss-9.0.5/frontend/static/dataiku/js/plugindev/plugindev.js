(function() {
'use strict';

    const app = angular.module('dataiku.plugindev', ['dataiku.plugindev.git']);


    app.controller('PlugindevCommonController', function($scope, DataikuAPI, $controller, $state, $stateParams, CreateModalFromTemplate, TopNav, FutureWatcher, WT1) {
        TopNav.setLocation(TopNav.DSS_HOME, 'plugin');

        const COMPONENT_IDENTIFIER_PLACEHOLDER = 'use-this-kind-of-case';

        if ($scope.appConfig.pluginDevGitMode === 'PLUGIN') {
            $controller('_PlugindevGitController', {$scope: $scope});
        }

        let regularPyAndJavaDescriptors = [
            { key: "python", label: "Python" },
            { key: "java", label: "Java"}
        ];

        let regularPyOnlyDescriptor = [
            { key: "python", label: "Python" }
        ];

        let regularJavaOnlyDescriptor = [
            { key: "java", label: "Java" }
        ];

        let regularJythonOnlyDescriptor = [
            { key: "jython", label: "Python" }
        ];

        let regularPyAndRDescriptors = [
            { key: "python", label: "Python" },
            { key: "r", label: "R"}
        ];
        let regularGenericOnlyDescriptor = [
            { key : "generic", label: "Generic" }
        ];

        let downloadIframe = $('<iframe>').attr('id', 'plugin-downloader');
        downloadIframe[0].onload = function() {
            // If download failed, notify user.
            if (this.contentDocument.URL !== 'about:blank') {
                CreateModalFromTemplate('/templates/plugins/modals/plugin-download-error.html', $scope);
            }
        };

        function getIdentifierHint(typeName = '') {
            return `Unique identifier for the new ${typeName} type. <br> It should not start with the plugin id and must be unique across the ${typeName} components of this plugin.` ;
        }

        $scope.initContentTypeList = function(pluginData=$scope.pluginData) {
            let codeEnvSpec = pluginData.installedDesc && pluginData.installedDesc.codeEnvSpec;
            $scope.contentTypeList = [
                {
                    name: "Code Env",
                    type: "codeEnv",
                    icon: 'icon-cogs',
                    iconColor: 'universe-color more',
                    disabled: codeEnvSpec != null,
                    disabledReason: "Only one code env can exist in a plugin",
                    description: "Create the code environment associated with this plugin, defining required libraries and their versions.",
                    addDescriptors: regularPyAndRDescriptors,
                    addFuncMap: {
                        python: DataikuAPI.plugindev.addPythonCodeEnv,
                        r: DataikuAPI.plugindev.addRCodeEnv
                    }
                },
                {
                    name: "Dataset",
                    type: "customDatasets",
                    icon: "icon-database",
                    iconColor: "universe-color datasets",
                    description: "Create a new type of dataset. This is generally used to fetch data from an external service, for example using an API",
                    addDescriptors: regularPyAndJavaDescriptors,
                    addFuncMap: {
                        java: DataikuAPI.plugindev.addJavaDataset,
                        python: DataikuAPI.plugindev.addPythonDataset
                    },
                    identifierPlaceholder: (() => COMPONENT_IDENTIFIER_PLACEHOLDER),
                    identifierHint: (() => getIdentifierHint('dataset'))
                },
                 {
                    name: "Recipe",
                    type: "customCodeRecipes",
                    icon: 'icon-FLOW_recipe_empty',
                    iconColor: 'universe-color recipe',
                    disabled: true,
                    disabledReason: "To create a new plugin recipe, you need to create it from an existing code recipe in a project. Go to the advanced tab > Convert to plugin recipe.",
                    description: "Create a new kind of recipe (Python, R, or Scala)"
                },
                {
                    name: "Macro",
                    type: "customRunnables",
                    icon: 'universe-color more',
                    iconColor: 'icon-macro',
                    description: "Create a new kind of runnable piece. Useful to occasionally launch external or maintenance tasks. Macros can also be run in a scenario.",
                    addDescriptors: regularPyAndJavaDescriptors,
                    addFuncMap: {
                        java: DataikuAPI.plugindev.addJavaRunnable,
                        python: DataikuAPI.plugindev.addPythonRunnable
                    },
                    identifierPlaceholder: (() => COMPONENT_IDENTIFIER_PLACEHOLDER),
                    identifierHint: (() => getIdentifierHint('runnable'))
                },
                {
                    name: "Parameter set",
                    type: "customParameterSets",
                    icon: 'icon-indent-right',
                    iconColor: 'universe-color more',
                    description: "Create a definition for presets in this plugin.",
                    addDescriptors : regularGenericOnlyDescriptor,
                    addFuncMap: {
                        generic: DataikuAPI.plugindev.addParameterSet,
                    },
                    identifierPlaceholder: (() => COMPONENT_IDENTIFIER_PLACEHOLDER),
                    identifierHint: (() => getIdentifierHint('parameter set'))
                },
                {
                    name: "Notebook template",
                    type: function(language = '') {
                        if (language.startsWith("scala")) {
                            return "customScalaNotebookTemplates"
                        }
                        if (language.startsWith("r")) {
                            return "customRNotebookTemplates"
                        }
                        return "customPythonNotebookTemplates";
                    },
                    icons: {
                        'customPreBuiltDatasetNotebookTemplates': { icon: 'icon-dku-nav_notebook', iconColor: 'universe-color notebook'},
                        'customRNotebookTemplates': { icon: 'icon-code_r_recipe', iconColor: 'universe-color notebook'},
                        'customRDatasetNotebookTemplates': { icon: 'icon-code_r_recipe', iconColor: 'universe-color notebook'},
                        'customPythonNotebookTemplates': { icon: 'icon-code_python_recipe', iconColor: 'universe-color notebook'},
                        'customPythonDatasetNotebookTemplates': { icon: 'icon-code_python_recipe', iconColor: 'universe-color notebook'},
                        'customScalaNotebookTemplates': { icon: 'icon-code_spark_scala_recipe', iconColor: 'universe-color notebook'},
                        'customScalaDatasetNotebookTemplates': { icon: 'icon-code_spark_scala_recipe', iconColor: 'universe-color notebook'}
                    },
                    description: "Create a new notebook template.",
                    addDescriptors: [
                        { key: "pythonDataset", label: "Python (create from a dataset)" },
                        { key: "pythonStandalone", label: "Python (create from notebooks list, unrelated to a dataset)" },
                        { key: "pythonDatasetPrebuilt", label: "Python (create from a dataset, in 'predefined' list)" },
                        { key: "rDataset", label: "R (create from a dataset)" },
                        { key: "rStandalone", label: "R (create from notebooks list, unrelated to a dataset)" },
                        { key: "rDatasetPrebuilt", label: "R (create from a dataset, in 'predefined' list)" },
                        { key: "scalaDataset", label: "Scala (create from a dataset)" },
                        { key: "scalaStandalone", label: "Scala (create from notebooks list, unrelated to a dataset)" }
                    ],
                    identifierPlaceholder: (() => COMPONENT_IDENTIFIER_PLACEHOLDER),
                    identifierHint: (() => getIdentifierHint('notebook template')),
                    addFuncMap: {
                        pythonDataset: DataikuAPI.plugindev.addNotebookTemplate.bind(this, "dataset", "python", false),
                        pythonStandalone: DataikuAPI.plugindev.addNotebookTemplate.bind(this, "standalone", "python", false),
                        pythonDatasetPrebuilt: DataikuAPI.plugindev.addNotebookTemplate.bind(this, "dataset", "python", true),
                        rDataset: DataikuAPI.plugindev.addNotebookTemplate.bind(this, "dataset", "r", false),
                        rStandalone: DataikuAPI.plugindev.addNotebookTemplate.bind(this, "standalone", "r", false),
                        rDatasetPrebuilt: DataikuAPI.plugindev.addNotebookTemplate.bind(this, "dataset", "r", true),
                        scalaDataset: DataikuAPI.plugindev.addNotebookTemplate.bind(this, "dataset", "scala", false),
                        scalaStandalone: DataikuAPI.plugindev.addNotebookTemplate.bind(this, "standalone", "scala", false)
                    }
                },
                {
                    name: "RMarkdown report template",
                    type: "customRMarkdownReportTemplates",
                    icon: 'icon-DKU_rmd',
                    iconColor: 'universe-color report',
                    description: "Create a new template for RMarkdown reports",
                    addDescriptors : [
                        { key : "rmarkdown", label: "RMarkdown" }
                    ],
                    addFuncMap: {
                        rmarkdown: DataikuAPI.plugindev.addRMarkdownReportTemplate
                    },
                    identifierPlaceholder : (() => COMPONENT_IDENTIFIER_PLACEHOLDER),
                    identifierHint : (() => getIdentifierHint('RMarkdown report template'))
                },
                 {
                    name: "Webapp",
                    type: "customWebApps",
                    icon: 'icon-eye',
                    iconColor: 'universe-color recipe-visual',
                    disabled: true,
                    disabledReason: "To create a new plugin webapp, you need to create it from an existing webapp in a project. Go to the advanced tab > Convert to plugin webapp.",
                    description: "Create a reusable webapp for custom visualization or interactive screen without code for the end user",
                },
                {
                    name: "Webapp template",
                    type: function(language = '') {
                        if (language.startsWith("bokeh")) {
                            return "customBokehWebAppTemplates"
                        }
                        if (language.startsWith("shiny")) {
                            return "customShinyWebAppTemplates"
                        }
                        if (language.startsWith("dash")) {
                            return "customDashWebAppTemplates"
                        }
                        return "customStandardWebAppTemplates";
                    },
                    icons: {
                        'customBokehWebAppTemplates': { icon: 'icon-bokeh', iconColor: 'universe-color recipe-code' },
                        'customDashWebAppTemplates': { icon: 'icon-dash', iconColor: 'universe-color recipe-code' },
                        'customShinyWebAppTemplates': { icon: 'icon-shiny', iconColor: 'universe-color recipe-code' },
                        'customStandardWebAppTemplates': { icon: 'icon-code', iconColor: 'universe-color recipe-code' }
                    },
                    description: "Create a new template for webapps",
                    addDescriptors: [
                        { key : "standard", label: "Standard webapp (JS/HTML/CSS/Python)" },
                        { key : "bokeh", label: "Bokeh webapp (Python)" },
                        { key : "dash", label: "Dash webapp (Python)" },
                        { key : "shiny", label: "Shiny webapp (R)" }
                    ],
                    addFuncMap: {
                        standard: DataikuAPI.plugindev.addStandardWebAppTemplate,
                        bokeh: DataikuAPI.plugindev.addBokehWebAppTemplate,
                        dash: DataikuAPI.plugindev.addDashWebAppTemplate,
                        shiny: DataikuAPI.plugindev.addShinyWebAppTemplate
                    },
                    identifierPlaceholder: (() => COMPONENT_IDENTIFIER_PLACEHOLDER),
                    identifierHint: (() => getIdentifierHint('template for webapps'))
                },
                {
                    name: "Scenario trigger",
                    type: "customPythonTriggers",
                    icon: 'icon-list',
                    iconColor: 'universe-color scenario',
                    description: "Create a new kind of trigger for scenarios",
                    addDescriptors: regularPyOnlyDescriptor,
                    addFuncMap: {
                        python: DataikuAPI.plugindev.addPythonTrigger
                    },
                    identifierPlaceholder: (() => COMPONENT_IDENTIFIER_PLACEHOLDER),
                    identifierHint: (() => getIdentifierHint('trigger'))
                },
                {
                    name: "Scenario step",
                    type: "customPythonSteps",
                    icon: 'icon-step-forward',
                    iconColor: 'universe-color scenario',
                    description: "Create a new kind of step for scenarios",
                    addDescriptors: regularPyOnlyDescriptor,
                    addFuncMap: {
                        python: DataikuAPI.plugindev.addPythonStep
                    },
                    identifierPlaceholder: (() => COMPONENT_IDENTIFIER_PLACEHOLDER),
                    identifierHint: (() => getIdentifierHint('scenario step'))
                },
                {
                    name: "Metrics probe",
                    type: function(language = '') {
                        if (language.startsWith("sql")) {
                            return "customSQLProbes"
                        }
                        return "customPythonProbes";
                    },
                    icons: {
                        'customSQLProbes': { icon: 'icon-subscript', iconColor: 'universe-color datasets' },
                        'customPythonProbes': { icon: 'icon-superscript', iconColor: 'universe-color datasets' }
                    },
                    description: "Create a new kind of probe to compute metrics, that can be applied on datasets",
                    addDescriptors: [
                        { key: "python", label: "Python" },
                        { key: "sql", label: "SQL"}
                    ],
                    addFuncMap: {
                        python: DataikuAPI.plugindev.addPythonProbe,
                        sql: DataikuAPI.plugindev.addSqlProbe
                    },
                    identifierPlaceholder: (() => COMPONENT_IDENTIFIER_PLACEHOLDER),
                    identifierHint: (() => getIdentifierHint('probe'))
                },
                {
                    name: "Check",
                    type: "customPythonChecks",
                    icon: 'icon-ok',
                    iconColor: 'universe-color dataset',
                    description: "Create a new kind of check that can be applied on datasets",
                    addDescriptors: regularPyOnlyDescriptor,
                    addFuncMap: {
                        python: DataikuAPI.plugindev.addPythonCheck,
                    },
                    identifierPlaceholder: (() => COMPONENT_IDENTIFIER_PLACEHOLDER),
                    identifierHint: (() => getIdentifierHint('check'))
                },
                {
                    name: "Exporter",
                    type: "customExporters",
                    icon: 'icon-dku-download',
                    iconColor: 'universe-color datasets',
                    description: "Create a new option to export dataset out of DSS. This can be export to file (that the user can download) or to custom destinations (like an external API). Exporters have only 'write' support. If you want 'read' support, you need to write a format instead",
                    addDescriptors: regularPyAndJavaDescriptors,
                    addFuncMap: {
                        java: DataikuAPI.plugindev.addJavaExporter,
                        python: DataikuAPI.plugindev.addPythonExporter
                    },
                    identifierPlaceholder: (() => COMPONENT_IDENTIFIER_PLACEHOLDER),
                    identifierHint: (() => getIdentifierHint('exporter'))
                },
                {
                    name: "File format",
                    type: "customFormats",
                    icon: 'icon-file',
                    iconColor: 'universe-color datasets',
                    description: "Create a new supported file format, that DSS uses to read and write on all files-based kinds of datasets (Filesystem, HDFS, S3, ...). Write support is optional",
                    addDescriptors: regularPyAndJavaDescriptors,
                    addFuncMap: {
                        java: DataikuAPI.plugindev.addJavaFormat,
                        python: DataikuAPI.plugindev.addPythonFormat
                    },
                    identifierPlaceholder: (() => COMPONENT_IDENTIFIER_PLACEHOLDER),
                    identifierHint: (() => getIdentifierHint('file format'))
                },
                {
                    name: "FS provider",
                    type: "customFileSystemProviders",
                    icon: 'icon-server_file_system_1',
                    iconList: 'universe-color datasets',
                    description: "Create a new kind of files-based system, usable both for dataset (together with a file format) or for managed folders. Examples include cloud storages, file sharing systems, ... Write support is optional.",
                    addDescriptors: regularPyAndJavaDescriptors,
                    addFuncMap: {
                        java: DataikuAPI.plugindev.addJavaFSProvider,
                        python: DataikuAPI.plugindev.addPythonFSProvider
                    },
                    identifierPlaceholder: (() => COMPONENT_IDENTIFIER_PLACEHOLDER),
                    identifierHint: (() => getIdentifierHint('FS provider'))
                },
                {
                    name: "Preparation processor",
                    type: "customJythonProcessors",
                    icon: 'icon-visual_prep_cleanse_recipe',
                    iconColor: 'universe-color recipe-visual',
                    description: "Create a new kind of step for preparation scripts",
                    addDescriptors: regularJythonOnlyDescriptor,
                    addFuncMap: {
                        jython: DataikuAPI.plugindev.addJythonProcessor
                    },
                    identifierPlaceholder: (() => COMPONENT_IDENTIFIER_PLACEHOLDER),
                    identifierHint: (() => getIdentifierHint('processor'))
                },
                {
                    name: "Prediction Algorithm",
                    type: "customPythonPredictionAlgos",
                    icon: 'icon-machine_learning_regression',
                    iconColor: 'universe-color recipe-train',
                    description: "Create a new prediction algorithm",
                    addDescriptors: regularPyOnlyDescriptor,
                    addFuncMap: {
                        python: DataikuAPI.plugindev.addPredictionPythonAlgorithm
                    },
                    identifierPlaceholder: (() => COMPONENT_IDENTIFIER_PLACEHOLDER),
                    identifierHint: (() => getIdentifierHint('prediction algorithm'))
                },
                {
                    name: "Cluster",
                    type: "customPythonClusters",
                    icon: 'icon-sitemap',
                    iconColor: 'universe-color more',
                    description: "(Expert usage) Create a new kind of cluster",
                    addDescriptors: regularPyOnlyDescriptor,
                    addFuncMap: {
                        python: DataikuAPI.plugindev.addPythonCluster
                    },
                    identifierPlaceholder: (() => COMPONENT_IDENTIFIER_PLACEHOLDER),
                    identifierHint: (() => getIdentifierHint('cluster'))
                },
                {
                    name: "Custom Fields",
                    type: "customFields",
                    icon: 'icon-list-ol',
                    iconColor: 'universe-color more',
                    description: "Create new custom fields",
                    addDescriptors : [{key: "json", label: "json"}],
                    addFuncMap: {
                        json: DataikuAPI.plugindev.addCustomFields
                    },
                    identifierPlaceholder : (() => COMPONENT_IDENTIFIER_PLACEHOLDER),
                    identifierHint : (() => getIdentifierHint('custom fields'))
                },
                {
                    name: "Custom Policy Hooks",
                    type: "customPolicyHooks",
                    icon: 'icon-legal',
                    iconColor: 'universe-color more',
                    description: "Create new custom policy hooks",
                    addDescriptors : [{key: "java", label: "Java"}],
                    addFuncMap: {
                        java: DataikuAPI.plugindev.addJavaPolicyHooks
                    },
                    identifierPlaceholder : (() => COMPONENT_IDENTIFIER_PLACEHOLDER),
                    identifierHint : (() => getIdentifierHint('custom policy hooks'))
                },
                {
                    name: "Dataiku Application Template",
                    type: "customAppTemplates",
                    icon: 'icon-tasks',
                    iconColor: 'universe-color more',
                    disabled: true,
                    disabledReason: "To create a new Dataiku application template, you need to create it from an existing application template project.",
                    description: "Create a new Dataiku application template"
                },
                {
                    name: "Exposition",
                    type: "customExpositions",
                    icon: 'icon-external-link',
                    iconColor: 'universe-color more',
                    description: "(Expert usage) Create a new exposition to expose webapps or API services running in containers.",
                    addDescriptors: regularJavaOnlyDescriptor,
                    addFuncMap: {
                        java: DataikuAPI.plugindev.addJavaExposition
                    },
                    identifierPlaceholder: (() => COMPONENT_IDENTIFIER_PLACEHOLDER),
                    identifierHint: (() => getIdentifierHint('exposition'))
                }
            ];
        };

        $scope.getComponentsTypeList = function(pluginInstallDesc) {
            if (!pluginInstallDesc || !pluginInstallDesc.content) {
                return [];
            }
            var componentsTypeList = [];
            Object.keys(pluginInstallDesc.content).forEach(function(contentType) {
                var contentList = pluginInstallDesc.content[contentType];
                if (contentList instanceof Array && contentList.length > 0) {
                    componentsTypeList.push(contentType);
                }
            });
            return componentsTypeList;
        };

        $scope.getComponentIcon = function(componentType, component = {}) {
            if (typeof componentType === 'function') {
                componentType = componentType();
            }

            let componentIcon = component.meta && component.meta.icon;
            let componentIconColor;

            if (componentType === 'customJavaPolicyHooks') {
                componentType = 'customPolicyHooks';
            }

            if (componentType === 'javaPreparationProcessors') {
                componentType = 'customJythonProcessors';
            }

            if (componentType === 'javaFormulaFunctions') {
                return 'universe-color analysis icon-beaker';
            }

            if (componentType === 'tutorials') {
                return 'universe-color more icon-dku-tutorial';
            }

            if (componentType === 'customParameterSets') {
                return 'universe-color more icon-indent-right';
            }

            if (componentType === 'featureFlags') {
                return 'universe-color more icon-dkubird';
            }

            for (let index = 0; index < $scope.contentTypeList.length; index++) {
                let currentType = $scope.contentTypeList[index].type;
                if (typeof currentType === 'function') {
                    let currentTypes = $scope.contentTypeList[index].icons;
                    if (!currentTypes) { continue; }
                    if (currentTypes[componentType]) {
                        componentIcon = componentIcon || currentTypes[componentType].icon;
                        componentIconColor = currentTypes[componentType].iconColor;
                        break;
                    }
                } else {
                    let currentType = $scope.contentTypeList[index].type;
                    if (currentType === componentType) {
                        componentIcon = componentIcon || $scope.contentTypeList[index].icon;
                        componentIconColor = $scope.contentTypeList[index].iconColor;
                        break;
                    }
                }
            }

            return componentIconColor + ' ' + componentIcon;
        };

        $scope.computeNbComponents = function(pluginInstallDesc) {
            if (!pluginInstallDesc || !pluginInstallDesc.content) {
                return 0;
            }
            var nbComponents = 0;
            Object.keys(pluginInstallDesc.content).forEach(function(contentType) {
                var contentList = pluginInstallDesc.content[contentType];
                if (contentList instanceof Array) {
                    nbComponents += contentList.length;
                }
            });
            if (pluginInstallDesc.desc && pluginInstallDesc.desc.featureFlags) {
                nbComponents += pluginInstallDesc.desc.featureFlags.length;
            }
            return nbComponents;
        };

        $scope.getPlugin = function() {
            if ($scope.appConfig.pluginDevGitMode === 'PLUGIN') {
                $scope.getGitFullStatus();
            }

            return DataikuAPI.plugindev.get($stateParams.pluginId).then(
                function (data) {
                    $scope.pluginData = data.data;
                    $scope.initContentTypeList();
                    //updateCodeEnvs();
                },
                setErrorInScope.bind($scope)
            );
        };

        $scope.downloadPlugin = function(pluginId = $stateParams.pluginId) {
            let url = '/dip/api/plugins/dev/download?pluginId=' + pluginId;
            downloadIframe.attr('src', url);
            $('body').append(downloadIframe);
        };

        $scope.deletePlugin = function(pluginId, callback) {
            CreateModalFromTemplate("/templates/plugins/development/delete-plugin-confirm-dialog.html", $scope, null, function(newScope) {

                var handlePluginDeleted = function() {
                    WT1.event("plugin-delete", { pluginId : newScope.pluginName });
                    if (callback === undefined) {
                        $state.transitionTo('plugins.installed');
                    } else {
                        callback();
                    }
                }

                newScope.pluginName = pluginId || $scope.pluginData.installedDesc.desc.id;
                DataikuAPI.plugins.prepareDelete(newScope.pluginName)
                .success(function(usageStatistics) {
                    newScope.usageStatistics = usageStatistics;
                }).error(setErrorInScope.bind($scope));
                newScope.confirmPluginDeletion = function() {
                    DataikuAPI.plugins.delete(newScope.pluginName, true).success(function(initialResponse) {
                        if (initialResponse && initialResponse.jobId && !initialResponse.hasResult) {                        
                            FutureWatcher.watchJobId(initialResponse.jobId)
                            .success(handlePluginDeleted)
                            .error(function(data, status, headers) {
                                setErrorInScope.bind($scope)(data, status, headers);
                            });
                        } else {
                            handlePluginDeleted();
                        }
                    }).error(setErrorInScope.bind($scope));
                }
            });
        };

        $scope.newComponentPopin = function() {
            CreateModalFromTemplate("/templates/plugins/development/new-component-modal.html", $scope, "NewComponentModalController");
        };
    });


    /**
     * @ngdoc directive
     * @name pluginEditCallbacks
     * @description
     *   This directive is composed on the scope above FolderEditController.
     *   It is responsible for setting up the callbacks needed to get/set/list
     *   files in the plugin folder
     */
    app.directive('pluginEditCallbacks', function(DataikuAPI, $stateParams, Dialogs, $state) {
        return {
            scope: false,
            restrict: 'A',
            link: {
                pre : function($scope, $element, attrs) {
                    $scope.folderEditCallbacks = {
                        list: function() {
                            return DataikuAPI.plugindev.listContents($stateParams.pluginId);
                        },
                        get: function(content, sendAnyway) {
                            return DataikuAPI.plugindev.getContent($stateParams.pluginId, content.path, sendAnyway);
                        },
                        previewImageURL: function(content) {
                            return '/dip/api/plugins/dev/preview-image?pluginId=' + $stateParams.pluginId + '&path=' + encodeURIComponent(content.path) + '&contentType=' + encodeURIComponent(content.mimeType);
                        },
                        set: function(content) {
                            return DataikuAPI.plugindev.setContent($stateParams.pluginId, content.path, content.data);
                        },
                        validate: function(contentMap) {
                            return DataikuAPI.plugindev.validate($stateParams.pluginId, contentMap);
                        },
                        setAll: function(contentMap) {
                            return DataikuAPI.plugindev.setContentMultiple($stateParams.pluginId, contentMap);
                        },
                        create: function(path, isFolder) {
                            return DataikuAPI.plugindev.createContent($stateParams.pluginId, path, isFolder);
                        },
                        delete: function(content) {
                            return DataikuAPI.plugindev.deleteContent($stateParams.pluginId, content.path);
                        },
                        decompress: function(content) {
                            return DataikuAPI.plugindev.decompressContent($stateParams.pluginId, content.path);
                        },
                        rename: function(content, newName) {
                            return DataikuAPI.plugindev.renameContent($stateParams.pluginId, content.path, newName);
                        },
                        checkUpload: function(contentPath, paths) {
                            return DataikuAPI.plugindev.checkUploadContent($stateParams.pluginId, contentPath, paths);
                        },
                        upload: function(contentPath, file, callback) {
                            return DataikuAPI.plugindev.uploadContent($stateParams.pluginId, contentPath, file, callback);
                        },
                        move: function(content, to) {
                            return DataikuAPI.plugindev.moveContent($stateParams.pluginId, content.path, (to ? to.path : ''));
                        },
                        copy: function(content) {
                            return DataikuAPI.plugindev.copyContent($stateParams.pluginId, content.path);
                        }
                    };
                    $scope.folderEditSaveWarning = 'You have unsaved changes to a plugin file, are you sure you want to leave?';
                    $scope.description = $stateParams.pluginId;
                    $scope.headerDescription = "Plugin Content"
                    $scope.rootDescription = '[plugin root]';
                    $scope.localStorageId = $stateParams.pluginId;
                }
            }
        };
    });

    app.filter("humanContentType", function() {
        var fromCamelCaseToHuman = function(str) {
            if (str == 'featureFlags') {
                return 'feature';
            }
            var humanStr = "";
            var upperCase = str.match(/[A-Z]/);
            while (upperCase) {
                humanStr += str.substring(0, upperCase.index) + " ";
                str = upperCase[0].toLowerCase() + str.substring(upperCase.index + 1);
                upperCase = str.match(/[A-Z]/);
            }
            humanStr += str;
            return humanStr;
        }

        return function(contentType) {

            let humanContentType;

            humanContentType = fromCamelCaseToHuman(contentType);

            if (contentType == "customRunnables") {
                humanContentType = "Macros";
            }

            humanContentType = humanContentType.replace("custom ", "");
            if (humanContentType === "code recipes") {
                humanContentType = "Recipes";
            }
            if (humanContentType[humanContentType.length - 1] == 's') {
                humanContentType = humanContentType.substring(0, humanContentType.length - 1);
            }
            return humanContentType;
        }
    });

    app.controller("PlugindevCreateController", function($scope, $element, DataikuAPI, _SummaryHelper, Dialogs, $state,
        WT1, TopNav, SpinnerService, FutureProgressModal, StateUtils, PluginsService) {

    	_SummaryHelper.addEditBehaviour($scope, $element);

        $scope.desc = {
            id: '',
            bootstrapMode: 'EMPTY',
            gitRepository: '',
            gitCheckout: '',
            gitPath: ''
        };

        $scope.pattern = PluginsService.namingConvention;

        $scope.bootstrap = function() {
            DataikuAPI.plugindev.create($scope.desc.id, $scope.desc.bootstrapMode,
                $scope.desc.gitRepository, $scope.desc.gitCheckout, $scope.desc.gitPath
            ).success(function(data) {
                FutureProgressModal.show($scope, data, "Creating plugin").then(function(result){
                    if (result) {
                        WT1.event("plugin-dev-create");
                        $scope.dismiss();
                        StateUtils.go.pluginDefinition(result.details);
                    }
                });
            }).error(setErrorInScope.bind($scope));
        };
    });

    app.controller("PlugindevEditionController", function($scope, DataikuAPI, $state, $stateParams, CreateModalFromTemplate, Dialogs, FutureProgressModal, TopNav, $controller, $filter, WT1, $timeout) {
        $controller('PlugindevCommonController', {$scope: $scope});
        $controller('PlugindevDefinitionController', {$scope});

        $scope.uiState = {
            envName : null,
            newEnvDeploymentMode : 'PLUGIN_MANAGED',
            state: $state
        };

        $scope.reloadPlugin = function() {
            return DataikuAPI.plugindev.reload($stateParams.pluginId).then(
                function(data) {
                    $scope.$broadcast("pluginReload");
                    return $scope.getPlugin();
                },
                setErrorInScope.bind($scope)
            );
        };

        $scope.modalCreateBranch = function(wantedBranch) {
            CreateModalFromTemplate("/templates/plugins/development/git/create-branch-modal.html", $scope, "PlugindevCreateBranchController", function(newScope){
                newScope.targetBranchName = wantedBranch || "";
            });
        };

        $scope.createBranchFromCommit = function(commitId) {
            CreateModalFromTemplate("/templates/plugins/development/git/create-branch-modal.html", $scope, "PlugindevCreateBranchController", function (newScope) {
                newScope.targetBranchName = "";
                newScope.commitId = commitId;
            });
        };

        $scope.focusBranchSearchInput = function() {
            $timeout(function() {
                angular.element('#branch-search-input').focus();
            }, 100);
        };

        $scope.reloadPlugin().then(function() {
            if ($scope.customCodeRecipeIdToOpen && $scope.pluginData && $scope.pluginData.installedDesc && $scope.pluginData.installedDesc.customCodeRecipes) {
                $scope.pluginData.installedDesc.customCodeRecipes.forEach(function(customCodeRecipe) {
                    if (customCodeRecipe.id == $scope.customCodeRecipeIdToOpen) {
                        $scope.openPluginContentInEditor(customCodeRecipe, 'customCodeRecipes');
                    }
                });
                $scope.customCodeRecipeIdToOpen = null;
            }
        });
    });

    app.controller("PlugindevDefinitionController", function($scope, DataikuAPI, StateUtils, CreateModalFromTemplate, TopNav, Dialogs, $filter, $stateParams) {
        /* Components */
        $scope.deleteComponent = function(event, content, contentType) {
            let contentName = content.id;
            event.stopPropagation();
            if (contentType) {
                contentType = $filter('humanContentType')(contentType).toLowerCase();
                if (contentType[contentType.length - 1] == 's') {
                    contentType = contentType.substring(0, contentType.length - 1);
                }
                contentName = contentType + " " + contentName;
            }

            var message = 'Are you sure you want to delete ' + contentName + ' ?';
            Dialogs.confirm($scope,'Delete ' + content.id, message).then(function() {
                DataikuAPI.plugindev.deleteContent($scope.pluginData.installedDesc.desc.id, content.folderName).success(function(data) {
                    $scope.reloadPlugin();
                }).error(setErrorInScope.bind($scope));
            });
        };

        $scope.createCodeEnvPopin = function() {
            CreateModalFromTemplate("/templates/plugins/development/code-env-creation-modal.html", $scope, "NewCodeEnvController");
        };

        $scope.removeCodeEnv = function() {
            DataikuAPI.plugindev.removeCodeEnv($scope.pluginData.installedDesc.desc.id).success(function() {
                $scope.reloadPlugin();
            }).error(setErrorInScope.bind($scope));
        }

        const FILE_TO_OPEN_MAP = {
            "customDatasets": "connector.json",
            "customCodeRecipes": "recipe.json",
            "customExporters": function(folderName) {
                if (folderName.startsWith('java')) {
                    return "jexporter.json";
                }
                return "exporter.py";
            },
            "customFormats": function(folderName) {
                if (folderName.startsWith('java')) {
                    return "jformat.json";
                }
                return "format.py";
            },
            "customPythonChecks": "check.py",
            "customPythonProbes": "probe.py",
            "customSQLProbes": "probe.sql",
            "customPythonSteps": "step.py",
            "customPythonClusters": "cluster.py",
            "customPythonTriggers": "trigger.py",
            "customRunnables": function(folderName) {
                if (folderName.startsWith('java')) {
                    return "runnable.json";
                }
                return "runnable.py";
            },
            "customWebApps": "webapp.json",
            "customStandardWebAppTemplates": "app.js",
            "customBokehWebAppTemplates": "backend.py",
            "customDashWebAppTemplates": "backend.py",
            "customShinyWebAppTemplates": "ui.R",
            "customRMarkdownReportTemplates": "script.Rmd",
            "customPythonNotebookTemplates": "notebook.ipynb",
            "customPythonDatasetNotebookTemplates": "notebook.ipynb",
            "customRNotebookTemplates": "notebook.ipynb",
            "customRDatasetNotebookTemplates": "notebook.ipynb",
            "customScalaNotebookTemplates": "notebook.ipynb",
            "customScalaDatasetNotebookTemplates": "notebook.ipynb",
            "customPreBuiltDatasetNotebookTemplates": "notebook.ipynb",
            "customJythonProcessors": "processor.py",
            "customFileSystemProviders": function(folderName) {
                if (folderName.startsWith('java')) {
                    return "fs-provider.json";
                }
                return "fs-provider.py";
            },
            "codeEnv": "desc.json",
            "customPythonPredictionAlgos": "algo.json",
            "customParameterSets": "preset.json",
            "customFields": "custom-fields.json",
            "customJavaPolicyHooks": function(folderName) {
                if (folderName.startsWith('java')) {
                    return "policy-hook.json";
                }
            },
            "customAppTemplates": "app.json",
            "customExpositions": "exposition.json"
        };

        $scope.hasFileToOpen = function(contentType) {
            return !!FILE_TO_OPEN_MAP[contentType];
        };

        $scope.openPluginContentInEditor = function(content, contentType) {
            var fileToOpen = FILE_TO_OPEN_MAP[contentType]
            if (fileToOpen) {
                if (typeof(fileToOpen) === "function") {
                    fileToOpen = fileToOpen(content.folderName);
                }
                fileToOpen = content.folderName + "/" + fileToOpen;
                openContentInEditor(fileToOpen);
            }
        };

        $scope.$on('PLUGIN_DEV_LIST:openCustomRecipeInEditor', function(event, id) {
            $scope.customCodeRecipeIdToOpen = id;
        });

        var openContentInEditor = function(path) {
            StateUtils.go.pluginEditor($stateParams.pluginId, path);
        };

        $scope.openPluginDescInEditor = function() {
            openContentInEditor("plugin.json");
        };

        /*
         * Filtering
         */

        $scope.filterQuery = {userQuery: ''};
        $scope.filteredContent = {};

        function filterContent(pluginInstallDesc) {
            let filteredContent = {};
            let types = $scope.getComponentsTypeList(pluginInstallDesc);
            types.forEach(function(type) {
                let filteredComponents = $filter('filter')(pluginInstallDesc.content[type], $scope.filterQuery.userQuery);
                if (filteredComponents.length) {
                    filteredContent[type] = filteredComponents;
                }
            });
            // Add feature flags as "fake components"
            if (pluginInstallDesc.desc.featureFlags) {
                const matchingFeatureFlag = $filter('filter')(pluginInstallDesc.desc.featureFlags, $scope.filterQuery.userQuery);
                if (matchingFeatureFlag.length > 0) {
                    filteredContent['featureFlags'] = $filter('filter')(pluginInstallDesc.desc.featureFlags, $scope.filterQuery.userQuery);
                    // Put in the same format as other components for simpler templates
                    filteredContent['featureFlags'] = filteredContent['featureFlags'].map(featureFlag => ({ id: featureFlag }));
                }
            }
            return filteredContent;
        }

        function filterContentOnChange() {
            if ($scope.pluginData && $scope.pluginData.installedDesc && $scope.pluginData.installedDesc.content) {
                $scope.filteredContent = filterContent($scope.pluginData.installedDesc);
            } else {
                $scope.filteredContent = {};
            }
        }

        $scope.$watch('pluginData', filterContentOnChange, true);
        $scope.$watch('filterQuery.userQuery', filterContentOnChange, true);

        $scope.getComponentsTypeListFiltered = function() {
            return Object.keys($scope.filteredContent);
        };

        $scope.validatePluginEnv = function() {
            $scope.pluginEnvUpToDate = true;
        }

        $scope.invalidatePluginEnv = function() {
            $scope.pluginEnvUpToDate = false;
        }
    });

    app.controller("PlugindevEditorController", function($scope, $stateParams) {
        $scope.filePath = $stateParams.filePath || '';
    });


    app.controller("PlugindevHistoryController", function($scope, $stateParams, DataikuAPI, $timeout, TopNav) {
        // $timeout here allows us to trigger this API call only once the plugin has been properly reloaded
        $timeout(() => {
            DataikuAPI.plugindev.git.getLog($stateParams.pluginId, null, 33).then(function(resp) {
                $scope.logEntries = resp.data.logEntries;
            }, setErrorInScope.bind($scope));
        });
    });

    function computeDefaultLanguage(contentType, previousLanguage) {
        const noPreviousLanguageDefined = previousLanguage === null;
        const previousLanguageInvalidForNewComponentType = !(previousLanguage in contentType.addFuncMap);
        const useDefaultLanguage = noPreviousLanguageDefined || previousLanguageInvalidForNewComponentType;
        if (useDefaultLanguage) {
            return contentType.addDescriptors[0].key;
        }
        return previousLanguage;
    }

    app.controller("NewComponentModalController", function($scope, $controller, $element, $timeout, $state, WT1, DKUtils,
        PluginsService) {
        $controller('PlugindevCommonController', {$scope});
        $controller('PlugindevDefinitionController', {$scope});

        $scope.pattern = PluginsService.namingConvention;

        $scope.newComponent = {
            contentType: null,
            contentLanguage: null,
            id: '',
            javaClassNameForPlugin: ''
        };

        function resetNewComponentSettings(contentType) {
            $scope.newComponent.contentType = contentType;
            $scope.newComponent.contentLanguage =
                computeDefaultLanguage(contentType, $scope.newComponent.contentLanguage);
            // Keep current id and class name if already chosen
        }

        $scope.selectContentType = function(contentType) {
            if (contentType && contentType.disabled) return; // nice try :)
            resetNewComponentSettings(contentType);
            $timeout(function() {
                $element.find('.language-select').selectpicker('refresh');
            });
        };

        $scope.isJava = function() {
            return $scope.newComponent.contentLanguage === 'java';
        };

        $scope.requiresLanguage = function (contentType) {
            return contentType && !(contentType.addDescriptors.length === 1 && contentType.addDescriptors[0].key === 'generic');
        };

        $scope.create = function() {
            if ($scope.isFormValid()) {
                const addThingFunc = $scope.newComponent.contentType.addFuncMap[$scope.newComponent.contentLanguage];
                addThingFunc($scope.pluginData.installedDesc.desc.id,
                    $scope.newComponent.id,
                    $scope.newComponent.javaClassNameForPlugin
                ).success(function(data) {
                    WT1.event("plugin-dev-add-" + $scope.newComponent.contentType.name + "-" + $scope.newComponent.contentLanguage);
                    $scope.dismiss();
                    $scope.getPlugin().then(function() {
                        let folderName = data.pathToFiles.substring($scope.pluginData.baseFolderPath.length);
                        if (folderName.startsWith("/")) {
                            folderName = folderName.substring(1);
                        }
                        let componentType = $scope.newComponent.contentType.type;
                        if (typeof($scope.newComponent.contentType.type) === "function") {
                            componentType = $scope.newComponent.contentType.type($scope.newComponent.contentLanguage);
                        }
                        if ($state.$current.name == "plugindev.editor") {
                            DKUtils.reloadState();
                        } else {
                            $scope.openPluginContentInEditor({folderName:folderName}, componentType);
                        }
                        $scope.reloadPlugin();
                    });
                }).error(setErrorInScope.bind($scope));
            }
        };

        $scope.isFormValid = function() {
            if (!$scope.newComponent.contentType) return false;
            const hasAddFunc = $scope.newComponent.contentLanguage && $scope.newComponent.contentType.addFuncMap[$scope.newComponent.contentLanguage];
            const hasClassName = !$scope.isJava() || ($scope.newComponent.javaClassNameForPlugin && $scope.newComponent.javaClassNameForPlugin.length > 0);
            return PluginsService.isValidComponentId($scope.newComponent.id, $scope.pluginData.installedDesc.desc.id, $scope.filteredContent[$scope.newComponent.contentType.type] || [])
                && hasAddFunc && hasClassName;
        };
    });

    app.controller("NewCodeEnvController", function($scope, $controller, WT1) {
        $controller('PlugindevCommonController', { $scope: $scope });
        $controller('PlugindevDefinitionController', {$scope});
        $scope.codeEnvData = $scope.contentTypeList.find(contentType => { return contentType.type === 'codeEnv'});
        $scope.uiState = {contentLanguage: computeDefaultLanguage($scope.codeEnvData, null)};

        $scope.create = function() {
            if ($scope.isFormValid()) {
                const addThingFunc = $scope.codeEnvData.addFuncMap[$scope.uiState.contentLanguage];
                addThingFunc($scope.pluginData.installedDesc.desc.id, undefined, undefined, $scope.forceConda).success(function(data) {
                    WT1.event("plugin-dev-create-code-env-" + $scope.uiState.contentLanguage);
                    $scope.dismiss();
                    $scope.getPlugin().then(function() {
                        let folderName = data.pathToFiles.substring($scope.pluginData.baseFolderPath.length);
                        if (folderName.startsWith("/")) {
                            folderName = folderName.substring(1);
                        }
                        $scope.openPluginContentInEditor({folderName:folderName}, 'codeEnv');
                        $scope.reloadPlugin();
                    });
                }).error(setErrorInScope.bind($scope));
            }
        };

        $scope.isFormValid = function() {
            return $scope.uiState.contentLanguage && $scope.codeEnvData && $scope.codeEnvData.addFuncMap[$scope.uiState.contentLanguage];
        };
    });

    /*
     * to add new modules to the existing app, some hacking around angular is needed. And
     * this hacking needs to happen in a config block, so that we have access to the
     * providers.
     * see http://benohead.com/angularjs-requirejs-dynamic-loading-and-pluggable-views/ for
     * explanations.
     */
    app.config(['$controllerProvider', '$compileProvider', '$filterProvider', '$provide', '$injector',
        function ($controllerProvider, $compileProvider, $filterProvider, $provide, $injector) {
            // only offer one granularity: module (no injecting just a controller, for ex)
            app.registerModule = function (moduleName) {
                var module = angular.module(moduleName);

                if (module.requires) {
                    // recurse if needed
                    for (var i = 0; i < module.requires.length; i++) {
                        app.registerModule(module.requires[i]);
                    }
                }

                var providers = {
                        $controllerProvider: $controllerProvider,
                        $compileProvider: $compileProvider,
                        $filterProvider: $filterProvider,
                        $provide: $provide
                    };

                angular.forEach(module._invokeQueue, function(invokeArgs) {
                    var provider = providers[invokeArgs[0]];
                    provider[invokeArgs[1]].apply(provider, invokeArgs[2]);
                });
                angular.forEach(module._configBlocks, function (fn) {
                    $injector.invoke(fn);
                });
                angular.forEach(module._runBlocks, function (fn) {
                    $injector.invoke(fn);
                });
            };
        }
    ]);

    app.service('CustomUISetup', function(PluginConfigUtils, DataikuAPI, $q, $stateParams) {
        return {
            setupCallPythonDo : function($scope, errorScope, pluginId, componentId, config, side) {
                // for custom ui: communication with the backend and holding session id
                $scope.uiInteraction = {pluginId:pluginId, componentId:componentId, sessionId:null}
                // This function is called when fetching data for custom forms.
                // See in the documentation: Fetching data for custom forms.
                $scope.callPythonDo = function(payload) {
                    var deferred = $q.defer();
                    DataikuAPI.plugins.callPythonDo($scope.uiInteraction.sessionId, $scope.uiInteraction.pluginId, $scope.uiInteraction.componentId, config, payload, $scope.recipeConfig, $stateParams.projectKey, $stateParams.clusterId, side).success(function(data) {
                        $scope.uiInteraction.sessionId = data.sessionId;
                        deferred.resolve(data.data);
                    }).error(function(data, status, headers, config, statusText, xhrStatus) {
                        setErrorInScope.bind(errorScope)(data, status, headers, config, statusText, xhrStatus);
                        deferred.reject("Failed to get test result for ui");
                    });
                    return deferred.promise;
                };
            }
        };
    });

    app.directive('customTemplateWithCallPythonDo', function(CustomUISetup) {
        return {
            restrict: 'E',
            templateUrl: 'templates/plugins/development/custom-template.html',
            link: function($scope, element, attrs) {
                CustomUISetup.setupCallPythonDo(
                    $scope,
                    $scope.$eval(attrs.errorScope),
                    $scope.$eval(attrs.pluginId),
                    $scope.$eval(attrs.componentId),
                    $scope.$eval(attrs.config),
                    attrs.side
                );
            }
        };
    });

    app.directive('customParamsForm', function(PluginConfigUtils, DataikuAPI, $q, $stateParams, CustomUISetup) {
        return {
            restrict: 'EA',
            scope: {
                pluginDesc: '=',
                componentId: '=',
                desc: '=',
                config: '=',
                columnsPerInputRole: '=', // propagate for form elements (for plugin recipes)
                recipeConfig: '='
            },
            templateUrl: '/templates/plugins/development/custom-form.html',
            link: function($scope, element, attrs) {
                var setupDone = false;
                var updateSetup = function() {
                    if ($scope.desc == null || setupDone) {
                        // nothing to setup, just skip
                    } else {
                        if ($scope.desc.paramsModule) {
                            app.registerModule($scope.desc.paramsModule);
                        }
                        if ($scope.desc.paramsTemplate) {
                            $scope.baseTemplateUrl = "/plugins/" + $scope.pluginDesc.id + "/resource/";
                            $scope.templateUrl = $scope.baseTemplateUrl + $scope.desc.paramsTemplate;
                        }
                        setupDone = true;
                    }
                }
                updateSetup();
                $scope.$watch('desc', updateSetup);
            }
        };
    });

    app.directive('autoconfigForm', function(Debounce) {
        return {
            restrict: 'EA',
            replace: false,
            scope: {
                params: '=',
                pluginId: '=',
                componentId: '=',
                model: '=',
                columnsPerInputRole: '=', // propagate for form elements (for plugin recipes)
                recipeConfig: '=',
                chart: '=',
                side: '@',
                activeDragDrop: '=',
                validity: '=',
                errorScope: '=',
                qaSelectorPrefix: '@?',
                viewMode: '=',
                isList: '='
            },
            templateUrl: '/templates/plugins/development/autoconfig-form.html',
            link: function ($scope) {
                $scope.qaSelectorPrefix = $scope.qaSelectorPrefix || 'data-qa-autoconfig-form-element';
                $scope.getQaSelector = function (paramId) {
                    return `${$scope.qaSelectorPrefix}-${paramId}`;
                };
                $scope.addReloadCustomChoicesCallback = function (reloadCustomChoicesCallback) {
                    if ($scope.reloadFunctions === undefined) {
                        $scope.reloadFunctions = [];
                    }
                    $scope.reloadFunctions.push(reloadCustomChoicesCallback);
                };

                function onModelUpdates() {
                    const isNotInitialization = $scope.hasOwnProperty('reloadFunctions');
                    if (isNotInitialization) {
                        for (const reloadFunction of $scope.reloadFunctions) {
                            reloadFunction();
                        }
                    }
                }
                $scope.$watch('model', Debounce().withDelay(1000, 1000).wrap(onModelUpdates), true)
            }
        };
    });

    function initChartWebAppBar(isLeftBar) {
        return function (scope) {
            var loadedType = null;
            scope.$watch('chart.def.$loadedDesc', function () { // all the other values are set at the same time
                if (!scope.chart || !scope.chart.def) return;
                if (scope.chart.def.$loadedDesc != null && scope.chart.def.$loadedDesc.webappType !== loadedType) {
                    scope.config = scope.chart.def.webAppConfig;
                    if (isLeftBar) {
                        scope.optionsFolds.webapp = true;
                    }

                    loadedType = scope.chart.def.$loadedDesc.webappType;

                    scope.loadedDesc = scope.chart.def.$loadedDesc;
                    scope.pluginChartDesc = scope.chart.def.$pluginChartDesc;
                    scope.pluginDesc = scope.chart.def.$pluginDesc;
                    scope.componentId = scope.chart.def.$loadedDesc.id;

                    const module = isLeftBar ? scope.pluginChartDesc.leftBarModule : scope.pluginChartDesc.topBarModule;
                    if (module) {
                        app.registerModule(module);
                    }
                    const template = isLeftBar ? scope.pluginChartDesc.leftBarTemplate : scope.pluginChartDesc.topBarTemplate;
                    if (template) {
                        scope.baseTemplateUrl = '/plugins/' + scope.pluginDesc.id + '/resource/';
                        scope.templateUrl = scope.baseTemplateUrl + template;
                    } else {
                        scope.baseTemplateUrl = null;
                        scope.templateUrl = null;
                    }
                }
            });
        };
    }

    const initChartLeftBarWebApp = initChartWebAppBar(true);
    const initChartRightBarWebApp = initChartWebAppBar(false);

    app.controller("WebAppChartLeftBarController", function($scope) {
        initChartLeftBarWebApp($scope);
    });

    app.controller("WebAppChartTopBarController", function($scope) {
        initChartRightBarWebApp($scope);
    });

    app.directive('customAdminParamsForm', function(PluginConfigUtils, DataikuAPI, $q, $stateParams) {
        return {
            restrict: 'EA',
            scope: {
                pluginDesc: '=',
                componentId: '=',
                desc: '=',
                config: '=',
                columnsPerInputRole: '=', // propagate for form elements (for plugin recipes)
                recipeConfig: '='
            },
            templateUrl: '/templates/plugins/development/custom-admin-form.html',
            link: function($scope, element, attrs) {
            }
        };
    });

    app.directive('pluginSettingsAlert', function($state) {
        return {
            restrict: 'EA',
            scope: {
                componentType :'@',
                appConfig: '=',
                hasSettings: '=',
                pluginDesc: '='
            },
            templateUrl: '/templates/plugins/development/plugin-settings-alert.html',
            link : function($scope, element, attrs) {
                if ($scope.pluginDesc) {
                    $scope.pluginLink = $scope.pluginDesc.isDev ? "plugindev.settings({pluginId: '" + $scope.pluginDesc.id + "'})" : "plugin.settings({pluginId: '" + $scope.pluginDesc.id + "'})";
                } else {
                    $scope.pluginLink = "plugins.installed";
                }
            }
        };
    });

})();

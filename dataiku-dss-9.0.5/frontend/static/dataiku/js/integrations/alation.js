(function(){
'use strict';

var app = angular.module('dataiku.integrations.alation', []);

app.factory("AlationCatalogChooserService", function($rootScope, $state, $stateParams){
    var data = {
        chooser: null
    }

    var svc = {
        install: function(){

            var alationURL = $rootScope.appConfig.alationSettings.alationURL;

            var script = document.createElement('script');
            script.src = alationURL + "/integration/catalog_chooser/v1/sdk.js";
            script.type = 'text/javascript';
            script.async = "true";
            var script0 = document.getElementsByTagName("script")[0];
            script0.parentNode.insertBefore(script, script0);
        },

        openChooser: function(){
            if (data.chooser == null) {
                data.chooser = Alation.Catalog.createChooser({
                    embedMethod: Alation.Catalog.ChooserEmbedMethod.MODAL,
                    onSelect: svc.onSelect,
                    onCancel: function(){
                        data.chooser = null;
                    },
                    acceptObjectTypes: [
                        "table"
                    ],
                    acceptDataSourceTypes: [
                        "bigquery",
                        "greenplum",
                        "hive2",
                        "mysql",
                        "netezza",
                        "oracle",
                        "postgresql",
                        "redshift",
                        "sap",
                        "snowflake",
                        "sqlserver",
                        "synapse",
                        "teradata",
                        "vertica"
                    ]
                })
            }

            data.chooser.open();
        },

        onSelect: function(selectedObject) {
            data.chooser.destroy();
            data.chooser = null;
            // $rootScope.alationCatalogSelection = selectedObject;
            $state.go("projects.project.tablesimport", {
                importData : JSON.stringify({
                    workflowType: "ALATION_MCC",
                    alationSelection: selectedObject
                })
            });
        }
    }

    return svc;
});

}());

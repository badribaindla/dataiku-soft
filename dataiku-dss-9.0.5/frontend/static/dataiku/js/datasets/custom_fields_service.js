(function() {
'use strict';

var app = angular.module('dataiku.datasets', []);

app.factory("DatasetCustomFieldsService", function($rootScope, TopNav, DataikuAPI, ActivityIndicator, CreateModalFromTemplate, WT1, SmartId){
    let svc = {};

    svc.customFieldsMap = function() {
        return $rootScope.appConfig.customFieldsMap['DATASET'];
    };

    svc.saveCustomFields = function(dataset, newCustomFields) {
        WT1.event('custom-fields-save', {objectType: 'DATASET'});
        let oldCustomFields = angular.copy(dataset.customFields);
        dataset.customFields = newCustomFields;
        return DataikuAPI.datasets.save(dataset.projectKey, dataset, {summaryOnly:true}).success(function(data) {
                ActivityIndicator.success("Saved");
                $rootScope.$broadcast('customFieldsSaved', TopNav.getItem(), dataset.customFields);
                $rootScope.$broadcast('reloadGraph');
            }).error(function(a, b, c) {
                dataset.customFields = oldCustomFields;
                setErrorInScope.bind($rootScope)(a, b, c);
            });
    };

    svc.canEditCustomFields = function() {
        let item = TopNav.getItem();
        let fullId = SmartId.resolve(item.id);
        return fullId && fullId.projectKey && fullId.id;
    };

    svc.editCustomFields = function() {
        if (!svc.canEditCustomFields()) {
            return;
        }
        let item = TopNav.getItem();
        let fullId = SmartId.resolve(item.id);
        DataikuAPI.datasets.getSummary(fullId.projectKey, fullId.id).success(function(data) {
            let dataset = data.object;
            let modalScope = angular.extend($rootScope, {objectType: 'DATASET', objectName: dataset.name, objectCustomFields: dataset.customFields});
            CreateModalFromTemplate("/templates/taggable-objects/custom-fields-edit-modal.html", modalScope).then(function(customFields) {
                svc.saveCustomFields(dataset, customFields);
            });
        }).error(setErrorInScope.bind($rootScope));
    };

    svc.buildCustomFieldsPreviews = function(customFields) {
        const ret = [];
        const customFieldsMap = $rootScope.appConfig.customFieldsMap['DATASET'];
        for (let i = 0; i < customFieldsMap.length; i++) {
            const selectCFList = (customFieldsMap[i].customFields || []).filter(cf => cf.type == 'SELECT');
            for (let j = 0; j < selectCFList.length; j++) {
                const cfDef = selectCFList[j];
                if (cfDef.iconInDatasetPreview) {
                    const value = (cfDef.selectChoices || []).find(choice => choice.value == (customFields && customFields[cfDef.name] || cfDef.defaultValue));
                    if (value) {
                        ret.push({definition: cfDef, value: value});
                    }
                }
            }
        }
        return ret;
    };

    return svc;
});

})();

(function() {
'use strict';

const app = angular.module('dataiku.recipes');


/*
    updateStatus : a function, will be called when the status is updated
    canChangeEngine : a function, the modal can only be opened if this returns true
    recipeParams : the recipe parameters in which the engineType will be selected
    recipeStatus : the status object, containing the available engines
*/
app.directive('engineSelectorButton', function(Assert, DataikuAPI, Dialogs, $stateParams, CreateModalFromTemplate){
	return {
		scope: {
            recipeType : '=',
			recipeStatus : '=',
			recipeParams : '=',
			updateStatus : '=',
			canChangeEngine : '=',
            hideStatus : '='
		},
		templateUrl: '/templates/recipes/fragments/recipe-engine-selection-button.html',
        link: function($scope, element, attrs) {
            Assert.inScope($scope, 'recipeParams');

            var modalDisplayed = false;
        	$scope.showEngineSelectionModal = function() {
                if (!modalDisplayed) {
                    modalDisplayed = true;
                    var newScope = $scope.$new();
                    CreateModalFromTemplate("/templates/recipes/fragments/recipe-engines-modal.html", newScope, null, function (modalScope) {
                        modalScope.nUnselectableEngines = modalScope.recipeStatus.engines.filter(e => !e.isSelectable).length;
                        modalScope.options = {};
                        modalScope.resetEngineType = function () {
                            delete $scope.recipeParams.engineType;
                            $scope.updateStatus();
                            modalScope.dismiss();
                        };
                        modalScope.selectEngine = function (engineType) {
                            $scope.recipeParams.engineType = engineType;
                            $scope.updateStatus();
                            modalScope.dismiss();
                        };
                        modalScope.$on("$destroy", _ => modalDisplayed = false);
                    });
                }
	        };
	    }
	}
});

})();
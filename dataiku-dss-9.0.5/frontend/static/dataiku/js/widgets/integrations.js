(function(){
'use strict';

var app = angular.module('dataiku.widgets.integrations', ['dataiku.services']);


app.directive("integrationChannelSelector", function($state, $stateParams, $rootScope, DataikuAPI, CreateModalFromTemplate, ScenarioIntegrations){
    return {
        scope : {
            integrationType : '=',
            model : '=',
            field : '@',
            scenarioIntegrationType : '=',
            channel: '=?bind'
        },
        templateUrl : '/templates/widgets/integration-channel-selector.html',
        link : function($scope, element, attrs) {
            function setChannel(channelId) {
                $scope.channel = channelId && $scope.availableChannels && $scope.availableChannels.filter(ch => ch.id == channelId)[0];
            }

            $scope.$watch('integrationType', function(nv) {
                if (nv) {
                    $scope.isDSSAdmin = $rootScope.isDSSAdmin;
                    $scope.adminChannelsPath = $state.href('admin.general.notifications') + '#messaging-channels';
                    $scope.wl = $rootScope.wl;
                    $scope.availableChannels = null;
                    $scope.getIntegrationTypeLabel = ScenarioIntegrations.getLabelByType;
                    DataikuAPI.integrations.listChannelsForIntegrationType($scope.integrationType).success(function(data){
                        $scope.availableChannels = data.map(function(x) {
                            x["label"] = x.id + " (" + x.type + ")";
                            return x;
                        });
                        setChannel($scope.model[$scope.field]);
                    }).error(setErrorInScope.bind($scope));
                }
            });

            $scope.$watch('model[field]', channelId => setChannel(channelId));

            $scope.$watch('channel', (newChannel, oldChannel) => {
                // Re-instanciate previous channel state when it is emptied (happens on save step)
                if (!newChannel && oldChannel) $scope.channel = oldChannel;
            });
        }
    }
});

})();

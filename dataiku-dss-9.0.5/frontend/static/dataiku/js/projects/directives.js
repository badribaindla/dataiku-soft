(function(){
    'use strict';

    var app = angular.module('dataiku.projects.directives', ['dataiku.filters']);

    app.directive('globalTagsList', function(TaggingService){
        return {
            template: 
        	`<div class="tagsList">
                <ul class="tags vertical-flex">
                    <li ng-repeat="tag in tags" ng-class="{\'selected\' : isTagSelected(tag)}">
                        <span ng-click="onClick(tag)" style="{{isTagSelected(tag) ? ' background-color:' + getTagColor(tag.title) : ''}}"
                                class="tag flex horizontal-flex" ng-class="{selected: isTagSelected(tag)}"  >
                            <span class="bullet" style="background-color:{{isTagSelected(tag) ? 'white' : getTagColor(tag.title)}};"> </span>
                            <span class="title flex"><span ui-global-tag="tag.title" object-type="'PROJECT'"/></span>
                            <span class="count noflex">{{tag.count}}</span>
                        </span>
                    </li>
                    <li ng-if="!tags.length">
                        <span class="mleft8">No tags available</span>
                    </li>
                </ul>
            </div>`,
            scope: {
            	tags: '=globalTagsList',
            	selectedTags: '=',
                onClickFunc: '='
            },
            link: function(scope, element){
                scope.onClick = function(tag){
                	scope.onClickFunc(tag.title);
                };
                
                scope.isTagSelected = function(tag) {
                	return scope.selectedTags.indexOf(tag.title) > -1;
                }

                scope.getTagColor = TaggingService.getTagColor;
            }
        };
    });
    
    app.directive('projectStatusList', function($location, DKUConstants){
        return {
            template: 
        	'<ul>' +
            '    <li ng-repeat="projectStatus in projectStatusList" ng-if="projectStatus.name != DKUConstants.ARCHIVED_PROJECT_STATUS" ng-click="$event.stopPropagation();toggleProjectStatus(projectStatus);" class="aic project-status" ng-class="{\'selected\' : isProjectStatusSelected(projectStatus.name)}", \'disabled\' : isProjectStatusSelected( DKUConstants.ARCHIVED_PROJECT_STATUS)}>' +
            '       <span class="status-color" style="background-color:{{projectStatus.color}};"></span> <span class="status-title">{{projectStatus.name}}</span>' +
            '   </li>' +
            '</ul>' + 
            '<button class="btn btn--contained" ng-click="toggleArchive()"><span ng-if="!isProjectStatusSelected(DKUConstants.ARCHIVED_PROJECT_STATUS)">Show archives</span><span ng-if="isProjectStatusSelected( DKUConstants.ARCHIVED_PROJECT_STATUS)">Show non archived</span></button>' +
            '<button class="btn btn--contained" ng-click="manageProjectStatus()">Manage project status</button>',
            scope: {
            	projectStatusList: '=',
            	selectedProjectStatusList: '='
            },
            link: function(scope, element){
            	scope.DKUConstants = DKUConstants;
                scope.toggleProjectStatus = function(projectStatus) {
                	scope.removeArchived();
                	if (projectStatus.name) {
                    	var index = scope.selectedProjectStatusList.indexOf(projectStatus.name);
                    	index > -1 ? scope.selectedProjectStatusList.splice(index, 1) : scope.selectedProjectStatusList.push(projectStatus.name);
                	}
            	}
                
                scope.removeArchived = function() {
                	var archivedIndex = scope.selectedProjectStatusList.indexOf( DKUConstants.ARCHIVED_PROJECT_STATUS);
                	if (archivedIndex != -1) {
                		scope.selectedProjectStatusList.splice(archivedIndex, 1);
                	}
                }
                
                scope.toggleArchive = function() {
                	if (scope.isProjectStatusSelected( DKUConstants.ARCHIVED_PROJECT_STATUS)) {
            			scope.selectedProjectStatusList = [];
                	} else {
                		scope.selectedProjectStatusList = [ DKUConstants.ARCHIVED_PROJECT_STATUS];
                	}
                }
                
                scope.isProjectStatusSelected = function(projectStatusName) {
                	return scope.selectedProjectStatusList.indexOf(projectStatusName) > -1;
                }
                
                scope.manageProjectStatus = function() {
                	$location.path('/admin/general/');
                }
            }
        };
    });
    
    app.directive('projectStatusSelector', function($state){
        return {
            template: 
        	'<ul>' +
            '    <li ng-repeat="projectStatus in projectStatusList" ng-click="onClick(projectStatus)" class="project-status" ng-class="{\'selected\' : isSelectedFunc(projectStatus)}">' +
            '       <span class="status-color" style="background-color:{{projectStatus.color}};"></span> <span class="status-title">{{projectStatus.name}}</span>' +
            '   </li>' +
            '</ul>' + 
            '<button class="btn btn--contained btn-tag-list" full-click><a main-click ng-click="adminProjetStatus()" style="color:#999;text-decoration:none;">Manage project status</a></button>',
            scope: {
            	projectStatusList: '=projectStatusSelector',
                isSelectedFunc: '=',
                onClickFunc: '='
            },
            link: function(scope, element){
                scope.onClick = function(projectStatus){
                	scope.onClickFunc(projectStatus.name);
                };
                
                scope.adminProjetStatus = function() {
                    $state.go("admin.general.themes");
                }
            }
        };
    });
    
    //contributorsList directive's name already used !
    app.directive('usersList', function(){
        return {
            template: 
            `<div class="noflex search-wrapper" >
                <input type="search" autofocus  placeholder="Filter..." ng-model="filterString" />
            </div>
        	<ul class="flex filtered-list"> 
                <li ng-if="customButtonToggleAction" ng-click="customButtonToggleActionFn()" class="contributor" ng-class="{\'selected\' : isCustomButtonSelected}"><span ng-transclude></span></li> 
                <li ng-repeat="contributor in usersList | filter:matchUsersByDisplayName" ng-click="toggleContributor(contributor)" class="contributor" ng-class="{\'selected\' : isContributorSelected(contributor)}"> 
                   <span user-picture="contributor.login" size="20" class="avatar20" /> <span class="contributor-name">{{contributor.displayName}}</span> 
               </li>
            </ul>`,
            scope: {
            	usersList: '=',
                selectedUsersList: '=',
                customButtonToggleAction: '=?',
            },
            transclude: true,
            link: function(scope, element){
                scope.filterString = "";

                scope.matchUsersByDisplayName = function (user){
                    return user.displayName.search(new RegExp(scope.filterString, 'i')) > -1;
                };

                scope.toggleContributor = function(contributor) {
                	if (contributor.login) {
                    	var index = scope.selectedUsersList.indexOf(contributor.login);
                    	index > -1 ? scope.selectedUsersList.splice(index, 1) : scope.selectedUsersList.push(contributor.login);
                	}
            	}
                
                scope.isContributorSelected = function(contributor) {
                	return scope.selectedUsersList.indexOf(contributor.login) > -1;
                }

                scope.isCustomButtonSelected = false;
                scope.customButtonToggleActionFn = function() {
                    scope.isCustomButtonSelected = ! scope.isCustomButtonSelected;
                    scope.customButtonToggleAction(scope.isCustomButtonSelected);
                }
            }
        };
    });

    app.directive("codeEnvOverrideForm", function(DataikuAPI, $stateParams){
        return {
            restrict: 'A',
            templateUrl : '/templates/projects/code-env-override-form.html',
            scope: {
                envSelection: '=codeEnvOverrideForm',
                envLang : '='
            },
            link : function($scope, element, attrs) {
                $scope.envNamesWithDescs = [];
                var selectDefault = function() {
                    if (!$scope.envSelection.useBuiltinEnv && $scope.envSelection.envName == null && $scope.envNamesWithDescs != null && $scope.envNamesWithDescs.envs.length > 0) {
                        $scope.envSelection.envName = $scope.envNamesWithDescs.envs[0].envName;
                    }
                };
                DataikuAPI.codeenvs.listNamesWithDefault($scope.envLang, $stateParams.projectKey).success(function(data) {
                    $scope.envNamesWithDescs = data;
                    selectDefault();
                }).error(setErrorInScope.bind($scope));
                $scope.$watch('envSelection.useBuiltinEnv', selectDefault);
                
            }
        }
    });

})();
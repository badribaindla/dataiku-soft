(function() {
	'use strict';
	
	const app = angular.module('dataiku.dashboards.insights');
	
	
	app.controller("InsightEditController", function($scope, $controller, $stateParams, DataikuAPI, CreateModalFromTemplate, Dialogs, $state, $q, TopNav) {
		TopNav.setLocation(TopNav.TOP_DASHBOARD, 'insights', null, 'edit');
		if ($scope.insight) {
			TopNav.setPageTitle($scope.insight.name + " - Insight");
		}
	
		Dialogs.saveChangesBeforeLeaving($scope, $scope.isDirty, $scope.saveInsight, $scope.revertChanges, 'This insight has unsaved changes.');
		Dialogs.checkChangesBeforeLeaving($scope, $scope.isDirty);
	});
	
	
	app.directive("insightEditGoToView", function($state) {
		return {
			link: function() {
				$state.go('projects.project.dashboards.insights.insight.view', {location: 'replace', inherit:true});
			}
		};
	});
	
	
	app.controller("NewInsightModalController", function($scope, $controller, $stateParams, $q, $filter,
				   DataikuAPI, INSIGHT_TYPES, DashboardUtils) {
	
		$scope.DashboardUtils = DashboardUtils;
		$scope.insightTypes = INSIGHT_TYPES;
		$scope.displayableInsightType = null;
	
		$scope.uiState = $scope.uiState || {};
		$scope.uiState.modalTab = 'new';
		$scope.filter = {};
	
		// Load insight list
		DataikuAPI.dashboards.insights.listWithAccessState($stateParams.projectKey)
			.success(function(data) {
				$scope.insights = data.insights;
				filterInsights();
				$scope.insightAccessMap = angular.extend($scope.insightAccessMap || {}, data.insightAccessData);
			}).error(setErrorInScope.bind($scope));
	
		$scope.$watch('filter', function(nv, ov) {
			filterInsights();
		}, true);
	
		$scope.$watch('insight.type', function(nv, ov) {
			filterInsights();
		});
	
		function filterInsights() {
			$scope.filteredInsights = $filter('filter')($scope.insights, {type: $scope.insight.type});
			$scope.noInsightOfSelectedType = !$scope.filteredInsights || $scope.filteredInsights.length == 0;
			$scope.filconstsights = $filter('filter')($scope.filteredInsights, {name: $scope.filter.q});
			if ($scope.filter.sourceId) {
				$scope.filteredInsights = $scope.filteredInsights.filter(function(insight) {
					return DashboardUtils.getInsightSourceId(insight) == $scope.filter.sourceId;
				});
			}
		}
	
		// Insights types that share the same create-form directive
		const INSIGHT_TYPE_GROUPS = {
			'scenario_last_runs': 'scenario',
			'scenario_run_button': 'scenario'
		};
	
		$scope.getInsightTypeGroup = function(insightType) {
			return INSIGHT_TYPE_GROUPS[insightType] || insightType;
		};
	
		$scope.simpleTileTypes = {
			text: {name: "Text", desc: "Zone of text"},
			image: {name: "Image", desc: "Upload an image"},
			iframe: {name: "Web Content", desc: "Embedded web page"}
		};
	
		$scope.setDashboardCreationId = function(dashboardId) {
			$scope.insight.dashboardCreationId = dashboardId;
		};
	
		$scope.resetModal = function() {
			$scope.insight = {
				projectKey: $stateParams.projectKey,
				params: {},
			};
	
			$scope.displayableInsightType = null;
	
			$scope.filter = {};
	
			$scope.hook = {
				//Can be overwritten by {{insightType}}InsightCreateForm directives
				beforeSave: function(resolve, reject) {
					resolve();
				},
	
				//Can be overwritten by {{insightType}}InsightCreateForm directives
				afterSave: function(resolve, reject) {
					resolve();
				},
	
				defaultName: null,
				sourceObject: {},
				setErrorInModaleScope : function(data, status, headers, config, statusText) {
					setErrorInScope.bind($scope)(data, status, headers, config, statusText);
				}
			};
		};
	
		$scope.resetModal();
	
		$scope.returnSimpleTile = function(tileType) {
			$scope.resolveModal({
				tileType: tileType
			});
		};
	
		$scope.selectType = function(type) {
			$scope.insight.type = type;
			$scope.displayableInsightType = DashboardUtils.getInsightHandler(DashboardUtils.getInsightTypeGroup(type)).name;
			if (type === "static_file") {
				$scope.pointerMode.isPointerMode = true;
			}
		};
	
		function beforeSavePromise() {
			const deferred = $q.defer();
			$scope.hook.beforeSave(deferred.resolve, deferred.reject);
			return deferred.promise;
		}
	
		function afterSavePromise() {
			const deferred = $q.defer();
			$scope.hook.afterSave(deferred.resolve, deferred.reject);
			return deferred.promise;
		}
	
		$scope.create = function() {
			if (!$scope.insight.name) {
				$scope.insight.name = $scope.hook.defaultName;
			}
	
			beforeSavePromise().then(
				function() {
					function save() {
						DataikuAPI.dashboards.insights.save($scope.insight)
							.error(setErrorInScope.bind($scope))
							.success(function(insightId) {
								$scope.insight.id = insightId;
								if ($scope.hook.sourceObject && !$scope.hook.noReaderAuth) {
									$scope.insight.isReaderAccessible = $scope.hook.sourceObject.isReaderAccessible;
								} else {
									$scope.insight.isReaderAccessible = true;
								}
								$scope.resolveModal({insight: $scope.insight, redirect: $scope.hook.redirect});
								afterSavePromise().then(
									function() {
										//nothing specific to do in case of success
									},
									function(data, status, headers, config, statusText) {
										setErrorInScope.bind($scope)(data, status, headers, config, statusText);
									}
								);
							});
					}
	
					if ($scope.hook.addSourceToReaderAuthorizations) {
						const neededReaderAuthorization = DashboardUtils.getNeededReaderAuthorization($scope.insight);
	
						DataikuAPI.projects.addReaderAuthorizations($stateParams.projectKey, [neededReaderAuthorization])
							.success(function() {
								$scope.hook.sourceObject.isReaderAccessible = true;
								save();
							})
							.error(setErrorInScope.bind($scope));
					} else {
						save();
					}
				},
				function(argArray) {
					if (argArray) {
						setErrorInScope.bind($scope).apply(null, argArray);
					}
				}
			);
		};
	});
	
	app.directive("insightSourceInfo", function(DashboardUtils) {
		return {
			template: '' +
			'<div ng-if="inDashboard" ng-show="matching.length">' +
			'	<a ng-click="go()">{{matching.length}} existing {{"insight" | plurify: matching.length}} with this source</a>' +
			'</div>' +
			'' +
			'<div class="alert alert-warning" ng-if="hook.sourceObject.smartId && !hook.sourceObject.isReaderAccessible && !hook.noReaderAuth">' +
			'	<div>This source is not yet shared with dashboard-only users.</div>' +
			'	<label style="margin-top: 10px" ng-if="projectSummary.canManageDashboardAuthorizations">' +
			'		<input type="checkbox" ng-model="hook.addSourceToReaderAuthorizations" ng-init="hook.addSourceToReaderAuthorizations = true" checked style="margin: -1px 5px 0 0"/>' +
			'		Add <strong>{{hook.sourceObject.label}}</strong> to authorized objects' +
			'	</label>' +
			'   <div ng-show="!hook.addSourceToReaderAuthorizations" style="padding-top: 5px;"><i class="icon-warning-sign"></i>&nbsp;<strong>Dashboard-only users won\'t be able to see this insight.</strong></div>' +
			'</div>',
	
			link: function($scope, element, attrs) {
	
				if (!$scope.inDashboard) return;
	
				function updateMatches() {
					if (!$scope.insights) {
						return;
					}
					const handler = DashboardUtils.getInsightHandler($scope.insight.type);
					$scope.matching = $scope.insights.filter(function(insight) {
						return $scope.getInsightTypeGroup(insight.type) == $scope.getInsightTypeGroup($scope.insight.type)
							&& handler.getSourceId(insight) == handler.getSourceId($scope.insight)
							&& (handler.sourceType || (handler.getSourceType(insight) == handler.getSourceType($scope.insight)));
					});
				}
	
				$scope.go = function() {
					const handler = DashboardUtils.getInsightHandler($scope.insight.type);
					$scope.filter.sourceId = handler.getSourceId($scope.insight);
					$scope.filter.sourceType = handler.sourceType || handler.getSourceType($scope.insight);
					$scope.uiState.modalTab = 'existing';
				};
	
				$scope.$watch("insight", updateMatches, true);
			}
		};
	});
	
	
	app.controller("CopyInsightModalController", function($scope, DataikuAPI, ActivityIndicator, StateUtils, $stateParams) {
		$scope.init = function(insight) {
			$scope.insight = insight;
			$scope.insight.newName = "Copy of " + insight.name;
		};
	
		$scope.copy = function() {
			DataikuAPI.dashboards.insights.copy($stateParams.projectKey, [$scope.insight.id], [$scope.insight.newName])
			.error(setErrorInScope.bind($scope))
			.success(function(data) {
				const insightCopy = data[0];
				const href = StateUtils.href.insight(insightCopy.id, insightCopy.projectKey, {name: insightCopy.name});
				ActivityIndicator.success($scope.insight.name + " copied into " + insightCopy.name + ", <a href='" + href + "' >view insight</a>.", 5000);
				$scope.resolveModal();
			});
		};
	});
	
	
	app.controller("MoveCopyTileModalController", function($scope, DataikuAPI, $controller, StateUtils, $rootScope, $timeout, TileUtils, $stateParams) {
		$controller('MultiPinInsightModalController', {$scope:$scope});
	
		$scope.keepOriginal = true;
		$scope.pointerMode = {
			mode: false
		};
	
		const initCopy = $scope.init;
		$scope.init = function(insight, tileParams) {
			if ($scope.insight) {
				initCopy(insight, tileParams);
			} else {
				//creating new tile
				$scope.newTile = TileUtils.copyNonInsightTile($scope.tile);
				//listing dashboards
				$scope.listDashboards($scope.insight);
			}
		};
	
		/*
		 * Methods used if copying/moving tile to other dashboard
		 */
		$scope.addPinningOrder = function() {
	
			for (var i=0; i<$scope.dashboards.length; i++) {
				if ($scope.dashboards[i].id == $scope.dashboard.id) {
					$scope.pinningOrder = {
						dashboard: $scope.dashboards[i],
						page: $scope.dashboards[i].pages[$scope.uiState.currentPageIdx]
					}
					$scope.pinningOrders = [$scope.pinningOrder];
					break;
				}
			}
		};
	
		$scope.multiPinCallback = function() {
			removeOriginalIfNeeded();
			$timeout(function() {
				const pin = $scope.pinningOrders[0];
				const options = {
					name: pin.dashboard.name,
					tab: 'edit',
					pageId: pin.page.id
				};
				StateUtils.go.dashboard(pin.dashboard.id, $stateParams.projectKey, options).then(function() {
					$rootScope.$broadcast("dashboardSelectLastTile");
				});
			});
		};
	
		/*
		 * Methods used if copying/moving the tile in the current dashboard
		 */
	
		function moveCopyTile(destinationPageId) {
			let destinationPage = null;
			for (let i=0; i<$scope.dashboard.pages.length; i++) {
				if ($scope.dashboard.pages[i].id == destinationPageId || $scope.dashboard.pages[i].$$hashKey == destinationPageId) {
					destinationPage = $scope.dashboard.pages[i];
					break;
				}
			}
	
			function moveCopyTileFront(insightId) {
				const copyTile = angular.copy($scope.tile);
				delete copyTile.$added;
				delete copyTile.$tileId;
				delete copyTile.box.top;
				delete copyTile.box.left;
	
				if (insightId) {
					copyTile.insightId = insightId;
				}
				destinationPage.grid.tiles.push(copyTile);
				removeOriginalIfNeeded();
				$scope.uiState.currentPageIdx = $scope.dashboard.pages.indexOf(destinationPage);
				$scope.uiState.selectedTile = copyTile;
			}
	
			if ($scope.tile.tileType == "INSIGHT" && $scope.keepOriginal && !$scope.pointerMode.mode) {
				DataikuAPI.dashboards.insights.copy($stateParams.projectKey, [$scope.tile.insightId], [$scope.insightName], $scope.dashboard.id)
					.error(setErrorInScope.bind($scope))
					.success(function(data) {
						const insightCopy = data[0];
						$scope.insightsMap[insightCopy.id] = insightCopy;
						moveCopyTileFront(insightCopy.id);
						$scope.dismiss();
					});
			} else {
				moveCopyTileFront();
				$scope.dismiss();
			}
		}
	
		function removeOriginalIfNeeded() {
			if (!$scope.keepOriginal) {
				let tilePosition = -1;
				$scope.page.grid.tiles.find(function (tile, index) { 
					if (tile.insightId === $scope.tile.insightId) {
						tilePosition = index;
						return true;
					}
					return false;
				});
				if (tilePosition != -1) {
					$scope.page.grid.tiles.splice(tilePosition, 1);
				}
			}
		}
	
		/*
		 * Forms methods
		 */
	
		$scope.validate = function() {
			if ($scope.pinningOrder.dashboard.id == $scope.dashboard.id) {
				moveCopyTile($scope.pinningOrder.page.id || $scope.pinningOrder.page.$$hashKey);
			} else {
				$scope.sendPinningOrders();
			}
		};
	
		$scope.checkConsistency = function() {
			if ($scope.keepOriginal) {
				$scope.pointerMode.mode = false;
			}
		};
	
		$scope.getPagesList = function() {
			if (!$scope.pinningOrder) {
				return [];
			} 
	
			if (!$scope.keepOriginal) {
				return $scope.pinningOrder.dashboard.pages.filter(function(page) {
					return $scope.page.id != page.id;
				});
			} else {
				return $scope.pinningOrder.dashboard.pages;
			}
		};
	});
	
	
	app.controller("_MultiPinInsightModalCommonController", function($scope, DataikuAPI, ActivityIndicator, TileUtils, $stateParams) {
	
		$scope.existingPinningList = [];
		$scope.pinningOrders = [];
		$scope.initiated = false;
	
		/*
		 * Form initialization
		 */
	
		$scope.init = function(insight, tileParams, payload) {
			//create new tile
            $scope.insight = insight;
            $scope.newTile = $scope.initNewTile(insight, tileParams);
            $scope.payload = payload

			// list dashboards where we could copy it
			$scope.listDashboards(insight);
		};
	
		$scope.initNewTile = function(insight, tileParams) {
			let newTile = TileUtils.newInsightTile(insight);
			if (tileParams) angular.extend(newTile.tileParams, tileParams);
			
			if ($scope.tile) {
				newTile.box = angular.copy($scope.tile.box);
			}

			newTile.box.left = -1;
			newTile.box.top = -1;

			return newTile;
		}
	
		$scope.listDashboards = function(insight) {
			DataikuAPI.dashboards.listEditable($stateParams.projectKey)
				.error(setErrorInScope.bind($scope))
				.success(function(data) {
					$scope.dashboards = data.dashboards;
					$scope.allDashboardsCount = data.allDashboardsCount;
					//listing where insight got already pinned
					if (insight && insight.id) {
						$scope.dashboards.forEach(function(dashboard, index) {
							dashboard.pages.forEach(function(page, pageIndex) {
								page.index = pageIndex;
								page.grid.tiles.forEach(function(tile) {
									if (tile.insightId == insight.id) {
										$scope.existingPinningList.push({
											"dashboard": dashboard,
											"page": page
										});
									}
								});
							});
							// Use local state of current dashboard to take into account slides being added / removed
							if ($scope.dashboard && $scope.dashboard.id === dashboard.id) {
								$scope.dashboards[index] = $scope.dashboard;
							}
						});
					}
					if ($scope.dashboards.length > 0) {
						$scope.addPinningOrder();
					}
					$scope.initiated = true;
				});
		};
	
		/*
		 * PinningOrder CRUD
		 */
	
		$scope.addPinningOrder = function() {
			$scope.pinningOrders.push({
				"dashboard": $scope.dashboards[0],
				"page": $scope.dashboards[0].pages[0],
			});
		};
	
		$scope.removePinningOrder = function(index) {
			$scope.pinningOrders.splice(index, 1);
		};
	
		$scope.getLightPinningOrders = function() {
			const lightPinningOrders = [];
			$scope.pinningOrders.forEach(function(pinningOrder) {
				lightPinningOrders.push({
					dashboardId: pinningOrder.dashboard.id,
					pageId: pinningOrder.page.id
				});
			});
			return lightPinningOrders;
		};
	
		/*
		 * UI
		 */
	
		const pagesLabels = {};
		$scope.getPageLabel = function(dashboard, page) {
			if (page.id && pagesLabels[page.id]) {
				return pagesLabels[page.id];
			}
			let pageLabel = "";
			if (page.title) {
				pageLabel = page.title;
			} else {
				pageLabel = "Slide " + (dashboard.pages.indexOf(page) + 1);
			}
			if (page.id) {
				pagesLabels[page.id] = pageLabel;
			}
			return pageLabel;
		};
	});
	
	
	app.controller("MultiPinInsightModalController", function($scope, DataikuAPI, ActivityIndicator, TileUtils, $controller, $stateParams) {
		$controller('_MultiPinInsightModalCommonController', {$scope:$scope});
	
		const initCopy = $scope.init;
		$scope.init = function(insight, tileParams) {
			initCopy(insight, tileParams);
			$scope.pointerMode = {
				mode: insight.type == 'static_file'
			};
		};
	
		$scope.sendPinningOrders = function() {
			const lightPinningOrders = $scope.getLightPinningOrders();
			DataikuAPI.dashboards.multiPin($stateParams.projectKey, $scope.insight.id, $scope.newTile, lightPinningOrders, $scope.pointerMode.mode)
				.error(setErrorInScope.bind($scope))
				.success(function(data) {
					ActivityIndicator.success("Saved!");
					if ($scope.multiPinCallback && typeof($scope.multiPinCallback)==='function') {
						$scope.multiPinCallback();
					}
					$scope.resolveModal();
				});
		};
	});
	
	
	
	app.controller("_CreateAndPinInsightModalCommonController", function($scope, DataikuAPI, ActivityIndicator, TileUtils, $controller, $timeout, StateUtils, $rootScope, DashboardUtils, $stateParams) {
		$controller('_MultiPinInsightModalCommonController', {$scope:$scope});
	
		$scope.missingReaderAuthorizations = [];
		$scope.addReaderAuthorization = $scope.projectSummary.canManageDashboardAuthorizations;

		$scope.authorize = function(insights) {
			const neededReaderAuthorizations = insights.map(_ => DashboardUtils.getNeededReaderAuthorization(_));
			
			DataikuAPI.projects.checkReaderAuthorizations($stateParams.projectKey, neededReaderAuthorizations)
			.error(setErrorInScope.bind($scope))
			.success(function(data) {
				$scope.missingReaderAuthorizations = data;
			});
		};
	
		$scope.sendCreateAndPinOrders = function(insights, newTiles, payloads) {
			function save() {
				const lightPinningOrders = $scope.getLightPinningOrders();
				
				DataikuAPI.dashboards.insights.createAndPin($stateParams.projectKey, insights, newTiles, lightPinningOrders, payloads)
				.error(setErrorInScope.bind($scope))
				.success(function(data) {
					ActivityIndicator.success("Saved!");
					if ($scope.pinningOrders.length == 0) {
						StateUtils.go.insight(data[0], $stateParams.projectKey, {name: insights[0].name});
					} else {
						const pin = $scope.pinningOrders[0];
						const options = {
							name: pin.dashboard.name,
							tab: 'edit',
							pageId: pin.page.id
						};
						StateUtils.go.dashboard(pin.dashboard.id, $stateParams.projectKey, options).then(function() {
							$rootScope.$broadcast("dashboardSelectLastTile");
						});
					}
					$scope.resolveModal();
				});
			}
	
			if ($scope.addReaderAuthorization && $scope.missingReaderAuthorizations) {
				DataikuAPI.projects.addReaderAuthorizations($stateParams.projectKey, $scope.missingReaderAuthorizations)
				.success(save)
				.error(setErrorInScope.bind($scope));
			} else {
				save();
			}
		};
	});

	app.controller("CreateAndPinInsightModalController", function($scope, DataikuAPI, ActivityIndicator, TileUtils, $controller, $timeout, StateUtils, $rootScope, DashboardUtils, $stateParams) {
		$controller('_CreateAndPinInsightModalCommonController', {$scope:$scope});
	
		const initCopy = $scope.init;
		$scope.init = function(insight, tileParams, payload) {
			initCopy(insight, tileParams, payload)
			$scope.authorize([insight]);
		}

		const sendOrders = $scope.sendCreateAndPinOrders;
		$scope.sendCreateAndPinOrders = function() {
			sendOrders([$scope.insight], [$scope.newTile], [$scope.payload]);
		};
	});

	app.controller("CreateAndPinInsightsModalController", function($scope, DataikuAPI, ActivityIndicator, TileUtils, $controller, $timeout, StateUtils, $rootScope, DashboardUtils, $stateParams) {
		$controller('_CreateAndPinInsightModalCommonController', {$scope:$scope});
	
		$scope.insights = [];
		$scope.newTiles = [];
		$scope.insightData = [];

		$scope.init = function(insights, tileParams) {
            //create new tile
            insights.forEach(insight => {
                $scope.insights.push(insight);
                $scope.newTiles.push($scope.initNewTile(insight, tileParams));
            });
			// list dashboards where we could copy it
			$scope.listDashboards($scope.insights[0]);
			$scope.authorize(insights);
		};
	
		const sendOrders = $scope.sendCreateAndPinOrders;
		$scope.sendCreateAndPinOrders = function() {
			let insights = $scope.insights.filter((_, i) => $scope.insightData.items[i].selected);
			let newTiles = $scope.newTiles.filter((_, i) => $scope.insightData.items[i].selected);
			sendOrders(insights, newTiles);
		};

		$scope.canCreate = function() {
			return $scope.insightData.items && $scope.insightData.items.some(_ => _.selected);
		}
	});
	
})();
	

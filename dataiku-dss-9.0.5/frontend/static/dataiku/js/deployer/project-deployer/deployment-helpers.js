(function() {
    'use strict';
    
    const app = angular.module('dataiku.projectdeployer');
    
    app.service('ProjectDeployerDeploymentService', function($rootScope, CreateModalFromTemplate) {
        this.startCreateDeployment = function(preselectedPublishedProjectKey, preselectedBundleId) {
            return CreateModalFromTemplate("/templates/project-deployer/new-deployment-modal.html", $rootScope, null, function(modalScope) {
                modalScope.deploymentSettings = {
                    publishedProjectKey: preselectedPublishedProjectKey,
                    bundleId: preselectedBundleId
                };
                modalScope.fromBundle = !!(preselectedPublishedProjectKey && preselectedBundleId);
            });
        };
    });

    app.service('ProjectDeployerDeploymentSyncHelper', function(DataikuAPI, FutureWatcher) {
        const DEPLOY_STEPS = {
            CREATE: 'Creating deployment',
            SAVE: 'Preparing deployment',
            PREPARE_SYNC: 'Importing bundle',
            PRELOAD_BUNDLE: 'Preloading bundle',
            ACTIVATE_CHECK: 'Bundle activation checks',
            ACTIVATE_BUNDLE: 'Activating bundle'
        };
        const STEP_STATUS = {
            SUCCESS: 'SUCCESS',
            ERROR: 'ERROR',
            WARNING: 'WARNING',
            IN_PROGRESS: 'IN_PROGRESS',
            NOT_STARTED: 'NOT_STARTED'
        };
        const DEPLOY_STATUS = {
            DONE: 'DONE',
            DONE_WITH_WARNINGS: 'DONE_WITH_WARNINGS',
            FAILED: 'FAILED',
            IN_PROGRESS: 'IN_PROGRESS'
        };
        let currentJobId = null;

        function start(parentScope, deploymentSettings, startingStepName, endingStepName) {
            const $scope = parentScope.$new();
            const allSteps = Object.values(DEPLOY_STEPS);
            const startIndex = allSteps.findIndex(step => step === startingStepName);
            const endIndex = endingStepName ? allSteps.findIndex(step => step === endingStepName) : allSteps.length;

            const deploymentSteps = allSteps.filter((step, index) => {
                    return index >= startIndex && index <= endIndex;
                }).map((step, index) => ({
                    name: step,
                    index,
                    status: STEP_STATUS.NOT_STARTED, 
                    infoMessage: {}
                }));
            let currentIndex = 0;
            let currentStep = deploymentSteps[currentIndex];
            const deployment = {
                status: DEPLOY_STATUS.IN_PROGRESS,
                steps: deploymentSteps,
                progress: {
                    current: 1,
                    end: deploymentSteps.length
                },
                currentStep,
                futureResponse: null,
                error: null,
                infoMessages: {
                    messages: []
                }
            };

            function runStep() {
                deployment.currentStep.status = STEP_STATUS.IN_PROGRESS;
                switch (deployment.currentStep.name) {
                    case DEPLOY_STEPS.CREATE:
                        DataikuAPI.projectdeployer.deployments.create(deploymentSettings.id, deploymentSettings.publishedProjectKey, deploymentSettings.infraId, deploymentSettings.bundleId).success(onStepComplete).error(onStepError);
                        break;
                    case DEPLOY_STEPS.SAVE:
                        DataikuAPI.projectdeployer.deployments.save(deploymentSettings).success(onStepComplete).error(onStepError);
                        break;
                    case DEPLOY_STEPS.PREPARE_SYNC:
                        DataikuAPI.projectdeployer.deployments.prepareSync(deploymentSettings.id).success(handleFuture).error(onStepError);
                        break;
                    case DEPLOY_STEPS.PRELOAD_BUNDLE:
                        DataikuAPI.projectdeployer.deployments.startPreload(deploymentSettings.id).success(handleFuture).error(onStepError);
                        break;
                     case DEPLOY_STEPS.ACTIVATE_CHECK:
                        DataikuAPI.projectdeployer.deployments.activateCheck(deploymentSettings.id).success(onStepComplete).error(onStepError);
                        break;
                    case DEPLOY_STEPS.ACTIVATE_BUNDLE:
                        DataikuAPI.projectdeployer.deployments.startActivate(deploymentSettings.id).success(handleFuture).error(onStepError);
                        break;
                }
                $scope.$emit('projectDeploymentUpdate', deployment);
            };

            function handleFuture(data) {
                deployment.futureResponse = null;
                if (data.hasResult) {
                    onStepComplete(data);
                } else {
                    currentJobId = data.jobId;
                    deployment.futureResponse = data;
                    FutureWatcher.watchJobId(currentJobId).success(onStepComplete).update(onStepUpdate).error(onStepError);
                }
            }
            
            function onStepComplete(results) {
                const result = results.result || results; // activateCheck returns the result directly (no future)
                let goToNextStep = false;
                deployment.futureResponse = null;
                if (result && (result.maxSeverity === STEP_STATUS.ERROR || result.maxSeverity === STEP_STATUS.WARNING)) {
                    deployment.currentStep.status = result.maxSeverity;
                    deployment.currentStep.infoMessage = result;
                    if (deployment.currentStep.name === DEPLOY_STEPS.PRELOAD_BUNDLE) {
                        deployment.preloadLog = results.log;
                    }
                    // Only stop on ERROR, not on WARNING
                    if (result.maxSeverity === STEP_STATUS.ERROR) {
                        deployment.status = DEPLOY_STATUS.FAILED;
                    }
                    
                    // Set deployment severity only if not yet defined or if individual step's severity is STEP_STATUS.WARNING
                    // If deployment severity is ever set to STEP_STATUS.ERROR, do not update it again in future steps
                    if (deployment.infoMessages.maxSeverity !== STEP_STATUS.ERROR) {
                        deployment.infoMessages.maxSeverity = result.maxSeverity;
                    }
                    deployment.infoMessages.messages = deployment.infoMessages.messages.concat(result.messages);
                } else {
                    deployment.currentStep.status = STEP_STATUS.SUCCESS;
                }

                if (deployment.status === DEPLOY_STATUS.IN_PROGRESS &&
                    (currentIndex === deploymentSteps.length - 1 || (deployment.currentStep.name == endingStepName))) {
                    deployment.status = deployment.steps.some(step => Object.keys(step.infoMessage).length !== 0) ?
                        DEPLOY_STATUS.DONE_WITH_WARNINGS : DEPLOY_STATUS.DONE;
                }

                goToNextStep = deployment.status === DEPLOY_STATUS.IN_PROGRESS;

                $scope.$emit('projectDeploymentUpdate', deployment);

                if (goToNextStep) {
                    deployment.progress.current++;
                    deployment.currentStep = deploymentSteps[++currentIndex];
                    runStep();
                }
            }

            function onStepUpdate(response) {
                deployment.futureResponse = response;
                $scope.$emit('projectDeploymentUpdate', deployment);
            }

            function onStepError(data, status, headers) {
                deployment.status = DEPLOY_STATUS.FAILED;
                deployment.currentStep.status = STEP_STATUS.ERROR;
                deployment.error = data;
                deployment.futureResponse = null;
                $scope.$emit('projectDeploymentUpdate', deployment);

                setErrorInScope.bind(parentScope)(data, status, headers);
            }

            runStep();
        }

        return {
            STEP_STATUS,
            DEPLOY_STEPS,
            DEPLOY_STATUS,
            start
        };
    });
})();
    

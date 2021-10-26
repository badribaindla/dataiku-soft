(function() {
'use strict';

var app = angular.module('dataiku.controllers');

 // TODO : move those controllers !!


 app.controller('ConfirmDialogController', function($scope) {
    // Focus should already have been stolen in the
    // template, but sometimes it does not work ...
    window.setTimeout(function(){
        $(":focus").blur()
    }, 0);
    $scope.confirm = function() {
       if($scope.acceptDeferred) {
           $scope.acceptDeferred.resolve("Accepted");
       }
       $scope.acceptDeferred = null;
       $scope.dismiss();
   };
   $scope.cancel = function() {
       if($scope.acceptDeferred) {
           $scope.acceptDeferred.reject("Cancelled");
       }
       $scope.acceptDeferred = null;
       $scope.dismiss();
   };
});


app.controller('PromptDialogController', function($scope) {
    $scope.confirm = function() {
        if($scope.acceptDeferred) {
            $scope.acceptDeferred.resolve($scope.value);
        }
        $scope.acceptDeferred = null;
        $scope.dismiss();
    };
    $scope.cancel = function() {
        if($scope.acceptDeferred) {
            $scope.acceptDeferred.reject();
        }
        $scope.acceptDeferred = null;
        $scope.dismiss();
    };
});


app.controller('SelectDialogController', function($scope) {
    $scope.confirm = function() {
        if($scope.acceptDeferred) {
            $scope.acceptDeferred.resolve($scope.selectedItem);
        }
        $scope.acceptDeferred = null;
        $scope.dismiss();
    };
    $scope.cancel = function() {
        if($scope.acceptDeferred) {
            $scope.acceptDeferred.reject();
        }
        $scope.acceptDeferred = null;
        $scope.dismiss();
    };
    $scope.selectItem = function(item) {
        $scope.selectedItem = item;
    };
});


app.controller('ConflictDialogController', function($scope) {
    $scope.erase = function() {
        if($scope.acceptDeferred) {
            $scope.acceptDeferred.resolve("erase");
        }
        $scope.acceptDeferred = null;
        $scope.dismiss();
    };

    $scope.cancel = function() {
        if($scope.acceptDeferred) {
            $scope.acceptDeferred.reject();
        }
        $scope.acceptDeferred = null;
        $scope.dismiss();
    };

    $scope.forget = function() {
        if($scope.acceptDeferred) {
            $scope.acceptDeferred.resolve("ignore");
        }
        $scope.acceptDeferred = null;
        $scope.dismiss();
    };
});

app.controller('PasteModalController', function($scope, DetectUtils, WT1) {
    $scope.os = DetectUtils.getOS();
    
    $scope.uiState = {
        editMode: true,
        hasError: false,
        items: [],
        type: ''
    };

    $scope.validateData = $scope.validateData || (() => true);

    $scope.onPasteText = function(event) {
        let data = {};

        try {
            data = JSON.parse(event.originalEvent.clipboardData.getData('text/plain'));
        } catch(e) {}
        if (typeof $scope.applyGenericFormat === 'function') {
            data = $scope.applyGenericFormat(data);
        }
        if (data[$scope.itemKey] 
            && data[$scope.itemKey].length 
            && $scope.copyType === data.type
            && $scope.validateData(data[$scope.itemKey])) {
            let items = data[$scope.itemKey];

            if (typeof $scope.formatData === 'function') {
                items = $scope.formatData(data[$scope.itemKey]);
            }

            $scope.uiState.editMode = false;
            $scope.uiState.hasError = false;
            $scope.uiState.items = items;
            $scope.uiState.type = data.type;
        } else {
            $scope.uiState.hasError = true;
        }

        event.preventDefault();
    };

    $scope.confirm = function() {
        $scope.pasteItems($scope.uiState.items);
        WT1.event('paste-modal-submit', { dataType: $scope.uiState.type });
        $scope.dismiss();
    };
});

}());


(function() {
'use strict';

var app = angular.module('dataiku.services');

app.factory("Dialogs", ["CreateModalFromTemplate", "$q", "$state", "$timeout","DKUConstants", function(CreateModalFromTemplate, $q, $state, $timeout,DKUConstants) {
    return {
        ack : function($scope, title, text) {
            var deferred = $q.defer();
            CreateModalFromTemplate("/templates/dialogs/ack-dialog.html", $scope, "ConfirmDialogController", function(newScope) {
                newScope.acceptDeferred = deferred;
                newScope.title = title;
                newScope.text = text;
                newScope.$on("$destroy",function() {
                    if(newScope.acceptDeferred) {
                        newScope.acceptDeferred.reject();
                    }
                    newScope.acceptDeferred = null;
                });
            });
            return deferred.promise;
        },
        ackMarkdown : function($scope, title, text) {
            var deferred = $q.defer();
            CreateModalFromTemplate("/templates/dialogs/ack-dialog-markdown.html", $scope, "ConfirmDialogController", function(newScope) {
                newScope.acceptDeferred = deferred;
                newScope.title = title;
                newScope.text = text;
                newScope.$on("$destroy",function() {
                    if(newScope.acceptDeferred) {
                        newScope.acceptDeferred.reject();
                    }
                    newScope.acceptDeferred = null;
                });
            });
            return deferred.promise;
        },
        error : function($scope, title, text) {
            var deferred = $q.defer();
            CreateModalFromTemplate("/templates/dialogs/error-dialog.html", $scope, "ConfirmDialogController", function(newScope) {
                newScope.acceptDeferred = deferred;
                newScope.title = title;
                newScope.text = text;
                newScope.$on("$destroy",function() {
                    if(newScope.acceptDeferred) {
                        newScope.acceptDeferred.reject();
                    }
                    newScope.acceptDeferred = null;
                });
            });
            return deferred.promise;
        },
        confirm : function($scope, title, text) {
            var deferred = $q.defer();
            CreateModalFromTemplate("/templates/dialogs/confirm-dialog.html", $scope, "ConfirmDialogController", function(newScope) {
                newScope.acceptDeferred = deferred;
                newScope.positive = false;
                newScope.title = title;
                newScope.text = text;
                newScope.$on("$destroy",function() {
                    if(newScope.acceptDeferred) {
                        newScope.acceptDeferred.reject();
                    }
                    newScope.acceptDeferred = null;
                });
            });
            return deferred.promise;
        },
        confirmUnsafeHTML : function($scope, title, text) {
            var deferred = $q.defer();
            CreateModalFromTemplate("/templates/dialogs/confirm-dialog-unsafe-html.html", $scope, "ConfirmDialogController", function(newScope) {
                newScope.acceptDeferred = deferred;
                newScope.positive = false;
                newScope.title = title;
                newScope.text = text;
                newScope.$on("$destroy",function() {
                    if(newScope.acceptDeferred) {
                        newScope.acceptDeferred.reject();
                    }
                    newScope.acceptDeferred = null;
                });
            });
            return deferred.promise;
        },
        confirmPositive : function($scope, title, text) {
            var deferred = $q.defer();
            CreateModalFromTemplate("/templates/dialogs/confirm-dialog.html", $scope, "ConfirmDialogController", function(newScope) {
                newScope.acceptDeferred = deferred;
                newScope.positive = true;
                newScope.title = title;
                newScope.text = text;
                newScope.$on("$destroy",function() {
                    if(newScope.acceptDeferred) {
                        newScope.acceptDeferred.reject();
                    }
                    newScope.acceptDeferred = null;
                });
            });
            return deferred.promise;
        },
        confirmSimple : function($scope, text, positive = false) {
            var deferred = $q.defer();
            CreateModalFromTemplate("/templates/dialogs/confirm-dialog-simple.html", $scope, "ConfirmDialogController", function(newScope) {
                newScope.acceptDeferred = deferred;
                newScope.positive = positive;
                newScope.text = text;
                newScope.$on("$destroy",function() {
                    if(newScope.acceptDeferred) {
                        newScope.acceptDeferred.reject();
                    }
                    newScope.acceptDeferred = null;
                });
            });
            return deferred.promise;
        },
        confirmDisclaimer : function($scope, title, text, disclaimer) {
            var deferred = $q.defer();
            CreateModalFromTemplate("/templates/dialogs/confirm-dialog-disclaimer.html", $scope, "ConfirmDialogController", function(newScope) {
                newScope.acceptDeferred = deferred;
                newScope.positive = false;
                newScope.title = title;
                newScope.disclaimer = disclaimer;
                newScope.text = text;
                newScope.$on("$destroy",function() {
                    if(newScope.acceptDeferred) {
                        newScope.acceptDeferred.reject();
                    }
                    newScope.acceptDeferred = null;
                });
            });
            return deferred.promise;
        },

        confirmAlert : function($scope, title, text, alertText, severity) {
            var deferred = $q.defer();
            CreateModalFromTemplate("/templates/dialogs/confirm-dialog-alert.html", $scope, "ConfirmDialogController", function(newScope) {
                newScope.acceptDeferred = deferred;
                newScope.positive = false;
                newScope.title = title;
                newScope.alertText = alertText;
                newScope.severity = severity;
                newScope.text = text;
                newScope.$on("$destroy",function() {
                    if(newScope.acceptDeferred) {
                        newScope.acceptDeferred.reject();
                    }
                    newScope.acceptDeferred = null;
                });
            });
            return deferred.promise;
        },

        confirmInfoMessages : function($scope, title, data, text, skipIfNoMessages) {
            if (skipIfNoMessages && (data == null || data.messages.length == 0)) return $q.when(null);
            var deferred = $q.defer();

            CreateModalFromTemplate("/templates/dialogs/confirm-dialog-info-messages.html", $scope, "ConfirmDialogController", function(newScope) {
                newScope.modalTitle = title;
                newScope.data = data;
                newScope.acceptDeferred = deferred;
                newScope.positive = false;
                newScope.title = title;
                newScope.text = text;
                newScope.$on("$destroy",function() {
                    if(newScope.acceptDeferred) {
                        newScope.acceptDeferred.reject();
                    }
                    newScope.acceptDeferred = null;
                });
            });
            return deferred.promise;
        },

        infoMessagesDisplayOnly : function($scope, title, data, log, hideAlertHeader, backdrop, keyboard) {
            if (data.messages.length == 0) return $q.when(null);
            var deferred = $q.defer();
            CreateModalFromTemplate("/templates/dialogs/info-messages-dialog.html", $scope, null, function(newScope) {
                newScope.DKUConstants = DKUConstants;
                newScope.modalTitle = title;
                newScope.data = data;
                newScope.log = log;
                newScope.hideAlertHeader = hideAlertHeader;
                newScope.$on("$destroy",function() {
                    deferred.resolve();
                });
            }, backdrop, keyboard);
            return deferred.promise;
        },

        prompt : function($scope, title, text, defaultValue, options) {
            var deferred = $q.defer();
            CreateModalFromTemplate("/templates/dialogs/prompt-dialog.html", $scope, "PromptDialogController", function(newScope, newDOMElt) {
                newScope.acceptDeferred = deferred;
                newScope.title = title;
                newScope.text = text;
                newScope.value = defaultValue;
                newScope.options = options;
                newScope.$on("$destroy",function() {
                    if(newScope.acceptDeferred) {
                        newScope.acceptDeferred.reject();
                    }
                    newScope.acceptDeferred = null;
                });
                newDOMElt.on('keydown', 'input', function(e) {
                    if (e.which === 13 && newScope.renameForm.$valid === false) {
                        e.stopPropagation();
                    }
                })

                if (options && options.type === 'textarea') {
                    newDOMElt.on('keydown', 'textarea', function(evt) {
                        if (evt.which === 13) {
                            // prevent ENTER key from validating the popup from inside the textarea
                            evt.stopPropagation();
                        }
                    })
                }
            });
            return deferred.promise;
        },

        select : function($scope, title, text, items, selectedItem) {
            var deferred = $q.defer();
            CreateModalFromTemplate("/templates/dialogs/select-dialog.html", $scope, "SelectDialogController", function(newScope) {
                newScope.acceptDeferred = deferred;
                newScope.title = title;
                newScope.text = text;
                newScope.items = items;
                newScope.selectedItem = selectedItem;
                newScope.$on("$destroy",function() {
                    if(newScope.acceptDeferred) {
                        newScope.acceptDeferred.reject();
                    }
                    newScope.acceptDeferred = null;
                });
            });
            return deferred.promise;
        },

        eeUnavailableFeature : function($scope, lockedMessage, learnMoreURL){
           CreateModalFromTemplate("/templates/dialogs/ee-unavailable-feature-modal.html", $scope, null, function(newScope) {
            newScope.lockedMessage = lockedMessage;
            newScope.learnMoreURL = learnMoreURL;
        });
       },

       displaySerializedError: function($scope, e) {
            CreateModalFromTemplate("/templates/dialogs/serialized-error-modal.html", $scope, null, function(newScope) {
                newScope.error = e;
            });
        },


       openEditInNotebookConflictDialog: function($scope) {
        var deferred = $q.defer();
        CreateModalFromTemplate("/templates/dialogs/edit-in-notebook-conflict-dialog.html", $scope, "ConflictDialogController", function(newScope) {
            newScope.acceptDeferred = deferred;
            newScope.$on("$destroy", function() {
                if (newScope.acceptDeferred) {
                    newScope.acceptDeferred.reject();
                }
                newScope.acceptDeferred = null;
            });
        });
        return deferred.promise;
       },

       openConflictDialog : function($scope,conflictResult) {

        var deferred = $q.defer();
        CreateModalFromTemplate("/templates/dialogs/save-conflict-dialog.html", $scope, "ConflictDialogController", function(newScope) {
            newScope.acceptDeferred = deferred;
            newScope.conflictResult = conflictResult;
            newScope.$on("$destroy",function() {
                if(newScope.acceptDeferred) {
                    newScope.acceptDeferred.reject();
                }
                newScope.acceptDeferred = null;
            });
        });
        return deferred.promise;
    },

    saveChangesBeforeLeaving: function(scope, dirty, save, revert, msg) {
        if (typeof dirty != 'function') {
            console.error("Dirtyness detection is not valid. typeof dirty = ", typeof dirty, dirty); /*@console*/ // NOSONAR: OK to use console.
        }
        if (typeof save != 'function') {
            console.error("Saving function is not valid. typeof save = ", typeof save, save); /*@console*/ // NOSONAR: OK to use console.
        }
        if (revert && typeof revert != 'function') {
            console.error("Revert function is not valid. typeof revert = ", typeof revert, revert); /*@console*/ // NOSONAR: OK to use console.
        }

        scope.$on('$stateChangeStart', function (event, toState, toParams, fromState, fromParams) {
            var isDirty = false;
                try { // Don't keep the reference to the scope in dssHasDirtyThings, so never fail this check!
                isDirty = dirty(toState, toParams, fromState, fromParams);
            } catch (e) {
                console.error("Failed to check dirtiness"); /*@console*/ // NOSONAR: OK to use console.
            }
            if (isDirty) {
                event.preventDefault();

                CreateModalFromTemplate("/templates/dialogs/unsaved-changes-warning.html", scope, null, function(modalScope) {
                    modalScope.msg = msg;

                    var goToState = function() {
                        $timeout(function() {
                            $state.go(toState, toParams);
                            modalScope.resolveModal();
                        });
                    };

                    modalScope.saveAndContinue = function() {
                        var saveResult = save();
                        if (saveResult && saveResult.success)  {
                            saveResult.success(goToState);
                        } else {
                            goToState();
                        }

                        if (saveResult && saveResult.error) {
                            saveResult.error(setErrorInScope.bind(modalScope));
                        }
                    };

                    modalScope.continueWithoutSaving = function() {
                        if (revert) {
                            revert();
                        }

                        goToState();
                    };
                });

                return false;
            } else {
            }
        });
    },

    checkChangesBeforeLeaving: checkChangesBeforeLeaving
};

}]);


})();
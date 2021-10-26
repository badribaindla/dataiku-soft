(function(){
    'use strict';

    var app = angular.module('dataiku.common.pictures', []);

    app.factory('ImageUrl', function(ProjectInitials) {
        return function(projectName, projectKey, objectId, objectType, localHash, size, color, pattern, showInitials) {
            if (objectType == 'TUTORIAL' || objectType == 'SAMPLE') {
                // the url is passed through object-id
                return '/dip/api/image/get-thumbnail?type=' + objectType + '&imageUrl=' + objectId;
            } else {
                // ensure color is correct format
                projectName = showInitials ? projectName : '';
                const initials = ProjectInitials(projectName);

                color = color ? color.replace('#', '0x') : color;
                return '/dip/api/image/get-image?size=' + encodeURIComponent(size) + 
                                                '&projectKey=' + encodeURIComponent(projectKey) + 
                                                '&type=' + encodeURIComponent(objectType) + 
                                                '&id=' + encodeURIComponent(objectId) +
                                                "&hash=" + encodeURIComponent(localHash) + 
                                                (color ? "&color=" + encodeURIComponent(color) : "")+
                                                (pattern ? "&pattern=" + encodeURIComponent(pattern) : "")+
                                                (initials ? "&initials=" + encodeURIComponent(initials) : "");
            }
        };
    });

    app.factory('UserImageUrl', function($rootScope) {
        return function(userLogin, size) {
            if (!userLogin) return "";
            size = size || 32;
            return `/dip/api/image/get-image?type=USER&id=${encodeURIComponent(userLogin)}&size=${size}x${size}&hash=${$rootScope.userPicturesHash}`;
        }
    });

    /*
        \b\w   Works with non-accented Latin characters
        (?<!\p{Alphabetic})\p{Alphabetic} Works with accented characters but requires lookbehind support, which JS lacks
        (?:^|\P{Alphabetic})\p{Alphabetic} + only take the last character but \p{UnicodeNamedCharacterClass} is not supported in Firefox
    */
    app.factory('ProjectInitials', function() {
        return function(name) {
            let initials = name || '';

            if (name) {
                let match = name.match(/\b(\w)/g);
                if (match && match.length >= 2) {
                    initials = match.join('');
                }
                initials = initials.charAt(0).toUpperCase() + initials.charAt(1);
            }

            return initials;
        }
    });

    app.directive('totem', function(CreateModalFromTemplate, ImageUrl) {
        return {
            restrict: 'E',
            scope: {
                'projectName': '=',
                'projectKey': '=',
                'projectAppType' : '=?',
                'isAppAsRecipe' : '=?',
                'objectType': '=',
                'objectId': '=',
                'editable': '=',
                'totemClass': '@',
                'size': '=',
                'sizeX' : '=',
                'sizeY' : '=',
                'insightMode' : '=',
                'objectImgHash' : '=',
                'imgColor' : '=',
                'imgPattern' : '=',
                'showInitials' : '=',
                'isProjectImg' : '=',
                'defaultImgColor' : '='
            },
            replace: true,
            template: `
                <span>
                    <img ng-src='{{ imageUrl() }}' editable='{{!!editable}}' class='totem {{totemClass}}' title='{{projectName}}'/>
                    <span ng-if="projectAppType === 'APP_TEMPLATE'" class="app-template-overlay" title="{{ (isAppAsRecipe ? 'Application-as-recipe' : 'Visual application') + ' template'}}">
                        <i class="{{isAppAsRecipe ? 'icon-dku-application-as-recipe' : 'icon-project-app'}}"></i>
                    </span>
                </span>
            `,
            link: function(scope, element, attrs) {
                scope.$watch("objectImgHash", function(nv, ov) {
                    if (nv === null || nv === undefined || nv === 0) {
                        scope.localHash = (Math.random() * 10000) | 0;
                    } else {
                        scope.localHash = nv;
                    }
                })

                scope.imageUrl = function() {
                    if (scope.sizeX) {
                        return ImageUrl(scope.projectName, scope.projectKey, scope.objectId, scope.objectType, scope.localHash, scope.sizeX + 'x' + scope.sizeY, scope.imgColor, scope.imgPattern, scope.showInitials);
                    } else {
                        return ImageUrl(scope.projectName, scope.projectKey, scope.objectId, scope.objectType, scope.localHash, scope.size ? (scope.size + 'x' + scope.size) : '', scope.imgColor, scope.imgPattern, scope.showInitials);
                    }
                }

                scope.forceRefreshImage = function() {
                    scope.localHash = (Math.random() * 10000) | 0;
                    scope.objectImgHash = scope.localHash;
                }

                scope.openUploadPictureDialog = function() {
                    CreateModalFromTemplate(
                        "/templates/widgets/image-uploader-dialog.html",
                        scope,
                        null,
                        function(newScope) {},
                        "image-uploader-dialog")
                        .then(function(id) { scope.objectId = id; });
                }

                if (scope.editable === true) {
                    element.on('click', function(e) {
                        scope.openUploadPictureDialog();
                    });
                }

            }
        }
    });

    app.directive('cropedProjectPicture', function(ImageUrl) {
        return {
            restrict: 'E',
            scope: {
                'projectName': '=',
                'projectKey': '=',
                'objectType': '=',
                'imgColor' : '=',
                'imgPattern' : '=',
                'showInitials' : '=',
                'objectId': '=',
                'sizeX': '=',
                'sizeY': '=',
                'objectImgHash' : '=',
            },
            replace: true,
            template: "<div style='background-image:url(\"{{ imageUrl() }}\")' class='croped-project-picture'/>",
            link: function(scope, element, attrs) {
                scope.$watch("objectImgHash", function(nv, ov) {
                    if (nv === null || nv === undefined || nv === 0) {
                        scope.localHash = (Math.random() * 10000) | 0;
                    } else {
                        scope.localHash = nv;
                    }
                })

                scope.imageUrl = function() {                 
                	return ImageUrl(scope.projectName, scope.projectKey, scope.objectId, scope.objectType, scope.localHash, scope.sizeX + 'x' + scope.sizeY, scope.imgColor, scope.imgPattern, scope.showInitials);
                }
            }
        }
    });

    app.directive('imageUploader', function(DataikuAPI, $rootScope, Notification, SpinnerService, ProjectInitials) {
        // only designed to appear in a image upload dialog.
        // no independant scope here.
        return {
            restrict: 'E',
            scope: false,
            replace: true,
            templateUrl: '/templates/widgets/image-uploader.html',
            link: function(scope, element, attrs) {
                /* DOCUMENTATION: one might come across the following variables many times, here is a definition of what they rely to:
                 *   scope.originalW/H  = uploaded image width/height
                 *   scope.W/H = size of displayed image in dropzone, adjusted to image aspect ratio (hence wide images=> shorter H)
                 *   scope.box.width/height/top/left = defines selection rect using same co-ords system as scope.W etc
                 *   TARGET_SIZE.width/height = size of preview area.  SLICE and STRETCH always drawn into preview at 0,0
                 *   TARGET_SIZE sizes NOT DEFINED when simple crop and upload as per dashboard images!
                 *   scale = scaling of original image to fit drop zone. BEWARE This is actually the recipical - ie multiply box.w/h by scale to get original image sizing
                 */

                scope.empty = true;
                var imgUploadPaneEl = element.find("#image-upload-pane");
                var dropZone = element.find("div.original");
                var selectionEl = element.find("div.selection");
                var imageOptionsEl = element.find("div.image-options");
                var dragging = null;

                var previewEl = element.find("canvas.preview");
                var previewImageEl = element.find("div.preview-image");
                var previewFrameEl = element.find("div.preview-frame");

                var TARGET_SIZE = {
                    width: 0,
                    height: 0
                }

                const PATTERNS = 8;

                scope.uiState = {
                    resizeMode : "SLICE",
                    lastResizeMode: "SLICE",
                    imgColor : scope.imgColor ? scope.imgColor : scope.defaultImgColor,
                    imgPattern : scope.imgPattern ? scope.imgPattern : 1,
                    isProjectImg: scope.isProjectImg,
                    isAppImg: scope.isAppImg,
                    isUseColor: !!scope.imgColor || !(scope.isProjectImg || scope.isAppImg),
                    showInitials: scope.showInitials
                }

                scope.stockColors = ["#e13d3c", "#8c2da7", "#31439c", "#1789ce", "#0f786b", "#699e3f", "#f9be40", "#f27c22", "#e44b27", "#465a64" ];

                scope.showColorPicker = false;
                scope.showResizeModes = true;

                switch (scope.objectType) {
                case "USER":
                    TARGET_SIZE.width= 166;
                    TARGET_SIZE.height = 166;
                    scope.uiState.forcedRatio = 1;
                    break;
                case "PROJECT":
                case "PUBLISHED_PROJECT":
                    TARGET_SIZE.width= 80;
                    TARGET_SIZE.height = 200;
                    scope.uiState.forcedRatio = 2.5;
                    scope.showColorPicker = true;
                    break;
                case "APP":
                    TARGET_SIZE.width= 140;
                    TARGET_SIZE.height = 120;
                    scope.uiState.forcedRatio = 0.85714286;
                    scope.showColorPicker = true;
                    break;
                case "INSIGHT":
                    TARGET_SIZE.width = 310;
                    TARGET_SIZE.height= 166;
                    scope.uiState.forcedRatio = 1 / (1.6180339887); // let's be precise !
                    break;
                default:
                    scope.uiState.resizeMode = "CROP";
                    scope.uiState.noPreview = true;
                    scope.showResizeModes = false;
                    TARGET_SIZE.none = true;
                    break;
                }

                var targetAdjustedSize; // adjusted target drawing coords for scaling / best-fit options.

                var resetTargetAdjustment = function() {
                    targetAdjustedSize = {
                        width:TARGET_SIZE.width,
                        height: TARGET_SIZE.height,
                        x: 0,
                        y: 0
                    };
                }

                var isAdjustTarget = function() {
                    var mode = scope.uiState.resizeMode
                    return (mode=="SCALE" || mode=="FILL")
                }

                resetTargetAdjustment();

                var resetBox = function(force) {
                    resetTargetAdjustment();
                    if (!scope.W) return;
                    scope.box = scope.box || {left:0, top:0, width:0, height:0 };

                    if (scope.uiState.resizeMode === "SLICE") {
                        var f = Math.min(scope.W/80, scope.H/80/scope.uiState.forcedRatio, 1);
                        scope.box.width = 80 * f;
                        scope.box.height = 80 * f * scope.uiState.forcedRatio;
                        scope.box.left = scope.box.left ? Math.min(scope.box.left, scope.W - scope.box.width) : 0;
                        scope.box.top = scope.box.top ? Math.min(scope.box.left, scope.H - scope.box.height) : 0;

                    } else if (force || scope.uiState.lastResizeMode === "SLICE") {
                        scope.box.top = 0;
                        scope.box.left = 0;
                        scope.box.width = scope.W;
                        scope.box.height = scope.H;
                    }

                    scope.uiState.lastResizeMode = scope.uiState.resizeMode;
                    scope.setSelection(scope.box);
                };

                scope.$watch("uiState.resizeMode", _ => resetBox(false));
                scope.$watch("uiState.isUseColor", function () {
                    if (scope.uiState.isUseColor) scope.clearImageForUpload();});
                scope.$watch("uiState.showInitials", _ => {
                    let initials = scope.uiState.showInitials ? scope.projectName : '';

                    scope.initials = ProjectInitials(initials);
                });

                previewEl.attr(TARGET_SIZE);
                previewImageEl.css(TARGET_SIZE);
                previewFrameEl.css({"height": TARGET_SIZE.height, "width": scope.objectType=="PROJECT" || scope.objectType=="APP" ? "auto" : TARGET_SIZE.width});

                var previewCtx = previewEl[0].getContext('2d');
                previewCtx.imageSmoothingEnabled = true;
                previewCtx.mozImageSmoothingEnabled = true;
                previewCtx.oImageSmoothingEnabled = true;
                previewCtx.webkitImageSmoothingEnabled = true;

                scope.averagePixel = {r:0, g:0, b:0};

                scope.uploadFileDialog = function() {
                    var uploadFile = $('<input type="file" id="fileUpload" accept="image/*" />');
                    uploadFile.on("change", function() {
                        if (uploadFile[0].files.length > 0) {
                            scope.setImageFile(uploadFile[0].files[0]);
                        }
                    });
                    uploadFile.click();
                };

                var saveProjectStateChanges = function () {
                    scope.$emit('projectImgEdited', scope.uiState);
                };

                scope.uploadImage = function() {
                    var canvas = document.createElement("canvas");

                    var scaleBox = isAdjustTarget() ? TARGET_SIZE : scope.box;

                    var originalW = (scaleBox.width * scale) | 0;
                    var originalH = (scaleBox.height * scale) | 0;

                    canvas.width =  originalW;
                    canvas.height = originalH;
                    var canvasCtx = canvas.getContext('2d');

                    scope.uiState.imgColor = undefined;
                    scope.uiState.showInitials = false;
                    scope.uiState.isProjectImg = true;
                    scope.uiState.isAppImg = false;

                    saveProjectStateChanges();

                    canvasCtx.drawImage(scope.image, (scope.box.left * scale) | 0, (scope.box.top * scale) | 0, (scope.box.width * scale) | 0, (scope.box.height * scale) | 0, //0, 0, originalW, originalH);
                        targetAdjustedSize.x * scale,
                        targetAdjustedSize.y * scale,
                        originalW * targetAdjustedScaleFactorForUpload("width"), //(targetAdjustedSize.width  / TARGET_SIZE.width),
                        originalH * targetAdjustedScaleFactorForUpload("height")); //(targetAdjustedSize.height / TARGET_SIZE.height));


                    var data = canvas.toDataURL("image/png");
                    SpinnerService.lockOnPromise(DataikuAPI.images.uploadImage(scope.projectKey, scope.objectType, scope.objectId, data)
                    .then(function(data) {
                        const id = JSON.parse(data).id;
                        scope.resolveModal(id);
                        if (scope.objectType == "USER") {
                            Notification.broadcastToFrontends("user-profile-picture-updated");
                        }
                        $rootScope.$broadcast("currentItemImageUpdated");
                        if (scope.forceRefreshImage) scope.forceRefreshImage();
                    }));
                };

                scope.removeImage = function() {
                    DataikuAPI.images.removeImage(scope.projectKey, scope.objectType, scope.objectId).then(function() {
                        if (scope.objectType == "USER") {
                            Notification.broadcastToFrontends("user-profile-picture-updated");
                        }
                        $rootScope.$broadcast("currentItemImageUpdated");
                        if (scope.forceRefreshImage) scope.forceRefreshImage();
                        scope.uiState.isProjectImg = false;
                        saveProjectStateChanges();
                    });
                };

                scope.onClickImage = function() {
                    if (scope.empty) {
                        scope.uploadFileDialog();
                    }
                };

                scope.onClickColor = function() {
                    scope.uiState.isUseColor = true;
                };

                scope.shufflePattern = function() {
                    scope.uiState.isUseColor = true;
                    scope.uiState.imgPattern = scope.uiState.imgPattern % PATTERNS + 1 || 1;
                };

                scope.processProjectChanges = function () {
                    var ui = scope.uiState;
                    if (ui.imgColor != scope.imgColor || ui.isProjectImg != scope.isProjectImg || ui.imgPattern != scope.imgPattern || ui.showInitials != scope.showInitials) {
                        saveProjectStateChanges();
                        scope.removeImage();
                    }
                };

                scope.clearSolidColor = function() {
                    scope.uiState.imgColor = undefined;
                };

                scope.saveColor = function() {
                    scope.processProjectChanges();
                    scope.dismiss();
                };

                scope.pickStockColor = function(color) {
                    scope.uiState.imgColor = color;
                    scope.uiState.isUseColor = true;
                };

                scope.previewBackgroundColor = function() {
                    return scope.uiState.isUseColor ? scope.uiState.imgColor : '#FFFFFF';
                };

                scope.close = function() {
                    scope.dismiss();
                };

                scope.paintImage = function() {
                    if (!scope.image) return;
                    var originalW = (scope.box.width * scale) | 0;
                    var originalH = (scope.box.height * scale) | 0;
                    previewCtx.fillStyle = "#FFFFFF";
                    previewCtx.fillRect(0,0,TARGET_SIZE.width,TARGET_SIZE.height)
                    previewCtx.drawImage(scope.image,
                        Math.max((scope.box.left * scale) | 0, 0),
                        Math.max((scope.box.top * scale) | 0, 0),
                        originalW, originalH,
                        targetAdjustedSize.x,
                        targetAdjustedSize.y,
                        targetAdjustedSize.width,
                        targetAdjustedSize.height);
                    safeApply(scope);
                };

                var scale;

                scope.setImageFile = function(file) {
                    scope.empty = false;
                    scope.uiState.isUseColor = false;
                    element.removeClass("empty")
                    dropZone.removeClass('empty');
                    var reader = new FileReader();
                    reader.onload = function(event) {
                        scope.image = new Image();
                        scope.image.src = event.target.result;
                        scope.image.onload = function() {
                            scope.originalW = scope.image.width;
                            scope.originalH = scope.image.height;
                            var maxW = dropZone.width();
                            var maxH = dropZone.height() - imageOptionsEl.height();
                            scale = Math.max(scope.originalW / maxW, scope.originalH / maxH);
                            scope.W = scope.originalW / scale;
                            scope.H = scope.originalH / scale;
                            resetBox();
                            element.find("div.original").css("flex-grow", 0).css("height", scope.H).css( "background-image", "url(" + event.target.result + ")");
                            scope.setSelection(scope.box);
                        }
                    };
                    reader.readAsDataURL(file);
                };

                scope.clearImageForUpload = function(file) {
                    resetBox(true);
                    scope.empty = true;
                    element.addClass("empty")
                    dropZone.addClass('empty');
                    scope.image = undefined;
                    element.find("div.original").css("background-image", "").css("flex-grow", 1).css("height", undefined);
                };

                scope.W = 0;
                scope.H = 0;

                var adjustTarget = function () {

                    if (isAdjustTarget()) {
                            resetTargetAdjustment();

                            var boxAspectRatio = scope.box.width / scope.box.height;
                            var targetAspectRatio = TARGET_SIZE.width / TARGET_SIZE.height;

                            var isFitToWidth =  scope.uiState.resizeMode=="FILL" ? boxAspectRatio < targetAspectRatio : boxAspectRatio > targetAspectRatio;

                            if (isFitToWidth) {
                                targetAdjustedSize.height = TARGET_SIZE.width / boxAspectRatio;
                                targetAdjustedSize.y = (TARGET_SIZE.height - targetAdjustedSize.height) / 2;
                            } else {
                                targetAdjustedSize.width = TARGET_SIZE.height * boxAspectRatio;
                                targetAdjustedSize.x = (TARGET_SIZE.width - targetAdjustedSize.width) / 2;
                            }
                    }
                };

                var targetAdjustedScaleFactorForUpload = function(dim) {
                    return  TARGET_SIZE.none ? 1 : (targetAdjustedSize[dim]  / TARGET_SIZE[dim]);
                };

                function isMostlyToTheLeft() {
                    let leftPart = Math.max(0, scope.W/2 - scope.box.left);
                    let rightPart = Math.max(0, scope.box.left + scope.box.width - scope.W/2);
                    return leftPart > rightPart;
                };

                function isMostlyToTheTop() {
                    let topPart = Math.max(0, scope.H/2 - scope.box.top);
                    let bottomtPart = Math.max(0, scope.box.top + scope.box.height - scope.H/2);
                    return topPart > bottomtPart;
                };

                function getStaticCorner(cornerType) {
                    let getAmbiguousHorizontal = function() {
                        let h = 'l';
                        let isFullWidth = scope.box.left==0 && scope.box.width == scope.W;
                        if (isFullWidth) {
                            if (dragging && dragging.originalStaticCorner) {
                                h = dragging.originalStaticCorner[1];
                            }
                        } else {
                            h = isMostlyToTheLeft() ? 'l':'r'
                        }
                        return h;
                    };

                    let getAmbiguousVertical = function() {
                        let v = 't';
                        let isFullHeight = scope.box.top == 0 && scope.box.height == scope.H;
                        if (isFullHeight) {
                            if (dragging && dragging.originalStaticCorner) {
                                v = dragging.originalStaticCorner[0];
                            }
                        } else {
                            v = isMostlyToTheTop() ? 't':'b'
                        }
                        return v;
                    };

                    switch(cornerType) {
                        case 'tt':
                            return 'b' + getAmbiguousHorizontal();
                            break;
                        case 'tr':
                            return 'bl';
                            break;
                        case 'rr':
                            return getAmbiguousVertical() + 'l';
                            break;
                        case 'br':
                            return 'tl';
                            break;
                        case 'bb':
                            return 't' + getAmbiguousHorizontal();
                            break;
                        case 'bl':
                            return 'tr';
                            break;
                        case 'll':
                            return getAmbiguousVertical() + 'r';
                            break;
                        case 'tl':
                            return 'br';
                            break;
                        default:
                            break;
                    }
                };

                scope.setSelection = function(box, dragging) {
                    if (dragging && dragging.type=="move") {
                        $.extend(scope.box, box);
                        scope.box.left = Math.min(scope.W - scope.box.width, scope.box.left);
                        scope.box.left = Math.max(0, scope.box.left);

                        scope.box.top = Math.min(scope.H - scope.box.height, scope.box.top);
                        scope.box.top = Math.max(0, scope.box.top);
                    } else if (scope.uiState.resizeMode!=="SLICE") {
                        $.extend(scope.box, box);
                        let maxHeight = scope.H - scope.box.top;
                        let maxWidth = scope.W - scope.box.left;

                        scope.box.width = Math.min(maxWidth, scope.box.width);
                        scope.box.width = Math.max(16, scope.box.width);

                        scope.box.height = Math.min(maxHeight, scope.box.height);
                        scope.box.height = Math.max(16, scope.box.height);

                        if (scope.box.top < 0) {
                            scope.box.height += scope.box.top;
                            scope.box.top = 0;
                        }
                        if (scope.box.left < 0) {
                            scope.box.width += scope.box.left;
                            scope.box.left = 0;
                        }

                        scope.box.width = scope.box.width | 0;
                        scope.box.height = scope.box.height | 0;
                        scope.box.left = scope.box.left | 0;
                        scope.box.top = scope.box.top | 0;
                    } else {
                        let isValidPosition = function(box, newPosition) {
                            return newPosition.top >= 0 && (Math.floor(newPosition.top + box.height) < (scope.H + 1)) && newPosition.left >= 0 && (Math.floor(newPosition.left + box.width) < (scope.W + 1));
                        };
                        let computeNewPosition = function(box, staticCorner) {
                            let newPosition = {top: scope.box.top, left: scope.box.left};
                            if (staticCorner[0] == 'b') {
                                newPosition.top += scope.box.height - box.height;
                            }
                            if (staticCorner[1] == 'r') {
                                newPosition.left += scope.box.width - box.width;
                            }
                            return newPosition;
                        };
                        let computeMaxDimensions = function(staticCorner) {
                            let maxHeightNoRatio = staticCorner[0] == 't' ? scope.H - scope.box.top : scope.box.top + scope.box.height;
                            let maxWidthNoRatio = staticCorner[1] == 'l' ? scope.W - scope.box.left : scope.box.left + scope.box.width;
                            let maxHeight = scope.uiState.forcedRatio * maxWidthNoRatio;
                            let maxWidth = maxWidthNoRatio;
                            if (maxHeight > maxHeightNoRatio) {
                                maxHeight = maxHeightNoRatio;
                                maxWidth = maxHeightNoRatio / scope.uiState.forcedRatio;
                            }
                            return {maxHeight: maxHeight, maxWidth: maxWidth};
                        };
                        let adjustDimensions = function(cornerType, staticCorner) {
                            let maxDimensions = computeMaxDimensions(staticCorner);
                            box.width = Math.max(16, box.width);
                            box.height = Math.max(16, box.height);
                            if (box.height != box.width * scope.uiState.forcedRatio) {
                                if (['bb', 'tt'].includes(cornerType)) {
                                    box.width = Math.min(maxDimensions.maxWidth, box.height / scope.uiState.forcedRatio);
                                    box.height = box.width * scope.uiState.forcedRatio;
                                } else {
                                    box.height = Math.min(maxDimensions.maxHeight, box.width * scope.uiState.forcedRatio);
                                    box.width = box.height / scope.uiState.forcedRatio;
                                }
                            }
                        };

                        if (dragging) {
                            let staticCorner = getStaticCorner(dragging.cornerType);
                            adjustDimensions(dragging.cornerType, staticCorner);
                            let newPosition = computeNewPosition(box, staticCorner);
                            if (isValidPosition(box, newPosition)) {
                                scope.box.height = box.height;
                                scope.box.width = box.width;
                                scope.box.top = newPosition.top;
                                scope.box.left = newPosition.left;
                            }
                        }
                    }

                    adjustTarget()
                    scope.paintImage();
                    selectionEl.css(scope.box);
                };

                scope.startResizing = function(evt, cornerType) {
                    let originalStaticCorner = getStaticCorner(cornerType);
                    dragging = {
                        type: "resize",
                        cornerType: cornerType,
                        leftOrigin: scope.box.left + (cornerType[1] == "l" ?  -evt.pageX : 0),
                        topOrigin: scope.box.top + (cornerType[0] == "t" ?  -evt.pageY : 0),
                        widthOrigin: selectionEl.width() + (cornerType[1] == "l" ?  1 : -1) * evt.pageX,
                        heightOrigin: selectionEl.height() + (cornerType[0] == "t" ?  1 : -1) * evt.pageY,
                        originalStaticCorner: originalStaticCorner
                    }
                    $('body').on("mousemove", resize);
                    $('body').on("mouseup", function() {
                        $('body').off("mousemove", resize);
                        dragging = null;
                    });
                    evt.stopPropagation();
                    return false;
                }

                function resize(evt) {
                    var box = {};

                    if (dragging.cornerType[0]=="t") {
                        box.top = dragging.topOrigin + evt.pageY;
                        box.height = dragging.heightOrigin - evt.pageY;
                    } else if (dragging.cornerType[0]=="b") {
                        box.height = dragging.heightOrigin + evt.pageY;
                    } else {
                        box.height = scope.box.height;
                    }

                    if (dragging.cornerType[1]=="l") {
                        box.left = dragging.leftOrigin + evt.pageX;
                        box.width = dragging.widthOrigin - evt.pageX;
                    } else if (dragging.cornerType[1]=="r") {
                        box.width = dragging.widthOrigin + evt.pageX;
                    } else {
                        box.width = scope.box.width;
                    }

                    scope.setSelection(box, dragging);
                };

                scope.startMoving = function(evt) {
                    dragging = {
                        type: "move",
                        originLeft: scope.box.left - evt.pageX,
                        originTop: scope.box.top - evt.pageY
                    };
                    $('body').on("mousemove", move);
                    $('body').on("mouseup", function() {
                        $('body').off("mousemove", move);
                        dragging = null;
                    });
                    evt.stopPropagation();
                    return false;
                }

                function move(evt) {
                    scope.setSelection({
                        left: evt.pageX + dragging.originLeft,
                        top: evt.pageY + dragging.originTop
                    }, dragging);
                }

                // selectionEl
                dropZone.parent().on("dragenter", function(e) {
                    dropZone.addClass('hover');
                    e.preventDefault();
                    e.stopPropagation();
                    dropZone.addClass('hover');
                    return false;
                });
                dropZone.parent().on("dragover", function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    return false;
                });
                dropZone.parent().on("dragleave", function(e) {
                    dropZone.removeClass('hover');
                    return false;
                });
                dropZone.parent().on("drop", function(e) {
                    e.preventDefault();
                    var file = e.originalEvent.dataTransfer.files[0];
                    scope.setImageFile(file);
                    return false;
                });
            }
        }

    });

})();

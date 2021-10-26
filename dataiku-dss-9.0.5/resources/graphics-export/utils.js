/**
 * Helper functions for export-dashboards.js and export-flow.js
 */

'use strict';

// Error codes
const ERR_GENERIC = 1;
const ERR_CREATE_BROWSER = 2;
const ERR_CREATE_BROWSER_SANDBOX = 3;
const ERR_PAGE_LOAD = 4;
const ERR_INVALID_TILE_SCALE_VALUE = 5;

// Wait at most 5 minutes for pages to be load (= 500*600) and we log a message every 5 sec (= 10*500)
const LOOP_DELAY = 500;
const MAX_LOOPS = 600;
const TIMEOUT_REACHED_AFTER = MAX_LOOPS * LOOP_DELAY / 60000;
const ELEMENT_CONTENT_TIMEOUT = 15000;
const LOG_INCREMENT = 10;

const puppeteer = require('puppeteer');
const fs = require('fs');
const log = require('./log');

function timeout(ms) {
    return new Promise(function(resolve) {
        setTimeout(resolve, ms);
    });
}

function exit(errorCode, message, err = undefined) {
    let exitMessage = message;
    if (err !== undefined) {
        log.info(err); // Print the stack trace
        exitMessage += ": " + err.message;
    }
    log.error(exitMessage); //NOSONAR
    process.exit(errorCode);
}


/**
 * Creates and returns a browser window using options if provided
 * The full list of available options is available here: https://github.com/puppeteer/puppeteer/blob/master/docs/api.md#puppeteerlaunchoptions
 *
 * @return {Promise.<Browser>}
 */
function createBrowser(enforceSandboxing, options) {
    log.info("Starting browser");
    if (!options) {
        options = {};
    }
    options.ignoreHTTPSErrors = true;
    return puppeteer.launch(options).catch(function(e) {
        if (!enforceSandboxing) {
            // Cannot launch browser in sandboxed mode, try non-sandboxed since sandboxing is not mandatory.
            options.args = ['--no-sandbox'];
            return puppeteer.launch(options).catch(function(e2) {
                exit(ERR_CREATE_BROWSER, "Unable to launch Web browser", e2);
            });
        } else {
            const sandboxIssue = (e.message && e.message.includes("No usable sandbox"));
            exit(sandboxIssue ? ERR_CREATE_BROWSER_SANDBOX : ERR_CREATE_BROWSER, "Unable to launch Web browser", e);
        }
    }).then(function(browser) {
        log.info("Browser successfully started");
        return browser;
    });
}

/**
 * Create a new browser page
 *
 * @return {Promise.<Page>}
 */
function newBrowserPage(browser, pageWidth, pageHeight, magicHeadlessAuth, deviceScaleFactor) {
    return browser.newPage().then(function(page) {
        if (!deviceScaleFactor) {
            deviceScaleFactor = 1;
        }
        return Promise.all([
            page.setCacheEnabled(false),
            page.setViewport({ width: pageWidth, height: pageHeight, deviceScaleFactor: deviceScaleFactor }),
            // All requests will be sent with extra http headers:
            //   - X-DKU-APIKey set to magicHeadlessAuth value.
            page.setExtraHTTPHeaders({ 'X-DKU-APIKey': magicHeadlessAuth }),
            // Emulate media change CSS media type to screen so we have pages displayed like we see on our screen.
            page.emulateMediaType ? page.emulateMediaType('screen') : page.emulateMedia('screen')
        ]).then(function() {
            return Promise.resolve(page);
        });
    }).catch(function(err) {
        exit(ERR_PAGE_LOAD, "New browser page failed", err);
    });
}

/**
 * Go to the supplied url and check that it's a page generated by DSS.
 *
 * @return {Promise<Void>}
 */
function navigateTo(page, dssUrl) {
    // All requests are sent with extra cookies.
    //   - dku_unattended to avoid displaying license warnings or NPS survey
    return page.setCookie(
        { 'name': 'dku_unattended', 'value': 'true', 'url': dssUrl }
    ).then(function(){
        return page.goto(dssUrl).then(function() {
            return page.evaluateHandle(function() {
                return document.body;
            }).then(function(bodyHandle) {
                return page.evaluate(function(body) {
                    return body.getAttribute("ng-controller") === "DataikuController" || body.getAttribute("ng-app") === "dataiku"
                }, bodyHandle).then(function(isDataikuPage) {
                    if (!isDataikuPage) {
                        exit(ERR_PAGE_LOAD, "Invalid Web page received. Check that DSS server can access the following URL and that it denotes a DSS page: " + dssUrl);
                    }
                });
            });
        });
    }).catch(function(err) {
        exit(ERR_PAGE_LOAD, "Unable to load DSS page. Check that DSS server can access the following URL: " + dssUrl + " (" + err.message + ")");
    });
}

/**
 * Logs a message saying we are waiting for a page to load.
 * If we are waiting for 30 sec or 290 sec, also dump the HTML of the page for investigation.
 *
 * @param page Browser page
 * @param attempt Current attempt (1 attempt = 500 ms)
 * @return {Promise.<Void>}
 */
function logWaitMessage(page, attempt) {
    if (attempt % LOG_INCREMENT === 0) {
        log.info("Waiting for page to load. Remaining before time out: " + (((MAX_LOOPS - attempt) * LOOP_DELAY) / 1000) + " seconds.");
        if (attempt === (3 * LOG_INCREMENT) || attempt === (MAX_LOOPS - LOG_INCREMENT)) {
            return dumpPageHtml(page, attempt);
        }
    }
    return Promise.resolve();
}

/**
 * Dumps the HTML of the page in the logs
 *
 * @param page Browser page
 * @param attempt Current attempt (1 attempt = 500 ms)
 * @return {Promise.<Void>}
 */
function dumpPageHtml(page, attempt) {
    log.info("Can't find toolbox or page not loaded, dumping HTML source page. Current attempt: " + attempt);
    return page.evaluateHandle(function() {
        return document.body.outerHTML;
    }).then(function(outerHtmlHandle) {
        return outerHtmlHandle.jsonValue().then(function(jsonValue) {
            log.info("====== WEB PAGE SOURCE ========");
            log.info(jsonValue);
            log.info("===============================");
            return outerHtmlHandle.dispose();
        });
    });
}

/**
 * Captures the current viewport into a single PDF/PNG/JPEG file.
 *
 * @return {Promise.<Void>}
 */
function captureScreen(page, fileType, getToolboxFunction, outputDirectory, filename, waitTimeAfterReady = 100) {
    switch (fileType) {
        case "JPEG":
        case "PNG":
            return captureScreenAsImage(page, fileType, getToolboxFunction, outputDirectory, filename, waitTimeAfterReady);
        case "PDF":
            return captureScreenAsPdf(page, getToolboxFunction, outputDirectory, filename, waitTimeAfterReady);
        default:
            throw "Unhandled fileType: " + fileType
    }
}

/**
 * Create a single PDF file.
 *
 * @return {Promise.<Void>}
 */
function captureScreenAsPdf(page, getToolboxFunction, outputDirectory, filename, waitTimeAfterReady = 100) {
    return waitForPageToLoad(page, getToolboxFunction, waitTimeAfterReady).then(function() {
        const viewport = page.viewport();
        return page.pdf({
            path: outputDirectory + '/' + filename + '.pdf',
            printBackground: true,
            width: viewport.width,
            height: viewport.height,
            scale: 1
        });
    });
}

/**
 * Create a single image file, either PNG or JPEG.
 *
 * @return {Promise.<Void>}
 */
function captureScreenAsImage(page, fileType, getToolboxFunction, outputDirectory, filename, waitTimeAfterReady = 100) {
    return waitForPageToLoad(page, getToolboxFunction, waitTimeAfterReady).then(function() {
        return page.screenshot({
            path: outputDirectory + '/' + filename + '.' + fileType.toLowerCase(),
            type: fileType.toLowerCase()
        });
    });
}

/**
 * Checks if isLoading property which correspond to false if any promise in the array of loading insights loading promises are loaded or with an error.
 */
function checkLoading(page, getToolboxFunction) {
    return getToolboxFunction(page).then(function(toolbox) {
        return page.evaluate(function(toolbox) {
            return toolbox.checkLoading();
        }, toolbox);
    }).catch(function() {
        console.log("Toolbox not available");
        return true; // If we can't find the toolbox, it means we are loading.
    });
}

/**
 * Wait for the supplied page to load
 *
 * @param page Browser page
 * @param waitTimeAfterLoading Additional time (in ms) to wait once the page has been loaded.
 * @param attempt Current attempt (1 attempt = 500 ms)
 * @return {Promise.<Void>}
 */
function waitForPageToLoad(page, getToolboxFunction, waitTimeAfterLoading = 0, attempt = 0) {
    if (attempt > MAX_LOOPS) {
        exit(ERR_PAGE_LOAD, "Page not loaded after " + TIMEOUT_REACHED_AFTER + " minutes. Giving up.");
    }
    return checkLoading(page, getToolboxFunction).then(function(loading) {
        if (loading) {
            return logWaitMessage(page, attempt).then(function() {
                return timeout(LOOP_DELAY).then(function() {
                    // Recurse
                    return waitForPageToLoad(page, getToolboxFunction, waitTimeAfterLoading, attempt + 1);
                });
            });
        } else {
            log.info("Page Loaded. Wait for " + waitTimeAfterLoading + " ms before saying OK");
            return timeout(waitTimeAfterLoading);
        }
    });
}

/**
 * Wait until the element content has been properly loaded,
 * meaning until the variable puppeteerHook_elementContentLoaded is set to true in the front-end
 *
 * @return {Promise.<Void>}
 */
function waitForElementContentToLoad(page, cssSelector, loadedStateField) {
    if (loadedStateField === null || loadedStateField === undefined) {
        loadedStateField = "puppeteerHook_elementContentLoaded";
    }
    log.info("Waiting for content of element " + cssSelector + " to load using " + loadedStateField + " field.");
    return page.waitForFunction(function(cssSelector, loadedStateField) {
        const e = angular.element(document.querySelector(cssSelector));
        const correctScope = (e.isolateScope() === undefined) ? e.scope() : e.isolateScope();
        return !!correctScope[loadedStateField];
    }, { timeout: ELEMENT_CONTENT_TIMEOUT }, cssSelector, loadedStateField);
}

function resetElementContentToLoad(page, cssSelector, loadedStateField) {
    if (loadedStateField === null || loadedStateField === undefined) {
        loadedStateField = "puppeteerHook_elementContentLoaded";
    }
    log.info("Resetting content of element " + cssSelector + " using " + loadedStateField + " field.");
    return page.evaluate(function(cssSelector, loadedStateField) {
        const e = angular.element(document.querySelector(cssSelector));
        const correctScope = (e.isolateScope() === undefined) ? e.scope() : e.isolateScope();
        correctScope[loadedStateField] = false;
    }, cssSelector, loadedStateField);
}

// Export constants & functions
exports.ERR_GENERIC = ERR_GENERIC;
exports.ERR_CREATE_BROWSER = ERR_CREATE_BROWSER;
exports.ERR_CREATE_BROWSER_SANDBOX = ERR_CREATE_BROWSER_SANDBOX;
exports.ERR_PAGE_LOAD = ERR_PAGE_LOAD;
exports.ERR_INVALID_TILE_SCALE_VALUE = ERR_INVALID_TILE_SCALE_VALUE;
exports.ELEMENT_CONTENT_TIMEOUT = ELEMENT_CONTENT_TIMEOUT;

exports.timeout = timeout;
exports.exit = exit;
exports.createBrowser = createBrowser;
exports.newBrowserPage = newBrowserPage;
exports.navigateTo = navigateTo;
exports.captureScreen = captureScreen;
exports.captureScreenAsPdf = captureScreenAsPdf;
exports.captureScreenAsImage = captureScreenAsImage;
exports.logWaitMessage = logWaitMessage;
exports.dumpPageHtml = dumpPageHtml;
exports.waitForPageToLoad = waitForPageToLoad;
exports.waitForElementContentToLoad = waitForElementContentToLoad;
exports.resetElementContentToLoad = resetElementContentToLoad;
exports.checkLoading = checkLoading;

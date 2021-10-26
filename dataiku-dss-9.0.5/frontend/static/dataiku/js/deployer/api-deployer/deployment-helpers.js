(function() {
'use strict';

const app = angular.module('dataiku.apideployer');

app.service("APIDeployerDeploymentUtils", function() {
    var svc = {};

    svc.getParticipatingVersions = function(deploymentBasicInfo) {
        const dbi = deploymentBasicInfo;

        if (!dbi.generationsMapping) {
            return []; //TODO @mad make sure it does not happen in Java: initialise it to full last version or full specific version
        } else if (dbi.generationsMapping.mode == "SINGLE_GENERATION") {
            return [dbi.generationsMapping.generation];
        } else {
            return dbi.generationsMapping.entries.map(e => e.generation);
        }
    };

    svc.computeEndpointURLs = function(lightStatus, heavyStatus, endpoint) {
        function addEndpointSpecificSuffix(epURL) {
            switch (endpoint.type) {
                case "STD_PREDICTION":
                case "CUSTOM_PREDICTION":
                case "CUSTOM_R_PREDICTION":
                    return epURL + "/predict";
                case "PY_FUNCTION":
                case "R_FUNCTION":
                    return epURL + "/run";
                case "DATASETS_LOOKUP":
                    return epURL + "/lookup";
                case "SQL_QUERY":
                    return epURL + "/query";
            }
        }

        function removeURLTrailingSlashes(epURL) {
            let ret = epURL;
            while (ret.length > 0 && ret[ret.length - 1] == '/') {
                ret = ret.slice(0, ret.length - 1);
            }
            return ret;
        }

        const deplBI = lightStatus.deploymentBasicInfo;
        const infraBI = lightStatus.infraBasicInfo;
        const serviceId = deplBI.deployedServiceId || deplBI.publishedServiceId;
        const endpointId = endpoint.id;

        if (infraBI.type == "STATIC") {
            return infraBI.apiNodeUrls
                .map(removeURLTrailingSlashes)
                .map(apiNode => `${apiNode}/public/api/v1/${serviceId}/${endpointId}`)
                .map(addEndpointSpecificSuffix);
        } else {
            if (heavyStatus.publicURL) {
                const suffix = removeURLTrailingSlashes(heavyStatus.publicURL) + "/public/api/v1/" + serviceId + "/"  + endpointId;
                return [addEndpointSpecificSuffix(suffix)];
            } else {
                return [];
            }
        }
    };

    svc.buildZeroDatapoints = function(timeRange) {
        const now = Math.round(new Date().getTime() / 1000);
        let delta;
        switch (timeRange) {
            case "ONE_DAY":
                delta = 24 * 3600;
                break;
            case "ONE_HOUR":
                delta = 1 * 3600;
                break;
            case "SIX_HOURS":
            default:
                delta = 6 * 3600;
                break;
        }
        const ret = [];
        for (let i = 71; i >= 0; i--) {
            ret.push([null, Math.round(now-delta*i/71)]);
        }
        return ret;
    };

    return svc;
})

app.service('APIDeployerDeploymentService', function($rootScope, CreateModalFromTemplate) {
    this.startCreateDeployment = function(preselectedService, preselectedVersion) {
        return CreateModalFromTemplate("/templates/api-deployer/new-deployment-modal.html", $rootScope, null, function(modalScope) {
            modalScope.newDepl.publishedServiceId = preselectedService;
            modalScope.newDepl.versionId = preselectedVersion;
            modalScope.disabledServiceAndVersionInputs = !!(preselectedService && preselectedVersion);
        });
    };
});

app.service('StaticDeploymentSyncHelper', function(DataikuAPI, FutureProgressModal, CreateModalFromTemplate, ActivityIndicator) {
    function init(parentScope, lightStatus, askMode, refreshMode) {
        const $scope = parentScope.$new(); //TODO @apiDeployer gruik

        $scope.uiState = {
            refreshMode: "LIGHT"
        };

        $scope.runStep = function() {
            switch ($scope.uiState.nextStep) {
                case "ASK_MODE":
                    CreateModalFromTemplate("/templates/api-deployer/deploy-result-modal.html", $scope, null, function(modalScope) {
                        modalScope.close = modalScope.dismiss;
                    });
                    break;

                case "PREPARE":  {
                    DataikuAPI.apideployer.deployments.prepareSyncStatic(lightStatus.deploymentBasicInfo.id).success(function(data) {
                        FutureProgressModal.show($scope, data, "Deploying").then(function(result) {
                            if (result && result.nbNOKNodes == 0) {
                                $scope.uiState.nextStep = "DEPLOY";
                                $scope.runStep();
                            } else if (result && result.nbNOKNodes > 0) {
                                $scope.prepareResult = result;
                                $scope.uiState.nextStep = "PREPARE_FAILED";
                                $scope.runStep();
                            }
                        });
                    }).error(setErrorInScope.bind(parentScope));
                    break;
                }
                case "PREPARE_FAILED": {
                    CreateModalFromTemplate("/templates/api-deployer/deploy-result-modal.html", $scope, null, function(modalScope) {
                        modalScope.retryPrepare = function() {
                            modalScope.dismiss();
                            $scope.uiState.nextStep = "PREPARE";
                            $scope.runStep();
                        }
                        modalScope.close = function() {
                            modalScope.dismiss();
                            parentScope.refreshLightAndHeavy();
                            $scope.$destroy();
                        }
                        modalScope.deploy = function() {
                            modalScope.dismiss();
                            $scope.uiState.nextStep = "DEPLOY";
                            $scope.runStep();
                        }
                    });
                    break;
                }
                case "DEPLOY": {
                    DataikuAPI.apideployer.deployments.executeSyncStatic(lightStatus.deploymentBasicInfo.id, $scope.uiState.refreshMode == "FULL").success(function(data) {
                        FutureProgressModal.show($scope, data, "Deploying").then(function(result) {
                            if (result && result.nbNOKNodes == 0) {
                                // Done !
                                ActivityIndicator.success("Deployment updated successfully");
                                parentScope.refreshLightAndHeavy();
                                lightStatus.neverEverDeployed = false;
                                $scope.$destroy();
                            } else if (result && result.nbNOKNodes > 0) {
                                $scope.deployResult = result;
                                $scope.uiState.nextStep = "DEPLOY_FAILED";
                                $scope.runStep();
                            }
                        });
                    }).error(setErrorInScope.bind(parentScope));
                    break;
                }
                case "DEPLOY_FAILED": {
                    CreateModalFromTemplate("/templates/api-deployer/deploy-result-modal.html", $scope, null, function(modalScope) {
                        modalScope.retryDeploy = function() {
                            modalScope.dismiss();
                            $scope.uiState.nextStep = "DEPLOY";
                            $scope.runStep();
                        }
                        modalScope.close = function() {
                            modalScope.dismiss();
                            parentScope.refreshLightAndHeavy();
                            $scope.$destroy();
                        }
                    });
                    break;
                }
            }
        };
        if (askMode) {
            $scope.uiState.nextStep = "ASK_MODE";
        } else {
            $scope.uiState.refreshMode = refreshMode;
            $scope.uiState.nextStep = "PREPARE";
        }

        $scope.runStep();
    }
    return {
        init : init
    };
});

app.service("DeploymentStatusEndpointSampleCodeGenerator", function(Assert){
    var svc = {};

    svc.getFirstBaseURI = function(lightStatus, heavyStatus) {
        const infraBI = lightStatus.infraBasicInfo;
        if (infraBI.type == "STATIC") {
            return infraBI.apiNodeUrls[0];
        } else {
            return heavyStatus.publicURL;
        }
    };

    svc.getJSONExplanationsParams = function(endpoint) {
        const tq = (endpoint.testQueries || []).find(tq => tq.q && tq.q.explanations);
        return tq ? tq.q.explanations : undefined;
    }

    svc.getJSONData = function(endpoint) {
        let jsonData = null;
        switch (endpoint.type) {
        case "STD_PREDICTION":
        case "CUSTOM_PREDICTION":
        case "CUSTOM_R_PREDICTION": {
            if (endpoint.testQueries && endpoint.testQueries.length) {
                const tq = endpoint.testQueries[0];
                if (tq.q && "features" in tq.q) {
                    jsonData = tq.q.features;
                }
            }
            if (!jsonData) {
                jsonData = {
                    categorical_feature1 : "value1",
                    numerical_feature1: 42,
                    categorical_feature2: "value2"
                }
            }
            break;
        }
        case "PY_FUNCTION":
        case "R_FUNCTION":
        case "SQL_QUERY":
            if (endpoint.testQueries && endpoint.testQueries.length) {
                const tq = endpoint.testQueries[0];
                if (tq.q) {
                    jsonData = tq.q;
                }
            }
            if (!jsonData) {
                jsonData = {
                    param1 : "value1",
                    param2: 42
                };
            }
            break;
        case "DATASETS_LOOKUP":
            if (endpoint.testQueries && endpoint.testQueries.length) {
                const tq = endpoint.testQueries[0];
                if (tq.q && "data" in tq.q) {
                    jsonData = tq.q.data;
                }
            }
            if (!jsonData) {
                jsonData = {
                    string_key1 : "keyvalue1",
                    numerical_key2: 42
                };
            }
            break;
        }
        return jsonData;
    };
    svc.getAPIKeyToUse = function(ls) {
        if (!ls.publicAccess && ls.apiKeys.length) {
            return ls.apiKeys[0].key;
        } else {
            return null;
        }
    };

    svc.R_HANDLE_ERROR = '# Handle error if any\n\
if (response$status_code != 200) { \n\
    error_head <- paste0("Query failed (HTTP code ", response$status_code, "): "); \n\
    resp_content_type <- headers(response)$`content-type` \n\
    resp_content <- content(response) \n\
    if (resp_content_type == "application/json") { \n\
        error <- paste0(error_head, resp_content$message); \n\
    } else { \n\
        error <- paste0(error_head, resp_content); \n\
    }\n\
    stop(error); \n\
};\n\n';

    svc.JAVA_HEADER = 'import java.io.IOException;\n\
import java.nio.charset.StandardCharsets;\n\
\n\
import org.apache.commons.io.IOUtils;\n\
import org.apache.http.HttpResponse;\n\
import org.apache.http.client.methods.HttpPost;\n\
import org.apache.http.entity.StringEntity;\n\
import org.apache.http.impl.client.CloseableHttpClient;\n\
import org.apache.http.impl.client.HttpClients;\n\
import org.json.JSONObject;\n\
import org.json.JSONTokener;\n\
\n\
public class DataikuTest {\n\
    public static void main(String[] args) throws Exception{\n\
        try (CloseableHttpClient httpClient = HttpClients.createDefault()) { \n\
\n';

    svc.JAVA_HANDLE_ERROR = '\
            if (resp.getStatusLine().getStatusCode() != 200) {\n\
                if (resp.getEntity().getContentType().getValue().contains("application/json")){\n\
                    JSONObject error = new JSONObject(new JSONTokener(resp.getEntity().getContent()));\n\
            \n\
                    if (error.has("detailedMessage")) {\n\
                        throw new IOException("API query failed with HTTP code " + resp.getStatusLine().getStatusCode() +" and message: " + error.getString("detailedMessage"));\n\
                    } else {\n\
                        throw new IOException("API query failed with HTTP code " + resp.getStatusLine().getStatusCode() +" and body: " + error.toString());\n\
                    }\n\
                } else {\n\
                    String s = IOUtils.toString(resp.getEntity().getContent(), StandardCharsets.UTF_8);\n\
                    throw new IOException("API query failed with HTTP code " + resp.getStatusLine().getStatusCode() +" and body: " + s);\n\
                }\n\
            }\n\
\n';

    svc.JAVA_SET_BODY_AND_RUN = '\
            StringEntity bodyEntity = new StringEntity(body.toString());\n\
            request.setEntity(bodyEntity);\n\
            request.addHeader("content-type", "application/json");\n\
    \n\
            /* Execute the query */\n\
            HttpResponse resp = httpClient.execute(request);\n\
\n';

    svc.JAVA_FOOTER = '\
        }\n\
    }\n\
}';
    function jsonToRList(jsonData) {
        let res = "list(\n";
        let i = 0;
        for (let key of Object.keys(jsonData)) {
            if (i > 0) res +=",\n";
            i++;
            let value;
            if (typeof jsonData[key] === "boolean") {
                value = jsonData[key] ? "TRUE" : "FALSE";
            } else {
                value = JSON.stringify(jsonData[key]);
            }
            res +="    " + key + " = " + value;

        }
        res += ")\n\n";
        return res
    }

    svc.generateSampleCode = function(ls, serviceURLs, endpoint, language, hs) {
        Assert.trueish(serviceURLs.length > 0);
        if (language == "CURL") {
            const jsonData = svc.getJSONData(endpoint);
            let prettyJSON = JSON.stringify(jsonData, undefined, 4);
            let jsonAsCURLLines = prettyJSON.split("\n");
            if (jsonAsCURLLines.length > 2) {
                jsonAsCURLLines = jsonAsCURLLines.slice(1, jsonAsCURLLines.length - 1);
            }

            let code = "";
            code = "curl -X POST";
            if (!ls.publicAccess && ls.apiKeys.length) {
                code += " --user " + ls.apiKeys[0].key + ":"
            }
            code += " \\\n";
            code += "  " + serviceURLs[0] + " \\\n";

            switch (endpoint.type) {
            case "STD_PREDICTION":
            case "CUSTOM_PREDICTION":
            case "CUSTOM_R_PREDICTION": {
                code += "  --data '{ \"features\" : {\n";
                jsonAsCURLLines.forEach(line => code += line + "\n");
                code += "  }";
                const explanationsParamsJSON = svc.getJSONExplanationsParams(endpoint);
                if (explanationsParamsJSON) {
                    code += ', "explanations": ' + JSON.stringify(explanationsParamsJSON, undefined, 4);
                }
                code += "}'";
                return {
                    mode: "shell",
                    code:code
                };
            }
            case "PY_FUNCTION":
            case "R_FUNCTION":
            case "SQL_QUERY":
                code += "  --data '{\n";
                jsonAsCURLLines.forEach(line => code += line + "\n");
                code += "  }'";
                return {
                    mode: "shell",
                    code:code
                };
            case "DATASETS_LOOKUP":
                code += "  --data '{ \"data\" : {\n";
                jsonAsCURLLines.forEach(line => code += line + "\n");
                code += "  }}'";
                return {
                    mode: "shell",
                    code:code
                };
            }
        } else if (language == "PYTHON") {
            const jsonData = svc.getJSONData(endpoint);
            const baseURI = svc.getFirstBaseURI(ls, hs);
            const apiKeyToUse = svc.getAPIKeyToUse(ls);
            const ret = {
                mode: "python"
            };
            let code = "";
            code += "import dataikuapi\n\n";
            code += "client = dataikuapi.APINodeClient(\"" + baseURI + "\", \""
                + (ls.deploymentBasicInfo.deployedServiceId || ls.deploymentBasicInfo.publishedServiceId) + "\"";
            if (apiKeyToUse) {
                code += ", \""  +apiKeyToUse + "\"";
            }
            code += ")\n\n";

            ret.instructions = "You need to install the ``dataiku-api-client`` Python package for this to work.\n\n";
            ret.instructions += "If you are querying from within DSS, this package is already installed. Else, follow ";
            ret.instructions += "[these instructions](https://doc.dataiku.com/dss/latest/publicapi/client-python/)";
            switch (endpoint.type) {
            case "STD_PREDICTION":
            case "CUSTOM_PREDICTION":
            case "CUSTOM_R_PREDICTION": {
                code += "record_to_predict = {\n";
                let prettyJSON = JSON.stringify(jsonData, undefined, 4);
                let jsonAsCURLLines = prettyJSON.split("\n");
                if (jsonAsCURLLines.length > 2) {
                    jsonAsCURLLines = jsonAsCURLLines.slice(1, jsonAsCURLLines.length - 1);
                }
                jsonAsCURLLines.forEach(line => code += line + "\n");
                code += "}\n";

                code += `prediction = client.predict_record("${endpoint.id}", record_to_predict`;
                const explanationsParamsJSON = svc.getJSONExplanationsParams(endpoint);
                if (explanationsParamsJSON) {
                    if (explanationsParamsJSON.enabled) {
                        code += ", with_explanations=True";
                    } else if(explanationsParamsJSON.enabled === false) {
                        code += ", with_explanations=False";
                    }
                    if (explanationsParamsJSON.nExplanations) {
                        code += ", n_explanations="+explanationsParamsJSON.nExplanations;
                    }
                    if (explanationsParamsJSON.method) {
                        code += `, explanation_method="${explanationsParamsJSON.method}"`;
                    }
                    if (explanationsParamsJSON.nMonteCarloSteps) {
                        code += ", n_explanations_mc_steps="+explanationsParamsJSON.nMonteCarloSteps;
                    }
                }

                code += ")\n";

                code += "print(prediction[\"result\"])\n";
                ret.code = code;
                return ret;
            }
            case "PY_FUNCTION":
            case "R_FUNCTION": {
                code += "result = client.run_function(\"" + endpoint.id + "\"";
                for (let key of Object.keys(jsonData)) {
                    code +=",\n";
                    code +="        " + key + " = " + JSON.stringify(jsonData[key]);
                }
                code += ")\n";
                code += "print(\"Function result: %s\" % result.get(\"response\"))\n";
                ret.code = code;
                return ret;
            }
            case "DATASETS_LOOKUP": {
                code += "lookup_keys = {\n";
                let prettyJSON = JSON.stringify(jsonData, undefined, 4);
                let jsonAsCURLLines = prettyJSON.split("\n");
                if (jsonAsCURLLines.length > 2) {
                    jsonAsCURLLines = jsonAsCURLLines.slice(1, jsonAsCURLLines.length - 1);
                }
                jsonAsCURLLines.forEach(line => code += line + "\n");
                code += "}\n";

                code += "lookup_result = client.lookup_record(\"" + endpoint.id + "\", lookup_keys)\n";
                code += "print(lookup_result[\"data\"])\n";
                ret.code = code;
                return ret;
            }
            case "SQL_QUERY": {
                code += "query_parameters = {\n";
                let prettyJSON = JSON.stringify(jsonData, undefined, 4);
                let jsonAsCURLLines = prettyJSON.split("\n");
                if (jsonAsCURLLines.length > 2) {
                    jsonAsCURLLines = jsonAsCURLLines.slice(1, jsonAsCURLLines.length - 1);
                }
                jsonAsCURLLines.forEach(line => code += line + "\n");
                code += "}\n";

                code += "query_result = client.sql_query(\"" + endpoint.id + "\", query_parameters)\n";
                code += "print(query_result)\n";
                ret.code = code;
                return ret;
            }
            }
        } else if (language == "R") {
            const jsonData = svc.getJSONData(endpoint);
            const baseURI = svc.getFirstBaseURI(ls, hs);
            const apiKeyToUse = svc.getAPIKeyToUse(ls);
            const ret = {
                mode: "r"
            };
            let code = "library(httr)\nlibrary(jsonlite)\n\n";

            ret.instructions = "You need to have the ``httr`` R package installed.\n";
            ret.instructions += "If you are querying from within DSS, this package is already installed.";
            switch (endpoint.type) {
            case "STD_PREDICTION":
            case "CUSTOM_PREDICTION":
            case "CUSTOM_R_PREDICTION": {
                const explanationsParamsJSON = this.getJSONExplanationsParams(endpoint);
                if (explanationsParamsJSON) {
                    code += "explanations_params = "+ jsonToRList(explanationsParamsJSON);
                }
                code += "record_to_predict = "+ jsonToRList(jsonData);
                code += "response <- POST(\"" + serviceURLs[0] +"\",\n";
                if (apiKeyToUse) {
                    code += "                    authenticate(\""  +apiKeyToUse + "\", \"\"),\n";
                }
                if (explanationsParamsJSON) {
                    code += "                    body = toJSON(list(features=record_to_predict, explanations=explanations_params), auto_unbox=TRUE))\n\n";
                } else {
                    code += "                    body = toJSON(list(features=record_to_predict), auto_unbox=TRUE))\n\n";
                }
                
                code += svc.R_HANDLE_ERROR;

                code += "result <- content(response)\n";
                code += "print(paste0(\"Prediction: \", toJSON(result$result)))\n";
                ret.code = code;
                return ret;
            }
            case "PY_FUNCTION":
            case "R_FUNCTION":
                code += "function_params = list(\n";
                let i = 0;
                for (let key of Object.keys(jsonData)) {
                    if (i > 0) code +=",\n";
                    i++;
                    code +="    " + key + " = " + JSON.stringify(jsonData[key]);
                }
                code += ")\n\n";

                code += "response <- POST(\"" + serviceURLs[0] +"\",\n";
                if (apiKeyToUse) {
                    code += "                    authenticate(\""  +apiKeyToUse + "\", \"\"),\n";
                }
                code += "                    body = toJSON(function_params, auto_unbox=TRUE))\n\n";

                code += svc.R_HANDLE_ERROR;

                code += "result <- content(response)\n";
                code += "print(paste0(\"Function result: \", result$response))\n";
                ret.code = code;
                return ret;
            case "DATASETS_LOOKUP": {
                code += "lookup_keys = list(\n";
                let i = 0;
                for (let key of Object.keys(jsonData)) {
                    if (i > 0) code +=",\n";
                    i++;
                    code +="    " + key + " = " + JSON.stringify(jsonData[key]);
                }
                code += ")\n\n";

                code += "response <- POST(\"" + serviceURLs[0] +"\",\n";
                if (apiKeyToUse) {
                    code += "                    authenticate(\""  +apiKeyToUse + "\", \"\"),\n";
                }
                code += "                    body = toJSON(list(data=lookup_keys), auto_unbox=TRUE))\n\n";

                code += svc.R_HANDLE_ERROR;

                code += "result <- content(response)\n";
                code += "print(paste0(\"Looked up: \", toJSON(result$data)))\n";
                ret.code = code;
                return ret;
            }
            case "SQL_QUERY": {
                code += "query_params = list(\n";
                let i = 0;
                for (let key of Object.keys(jsonData)) {
                    if (i > 0) code +=",\n";
                    i++;
                    code +="    " + key + " = " + JSON.stringify(jsonData[key]);
                }
                code += ")\n\n";

                code += "response <- POST(\"" + serviceURLs[0] +"\",\n";
                if (apiKeyToUse) {
                    code += "                    authenticate(\""  +apiKeyToUse + "\", \"\"),\n";
                }
                code += "                    body = toJSON(query_params, auto_unbox=TRUE))\n\n";

                code += svc.R_HANDLE_ERROR;

                code += "result <- content(response)\n";
                code += "print(paste0(\"Query results: \", result))\n";
                ret.code = code;
                return ret;
            }
            }
        } else if (language == "JAVA") {
            const jsonData = svc.getJSONData(endpoint);
            const baseURI = svc.getFirstBaseURI(ls, hs);
            const apiKeyToUse = svc.getAPIKeyToUse(ls);
            const ret = {
                mode: "javascript" // Acceptable substitute for Java
            };
            let code = svc.JAVA_HEADER;

            code += "            HttpPost request = new HttpPost(\"" + serviceURLs[0] + "\");\n\n";

            if (apiKeyToUse) {
                code += "            /* Handle authentication */\n";
                code += "            String headerValue = \"" + apiKeyToUse + ":\";\n";
                code += '            String encodedHeaderValue = java.util.Base64.getEncoder().encodeToString(headerValue.getBytes(StandardCharsets.UTF_8));\n';
                code += '            String header =  "Basic "  + encodedHeaderValue;\n';
                code += '            request.addHeader("authentication", "header");\n';
            }

            function jsonDataToJSONObject(objName, json) {
                code += "            JSONObject " + objName + " = new JSONObject();\n";
                for (let key of Object.keys(json)) {
                    code +="            "+ objName + ".put(\"" + key + "\", " + JSON.stringify(json[key]) + ");\n";
                }
                code += "\n";
            }

            ret.instructions = "You need to have the ``httpclient`` 4.3 or higher and ``org.json`` packages installed.\n";
            code += "            /* Build the JSON POST Body */\n";

            switch (endpoint.type) {
            case "STD_PREDICTION":
            case "CUSTOM_PREDICTION":
            case "CUSTOM_R_PREDICTION": {
                jsonDataToJSONObject("recordToPredict", jsonData);
                const explanationsParamsJSON = svc.getJSONExplanationsParams(endpoint)
                if (explanationsParamsJSON) {
                    jsonDataToJSONObject("explanationsParams", explanationsParamsJSON)
                }
                code += '            JSONObject body = new JSONObject();\n';
                code += '            body.put("features", recordToPredict);\n';
                if (explanationsParamsJSON) {
                    code += '            body.put("explanations", explanationsParams);\n';
                }
                code += svc.JAVA_SET_BODY_AND_RUN;
                code += svc.JAVA_HANDLE_ERROR;
                code += '            /* Parse result */\n';
                code += '            JSONObject result = new JSONObject(new JSONTokener(resp.getEntity().getContent()));\n';
                code += '            System.out.println("Model returned:\\n" + result + "\\n");\n';
                code += svc.JAVA_FOOTER;
                ret.code = code;
                return ret;
            }
            case "PY_FUNCTION":
            case "R_FUNCTION":
                jsonDataToJSONObject("body", jsonData);
                code += svc.JAVA_SET_BODY_AND_RUN;
                code += svc.JAVA_HANDLE_ERROR;
                code += '            /* Parse result */\n';
                code += '            JSONObject result = new JSONObject(new JSONTokener(resp.getEntity().getContent()));\n';
                code += '            System.out.println("Function returned:\\n" + result + "\\n");\n';
                code += svc.JAVA_FOOTER;
                ret.code = code;
                return ret;
            case "DATASETS_LOOKUP": {
                jsonDataToJSONObject("lookupKeys", jsonData);
                code += '            JSONObject body = new JSONObject();\n';
                code += '            body.put("data", lookupKeys);\n';
                code += svc.JAVA_SET_BODY_AND_RUN;
                code += svc.JAVA_HANDLE_ERROR;
                code += '            /* Parse result */\n';
                code += '            JSONObject result = new JSONObject(new JSONTokener(resp.getEntity().getContent()));\n';
                code += '            System.out.println("Lookup returned:\\n" + result + "\\n");\n';
                code += svc.JAVA_FOOTER;
                ret.code = code;
                return ret;
            }
            case "SQL_QUERY":
                jsonDataToJSONObject("body", jsonData);
                code += svc.JAVA_SET_BODY_AND_RUN;
                code += svc.JAVA_HANDLE_ERROR;
                code += '            /* Parse result */\n';
                code += '            JSONObject result = new JSONObject(new JSONTokener(resp.getEntity().getContent()));\n';
                code += '            System.out.println("Query returned:\\n" + result + "\\n");\n';
                code += svc.JAVA_FOOTER;
                ret.code = code;
                return ret;
            }
        }
        return code;
    };
    return svc;
})

app.constant('GENERATION_MAPPING_STRATEGIES', [
    {id: 'RANDOM', name: 'Random'},
    {id: 'HASH_BASED', 'name': 'Hash based'}
]);


app.constant('GENERATION_MAPPING_MODES', [
    {id: 'SINGLE_GENERATION', name: 'Single generation'},
    {id: 'MULTI_GENERATION', 'name': 'Multiple generations'}
]);

app.filter("deploymentToGenerationList", function(APIDeployerDeploymentUtils) {
    return function(deploymentBasicInfo) {
        if (!deploymentBasicInfo) {
            return;
        }
        return APIDeployerDeploymentUtils.getParticipatingVersions(deploymentBasicInfo).join(', ');
    };
});

})();

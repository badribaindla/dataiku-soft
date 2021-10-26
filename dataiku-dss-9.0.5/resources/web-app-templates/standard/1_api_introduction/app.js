/*
 * For more information, refer to the "Javascript API" documentation:
 * https://doc.dataiku.com/dss/latest/api/js/index.html
 */

function displayMessage(messageText, messageClassname) {
    let messageContainer = document.getElementById('message');
    messageContainer.innerHTML = messageText;
    messageContainer.className = '';
    if (messageClassname && messageClassname.length > 0) {
        messageContainer.className = messageClassname;
    }
}

let datasetSelector = document.getElementById('datasets-list');
datasetSelector.onchange = function(event) {
    let datasetName = event.target.value;
    let path = '/projects/'+dataiku.defaultProjectKey+'/datasets/'+datasetName+'/schema';
    dataikuREST(path, function(schema) {
        console.warn(schema);
        if (schema.columns.length > 0) {
            let header = schema.columns.length + " columns: <br /> -- <br />";
            let columns = schema.columns.map(function(column) {return column.name + ' (' + column.type + ')'}).join('<br />');
            displayMessage(header + columns);
        } else {
            displayMessage("This dataset has no columns")
        }
    })
}

// Most of the Dataiku Rest API is not wrapped in JavaScript
// Check the documentation: https://doc.dataiku.com/dss/api/7.0/rest (replace 7.0 by the corresponding DSS version)
function dataikuREST(path, callback) {
    let url = '/public/api' + path;
    // We use fetch API (https://developer.mozilla.org/fr/docs/Web/API/Fetch_API/Using_Fetch)
    fetch(url, {
        headers: {
            'Authorization': 'Basic ' + btoa(dataiku.defaultAPIKey + ':' + '')
        }
    })
        .then(response => {
            if (response.ok) {
                response.json().then(callback);
            } else {
                response.json().then(
                    err => displayMessage(err.message, 'error-message')
                );
            }
        });
}

dataiku.listDatasets(
    function(datasets) { // success
        // iterate through the datasets list to populate the select:
        let datasetSelector = document.getElementById('datasets-list');
        datasets.forEach(function(datasetName) {
            let option = document.createElement('option');
            option.value = datasetName;
            option.innerHTML = datasetName;
            datasetSelector.append(option);
        });
        datasetSelector.focus();
        displayMessage('The datasets have been successfully retrieved. Try to pick one.');
    },
    function() { // error
        displayMessage('The datasets cannot be retrieved. Please check your API Key.', 'error-message');
    }
);

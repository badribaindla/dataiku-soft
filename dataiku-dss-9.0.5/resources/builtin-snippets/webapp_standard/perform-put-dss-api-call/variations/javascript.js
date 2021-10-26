/* First retrieve the metadata of the dataset: crm_and_web_history_enriched */
$.ajax({
    method: "GET",
    url: "/public/api/projects/" + dataiku.defaultProjectKey + "/datasets/crm_and_web_history_enriched/metadata",
    headers : {
        "Authorization" : "Basic " + btoa(dataiku.defaultAPIKey + ":" + "")
    }
}).done(function(data){
    /* Modify the received metadata */
    data.description = "New dataset description";
    /* Add a custom key-value */
    data.custom.kv["modified-by-webapp"] = 1

    /* And save */
    $.ajax({
        method: "PUT",
        url: "/public/api/projects/" + dataiku.defaultProjectKey + "/datasets/crm_and_web_history_enriched/metadata",
        data : JSON.stringify(data),
        headers : {
            "Authorization" : "Basic " + btoa(dataiku.defaultAPIKey + ":" + "")
        }
    }).done(function(){
        alert("Saved !");
    });
});
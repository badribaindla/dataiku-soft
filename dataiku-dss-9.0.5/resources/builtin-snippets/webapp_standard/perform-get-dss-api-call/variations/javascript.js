$.ajax({
    method: "GET",
    url: "/public/api/projects/" + dataiku.defaultProjectKey + "/datasets/",
    headers : {
        "Authorization" : "Basic " + btoa(dataiku.defaultAPIKey + ":" + "")
    }
}).done(function(data){
	/* You receive here a JS array of dataset objects */
    var names = data.map(function(x) { return x.name});
    /* Let's display it on the output */
    var elt = $("<pre />");
	elt.text(names)
	$("body").append(elt);
});

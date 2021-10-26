# Wrapper used to execute R recipes in Docker/Kubernetes
options(echo=F)
tryCatch({
    args <- commandArgs(TRUE);
    print (paste("Executing R script: ", args));
    
    dkuExecEnv = NULL;
    if (file.exists("remote-run-env-def.json")) {
        library("RJSONIO");
        dkuExecEnv = fromJSON(file("remote-run-env-def.json"))
    }
    
    if (!is.null(dkuExecEnv)) {
        do.call(Sys.setenv, as.list(dkuExecEnv$env)) # as gruik as Python
        # also put R_LIBS and R_LIBS_USER in the path (otherwise R will run with Livy's env)
        r_libs = strsplit(Sys.getenv("R_LIBS"), ":")[[1]]
        r_libs_user = strsplit(Sys.getenv("R_LIBS_USER"), ":")[[1]]
        libs_chunks = unique(c(r_libs, r_libs_user))
        .libPaths(c(.libPaths(), libs_chunks)) # a bit gruik
    }

	source(args[1], echo=TRUE, keep.source=T);

}, error = function(err){
	library("RJSONIO");
	print("********** R code failed **********");
	print (paste("Error evaluating R code: ", err));
	
	rErrorType = class(err)[1];
	
	jsonErr = list(message = err$message, 
				   detailedMessage = paste(rErrorType, ": ", err$message),
				   errorType = paste("R.", rErrorType));
	jsonData = toJSON(jsonErr);
	write(jsonData, file = "error.json");
	quit("no", 1 ,FALSE);
});

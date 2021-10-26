library(RJSONIO)
library(gtools)

args <- commandArgs(TRUE)
port <- as.integer(args[1])
secret <- args[2]

print("R function/prediction server starting")

# It is not possible to set timeout = 0 (it means 0)
# It is not possible to set timeout = -1 (sometimes segfaults)
#
# Set it to 1 year instead... Timeout is in seconds
oneyear <- 86400 * 365

con <- socketConnection(host="localhost", port = port, blocking=TRUE, server=FALSE, open="ab", timeout=oneyear)
setTCPNoDelay(con, value=TRUE)

print("Connected to backend")

readOneCommand <- function(conn) {
    l <- readBin(con, integer(), size=4, endian="big")
    if (length(l) == 0 || l == 0) return(NULL)
    s <- rawToChar(readBin(con, raw(), n=l, endian="big"))
    Encoding(s) <- "UTF-8"
    
    command <- fromJSON(s)
    return(command)
}

sendAsJson <- function(conn, d) {
    sendAsString(con, toJSON(d))
}

sendAsString <- function(conn, d) {
    dUtf8 <- enc2utf8(d)
    cd <- charToRaw(dUtf8)
    l <- length(cd)
    writeBin(l, size=4, con, endian="big")
    if (l > 0) {
        writeBin(cd, con, endian="big")
    }
}

resourceFolders <- NULL
dkuAPINodeGetResourceFolders <- function() {
  resourceFolders
}

do.call.ignore.unused <- function(what, data){
    whatArgs <- formalArgs(what)
    cond <- lapply(names(data), function(x) {is.element(x, whatArgs)})
    do.call(what, as.list(data[unlist(cond)]))
}

stage <- "init";

result = tryCatch({
    # connect to the backend
    sendAsString(con, secret)
    
    # get the startup command
    command <- readOneCommand(con)
    functionName <- command[["functionName"]]
    codeFilePath <- command[["codeFilePath"]]
    resourceFolders <- command[["resourceFolderPaths"]]
    passArgumentsAsList <- command[["passArgumentsAsList"]]
    print("Executing user code")
    stage <- "startup";
    source(codeFilePath)
    work <- get(functionName)
    sendAsJson(con, list(ok=TRUE))
    stage <- "ready";

    print("Ready for service")
    
    # loop until an empty command is sent
    while (TRUE) {
        req <- readOneCommand(con)
        if (is.null(req)) break;
        stage <- "predict";
        before <- proc.time();

        if (!is.null(req$usedAPIKey)) {
            Sys.setenv(DKU_CURRENT_REQUEST_USED_API_KEY=req$usedAPIKey)
        }

        if (passArgumentsAsList) {
            resp <- work(req$params)
        } else {
            resp <- do.call.ignore.unused(work, req$params)                
        }
        after <- proc.time();
        execTimeUS <- as.integer(round((after[["elapsed"]] - before[["elapsed"]]) * 1000000))
        sendAsJson(con, list(ok=TRUE, resp=resp, execTimeUS=execTimeUS))

        Sys.unsetenv("DKU_CURRENT_REQUEST_USED_API_KEY")
    }
    print("Exited main loop ?")
}, error = function(err) {
    print("R Function/Prediction Server failure")
    print(err)
    sendAsString(con, "")
    sendAsJson(con, list(errorType=stage, message=paste("Error during function usage: ", err)))
}, finally={
    flush(con)
    close(con)
})
